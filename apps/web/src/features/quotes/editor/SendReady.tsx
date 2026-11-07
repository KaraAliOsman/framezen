/**
 * Envío listo: el PDF, el enlace y el mensaje, con lo que de verdad se puede hacer en cada canal.
 * WhatsApp y el correo no reciben archivos por enlace: en computador el PDF se descarga y lo adjuntas
 * tú; en el teléfono la hoja de compartir del sistema sí lleva el archivo.
 */
import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Download, Mail, MessageCircle, Pencil, Share2 } from 'lucide-react'
import { sendFormatIncludesLink, sendFormatIncludesPdf, type Client, type Locale, type SendChannel, type SendFormat, type SendMailResult } from '@dekopen/shared'
import { useT } from '../../../lib/i18n'
import { Button, Notice, Spinner } from '../../../ui'
import { SendReminder } from '../../home/SendReminder'
import es from '../i18n/es'
import { saveBlob } from '../lib/document'
import { mailtoUrl, shareSubject, whatsappUrl } from '../lib/share'
import { useEditorShallow } from './context'
import { toast } from './toasts'
import { useQuoteActions } from './useQuoteActions'

export interface ReadyState {
  url: string
  letter: string
  fresh: boolean
  followUpAt?: string
  format: SendFormat
  channel: SendChannel
  /** Mensaje final, con el enlace ya puesto. */
  message: string
  /** Correo que debía salir desde el servidor. */
  to?: string
  emailed?: SendMailResult
  attached?: boolean
}

type PdfState = { state: 'working' } | { state: 'saved'; name: string; blob: Blob } | { state: 'share'; file: File } | { state: 'failed' }

const linkField =
  'h-9 w-full min-w-0 flex-1 rounded-sm border border-divider bg-sunken px-3 text-meta tabular text-fg outline-none focus:border-focus focus:shadow-[0_0_0_3px_var(--dk-focus-ring)]'

/** Teléfono o tableta que puede compartir un archivo: la única vía que adjunta el PDF de verdad. */
function canShareFile(file: File): boolean {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  try {
    return Boolean(touch) && navigator.canShare({ files: [file] })
  } catch {
    return false
  }
}

