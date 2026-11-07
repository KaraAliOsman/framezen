import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Check, CircleCheckBig, Eye, EyeOff, Hammer, MessageCircle, PenLine, Send, type LucideIcon } from 'lucide-react'
import type { Catalog } from '@dekopen/engine'
import { isLocale, type Locale, type QuoteFollowUp } from '@dekopen/shared'
import { humanError } from '../../lib/api'
import { useSession } from '../../lib/auth'
import { useSettings } from '../../lib/hooks'
import { loadLocale, useFormat, useT } from '../../lib/i18n'
import { Button, buttonClass, type ButtonVariant, PageSection, toast } from '../../ui'
import { useCreateWorkOrder } from '../workshop/data'
import { useResolveNotices } from './api'
import {
  addressee,
  changesReplyMessage,
  clientMessages,
  daysSince,
  followUpMessage,
  portalLink,
  QUEUE_ORDER,
  queueReason,
  whatsappUrl,
  whoAnswered,
  type QueueReason,
} from './homeModel'
import es from './i18n/es'
import { LostButton, PostponeButton } from './QueueActions'
import { QuoteThumb } from './QuoteThumb'

/** Cuántas filas se ven antes de «Ver todas». */
const VISIBLE = 8

const REASON_ICON: Record<QueueReason, LucideIcon> = { changes: PenLine, accepted: CircleCheckBig, viewed: Eye, unopened: EyeOff, sentPdf: Send }

/** Idioma de los documentos: el WhatsApp va al cliente, no a quien usa la interfaz. */
function useDocLocale(): Locale {
  const me = useSession()
  const settings = useSettings()
  const orgLocale = settings.data?.locale ?? me.org.locale
  const locale: Locale = isLocale(orgLocale) ? orgLocale : 'es'
  useEffect(() => {
    void loadLocale(locale)
  }, [locale])
  return locale
}

function useQuoteWhatsapp(quote: QuoteFollowUp, locale: Locale): string {
  const me = useSession()
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const text =
    queueReason(quote) === 'changes'
      ? changesReplyMessage({ clientName: quote.clientName, number: quote.number, locale })
      : followUpMessage({ clientName: quote.clientName, number: quote.number, orgName: me.org.name, link: quote.sentFormat === 'pdf' ? undefined : portalLink(origin, quote.shareToken), locale })
  return whatsappUrl(quote.clientPhone, text)
}

/** Lo que dijo el cliente, entero y con sus saltos de línea. */
function ClientMessages({ quote, lead }: { quote: QuoteFollowUp; lead?: boolean }) {
  const messages = clientMessages(quote)
  if (!messages.length) return null
  return (
    <div className="flex flex-col gap-2">
      {messages.map((message, i) => (
        <blockquote key={i} className={lead ? 'max-w-[68ch] text-lead break-words whitespace-pre-line text-fg-strong' : 'max-w-[68ch] break-words whitespace-pre-line text-fg'}>
          {message}
        </blockquote>
      ))}
    </div>
  )
}

/** «Pasar a taller»: crea la OT y abre su página; el aviso de «aceptó» cae solo. */
function WorkshopButton({ quote, variant }: { quote: QuoteFollowUp; variant: ButtonVariant }) {
  const t = useT(es)
  const navigate = useNavigate()
  const create = useCreateWorkOrder()
  return (
    <Button
      variant={variant}
      size={variant === 'primary' ? 'md' : 'sm'}
      icon={Hammer}
      loading={create.isPending}
      onClick={() => create.mutate(quote.id, { onSuccess: (order) => navigate(`/taller/${order.id}`), onError: (error) => toast.error(humanError(error)) })}
    >
      {t('followUp.toWorkshop')}
    </Button>
  )
}

function DoneButton({ quote }: { quote: QuoteFollowUp }) {
  const t = useT(es)
  const resolve = useResolveNotices()
  return (
    <Button
      variant="ghost"
      size="sm"
      icon={Check}
      onClick={() =>
        void resolve.mutateAsync({ quoteId: quote.id, ids: (quote.notices ?? []).map((n) => n.id), pending: false }).catch((error: unknown) => toast.error(humanError(error)))
      }
    >
      {t('followUp.done')}
    </Button>
  )
}

function WhatsappLink({ quote, locale, variant = 'secondary', label }: { quote: QuoteFollowUp; locale: Locale; variant?: ButtonVariant; label: string }) {
  const href = useQuoteWhatsapp(quote, locale)
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClass(variant, variant === 'primary' ? 'md' : 'sm')}>
      <MessageCircle aria-hidden strokeWidth={1.75} />
      {label}
    </a>
  )
}

/** Las acciones de cada motivo. `lead` = la tarea de arriba: su acción es la primaria de la vista. */
function RowActions({ quote, locale, lead }: { quote: QuoteFollowUp; locale: Locale; lead?: boolean }) {
  const t = useT(es)
  const reason = queueReason(quote)
  const main: ButtonVariant = lead ? 'primary' : 'secondary'
  const trailing: ReactNode = (
    <>
      {reason === 'viewed' || reason === 'unopened' || reason === 'sentPdf' ? <PostponeButton quote={quote} /> : <DoneButton quote={quote} />}
      {reason === 'accepted' ? null : <LostButton quote={quote} />}
    </>
  )
  if (reason === 'changes') {
    return (
      <>
        <Link to={`/cotizaciones/${quote.id}`} className={buttonClass(main, lead ? 'md' : 'sm')}>
          <PenLine aria-hidden strokeWidth={1.75} />
          {t('followUp.adjust')}
        </Link>
        <WhatsappLink quote={quote} locale={locale} label={t('followUp.reply')} />
        {trailing}
      </>
    )
  }
  if (reason === 'accepted') {
    return (
      <>
        {quote.status === 'accepted' ? <WorkshopButton quote={quote} variant={main} /> : null}
        {trailing}
      </>
    )
  }
  return (
    <>
      <WhatsappLink quote={quote} locale={locale} variant={main} label={t('followUp.whatsapp')} />
      {trailing}
    </>
  )
}

