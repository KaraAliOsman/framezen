/**
 * El banco de corte explicado con piezas reales: la barra completa a escala con sus piezas, el detalle
 * de la sierra de doble cabezal (despunte, disco en inglete, triángulo perdido), la esquina soldada
 * y el acero dentro de la pieza. Cambia en vivo con los ajustes y resalta el valor que editas. Cada
 * parámetro lleva su letra, la misma de su campo.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { CutSettings } from '@dekopen/engine'
import { cn } from '../../../lib/cn'
import { useFormat, useT } from '../../../lib/i18n'
import es from '../i18n/es'
import { bladeStrip, miterRun, points, SAW_LETTER, sawPlan, type Pt, type SawParam, type SawPlan, type SawSample } from './sawModel'

const INK = 'var(--dk-fg-strong)'
const MUTED = 'var(--dk-fg-muted)'
const LINE = 'var(--dk-frame-line)'
const DIM = 'var(--dk-dimension)'
const DIM_TEXT = 'var(--dk-dimension-text)'
const HOT = 'var(--dk-select)'
const PAPER = 'var(--dk-surface)'

interface Shared {
  /** Ancho del dibujo en unidades SVG: en panel angosto se redibuja, no se achica la letra. */
  W: number
  cut: CutSettings
  sample: SawSample
  plan: SawPlan
  active: SawParam | null
  onActive?: (param: SawParam | null) => void
}

export function SawDiagram({
  cut,
  sample,
  active,
  onActive,
  compact,
  className,
}: {
  cut: CutSettings
  sample: SawSample
  active: SawParam | null
  onActive?: (param: SawParam | null) => void
  /** Solo barra y sierra (hoja de marca, panel angosto). */
  compact?: boolean
  className?: string
}) {
  const t = useT(es)
  const fmt = useFormat()
  const plan = sawPlan(sample, cut)
  const frame = useRef<HTMLElement>(null)
  const [width, setWidth] = useState(880)
  useEffect(() => {
    const el = frame.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    setWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])
  const W = Math.max(600, Math.min(880, width || 880))
  const shared: Shared = { W, cut, sample, plan, active, onActive }
  return (
    <figure ref={frame} className={cn('@container m-0 flex flex-col gap-6 overflow-x-auto', className)}>
      <Register title={t('saw.barTitle')} note={t('saw.barNote', { line: sample.lineName, code: sample.code, size: `${fmt.mm(sample.width)} × ${fmt.mm(sample.height)}` })}>
        <BarElevation {...shared} />
      </Register>
      <Register title={t('saw.headTitle')} note={sample.face ? t('saw.headNote', { face: sample.face }) : t('saw.headNoFace')}>
        <SawHead {...shared} />
      </Register>
      {compact ? null : (
        <div className="grid gap-6 @2xl:grid-cols-2">
          <Register title={t('saw.weldTitle')} note={t('saw.weldNote')}>
            <WeldCorner {...shared} />
          </Register>
          <Register title={t('saw.steelTitle')} note={t('saw.steelNote')}>
            <SteelInside {...shared} />
          </Register>
        </div>
      )}
    </figure>
  )
}

function Register({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="min-w-0">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <h4 className="font-medium text-fg-strong">{title}</h4>
        <p className="text-meta text-fg-muted">{note}</p>
      </header>
      {children}
    </section>
  )
}

/** Globo con la letra del parámetro. */
function Balloon({ x, y, param, active, onActive }: { x: number; y: number; param: SawParam; active: SawParam | null; onActive?: (p: SawParam | null) => void }) {
  const on = active === param
  return (
    <g onPointerEnter={() => onActive?.(param)} onPointerLeave={() => onActive?.(null)} className={onActive ? 'cursor-help' : undefined}>
      <circle cx={x} cy={y} r={10} fill={on ? HOT : PAPER} stroke={on ? HOT : INK} strokeWidth={1.2} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill={on ? '#FFFFFF' : INK}>
        {SAW_LETTER[param]}
      </text>
    </g>
  )
}

