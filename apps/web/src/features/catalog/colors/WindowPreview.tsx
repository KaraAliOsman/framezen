import { useId } from 'react'
import { isLightHex, type ColorAppearance } from './model'

export interface WindowPreviewProps {
  appearance: ColorAppearance
  /** 'window' = ventana completa; 'corner' = acercamiento a la esquina (se ve el inglete). */
  variant?: 'window' | 'corner'
  label: string
  className?: string
}

type Pt = [number, number]
type Piece = { points: Pt[]; along: 'h' | 'v'; side: 'top' | 'bottom' | 'left' | 'right' }

/** Anillo de cuatro piezas con ingletes a 45° (como se sueldan los perfiles de PVC). */
function ring(x: number, y: number, w: number, h: number, t: number): Piece[] {
  return [
    { side: 'top', along: 'h', points: [[x, y], [x + w, y], [x + w - t, y + t], [x + t, y + t]] },
    { side: 'bottom', along: 'h', points: [[x + t, y + h - t], [x + w - t, y + h - t], [x + w, y + h], [x, y + h]] },
    { side: 'left', along: 'v', points: [[x, y], [x + t, y + t], [x + t, y + h - t], [x, y + h]] },
    { side: 'right', along: 'v', points: [[x + w - t, y + t], [x + w, y], [x + w, y + h], [x + w - t, y + h - t]] },
  ]
}

const pts = (p: Pt[]) => p.map(([a, b]) => `${a},${b}`).join(' ')

// Medidas reales (mm) de una ventana practicable de una hoja.
const W = 1000
const H = 1200
const FRAME = 64
const SASH = 78
const SASH_INSET = FRAME - 12 // la hoja traslapa 12 mm sobre el marco (vista interior)
const BEAD = 22

/**
 * Vista previa del foliado en una ventana a escala real (mm): marco y hoja con ingletes, la veta a
 * lo largo de cada pieza (horizontal en travesaños, vertical en montantes), bisel con luz arriba a la
 * izquierda, burlete oscuro, vidrio casi neutro con un reflejo y manilla. Así se juzga la escala de
 * la veta y si la unión de la tesela se nota, antes de guardar.
 */
