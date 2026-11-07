/**
 * Optimización de cortes interactiva: cada barra dibujada a escala por perfil y color, las piezas en
 * tinta, la medida grande en cifras tabulares y «V3 · arr» debajo; despuntes y sobrante, en tono de
 * hoja. Toca una pieza para ver su detalle y resaltar su ventana; toca la casilla para marcarla cortada.
 * Con «Letra grande» se lee a un metro en la tablet junto a la sierra.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import type { Bar, Catalog, CutSettings, OptimizationGroup } from '@dekopen/engine'
import { groupSaw, groupWeld, workshopSideWords, type BarPieceId } from '@dekopen/documents'
import { cn } from '../../../lib/cn'
import { T, useFormat, useT } from '../../../lib/i18n'
import { Button } from '../../../ui'
import es from '../i18n/es'
import { BAR_METRICS, piecePolygon, placeBar, sideOf, type BarMetrics, type PiecePlacement } from '../model/cutLayout'

/** Barras por perfil que se dibujan de entrada (y en cada «Ver más»). */
export const CUT_BARS_PAGE = 40

export interface WindowMeta {
  ref: string
  name?: string
}

interface HoverState {
  key: string
  piece: PiecePlacement
}

/** Medida de taller en el idioma: «1.234,5» (es), «1,234.5» (en). */
function useMeasure(): (value: number) => string {
  const fmt = useFormat()
  return useCallback((value: number) => fmt.number(Math.round(value * 10) / 10, { maxDecimals: 1 }), [fmt])
}

