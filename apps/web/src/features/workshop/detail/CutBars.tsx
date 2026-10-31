/**
 * Optimización de cortes interactiva: cada barra dibujada a escala por perfil y color, las
 * piezas con el color de su ventana, la medida grande y «V3 · arr» debajo. Toca una pieza
 * para ver su detalle y resaltar su ventana; toca el número de la barra para marcarla cortada.
 */
import { memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import type { Bar, Catalog, CutSettings, OptimizationGroup } from '@framezen/engine'
import { workshopSideWords } from '@framezen/documents'
import { cn } from '../../../lib/cn'
import { formatNumber } from '../../../lib/format'
import { Button } from '../../../ui'
import { BAR_HEIGHT, LABEL_SIZE, mm, piecePolygon, placeBar, sideOf, type PiecePlacement } from '../model/cutLayout'

const CAPTION_ROW = 18
const INK = '#1F1C18'

/** Barras por perfil que se dibujan de entrada (y en cada «Ver más»). */
export const CUT_BARS_PAGE = 40

export interface WindowMeta {
  ref: string
  tint: string
  name?: string
}

interface HoverState {
  key: string
  piece: PiecePlacement
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
}: {
  group: OptimizationGroup
  catalog?: Catalog
  cut: CutSettings
  windows: ReadonlyMap<string, WindowMeta>
  focusRef: string | null
  onFocusRef: (ref: string | null) => void
  isCut: (key: string) => boolean
  onToggleCut: (key: string) => void
  barKeyOf: (group: OptimizationGroup, index: number, bar: Bar) => string
}) {
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

  return (
    <section className="rounded-lg border border-paper-200 bg-paper-0" aria-label={`${group.code} ${group.name}`}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-paper-200 px-4 py-3">
        <div className="flex w-full min-w-0 items-center gap-2.5 sm:w-auto sm:flex-1">
          {color ? (
            <span
              aria-hidden
              className="size-4 shrink-0 rounded-full border border-paper-350/60"
              style={{ background: color.hex }}
              title={color.name}
            />
          ) : (
            <span aria-hidden className="size-4 shrink-0 rounded-full border border-dashed border-paper-350" title="Sin color (refuerzo)" />
          )}
          <span className="shrink-0 font-mono text-[13px] text-paper-600">{group.code}</span>
          <h3 className="min-w-0 truncate font-semibold text-paper-900">
            {group.name}
            {color ? <span className="font-normal text-paper-600"> · {color.name}</span> : null}
          </h3>
        </div>
        <div className="flex items-center gap-3 text-[13px] text-paper-600 tabular">
          <span>
            <strong className="font-semibold text-paper-900">{group.barsNeeded}</strong> {group.barsNeeded === 1 ? 'barra' : 'barras'}
          </span>
          <span>
            {group.pieces} {group.pieces === 1 ? 'pieza' : 'piezas'}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-paper-200" aria-hidden>
              <span className="absolute inset-y-0 left-0 rounded-full bg-ink-600" style={{ width: `${Math.min(100, group.yieldPct)}%` }} />
            </span>
            <span className="font-medium text-paper-900">{formatNumber(group.yieldPct, 1)} %</span>
          </span>
          {cutCount > 0 ? (
            <span className="inline-flex items-center gap-1 font-medium text-ok-600">
              <Check aria-hidden strokeWidth={2} className="size-3.5" />
              {cutCount} de {group.bars.length}
            </span>
          ) : null}
        </div>
      </header>
      {/* Regla invisible y estable para medir el ancho de las barras (las filas cambian al recalcular). */}
      <div aria-hidden className="grid h-0 grid-cols-[32px_minmax(0,1fr)] gap-2 overflow-hidden px-2 sm:grid-cols-[36px_minmax(0,1fr)] sm:gap-3 sm:px-4">
        <span />
        <div ref={frame} />
      </div>
      <ol className="flex flex-col gap-1 px-2 py-3 sm:px-4">
        {bars.map((bar, i) => {
          const key = barKeyOf(group, i, bar)
          return (
            <li key={key} className="grid grid-cols-[32px_minmax(0,1fr)] items-start gap-2 sm:grid-cols-[36px_minmax(0,1fr)] sm:gap-3">
              <button
                type="button"
                onClick={() => onToggleCut(key)}
                aria-pressed={isCut(key)}
                aria-label={isCut(key) ? `Barra ${i + 1} cortada. Tocar para desmarcar` : `Marcar barra ${i + 1} como cortada`}
                className={cn(
                  'mt-1.5 inline-flex size-8 items-center justify-center rounded-full border text-[13px] font-semibold tabular transition-colors duration-120 ease-out',
                  isCut(key)
                    ? 'border-ok-600 bg-ok-600 text-paper-0 dark:text-paper-50'
                    : 'border-paper-350 bg-paper-0 text-paper-900 hover:border-paper-900',
                )}
              >
                {isCut(key) ? <Check aria-hidden strokeWidth={2.25} className="size-4" /> : i + 1}
              </button>
              <div className="min-w-0">
                {width > 0 ? (
                  <BarRow
                    bar={bar}
                    index={i + 1}
                    cut={cut}
                    width={width}
                    windows={windows}
                    focusRef={focusRef}
                    onFocusRef={onFocusRef}
                    done={isCut(key)}
                  />
                ) : (
                  <div style={{ height: BAR_HEIGHT + CAPTION_ROW + 22 }} />
                )}
              </div>
            </li>
          )
        })}
      </ol>
      {rest > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-paper-200 px-4 py-2.5 text-[13px] text-paper-600">
          <span className="tabular">
            Barras 1 a {formatNumber(bars.length)} de {formatNumber(group.bars.length)}
          </span>
          <Button size="sm" onClick={() => setLimit((n) => n + CUT_BARS_PAGE)}>
            Ver {formatNumber(Math.min(rest, CUT_BARS_PAGE))} barras más
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
  windows,
  focusRef,
  onFocusRef,
  done,
}: {
  bar: Bar
  index: number
  cut: CutSettings
  width: number
  windows: ReadonlyMap<string, WindowMeta>
  focusRef: string | null
  onFocusRef: (ref: string | null) => void
  done: boolean
}) {
  const rawId = useId()
  const hatch = `fz-hatch-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const placement = useMemo(() => placeBar(bar, cut, width), [bar, cut, width])
  const [hover, setHover] = useState<HoverState | null>(null)
  const height = BAR_HEIGHT + CAPTION_ROW
  const reusable = placement.remainder?.reusable ?? false

  return (
    <div className={cn('relative transition-opacity duration-200', done && 'opacity-45')}>
      <svg
        width={placement.width}
        height={height}
        viewBox={`0 0 ${placement.width} ${height}`}
        role="img"
        aria-label={`Barra ${index}${bar.fromOffcut ? ' (retazo)' : ''} de ${mm(bar.barLength)} mm: ${bar.cuts
          .map((c) => `${mm(c.length)} ${c.label}`)
          .join(', ')}; sobrante ${mm(bar.remainder)} mm`}
        className="block overflow-visible"
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <pattern id={hatch} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width={6} height={6} fill="var(--paper-0)" />
            <line x1={0} y1={0} x2={0} y2={6} stroke="var(--paper-350)" strokeWidth={1.2} />
          </pattern>
        </defs>
        <rect x={0.5} y={0.5} width={placement.width - 1} height={BAR_HEIGHT - 1} rx={2} fill="var(--paper-0)" stroke="var(--paper-350)" />
        {placement.trimStart ? <rect x={0.5} y={0.5} width={placement.trimStart.w} height={BAR_HEIGHT - 1} fill={`url(#${hatch})`} /> : null}
        {placement.trimEnd ? (
          <rect x={placement.trimEnd.x - 0.5} y={0.5} width={placement.trimEnd.w} height={BAR_HEIGHT - 1} fill={`url(#${hatch})`} />
        ) : null}
        {placement.remainder ? (
          <g>
            <rect x={placement.remainder.x} y={0.5} width={placement.remainder.w - 0.5} height={BAR_HEIGHT - 1} fill={`url(#${hatch})`} />
            {placement.remainder.showText ? (
              <text
                x={placement.remainder.x + placement.remainder.w / 2}
                y={BAR_HEIGHT / 2 + 4.5}
                textAnchor="middle"
                fontSize={12}
                fontWeight={600}
                fill="var(--paper-600)"
                paintOrder="stroke"
                stroke="var(--paper-0)"
                strokeWidth={3}
                className="tabular"
              >
                {mm(placement.remainder.length)}
              </text>
            ) : null}
            {placement.remainder.showCaption ? (
              <text
                x={placement.remainder.x + placement.remainder.w / 2}
                y={BAR_HEIGHT + 13}
                textAnchor="middle"
                fontSize={LABEL_SIZE}
                fill={reusable ? 'var(--ok-600)' : 'var(--paper-600)'}
              >
                {reusable ? 'retazo para guardar' : 'sobrante'}
              </text>
            ) : null}
          </g>
        ) : null}
        {placement.pieces.map((p) => {
          const meta = p.cut.ref ? windows.get(p.cut.ref) : undefined
          const dim = focusRef !== null && p.cut.ref !== focusRef
          const active = hover?.piece.n === p.n
          return (
            <g
              key={p.n}
              opacity={dim ? 0.22 : 1}
              className="cursor-pointer transition-opacity duration-160"
              onPointerEnter={() => setHover({ key: `${index}-${p.n}`, piece: p })}
              onClick={() => onFocusRef(focusRef === p.cut.ref ? null : (p.cut.ref ?? null))}
            >
              <polygon
                points={piecePolygon(p)}
                fill={meta?.tint ?? '#EEEAE3'}
                stroke={INK}
                strokeWidth={active ? 1.6 : 0.75}
                strokeLinejoin="round"
              />
              {p.measure && !p.measure.vertical ? (
                <text
                  x={p.x + p.w / 2}
                  y={BAR_HEIGHT / 2 + p.measure.size * 0.36}
                  textAnchor="middle"
                  fontSize={p.measure.size}
                  fontWeight={650}
                  fill={INK}
                  className="tabular"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {mm(p.cut.length)}
                </text>
              ) : null}
              {p.measure && p.measure.vertical ? (
                <text
                  transform={`translate(${p.x + p.w / 2 + p.measure.size * 0.36} ${BAR_HEIGHT / 2}) rotate(-90)`}
                  textAnchor="middle"
                  fontSize={p.measure.size}
                  fontWeight={650}
                  fill={INK}
                >
                  {mm(p.cut.length)}
                </text>
              ) : null}
              {!p.measure && p.w >= 8 ? (
                <text x={p.x + p.w / 2} y={BAR_HEIGHT / 2 + 4} textAnchor="middle" fontSize={10} fontWeight={700} fill={INK}>
                  {p.n}
                </text>
              ) : null}
              {p.caption ? (
                <text x={p.x + p.w / 2} y={BAR_HEIGHT + 13} textAnchor="middle" fontSize={LABEL_SIZE} fill="var(--paper-900)">
                  {p.caption}
                </text>
              ) : null}
            </g>
          )
        })}
      </svg>

      {hover ? <PieceCard hover={hover} width={placement.width} windows={windows} /> : null}

      <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-meta text-paper-600 tabular">
        <span>
          {bar.fromOffcut ? 'Retazo de bodega' : `Barra de ${mm(bar.barLength)} mm`} · piezas {mm(bar.used)} mm · se pierden {mm(bar.kerfLoss)} mm en cortes
        </span>
        <span>
          Sobrante <strong className="font-semibold text-paper-900">{mm(bar.remainder)} mm</strong>
          {reusable ? <span className="text-ok-600"> · guardar</span> : null} · {formatNumber(bar.yieldPct, 1)} %
        </span>
      </div>
      {placement.hidden.length > 0 ? (
        <p className="mt-1 text-meta leading-[18px] text-paper-600">
          <span>Piezas cortas: </span>
          {placement.hidden.map((p, i) => (
            <span key={p.n}>
              {i > 0 ? ' · ' : ''}
              <span className="text-paper-900">
                ({p.n}) <strong className="font-semibold tabular">{mm(p.cut.length)}</strong>
              </span>{' '}
              {p.cut.ref ? `${p.cut.ref} · ` : ''}
              {sideOf(p.cut)}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  )
})

function angleText(start?: number, end?: number): string {
  const f = (a?: number) => `${formatNumber(a ?? 90, 1)}°`
  return `${f(start)} · ${f(end)}`
}

function PieceCard({ hover, width, windows }: { hover: HoverState; width: number; windows: ReadonlyMap<string, WindowMeta> }) {
  const { piece } = hover
  const meta = piece.cut.ref ? windows.get(piece.cut.ref) : undefined
  const center = piece.x + piece.w / 2
  const cardW = 200
  const left = Math.max(0, Math.min(width - cardW, center - cardW / 2))
  const side = sideOf(piece.cut)
  return (
    <div
      role="status"
      className="pointer-events-none absolute bottom-full z-10 mb-1.5 rounded-md border border-paper-200 bg-paper-0 px-3 py-2 shadow-float"
      style={{ left, width: cardW }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-h3 font-semibold tracking-[-0.01em] text-paper-900 tabular">{mm(piece.cut.length)}</span>
        <span className="text-meta text-paper-600">mm · pieza {piece.n}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-paper-900">
        {meta ? <span aria-hidden className="size-2.5 shrink-0 rounded-[3px] border border-paper-900/40" style={{ background: meta.tint }} /> : null}
        <span className="truncate">
          {piece.cut.ref ? <strong className="font-semibold">{piece.cut.ref}</strong> : null}
          {side ? ` · ${workshopSideWords(side)}` : ''}
        </span>
      </div>
      {meta?.name ? <div className="truncate text-meta text-paper-600">{meta.name}</div> : null}
      <div className="mt-0.5 text-meta text-paper-600 tabular">Cortes {angleText(piece.cut.angleStart, piece.cut.angleEnd)}</div>
    </div>
  )
}