export function WindowPreview({ appearance, variant = 'window', label, className }: WindowPreviewProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  // La muestra vectorial de respaldo representa ~26 cm de material; la foto, su escala real.
  const scale = appearance.procedural ? 260 : Math.max(40, appearance.scaleMm)
  const tile = appearance.tileUrl
  const tinted = Boolean(appearance.tint)
  const light = isLightHex(appearance.hex)
  const frame = ring(0, 0, W, H, FRAME)
  const sx = SASH_INSET
  const sash = ring(sx, sx, W - 2 * sx, H - 2 * sx, SASH)
  const gx = sx + SASH
  const gw = W - 2 * gx
  const gh = H - 2 * gx
  const bead = ring(gx, gx, gw, gh, BEAD)
  const viewBox = variant === 'corner' ? `-30 -30 520 520` : `-40 -40 ${W + 80} ${H + 80}`
  const id = (name: string) => `${uid}-${name}`
  const fillFor = (piece: Piece) => (tile ? `url(#${id(piece.along === 'h' ? 'grain-h' : 'grain-v')})` : appearance.hex)

  const pieceGroup = (pieces: Piece[], depth: number) =>
    pieces.map((piece, i) => (
      <g key={`${piece.side}-${i}`}>
        <polygon points={pts(piece.points)} fill={tinted || !tile ? appearance.hex : fillFor(piece)} />
        {tinted && tile ? <polygon points={pts(piece.points)} fill={fillFor(piece)} style={{ mixBlendMode: 'soft-light' }} /> : null}
        <polygon points={pts(piece.points)} fill={`url(#${id(`bevel-${piece.side}`)})`} opacity={depth} />
        <polygon points={pts(piece.points)} fill="none" stroke="rgb(0 0 0 / 0.28)" strokeWidth={1.4} strokeLinejoin="round" />
      </g>
    ))

  return (
    <svg viewBox={viewBox} role="img" aria-label={label} className={className} preserveAspectRatio="xMidYMid meet">
      <defs>
        {tile ? (
          <>
            <pattern id={id('grain-h')} patternUnits="userSpaceOnUse" width={scale} height={scale}>
              <image href={tile} width={scale} height={scale} preserveAspectRatio="none" />
            </pattern>
            <pattern id={id('grain-v')} patternUnits="userSpaceOnUse" width={scale} height={scale} patternTransform="rotate(90)">
              <image href={tile} width={scale} height={scale} preserveAspectRatio="none" />
            </pattern>
          </>
        ) : null}
        {/* Bisel: luz de arriba a la izquierda, sombra abajo a la derecha (tres pasos suaves). */}
        <linearGradient id={id('bevel-top')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.34} />
          <stop offset="0.35" stopColor="#fff" stopOpacity={0.08} />
          <stop offset="1" stopColor="#000" stopOpacity={0.1} />
        </linearGradient>
        <linearGradient id={id('bevel-left')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity={0.24} />
          <stop offset="0.4" stopColor="#fff" stopOpacity={0.04} />
          <stop offset="1" stopColor="#000" stopOpacity={0.12} />
        </linearGradient>
        <linearGradient id={id('bevel-bottom')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={0.1} />
          <stop offset="0.6" stopColor="#000" stopOpacity={0.08} />
          <stop offset="1" stopColor="#000" stopOpacity={0.26} />
        </linearGradient>
        <linearGradient id={id('bevel-right')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity={0.08} />
          <stop offset="0.6" stopColor="#000" stopOpacity={0.06} />
          <stop offset="1" stopColor="#000" stopOpacity={0.22} />
        </linearGradient>
        <linearGradient id={id('glass')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E3ECEE" />
          <stop offset="0.55" stopColor="#D2DFE2" />
          <stop offset="1" stopColor="#C2D2D6" />
        </linearGradient>
        <linearGradient id={id('metal')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={light ? '#F4F5F3' : '#C9CDCF'} />
          <stop offset="0.5" stopColor={light ? '#FFFFFF' : '#E4E7E8'} />
          <stop offset="1" stopColor={light ? '#D9DCD8' : '#9EA4A7'} />
        </linearGradient>
        <clipPath id={id('glass-clip')}>
          <rect x={gx + BEAD} y={gx + BEAD} width={gw - 2 * BEAD} height={gh - 2 * BEAD} />
        </clipPath>
      </defs>

      {/* Vidrio con un reflejo único en diagonal y el canto verde del flotado apenas visible. */}
      <rect x={gx} y={gx} width={gw} height={gh} fill={`url(#${id('glass')})`} />
      <g clipPath={`url(#${id('glass-clip')})`}>
        <polygon points={pts([[gx + gw * 0.18, gx], [gx + gw * 0.46, gx], [gx, gx + gh * 0.42], [gx, gx + gh * 0.16]])} fill="#fff" opacity={0.28} />
        <polygon points={pts([[gx + gw * 0.56, gx], [gx + gw * 0.62, gx], [gx, gx + gh * 0.6], [gx, gx + gh * 0.54]])} fill="#fff" opacity={0.16} />
      </g>
      <rect x={gx + BEAD - 3} y={gx + BEAD - 3} width={gw - 2 * BEAD + 6} height={gh - 2 * BEAD + 6} fill="none" stroke="#1F2427" strokeWidth={6} />

      {pieceGroup(frame, 1)}
      {/* Sombra de la hoja sobre el marco. */}
      <rect x={sx + 2} y={sx + 4} width={W - 2 * sx} height={H - 2 * sx} fill="none" stroke="rgb(0 0 0 / 0.18)" strokeWidth={6} />
      {pieceGroup(sash, 0.9)}
      {pieceGroup(bead, 0.75)}

      {/* Manilla sobre roseta, en la hoja (lado de cierre, a media altura). */}
      <g transform={`translate(${W - sx - SASH / 2}, ${H / 2})`}>
        <rect x={-17} y={-40} width={34} height={80} rx={10} fill={`url(#${id('metal')})`} stroke="rgb(0 0 0 / 0.25)" strokeWidth={1.4} />
        <rect x={-10} y={-24} width={20} height={150} rx={10} fill={`url(#${id('metal')})`} stroke="rgb(0 0 0 / 0.3)" strokeWidth={1.4} />
      </g>
    </svg>
  )
}
