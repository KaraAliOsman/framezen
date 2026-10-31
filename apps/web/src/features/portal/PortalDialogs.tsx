import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CircleCheck, Send } from 'lucide-react'
import type { Catalog } from '@framezen/engine'
import { Window3DLazy } from '../viewer3d/lazy'
import { api, humanError, type AcceptResult } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatCLP } from '../../lib/format'
import { Dialog, DialogContent } from '../../ui/Dialog'
import { Field } from '../../ui/Field'
import { Input, Textarea } from '../../ui/Input'
import { Sheet, SheetContent } from '../../ui/Sheet'
import { Slider } from '../../ui/Slider'
import { Spinner } from '../../ui/Spinner'
import { useIsPhone } from '../clients/useIsPhone'
import { rutHint } from '../clients/rut'
import { acceptNameError, type PortalItem } from './portalModel'

export const brandButton =
  'inline-flex items-center justify-center gap-2 rounded-sm bg-[var(--brand)] font-medium text-[var(--brand-on)] transition-[background-color,transform,opacity] duration-120 ease-out hover:bg-[color-mix(in_srgb,var(--brand)_86%,black)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60'
export const outlineButton =
  'inline-flex items-center justify-center gap-2 rounded-sm border border-paper-200 bg-paper-0 font-medium text-paper-900 transition-[background-color,border-color,transform] duration-120 ease-out hover:border-paper-350/60 hover:bg-paper-100 active:scale-[0.98]'

/** Diálogo en escritorio, hoja inferior en el teléfono. */
function Responsive({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
  size = 'md',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  footer?: ReactNode
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
}) {
  const phone = useIsPhone()
  if (phone) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" title={title} description={description} footer={footer}>
          {children}
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description} footer={footer} size={size}>
        {children}
      </DialogContent>
    </Dialog>
  )
}

// ── Aceptar ──────────────────────────────────────────────────────────────────

export function AcceptDialog({
  open,
  onOpenChange,
  token,
  orgName,
  quoteLabel,
  total,
  itemsCount,
  paymentTerms,
  defaultName,
  revision,
  onAccepted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string
  orgName: string
  quoteLabel: string
  total: number
  itemsCount: number
  paymentTerms?: string
  defaultName?: string
  /** Revisión que se está mostrando: se acepta esa y no una más nueva que el cliente no vio. */
  revision?: number
  onAccepted: (result: AcceptResult) => void
}) {
  const [name, setName] = useState(defaultName ?? '')
  const [rut, setRut] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<AcceptResult | null>(null)

  useEffect(() => {
    if (open) {
      setTried(false)
      setError(null)
      setDone(null)
      setName((n) => n || defaultName || '')
    }
  }, [open, defaultName])

  const nameError = acceptNameError(name)
  const rutWarning = rutHint(rut)

  const submit = async () => {
    setTried(true)
    if (nameError) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.portal.accept(token, { name: name.trim(), ...(rut.trim() ? { rut: rut.trim() } : {}), ...(revision ? { revision } : {}) })
      setDone(result)
      onAccepted(result)
    } catch (err) {
      setError(humanError(err))
    } finally {
      setBusy(false)
    }
  }

  const first = name.trim().split(/\s+/)[0]

  return (
    <Responsive
      open={open}
      onOpenChange={onOpenChange}
      title={done ? 'Cotización aceptada' : 'Aceptar cotización'}
      description={done ? undefined : `${quoteLabel} · ${formatCLP(total)} IVA incluido`}
      footer={
        done ? (
          <button type="button" className={cn(outlineButton, 'h-10 px-4')} onClick={() => onOpenChange(false)}>
            Cerrar
          </button>
        ) : (
          <>
            <button type="button" className={cn(outlineButton, 'h-10 px-4 max-sm:flex-1')} onClick={() => onOpenChange(false)}>
              Volver
            </button>
            <button type="button" className={cn(brandButton, 'h-10 px-5 max-sm:flex-[2]')} onClick={() => void submit()} disabled={busy}>
              {busy ? <Spinner /> : null}
              Acepto la cotización
            </button>
          </>
        )
      }
    >
      {done ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-ok-50 text-ok-600">
            <CircleCheck aria-hidden strokeWidth={1.75} className="size-6" />
          </span>
          <div>
            <p className="text-h3 font-semibold text-paper-900">{done.alreadyAccepted ? 'Ya estaba aceptada' : `¡Listo${first ? `, ${first}` : ''}!`}</p>
            <p className="mx-auto mt-1 max-w-sm text-paper-600">
              {done.alreadyAccepted
                ? `${orgName} ya tiene registrada la aceptación de esta cotización.`
                : `Le avisamos a ${orgName}. Te van a contactar pronto para coordinar los siguientes pasos.`}
            </p>
          </div>
          {done.warnings.map((w) => (
            <p key={w} className="rounded-md bg-warn-50 px-3 py-2 text-[13px] leading-[18px] text-warn-800">
              {w}
            </p>
          ))}
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Field label="Tu nombre" error={tried ? nameError : undefined}>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" autoFocus placeholder="Nombre y apellido" />
          </Field>
          <Field label="RUT" optional hint={rutWarning ? <span className="text-warn-800">{rutWarning}</span> : 'Solo si quieres que la boleta o factura salga a tu nombre.'}>
            <Input value={rut} onChange={(e) => setRut(e.target.value)} placeholder="12.345.678-5" inputMode="text" autoComplete="off" />
          </Field>
          <div className="rounded-md border border-paper-200 bg-paper-50 px-4 py-3 text-[13px] leading-[19px] text-paper-900">
            Al aceptar confirmas que estás de acuerdo con {itemsCount === 1 ? 'la ventana' : `las ${itemsCount} ventanas`}, sus medidas, precios y
            condiciones de esta cotización. {orgName} recibirá el aviso y se pondrá en contacto contigo para coordinar
            {paymentTerms ? ` (${paymentTerms.replace(/\.$/, '')})` : ' el abono y la fabricación'}.
          </div>
          {error ? (
            <p role="alert" className="text-[13px] text-bad-600">
              {error}
            </p>
          ) : null}
          <button type="submit" hidden />
        </form>
      )}
    </Responsive>
  )
}

