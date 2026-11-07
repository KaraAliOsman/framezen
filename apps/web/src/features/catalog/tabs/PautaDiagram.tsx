import type { Pauta } from '@dekopen/engine'
import { cn } from '../../../lib/cn'
import { useFormat, useT } from '../../../lib/i18n'
import { NumberField } from '../../../ui'
import es from '../i18n/es'
import { pautaMax, pautaValue, type PautaKey, type ReinforcementKey } from '../model/pauta'

export type PautaTarget = PautaKey | `reinforcement.${ReinforcementKey}`

export interface PautaDiagramField {
  key: PautaTarget
  label: string
  help: string
}

const W = 780
const H = 470
const OX = 158
const OY = 112
/** Fin del dibujo principal y franja del detalle del travesaño. */
const MAIN_RIGHT = 566
const DETAIL_LEFT = 606
const DETAIL_RIGHT = W - 6
const BOTTOM = H - 40
const TICK = 5

const pct = (value: number, of: number) => `${(value / of) * 100}%`

/**
 * La pauta se edita sobre el dibujo: esquina de una ventana vista desde el interior, a escala, con cada
 * cota escrita en su lugar. Un clic en la cota o en la pieza abre su valor; la pieza se resalta y el
 * dibujo se mueve mientras escribes. Usa los colores de dibujo del tema (claro y oscuro).
 */
