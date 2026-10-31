/**
 * «Enviar al cliente»: sin campos obligatorios. Crea (o reutiliza) el enlace del portal y ofrece
 * copiarlo, abrir WhatsApp o el correo con un mensaje listo. Si la cotización cambió desde el
 * último envío, enviar crea la versión siguiente (B, C…) y el cliente ve siempre la última.
 *
 * Crear la versión siguiente de algo ya enviado se confirma (con la diferencia a la vista) cuando
 * no es evidente: si solo pediste copiar el enlace, si el cliente ya la aceptó (tendría que volver
 * a aceptar) o si lo único que cambió son tus precios. Si tus últimos cambios no llegaron al
 * servidor, no se envía nada: el cliente recibiría la versión anterior.
 */
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Copy, Download, Mail, MessageCircle, RotateCw, Send, TriangleAlert } from 'lucide-react'
import { formatCLP } from '@framezen/engine'
import type { SendQuoteResponse } from '@framezen/shared'
import { request } from '../../../lib/api'
import { useSession } from '../../../lib/auth'
import { revisionLetter } from '../../../lib/format'
import { Button, Dialog, DialogContent, Spinner, Textarea } from '../../../ui'
import { toast } from './toasts'
import { docChangedSinceSent, editedSinceSent, mailtoUrl, portalUrl, sentPriceDrift, shareMessage, whatsappPhone, whatsappUrl } from '../lib/share'
import { useEditor, useEditorShallow, useEditorUi, useEditorUiApi } from './context'
import { actionError, useQuoteActions } from './useQuoteActions'

type Phase =
  | { kind: 'idle' }
  | { kind: 'sending' }
  /** Enviar crearía la versión siguiente de algo ya enviado: se confirma con la diferencia a la vista. */
  | {
      kind: 'confirm'
      /** Versión que ve hoy el cliente y la que se crearía. */
      current: string
      next: string
      /** Enlace vigente (versión actual). */
      url: string
      /** Total de la versión nueva (IVA incluido). */
      total: number
      /** Total que ve hoy el cliente, si se sabe con certeza. */
      seen: number | null
      /** La cotización está aceptada: enviar otra versión pide aceptarla de nuevo. */
      accepted: boolean
      acceptedBy?: string
      docChanged: boolean
    }
  /** `total` = el de la versión que ve el cliente (el que calculó el servidor). */
  | { kind: 'ready'; url: string; letter: string; fresh: boolean; total: number }
  | { kind: 'error'; message: string }

export function SendDialog() {
  const open = useEditorUi((s) => s.sendOpen)
  const setUi = useEditorUi((s) => s.set)
  const close = () => setUi({ sendOpen: false, sendIntent: null })
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setUi({ sendOpen: true }) : close())}>
      {open ? <SendContent onClose={close} /> : null}
    </Dialog>
  )
}

