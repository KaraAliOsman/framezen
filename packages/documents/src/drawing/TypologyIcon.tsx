import type { ReactNode } from 'react'
import type { TypologyId } from '@framezen/engine'

/**
 * Pictogramas propios para la galería de tipologías. Trazo en currentColor para
 * heredar el color del contexto (lista, botón seleccionado, modo oscuro).
 */

type Leaf = { t: 'leaf'; o: 'fixed' | 'turn' | 'tiltturn' | 'tilt' | 'awning' | 'door'; hinge?: 'l' | 'r'; out?: boolean }
type Split = { t: 'split'; dir: 'v' | 'h'; sizes?: number[]; children: IconNode[]; french?: boolean }
type Slide = { t: 'slide'; panels: ('l' | 'r' | 'f')[]; rails: 1 | 2 | 3 }
type IconNode = Leaf | Split | Slide

interface IconSpec {
  /** Ancho / alto. */
  aspect: number
  shape?: 'arch' | 'trapezoid' | 'triangle'
  root: IconNode
}

const leaf = (o: Leaf['o'], hinge?: Leaf['hinge'], out?: boolean): Leaf => ({ t: 'leaf', o, hinge, out })
const vsplit = (children: IconNode[], sizes?: number[], french?: boolean): Split => ({ t: 'split', dir: 'v', children, sizes, french })
const hsplit = (children: IconNode[], sizes?: number[]): Split => ({ t: 'split', dir: 'h', children, sizes })
const slide = (panels: Slide['panels'], rails: Slide['rails'] = 2): Slide => ({ t: 'slide', panels, rails })

export const TYPOLOGY_ICON_SPECS: Record<TypologyId, IconSpec> = {
  fixed: { aspect: 1, root: leaf('fixed') },
  casement: { aspect: 0.78, root: leaf('turn', 'l') },
  casement_out: { aspect: 0.78, root: leaf('turn', 'l', true) },
  tilt_turn: { aspect: 0.78, root: leaf('tiltturn', 'l') },
  tilt: { aspect: 1.45, root: leaf('tilt') },
  awning: { aspect: 1.45, root: leaf('awning', undefined, true) },
  casement_double: { aspect: 1.2, root: vsplit([leaf('turn', 'l'), leaf('turn', 'r')], undefined, true) },
  fixed_casement: { aspect: 1.3, root: vsplit([leaf('fixed'), leaf('turn', 'r')]) },
  fixed_tilt_turn: { aspect: 1.3, root: vsplit([leaf('fixed'), leaf('tiltturn', 'r')]) },
  casement_transom: { aspect: 0.74, root: hsplit([leaf('fixed'), leaf('turn', 'l')], [0.3, 0.7]) },
  fixed_awning_bottom: { aspect: 0.9, root: hsplit([leaf('fixed'), leaf('awning', undefined, true)], [0.64, 0.36]) },
  fixed_3: { aspect: 1.8, root: vsplit([leaf('fixed'), leaf('fixed'), leaf('fixed')]) },
  casement_fixed_casement: { aspect: 1.8, root: vsplit([leaf('turn', 'l'), leaf('fixed'), leaf('turn', 'r')]) },
  door: { aspect: 0.46, root: leaf('door', 'l') },
  door_double: { aspect: 0.78, root: vsplit([leaf('door', 'l'), leaf('door', 'r')], undefined, true) },
  door_sidelight: { aspect: 0.66, root: vsplit([leaf('door', 'l'), leaf('fixed')], [0.66, 0.34]) },
  door_transom: { aspect: 0.44, root: hsplit([leaf('fixed'), leaf('door', 'l')], [0.2, 0.8]) },
  arch: { aspect: 1, shape: 'arch', root: leaf('fixed') },
  trapezoid: { aspect: 1, shape: 'trapezoid', root: leaf('fixed') },
  triangle: { aspect: 1.3, shape: 'triangle', root: leaf('fixed') },
  sliding_2: { aspect: 1.5, root: slide(['r', 'l']) },
  sliding_2_fixed: { aspect: 1.5, root: slide(['f', 'l']) },
  sliding_3: { aspect: 1.8, root: slide(['r', 'f', 'l']) },
  sliding_3_rail: { aspect: 1.8, root: slide(['f', 'l', 'l'], 3) },
  sliding_4: { aspect: 2, root: slide(['f', 'r', 'l', 'f']) },
  sliding_mono: { aspect: 1.5, root: slide(['f', 'l'], 1) },
}

