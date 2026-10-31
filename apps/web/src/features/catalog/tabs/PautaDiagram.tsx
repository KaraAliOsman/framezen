import type { Pauta } from '@framezen/engine'
import { cn } from '../../../lib/cn'
import { formatNumber } from '../../../lib/format'
import type { PautaKey } from '../model/pauta'

/**
 * Esquina superior izquierda de una ventana vista desde el interior, a escala, con las cotas de
 * la pauta: marco, luz (oculta tras la hoja), hoja que traslapa y vidrio con su holgura.
 * Resalta el valor que estás editando.
 */
export function PautaDiagram({
  pauta,
  frameFace,
  highlight,
  className,
}: {
  pauta: Pauta
  /** Cara vista del marco (mm). Si no se conoce: descuento + 20 (galce típico). */
  frameFace?: number
  highlight?: PautaKey | null
  className?: string
}) {
  const F = Math.max(0, pauta.frameDeduction)
  const O = Math.max(0, pauta.sashOverlap)
  const S = Math.max(1, pauta.sashWidth)
  const D = Math.max(0, pauta.sashDeduction)
  const G = Math.max(0, pauta.glassGap)
  const face = Math.max(frameFace ?? F + 20, F + 4)
  const sashStart = Math.max(0, F - O)
  const sashEnd = sashStart + S
  const glassEdge = sashStart + D + G
  const extent = Math.max(sashEnd, glassEdge, face) + 64

  const W = 400
  const H = 330
  const ox = 112
  const oy = 88
  let k = (W - ox - 8) / extent
  // Que siempre se vea un poco de vidrio bajo la hoja.
  const needY = Math.max(sashEnd, glassEdge) + 36
  if ((H - oy - 6) / k < needY) k = (H - oy - 6) / needY
  const X = (mm: number) => ox + mm * k
  const Y = (mm: number) => oy + mm * k
  const right = X(extent)
  const bottom = H - 4

  const on = (key: PautaKey) => highlight === key
  const fade = (key: PautaKey) => cn('transition-opacity duration-160', highlight && !on(key) ? 'opacity-30' : 'opacity-100')
  const color = (key: PautaKey) => (on(key) ? 'var(--ink-600)' : 'var(--ink-700)')
  const sashHot = on('sashWidth') || on('sashOverlap')
  const glassHot = on('sashDeduction') || on('glassGap')

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn('h-auto w-full select-none', className)}
      role="img"
      aria-label={`Esquina de la ventana: descuento de marco ${formatNumber(F, 1)} mm, traslapo ${formatNumber(O, 1)} mm, ancho de hoja ${formatNumber(S, 1)} mm, descuento de hoja ${formatNumber(D, 1)} mm, holgura ${formatNumber(G, 1)} mm`}
    >
      <defs>
        <clipPath id="fz-pauta-clip">
          <rect x={X(0)} y={Y(0)} width={right - X(0)} height={bottom - Y(0)} />
        </clipPath>
      </defs>

      <g clipPath="url(#fz-pauta-clip)">
        {/* Vidrio: empieza en su borde (oculto bajo la hoja) */}
        <rect x={X(glassEdge)} y={Y(glassEdge)} width={right} height={H} fill="#D9EBEE" />
        <path d={`M${X(sashEnd + 22)} ${bottom} L${right} ${Y(sashEnd + 6)}`} stroke="#fff" strokeWidth="1.6" />
        <path d={`M${X(sashEnd + 40)} ${bottom} L${right} ${Y(sashEnd + 24)}`} stroke="#fff" strokeWidth="1" />
        {/* Marco */}
        <path d={`M${X(0)} ${Y(0)} H${right} V${Y(face)} H${X(face)} V${bottom} H${X(0)} Z`} fill="#ECE8E1" stroke="#9C9489" strokeWidth="1" />
        <line x1={X(0)} y1={Y(0)} x2={X(face)} y2={Y(face)} stroke="#B9B2A6" strokeWidth="0.8" />
        {/* Hoja, por delante del marco */}
        <path
          d={`M${X(sashStart)} ${Y(sashStart)} H${right} V${Y(sashEnd)} H${X(sashEnd)} V${bottom} H${X(sashStart)} Z`}
          fill={sashHot ? 'var(--ink-50)' : '#FFFFFF'}
          stroke={sashHot ? 'var(--ink-500)' : '#7E776C'}
          strokeWidth="1"
        />
        <line x1={X(sashStart)} y1={Y(sashStart)} x2={X(sashEnd)} y2={Y(sashEnd)} stroke="#B9B2A6" strokeWidth="0.8" />
        {/* Luz: oculta tras la hoja */}
        <path
          d={`M${X(F)} ${bottom} V${Y(F)} H${right}`}
          fill="none"
          stroke="var(--ink-500)"
          strokeWidth={on('frameDeduction') || on('sashOverlap') ? 1.8 : 1}
          strokeDasharray="5 3"
        />
        {/* Borde del vidrio: oculto tras la hoja */}
        <path d={`M${X(glassEdge)} ${bottom} V${Y(glassEdge)} H${right}`} fill="none" stroke={glassHot ? 'var(--ink-600)' : '#5F8F99'} strokeWidth={glassHot ? 1.8 : 1} strokeDasharray="2 2.5" />
      </g>
      {/* Medida exterior */}
      <path d={`M${X(0)} ${bottom} V${Y(0)} H${right}`} fill="none" stroke="var(--paper-900)" strokeWidth="1.8" />

      {/* Rótulos de las piezas */}
      <g fontSize="11" fontWeight="500">
        {sashStart * k > 13 ? (
          <text x={right - 8} y={Y(sashStart / 2) + 4} textAnchor="end" fill="#6F685E">
            marco
          </text>
        ) : null}
        <text x={right - 8} y={Y((sashStart + sashEnd) / 2) + 4} textAnchor="end" fill={sashHot ? 'var(--ink-700)' : '#45403A'}>
          hoja
        </text>
        <text x={right - 8} y={bottom - 10} textAnchor="end" fill="#3F6870">
          vidrio
        </text>
        <text x={X(F) + 4} y={bottom - 10} fill="var(--ink-600)" fontWeight="400" fontSize="10.5">
          luz
        </text>
      </g>

      {/* Cotas horizontales (arriba) */}
      <HDim y={18} x1={X(0)} x2={X(F)} value={F} label="descuento de marco" color={color('frameDeduction')} className={fade('frameDeduction')} ext={Y(0)} />
      <HDim y={42} x1={X(sashStart)} x2={X(F)} value={O} label="traslapo" color={color('sashOverlap')} className={fade('sashOverlap')} ext={Y(sashStart)} />
      <HDim y={66} x1={X(sashStart)} x2={X(sashEnd)} value={S} label="ancho de hoja" color={color('sashWidth')} className={fade('sashWidth')} ext={Y(sashStart)} />

      {/* Cotas verticales (izquierda) */}
      <VDim x={ox - 18} y1={Y(sashStart)} y2={Y(sashStart + D)} value={D} label="descuento de hoja" color={color('sashDeduction')} className={fade('sashDeduction')} ext={X(sashStart)} />
      <VDim x={ox - 18} y1={Y(sashStart + D)} y2={Y(glassEdge)} value={G} label="holgura" color={color('glassGap')} className={fade('glassGap')} ext={X(sashStart)} below />
    </svg>
  )
}