/** Cota horizontal con trazos a 45°, como en un plano. */
function HDim({ x1, x2, y, from, text, sub, color = DIM, textColor = DIM_TEXT, size = 12 }: { x1: number; x2: number; y: number; from?: number; text: string; sub?: string; color?: string; textColor?: string; size?: number }) {
  const span = x2 - x1
  const inside = span >= text.length * size * 0.56 + 6
  return (
    <g>
      {from !== undefined ? (
        <>
          <line x1={x1} y1={from} x2={x1} y2={y + (from > y ? -3 : 3)} stroke={color} strokeWidth={0.6} opacity={0.6} />
          <line x1={x2} y1={from} x2={x2} y2={y + (from > y ? -3 : 3)} stroke={color} strokeWidth={0.6} opacity={0.6} />
        </>
      ) : null}
      <line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth={0.9} />
      <line x1={x1 - 3} y1={y + 3} x2={x1 + 3} y2={y - 3} stroke={color} strokeWidth={1.2} />
      <line x1={x2 - 3} y1={y + 3} x2={x2 + 3} y2={y - 3} stroke={color} strokeWidth={1.2} />
      {inside ? (
        <text x={(x1 + x2) / 2} y={y - 5} textAnchor="middle" fontSize={size} fontWeight={600} fill={textColor} className="tabular">
          {text}
          {sub ? <tspan fontWeight={400} fill={MUTED}>{` ${sub}`}</tspan> : null}
        </text>
      ) : null}
    </g>
  )
}

function useHatch() {
  const id = `saw-hatch-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const defs = (
    <defs>
      <pattern id={id} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1={0} y1={0} x2={0} y2={6} stroke="var(--dk-control)" strokeWidth={1} />
      </pattern>
    </defs>
  )
  return { id, defs }
}

/** A. La barra completa a escala real: alto y ángulos verdaderos. */
function BarElevation({ W, cut, sample, plan, active, onActive }: Shared) {
  const t = useT(es)
  const fmt = useFormat()
  const hatch = useHatch()
  const pad = 14
  const bar = plan.bar
  const geo = plan.geo
  const L = bar?.barLength ?? cut.barLength
  const k = (W - pad * 2) / L
  const X = (mm: number) => pad + mm * k
  const top = 62
  const h = Math.max(7, (sample.face ?? 60) * k)
  const bottom = top + h
  const H = bottom + 62
  const hot = (p: SawParam) => active === p
  if (!bar || !geo) return null
  const rem = geo.remainder
  const remX = X(geo.remainderStart)
  const remW = rem * k
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 560 }} className="block h-auto w-full select-none" role="img" aria-label={t('saw.barAria', { bar: fmt.mm(L), pieces: bar.cuts.length, rest: fmt.mm(rem) })}>
      {hatch.defs}
      {/* Barra */}
      <rect x={X(0)} y={top} width={L * k} height={h} fill="var(--dk-hover)" stroke={hot('barLength') ? HOT : LINE} strokeWidth={hot('barLength') ? 1.6 : 0.8} />
      {/* Despuntes */}
      {geo.trimStart > 0 ? <rect x={X(0)} y={top} width={Math.max(2, geo.trimStart * k)} height={h} fill={hot('trimStart') ? HOT : `url(#${hatch.id})`} stroke={LINE} strokeWidth={0.5} /> : null}
      {geo.trimEnd > 0 ? <rect x={X(L - geo.trimEnd)} y={top} width={Math.max(2, geo.trimEnd * k)} height={h} fill={hot('trimEnd') ? HOT : `url(#${hatch.id})`} stroke={LINE} strokeWidth={0.5} /> : null}
      {/* Sobrante */}
      {rem > 0 ? (
        <rect x={remX} y={top} width={Math.max(1, remW)} height={h} fill={geo.reusable ? PAPER : `url(#${hatch.id})`} stroke={hot('minReusable') ? HOT : INK} strokeWidth={geo.reusable || hot('minReusable') ? 1.3 : 0} strokeDasharray={geo.reusable ? '5 3' : undefined} />
      ) : null}
      {/* Piezas: ángulo verdadero. La cara larga queda abajo, como sale de la sierra. */}
      {bar.cuts.map((c, i) => {
        const x = X(c.offset)
        const w = c.length * k
        const f = sample.face ?? 60
        const a = miterRun(f, c.angleStart ?? 90) * k
        const b = miterRun(f, c.angleEnd ?? 90) * k
        return (
          <g key={i}>
            <polygon points={`${x + a},${top} ${x + w - b},${top} ${x + w},${bottom} ${x},${bottom}`} fill={PAPER} stroke={hot('miter') ? HOT : INK} strokeWidth={1} strokeLinejoin="miter" />
            {cut.kerf > 0 && i < bar.cuts.length ? <rect x={x + w} y={bottom - 1} width={Math.max(1.4, plan.kerfAlong * k)} height={h > 8 ? 4 : 2} fill={hot('kerf') ? HOT : INK} /> : null}
            <HDim x1={x} x2={x + w} y={top - 16} from={bottom} text={fmt.mm(c.length)} color={DIM} />
            <text x={x + w / 2} y={bottom + 15} textAnchor="middle" fontSize={11} fill={MUTED}>
              {c.label.replace(/^.* · /, '')}
            </text>
          </g>
        )
      })}
      {rem > 0 ? (
        <g>
          <HDim x1={remX} x2={remX + remW} y={top - 16} from={top} text={fmt.mm(rem)} color={hot('minReusable') ? HOT : DIM} textColor={hot('minReusable') ? HOT : DIM_TEXT} />
          {remW > 96 ? (
            <text x={remX + remW / 2} y={bottom + 15} textAnchor="middle" fontSize={11} fontWeight={geo.reusable ? 600 : 400} fill={geo.reusable ? INK : MUTED}>
              {geo.reusable ? t('saw.keep') : t('saw.waste')}
            </text>
          ) : null}
        </g>
      ) : null}
      {/* Largo total */}
      <HDim x1={X(0)} x2={X(L)} y={H - 14} from={bottom} text={fmt.mm(L, { unit: true })} sub={t('saw.barWord')} color={hot('barLength') ? HOT : DIM} textColor={hot('barLength') ? HOT : DIM_TEXT} />
      <Balloon x={X(L * 0.5) + 120} y={H - 14} param="barLength" active={active} onActive={onActive} />
      <Balloon x={X(0) + 14} y={18} param="trimStart" active={active} onActive={onActive} />
      <Balloon x={X(L) - 14} y={18} param="trimEnd" active={active} onActive={onActive} />
      {rem > 0 ? <Balloon x={Math.min(X(L) - 44, Math.max(remX + remW / 2, X(0) + 44))} y={18} param="minReusable" active={active} onActive={onActive} /> : null}
    </svg>
  )
}

