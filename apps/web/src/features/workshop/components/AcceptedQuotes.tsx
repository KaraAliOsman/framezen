import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRight } from 'lucide-react'
import type { Catalog } from '@dekopen/engine'
import type { QuoteSummary } from '@dekopen/shared'
import { humanError } from '../../../lib/api'
import { cn } from '../../../lib/cn'
import { useFormat, useT } from '../../../lib/i18n'
import { Button, Numeric, toast } from '../../../ui'
import { useCreateWorkOrder } from '../data'
import es from '../i18n/es'
import { useOrderLabel } from './bits'
import { DesignThumb } from './DesignThumb'

/**
 * Cotizaciones aceptadas que aún no pasan a taller: un clic y la OT queda armada.
 * `variant: 'empty'` = protagonista del estado vacío; `'list'` = pestaña «Por pasar a taller».
 */
export function AcceptedQuotes({
  quotes,
  catalog,
  variant = 'list',
  readOnly,
}: {
  quotes: QuoteSummary[]
  catalog?: Catalog
  variant?: 'list' | 'empty'
  readOnly?: boolean
}) {
  const t = useT(es)
  const fmt = useFormat()
  const orderLabel = useOrderLabel()
  const navigate = useNavigate()
  const create = useCreateWorkOrder()
  const [busy, setBusy] = useState<string | null>(null)
  if (quotes.length === 0) return null

  const start = async (quote: QuoteSummary) => {
    setBusy(quote.id)
    try {
      const order = await create.mutateAsync(quote.id)
      toast.success(t('accepted.started', { order: orderLabel(order.number) }))
      navigate(`/taller/${order.id}`)
    } catch (error) {
      toast.error(humanError(error))
    } finally {
      setBusy(null)
    }
  }

  const empty = variant === 'empty'
  const shown = empty ? quotes.slice(0, 6) : quotes
  return (
    <section aria-label={t('accepted.label')} className={cn(empty ? 'w-full max-w-xl text-left' : 'min-w-0')}>
      {empty ? <h2 className="mb-2 text-table font-medium text-fg-muted">{t('accepted.emptyTitle')}</h2> : null}
      <ul className="-mx-3 divide-y divide-divider rounded-panel bg-plate px-3 shadow-plate">
        {shown.map((quote, index) => (
          <li key={quote.id} className="flex min-h-14 items-center gap-3 py-2">
            <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm bg-sunken">
              {quote.firstItem ? <DesignThumb design={quote.firstItem.design} catalog={catalog} size={32} /> : null}
            </span>
            <div className="min-w-0 flex-1">
              <Link to={`/cotizaciones/${quote.id}`} className="block truncate font-medium text-fg-strong hover:underline">
                {quote.title || t('common.quoteNumber', { number: fmt.docNumber(quote.number) })}
              </Link>
              <div className="truncate text-table text-fg-muted">
                <span className="code-id">{fmt.docNumber(quote.number)}</span>
                {[quote.clientName, t('common.units', { count: quote.units })].filter(Boolean).map((part) => (
                  <span key={part}> · {part}</span>
                ))}
              </div>
            </div>
            {!empty && quote.total ? <Numeric className="hidden shrink-0 font-medium text-fg-strong sm:inline">{fmt.money(quote.total)}</Numeric> : null}
            <Button
              size="sm"
              variant={index === 0 ? 'primary' : 'secondary'}
              iconRight={ArrowRight}
              loading={busy === quote.id}
              disabled={readOnly || (busy !== null && busy !== quote.id)}
              onClick={() => void start(quote)}
            >
              {t('accepted.start')}
            </Button>
          </li>
        ))}
      </ul>
      {quotes.length > shown.length ? (
        <Link to="/cotizaciones" className="mt-2 inline-flex text-table font-medium text-accent hover:underline">
          {t('accepted.seeAll', { count: quotes.length })}
        </Link>
      ) : null}
    </section>
  )
}
