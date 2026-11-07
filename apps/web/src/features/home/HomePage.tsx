/**
 * Inicio: contesta «¿qué hago ahora?». Arriba la primera tarea con su mensaje entero y su acción como
 * primaria de la pantalla; debajo el resto de la cola y lo reciente; al lado, las cifras del mes.
 * Sin gráficos de relleno ni cifras inventadas: todo sale de la API. Cuenta nueva: la primera
 * cotización a un clic.
 */
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { FilePlus2, UserPlus } from 'lucide-react'
import { humanError } from '../../lib/api'
import { useSession } from '../../lib/auth'
import { firstName } from '../../lib/format'
import { useCatalog, useCreateQuote, useQuotes } from '../../lib/hooks'
import { useLocale, useT } from '../../lib/i18n'
import { usePageTitle } from '../../lib/usePageTitle'
import { useShortcut } from '../../lib/useShortcut'
import { Button, buttonClass, EmptyState, Page, Skeleton, SkeletonRows, toast } from '../../ui'
import { useQuoteStats } from './api'
import { FollowUps, NowBlock } from './FollowUps'
import { HomeEmpty } from './HomeEmpty'
import es from './i18n/es'
import { buildQueue, greetingKey, isEmptyAccount, todayLabel, type QuoteStats } from './homeModel'
import { CatalogNotice, RecentQuotes, SummaryStrip } from './sections'

export default function HomePage() {
  const t = useT(es)
  const { locale } = useLocale()
  usePageTitle(t('title'))
  const me = useSession()
  const navigate = useNavigate()
  const createQuote = useCreateQuote()
  const stats = useQuoteStats()
  const empty = isEmptyAccount(stats.data)
  const now = useMemo(() => new Date(), [])
  const queue = useMemo(() => buildQueue(stats.data?.followUps ?? []), [stats.data?.followUps])
  // Una sola primaria por vista: si hay una tarea, su acción manda y «Nueva cotización» baja a secundaria.
  const hasTask = queue.length > 0

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

  const greetingText = t('greeting.withName', { greeting: t(`greeting.${greetingKey(now)}`), name: firstName(me.user.name) })
  const dayLine = `${todayLabel(now, undefined, locale)} · ${me.org.name}`

  return (
    <Page width="default" className="@container">
      <header className="flex items-center justify-between gap-3 pb-8">
        <p className="min-w-0 truncate text-table text-fg-muted">
          <span className="font-medium text-fg">{greetingText}</span>
          <span className="max-sm:hidden"> · {dayLine}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Link to="/clientes?nuevo=1" className={buttonClass('ghost', 'md', empty ? undefined : 'max-sm:hidden')}>
            <UserPlus aria-hidden strokeWidth={1.75} />
            {t('actions.newClient')}
          </Link>
          {empty ? null : (
            <Button variant={hasTask ? 'secondary' : 'primary'} icon={FilePlus2} shortcut="c" onClick={newQuote} loading={createQuote.isPending}>
              {t('actions.newQuote')}
            </Button>
          )}
        </div>
      </header>

      {stats.isPending ? (
        <HomeSkeleton />
      ) : stats.isError && !stats.data ? (
        // Sin datos no mostramos ceros ni «Todo al día»: decimos qué pasó y ofrecemos reintentar.
        <EmptyState
          size="compact"
          title={t('error.title')}
          description={humanError(stats.error)}
          action={<Button onClick={() => void stats.refetch()}>{t('error.retry')}</Button>}
        />
      ) : empty ? (
        <HomeEmpty onNewQuote={newQuote} creating={createQuote.isPending} />
      ) : (
        <Dashboard stats={stats.data} queue={queue} now={now} />
      )}
    </Page>
  )
}

function Dashboard({ stats, queue, now }: { stats: QuoteStats; queue: QuoteStats['followUps']; now: Date }) {
  const t = useT(es)
  const recent = useQuotes({})
  const catalog = useCatalog()
  const [first, ...rest] = queue
  const quotes = recent.data ?? []
  return (
    // En el teléfono el orden es tarea, cifras y el resto; en escritorio las cifras van al lado, fijas.
    <div className="grid grid-cols-1 gap-x-16 gap-y-10 @4xl:grid-cols-[minmax(0,1fr)_216px] @4xl:grid-rows-[auto_1fr] @4xl:gap-y-0">
      <div className="min-w-0">
        {first ? (
          <NowBlock quote={first} catalog={catalog.data} />
        ) : (
          <section aria-labelledby="home-now">
            <h1 id="home-now" className="text-h2 font-medium text-fg-strong sm:text-h1">
              {t('now.clear')}
            </h1>
            <p className="mt-1 max-w-xl text-fg-muted">{t('now.clearText')}</p>
          </section>
        )}
        <CatalogNotice catalog={catalog.data} quotes={quotes} />
      </div>
      <div className="@4xl:col-start-2 @4xl:row-span-2 @4xl:row-start-1">
        <SummaryStrip stats={stats} count={queue.length} now={now} />
      </div>
      <div className="min-w-0 @4xl:mt-10">
        <FollowUps queue={rest} catalog={catalog.data} />
        <RecentQuotes quotes={quotes.slice(0, 6)} catalog={catalog.data} loading={recent.isPending} />
      </div>
    </div>
  )
}

function HomeSkeleton() {
  const t = useT(es)
  return (
    <div className="grid grid-cols-1 gap-x-16 gap-y-10 @4xl:grid-cols-[minmax(0,1fr)_216px]" aria-busy="true" aria-label={t('loading')}>
      <div className="min-w-0">
        <div className="flex gap-5">
          <Skeleton className="size-24 max-sm:hidden" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-9 w-64" />
          </div>
        </div>
        <div className="mt-10">
          <SkeletonRows rows={4} columns={3} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6 @lg:grid-cols-4 @4xl:grid-cols-1">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
