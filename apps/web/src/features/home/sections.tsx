/** Bloques de Inicio: acciones rápidas, embudo, vendido del mes, recientes y actividad. */
import { Link } from 'react-router'
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronRight, Factory, FilePlus2, UserPlus, type LucideIcon } from 'lucide-react'
import type { Catalog } from '@framezen/engine'
import type { QuoteSummary } from '@framezen/shared'
import { cn } from '../../lib/cn'
import { formatCLP, formatNumber, formatRelative } from '../../lib/format'
import { Kbd, QUOTE_STATUS_COPY, Skeleton, StatusPill } from '../../ui'
import type { ActivityItem } from './api'
import { activityTone, monthName, type FunnelStage, type MonthSales } from './homeModel'
import { QuoteThumb } from './QuoteThumb'

// ── Acciones rápidas ─────────────────────────────────────────────────────────

interface QuickAction {
  label: string
  hint: string
  icon: LucideIcon
  to?: string
  onClick?: () => void
  shortcut?: string
  primary?: boolean
  busy?: boolean
}

export function QuickActions({ onNewQuote, creating, openOrders }: { onNewQuote: () => void; creating: boolean; openOrders: number }) {
  const actions: QuickAction[] = [
    { label: 'Nueva cotización', hint: 'Elige una ventana y escribe la medida', icon: FilePlus2, onClick: onNewQuote, shortcut: 'c', primary: true, busy: creating },
    { label: 'Nuevo cliente', hint: 'Guárdalo para tus próximas obras', icon: UserPlus, to: '/clientes?nuevo=1' },
    {
      label: 'Ir a taller',
      hint: openOrders ? `${formatNumber(openOrders)} ${openOrders === 1 ? 'obra' : 'obras'} en fabricación` : 'Órdenes de trabajo y cortes',
      icon: Factory,
      to: '/taller',
    },
  ]
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      {actions.map((a) => {
        const Icon = a.icon
        const inner = (
          <>
            <span
              className={cn(
                'inline-flex size-9 shrink-0 items-center justify-center rounded-sm transition-colors duration-120',
                a.primary ? 'bg-paper-0/15 text-paper-0' : 'bg-paper-100 text-paper-900 group-hover:bg-paper-200/70',
              )}
            >
              <Icon aria-hidden strokeWidth={1.75} className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1 max-sm:text-center">
              <span className="block text-[13px] leading-[18px] font-medium sm:text-base sm:leading-5">{a.label}</span>
              <span className={cn('block text-[13px] leading-[18px] text-pretty max-xl:hidden', a.primary ? 'text-paper-0/75' : 'text-paper-600')}>{a.hint}</span>
            </span>
            {a.shortcut ? (
              <span className="max-lg:hidden">
                <Kbd combo={a.shortcut} tone={a.primary ? 'inverse' : 'default'} />
              </span>
            ) : null}
          </>
        )
        const cls = cn(
          'group flex min-h-[64px] items-center gap-3 rounded-md border px-3 py-3 text-left transition-[background-color,border-color,transform] duration-120 ease-out active:scale-[0.985] max-sm:flex-col max-sm:justify-center max-sm:gap-2 max-sm:px-2 sm:px-4',
          a.primary
            ? 'border-transparent bg-ink-600 text-paper-0 hover:bg-ink-700 dark:text-paper-50'
            : 'border-paper-200 bg-paper-0 text-paper-900 hover:border-paper-350/60 hover:bg-paper-50',
          a.busy && 'opacity-80',
        )
        return a.to ? (
          <Link key={a.label} to={a.to} className={cls}>
            {inner}
          </Link>
        ) : (
          <button key={a.label} type="button" onClick={a.onClick} disabled={a.busy} aria-busy={a.busy || undefined} className={cls}>
            {inner}
          </button>
        )
      })}
    </div>
  )
}

// ── Embudo ───────────────────────────────────────────────────────────────────

