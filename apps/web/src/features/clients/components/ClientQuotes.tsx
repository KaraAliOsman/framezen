import { Link } from 'react-router'
import { FilePlus2 } from 'lucide-react'
import type { Catalog } from '@dekopen/engine'
import type { QuoteSummary } from '@dekopen/shared'
import { useFormat, useT } from '../../../lib/i18n'
import { Button, EmptyState, Numeric, RowTitle, SkeletonRows, StatusPill } from '../../../ui'
import { QuoteThumb } from '../../home/QuoteThumb'
import es from '../i18n/es'

/** Cotizaciones del cliente, como en la lista general: miniatura real, obra, estado y total. */
export function ClientQuotes({
  clientName,
  quotes,
  loading,
  catalog,
  onNewQuote,
  creating,
  readOnly,
}: {
  clientName: string
  quotes: QuoteSummary[]
  loading: boolean
  catalog?: Catalog
  onNewQuote: () => void
  creating: boolean
  readOnly?: boolean
}) {
  const t = useT(es)
  const fmt = useFormat()

  if (loading) return <SkeletonRows rows={3} columns={3} />

  if (quotes.length === 0) {
    return (
      <EmptyState
        size="compact"
        sketch="sliding"
        title={t('quotes.empty.title')}
        description={t('quotes.empty.description')}
        action={
          <Button variant="secondary" icon={FilePlus2} onClick={onNewQuote} loading={creating} disabled={readOnly}>
            {t('detail.newQuoteFor', { name: clientName })}
          </Button>
        }
      />
    )
  }

  return (
    <ul aria-label={t('quotes.listLabel', { name: clientName })} className="-mx-3 divide-y divide-divider rounded-panel bg-plate shadow-plate">
      {quotes.map((q) => (
        <li key={q.id}>
          <Link
            to={`/cotizaciones/${q.id}`}
            className="flex min-h-14 items-center gap-3 rounded-sm px-3 py-2 transition-colors duration-100 hover:bg-hover focus-visible:outline-offset-[-2px]"
          >
            <RowTitle
              className="flex-1"
              media={<QuoteThumb item={q.firstItem} catalog={catalog} size={40} />}
              title={q.title || t('quotes.untitled')}
              subtitle={[fmt.docNumber(q.number), q.units ? t('quotes.windows', { count: q.units }) : null, fmt.relative(q.updatedAt)].filter(Boolean).join(' · ')}
            />
            <StatusPill status={q.status} suffix={q.status === 'rejected' ? q.lostReason : undefined} size="sm" className="max-sm:hidden" />
            <Numeric className="w-28 shrink-0 text-right font-medium text-fg-strong max-sm:w-auto">{fmt.money(q.total)}</Numeric>
          </Link>
        </li>
      ))}
    </ul>
  )
}