export function PautaDiagram({
  pauta,
  values,
  fields,
  frameFace,
  active,
  onActive,
  onChange,
  editable,
  scope,
  className,
}: {
  /** Pauta saneada: de ella sale la geometría. */
  pauta: Pauta
  /** Lo que se edita, tal como está guardado (un refuerzo puede faltar). */
  values: Partial<Pauta>
  fields: readonly PautaDiagramField[]
  /** Cara vista del marco (mm). Si no se conoce: descuento + 20 (galce típico). */
  frameFace?: number
  active: PautaTarget | null
  onActive: (key: PautaTarget | null) => void
  onChange: (key: PautaTarget, value: number | null) => void
  /** Sin esto, todo se puede escribir. La pauta de puertas solo abre los valores que cambian. */
  editable?: (key: PautaTarget) => boolean
  scope: string
  className?: string
}) {
  const t = useT(es)
  const fmt = useFormat()
  const mm = (value: number) => fmt.mm(value, { unit: true })
  const F = Math.max(0, pauta.frameDeduction)
  const O = Math.max(0, pauta.sashOverlap)
  const S = Math.max(1, pauta.sashWidth)
  const D = Math.max(0, pauta.sashDeduction)
  const G = Math.max(0, pauta.glassGap)
  const weld = Math.max(0, pauta.weld)
  const axis = Math.max(0, pauta.mullionDeduction)
  const face = Math.max(frameFace ?? F + 20, F + 4)
  const sashStart = Math.max(0, F - O)
  const sashEnd = sashStart + S
  const glassEdge = sashStart + D + G
  const extent = Math.max(sashEnd, glassEdge, face) + 64
  // Que siempre se vea un poco de vidrio bajo la hoja.
  const needY = Math.max(sashEnd, glassEdge) + 44
  const k = Math.min((MAIN_RIGHT - OX) / extent, (BOTTOM - OY) / needY)
  const X = (mm: number) => OX + mm * k
  const Y = (mm: number) => OY + mm * k
  const right = MAIN_RIGHT
  const bottom = BOTTOM

  const on = (key: PautaTarget) => active === key
  const hot = (...keys: PautaTarget[]) => keys.some(on)
  const dimmed = (key: PautaTarget) => cn('transition-opacity duration-160', active && !on(key) ? 'opacity-30' : 'opacity-100')
  const color = (key: PautaTarget) => (on(key) ? 'var(--dk-select)' : 'var(--dk-dimension)')
  const frameHot = hot('frameDeduction')
  const sashHot = hot('sashWidth', 'sashOverlap')
  const glassHot = hot('sashDeduction', 'glassGap')
  const canEdit = (key: PautaTarget) => editable?.(key) ?? true
  const inputId = (key: PautaTarget) => `${scope}-${key}`
  /** Clic en una pieza: abre su cota en el dibujo. */
  const open = (key: PautaTarget) => () => {
    if (canEdit(key)) document.getElementById(inputId(key))?.focus()
  }
  const pick = (key: PautaTarget) => ({
    onClick: open(key),
    onMouseEnter: () => onActive(key),
    onMouseLeave: () => onActive(null),
    className: 'cursor-pointer',
  })

  // Detalle del travesaño: junto al marco, a la misma escala.
  const detailCx = (DETAIL_LEFT + DETAIL_RIGHT) / 2
  const barHalf = Math.min(((DETAIL_RIGHT - DETAIL_LEFT) / 2) * 0.72, (axis + 12) * k)
  const axisPx = Math.min(barHalf, axis * k)

  const hatch = hot('weld') ? 'var(--dk-select)' : 'var(--dk-dimension)'
  const steel = (key: `reinforcement.${ReinforcementKey}`) => (on(key) ? 'var(--dk-select)' : 'var(--dk-fg-muted)')

  const chip = (key: PautaTarget, x: number, y: number, label: string, align: 'start' | 'end' | 'center', stack?: boolean) => {
    const field = fields.find((f) => f.key === key)
    if (!field) return null
    const shift = align === 'center' ? '-50%' : align === 'end' ? '-100%' : '0'
    return (
      <PautaChip
        key={key}
        id={inputId(key)}
        label={field.label}
        help={field.help}
        short={label}
        value={pautaValue(values, key) ?? null}
        max={pautaMax(key)}
        disabled={!canEdit(key)}
        stack={stack}
        align={align}
        active={on(key)}
        muted={Boolean(active && !on(key))}
        style={{ left: pct(x, W), top: pct(y, H), transform: `translate(${shift}, -50%)` }}
        onChange={(value) => onChange(key, value)}
        onActive={(hit) => onActive(hit ? key : null)}
      />
    )
  }

  return (
    <div className={cn('relative min-w-[620px]', className)} style={{ aspectRatio: `${W} / ${H}` }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 h-full w-full select-none"
        role="img"
        aria-label={t('pauta.diagram.aria', { frame: mm(F), overlap: mm(O), sash: mm(S), deduction: mm(D), gap: mm(G) })}
      >
        <defs>
          <clipPath id={`${scope}-clip`}>
            <rect x={X(0)} y={Y(0)} width={right - X(0)} height={bottom - Y(0)} />
          </clipPath>
          <pattern id={`${scope}-weld`} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="5" stroke={hatch} strokeWidth="1.4" />
          </pattern>
        </defs>

        <g clipPath={`url(#${scope}-clip)`}>
          {/* Vidrio: empieza en su borde (oculto bajo la hoja) */}
          <rect {...pick('glassGap')} x={X(glassEdge)} y={Y(glassEdge)} width={right} height={H} fill="var(--color-glass)" style={{ opacity: 'var(--sketch-glass-opacity)' }} />
          {/* Marco */}
          <path
            {...pick('frameDeduction')}
            d={`M${X(0)} ${Y(0)} H${right} V${Y(face)} H${X(face)} V${bottom} H${X(0)} Z`}
            fill={frameHot ? 'color-mix(in srgb, var(--dk-select) 14%, var(--dk-hover))' : 'var(--dk-hover)'}
            stroke={frameHot ? 'var(--dk-select)' : 'var(--dk-frame-line)'}
            strokeWidth="1"
          />
          <line x1={X(0)} y1={Y(0)} x2={X(face)} y2={Y(face)} stroke="var(--dk-divider-strong)" strokeWidth="0.8" />
          {/* Hoja, por delante del marco */}
          <path
            {...pick('sashWidth')}
            d={`M${X(sashStart)} ${Y(sashStart)} H${right} V${Y(sashEnd)} H${X(sashEnd)} V${bottom} H${X(sashStart)} Z`}
            fill={sashHot ? 'color-mix(in srgb, var(--dk-select) 14%, var(--dk-surface))' : 'var(--dk-surface)'}
            stroke={sashHot ? 'var(--dk-select)' : 'var(--dk-frame-line)'}
            strokeWidth="1"
          />
          <line x1={X(sashStart)} y1={Y(sashStart)} x2={X(sashEnd)} y2={Y(sashEnd)} stroke="var(--dk-divider-strong)" strokeWidth="0.8" />
          {/* Luz: oculta tras la hoja */}
          <path
            d={`M${X(F)} ${bottom} V${Y(F)} H${right}`}
            fill="none"
            pointerEvents="none"
            stroke={hot('frameDeduction', 'sashOverlap') ? 'var(--dk-select)' : 'var(--dk-dimension)'}
            strokeWidth={hot('frameDeduction', 'sashOverlap') ? 1.8 : 1}
            strokeDasharray="5 3"
          />
          {/* Borde del vidrio: oculto tras la hoja */}
          <path d={`M${X(glassEdge)} ${bottom} V${Y(glassEdge)} H${right}`} fill="none" pointerEvents="none" stroke={glassHot ? 'var(--dk-select)' : 'var(--dk-dimension)'} strokeWidth={glassHot ? 1.8 : 1} strokeDasharray="2 2.5" />
          {/* Acero dentro de cada pieza */}
          <g fill="none" strokeWidth={2} strokeDasharray="7 4">
            <line {...pick('reinforcement.frame')} x1={X(sashStart / 2)} y1={Y(face)} x2={X(sashStart / 2)} y2={bottom - 58} stroke={steel('reinforcement.frame')} />
            <line {...pick('reinforcement.sash')} x1={X(sashStart + 12)} y1={Y(sashStart + 12)} x2={X(sashStart + 12)} y2={bottom - 58} stroke={steel('reinforcement.sash')} />
          </g>
        </g>
        {/* Lo que se come la soldadura, por fuera de la medida */}
        <rect {...pick('weld')} x={X(0) - weld * k} y={Y(0) - weld * k} width={weld * k} height={bottom - Y(0) + weld * k} fill={`url(#${scope}-weld)`} />
        <rect {...pick('weld')} x={X(0)} y={Y(0) - weld * k} width={right - X(0)} height={weld * k} fill={`url(#${scope}-weld)`} />
        {/* Medida exterior */}
        <path d={`M${X(0)} ${bottom} V${Y(0)} H${right}`} fill="none" pointerEvents="none" stroke="var(--dk-fg-strong)" strokeWidth="1.8" />

        {/* Rótulos de las piezas */}
        <g fontSize="11" fontWeight="500" pointerEvents="none">
          {sashStart * k > 13 ? (
            <text x={right - 8} y={Y(sashStart / 2) + 4} textAnchor="end" fill="var(--dk-fg-muted)">
              {t('pauta.diagram.frame')}
            </text>
          ) : null}
          <text x={right - 8} y={Y((sashStart + sashEnd) / 2) + 4} textAnchor="end" fill={sashHot ? 'var(--dk-select)' : 'var(--dk-fg)'}>
            {t('pauta.diagram.sash')}
          </text>
          <text x={right - 8} y={bottom - 10} textAnchor="end" fill="var(--dk-fg)">
            {t('pauta.diagram.glass')}
          </text>
          <text x={X(F) + 4} y={bottom - 10} fill="var(--dk-dimension-text)" fontWeight="400" fontSize="10.5">
            {t('pauta.diagram.light')}
          </text>
        </g>

        {/* Detalle del travesaño */}
        <g>
          <rect x={DETAIL_LEFT} y={Y(0)} width={DETAIL_RIGHT - DETAIL_LEFT} height={face * k} fill="var(--dk-hover)" stroke="var(--dk-frame-line)" strokeWidth="1" />
          <rect x={DETAIL_LEFT} y={Y(face)} width={DETAIL_RIGHT - DETAIL_LEFT} height={bottom - Y(face)} fill="var(--color-glass)" style={{ opacity: 'var(--sketch-glass-opacity)' }} />
          <rect
            {...pick('mullionDeduction')}
            x={detailCx - barHalf}
            y={Y(face)}
            width={barHalf * 2}
            height={bottom - Y(face)}
            fill={on('mullionDeduction') ? 'color-mix(in srgb, var(--dk-select) 14%, var(--dk-surface))' : 'var(--dk-surface)'}
            stroke={on('mullionDeduction') ? 'var(--dk-select)' : 'var(--dk-frame-line)'}
            strokeWidth="1"
          />
          <line x1={detailCx} y1={Y(0)} x2={detailCx} y2={bottom} stroke="var(--dk-dimension)" strokeWidth="0.8" strokeDasharray="10 3 2 3" pointerEvents="none" />
          <path d={`M${detailCx - axisPx} ${bottom} V${Y(face)} M${detailCx + axisPx} ${bottom} V${Y(face)}`} fill="none" pointerEvents="none" stroke={on('mullionDeduction') ? 'var(--dk-select)' : 'var(--dk-dimension)'} strokeWidth={on('mullionDeduction') ? 1.8 : 1} strokeDasharray="5 3" />
          <line {...pick('reinforcement.mullion')} x1={detailCx - barHalf * 0.5} y1={Y(face)} x2={detailCx - barHalf * 0.5} y2={bottom - 58} stroke={steel('reinforcement.mullion')} strokeWidth={2} strokeDasharray="7 4" />
        </g>

        {/* Cotas horizontales (arriba) */}
        <HDim y={22} x1={X(0)} x2={X(F)} color={color('frameDeduction')} className={dimmed('frameDeduction')} ext={Y(0)} />
        <HDim y={52} x1={X(sashStart)} x2={X(F)} color={color('sashOverlap')} className={dimmed('sashOverlap')} ext={Y(sashStart)} />
        <HDim y={82} x1={X(sashStart)} x2={X(sashEnd)} color={color('sashWidth')} className={dimmed('sashWidth')} ext={Y(sashStart)} />
        <HDim y={82} x1={detailCx} x2={detailCx + axisPx} color={color('mullionDeduction')} className={dimmed('mullionDeduction')} ext={Y(0)} />
        {/* Cotas verticales (izquierda) */}
        <VDim x={OX - 20} y1={Y(sashStart)} y2={Y(sashStart + D)} color={color('sashDeduction')} className={dimmed('sashDeduction')} ext={X(sashStart)} />
        <VDim x={OX - 20} y1={Y(sashStart + D)} y2={Y(glassEdge)} color={color('glassGap')} className={dimmed('glassGap')} ext={X(sashStart)} />
        {/* Soldadura (abajo) */}
        <HDim y={H - 18} x1={X(0) - weld * k} x2={X(0)} color={color('weld')} className={dimmed('weld')} ext={bottom} />
      </svg>

      {chip('frameDeduction', X(F) + 12, 22, t('pauta.diagram.frameDeduction'), 'start')}
      {chip('sashOverlap', X(F) + 12, 52, t('pauta.diagram.overlap'), 'start')}
      {chip('sashWidth', X(sashEnd) + 12, 82, t('pauta.diagram.sashWidth'), 'start')}
      {chip('mullionDeduction', detailCx, 42, t('pauta.diagram.mullionDeduction'), 'center', true)}
      {chip('sashDeduction', OX - 28, (Y(sashStart) + Y(sashStart + D)) / 2, t('pauta.diagram.sashDeduction'), 'end', true)}
      {chip('glassGap', OX - 28, Y(glassEdge) + 34, t('pauta.diagram.gap'), 'end', true)}
      {chip('weld', X(0) + 12, H - 18, t('pauta.diagram.weld'), 'start')}
      {chip('reinforcement.frame', X(sashStart / 2), bottom - 34, t('pauta.diagram.steel'), 'center', true)}
      {chip('reinforcement.sash', X(sashStart + 44), bottom - 34, t('pauta.diagram.steel'), 'center', true)}
      {chip('reinforcement.mullion', detailCx, bottom - 34, t('pauta.diagram.steel'), 'center', true)}
    </div>
  )
}

/** Cota escrita en su lugar: se lee como cifra de plano y se escribe con un clic. */
function PautaChip({
  id,
  label,
  help,
  short,
  value,
  max,
  disabled,
  stack,
  align,
  active,
  muted,
  style,
  onChange,
  onActive,
}: {
  id: string
  label: string
  help: string
  short: string
  value: number | null
  max: number
  disabled: boolean
  stack?: boolean
  align: 'start' | 'end' | 'center'
  active: boolean
  muted: boolean
  style: React.CSSProperties
  onChange: (value: number | null) => void
  onActive: (hit: boolean) => void
}) {
  const t = useT(es)
  return (
    <div
      title={`${label}: ${help}`}
      onMouseEnter={() => onActive(true)}
      onMouseLeave={() => onActive(false)}
      style={style}
      className={cn(
        'absolute flex gap-x-1.5 transition-opacity duration-160',
        stack ? 'flex-col gap-y-0' : 'items-center',
        stack && (align === 'end' ? 'items-end' : 'items-center'),
        muted ? 'opacity-40' : 'opacity-100',
      )}
    >
      <NumberField
        id={id}
        aria-label={label}
        value={value}
        onChange={onChange}
        onFocus={() => onActive(true)}
        onBlur={() => onActive(false)}
        step={0.5}
        bigStep={5}
        min={0}
        max={max}
        unit={null}
        disabled={disabled}
        placeholder={t('common.noneDash')}
        className="w-14 shrink-0"
        inputClassName={cn(
          'h-6 touch:h-9 rounded-xs border px-1 text-center text-table font-semibold shadow-none',
          active ? 'border-[var(--dk-select)] bg-surface' : 'border-transparent bg-transparent hover:border-control hover:bg-surface',
          disabled && 'text-fg-muted',
        )}
      />
      <span className={cn('whitespace-nowrap text-meta', active ? 'text-fg-strong' : 'text-fg-muted')}>{short}</span>
    </div>
  )
}

function HDim({ y, x1, x2, color, className, ext }: { y: number; x1: number; x2: number; color: string; className?: string; ext: number }) {
  return (
    <g className={className} stroke={color} fill={color} pointerEvents="none">
      <line x1={x1} y1={y + (ext > y ? 5 : -5)} x2={x1} y2={ext} strokeWidth="0.6" strokeDasharray="2 2" opacity="0.55" />
      <line x1={x2} y1={y + (ext > y ? 5 : -5)} x2={x2} y2={ext} strokeWidth="0.6" strokeDasharray="2 2" opacity="0.55" />
      <line x1={x1 - 6} y1={y} x2={x2 + 6} y2={y} strokeWidth="1" />
      <line x1={x1 - TICK / 2} y1={y + TICK / 2} x2={x1 + TICK / 2} y2={y - TICK / 2} strokeWidth="1.3" />
      <line x1={x2 - TICK / 2} y1={y + TICK / 2} x2={x2 + TICK / 2} y2={y - TICK / 2} strokeWidth="1.3" />
    </g>
  )
}

function VDim({ x, y1, y2, color, className, ext }: { x: number; y1: number; y2: number; color: string; className?: string; ext: number }) {
  return (
    <g className={className} stroke={color} fill={color} pointerEvents="none">
      <line x1={x + 5} y1={y1} x2={ext} y2={y1} strokeWidth="0.6" strokeDasharray="2 2" opacity="0.55" />
      <line x1={x + 5} y1={y2} x2={ext} y2={y2} strokeWidth="0.6" strokeDasharray="2 2" opacity="0.55" />
      <line x1={x} y1={y1 - 6} x2={x} y2={y2 + 6} strokeWidth="1" />
      <line x1={x - TICK / 2} y1={y1 + TICK / 2} x2={x + TICK / 2} y2={y1 - TICK / 2} strokeWidth="1.3" />
      <line x1={x - TICK / 2} y1={y2 + TICK / 2} x2={x + TICK / 2} y2={y2 - TICK / 2} strokeWidth="1.3" />
    </g>
  )
}