/** Qué pasó con esta cotización, en palabras. */
function useReasonLine(quote: QuoteFollowUp): string {
  const t = useT(es)
  const fmt = useFormat()
  switch (queueReason(quote)) {
    case 'changes':
      return t('followUp.reasons.changes', { when: fmt.relative(quote.notices?.[0]?.at ?? quote.updatedAt) })
    case 'accepted':
      return t('followUp.reasons.accepted', { when: fmt.relative(quote.notices?.[0]?.at ?? quote.updatedAt) })
    case 'viewed':
      return t('followUp.reasons.viewed', { when: fmt.relative(quote.viewedAt ?? quote.updatedAt) })
    case 'sentPdf':
      return t('followUp.reasons.sentPdf', { days: daysSince(quote.sentAt) })
    default:
      return t('followUp.reasons.unopened', { days: daysSince(quote.sentAt) })
  }
}

/** Obra · N° · total: la identidad de la cotización. El total nunca se trunca. */
function QuoteLine({ quote }: { quote: QuoteFollowUp }) {
  const fmt = useFormat()
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-fg-muted">
      <Link to={`/cotizaciones/${quote.id}`} className="min-w-0 font-medium break-words text-fg hover:underline">
        {quote.title || fmt.docNumber(quote.number)}
      </Link>
      {quote.title ? <span className="tabular">{fmt.docNumber(quote.number)}</span> : null}
      <span className="font-medium whitespace-nowrap text-fg tabular">{fmt.money(quote.total)}</span>
    </p>
  )
}

/**
 * La respuesta a «¿qué hago ahora?»: la primera tarea de la cola, con el mensaje entero y su acción
 * como primaria de la pantalla.
 */
export function NowBlock({ quote, catalog }: { quote: QuoteFollowUp; catalog?: Catalog | null }) {
  const t = useT(es)
  const locale = useDocLocale()
  const reason = queueReason(quote)
  const who = whoAnswered(quote)
  const name = addressee(who) || t('followUp.yourClient')
  const line = useReasonLine(quote)
  return (
    <section aria-labelledby="home-now" className="flex gap-5">
      <QuoteThumb item={quote.firstItem} catalog={catalog} size={96} className="max-sm:hidden" />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div>
          <h1 id="home-now" className="text-h2 font-medium text-balance break-words text-fg-strong sm:text-h1">
            {t(`now.${reason}`, { name })}
          </h1>
          <p className="mt-1 text-fg-muted">{line}</p>
        </div>
        <ClientMessages quote={quote} lead />
        <QuoteLine quote={quote} />
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <RowActions quote={quote} locale={locale} lead />
        </div>
        {reason === 'changes' ? <p className="text-table text-fg-muted">{t('followUp.resendHint')}</p> : null}
      </div>
    </section>
  )
}

function QueueRow({ quote, catalog, locale }: { quote: QuoteFollowUp; catalog?: Catalog | null; locale: Locale }) {
  const t = useT(es)
  const line = useReasonLine(quote)
  const who = quote.clientName || t('followUp.noClient')
  return (
    <li className="flex gap-3 py-3 first:pt-0 max-sm:flex-col sm:items-start sm:gap-4">
      <div className="flex min-w-0 flex-1 gap-3">
        <QuoteThumb item={quote.firstItem} catalog={catalog} size={40} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <QuoteLine quote={quote} />
          <p className="text-table break-words text-fg-muted">
            {who} · {line}
          </p>
          <ClientMessages quote={quote} />
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-1 max-sm:pl-[52px] sm:justify-end">
        <RowActions quote={quote} locale={locale} />
      </div>
    </li>
  )
}

/** «Por seguir»: lo que queda después de la primera tarea, agrupado por motivo y en ese orden. */
export function FollowUps({ queue, catalog }: { queue: QuoteFollowUp[]; catalog?: Catalog | null }) {
  const t = useT(es)
  const fmt = useFormat()
  const locale = useDocLocale()
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? queue : queue.slice(0, VISIBLE)
  const groups = useMemo(() => QUEUE_ORDER.map((reason) => ({ reason, items: shown.filter((q) => queueReason(q) === reason) })).filter((g) => g.items.length > 0), [shown])
  if (queue.length === 0) return null
  return (
    <PageSection title={t('followUp.title')} description={t('followUp.count', { count: queue.length })}>
      <div className="flex flex-col gap-6">
        {groups.map(({ reason, items }) => {
          const Icon = REASON_ICON[reason]
          return (
            <div key={reason}>
              <h3 className="mb-2 flex items-center gap-2 text-h4 font-medium text-fg-strong">
                <Icon aria-hidden strokeWidth={1.75} className="size-4 text-fg-muted" />
                {t(`followUp.groups.${reason}`)}
                <span className="font-normal text-fg-muted tabular">{fmt.number(items.length)}</span>
              </h3>
              <ul className="-mx-3 divide-y divide-divider rounded-panel bg-plate px-3 shadow-plate">
                {items.map((q) => (
                  <QueueRow key={q.id} quote={q} catalog={catalog} locale={locale} />
                ))}
              </ul>
            </div>
          )
        })}
      </div>
      {!expanded && queue.length > VISIBLE ? (
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => setExpanded(true)}>
          {t('followUp.showAll', { count: queue.length })}
        </Button>
      ) : null}
    </PageSection>
  )
}
