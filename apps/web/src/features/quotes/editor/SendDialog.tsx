/**
 * «Enviar al cliente». Primero se elige cómo sale (PDF por defecto, enlace web o ambos) y por dónde,
 * con el mensaje a la vista; nada se marca como enviado hasta preparar el envío. El saludo vive
 * aquí y nunca entra al documento, y el mensaje no lleva el total.
 *
 * Si la cotización cambió desde el último envío, preparar crea la versión siguiente (B, C…) y el
 * cliente ve siempre la última. Cuando eso no es evidente (el cliente ya aceptó, o solo cambiaron tus
 * precios) la diferencia queda a la vista antes de confirmar. Si tus últimos cambios no llegaron al
 * servidor, no se envía nada: el cliente recibiría la versión anterior.
 */
import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Copy, Download, Languages, Mail, MessageCircle, RotateCw, Send } from 'lucide-react'
import {
  DEFAULT_SENDING,
  LOCALE_META,
  sendFormatIncludesLink,
  type QuoteSharedBody,
  type QuoteSharedResponse,
  type SendChannel,
  type SendFormat,
  type SendQuoteResponse,
  type SendTemplates,
} from '@dekopen/shared'
import { humanError, request } from '../../../lib/api'
import { useSession } from '../../../lib/auth'
import { revisionLetter } from '../../../lib/format'
import { useSettings, useUpdateSettings } from '../../../lib/hooks'
import { useFormat, useGlossary, useT } from '../../../lib/i18n'
import { Button, Dialog, DialogContent, Field, Input, Notice, SegmentedControl, Spinner, Textarea } from '../../../ui'
import es from '../i18n/es'
import { applyLink, docChangedSinceSent, editedSinceSent, portalUrl, renderSendTemplate, sendTemplate, sendVariables, sentPriceDrift, unknownSendVariables, whatsappPhone } from '../lib/share'
import { useEditor, useEditorShallow, useEditorUi, useEditorUiApi } from './context'
import { useTaxLabel } from './names'
import { SendDepositDialog } from './SendDeposit'
import { SendReady, type ReadyState } from './SendReady'
import { SendTemplateEditor } from './SendTemplateEditor'
import { toast } from './toasts'
import { actionError, useQuoteActions } from './useQuoteActions'
import { useMessageLocale } from './useQuoteStage'

type Phase = { kind: 'compose' } | { kind: 'sending' } | ({ kind: 'ready' } & ReadyState) | { kind: 'error'; message: string }

export function SendDialog() {
  const open = useEditorUi((s) => s.sendOpen)
  const setUi = useEditorUi((s) => s.set)
  const close = () => setUi({ sendOpen: false, sendIntent: null })
  return (
    <>
      <Dialog open={open} onOpenChange={(o) => (o ? setUi({ sendOpen: true }) : close())}>
        {open ? <SendContent onClose={close} /> : null}
      </Dialog>
      <SendDepositDialog />
    </>
  )
}

const linkField =
  'h-9 w-full min-w-0 rounded-sm border border-divider bg-sunken px-3 text-meta tabular text-fg outline-none focus:border-focus focus:shadow-[0_0_0_3px_var(--dk-focus-ring)]'