const TICK = 5

function HDim({ y, x1, x2, value, label, color, className, ext }: { y: number; x1: number; x2: number; value: number; label: string; color: string; className?: string; ext: number }) {
  const narrow = x2 - x1 < 40
  return (
    <g className={className} stroke={color} fill={color}>
      <line x1={x1} y1={y + 5} x2={x1} y2={ext} strokeWidth="0.6" strokeDasharray="2 2" opacity="0.55" />
      <line x1={x2} y1={y + 5} x2={x2} y2={ext} strokeWidth="0.6" strokeDasharray="2 2" opacity="0.55" />
      <line x1={x1 - (narrow ? 8 : 0)} y1={y} x2={x2 + (narrow ? 8 : 0)} y2={y} strokeWidth="1" />
      <line x1={x1 - TICK / 2} y1={y + TICK / 2} x2={x1 + TICK / 2} y2={y - TICK / 2} strokeWidth="1.3" />
      <line x1={x2 - TICK / 2} y1={y + TICK / 2} x2={x2 + TICK / 2} y2={y - TICK / 2} strokeWidth="1.3" />
      <text x={narrow ? x2 + 13 : (x1 + x2) / 2} y={narrow ? y + 4 : y - 5} textAnchor={narrow ? 'start' : 'middle'} fontSize="11.5" stroke="none" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <tspan fontWeight="600">{formatNumber(value, 1)}</tspan>
        <tspan fill="var(--paper-600)"> {label}</tspan>
      </text>
    </g>
  )
}

function VDim({ x, y1, y2, value, label, color, className, ext, below }: { x: number; y1: number; y2: number; value: number; label: string; color: string; className?: string; ext: number; below?: boolean }) {
  const narrow = y2 - y1 < 28
  const ty = narrow ? (below ? y2 + 14 : y1 - 16) : (y1 + y2) / 2 - 2
  return (
    <g className={className} stroke={color} fill={color}>
      <line x1={x + 5} y1={y1} x2={ext} y2={y1} strokeWidth="0.6" strokeDasharray="2 2" opacity="0.55" />
      <line x1={x + 5} y1={y2} x2={ext} y2={y2} strokeWidth="0.6" strokeDasharray="2 2" opacity="0.55" />
      <line x1={x} y1={y1 - (narrow ? 6 : 0)} x2={x} y2={y2 + (narrow ? 6 : 0)} strokeWidth="1" />
      <line x1={x - TICK / 2} y1={y1 + TICK / 2} x2={x + TICK / 2} y2={y1 - TICK / 2} strokeWidth="1.3" />
      <line x1={x - TICK / 2} y1={y2 + TICK / 2} x2={x + TICK / 2} y2={y2 - TICK / 2} strokeWidth="1.3" />
      <text x={x - 7} y={ty} textAnchor="end" fontSize="11.5" stroke="none" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <tspan fontWeight="600">{formatNumber(value, 1)}</tspan>
        {label.split(' ').length > 2 ? (
          <>
            <tspan x={x - 7} dy="13" fill="var(--paper-600)">
              {label.split(' ').slice(0, 1).join(' ')}
            </tspan>
            <tspan x={x - 7} dy="13" fill="var(--paper-600)">
              {label.split(' ').slice(1).join(' ')}
            </tspan>
          </>
        ) : (
          <tspan x={x - 7} dy="13" fill="var(--paper-600)">
            {label}
          </tspan>
        )}
      </text>
    </g>
  )
}
