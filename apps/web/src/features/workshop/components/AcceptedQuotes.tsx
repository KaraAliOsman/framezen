import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ArrowRight, Factory } from 'lucide-react'
import type { Catalog } from '@framezen/engine'
import type { QuoteSummary } from '@framezen/shared'
import { humanError } from '../../../lib/api'
import { Button, toast } from '../../../ui'
import { useCreateWorkOrder } from '../data'
import { DesignThumb } from './DesignThumb'

/**
 * Cotizaciones aceptadas que aún no pasan a taller: un clic y la OT queda armada.
 * `variant: 'empty'` = protagonista del estado vacío; `'strip'` = aviso sobre la lista.
 */
export function AcceptedQuotes({
  quotes,
  catalog,
  variant = 'strip',
  readOnly,
}: {
  quotes: QuoteSummary[]
  catalog?: Catalog
  variant?: 'strip' | 'empty'
  readOnly?: boolean
}) {
  const navigate = useNavigate()
  const create = useCreateWorkOrder()
  const [busy, setBusy] = useState<string | null>(null)
  if (quotes.length === 0) return null

  const start = async (quote: QuoteSummary) => {
    setBusy(quote.id)
    try {
      const order = await create.mutateAsync(quote.id)
      toast.success(`OT N° ${order.number} lista: cortes, vidrios y materiales calculados`)
      navigate(`/taller/${order.id}`)
    } catch (error) {
      toast.error(humanError(error))
    } finally {
      setBusy(null)
    }
  }

  const shown = quotes.slice(0, variant === 'empty' ? 6 : 4)
  return (
    <section
      aria-label="Cotizaciones aceptadas listas para taller"
      className={variant === 'empty' ? 'w-full max-w-xl text-left' : 'rounded-lg border border-ink-100 bg-ink-50/50 p-1'}
    >
      {variant === 'strip' ? (
        <div className="flex items-center gap-2 px-3 pt-2 pb-1.5">
          <Factory aria-hidden strokeWidth={1.75} className="size-4 text-ink-700" />
          <h2 className="text-[13px] font-semibold text-paper-900">
            {quotes.length === 1 ? '1 cotización aceptada espera pasar a taller' : `${quotes.length} cotizaciones aceptadas esperan pasar a taller`}
          </h2>
        </div>
      ) : (
        <h2 className="mb-2 text-[13px] font-medium text-paper-600">Aceptadas y listas para fabricar</h2>
      )}
      <ul className="divide-y divide-paper-200 overflow-hidden rounded-md border border-paper-200 bg-paper-0">
        {shown.map((quote) => (
          <li key={quote.id} className="flex items-center gap-3 px-3 py-2.5">
            {quote.firstItem ? (
              <DesignThumb design={quote.firstItem.design} catalog={catalog} size={36} className="rounded-xs bg-paper-50" />
            ) : null}
            <div className="min-w-0 flex-1">
              <Link to={`/cotizaciones/${quote.id}`} className="block truncate font-medium text-paper-900 hover:text-ink-700">
                {quote.title || `Cotización N° ${quote.number}`}
              </Link>
              <div className="truncate text-[13px] text-paper-600 tabular">
                {[`N° ${quote.number}`, quote.clientName, `${quote.units} ${quote.units === 1 ? 'unidad' : 'unidades'}`].filter(Boolean).join(' · ')}
              </div>
            </div>
            <Button
              size="sm"
              variant={variant === 'empty' ? 'primary' : 'secondary'}
              iconRight={ArrowRight}
              loading={busy === quote.id}
              disabled={readOnly || (busy !== null && busy !== quote.id)}
              onClick={() => void start(quote)}
            >
              Pasar a taller
            </Button>
          </li>
        ))}
      </ul>
      {quotes.length > shown.length ? (
        <Link to="/cotizaciones" className="mt-2 inline-flex px-3 pb-1.5 text-[13px] font-medium text-ink-600 hover:text-ink-700">
          Ver las {quotes.length} aceptadas
        </Link>
      ) : null}
    </section>
  )
}
