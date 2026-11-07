/** Bloques de Inicio: cifras, recientes y aviso del catálogo. */
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { Catalog } from '@dekopen/engine'
import type { QuoteSummary } from '@dekopen/shared'
import { useSettings } from '../../lib/hooks'
import { useFormat, useGlossary, useLocale, useT } from '../../lib/i18n'
import { buttonClass, KPI, Notice, PageSection, SkeletonRows, StatusPill } from '../../ui'
import es from './i18n/es'
import { linesToReview, monthKey, monthName, quotesListLink, salesDelta, soldBreakdown, type QuoteStats } from './homeModel'
import { QuoteThumb } from './QuoteThumb'

/** Nombre del impuesto de la empresa («IVA», «KDV», «MwSt.»), el del glosario si no tiene uno propio. */
export function useCompanyTax(): string {
  const settings = useSettings()
  const g = useGlossary()
  return settings.data?.taxLabel?.trim() || g.term('business.vat')
}

function Stat({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="-m-2 block min-w-0 rounded-sm p-2 transition-colors duration-100 hover:bg-hover focus-visible:outline-offset-0">
      {children}
    </Link>
  )
}

/**
 * Las cifras del mes, sueltas sobre la hoja. Todo sale de `/quotes/stats`: nada inventado. La de lo
 * aceptado dice además dónde está esa venta (ver `soldBreakdown`).
 */
export function SummaryStrip({ stats, count, now }: { stats: QuoteStats; count: number; now: Date }) {
  const t = useT(es)
  const tax = useCompanyTax()
  const fmt = useFormat()
  const { locale } = useLocale()
  const month = monthKey(now)
  const sent = stats.byStatus.sent
  const workshop = stats.byStatus.workshop
  const sold = stats.soldThisMonth
  const parts = soldBreakdown(sold)
  const queueTotal = stats.followUps.reduce((acc, q) => acc + Math.max(0, Number(q.total) || 0), 0)
  const soldHint =
    sold.count === 0
      ? t('summary.soldNone')
      : parts.waiting === 0
        ? t('summary.soldInProduction', { count: parts.inProduction })
        : parts.inProduction === 0
          ? t('summary.soldWaiting', { count: parts.waiting })
          : t('summary.soldMixed', { waiting: parts.waiting, inProduction: parts.inProduction })
  return (
    <section aria-label={t('summary.label')} className="grid grid-cols-2 gap-x-6 gap-y-6 @lg:grid-cols-4 @4xl:grid-cols-1">
      <Stat to={quotesListLink('sent')}>
        <KPI variant="plain" label={t('summary.followUps')} value={fmt.number(count)} hint={count > 0 ? fmt.money(queueTotal) : t('summary.followUpsNone')} />
      </Stat>
      <Stat to={quotesListLink('sent')}>
        <KPI variant="plain" label={t('summary.sent')} value={fmt.money(sent.total)} hint={t('summary.sentHint', { count: sent.count })} />
      </Stat>
      <Stat to={parts.to}>
        <KPI variant="plain" label={t('summary.accepted', { month: monthName(month, locale) })} value={fmt.money(sold.total)} delta={salesDelta(stats)} hint={soldHint} />
      </Stat>
      <Stat to="/taller">
        <KPI variant="plain" label={t('summary.workshop')} value={fmt.number(workshop.count)} hint={t('summary.workshopHint', { count: workshop.count })} />
      </Stat>
      <p className="col-span-2 text-meta text-fg-muted @lg:col-span-4 @4xl:col-span-1">{t('summary.taxNote', { tax })}</p>
    </section>
  )
}

export function RecentQuotes({ quotes, catalog, loading }: { quotes: QuoteSummary[]; catalog?: Catalog | null; loading?: boolean }) {
  const t = useT(es)
  const fmt = useFormat()
  return (
    <PageSection
      title={t('recent.title')}
      actions={
        <Link to="/cotizaciones" className="text-table font-medium text-accent hover:underline">
          {t('recent.seeAll')}
        </Link>
      }
    >
      {loading ? (
        <SkeletonRows rows={4} columns={3} />
      ) : quotes.length === 0 ? (
        <p className="text-fg-muted">{t('recent.empty')}</p>
      ) : (
        <ul className="-mx-3 divide-y divide-divider rounded-panel bg-plate shadow-plate">
          {quotes.map((q) => (
            <li key={q.id}>
              <Link
                to={`/cotizaciones/${q.id}`}
                className="flex min-h-14 items-center gap-3 rounded-sm px-3 py-2 transition-colors duration-100 hover:bg-hover focus-visible:outline-offset-[-2px]"
              >
                <QuoteThumb item={q.firstItem} catalog={catalog} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-fg-strong">{q.title || t('recent.untitled')}</span>
                  <span className="block truncate text-table text-fg-muted">{[q.clientName ?? t('recent.noClient'), fmt.relative(q.updatedAt)].join(' · ')}</span>
                </span>
                <StatusPill status={q.status} size="sm" className="max-sm:hidden" />
                <span className="w-28 shrink-0 text-right font-medium whitespace-nowrap text-fg-strong tabular max-sm:w-auto">{fmt.money(q.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageSection>
  )
}

/**
 * Aviso del catálogo, solo si afecta a una cotización en curso: nombra la línea y la obra. Las líneas
 * incompletas que nadie usa no se avisan aquí (están en Catálogo, cuando las busques).
 */
export function CatalogNotice({ catalog, quotes }: { catalog?: Catalog | null; quotes: QuoteSummary[] }) {
  const t = useT(es)
  const fmt = useFormat()
  const lines = useMemo(() => linesToReview(catalog, quotes), [catalog, quotes])
  const first = lines[0]
  if (!first) return null
  const quote = quotes.find((q) => q.id === first.quoteId)
  const job = first.quoteLabel || (quote ? fmt.docNumber(quote.number) : '')
  return (
    <Notice
      tone="warning"
      size="compact"
      className="mt-8"
      action={
        <Link to="/catalogo?tab=lineas" className={buttonClass('secondary', 'sm')}>
          {t('catalog.review')}
        </Link>
      }
    >
      {t('catalog.warning', { line: first.lineName, job, more: lines.length - 1 })}
    </Notice>
  )
}