/** Nombres comerciales por defecto de cada tipología (para la galería y los catálogos). */
export const TYPOLOGY_ICON_LABELS: Record<TypologyId, string> = {
  fixed: 'Paño fijo',
  casement: 'Abatible',
  casement_out: 'Abatible exterior',
  tilt_turn: 'Oscilobatiente',
  tilt: 'Oscilante',
  awning: 'Proyectante',
  casement_double: 'Abatible doble',
  fixed_casement: 'Fijo + abatible',
  fixed_tilt_turn: 'Fijo + oscilobatiente',
  casement_transom: 'Abatible con sobreluz',
  fixed_awning_bottom: 'Fijo con proyectante',
  fixed_3: 'Tres paños fijos',
  casement_fixed_casement: 'Abatible, fijo y abatible',
  door: 'Puerta',
  door_double: 'Puerta doble',
  door_sidelight: 'Puerta con lateral fijo',
  door_transom: 'Puerta con sobreluz',
  arch: 'Medio punto',
  trapezoid: 'Fijo irregular',
  triangle: 'Fijo triangular',
  sliding_2: 'Corredera 2 hojas',
  sliding_2_fixed: 'Corredera con fijo',
  sliding_3: 'Corredera 3 hojas',
  sliding_3_rail: 'Corredera 3 rieles',
  sliding_4: 'Corredera 4 hojas',
  sliding_mono: 'Corredera monorriel',
}

