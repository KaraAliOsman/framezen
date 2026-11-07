/**
 * Pictogramas del diseñador (20 × 20, currentColor, trazo 1,5, misma retícula que lucide) con la
 * convención del rubro: líneas desde las esquinas del lado de cierre al punto medio del lado de
 * bisagras; continua si abre hacia quien mira, discontinua si se aleja. Así el botón ya muestra
 * cómo quedará el paño. Incluye las aperturas v5 (pivotantes, osciloparalela, paralela, plegable),
 * las formas del marco y los accesorios.
 */
import type { SVGProps } from 'react'
import type { OpeningKind } from '@dekopen/engine'

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
  /** Osciloparalela y paralela: hacia dónde desliza (vista de quien mira). */
  slide?: 'left' | 'right'
}

export function OpeningGlyph({ kind, hinge = 'left', away = false, slide = 'right', ...props }: OpeningGlyphProps) {
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
  const arrow = slide === 'right' ? 'M6.5 13.6H13.5M11.6 11.9L13.5 13.6L11.6 15.3' : 'M13.5 13.6H6.5M8.4 11.9L6.5 13.6L8.4 15.3'
  return (
    <Svg {...props}>
      <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={1} />
      {kind === 'fixed' ? <path d={`M${x0 + 3} ${y0 + 6.5}L${x0 + 6.5} ${y0 + 3}M${x0 + 3} ${y0 + 9.5}L${x0 + 9.5} ${y0 + 3}`} strokeWidth={1.1} opacity={0.55} /> : null}
      {kind === 'casement' || kind === 'door' || kind === 'tilt_turn' ? <path d={turn} strokeWidth={1.25} strokeDasharray={dash} /> : null}
      {kind === 'tilt_turn' || kind === 'tilt' ? <path d={tilt} strokeWidth={1.25} strokeDasharray={kind === 'tilt' ? dash : undefined} /> : null}
      {kind === 'awning' ? <path d={awning} strokeWidth={1.25} strokeDasharray={dash} /> : null}
      {door ? <path d={hinge === 'left' ? `M${x1 - 1.8} ${ym + 1}v2` : `M${x0 + 1.8} ${ym + 1}v2`} strokeWidth={1.6} /> : null}
      {kind === 'pivot_v' ? (
        <>
          <path d="M10 4.6V15.4" strokeWidth={1.1} strokeDasharray="2.4 1.2 0.4 1.2" />
          <path d="M5.7 6.4L10 10L5.7 13.6M14.3 6.4L10 10L14.3 13.6" strokeWidth={1.2} />
        </>
      ) : null}
      {kind === 'pivot_h' ? (
        <>
          <path d="M4.6 10H15.4" strokeWidth={1.1} strokeDasharray="2.4 1.2 0.4 1.2" />
          <path d="M6.4 5.7L10 10L13.6 5.7M6.4 14.3L10 10L13.6 14.3" strokeWidth={1.2} />
        </>
      ) : null}
      {kind === 'tilt_slide' ? (
        <>
          <path d="M5.8 5.8L10 10.8L14.2 5.8" strokeWidth={1.2} />
          <path d={arrow} strokeWidth={1.3} />
        </>
      ) : null}
      {kind === 'parallel_slide' ? (
        <>
          <rect x={5.6} y={5.6} width={8.8} height={4.6} rx={0.6} strokeWidth={1} strokeDasharray="1.6 1.2" opacity={0.75} />
          <path d={arrow} strokeWidth={1.3} />
        </>
      ) : null}
      {kind === 'folding' ? <path d="M5.5 6.5L8.5 13.5L11.5 6.5L14.5 13.5" strokeWidth={1.25} /> : null}
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

/** Hojas unidas en acordeón (unión plegable). */
export function FoldGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <rect x={2.5} y={3.5} width={15} height={13} rx={1} />
      <path d="M4.5 6L7.5 14L10 6L12.5 14L15.5 6" strokeWidth={1.2} />
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

/** Hoja pasiva de una doble hoja francesa: la marcada con el inversor. */
export function PassiveGlyph({ side, ...props }: GlyphProps & { side: 'left' | 'right' }) {
  return (
    <Svg {...props}>
      <rect x={2.5} y={3.5} width={15} height={13} rx={1} />
      <path d="M10 3.5V16.5" strokeWidth={1.1} />
      <rect x={side === 'left' ? 3.8 : 11.3} y={4.8} width={4.9} height={10.4} rx={0.5} fill="currentColor" fillOpacity={0.18} stroke="none" />
      <path d={side === 'left' ? 'M12.5 10h3' : 'M4.5 10h3'} strokeWidth={1.6} />
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

export type ShapeGlyphKind = 'rect' | 'arch' | 'arch_segmental' | 'round' | 'oval' | 'pentagon' | 'octagon' | 'gable' | 'trapezoid' | 'triangle'

const SHAPE_PATHS: Record<ShapeGlyphKind, string> = {
  rect: 'M4 4.5H16V16H4Z',
  arch: 'M4 16V10A6 6 0 0 1 16 10V16Z',
  arch_segmental: 'M4 16V8.2Q10 3.6 16 8.2V16Z',
  round: 'M10 4A6 6 0 1 1 9.99 4Z',
  oval: 'M10 3.2A4.6 6.8 0 1 1 9.99 3.2Z',
  pentagon: 'M10 3.6L16.4 8.2L14 16H6L3.6 8.2Z',
  octagon: 'M7.4 4H12.6L16 7.4V12.6L12.6 16H7.4L4 12.6V7.4Z',
  gable: 'M4 16V9L10 3.8L16 9V16Z',
  trapezoid: 'M4 16V9.2L16 4.5V16Z',
  triangle: 'M3.6 16L10 4.2L16.4 16Z',
}

/** Contorno del marco para el selector de formas. */
export function ShapeGlyph({ kind, ...props }: GlyphProps & { kind: ShapeGlyphKind }) {
  return (
    <Svg {...props}>
      <path d={SHAPE_PATHS[kind]} />
    </Svg>
  )
}