/** Línea de quiebre: la pieza sigue, no se dibuja entera. */
function breakLine(x: number, y1: number, y2: number): string {
  const step = (y2 - y1) / 6
  const pts = [0, 1, 2, 3, 4, 5, 6].map((i) => `${x + (i % 2 ? 6 : -6)},${y1 + i * step}`)
  return `M${pts.join(' L')}`
}

/** B. Detalle en planta del cabezal: dónde cae el disco y qué se pierde. */
function SawHead({ W, cut, sample, plan, active, onActive }: Shared) {
  const t = useT(es)
  const fmt = useFormat()
  const hatch = useHatch()
  const H = 318
  const s = W < 760 ? 1.7 : 2 // px por mm
  const face = sample.face ?? 60
  const h = face * s
  const top = 74
  const bottom = top + h
  const miter = sample.miter
  const run = miterRun(face, miter) * s
  const piece = plan.bar?.cuts[0]?.length ?? 0
  const kerf = Math.max(1.5, cut.kerf * s)
  const along = plan.kerfAlong * s
  const trim = (plan.geo?.trimStart ?? cut.trimStart) * s
  const hot = (p: SawParam) => active === p

  // Barra a la izquierda, primera pieza, quiebre, fin de la pieza, triángulo y la siguiente pieza.
  const barEnd = 28
  const startPt: Pt = { x: barEnd + trim, y: bottom } // punta larga izquierda
  const spare = Math.max(160, W - 18 - barEnd - trim - run * 3 - along - 70)
  const breakX = startPt.x + run + spare * 0.46
  const endX = breakX + run + spare * 0.46 // punta larga derecha (dibujo acortado)
  const nextX = endX + along // punta larga de la siguiente pieza
  const nextEnd = W - 18
  const body = `M${startPt.x} ${bottom} L${startPt.x + run} ${top} H${endX - run} L${endX} ${bottom} Z`
  const next = `M${nextX} ${bottom} L${nextX + run} ${top} H${nextEnd} V${bottom} Z`
  const stripLeft = bladeStrip(startPt, h, miter, kerf, 1, 34)
  const stripRight = bladeStrip({ x: endX, y: bottom }, h, miter, kerf, -1, 34)
  const offcut = `M${barEnd} ${top} H${startPt.x + run} L${startPt.x} ${bottom} H${barEnd} Z`
  const wedge = `M${endX - run} ${top} H${nextX + run} L${nextX} ${bottom} H${endX} Z`
  const short = Math.max(0, piece - (miterRun(face, plan.bar?.cuts[0]?.angleStart ?? miter) + miterRun(face, miter)))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 560 }} className="block h-auto w-full select-none" role="img" aria-label={t('saw.headAria', { kerf: fmt.mm(cut.kerf), along: fmt.number(plan.kerfAlong, { maxDecimals: 1 }), angle: fmt.number(miter, { maxDecimals: 1 }) })}>
      {hatch.defs}
      {/* Bancada: la regla contra la que apoya el perfil */}
      <line x1={8} y1={top - 8} x2={W - 8} y2={top - 8} stroke={LINE} strokeWidth={3} />
      <text x={W - 10} y={top - 15} textAnchor="end" fontSize={11} fill={MUTED}>
        {t('saw.fence')}
      </text>

      {/* Lo que se pierde */}
      <path d={offcut} fill={hot('trimStart') ? HOT : `url(#${hatch.id})`} fillOpacity={hot('trimStart') ? 0.28 : 1} stroke={LINE} strokeWidth={0.8} />
      <path d={wedge} fill={`url(#${hatch.id})`} stroke={LINE} strokeWidth={0.8} />

      {/* Piezas */}
      <path d={body} fill={PAPER} stroke={INK} strokeWidth={1.4} strokeLinejoin="miter" />
      <path d={next} fill={PAPER} stroke={INK} strokeWidth={1.4} strokeLinejoin="miter" />
      {sample.face ? (
        <>
          <HDim x1={startPt.x + run} x2={endX - run} y={top + 24} text="" />
          <text x={startPt.x + run + 12} y={top + 18} fontSize={12} fill={DIM_TEXT}>
            <tspan fontWeight={600}>{fmt.mm(Math.round(short * 10) / 10)}</tspan>
            <tspan fill={MUTED}>{` ${t('saw.shortFace')}`}</tspan>
          </text>
        </>
      ) : null}
      <rect x={breakX - 13} y={top - 3} width={26} height={h + 6} fill="var(--dk-canvas)" />
      <path d={breakLine(breakX - 7, top - 3, bottom + 3)} fill="none" stroke={INK} strokeWidth={1} />
      <path d={breakLine(breakX + 7, top - 3, bottom + 3)} fill="none" stroke={INK} strokeWidth={1} />
      <rect x={nextEnd - 6} y={top - 3} width={24} height={h + 6} fill="var(--dk-canvas)" />
      <path d={breakLine(nextEnd - 2, top - 3, bottom + 3)} fill="none" stroke={INK} strokeWidth={1} />

      {/* Discos vistos de canto */}
      <polygon points={points(stripLeft)} fill={hot('kerf') ? HOT : INK} />
      <polygon points={points(stripRight)} fill={hot('kerf') ? HOT : INK} />
      <text x={stripLeft[1]!.x - 6} y={stripLeft[1]!.y - 8} fontSize={11} textAnchor="middle" fill={MUTED}>
        {t('saw.headFixed')}
      </text>
      <text x={stripRight[1]!.x + 6} y={stripRight[1]!.y - 8} fontSize={11} textAnchor="middle" fill={MUTED}>
        {t('saw.headMoving')}
      </text>

      {/* Textos sobre la pieza */}
      <text x={(startPt.x + run + breakX) / 2 + 8} y={top + h / 2 + 12} textAnchor="middle" fontSize={13} fontWeight={600} fill={INK}>
        {sample.code}
      </text>
      <text x={(startPt.x + run + breakX) / 2 + 8} y={top + h / 2 + 29} textAnchor="middle" fontSize={11} fill={MUTED}>
        {t('saw.piece', { n: 1 })}
      </text>
      <text x={(nextX + run + nextEnd) / 2} y={top + h / 2 + 4} textAnchor="middle" fontSize={11} fill={MUTED}>
        {t('saw.piece', { n: 2 })}
      </text>
      <text x={(endX + nextX) / 2} y={top + 16} textAnchor="middle" fontSize={10.5} fill={MUTED}>
        {t('saw.wedge')}
      </text>

      {/* Ángulo */}
      <path d={`M${endX - 30} ${bottom} A30 30 0 0 1 ${endX - 30 * Math.cos((miter * Math.PI) / 180)} ${bottom - 30 * Math.sin((miter * Math.PI) / 180)}`} fill="none" stroke={hot('miter') ? HOT : DIM} strokeWidth={1.2} />
      <text x={endX - 48} y={bottom - 8} textAnchor="middle" fontSize={12} fontWeight={600} fill={hot('miter') ? HOT : DIM_TEXT}>
        {`${fmt.number(miter, { maxDecimals: 1 })}°`}
      </text>

      {/* Cotas: punta a punta y cara corta */}
      <HDim x1={startPt.x} x2={endX} y={bottom + 34} from={bottom + 4} text={fmt.mm(piece)} sub={t('saw.cutLength')} size={13} />

      {/* Despunte */}
      {trim > 0 ? (
        <HDim x1={barEnd} x2={startPt.x} y={bottom + 62} from={bottom + 4} text="" color={hot('trimStart') ? HOT : DIM} />
      ) : null}
      <text x={barEnd + 26} y={bottom + 86} fontSize={12} fill={hot('trimStart') ? HOT : DIM_TEXT}>
        <tspan fontWeight={600}>{trim > 0 ? fmt.mm(plan.geo?.trimStart ?? cut.trimStart, { unit: true }) : t('saw.noTrim')}</tspan>
        {trim > 0 ? <tspan fill={MUTED}>{` ${t('saw.trimWord')}`}</tspan> : null}
      </text>

      {/* Disco en el eje de la barra */}
      <HDim x1={endX} x2={nextX} y={bottom + 62} from={bottom + 4} text="" color={hot('kerf') ? HOT : DIM} />
      <text x={(endX + nextX) / 2} y={bottom + 86} textAnchor="middle" fontSize={12} fill={hot('kerf') ? HOT : DIM_TEXT}>
        <tspan fontWeight={600}>{t('saw.kerfAlong', { kerf: fmt.mm(cut.kerf), along: fmt.number(plan.kerfAlong, { maxDecimals: 1 }) })}</tspan>
      </text>

      <text x={nextX + 30} y={bottom + 17} fontSize={10.5} fill={MUTED}>
        {t('saw.longFace')}
      </text>

      <Balloon x={barEnd + 10} y={bottom + 82} param="trimStart" active={active} onActive={onActive} />
      <Balloon x={stripRight[1]!.x + 58} y={stripRight[1]!.y - 12} param="kerf" active={active} onActive={onActive} />
      <Balloon x={endX - 78} y={bottom - 12} param="miter" active={active} onActive={onActive} />
    </svg>
  )
}