interface Box {
  x: number
  y: number
  w: number
  h: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

function rect(b: Box, props: Record<string, unknown> = {}, key?: string): ReactNode {
  return <rect key={key} x={r2(b.x)} y={r2(b.y)} width={r2(b.w)} height={r2(b.h)} {...props} />
}

function renderNode(node: IconNode, b: Box, out: ReactNode[], key: string, sw: number) {
  const thin = sw * 0.7
  if (node.t === 'split') {
    const n = node.children.length
    const sizes = node.sizes && node.sizes.length === n ? node.sizes : Array.from({ length: n }, () => 1 / n)
    let offset = 0
    node.children.forEach((child, i) => {
      const f = sizes[i]
      const cb = node.dir === 'v' ? { x: b.x + b.w * offset, y: b.y, w: b.w * f, h: b.h } : { x: b.x, y: b.y + b.h * offset, w: b.w, h: b.h * f }
      if (i > 0) {
        const d = node.dir === 'v' ? `M${r2(cb.x)} ${r2(b.y)}V${r2(b.y + b.h)}` : `M${r2(b.x)} ${r2(cb.y)}H${r2(b.x + b.w)}`
        out.push(<path key={`${key}-sep${i}`} d={d} strokeWidth={node.french ? thin : sw} />)
      }
      offset += f
      renderNode(child, cb, out, `${key}-${i}`, sw)
    })
    return
  }
  if (node.t === 'slide') {
    const n = node.panels.length
    const overlap = node.rails > 1 ? b.w * 0.04 : 0
    const pw = (b.w + overlap * (n - 1)) / n
    node.panels.forEach((p, i) => {
      const x = b.x + i * (pw - overlap)
      const lift = node.rails > 1 ? (i % node.rails) * 1.1 : 0
      const pb = { x, y: b.y + lift, w: pw, h: b.h - lift }
      out.push(rect(pb, { fill: 'currentColor', fillOpacity: 0.06, strokeWidth: thin }, `${key}-p${i}`))
      const inner = { x: pb.x + 2, y: pb.y + 2, w: pb.w - 4, h: pb.h - 4 }
      out.push(rect(inner, { strokeWidth: thin * 0.8, strokeOpacity: 0.6 }, `${key}-pi${i}`))
      const cy = inner.y + inner.h / 2
      if (p === 'f') {
        const fs = Math.min(inner.w, inner.h) * 0.42
        out.push(
          <text key={`${key}-f${i}`} x={r2(inner.x + inner.w / 2)} y={r2(cy + fs * 0.36)} fontSize={r2(fs)} textAnchor="middle" fill="currentColor" stroke="none" fontWeight={600} fillOpacity={0.75} fontFamily="inherit">
            F
          </text>,
        )
      } else {
        const a = inner.x + inner.w * 0.22
        const z = inner.x + inner.w * 0.78
        const [from, to] = p === 'r' ? [a, z] : [z, a]
        const s = p === 'r' ? -1 : 1
        const hd = Math.min(3, inner.w * 0.14)
        out.push(<path key={`${key}-a${i}`} d={`M${r2(from)} ${r2(cy)}H${r2(to)}M${r2(to + s * hd)} ${r2(cy - hd * 0.8)}L${r2(to)} ${r2(cy)}L${r2(to + s * hd)} ${r2(cy + hd * 0.8)}`} strokeWidth={thin} strokeOpacity={0.85} />)
      }
    })
    return
  }
  // Hoja o paño fijo.
  const sashed = node.o !== 'fixed'
  const g = sashed ? { x: b.x + 2.2, y: b.y + 2.2, w: b.w - 4.4, h: b.h - 4.4 } : b
  out.push(rect(g, { fill: 'currentColor', fillOpacity: 0.07, stroke: 'none' }, `${key}-g`))
  if (sashed) out.push(rect(g, { strokeWidth: thin }, `${key}-s`))
  const x0 = g.x
  const x1 = g.x + g.w
  const y0 = g.y
  const y1 = g.y + g.h
  const xm = g.x + g.w / 2
  const ym = g.y + g.h / 2
  const turn = node.hinge === 'r' ? `M${r2(x0)} ${r2(y0)}L${r2(x1)} ${r2(ym)}L${r2(x0)} ${r2(y1)}` : `M${r2(x1)} ${r2(y0)}L${r2(x0)} ${r2(ym)}L${r2(x1)} ${r2(y1)}`
  const tilt = `M${r2(x0)} ${r2(y0)}L${r2(xm)} ${r2(y1)}L${r2(x1)} ${r2(y0)}`
  const awning = `M${r2(x0)} ${r2(y1)}L${r2(xm)} ${r2(y0)}L${r2(x1)} ${r2(y1)}`
  const paths: string[] =
    node.o === 'turn' || node.o === 'door' ? [turn] : node.o === 'tiltturn' ? [turn, tilt] : node.o === 'tilt' ? [tilt] : node.o === 'awning' ? [awning] : []
  paths.forEach((d, i) =>
    out.push(<path key={`${key}-o${i}`} d={d} strokeWidth={thin} strokeOpacity={0.8} strokeDasharray={node.out ? '2.4 1.8' : undefined} />),
  )
  if (node.o === 'door') {
    const hx = node.hinge === 'r' ? x0 + 2.2 : x1 - 2.2
    out.push(<path key={`${key}-h`} d={`M${r2(hx)} ${r2(y0 + g.h * 0.5)}v${r2(g.h * 0.06)}`} strokeWidth={sw * 1.2} strokeLinecap="round" />)
  }
}

export interface TypologyIconProps {
  typologyId: TypologyId
  /** Lado del cuadrado en px (48 por defecto). */
  size?: number
  className?: string
  title?: string
  strokeWidth?: number
}

/** Pictograma de una tipología (ventana o puerta) en un cuadrado de `size` px. */
export function TypologyIcon({ typologyId, size = 48, className, title, strokeWidth = 1.5 }: TypologyIconProps) {
  const spec = TYPOLOGY_ICON_SPECS[typologyId] ?? TYPOLOGY_ICON_SPECS.fixed
  const S = 48
  const M = 5
  const avail = S - 2 * M
  const w = spec.aspect >= 1 ? avail : avail * spec.aspect
  const h = spec.aspect >= 1 ? avail / spec.aspect : avail
  const outer: Box = { x: (S - w) / 2, y: (S - h) / 2, w, h }
  const f = 3.2
  const inner: Box = { x: outer.x + f, y: outer.y + f, w: outer.w - 2 * f, h: outer.h - 2 * f }
  const parts: ReactNode[] = []
  const label = title ?? TYPOLOGY_ICON_LABELS[typologyId] ?? typologyId

  if (spec.shape) {
    const { x, y } = outer
    let outerD: string
    let innerD: string
    if (spec.shape === 'arch') {
      const rise = h * 0.42
      outerD = `M${r2(x)} ${r2(y + h)}V${r2(y + rise)}A${r2(w / 2)} ${r2(rise)} 0 0 1 ${r2(x + w)} ${r2(y + rise)}V${r2(y + h)}Z`
      innerD = `M${r2(x + f)} ${r2(y + h - f)}V${r2(y + rise)}A${r2(w / 2 - f)} ${r2(rise - f)} 0 0 1 ${r2(x + w - f)} ${r2(y + rise)}V${r2(y + h - f)}Z`
    } else if (spec.shape === 'trapezoid') {
      outerD = `M${r2(x)} ${r2(y + h * 0.45)}L${r2(x + w)} ${r2(y)}V${r2(y + h)}H${r2(x)}Z`
      innerD = `M${r2(x + f)} ${r2(y + h * 0.45 + f * 0.7)}L${r2(x + w - f)} ${r2(y + f * 1.9)}V${r2(y + h - f)}H${r2(x + f)}Z`
    } else {
      outerD = `M${r2(x + w / 2)} ${r2(y)}L${r2(x + w)} ${r2(y + h)}H${r2(x)}Z`
      innerD = `M${r2(x + w / 2)} ${r2(y + f * 2.4)}L${r2(x + w - f * 2.3)} ${r2(y + h - f)}H${r2(x + f * 2.3)}Z`
    }
    parts.push(<path key="g" d={innerD} fill="currentColor" fillOpacity={0.07} stroke="none" />)
    parts.push(<path key="o" d={outerD} strokeWidth={strokeWidth} strokeLinejoin="round" />)
    parts.push(<path key="i" d={innerD} strokeWidth={strokeWidth * 0.7} strokeLinejoin="round" />)
  } else {
    parts.push(rect(outer, { rx: 1.2, strokeWidth }, 'o'))
    parts.push(rect(inner, { strokeWidth: strokeWidth * 0.7 }, 'i'))
    renderNode(spec.root, inner, parts, 'n', strokeWidth)
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox={`0 0 ${S} ${S}`}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label={label}
      data-typology={typologyId}
    >
      <title>{label}</title>
      {parts}
    </svg>
  )
}