function SendContent({ onClose }: { onClose: () => void }) {
  const editor = useEditor()
  const session = useSession()
  const queryClient = useQueryClient()
  const actions = useQuoteActions()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const started = useRef(false)
  const uiApi = useEditorUiApi()
  const intent = useRef(uiApi.getState().sendIntent)
  const { client, number, title } = useEditorShallow((s) => ({
    client: s.doc.clientId ? s.clients[s.doc.clientId] : undefined,
    number: s.meta.number,
    title: s.doc.title,
  }))

  /** Deja el enlace listo y, si lo pidieron («Copiar enlace»), lo copia de una vez. */
  const ready = (next: Extract<Phase, { kind: 'ready' }>) => {
    setPhase(next)
    if (intent.current !== 'copy') return
    intent.current = null
    navigator.clipboard?.writeText(next.url).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      },
      () => undefined, // Sin permiso para copiar: queda el botón «Copiar».
    )
  }

  const send = async (confirmed = false) => {
    setPhase({ kind: 'sending' })
    try {
      // Si tus últimos cambios no llegaron al servidor, se corta aquí: /send enviaría la versión anterior.
      await editor.ensureSaved()
      const state = editor.get()
      const { meta } = state
      const live = state.evaluation.totals.total
      // Sin cambios en el documento ni en los precios desde el último envío: el enlace ya muestra esto.
      if (!editedSinceSent(meta, false, live) && meta.shareToken && meta.status !== 'draft') {
        ready({ kind: 'ready', url: portalUrl(meta.shareToken), letter: revisionLetter(meta.revision), fresh: false, total: meta.totals?.total ?? live })
        return
      }
      const resend = meta.revision >= 1 && !!meta.sentAt && !!meta.shareToken
      const docChanged = docChangedSinceSent(meta, false)
      const accepted = meta.status === 'accepted'
      if (resend && !confirmed && (intent.current === 'copy' || accepted || !docChanged)) {
        const drift = sentPriceDrift(meta, live)
        setPhase({
          kind: 'confirm',
          current: revisionLetter(meta.revision),
          next: revisionLetter(meta.revision + 1),
          url: portalUrl(meta.shareToken),
          total: live,
          seen: drift?.exact ? drift.sent : null,
          accepted,
          acceptedBy: accepted ? meta.acceptedBy?.name : undefined,
          docChanged,
        })
        return
      }
      const result = await editor.serverOp(
        () => request<SendQuoteResponse>(`/quotes/${encodeURIComponent(meta.id)}/send`, { method: 'POST', body: { channel: 'link' } }),
        (r) => r.quote,
      )
      void queryClient.invalidateQueries({ queryKey: ['quotes'] })
      ready({
        kind: 'ready',
        url: result.url || portalUrl(result.quote.shareToken),
        letter: result.revisionLabel || revisionLetter(result.revision),
        fresh: true,
        // El total del mensaje es el de la versión que se acaba de enviar (lo calculó el servidor).
        total: result.quote.totals?.total ?? live,
      })
    } catch (error) {
      setPhase({ kind: 'error', message: actionError(error) })
    }
  }

  /** Copia el enlace que ya tiene el cliente (sin crear versión nueva). */
  const copyCurrent = async (url: string, letter: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(`Copiamos el enlace de la versión ${letter}.`)
      onClose()
    } catch {
      toast('Selecciona el enlace y cópialo con Ctrl+C.')
    }
  }

  useEffect(() => {
    if (started.current) return
    started.current = true
    void send()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const done = phase.kind === 'ready' ? phase : null
  const confirm = phase.kind === 'confirm' ? phase : null
  const text =
    message ??
    (done
      ? shareMessage({ number, title, total: done.total, url: done.url, orgName: session.org.name, clientName: client?.name, clientRut: client?.rut, revisionLetter: done.letter })
      : '')

  const copy = async () => {
    if (!done) return
    try {
      await navigator.clipboard.writeText(done.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast('Selecciona el enlace y cópialo con Ctrl+C.')
    }
  }

  const phone = whatsappPhone(client?.phone)
  const description = done
    ? done.fresh
      ? done.letter && done.letter !== 'A'
        ? `Lista la versión ${done.letter}. Tu cliente verá siempre la última que envíes.`
        : 'Listo el enlace. Tu cliente puede revisar cada ventana y aceptarla en línea.'
      : `Es la versión ${done.letter || 'A'} que ya enviaste; no hay cambios desde entonces.`
    : confirm
      ? `¿Enviar la versión ${confirm.next}?`
      : 'Preparamos el enlace para tu cliente.'

  return (
    <DialogContent
      title="Enviar al cliente"
      description={description}
      size="md"
      footer={
        <>
          <Button variant="ghost" icon={Download} onClick={() => void actions.downloadPdf()} loading={actions.busy === 'pdf'}>
            Descargar PDF
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Listo
          </Button>
        </>
      }
    >
      {phase.kind === 'sending' || phase.kind === 'idle' ? (
        <div className="flex items-center gap-3 py-6 text-paper-600">
          <Spinner size={16} /> Preparando el enlace…
        </div>
      ) : phase.kind === 'error' ? (
        <div role="alert" className="rounded-md border border-bad-600/20 bg-bad-50 px-4 py-3 text-[13px] text-bad-800">
          <p>{phase.message}</p>
          <Button size="sm" icon={RotateCw} className="mt-2" onClick={() => void send()}>
            Reintentar
          </Button>
        </div>
      ) : confirm ? (
        <div className="space-y-4">
          {confirm.accepted ? (
            <div className="flex gap-2 rounded-md border border-warn-600/25 bg-warn-50 px-3 py-2.5 text-[13px] leading-[18px] text-paper-900">
              <TriangleAlert aria-hidden strokeWidth={1.75} className="mt-px size-4 shrink-0 text-warn-600" />
              <p>
                {confirm.acceptedBy ?? 'Tu cliente'} aceptó la versión {confirm.current}. Si envías la versión {confirm.next}, la cotización vuelve a «Enviada» y
                tendrá que aceptarla de nuevo.
              </p>
            </div>
          ) : null}
          <p className="text-[13px] leading-[18px] text-paper-900">
            {confirm.seen !== null ? (
              <>
                Tu cliente ve la versión {confirm.current} por <span className="font-medium tabular">{formatCLP(confirm.seen)}</span>. La versión {confirm.next}{' '}
                sumaría <span className="font-medium tabular">{formatCLP(confirm.total)}</span> IVA incluido
                {confirm.docChanged ? ', con tus cambios' : ', con tus precios de hoy'}.
              </>
            ) : (
              <>
                Tu cliente ve la versión {confirm.current}. La versión {confirm.next} {confirm.docChanged ? 'incluye tus cambios y ' : ''}sumaría{' '}
                <span className="font-medium tabular">{formatCLP(confirm.total)}</span> IVA incluido.
              </>
            )}
          </p>
          <div>
            <div className="mb-1.5 text-[13px] font-medium text-paper-900">Enlace actual (versión {confirm.current})</div>
            <input
              readOnly
              value={confirm.url}
              aria-label="Enlace actual del cliente"
              onFocus={(e) => e.currentTarget.select()}
              className="h-9 w-full min-w-0 rounded-sm border border-paper-200 bg-paper-50 px-3 font-mono text-[12px] text-paper-900 outline-none focus:border-ink-500"
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button variant="primary" icon={Send} onClick={() => void send(true)}>
              Enviar versión {confirm.next}
            </Button>
            <Button icon={Copy} onClick={() => void copyCurrent(confirm.url, confirm.current)}>
              Copiar enlace de la versión {confirm.current}
            </Button>
          </div>
        </div>
      ) : done ? (
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-[13px] font-medium text-paper-900">Enlace del cliente</div>
            <div className="flex items-stretch gap-2">
              <input
                readOnly
                value={done.url}
                aria-label="Enlace del cliente"
                onFocus={(e) => e.currentTarget.select()}
                className="h-9 min-w-0 flex-1 rounded-sm border border-paper-200 bg-paper-50 px-3 font-mono text-[12px] text-paper-900 outline-none focus:border-ink-500"
              />
              <Button icon={copied ? Check : Copy} onClick={() => void copy()} className="w-28">
                {copied ? 'Copiado' : 'Copiar'}
              </Button>
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-[13px] font-medium text-paper-900">Mensaje</span>
              <span className="text-meta text-paper-600">Puedes cambiarlo antes de enviar</span>
            </div>
            <Textarea rows={5} value={text} onChange={(e) => setMessage(e.target.value)} aria-label="Mensaje para el cliente" className="text-[13px]" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button asChild variant="primary" size="lg">
              <a href={whatsappUrl(text, client?.phone)} target="_blank" rel="noreferrer">
                <MessageCircle aria-hidden strokeWidth={1.75} />
                WhatsApp
              </a>
            </Button>
            <Button asChild size="lg">
              <a href={mailtoUrl({ to: client?.email, subject: `Cotización N° ${number}${title ? ` · ${title}` : ''}`, body: text })}>
                <Mail aria-hidden strokeWidth={1.75} />
                Correo
              </a>
            </Button>
          </div>
          {!client ? (
            <p className="text-meta text-paper-600">Sin cliente asignado: elige a quién enviarlo en WhatsApp o en tu correo.</p>
          ) : !phone && !client.email ? (
            <p className="text-meta text-paper-600">Agrega el teléfono o el correo de {client.name} en Clientes para abrir su chat directo la próxima vez.</p>
          ) : null}
        </div>
      ) : null}
    </DialogContent>
  )
}