export function Funnel({ stages, loading }: { stages: FunnelStage[]; loading?: boolean }) {
  const open = stages.reduce((acc, s) => acc + (s.status === 'workshop' ? 0 : s.total), 0)
  return (
    <section aria-labelledby="home-funnel" className="overflow-hidden rounded-lg border border-paper-200 bg-paper-0">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-paper-200 px-5 py-3.5">
        <h2 id="home-funnel" className="font-semibold text-paper-900">
          Tus cotizaciones
        </h2>
        <p className="text-[13px] text-paper-600">
          En juego <span className="font-medium text-paper-900 tabular">{formatCLP(open)}</span> con IVA
        </p>
      </header>
      <ol className="grid grid-cols-2 lg:grid-cols-4">
        {stages.map((stage, i) => {
          const dot = QUOTE_STATUS_COPY[stage.status].dot
          return (
            <li
              key={stage.status}
              className={cn(
                'relative border-paper-200',
                i % 2 === 1 && 'border-l',
                i >= 2 && 'max-lg:border-t',
                i > 0 && 'lg:border-l',
              )}
            >
              <Link
                to={stage.to}
                className="group grid h-full grid-rows-[auto_auto_1fr] gap-1 px-4 py-4 transition-colors duration-120 hover:bg-paper-50 focus-visible:outline-offset-[-2px] xl:px-5"
              >
                <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium whitespace-nowrap text-paper-600 group-hover:text-paper-900">
                  <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', dot)} />
                  {stage.label}
                  <ArrowRight
                    aria-hidden
                    strokeWidth={1.75}
                    className="size-3.5 shrink-0 -translate-x-1 opacity-0 transition-[opacity,transform] duration-160 group-hover:translate-x-0 group-hover:opacity-100 max-xl:hidden"
                  />
                </span>
                {loading ? (
                  <Skeleton className="mt-1 h-8 w-16" />
                ) : (
                  <span className="text-h1 font-semibold tracking-[-0.02em] text-paper-900 tabular">{formatNumber(stage.count)}</span>
                )}
                <span className="text-[13px] leading-[18px] text-paper-600 tabular">
                  {loading ? <Skeleton className="h-3.5 w-24" /> : stage.total > 0 ? formatCLP(stage.total) : stage.hint}
                </span>
              </Link>
              {i < stages.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-1/2 -right-[9px] z-10 hidden size-[18px] -translate-y-1/2 items-center justify-center rounded-full border border-paper-200 bg-paper-0 text-paper-350 lg:inline-flex',
                  )}
                >
                  <ChevronRight strokeWidth={2} className="size-3" />
                </span>
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// ── Vendido del mes ──────────────────────────────────────────────────────────

export function SoldThisMonth({ sales, loading }: { sales: MonthSales; loading?: boolean }) {
  const { thisMonth, lastMonth, delta } = sales
  const up = delta !== null && delta >= 0
  return (
    <section aria-labelledby="home-sold" className="flex h-full flex-col rounded-lg border border-paper-200 bg-paper-0 p-5">
      <h2 id="home-sold" className="text-[13px] font-medium text-paper-600">
        Vendido en {monthName(thisMonth.key)}
      </h2>
      {loading ? (
        <Skeleton className="mt-2 h-9 w-40" />
      ) : (
        <p className="mt-1 text-h1 font-semibold tracking-[-0.02em] text-paper-900 tabular">{formatCLP(thisMonth.total)}</p>
      )}
      <p className="mt-0.5 text-[13px] text-paper-600">
        {thisMonth.count === 0
          ? 'Las cotizaciones aceptadas aparecen aquí.'
          : `${formatNumber(thisMonth.count)} ${thisMonth.count === 1 ? 'cotización aceptada' : 'cotizaciones aceptadas'} · IVA incluido`}
      </p>
      <div className="mt-auto pt-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-paper-200 pt-3 text-[13px]">
          {delta !== null ? (
            <span className={cn('inline-flex items-center gap-0.5 font-medium tabular', up ? 'text-ok-600' : 'text-bad-600')}>
              {up ? <ArrowUpRight aria-hidden className="size-3.5" /> : <ArrowDownRight aria-hidden className="size-3.5" />}
              {`${up ? '+' : '−'}${formatNumber(Math.abs(delta), 0)} %`}
            </span>
          ) : null}
          <span className="text-paper-600">
            {lastMonth.total > 0 ? (
              <>
                vs {monthName(lastMonth.key)}: <span className="text-paper-900 tabular">{formatCLP(lastMonth.total)}</span>
              </>
            ) : (
              `En ${monthName(lastMonth.key)} no hubo ventas registradas`
            )}
          </span>
        </div>
      </div>
    </section>
  )
}

// ── Recientes ────────────────────────────────────────────────────────────────

export function RecentQuotes({ quotes, catalog, loading }: { quotes: QuoteSummary[]; catalog?: Catalog | null; loading?: boolean }) {
  return (
    <section aria-labelledby="home-recent" className="overflow-hidden rounded-lg border border-paper-200 bg-paper-0">
      <header className="flex items-center justify-between gap-4 border-b border-paper-200 px-5 py-3.5">
        <h2 id="home-recent" className="font-semibold text-paper-900">
          Recientes
        </h2>
        <Link to="/cotizaciones" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-600 hover:text-ink-700">
          Ver todas
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </header>
      {loading ? (
        <div className="divide-y divide-paper-200">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <Skeleton className="size-[60px]" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-paper-200">
          {quotes.map((q) => (
            <li key={q.id}>
              <Link
                to={`/cotizaciones/${q.id}`}
                className="group flex items-center gap-4 px-5 py-3 transition-colors duration-120 hover:bg-paper-50 focus-visible:outline-offset-[-2px] max-sm:gap-3 max-sm:px-4"
              >
                <QuoteThumb item={q.firstItem} catalog={catalog} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 break-words">
                    <span className="mr-2 text-[13px] text-paper-600 tabular">N° {q.number}</span>
                    <span className="font-medium text-paper-900">{q.title || 'Sin título'}</span>
                  </p>
                  <p className="mt-0.5 flex min-w-0 text-[13px] text-paper-600">
                    <span className="truncate">{q.clientName ?? 'Sin cliente'}</span>
                    {q.units ? <span className="shrink-0 whitespace-pre">{` · ${formatNumber(q.units)} ${q.units === 1 ? 'ventana' : 'ventanas'}`}</span> : null}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-medium whitespace-nowrap text-paper-900 tabular">{formatCLP(q.total)}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-meta whitespace-nowrap text-paper-600 max-xl:hidden">{formatRelative(q.updatedAt)}</span>
                    <StatusPill status={q.status} />
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ── Actividad ────────────────────────────────────────────────────────────────

const TONE_DOT = { ok: 'bg-ok-600', ink: 'bg-ink-600', warn: 'bg-warn-600', neutral: 'bg-paper-350' }

export function ActivityFeed({ events, loading }: { events: ActivityItem[]; loading?: boolean }) {
  return (
    <section aria-labelledby="home-activity" className="rounded-lg border border-paper-200 bg-paper-0">
      <header className="border-b border-paper-200 px-5 py-3.5">
        <h2 id="home-activity" className="font-semibold text-paper-900">
          Actividad
        </h2>
      </header>
      {loading ? (
        <div className="space-y-3 px-5 py-4">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
      ) : events.length === 0 ? (
        <p className="px-5 py-5 text-[13px] text-paper-600">Aquí verás lo que pasa en tu cuenta: envíos, aperturas del cliente, aceptaciones.</p>
      ) : (
        <ol className="relative px-5 py-3">
          {events.map((e, i) => {
            const body = (
              <>
                <span className="relative flex w-3 shrink-0 justify-center self-stretch">
                  <span aria-hidden className={cn('relative z-10 mt-[7px] size-1.5 rounded-full ring-4 ring-paper-0', TONE_DOT[activityTone(e.kind)])} />
                  {i < events.length - 1 ? <span aria-hidden className="absolute top-3 -bottom-3 w-px bg-paper-200" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] leading-[19px] text-paper-900">{e.text}</span>
                  <span className="block text-meta text-paper-600">{formatRelative(e.at)}</span>
                </span>
              </>
            )
            return (
              <li key={e.id}>
                {e.link ? (
                  <Link to={e.link} className="-mx-2 flex gap-3 rounded-sm px-2 py-1.5 hover:bg-paper-50">
                    {body}
                  </Link>
                ) : (
                  <div className="flex gap-3 py-1.5">{body}</div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