// ── Pedir cambios ────────────────────────────────────────────────────────────

export function ChangesDialog({
  open,
  onOpenChange,
  token,
  orgName,
  defaultName,
  onSent,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  token: string
  orgName: string
  defaultName?: string
  onSent: () => void
}) {
  const [message, setMessage] = useState('')
  const [name, setName] = useState(defaultName ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [tried, setTried] = useState(false)
  const sentRef = useRef(sent)
  sentRef.current = sent

  // Al volver a abrir después de enviar, empieza en blanco.
  useEffect(() => {
    if (!open) return
    setError(null)
    setTried(false)
    if (sentRef.current) {
      setSent(null)
      setMessage('')
    }
  }, [open])

  const submit = async () => {
    setTried(true)
    if (!message.trim()) return
    setBusy(true)
    setError(null)
    try {
      const result = (await api.portal.requestChanges(token, { message: message.trim(), ...(name.trim() ? { name: name.trim() } : {}) })) as {
        ok: boolean
        message?: string
      }
      setSent(result.message ?? `Listo, le avisamos a ${orgName}. Te contactarán con la cotización ajustada.`)
      onSent()
    } catch (err) {
      setError(humanError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Responsive
      open={open}
      onOpenChange={onOpenChange}
      title={sent ? 'Mensaje enviado' : 'Pedir cambios'}
      description={sent ? undefined : `Cuéntale a ${orgName} qué quieres ajustar. Te responderán con una versión nueva.`}
      footer={
        sent ? (
          <button type="button" className={cn(outlineButton, 'h-10 px-4')} onClick={() => onOpenChange(false)}>
            Cerrar
          </button>
        ) : (
          <>
            <button type="button" className={cn(outlineButton, 'h-10 px-4 max-sm:flex-1')} onClick={() => onOpenChange(false)}>
              Volver
            </button>
            <button type="button" className={cn(brandButton, 'h-10 px-5 max-sm:flex-[2]')} onClick={() => void submit()} disabled={busy}>
              {busy ? <Spinner /> : <Send aria-hidden strokeWidth={1.75} className="size-4" />}
              Enviar
            </button>
          </>
        )
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-paper-100 text-paper-900">
            <Send aria-hidden strokeWidth={1.75} className="size-5" />
          </span>
          <p className="max-w-sm text-paper-900">{sent}</p>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Field label="¿Qué te gustaría cambiar?" error={tried && !message.trim() ? 'Escribe aunque sea una línea para saber qué ajustar.' : undefined}>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              autoFocus
              placeholder="Por ejemplo: la ventana del living la prefiero en nogal, y agregar una de 600 × 600 para el baño."
            />
          </Field>
          <Field label="Tu nombre" optional>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </Field>
          {error ? (
            <p role="alert" className="text-[13px] text-bad-600">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </Responsive>
  )
}

// ── 3D ───────────────────────────────────────────────────────────────────────

export function View3DDialog({ item, catalog, onOpenChange }: { item: PortalItem | null; catalog: Catalog; onOpenChange: (open: boolean) => void }) {
  const phone = useIsPhone()
  const [open, setOpenAmount] = useState(0)
  const [view, setView] = useState<'interior' | 'exterior'>('exterior')
  useEffect(() => {
    if (item) {
      setOpenAmount(0)
      setView('exterior')
    }
  }, [item])
  return (
    <Responsive open={Boolean(item)} onOpenChange={onOpenChange} size="lg" title={item ? `${item.ref} · ${item.title}` : 'Vista 3D'} description={item ? [item.size, item.lineName, item.colorName].filter(Boolean).join(' · ') : undefined}>
      {item?.layout ? (
        <div className="flex flex-col gap-4">
          <Window3DLazy
            layout={item.layout}
            design={item.design}
            catalog={catalog}
            openAmount={open}
            view={view}
            height={phone ? 300 : 400}
            className="overflow-hidden rounded-md border border-paper-200"
          />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <label className="flex min-w-[220px] flex-1 items-center gap-3 text-[13px] text-paper-600">
              <span className="shrink-0">Abrir</span>
              <Slider aria-label="Abrir la ventana" value={Math.round(open * 100)} onValueChange={(v) => setOpenAmount(v / 100)} min={0} max={100} step={1} className="flex-1" />
            </label>
            <div role="radiogroup" aria-label="Vista" className="inline-flex rounded-sm border border-paper-200 bg-paper-0 p-0.5 text-[13px]">
              {(['exterior', 'interior'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  onClick={() => setView(v)}
                  className={cn('h-8 rounded-[4px] px-3 font-medium', view === v ? 'bg-paper-100 text-paper-900' : 'text-paper-600 hover:text-paper-900')}
                >
                  {v === 'interior' ? 'Desde adentro' : 'Desde afuera'}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </Responsive>
  )
}