export function CutGroup({
  group,
  catalog,
  cut,
  windows,
  focusRef,
  onFocusRef,
  isCut,
  onToggleCut,
  barKeyOf,
  ids,
  large = false,
}: {
  ids?: (BarPieceId | undefined)[][]
  group: OptimizationGroup
  catalog?: Catalog
  cut: CutSettings
  windows: ReadonlyMap<string, WindowMeta>
  focusRef: string | null
  onFocusRef: (ref: string | null) => void
  isCut: (key: string) => boolean
  onToggleCut: (key: string) => void
  barKeyOf: (group: OptimizationGroup, index: number, bar: Bar) => string
  large?: boolean
}) {
  const t = useT(es)
  const fmt = useFormat()
  const metrics = large ? BAR_METRICS.large : BAR_METRICS.normal
  const color = group.colorId ? catalog?.colors.find((c) => c.id === group.colorId) : undefined
  const frame = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const cutCount = group.bars.filter((bar, i) => isCut(barKeyOf(group, i, bar))).length
  // Con cientos de unidades un perfil tiene miles de barras: se dibujan de a tandas.
  const [limit, setLimit] = useState(CUT_BARS_PAGE)
  const bars = group.bars.length > limit ? group.bars.slice(0, limit) : group.bars
  const rest = group.bars.length - bars.length
  const checkCol = large ? 'grid-cols-[44px_minmax(0,1fr)]' : 'grid-cols-[24px_minmax(0,1fr)] touch:grid-cols-[44px_minmax(0,1fr)]'
  const saw = groupSaw(group, cut)
  const weld = groupWeld(catalog, group)

  return (
    <section aria-label={`${group.code} ${group.name}`}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pb-2">
        <div className="flex w-full min-w-0 items-center gap-2.5 sm:w-auto sm:flex-1">
          {color ? (
            <span aria-hidden className="size-4 shrink-0 rounded-xs border border-divider-strong" style={{ background: color.hex }} title={color.name} />
          ) : (
            <span aria-hidden className="size-4 shrink-0 rounded-xs border border-dashed border-control" title={t('bars.noColor')} />
          )}
          <h3 className="min-w-0 truncate text-lead font-medium text-fg-strong">
            <span className="code-id mr-2 font-normal text-fg-muted">{group.code}</span>
            {group.name}
            {color ? <span className="font-normal text-fg-muted"> · {color.name}</span> : null}
          </h3>
        </div>
        <div className="flex items-center gap-3 text-table text-fg-muted tabular">
          <span>{t('bars.count', { count: group.barsNeeded })}</span>
          <span>{t('bars.pieces', { count: group.pieces })}</span>
          <span className="flex items-center gap-1.5">
            <span className="relative h-1 w-16 overflow-hidden rounded-full bg-hover" aria-hidden>
              <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${Math.min(100, group.yieldPct)}%` }} />
            </span>
            <span className="font-medium text-fg">{fmt.pct(group.yieldPct, 1)}</span>
          </span>
          {cutCount > 0 ? (
            <span className="inline-flex items-center gap-1 font-medium text-fg-strong">
              <Check aria-hidden strokeWidth={2} className="size-3.5" />
              {t('bars.cutOf', { cut: cutCount, total: group.bars.length })}
            </span>
          ) : null}
        </div>
        <p className="w-full text-table text-fg-muted tabular">
          {t('bars.saw', { kerf: fmt.number(saw.kerf, { maxDecimals: 1 }), start: fmt.number(saw.trimStart, { maxDecimals: 1 }), end: fmt.number(saw.trimEnd, { maxDecimals: 1 }) })}
          {weld !== null ? ` · ${t('bars.weld', { weld: fmt.number(weld, { maxDecimals: 1 }), total: fmt.number(weld * 2, { maxDecimals: 1 }) })}` : ''}
        </p>
      </header>
      {/* Regla invisible y estable para medir el ancho de las barras (las filas cambian al recalcular). */}
      <div aria-hidden className={cn('grid h-0 gap-3 overflow-hidden', checkCol)}>
        <span />
        <div ref={frame} />
      </div>
      <ol className={cn('flex flex-col', large ? 'gap-3' : 'gap-1')}>
        {bars.map((bar, i) => {
          const key = barKeyOf(group, i, bar)
          const done = isCut(key)
          return (
            <li key={key} className={cn('grid items-start gap-3', checkCol)}>
              <button
                type="button"
                onClick={() => onToggleCut(key)}
                aria-pressed={done}
                aria-label={done ? t('bars.marked', { n: i + 1 }) : t('bars.mark', { n: i + 1 })}
                className={cn(
                  'code-id inline-flex items-center justify-center rounded-xs border font-medium transition-colors duration-100 ease-out',
                  large ? 'mt-2 size-11 text-lead' : 'mt-2 size-6 text-table touch:size-11',
                  done ? 'border-accent bg-accent text-fg-on-accent' : 'border-control bg-surface text-fg-strong hover:border-accent',
                )}
              >
                {done ? <Check aria-hidden strokeWidth={2.5} className={large ? 'size-6' : 'size-3.5'} /> : i + 1}
              </button>
              <div className="min-w-0">
                {width > 0 ? (
                  <BarRow
                    bar={bar}
                    index={i + 1}
                    cut={cut}
                    width={width}
                    metrics={metrics}
                    windows={windows}
                    focusRef={focusRef}
                    onFocusRef={onFocusRef}
                    done={done}
                    ids={ids?.[i]}
                  />
                ) : (
                  <div style={{ height: metrics.barHeight + metrics.captionRow + 22 }} />
                )}
              </div>
            </li>
          )
        })}
      </ol>
      {rest > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-table text-fg-muted">
          <span className="tabular">{t('bars.range', { shown: fmt.number(bars.length), total: fmt.number(group.bars.length) })}</span>
          <Button size="sm" onClick={() => setLimit((n) => n + CUT_BARS_PAGE)}>
            {t('bars.more', { count: Math.min(rest, CUT_BARS_PAGE) })}
          </Button>
        </div>
      ) : null}
    </section>
  )
}

const BarRow = memo(function BarRow({
  bar,
  index,
  cut,
  width,
  metrics,
  windows,
  focusRef,
  onFocusRef,
  done,
  ids,
}: {
  ids?: (BarPieceId | undefined)[]
  bar: Bar
  index: number
  cut: CutSettings
  width: number
  metrics: BarMetrics
  windows: ReadonlyMap<string, WindowMeta>
  focusRef: string | null
  onFocusRef: (ref: string | null) => void
  done: boolean
}) {
  const t = useT(es)
  const fmt = useFormat()
  const measure = useMeasure()
  const placement = useMemo(() => placeBar(bar, cut, width, { metrics, format: measure, ids }), [bar, cut, width, metrics, measure, ids])
  const [hover, setHover] = useState<HoverState | null>(null)
  const H = metrics.barHeight
  const height = H + metrics.captionRow
  const reusable = placement.remainder?.reusable ?? false
  const pieces = bar.cuts.map((c) => `${measure(c.length)} ${c.label}`).join(', ')
  const ariaLabel = t(bar.fromOffcut ? 'bars.ariaOffcut' : 'bars.aria', {
    n: index,
    length: measure(bar.barLength),
    pieces,
    remainder: measure(bar.remainder),
  })

  return (
    <div className={cn('relative transition-opacity duration-180', done && 'opacity-45')}>
      <svg
        width={placement.width}
        height={height}
        viewBox={`0 0 ${placement.width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        className="block overflow-visible"
        onPointerLeave={() => setHover(null)}
      >
        {/* Toda la barra en tono de hoja: lo que no es pieza (despuntes, sobrante) se ve como lo que queda. */}
        <rect x={0} y={0} width={placement.width} height={H} rx={2} fill="var(--dk-hover)" />
        {placement.trimStart ? (
          <rect x={0} y={0} width={placement.trimStart.w} height={H} fill="var(--dk-pressed)">
            <title>{t('bars.trim')}</title>
          </rect>
        ) : null}
        {placement.trimEnd ? (
          <rect x={placement.trimEnd.x} y={0} width={placement.trimEnd.w} height={H} fill="var(--dk-pressed)">
            <title>{t('bars.trim')}</title>
          </rect>
        ) : null}
        {placement.remainder ? (
          <g>
            {placement.remainder.showText ? (
              <text
                x={placement.remainder.x + placement.remainder.w / 2}
                y={H / 2 + metrics.measureSmall * 0.36}
                textAnchor="middle"
                fontSize={metrics.measureSmall}
                fontWeight={500}
                fill="var(--dk-fg)"
                className="tabular"
              >
                {measure(placement.remainder.length)}
              </text>
            ) : null}
            {placement.remainder.showCaption ? (
              <text
                x={placement.remainder.x + placement.remainder.w / 2}
                y={H + metrics.label + 2}
                textAnchor="middle"
                fontSize={metrics.label}
                fill={reusable ? 'var(--dk-fg)' : 'var(--dk-fg-muted)'}
              >
                {reusable ? t('bars.keep') : t('bars.waste')}
              </text>
            ) : null}
          </g>
        ) : null}
        {placement.pieces.map((p) => {
          const dim = focusRef !== null && p.cut.ref !== focusRef
          const active = hover?.piece.n === p.n
          return (
            <g
              key={p.n}
              opacity={dim ? 0.22 : 1}
              className="cursor-pointer transition-opacity duration-140"
              onPointerEnter={() => setHover({ key: `${index}-${p.n}`, piece: p })}
              onClick={() => onFocusRef(focusRef === p.cut.ref ? null : (p.cut.ref ?? null))}
            >
              {/* El filo del color de la hoja separa dos piezas seguidas; la elegida se marca con el azul del dibujo. */}
              <polygon points={piecePolygon(p, 0, H)} fill={active ? 'var(--dk-select)' : 'var(--dk-accent)'} stroke="var(--dk-canvas)" strokeWidth={1.5} strokeLinejoin="round" />
              {p.measure && !p.measure.vertical ? (
                <text
                  x={p.x + p.w / 2}
                  y={H / 2 + p.measure.size * 0.36}
                  textAnchor="middle"
                  fontSize={p.measure.size}
                  fontWeight={500}
                  fill={active ? '#FFFFFF' : 'var(--dk-fg-on-accent)'}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {measure(p.cut.length)}
                </text>
              ) : null}
              {p.measure && p.measure.vertical ? (
                <text
                  transform={`translate(${p.x + p.w / 2 + p.measure.size * 0.36} ${H / 2}) rotate(-90)`}
                  textAnchor="middle"
                  fontSize={p.measure.size}
                  fontWeight={500}
                  fill={active ? '#FFFFFF' : 'var(--dk-fg-on-accent)'}
                >
                  {measure(p.cut.length)}
                </text>
              ) : null}
              {!p.measure && p.w >= 8 ? (
                <text x={p.x + p.w / 2} y={H / 2 + 4} textAnchor="middle" fontSize={10} fontWeight={500} fill={active ? '#FFFFFF' : 'var(--dk-fg-on-accent)'}>
                  {p.n}
                </text>
              ) : null}
              {p.caption ? (
                <text x={p.x + p.w / 2} y={H + metrics.label + 2} textAnchor="middle" fontSize={metrics.label} fill="var(--dk-fg)">
                  {p.caption}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>

      {hover ? <PieceCard hover={hover} width={placement.width} windows={windows} id={ids?.[hover.piece.n - 1]} /> : null}

      <div className={cn('mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-fg-muted tabular', metrics === BAR_METRICS.large ? 'text-table' : 'text-meta', done && 'line-through')}>
        <span>
          {[
            bar.fromOffcut ? t('bars.fromStock') : t('bars.barOf', { length: measure(bar.barLength) }),
            t('bars.used', { used: measure(bar.used) }),
            t('bars.kerf', { kerf: measure(bar.kerfLoss) }),
          ].join(' · ')}
        </span>
        <span>
          <T ns={es} k="bars.remainder" values={{ b: <strong className="font-medium text-fg-strong" />, value: measure(bar.remainder) }} />
          {reusable ? <span className="font-medium text-fg"> · {t('bars.keepShort')}</span> : null} · {fmt.pct(bar.yieldPct, 1)}
        </span>
      </div>
      {placement.hidden.length > 0 ? (
        <p className="mt-1 text-meta text-fg-muted">
          <span>{t('bars.short')} </span>
          {placement.hidden.map((p, i) => (
            <span key={p.n}>
              {i > 0 ? ' · ' : ''}
              <span className="text-fg">
                ({p.n}) <strong className="font-semibold tabular">{measure(p.cut.length)}</strong>
              </span>{' '}
              {ids?.[p.n - 1]?.code ?? (p.cut.ref ? `${p.cut.ref} · ` : '')} {ids?.[p.n - 1]?.side ?? sideOf(p.cut)}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  )
})

function PieceCard({ hover, width, windows, id }: { hover: HoverState; width: number; windows: ReadonlyMap<string, WindowMeta>; id?: BarPieceId }) {
  const t = useT(es)
  const fmt = useFormat()
  const measure = useMeasure()
  const { piece } = hover
  const meta = piece.cut.ref ? windows.get(piece.cut.ref) : undefined
  const center = piece.x + piece.w / 2
  const cardW = 208
  const left = Math.max(0, Math.min(width - cardW, center - cardW / 2))
  const side = id?.side ?? sideOf(piece.cut)
  const angle = (a?: number) => `${fmt.number(a ?? 90, { maxDecimals: 1 })}°`
  return (
    <div
      role="status"
      className="pointer-events-none absolute bottom-full z-10 mb-1.5 rounded-md bg-raised px-3 py-2 shadow-float"
      style={{ left, width: cardW }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-h3 font-medium text-fg-strong tabular">{measure(piece.cut.length)}</span>
        <span className="text-meta text-fg-muted">{t('bars.piece', { n: piece.n })}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-table text-fg">
                <span className="truncate">
          {id?.code || piece.cut.ref ? <strong className="code-id font-semibold">{id?.code ?? piece.cut.ref}</strong> : null}
          {side ? ` · ${workshopSideWords(side)}` : ''}
        </span>
      </div>
      {meta?.name ? <div className="truncate text-meta text-fg-muted">{meta.name}</div> : null}
      <div className="mt-0.5 text-meta text-fg-muted tabular">{t('bars.angles', { angles: `${angle(piece.cut.angleStart)} · ${angle(piece.cut.angleEnd)}` })}</div>
    </div>
  )
}