/** G. La esquina soldada: la pieza se corta larga y la soldadura se come esa sobremedida. */
function WeldCorner({ sample, active, onActive }: Shared) {
  const t = useT(es)
  const fmt = useFormat()
  const hatch = useHatch()
  const W = 420
  const H = 262
  const face = sample.face ?? 60
  const weld = sample.weld
  if (weld === null || weld <= 0) {
    return <p className="rounded-sm bg-sunken px-3 py-4 text-table text-fg-muted">{t('saw.noWeld')}</p>
  }
  const s = 1.45
  const f = face * s
  const e = Math.max(4, weld * s) // sobremedida dibujada
  const ox = 118 // esquina exterior terminada
  const oy = 74
  const hot = active === 'weld'
  const color = hot ? HOT : DIM
  // Marco terminado (L). La cara larga es la exterior.
  const finished = `M${ox} ${oy} H${W - 18} V${oy + f} H${ox + f} V${H - 18} H${ox} Z`
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" role="img" aria-label={t('saw.weldAria', { weld: fmt.mm(weld), total: fmt.mm(weld * 2) })}>
      {hatch.defs}
      <path d={finished} fill={PAPER} stroke={INK} strokeWidth={1.4} />
      {/* Sobremedida de cada pieza antes de soldar: su punta larga pasa la esquina en `weld` y se funde. */}
      <polygon points={`${ox - e},${oy} ${ox},${oy} ${ox + f},${oy + f} ${ox - e + f},${oy + f}`} fill={hot ? HOT : `url(#${hatch.id})`} fillOpacity={hot ? 0.3 : 1} stroke={color} strokeWidth={1} />
      <polygon points={`${ox},${oy - e} ${ox},${oy} ${ox + f},${oy + f} ${ox + f},${oy + f - e}`} fill={hot ? HOT : `url(#${hatch.id})`} fillOpacity={hot ? 0.3 : 1} stroke={color} strokeWidth={1} />
      <line x1={ox} y1={oy} x2={ox + f} y2={oy + f} stroke={hot ? HOT : INK} strokeWidth={1.6} />
      {/* Cotas */}
      <line x1={ox - e} y1={oy - 2} x2={ox - e} y2={oy - 44} stroke={color} strokeWidth={0.6} />
      <line x1={ox} y1={oy - e - 2} x2={ox} y2={oy - 44} stroke={color} strokeWidth={0.6} />
      <HDim x1={ox - e} x2={ox} y={oy - 38} text="" color={color} />
      <text x={ox + 10} y={oy - 34} fontSize={12} fontWeight={600} fill={hot ? HOT : DIM_TEXT}>
        {t('saw.weldEach', { weld: fmt.mm(weld) })}
      </text>
      <text x={ox + f + 16} y={oy + f / 2 + 4} fontSize={11} fill={MUTED}>
        {t('saw.weldSeam')}
      </text>
      <text x={ox + f + 16} y={oy + f + 26} fontSize={12} fill={INK}>
        <tspan fontWeight={600}>{fmt.mm(sample.width)}</tspan> <tspan fill={MUTED}>{t('saw.finished')}</tspan>
      </text>
      <text x={ox + f + 16} y={oy + f + 46} fontSize={12} fill={INK}>
        <tspan fontWeight={600}>{fmt.mm(sample.width + weld * 2)}</tspan> <tspan fill={MUTED}>{t('saw.toCut')}</tspan>
      </text>
      <Balloon x={ox - 44} y={oy + f / 2} param="weld" active={active} onActive={onActive} />
    </svg>
  )
}

