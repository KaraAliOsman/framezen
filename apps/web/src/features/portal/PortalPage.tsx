/**
 * Portal del cliente /c/:token (público, sin el marco de la app). Es el momento en que el cliente
 * decide: un recorrido de una columna, como la cotización impresa. Primero la marca del taller y la
 * obra, después cada ventana con su dibujo, las condiciones y, al final y solo al final, el total
 * con «Aceptar» y «Pedir cambios». En el teléfono, una barra lleva al final sin mostrar la cifra.
 *
 * Siempre en claro (es el documento de venta del taller) y en el idioma del DOCUMENTO de la
 * cotización, no en el de quien lo abre: todo vive dentro de `<LocaleScope>`.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useLocation, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowDown, CalendarClock, CircleCheck, Download, Globe, Mail, MessageCircle, Phone } from 'lucide-react'
import type { QuoteSelection } from '@dekopen/engine'
import { DOC_DEFAULT_TEXT_FIELDS, localizedDefaultText, paymentSchedule } from '@dekopen/documents'
import { paymentPlan } from '@dekopen/shared'
import type { AcceptResult } from '../../lib/api'
import { ApiRequestError, humanError } from '../../lib/api'
import { cn } from '../../lib/cn'
import { initials } from '../../lib/format'
import { usePublicQuote } from '../../lib/hooks'
import { getLocale, LocaleScope, useFormat, useGlossary, useT } from '../../lib/i18n'
import { qk } from '../../lib/queryClient'
import { buttonClass } from '../../ui/Button'
import { DekopenLogo, DekopenMark } from '../../ui/DekopenLogo'
import { Notice } from '../../ui/Notice'
import { Skeleton } from '../../ui/Skeleton'
import { Switch } from '../../ui/Switch'
import { arItemFromUrl } from '../viewer3d/ar/capability'
import es from './i18n/es'
import { AcceptDialog, brandButton, ChangesDialog, View3DDialog } from './PortalDialogs'
import { PortalItemCard, PortalMarks, portalItemTitle } from './PortalItemCard'
import { PortalPayment } from './PortalPayment'
import {
  brandColors,
  choiceExtras,
  conditionLines,
  contactLinks,
  customerStatus,
  documentLocale,
  hasChoices,
  includedIds,
  isAccepted,
  isExpired,
  payReturnNotice,
  pdfFileName,
  portalCurrency,
  portalItems,
  portalTaxLabel,
  portalTotals,
  validUntil,
  visibleExtras,
  type ContactLink,
  type CustomerStatus,
  type PortalData,
  type PortalItem,
} from './portalModel'
import { useLightTheme } from './useLightTheme'

export default function PortalPage() {
  const { token = '' } = useParams()
  useLightTheme()
  const portal = usePublicQuote(token)
  const data = portal.data as PortalData | undefined
  // Mientras llega la cotización (o si falla) no sabemos el idioma del documento: el de quien mira.
  const locale = data ? documentLocale(data) : getLocale()

  return (
    <LocaleScope locale={locale} fallback={<PortalSkeleton />}>
      {portal.isPending ? (
        <PortalSkeleton />
      ) : portal.isError || !data ? (
        <PortalMissing error={portal.error} onRetry={() => void portal.refetch()} />
      ) : (
        <Portal data={data} token={token} />
      )}
    </LocaleScope>
  )
}

function Portal({ data, token }: { data: PortalData; token: string }) {
  const t = useT(es)
  const g = useGlossary()
  const currency = portalCurrency(data)
  const fmt = useFormat({ locale: t.locale, currency })
  const queryClient = useQueryClient()
  const { quote, org, catalog, features } = data
  const payReturn = payReturnNotice(useLocation().search)
  // Textos que el taller nunca editó (los que sembró DEKOPEN en español) llegan en el idioma del
  // documento, igual que en el PDF; los propios se respetan tal cual.
  const documents = useMemo(() => {
    const out = { ...data.documents }
    for (const field of DOC_DEFAULT_TEXT_FIELDS) out[field] = localizedDefaultText(field, data.documents[field] ?? undefined, t.locale) ?? data.documents[field]
    return out
  }, [data.documents, t.locale])
  const colors = brandColors(org.accent)
  const items = useMemo(() => portalItems(data, t.locale), [data, t.locale])
  // Mismos logos y misma ubicación que el documento.
  const allMarks = data.document?.marks ?? []
  const placement = data.document?.markPlacement ?? 'both'
  const usedBrands = new Set(items.map((item) => item.brandId))
  const stripMarks = placement === 'items' ? [] : allMarks.filter((mark) => mark.kind === 'hardware' || usedBrands.has(mark.brandId))
  const marksFor = (item: (typeof items)[number]) => (placement === 'strip' ? [] : allMarks.filter((mark) => mark.kind === 'hardware' || mark.brandId === item.brandId))
  const accepted = isAccepted(quote.status) && Boolean(quote.acceptedBy)
  // Opcionales y alternativas: el cliente decide y el total se recalcula aquí mismo. Ya aceptada,
  // manda lo que quedó escrito en la revisión.
  const [selection, setSelection] = useState<QuoteSelection>({})
  const choices = useMemo(() => hasChoices(quote), [quote])
  const active = useMemo(() => includedIds(quote, selection), [quote, selection])
  const counted = useMemo(() => (choices ? items.filter((item) => active.has(item.id)) : items), [choices, items, active])
  const extras = visibleExtras(quote.extras, choices ? active : undefined)
  const optionalExtras = choices ? choiceExtras(quote.extras) : []
  const totals = useMemo(() => (choices && quote.totals ? { ...quote.totals, ...portalTotals(data, selection) } : quote.totals), [choices, data, quote.totals, selection])
  const total = totals?.total ?? items.reduce((a, i) => a + i.totalNet, 0)
  const units = counted.reduce((a, i) => a + i.qty, 0)
  const pendingCount = counted.filter((item) => item.pending).length
  const area = counted.reduce((a, i) => a + i.area * i.qty, 0)
  const groupOf = (item: PortalItem) => item.altKey ?? item.id
  const choose = (item: PortalItem, on: boolean) => {
    setSelection((current) =>
      item.role === 'alternative'
        ? { ...current, alternatives: { ...current.alternatives, [groupOf(item)]: item.id } }
        : { ...current, optional: { ...current.optional, [item.id]: on } },
    )
  }
  const plan = useMemo(() => {
    const deposit = data.payment?.deposit
    return deposit ? paymentPlan({ mode: deposit.mode, value: deposit.pct ?? deposit.amount, milestones: deposit.milestones }, total) : []
  }, [data.payment, total])
  const payment = useMemo(() => {
    const base = data.payment
    return base?.deposit && plan[0] ? { ...base, deposit: { ...base.deposit, amount: plan[0].amount } } : base
  }, [data.payment, plan])
  const can3d = data.experience ? data.experience.view3d : (features ?? []).includes('client3d')
  const until = validUntil(quote, documents.validityDays)
  const expired = until ? isExpired(until) && !accepted : false
  const status = customerStatus(quote.status, accepted, expired)
  const number = fmt.docNumber(quote.number)
  const label = data.revisionLabel ? t('quote.labelRevision', { number, revision: data.revisionLabel }) : t('quote.label', { number })
  const tax = portalTaxLabel(data) ?? g.term('business.vat')
  const steps = paymentSchedule(documents.paymentTerms, total)
  const contacts = contactLinks(org, {
    whatsappText: t('contact.whatsappText', { number }),
    emailSubject: t('contact.emailSubject', { number }),
  })
  const longDate = (value: string | Date) => fmt.date(value, 'long')

  const [acceptOpen, setAcceptOpen] = useState(false)
  const [changesOpen, setChangesOpen] = useState(false)
  const [changesSent, setChangesSent] = useState(false)
  const [view3d, setView3d] = useState<PortalItem | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  // El QR del computador trae `?ar=<id>`: en el teléfono se abre directo esa ventana.
  const arOpened = useRef(false)
  useEffect(() => {
    if (arOpened.current || !can3d || !data.experience?.ar) return
    arOpened.current = true
    const wanted = arItemFromUrl(window.location.href)
    const item = items.find((i) => i.id === wanted && i.layout)
    if (item) setView3d(item)
  }, [can3d, data.experience?.ar, items])
  // La barra del teléfono lleva al cierre; se retira cuando el cierre ya está en pantalla.
  const closing = useRef<HTMLElement>(null)
  const [atClosing, setAtClosing] = useState(false)
  useEffect(() => {
    const el = closing.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setAtClosing(Boolean(entry?.isIntersecting)), { rootMargin: '0px 0px -96px 0px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const previous = document.title
    document.title = t('meta.title', { number, org: org.name })
    return () => {
      document.title = previous
    }
  }, [t, number, org.name])

  // El enlace es privado: ningún buscador debe guardarlo.
  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex, nofollow'
    document.head.appendChild(meta)
    return () => meta.remove()
  }, [])

  const onAccepted = (result: AcceptResult) => {
    queryClient.setQueryData<PortalData>(qk.portal(token), (prev) =>
      prev ? { ...prev, quote: { ...prev.quote, status: result.status, acceptedBy: result.acceptedBy ?? prev.quote.acceptedBy } } : prev,
    )
    // Con la aceptación hecha, el servidor ya entrega los datos de pago.
    if (data.payment) void queryClient.invalidateQueries({ queryKey: qk.portal(token) })
  }

  const downloadPdf = async () => {
    setPdfBusy(true)
    try {
      const res = await fetch(`/api/public/quotes/${encodeURIComponent(token)}/pdf`)
      if (res.ok && (res.headers.get('content-type') ?? '').includes('pdf')) {
        const url = URL.createObjectURL(await res.blob())
        const a = document.createElement('a')
        a.href = url
        a.download = pdfFileName(quote.number, data.revisionLabel, t('pdf.fileName', { number: quote.number }))
        document.body.appendChild(a)
        a.click()
        a.remove()
        setTimeout(() => URL.revokeObjectURL(url), 10_000)
        return
      }
      window.print()
    } catch {
      window.print()
    } finally {
      setPdfBusy(false)
    }
  }

  const style = {
    '--brand': colors.accent,
    '--brand-on': colors.onAccent,
    '--brand-ink': colors.ink,
    '--brand-soft': colors.soft,
  } as CSSProperties

  // Los diálogos se montan fuera de esta raíz (portal de Radix): los colores van también en <html>.
  useEffect(() => {
    const root = document.documentElement.style
    const vars = { '--brand': colors.accent, '--brand-on': colors.onAccent, '--brand-ink': colors.ink, '--brand-soft': colors.soft }
    for (const [k, v] of Object.entries(vars)) root.setProperty(k, v)
    return () => {
      for (const k of Object.keys(vars)) root.removeProperty(k)
    }
  }, [colors.accent, colors.onAccent, colors.ink, colors.soft])

  const meta = [
    quote.client?.name ? t('quote.forClient', { name: quote.client.name }) : null,
    quote.sentAt ? longDate(quote.sentAt) : null,
    until && !accepted ? t('quote.validUntil', { date: longDate(until) }) : null,
  ].filter(Boolean)
  const conditions = conditionLines(documents.conditions)
  const hasConditions = Boolean(documents.leadTimeText || documents.warranty || until || conditions.length)
  const goToPayment = () => document.getElementById('portal-payment')?.scrollIntoView({ behavior: smoothScroll() })

  return (
    <div style={style} className="min-h-dvh bg-canvas text-fg">
      <PortalHeader name={org.name} logo={org.logo}>
        <button
          type="button"
          onClick={() => void downloadPdf()}
          disabled={pdfBusy}
          aria-busy={pdfBusy || undefined}
          aria-label={t('header.download')}
          className={buttonClass('secondary', 'sm', 'shrink-0 print:hidden')}
        >
          <Download aria-hidden strokeWidth={1.75} />
          {/* En el teléfono el nombre del taller va primero: el botón se queda con lo justo. */}
          <span className="sm:hidden">PDF</span>
          <span className="max-sm:hidden">{pdfBusy ? t('header.downloading') : t('header.download')}</span>
        </button>
      </PortalHeader>

      <main className="mx-auto max-w-2xl px-4 pb-28 sm:px-6 lg:pb-20">
        <PortalCover label={label} title={quote.title || t('quote.label', { number })} meta={meta.join(' · ')} status={status}>
          {accepted && quote.acceptedBy ? (
            <Notice tone="success" title={t('notice.acceptedBy', { name: quote.acceptedBy.name })}>
              {quote.acceptedBy.rut
                ? t('notice.acceptedDetailRut', { date: longDate(quote.acceptedBy.at), rut: quote.acceptedBy.rut, org: org.name })
                : t('notice.acceptedDetail', { date: longDate(quote.acceptedBy.at), org: org.name })}
            </Notice>
          ) : null}
          {changesSent && !accepted ? <Notice tone="neutral">{t('notice.changesSent', { org: org.name })}</Notice> : null}
          {payReturn ? <Notice tone={payReturn === 'ok' ? 'success' : payReturn === 'rejected' ? 'warning' : 'neutral'}>{t(`notice.pay.${payReturn}`, { org: org.name })}</Notice> : null}
          {expired && until ? (
            <Notice tone="warning" icon={CalendarClock}>
              {t('notice.expired', { date: longDate(until), org: org.name })}
            </Notice>
          ) : null}
        </PortalCover>
        {/* La carta que escribió el taller, si escribió una. El saludo va en el mensaje de envío. */}
        {documents.intro ? <p className="mt-6 text-lead whitespace-pre-line text-fg">{documents.intro}</p> : null}

        <section aria-labelledby="portal-items" className="mt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 id="portal-items" className="font-display text-h2 font-medium text-fg-strong">
              {t('items.heading', { count: items.length })}
            </h2>
            <p className="tabular text-table whitespace-nowrap text-fg-muted">
              {documents.showArea === false ? g.count('windows', units) : t('items.summary', { windows: g.count('windows', units), area: fmt.area(area) })}
            </p>
          </div>
          {stripMarks.length ? <PortalMarks marks={stripMarks} className="mt-4" /> : null}
          <div className="mt-6 flex flex-col gap-12">
            {items.map((item) => (
              <PortalItemCard
                key={item.id}
                item={item}
                catalog={catalog}
                can3d={can3d}
                onOpen3d={setView3d}
                currency={currency}
                prefs={documents}
                marks={marksFor(item)}
                choice={item.role === 'base' ? undefined : { on: active.has(item.id), ...(accepted ? {} : { onChange: (on: boolean) => choose(item, on) }) }}
              />
            ))}
          </div>
        </section>

        {/* El cierre: el único lugar donde aparece el total. */}
        <section ref={closing} id="portal-total" aria-label={t('summary.label')} className="mt-14 scroll-mt-6 border-t border-fg-strong pt-6 break-inside-avoid">
          {totals ? (
            <dl className="text-base">
              {/* Sin descuento ni extras, «Ventanas» repetiría el neto. */}
              {totals.discount > 0 || extras.length ? <Row label={t('summary.windows', { count: units })} value={fmt.money(totals.subtotal)} /> : null}
              {totals.discount > 0 ? <Row label={t('summary.discount', { pct: fmt.pct(totals.discountPct, 1) })} value={`−${fmt.money(totals.discount)}`} tone="success" /> : null}
              {extras.map((e, index) => (
                <Row key={`${index}-${e.label ?? e.generic}`} label={e.label ?? t(`extras.${e.generic ?? 'unnamed'}`)} value={fmt.money(e.amount)} />
              ))}
              <Row label={t('summary.net')} value={fmt.money(totals.net)} />
              <Row label={tax} value={fmt.money(totals.iva)} />
            </dl>
          ) : null}

          {optionalExtras.length ? (
            <ul className="mt-4 flex flex-col gap-2">
              {optionalExtras.map((extra) => (
                <li key={extra.id} className="flex items-center justify-between gap-3 text-base">
                  <span className="min-w-0 text-fg">{extra.label || t('extras.unnamed')}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tabular text-fg-muted">{fmt.money(extra.amount)}</span>
                    <Switch
                      aria-label={t('item.include')}
                      checked={active.has(extra.id)}
                      disabled={accepted}
                      onCheckedChange={(on) => setSelection((current) => ({ ...current, optional: { ...current.optional, [extra.id]: on } }))}
                    />
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="mt-6">
            <p className="text-table text-fg-muted">{t('summary.total')}</p>
            <p className="tabular mt-0.5 font-display text-display-sm font-medium text-fg-strong sm:text-display">{fmt.money(total)}</p>
            <p className="mt-1 text-table text-fg-muted">{t('summary.taxIncluded', { tax })}</p>
            {pendingCount > 0 ? (
              <Notice tone="warning" size="compact" className="mt-3">
                {t('summary.pending', { count: pendingCount, org: org.name })}
              </Notice>
            ) : null}
          </div>

          {documents.paymentTerms ? (
            <div className="mt-6">
              <h3 className="text-table font-medium text-fg-strong">{t('conditions.payment')}</h3>
              {steps ? (
                <ul className="mt-1.5 flex flex-col gap-1 text-base">
                  {steps.map((s) => (
                    <li key={s.label} className="flex items-baseline justify-between gap-3">
                      <span className="text-fg-muted">{t('conditions.paymentStep', { pct: fmt.pct(s.pct, 1), label: s.label.toLowerCase() })}</span>
                      <span className="tabular text-fg">{fmt.money(s.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-base text-fg-muted">{documents.paymentTerms}</p>
              )}
            </div>
          ) : null}

          {payment ? <PortalPayment payment={payment} plan={plan} token={token} orgName={org.name} reference={label} currency={currency} needsEmail={!quote.client?.email} /> : null}

          {hasConditions ? (
            <div className="mt-10">
              <h2 id="portal-conditions" className="font-display text-h3 font-medium text-fg-strong">
                {t('conditions.heading')}
              </h2>
              <div className="mt-4 flex flex-col gap-5 text-base">
                {documents.leadTimeText ? <Condition title={t('conditions.leadTime')}>{documents.leadTimeText}</Condition> : null}
                {documents.warranty ? <Condition title={t('conditions.warranty')}>{documents.warranty}</Condition> : null}
                {until ? <Condition title={t('conditions.validity')}>{t('conditions.validityUntil', { date: longDate(until) })}</Condition> : null}
              </div>
              {conditions.length ? (
                <ul className="mt-5 flex flex-col gap-1.5 text-table text-fg-muted">
                  {conditions.map((l, i) => (
                    <li key={i}>{l.text}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="mt-8 flex flex-col gap-2 print:hidden">
            {accepted ? (
              <p className="flex h-12 items-center justify-center gap-2 rounded-control bg-success-bg font-medium text-success">
                <CircleCheck aria-hidden strokeWidth={1.75} className="size-[18px]" />
                {t('summary.accepted')}
              </p>
            ) : (
              <button type="button" onClick={() => setAcceptOpen(true)} className={cn(brandButton, 'h-12 w-full text-lead')}>
                {t('summary.accept')}
              </button>
            )}
            <button type="button" onClick={() => setChangesOpen(true)} className={buttonClass('secondary', 'lg', 'w-full')}>
              {accepted ? t('summary.writeWorkshop') : t('summary.requestChanges')}
            </button>
            <button type="button" onClick={() => void downloadPdf()} disabled={pdfBusy} aria-busy={pdfBusy || undefined} className={buttonClass('ghost', 'lg', 'w-full')}>
              <Download aria-hidden strokeWidth={1.75} />
              {pdfBusy ? t('header.downloading') : t('header.download')}
            </button>
            {!accepted ? <p className="mt-1 text-center text-table text-fg-muted">{t('summary.acceptNote', { org: org.name })}</p> : null}
          </div>

          {contacts.length ? <PortalContacts org={org.name} contacts={contacts} /> : null}
        </section>

        <footer className="mt-14 flex flex-col gap-3 text-meta text-fg-muted">
          <p>
            {[
              org.legalName || org.name,
              org.rut ? t('footer.rut', { rut: org.rut }) : null,
              [org.address, org.city].filter(Boolean).join(', ') || null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <p className="inline-flex items-center gap-2 print:hidden">
            {t('footer.madeWith')}
            <DekopenLogo size="sm" tone="mono" />
          </p>
        </footer>
      </main>

      {!atClosing ? (
        <div className="fixed inset-x-0 bottom-0 z-30 px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] lg:hidden print:hidden">
          <button
            type="button"
            onClick={() => closing.current?.scrollIntoView({ behavior: smoothScroll() })}
            className={cn(buttonClass('ink', 'lg', 'mx-auto w-full max-w-2xl'), 'shadow-float')}
          >
            {accepted ? t('mobile.seeSummary') : t('mobile.seeTotal')}
            <ArrowDown aria-hidden strokeWidth={1.75} />
          </button>
        </div>
      ) : null}

      <AcceptDialog
        open={acceptOpen}
        onOpenChange={setAcceptOpen}
        token={token}
        orgName={org.name}
        quoteLabel={label}
        total={total}
        currency={currency}
        taxLabel={tax}
        itemsCount={units}
        paymentTerms={documents.paymentTerms}
        defaultName={quote.client?.name}
        revision={quote.revision}
        {...(choices ? { selection } : {})}
        onAccepted={onAccepted}
        afterAccept={payment ? { label: t('payment.goToPay'), onClick: goToPayment } : undefined}
      />
      <ChangesDialog
        open={changesOpen}
        onOpenChange={setChangesOpen}
        token={token}
        orgName={org.name}
        defaultName={quote.client?.name}
        items={items.map((item) => ({ id: item.id, label: `${item.ref} · ${portalItemTitle(item, g)}` }))}
        onSent={() => setChangesSent(true)}
      />
      <View3DDialog item={view3d} catalog={catalog} ar={data.experience?.ar ?? false} token={token} onOpenChange={(open) => !open && setView3d(null)} />
    </div>
  )
}

function smoothScroll(): ScrollBehavior {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}

/** Marca del taller: lo primero que ve el cliente. Sin logo, sus iniciales en su color. */
export function PortalHeader({ name, logo, children }: { name: string; logo?: string; children?: ReactNode }) {
  return (
    <header className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 pt-5 sm:px-6 sm:pt-8">
      <div className="flex min-w-0 items-center gap-3">
        {logo ? (
          <img src={logo} alt={name} className="h-10 w-auto max-w-[180px] object-contain sm:h-12 sm:max-w-[240px]" />
        ) : (
          <span aria-hidden className="inline-flex size-10 shrink-0 items-center justify-center rounded-control bg-[var(--brand)] text-base font-semibold text-[var(--brand-on)]">
            {initials(name)}
          </span>
        )}
        <span className={cn('truncate font-display text-h3 font-medium text-fg-strong', logo && 'sr-only')}>{name}</span>
      </div>
      {children}
    </header>
  )
}

/** Portada: de qué se trata y para quién. Como en la cotización impresa, sin cifras. */
export function PortalCover({ label, title, meta, status, children }: { label: string; title: string; meta?: string; status?: CustomerStatus; children?: ReactNode }) {
  return (
    <section aria-labelledby="portal-title" className="pt-10 sm:pt-14">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="tabular text-table text-fg-muted">{label}</p>
        {status ? <CustomerStatusLine status={status} /> : null}
      </div>
      <h1 id="portal-title" className="mt-3 font-display text-figure font-medium text-balance break-words text-fg-strong sm:text-display-sm">
        {title}
      </h1>
      {meta ? <p className="mt-3 text-base break-words text-fg-muted">{meta}</p> : null}
      <div className="mt-5 flex flex-col gap-3 empty:hidden">{children}</div>
    </section>
  )
}

function PortalContacts({ org, contacts }: { org: string; contacts: ContactLink[] }) {
  const t = useT(es)
  return (
    <div className="mt-10 print:hidden">
      <h2 className="text-table font-medium text-fg-strong">{t('contact.heading', { org })}</h2>
      <ul className="mt-2 flex flex-col">
        {contacts.map((c) => {
          const Icon = c.kind === 'whatsapp' ? MessageCircle : c.kind === 'phone' ? Phone : c.kind === 'email' ? Mail : Globe
          return (
            <li key={c.kind}>
              <a
                href={c.href}
                target={c.kind === 'whatsapp' || c.kind === 'web' ? '_blank' : undefined}
                rel="noopener noreferrer"
                className="-mx-2 flex h-11 items-center gap-2.5 rounded-control px-2 text-base text-fg transition-colors duration-100 hover:bg-hover"
              >
                <Icon aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-[var(--brand-ink)]" />
                <span className="truncate">{c.kind === 'whatsapp' ? t('contact.whatsapp') : c.label}</span>
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Estado para el cliente: glifo + texto, sin fondo. */
function CustomerStatusLine({ status }: { status: Exclude<CustomerStatus, null> }) {
  const t = useT(es)
  const Icon = status === 'accepted' ? CircleCheck : status === 'expired' ? CalendarClock : null
  return (
    <p className={cn('inline-flex items-center gap-1.5 text-table', status === 'accepted' ? 'text-success' : status === 'expired' ? 'text-warning' : 'text-fg')}>
      {Icon ? <Icon aria-hidden strokeWidth={2} className="size-3.5" /> : <span aria-hidden className="size-1.5 rounded-full bg-[var(--brand)]" />}
      {t(`status.${status}`)}
    </p>
  )
}

function Condition({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <h3 className="text-table font-medium text-fg-strong">{title}</h3>
      <div className="mt-0.5 text-fg-muted">{children}</div>
    </div>
  )
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="min-w-0 text-fg-muted">{label}</dt>
      <dd className={cn('tabular shrink-0', tone === 'success' ? 'text-success' : 'text-fg')}>{value}</dd>
    </div>
  )
}

function PortalSkeleton() {
  const t = useT(es)
  return (
    <div className="min-h-dvh bg-canvas" aria-busy="true" aria-label={t('loading')}>
      <div className="mx-auto max-w-2xl px-4 pt-5 sm:px-6 sm:pt-8">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="mt-14 h-4 w-44" />
        <Skeleton className="mt-4 h-11 w-full max-w-md" />
        <Skeleton className="mt-3 h-4 w-64" />
        <Skeleton className="mt-14 h-80 w-full rounded-panel" />
        <Skeleton className="mt-4 h-6 w-48" />
      </div>
    </div>
  )
}

function PortalMissing({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const t = useT(es)
  const missing = error instanceof ApiRequestError && (error.status === 404 || error.status === 410)
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <DekopenMark size={28} className="text-fg-strong" />
        <div className="space-y-1.5">
          <h1 className="font-display text-h3 font-medium text-fg-strong">{missing ? t('missing.notFoundTitle') : t('missing.errorTitle')}</h1>
          <p className="text-fg-muted">{missing ? t('missing.notFoundText') : humanError(error)}</p>
        </div>
        {!missing ? (
          <button type="button" onClick={onRetry} className={buttonClass('secondary', 'md')}>
            {t('missing.retry')}
          </button>
        ) : null}
      </div>
    </div>
  )
}
