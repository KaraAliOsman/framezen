/**
 * Pictogramas del diseñador (20 × 20, currentColor, trazo 1,5) con la convención del rubro:
 * líneas desde las esquinas del lado de cierre al punto medio del lado de bisagras; continua si
 * abre hacia quien mira, discontinua si se aleja. Así el botón ya muestra cómo quedará el paño.
 */
import type { SVGProps } from 'react'
import type { OpeningKind } from '@framezen/engine'

interface GlyphProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number
}

function Svg({ size = 20, children, ...props }: GlyphProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export interface OpeningGlyphProps extends GlyphProps {
  kind: OpeningKind
  hinge?: 'left' | 'right'
  /** Discontinua si la hoja se aleja de quien mira. */
  away?: boolean
}

export function OpeningGlyph({ kind, hinge = 'left', away = false, ...props }: OpeningGlyphProps) {
  const door = kind === 'door'
  const x0 = door ? 5.5 : 3.5
  const x1 = door ? 14.5 : 16.5
  const y0 = door ? 2.5 : 3.5
  const y1 = door ? 17.5 : 16.5
  const xm = (x0 + x1) / 2
  const ym = (y0 + y1) / 2
  const i = 2.2 // margen interior del símbolo
  const turn = hinge === 'left' ? `M${x1 - i} ${y0 + i}L${x0 + i} ${ym}L${x1 - i} ${y1 - i}` : `M${x0 + i} ${y0 + i}L${x1 - i} ${ym}L${x0 + i} ${y1 - i}`
  const tilt = `M${x0 + i} ${y0 + i}L${xm} ${y1 - i}L${x1 - i} ${y0 + i}`
  const awning = `M${x0 + i} ${y1 - i}L${xm} ${y0 + i}L${x1 - i} ${y1 - i}`
  const dash = away ? '2.2 1.8' : undefined
  return (
    <Svg {...props}>
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={1} />
      {kind === 'fixed' ? <path d={`M${x0 + 3} ${y0 + 6.5}L${x0 + 6.5} ${y0 + 3}M${x0 + 3} ${y0 + 9.5}L${x0 + 9.5} ${y0 + 3}`} strokeWidth={1.1} opacity={0.55} /> : null}
      {kind === 'casement' || kind === 'door' || kind === 'tilt_turn' ? <path d={turn} strokeWidth={1.25} strokeDasharray={dash} /> : null}
      {kind === 'tilt_turn' || kind === 'tilt' ? <path d={tilt} strokeWidth={1.25} strokeDasharray={kind === 'tilt' ? dash : undefined} /> : null}
      {kind === 'awning' ? <path d={awning} strokeWidth={1.25} strokeDasharray={dash} /> : null}
      {door ? <path d={hinge === 'left' ? `M${x1 - 1.8} ${ym + 1}v2` : `M${x0 + 1.8} ${ym + 1}v2`} strokeWidth={1.6} /> : null}
    </Svg>
  )
}

export function SplitGlyph({ dir, parts, ...props }: GlyphProps & { dir: 'vertical' | 'horizontal'; parts: number }) {
  const lines: string[] = []
  for (let k = 1; k < parts; k++) {
    const t = 3.5 + (13 * k) / parts
    lines.push(dir === 'vertical' ? `M${t} 3.5V16.5` : `M3.5 ${t}H16.5`)
  }
  return (
    <Svg {...props}>
      <rect x={3.5} y={3.5} width={13} height={13} rx={1} />
      <path d={lines.join('')} />
    </Svg>
  )
}

/** Dos hojas que cierran una contra otra, sin travesaño fijo. */
export function FrenchGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <rect x={2.5} y={3.5} width={15} height={13} rx={1} />
      <path d="M10 3.5V16.5" strokeDasharray="1.6 1.6" opacity={0.7} />
      <path d="M8.2 5.5L4.3 10L8.2 14.5M11.8 5.5L15.7 10L11.8 14.5" strokeWidth={1.2} />
    </Svg>
  )
}

/** Quitar una división: el travesaño se tacha. */
export function MergeGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <rect x={3.5} y={3.5} width={13} height={13} rx={1} />
      <path d="M10 3.5V7M10 13V16.5" />
      <path d="M8 8.5l4 3M12 8.5l-4 3" strokeWidth={1.3} />
    </Svg>
  )
}

/** Repartir en partes iguales. */
export function EqualizeGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <rect x={2.5} y={3.5} width={15} height={13} rx={1} />
      <path d="M7.5 3.5V16.5M12.5 3.5V16.5" />
      <path d="M4 10h2M9 10h2M14 10h2" strokeWidth={1.2} opacity={0.75} />
    </Svg>
  )
}

/** Planta de una hoja que abre hacia quien mira (adentro, en vista interior) o se aleja. */
export function SwingGlyph({ toward, ...props }: GlyphProps & { toward: boolean }) {
  return (
    <Svg {...props}>
      <path d="M2.5 9.5H5.5M14.5 9.5H17.5" strokeWidth={1.8} />
      {toward ? (
        <>
          <path d="M5.5 9.5L12.2 15.6" />
          <path d="M14.5 9.5A9 9 0 0 1 12.2 15.6" strokeDasharray="1.4 1.6" opacity={0.7} />
        </>
      ) : (
        <>
          <path d="M5.5 9.5L12.2 3.4" />
          <path d="M14.5 9.5A9 9 0 0 0 12.2 3.4" strokeDasharray="1.4 1.6" opacity={0.7} />
        </>
      )}
    </Svg>
  )
}

/** Hoja de corredera: móvil (flecha) o fija («F»). */
export function SlideGlyph({ mode, ...props }: GlyphProps & { mode: 'left' | 'right' | 'fixed' }) {
  return (
    <Svg {...props}>
      <rect x={3.5} y={3.5} width={13} height={13} rx={1} />
      {mode === 'fixed' ? (
        <path d="M8.5 13.5V6.5H12M8.5 10H11.2" strokeWidth={1.4} />
      ) : mode === 'right' ? (
        <path d="M6.5 10H13.5M11.2 7.6L13.5 10L11.2 12.4" strokeWidth={1.4} />
      ) : (
        <path d="M13.5 10H6.5M8.8 7.6L6.5 10L8.8 12.4" strokeWidth={1.4} />
      )}
    </Svg>
  )
}

/** Vidrio (paño con reflejo). */
export function GlassGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <rect x={3.5} y={3.5} width={13} height={13} rx={1} strokeDasharray="2 1.6" />
      <path d="M6.5 10.5L10.5 6.5M6.5 13.5L13.5 6.5" strokeWidth={1.2} opacity={0.7} />
    </Svg>
  )
}
