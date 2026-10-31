/**
 * Inicio (SPEC §4): saludo, acciones rápidas, embudo con montos, vendido del mes frente al
 * anterior, seguimientos sugeridos, recientes con miniatura y actividad. Cuenta nueva: bienvenida
 * con la primera cotización a un clic. Sin gráficos de relleno.
 */
import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { humanError } from '../../lib/api'
import { useSession } from '../../lib/auth'
import { firstName } from '../../lib/format'
import { useCatalog, useCreateQuote, useQuotes } from '../../lib/hooks'
import { usePageTitle } from '../../lib/usePageTitle'
import { useShortcut } from '../../lib/useShortcut'
import { Button, EmptyState, Page, Skeleton, toast } from '../../ui'
import { usePendingActivity, useQuoteStats, useRecentActivity, useWonQuotes } from './api'
import { FollowUps } from './FollowUps'
import { HomeEmpty } from './HomeEmpty'
import { buildFunnel, greeting, isEmptyAccount, monthSales, todayLabel } from './homeModel'
import { ActivityFeed, Funnel, QuickActions, RecentQuotes, SoldThisMonth } from './sections'

export default function HomePage() {
  usePageTitle('Inicio')
  const me = useSession()
  const navigate = useNavigate()
  const createQuote = useCreateQuote()
  const stats = useQuoteStats()
  const empty = isEmptyAccount(stats.data)
  const now = useMemo(() => new Date(), [])

  const newQuote = () => {
    if (createQuote.isPending) return
    createQuote.mutate(
      {},
      {
        onSuccess: (quote) => navigate(`/cotizaciones/${quote.id}`),
        onError: (error) => toast.error(humanError(error)),
      },
    )
  }
  useShortcut('c', newQuote)

  const funnel = buildFunnel(stats.data)
  const openOrders = stats.data?.byStatus.workshop.count ?? 0

  return (
    <Page width="wide">
      <header className="flex flex-col gap-5 pb-6">
        <div>
          <p className="text-[13px] text-paper-600 first-letter:uppercase">
            {todayLabel(now)} · {me.org.name}
          </p>
          <h1 className="mt-1 text-h2 font-semibold tracking-[-0.015em] text-paper-900 sm:text-h1">
            {greeting(now)}, {firstName(me.user.name)}
          </h1>
        </div>
        <QuickActions onNewQuote={newQuote} creating={createQuote.isPending} openOrders={openOrders} />
      </header>

      {stats.isPending ? (
        <HomeSkeleton />
      ) : stats.isError && !stats.data ? (
        // Sin datos no mostramos ceros ni «Todo al día»: decimos qué pasó y ofrecemos reintentar.
        <div className="rounded-lg border border-paper-200 bg-paper-0">
          <EmptyState
            sketch="fixed"
            size="compact"
            title="No pudimos cargar tu resumen"
            description={humanError(stats.error)}
            action={<Button onClick={() => void stats.refetch()}>Reintentar</Button>}
          />
        </div>
      ) : empty ? (
        <HomeEmpty onNewQuote={newQuote} creating={createQuote.isPending} />
      ) : (
        <Dashboard funnel={funnel} stats={stats.data} statsLoading={stats.isPending} now={now} />
      )}
    </Page>
  )
}

function Dashboard({
  funnel,
  stats,
  statsLoading,
  now,
}: {
  funnel: ReturnType<typeof buildFunnel>
  stats: ReturnType<typeof useQuoteStats>['data']
  statsLoading: boolean
  now: Date
}) {
  const won = useWonQuotes()
  const recent = useQuotes({})
  const catalog = useCatalog()
  const pending = usePendingActivity()
  const activity = useRecentActivity()
  const sales = monthSales(won.data ?? [], now, stats?.soldThisMonth)

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
      <div className="min-w-0 lg:col-span-8">
        <Funnel stages={funnel} loading={statsLoading} />
      </div>
      <div className="min-w-0 lg:col-span-4">
        <SoldThisMonth sales={sales} loading={won.isPending && !stats} />
      </div>
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-8 lg:gap-5">
        <RecentQuotes quotes={(recent.data ?? []).slice(0, 6)} catalog={catalog.data} loading={recent.isPending} />
      </div>
      <div className="flex min-w-0 flex-col gap-4 lg:col-span-4 lg:gap-5">
        <FollowUps followUps={stats?.followUps ?? []} pending={pending.data ?? []} loading={pending.isPending} />
        <ActivityFeed events={(activity.data ?? []).slice(0, 6)} loading={activity.isPending} />
      </div>
    </div>
  )
}

function HomeSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5" aria-busy="true" aria-label="Cargando">
      <Skeleton className="h-[132px] lg:col-span-8" />
      <Skeleton className="h-[132px] lg:col-span-4" />
      <Skeleton className="h-72 lg:col-span-8" />
      <Skeleton className="h-72 lg:col-span-4" />
    </div>
  )
}