function SendContent({ onClose }: { onClose: () => void }) {
  const t = useT(es)
  const g = useGlossary()
  const fmt = useFormat()
  const tax = useTaxLabel()
  const editor = useEditor()
  const session = useSession()
  const locale = useMessageLocale()
  const queryClient = useQueryClient()
  const actions = useQuoteActions()
  const uiApi = useEditorUiApi()
  const settings = useSettings()
  const update = useUpdateSettings()
  const intent = useRef(uiApi.getState().sendIntent)
  const started = useRef(false)
  const [phase, setPhase] = useState<Phase>({ kind: 'compose' })

  const stage = useEditorShallow((s) => {
    const live = s.evaluation.totals.total
    const dirty = s.save.dirty || s.save.status === 'saving'
    const unchanged = !editedSinceSent(s.meta, dirty, live) && !!s.meta.shareToken && s.meta.status !== 'draft'
    const drift = sentPriceDrift(s.meta, live)
    return {
      client: s.doc.clientId ? s.clients[s.doc.clientId] : undefined,
      number: s.meta.number,
      title: s.doc.title,
      revision: s.meta.revision,
      unchanged,
      resend: s.meta.revision >= 1 && !!s.meta.sentAt && !!s.meta.shareToken,
      docChanged: docChangedSinceSent(s.meta, dirty),
      accepted: s.meta.status === 'accepted',
      acceptedBy: s.meta.acceptedBy?.name,
      token: s.meta.shareToken,
      live,
      seen: drift?.exact ? drift.sent : null,
      storedSending: s.settings.sending,
      texts: s.doc.documentOverrides?.texts,
      validityDays: s.doc.documentOverrides?.validityDays,
      validUntil: s.doc.validUntil,
    }
  })
  const { client } = stage
  // El documento omite lo que no existe: aquí se avisa, para que no salga sin saberlo.
  const documents = settings.data?.documents
  const gaps = documents
    ? [
        !(stage.texts?.leadTimeText ?? documents.leadTimeText)?.trim() ? t('send.gapLeadTime') : '',
        !(stage.texts?.paymentTerms ?? documents.paymentTerms)?.trim() ? t('send.gapPayment') : '',
        !stage.validUntil && !(stage.validityDays ?? documents.validityDays) ? t('send.gapValidity') : '',
      ].filter(Boolean)
    : []
  const sending = settings.data?.sending ?? stage.storedSending ?? DEFAULT_SENDING
  const [format, setFormat] = useState<SendFormat>(intent.current === 'copy' ? 'link' : sending.format)
  const [channel, setChannel] = useState<SendChannel>(() => (client?.email && !whatsappPhone(client.phone) ? 'email' : 'whatsapp'))
  const [drafts, setDrafts] = useState<Partial<Record<SendChannel, string>>>({})
  const [templates, setTemplates] = useState<SendTemplates>(sending.templates ?? {})
  const [editing, setEditing] = useState(false)
  const [to, setTo] = useState(client?.email ?? '')
  const [ownMail, setOwnMail] = useState(false)
  const mailProvider = settings.data?.mailProvider ?? false
  // Sale desde el servidor solo si hay proveedor y a quién: si no, se abre el correo de quien envía.
  const serverMail = channel === 'email' && mailProvider && !ownMail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())

  const current = revisionLetter(stage.revision)
  const next = revisionLetter(stage.revision + 1)
  const letter = stage.unchanged ? current : next
  const needsConfirm = stage.resend && !stage.unchanged && (intent.current === 'copy' || stage.accepted || !stage.docChanged)

  const message = (which: SendChannel, withLink: boolean): string => {
    const vars = sendVariables(
      { number: stage.number, title: stage.title, orgName: session.org.name, sellerName: session.user.name, clientName: client?.name, clientRut: client?.rut, revisionLetter: letter, locale },
      withLink ? '{enlace}' : '',
    )
    return renderSendTemplate(sendTemplate(templates, which, locale), vars)
  }
  const needsLink = sendFormatIncludesLink(format)
  const text = drafts[channel] ?? message(channel, needsLink)

  const chooseFormat = (value: SendFormat) => {
    setFormat(value)
    // El texto que ya escribiste se conserva: solo entra o sale la línea del enlace.
    setDrafts((all) => Object.fromEntries(Object.entries(all).map(([k, v]) => [k, applyLink(v, sendFormatIncludesLink(value))])))
  }

  const saveDefault = () => {
    update.mutate(
      { sending: { ...sending, format } },
      {
        onSuccess: () => toast.success(t('send.defaultSaved')),
        onError: (error) => toast.error(humanError(error)),
      },
    )
  }

  const prepare = async () => {
    const final = (url: string) => applyLink(text, needsLink).replaceAll('{enlace}', url)
    const mail = serverMail ? { to: to.trim(), message: applyLink(text, needsLink) } : {}
    const ready = (state: Omit<ReadyState, 'message' | 'format' | 'channel' | 'to'>) => {
      setPhase({ kind: 'ready', ...state, format, channel, message: final(state.url), ...(serverMail ? { to: to.trim() } : {}) })
      if (intent.current !== 'copy') return
      intent.current = null
      navigator.clipboard?.writeText(state.url).then(
        () => toast.success(t('send.copied')),
        () => undefined, // Sin permiso para copiar: queda el botón «Copiar».
      )
    }
    setPhase({ kind: 'sending' })
    try {
      // Si tus últimos cambios no llegaron al servidor, se corta aquí: /send enviaría la versión anterior.
      await editor.ensureSaved()
      const state = editor.get()
      const { meta } = state
      const live = state.evaluation.totals.total
      // Sin cambios: la versión es la misma; solo queda registrado por dónde salió esta vez.
      if (!editedSinceSent(meta, false, live) && meta.shareToken && meta.status !== 'draft') {
        const body: QuoteSharedBody = { format, ...mail }
        const shared = await request<QuoteSharedResponse>(`/quotes/${encodeURIComponent(meta.id)}/shared`, { method: 'POST', body }).catch((error) => {
          // El registro de la vía no detiene nada; un correo que no salió sí se dice.
          if (serverMail) throw error
          return undefined
        })
        ready({ url: portalUrl(meta.shareToken), letter: revisionLetter(meta.revision), fresh: false, emailed: shared?.emailed, attached: shared?.attached })
        return
      }
      const result = await editor.serverOp(
        () => request<SendQuoteResponse>(`/quotes/${encodeURIComponent(meta.id)}/send`, { method: 'POST', body: { channel, format, ...mail } }),
        (r) => r.quote,
      )
      void queryClient.invalidateQueries({ queryKey: ['quotes'] })
      ready({
        url: result.url || portalUrl(result.quote.shareToken),
        letter: result.revisionLabel || revisionLetter(result.revision),
        fresh: true,
        followUpAt: result.followUpAt,
        emailed: result.emailed,
        attached: result.attached,
      })
    } catch (error) {
      setPhase({ kind: 'error', message: actionError(error) })
    }
  }

  /** Copia el enlace que ya tiene el cliente (sin crear versión nueva). */
  const copyCurrent = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('send.copiedVersion', { letter: current }))
      onClose()
    } catch {
      toast(t('send.copyManual'))
    }
  }

  // «Copiar enlace»: si no hay nada que confirmar, el enlace sale de una vez.
  useEffect(() => {
    if (started.current) return
    started.current = true
    if (intent.current === 'copy' && !needsConfirm) void prepare()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const unknown = unknownSendVariables(text)
  const contact = channel === 'whatsapp' ? client?.phone : client?.email
  const amount = <span className="font-medium tabular text-fg-strong" />
  const ready = phase.kind === 'ready' ? phase : null

  const description = ready
    ? ready.fresh
      ? ready.letter && ready.letter !== 'A'
        ? t('send.freshVersion', { letter: ready.letter })
        : t('send.freshReady')
      : t('send.same', { letter: ready.letter || 'A' })
    : stage.unchanged
      ? t('send.same', { letter: current })
      : stage.resend
        ? t('send.confirm', { letter: next })
        : t('send.composeDescription')

  const primaryLabel = serverMail ? t('send.sendMail') : stage.resend && !stage.unchanged ? t('send.sendVersion', { letter: next }) : t(`send.prepare.${format}`)

  return (
    <DialogContent
      title={t('send.title')}
      description={description}
      size="md"
      footer={
        ready ? (
          <Button variant="secondary" onClick={onClose}>
            {t('send.done')}
          </Button>
        ) : phase.kind === 'compose' && !editing ? (
          <>
            <Button variant="ghost" icon={Download} onClick={() => void actions.downloadPdf()} loading={actions.busy === 'pdf'}>
              {t('send.pdf')}
            </Button>
            <Button variant="primary" icon={Send} onClick={() => void prepare()}>
              {primaryLabel}
            </Button>
          </>
        ) : undefined
      }
    >
      {phase.kind === 'sending' ? (
        <div className="flex items-center gap-3 py-6 text-fg-muted">
          <Spinner size={16} /> {t('send.preparing')}
        </div>
      ) : phase.kind === 'error' ? (
        <Notice
          tone="danger"
          action={
            <Button size="sm" icon={RotateCw} onClick={() => void prepare()}>
              {t('send.retry')}
            </Button>
          }
        >
          {phase.message}
        </Notice>
      ) : ready ? (
        <SendReady
          state={ready}
          client={client}
          number={stage.number}
          title={stage.title}
          locale={locale}
          onEdit={() => setPhase({ kind: 'compose' })}
        />
      ) : editing ? (
        <SendTemplateEditor
          channel={channel}
          locale={locale}
          languageName={inlineLanguageName(locale, t.locale)}
          templates={templates}
          onClose={() => setEditing(false)}
          onSaved={(saved) => {
            setTemplates(saved)
            // Lo que estaba escrito en este envío deja paso a la plantilla nueva.
            setDrafts((all) => ({ ...all, [channel]: undefined }))
            setEditing(false)
          }}
        />
      ) : (
        <div className="space-y-5">
          {gaps.length ? (
            <Notice tone="neutral" size="compact">
              {t('send.gaps', { list: fmt.list(gaps) })}
            </Notice>
          ) : null}
          {needsConfirm ? (
            <div className="space-y-3">
              {stage.accepted ? (
                <Notice tone="warning" size="compact">
                  {t('send.acceptedWarning', { name: stage.acceptedBy ?? t('send.yourClient'), current, next, status: g.quoteStatus('sent') })}
                </Notice>
              ) : null}
              <p className="text-table text-fg">
                {stage.seen !== null
                  ? t.rich(stage.docChanged ? 'send.seenChanges' : 'send.seenPrices', { b: amount, current, next, seen: fmt.money(stage.seen), total: fmt.money(stage.live), tax })
                  : t.rich(stage.docChanged ? 'send.unseenChanges' : 'send.unseenPrices', { b: amount, current, next, total: fmt.money(stage.live), tax })}
              </p>
              {stage.token ? (
                <div>
                  <div className="mb-1.5 text-table font-medium text-fg-strong">{t('send.currentLink', { letter: current })}</div>
                  <div className="flex items-stretch gap-2">
                    <input readOnly value={portalUrl(stage.token)} aria-label={t('send.currentLinkAria')} onFocus={(e) => e.currentTarget.select()} className={`${linkField} flex-1`} />
                    <Button icon={Copy} onClick={() => void copyCurrent(portalUrl(stage.token))} aria-label={t('send.copyVersion', { letter: current })}>
                      {t('send.copy')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-table font-medium text-fg-strong">
              <span id="send-format">{t('send.formatLabel')}</span>
              {format !== sending.format ? (
                <button type="button" onClick={saveDefault} disabled={update.isPending} className="text-meta font-normal text-accent-ink hover:underline">
                  {t('send.saveDefault', { format: t(`send.format.${format}`) })}
                </button>
              ) : null}
            </div>
            <SegmentedControl<SendFormat>
              aria-label={t('send.formatLabel')}
              block
              value={format}
              onValueChange={chooseFormat}
              options={(['pdf', 'link', 'both'] as const).map((value) => ({ value, label: t(`send.format.${value}`) }))}
            />
            <p className="mt-1.5 text-table text-fg-muted">{t(`send.formatHint.${format}`)}</p>
          </div>

          <div>
            <div className="mb-1.5 text-table font-medium text-fg-strong">{t('send.channelLabel')}</div>
            <SegmentedControl<SendChannel>
              aria-label={t('send.channelLabel')}
              block
              value={channel}
              onValueChange={setChannel}
              options={[
                { value: 'whatsapp', label: t('send.whatsapp'), icon: MessageCircle },
                { value: 'email', label: t('send.mail'), icon: Mail },
              ]}
            />
            {channel === 'email' && mailProvider && !ownMail ? (
              <Field className="mt-3" label={t('send.mailTo')} hint={t(`send.mailHint.${format}`)} aside={<OwnMailButton label={t('send.ownMail')} onClick={() => setOwnMail(true)} />}>
                <Input type="email" inputMode="email" autoComplete="off" value={to} onChange={(e) => setTo(e.target.value)} />
              </Field>
            ) : channel === 'email' && mailProvider ? (
              <p className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3 text-table text-fg-muted">
                <span>{t('send.ownMailHint')}</span>
                <OwnMailButton label={t('send.serverMail')} onClick={() => setOwnMail(false)} />
              </p>
            ) : channel === 'email' ? (
              <Notice tone="neutral" size="compact" className="mt-2">
                {t('send.noProvider')}
              </Notice>
            ) : (
              <p className="mt-1.5 text-table text-fg-muted">
                {!client ? t('send.noClient') : contact ? t('send.to', { name: client.name, contact }) : t('send.noContact', { name: client.name })}
              </p>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-table font-medium text-fg-strong">{t('send.message')}</span>
              <span className="inline-flex items-center gap-1 text-meta text-fg-muted">
                <Languages aria-hidden strokeWidth={1.75} className="size-3.5" />
                {t('send.messageLanguage', { language: inlineLanguageName(locale, t.locale) })}
              </span>
            </div>
            <Textarea
              rows={7}
              value={text}
              onChange={(e) => {
                const value = e.target.value
                setDrafts((all) => ({ ...all, [channel]: value }))
              }}
              aria-label={t('send.messageAria')}
              className="text-table"
            />
            <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-meta text-fg-muted">
              <span>{needsLink ? t('send.linkHint', { token: '{enlace}' }) : t('send.messageHint')}</span>
              <button type="button" onClick={() => setEditing(true)} className="text-accent-ink hover:underline">
                {t('send.editTemplate')}
              </button>
            </div>
            {unknown.length ? <p className="mt-1 text-meta text-warning">{t('send.unknownVariables', { names: unknown.join(', ') })}</p> : null}
          </div>
        </div>
      )}
    </DialogContent>
  )
}

function OwnMailButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-meta font-normal text-accent-ink hover:underline">
      {label}
    </button>
  )
}

/** Nombre del idioma dentro de una frase de la interfaz, con su mayúscula natural («en inglés», «auf Englisch»). */
function inlineLanguageName(target: keyof typeof LOCALE_META, ui: keyof typeof LOCALE_META): string {
  try {
    return new Intl.DisplayNames([LOCALE_META[ui].intl], { type: 'language' }).of(LOCALE_META[target].intl.split('-')[0] ?? target) ?? LOCALE_META[target].label
  } catch {
    return LOCALE_META[target].label
  }
}