/** H. El acero dentro de la pieza: lo que se descuenta en cada punta. */
function SteelInside({ sample, active, onActive }: Shared) {
  const t = useT(es)
  const fmt = useFormat()
  const steel = sample.steel
  if (!steel) return <p className="rounded-sm bg-sunken px-3 py-4 text-table text-fg-muted">{t('saw.noSteel')}</p>
  const W = 420
  const H = 262
  const pad = 22
  const k = (W - pad * 2) / steel.pieceLength
  const X = (mm: number) => pad + mm * k
  const face = sample.face ?? 60
  const h = Math.max(30, Math.min(70, face * k * 5))
  const top = 80
  const bottom = top + h
  // Ingletes a su ancho real en esta escala: el acero queda dentro, como en la pieza.
  const run = miterRun(face, sample.miter) * k
  const deduction = Math.round((steel.pieceLength - steel.length) * 10) / 10
  const each = deduction / 2
  const hot = active === 'steel'
  const color = hot ? HOT : DIM
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" role="img" aria-label={t('saw.steelAria', { code: steel.code, length: fmt.mm(steel.length), piece: fmt.mm(steel.pieceLength), deduction: fmt.mm(deduction) })}>
      <polygon points={`${X(0) + run},${top} ${X(steel.pieceLength) - run},${top} ${X(steel.pieceLength)},${bottom} ${X(0)},${bottom}`} fill={PAPER} stroke={INK} strokeWidth={1.4} />
      <rect x={X(each)} y={top + h * 0.34} width={steel.length * k} height={h * 0.34} fill={hot ? HOT : 'var(--dk-pressed)'} fillOpacity={hot ? 0.3 : 1} stroke={hot ? HOT : INK} strokeWidth={1} />
      <text x={W / 2} y={top + h * 0.52 + 4} textAnchor="middle" fontSize={12} fontWeight={600} fill={INK}>
        {steel.code}
      </text>
      <HDim x1={X(0)} x2={X(steel.pieceLength)} y={top - 22} from={top - 4} text={fmt.mm(steel.pieceLength)} sub={t('saw.pieceCut')} />
      <HDim x1={X(each)} x2={X(steel.pieceLength - each)} y={bottom + 24} from={top + h * 0.68} text={fmt.mm(steel.length)} sub={t('saw.steelCut')} color={color} textColor={hot ? HOT : DIM_TEXT} />
      <text x={W / 2} y={bottom + 54} textAnchor="middle" fontSize={12} fill={hot ? HOT : DIM_TEXT}>
        <tspan fontWeight={600}>{t('saw.steelDeduction', { mm: fmt.mm(deduction) })}</tspan>
      </text>
      <Balloon x={pad + 10} y={bottom + 50} param="steel" active={active} onActive={onActive} />
    </svg>
  )
}

/** Letra del parámetro para el campo que lo edita. */
export function SawLetter({ param, active }: { param: SawParam; active?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-micro font-semibold tabular transition-colors duration-100',
        active ? 'border-[var(--dk-select)] bg-[var(--dk-select)] text-white' : 'border-fg-strong text-fg-strong',
      )}
    >
      {SAW_LETTER[param]}
    </span>
  )
}