export function SendReady({
  state,
  client,
  number,
  title,
  locale,
  onEdit,
}: {
  state: ReadyState
  client?: Pick<Client, 'name' | 'phone' | 'email'>
  number: number
  title: string
  locale: Locale
  onEdit: () => void
}) {
  const t = useT(es)
  const actions = useQuoteActions()
  const { quoteId, status } = useEditorShallow((s) => ({ quoteId: s.meta.id, status: s.meta.status }))
  const includesPdf = sendFormatIncludesPdf(state.format)
  const includesLink = sendFormatIncludesLink(state.format)
  const [pdf, setPdf] = useState<PdfState>({ state: 'working' })
  const [copied, setCopied] = useState<'link' | 'message' | null>(null)
  const started = useRef(false)
  const mailed = state.emailed === 'sent'

  const loadPdf = async () => {
    setPdf({ state: 'working' })
    const result = await actions.pdfFile().catch(() => null)
    if (!result) {
      setPdf({ state: 'failed' })
      return
    }
    const file = new File([result.blob], result.name, { type: 'application/pdf' })
    if (canShareFile(file)) {
      setPdf({ state: 'share', file })
      return
    }
    saveBlob(result.blob, result.name)
    setPdf({ state: 'saved', name: result.name, blob: result.blob })
  }

  useEffect(() => {
    if (started.current || !includesPdf || mailed) return
    started.current = true
    void loadPdf()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const copy = async (what: 'link' | 'message') => {
    try {
      await navigator.clipboard.writeText(what === 'link' ? state.url : state.message)
      setCopied(what)
      setTimeout(() => setCopied(null), 1800)
    } catch {
      toast(t('send.copyManual'))
    }
  }

  const sharePdf = async () => {
    if (pdf.state !== 'share') return
    // El texto no siempre viaja junto al archivo: queda copiado para pegarlo.
    void navigator.clipboard?.writeText(state.message).catch(() => undefined)
    try {
      await navigator.share({ files: [pdf.file], text: state.message, title: shareSubject(number, title, locale) })
    } catch (error) {
      if ((error as Error).name !== 'AbortError') toast(t('send.shareFailed'))
    }
  }

  const whatsapp = state.channel === 'whatsapp'
  const href = whatsapp ? whatsappUrl(state.message, client?.phone) : mailtoUrl({ to: client?.email, subject: shareSubject(number, title, locale), body: state.message })
  const open = (
    <Button asChild variant={pdf.state === 'share' ? 'secondary' : 'primary'} size="lg" className="w-full">
      <a href={href} target={whatsapp ? '_blank' : undefined} rel="noreferrer">
        {whatsapp ? <MessageCircle aria-hidden strokeWidth={1.75} /> : <Mail aria-hidden strokeWidth={1.75} />}
        {whatsapp ? t('send.openWhatsapp') : t('send.openMail')}
      </a>
    </Button>
  )

  if (mailed) {
    return (
      <div className="space-y-4">
        <p className="flex items-start gap-2 text-table text-fg">
          <Check aria-hidden strokeWidth={2} className="mt-0.5 size-4 shrink-0 text-success" />
          <span className="min-w-0 break-words">{t(state.attached ? 'send.mailSentPdf' : 'send.mailSent', { to: state.to ?? '' })}</span>
        </p>
        {includesPdf && !state.attached ? (
          <Notice tone="warning" size="compact">
            {t('send.mailNoPdf')}
          </Notice>
        ) : null}
        {status === 'sent' ? <SendReminder quoteId={quoteId} followUpAt={state.followUpAt} /> : null}
        <p className="text-meta text-fg-muted">{t(`send.tracking.${state.format}`)}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {state.emailed === 'failed' ? (
        <Notice tone="warning" size="compact">
          {t('send.mailFailed')}
        </Notice>
      ) : null}
      {includesPdf ? (
        <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {pdf.state === 'working' ? (
            <span className="inline-flex items-center gap-2 text-table text-fg-muted">
              <Spinner size={14} /> {t('send.pdfWorking')}
            </span>
          ) : pdf.state === 'saved' ? (
            <>
              <span className="inline-flex min-w-0 items-center gap-2 text-table text-fg">
                <Check aria-hidden strokeWidth={2} className="size-4 shrink-0 text-success" />
                <span className="min-w-0 break-all">{t('send.pdfSaved', { name: pdf.name })}</span>
              </span>
              <Button size="sm" variant="ghost" icon={Download} onClick={() => saveBlob(pdf.blob, pdf.name)}>
                {t('send.pdfAgain')}
              </Button>
            </>
          ) : pdf.state === 'share' ? (
            <>
              <span className="inline-flex items-center gap-2 text-table text-fg">
                <Check aria-hidden strokeWidth={2} className="size-4 shrink-0 text-success" />
                {t('send.pdfShareReady')}
              </span>
              <Button size="sm" variant="ghost" icon={Download} onClick={() => saveBlob(pdf.file, pdf.file.name)}>
                {t('send.pdf')}
              </Button>
            </>
          ) : (
            <Notice
              tone="warning"
              size="compact"
              className="w-full"
              action={
                <Button size="sm" onClick={() => void actions.printFallback()}>
                  {t('send.pdfPrint')}
                </Button>
              }
            >
              {t('send.pdfFailed')}
            </Notice>
          )}
        </div>
      ) : null}

      {includesLink ? (
        <div>
          <div className="mb-1.5 text-table font-medium text-fg-strong">{t('send.link')}</div>
          <div className="flex items-stretch gap-2">
            <input readOnly value={state.url} aria-label={t('send.link')} onFocus={(e) => e.currentTarget.select()} className={linkField} />
            <Button icon={copied === 'link' ? Check : Copy} onClick={() => void copy('link')} className="w-28">
              {copied === 'link' ? t('send.copied') : t('send.copy')}
            </Button>
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <span className="text-table font-medium text-fg-strong">{t('send.message')}</span>
          <span className="inline-flex items-center gap-3 text-meta">
            <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 text-accent-ink hover:underline">
              <Pencil aria-hidden strokeWidth={1.75} className="size-3" />
              {t('send.editMessage')}
            </button>
            <button type="button" onClick={() => void copy('message')} className="inline-flex items-center gap-1 text-accent-ink hover:underline">
              {copied === 'message' ? <Check aria-hidden strokeWidth={2} className="size-3" /> : <Copy aria-hidden strokeWidth={1.75} className="size-3" />}
              {copied === 'message' ? t('send.copied') : t('send.copyMessage')}
            </button>
          </span>
        </div>
        <p className="scrollbar-quiet max-h-36 overflow-y-auto rounded-sm bg-sunken px-3 py-2 text-table break-words whitespace-pre-wrap text-fg">{state.message}</p>
      </div>

      <div className="space-y-2">
        {pdf.state === 'share' && includesPdf ? (
          <Button variant="primary" size="lg" icon={Share2} onClick={() => void sharePdf()} className="w-full">
            {t('send.sharePdf')}
          </Button>
        ) : null}
        {open}
        {includesPdf ? (
          <p className="text-table text-fg-muted">
            {pdf.state === 'share' ? t('send.shareHint') : whatsapp ? t('send.whatsappAttach') : t('send.mailAttach')}
          </p>
        ) : null}
      </div>

      {status === 'sent' ? <SendReminder quoteId={quoteId} followUpAt={state.followUpAt} /> : null}
      <p className="text-meta text-fg-muted">{t(`send.tracking.${state.format}`)}</p>
    </div>
  )
}
