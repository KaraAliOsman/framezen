/**
 * /cotizaciones/:id/cortes: los cortes de una cotización que todavía no tiene OT. Es la misma vista de
 * la OT, calculada al vuelo con el motor: no crea nada. Si ya hay OT, lleva a los cortes de la OT.
 */
import { useMemo, useState } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { buildWorkshopDocInput, canSeeWorkshopCosts, quoteWorkshopFileName } from '@dekopen/documents'
import type { CutSettings } from '@dekopen/engine'
import type { Paged, Quote, WorkOrder } from '@dekopen/shared'
import { ApiRequestError, humanError, request, toItems } from '../../lib/api'
import { useSession } from '../../lib/auth'
import { useCatalog, useQuote, useSettings } from '../../lib/hooks'
import { useFormat, useT } from '../../lib/i18n'
import { usePlan } from '../../lib/plan'
import { qk } from '../../lib/queryClient'
import { usePageTitle } from '../../lib/usePageTitle'
import { buttonClass, EmptyState, Page, PageHeader, Skeleton } from '../../ui'
import { quoteCutsPdfUrl } from './data'
import type { WindowMeta } from './detail/CutBars'
import { CutsTab } from './detail/CutsTab'
import { useCutSimulation } from './detail/useCutSimulation'
import { useDocumentActions, type DocumentSource } from './detail/useDocumentActions'
import es from './i18n/es'

/** Enlace a los cortes de una cotización: los de su OT si la tiene. */
export function quoteCutsPath(quoteId: string, order?: { id: string } | null): string {
  return order ? `/taller/${order.id}?pestana=cortes` : `/cotizaciones/${quoteId}/cortes`
}

export default function QuoteCutsPage() {
  const t = useT(es)
  const fmt = useFormat()
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const quote = useQuote(id)
  const orders = useQuery({
    queryKey: [...qk.workOrders, { quoteId: id }],
    queryFn: () => request<WorkOrder[] | Paged<WorkOrder>>('/work-orders', { query: { quoteId: id, limit: 1 } }).then(toItems),
    enabled: Boolean(id),
    staleTime: 60_000,
  })
  usePageTitle(quote.data ? t('quoteCuts.title', { number: fmt.docNumber(quote.data.number) }) : t('quoteCuts.fallback'))

  const order = orders.data?.find((o) => o.quoteId === id)
  if (order) {
    const parts = params.get('parts')
    return <Navigate to={`${quoteCutsPath(id, order)}${parts ? `&parts=${encodeURIComponent(parts)}` : ''}`} replace />
  }
  if (quote.isPending || orders.isPending) return <Loading />
  if (quote.isError || !quote.data) {
    const missing = !quote.error || (quote.error instanceof ApiRequestError && quote.error.status === 404)
    return (
      <Page width="wide">
        <PageHeader breadcrumbs={[{ label: t('quoteCuts.crumb'), to: '/cotizaciones' }]} title={t('quoteCuts.fallback')} />
        <EmptyState
          title={missing ? t('quoteCuts.notFound') : t('page.error')}
          description={quote.error ? humanError(quote.error) : undefined}
          action={
            <Link to="/cotizaciones" className={buttonClass('secondary')}>
              {t('quoteCuts.back')}
            </Link>
          }
        />
      </Page>
    )
  }
  return <QuoteCuts quote={quote.data} />
}

function Loading() {
  return (
    <Page width="wide" aria-busy="true">
      <div className="flex flex-col gap-3 pb-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-9 w-64" />
      </div>
      <Skeleton className="h-96 w-full" />
    </Page>
  )
}

function QuoteCuts({ quote }: { quote: Quote }) {
  const t = useT(es)
  const fmt = useFormat()
  const me = useSession()
  const plan = usePlan()
  const catalog = useCatalog()
  const settings = useSettings()
  const [sim, setSim] = useState<Partial<CutSettings>>({})

  const features = plan?.features ?? me.billing.features ?? []
  const seeCosts = canSeeWorkshopCosts({ role: me.role, features })
  const featureKey = features.join(',')

  const input = useMemo(() => {
    if (!catalog.data || !settings.data) return null
    return buildWorkshopDocInput({
      quote,
      org: me.org,
      catalog: catalog.data,
      settings: settings.data,
      workOrder: { number: quote.number, fromQuote: true, ...(quote.client?.name ? { clientName: quote.client.name } : {}) },
      cut: sim,
      redactCosts: !seeCosts,
    })
    // `featureKey` estabiliza `seeCosts` frente a arreglos nuevos del plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote, catalog.data, settings.data, me.org, sim, seeCosts, featureKey])

  const simulation = useCutSimulation({ sim, setSim, settings: settings.data, input, readOnly: plan?.readOnly ?? false })
  const source = useMemo<DocumentSource>(
    () => ({ url: (kind, params) => quoteCutsPdfUrl(quote.id, kind, params), fileName: (kind, ext) => quoteWorkshopFileName(kind, quote.number, ext) }),
    [quote.id, quote.number],
  )
  const actions = useDocumentActions({ orderId: quote.id, orderNumber: quote.number, simulated: Object.keys(sim).length > 0, source })

  const windows = useMemo(() => {
    const map = new Map<string, WindowMeta>()
    input?.data.windows.forEach((w) => map.set(w.ref, { ref: w.ref, name: w.name || w.description.split(' · ')[0] }))
    return map
  }, [input])

  const number = fmt.docNumber(quote.number)
  return (
    <Page width="wide">
      <PageHeader
        breadcrumbs={[
          { label: t('quoteCuts.crumb'), to: '/cotizaciones' },
          { label: t('common.quoteNumber', { number }), to: `/cotizaciones/${quote.id}` },
        ]}
        title={t('quoteCuts.title', { number })}
        description={[quote.title, quote.client?.name].filter(Boolean).join(' · ')}
      />
      {input && simulation ? (
        <CutsTab orderId={`cotizacion-${quote.id}`} data={input.data} paper={input.paper} catalog={catalog.data} windows={windows} simulation={simulation} actions={actions} />
      ) : (
        <Skeleton className="h-96 w-full" />
      )}
    </Page>
  )
}
