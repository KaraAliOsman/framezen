/**
 * Dibujo realista de una ventana (SVG en mm, dentro del grupo con la escala del viewport).
 *
 * Es una elevación con la física de un render, no una ilustración con sombras pegadas:
 *  - Cada perfil se dibuja por su sección (`sections.ts`) y cada franja toma su tono de su normal (`shading.ts`).
 *  - Lo que está delante tapa y proyecta sombra sobre lo que está detrás. Por dentro la hoja va sobre el
 *    marco; por fuera es al revés, y una hoja que abre hacia afuera invierte ambos casos.
 *  - El junquillo está en la cara interior: la vista exterior muestra solo el burlete contra el vidrio.
 *  - El vidrio es un entorno desenfocado común a toda la ventana, con un desfase leve por hoja porque
 *    cada hoja es otro plano. Nunca un brillo pegado en cada paño.
 *
 * Sin filtros ni desenfoques: imprime igual que se ve. El nivel de detalle (`DetailLevel`) sale de los
 * píxeles por milímetro, desde la miniatura de 64 px hasta la página completa.
 */
import type { ReactNode } from 'react'
import type { Catalog, Glass, Layout, LayoutSash, Rect, WindowDesign } from '@dekopen/engine'
import { patternSize } from '../textures/defs'
import type { ColorAppearance } from '../textures/resolve'
import { defaultDirection, defaultHandle, type DrawingView } from './geometry'
import { doorHandle, drainCaps, hardwareDefs, hardwareTone, hingeNodes, liftSlideHandle, slidingPull, windowHandle, type HardwareContext, type HingeShape } from './hardware'
import type { Pt } from './path'
import { expandRect, shrinkRect, windowGeometry, type GlazingGeometry, type ProfilePiece, type RingGeometry } from './pieces'
import { SECTIONS, shadeEdge, shadeRing, type Band, type DetailLevel, type SectionName } from './sections'
import { BUTT_GAP_MM, slidingPullSide } from './sliding'
import { mixHex, polyPath, rectPathD, tonesOf, VeilBatch, type Tones } from './shading'
import { tiledPolygon, type TileContext } from './tiles'
import { wallLayers } from './wall'

const NS = 'non-scaling-stroke' as const
const r1 = (n: number) => Math.round(n * 10) / 10

export interface RealisticInput {
  uid: string
  layout: Layout
  design: WindowDesign
  catalog: Catalog
  view: DrawingView
  /** Espejo de la vista exterior (el grupo en mm ya está espejado). */
  mirror: boolean
  /** px por mm. */
  scale: number
  appearance: ColorAppearance
  /** Id del `<pattern>` del foliado (null = color plano). */
  patternId: string | null
  /** Apariencia exterior (cajón de persiana, guías y alféizar se ven por fuera). */
  exterior: ColorAppearance
  exteriorPatternId: string | null
  /** Nivel de detalle ya resuelto. */
  level: DetailLevel
  /** Id del `<image>` del entorno del vidrio (null = degradado). */
  environmentId: string | null
  /** Muro alrededor (rect en mm que cubre todo el dibujo). */
  wall?: Rect
}

export interface RealisticOutput {
  defs: ReactNode[]
  body: ReactNode[]
}

interface Paint {
  a: ColorAppearance
  patternId: string | null
  tones: Tones
  mirror: boolean
  level: DetailLevel
  uid: string
  tiles: TileContext
}

const SHEET = (level: DetailLevel): 1 | 2 | 3 => (level <= 1 ? 1 : level === 2 ? 2 : 3)

// ── Piezas texturadas ────────────────────────────────────────────────────────

/**
 * Pieza con su foliado. Con tesela cargada recorta la imagen compartida (ver `tiles.tsx`); sin ella usa el
 * patrón de veta vectorial, que solo se ve un instante en pantalla mientras llega la imagen.
 */
function texturedPiece(piece: ProfilePiece, a: ColorAppearance, patternId: string | null, key: string, tiles: TileContext): ReactNode {
  if (!patternId) return <path key={key} d={polyPath(piece.polygon)} fill={a.hex} />
  if (a.href) return tiledPolygon(piece.polygon, piece.grain, piece.seed, a, patternId, tiles, key)
  const { w, h } = patternSize(a)
  const theta = (a.grain === 'none' ? 0 : piece.grain) + a.angleDeg
  const [ax, ay] = piece.polygon[0]
  const px = r1(((piece.seed % 1009) / 1009) * w)
  const py = r1((((piece.seed >>> 10) % 1013) / 1013) * h)
  const rad = (-theta * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const local = piece.polygon.map(([x, y]) => {
    const dx = x - ax
    const dy = y - ay
    return [dx * cos - dy * sin + px, dx * sin + dy * cos + py] as Pt
  })
  const transform = `translate(${r1(ax)} ${r1(ay)})${theta ? ` rotate(${Math.round(theta * 100) / 100})` : ''} translate(${-px} ${-py})`
  return <path key={key} d={polyPath(local)} transform={transform} fill={`url(#${patternId})`} />
}

/**
 * Tesela a usar según el nivel: en miniatura o a poca escala el foliado se promedia con el color plano,
 * y un grano fino recién se resuelve en vistas grandes.
 */
export function visibleTile(a: ColorAppearance, id: string | null, level: DetailLevel): string | null {
  if (!id || level < 2) return null
  if (a.source?.kind === 'upload') return id
  if (a.finish === 'smooth') return null
  if (a.finish === 'textured' && level < 3) return null
  return id
}

/** Cada barra sale de un tramo distinto del rollo de foliado: un matiz apenas distinto por pieza. */
function pieceTone(batch: VeilBatch, piece: ProfilePiece): void {
  batch.add(piece.polygon, (((piece.seed >>> 4) % 100) / 100 - 0.5) * 0.11)
}

const ringD = (r: RingGeometry) => rectPathD(r.outer) + rectPathD(r.inner)

interface RingOptions {
  section?: SectionName
  outline?: boolean
  /** Lados sin sombrear (umbral). */
  skip?: readonly ('top' | 'right' | 'bottom' | 'left')[]
}

/** Anillo: base plana (evita costuras de antialias), piezas con veta, franjas de luz, ingletes. */
function ringNodes(ring: RingGeometry, p: Paint, key: string, opts: RingOptions = {}): ReactNode[] {
  const { a, patternId, tones, mirror, level, uid, tiles } = p
  const out: ReactNode[] = []
  out.push(<path key={`${key}-b`} d={ringD(ring)} fillRule="evenodd" fill={a.hex} />)
  const batch = new VeilBatch(tones)
  for (const piece of ring.pieces) {
    if (piece.role === 'threshold') continue
    if (patternId) {
      out.push(texturedPiece(piece, a, patternId, `${key}-${piece.side}`, tiles))
      if (a.grain !== 'none') pieceTone(batch, piece)
    }
  }
  if (level >= 1) {
    shadeRing(batch, ring.outer, ring.inner, SECTIONS[opts.section ?? 'frame'][SHEET(level)], mirror, { skip: opts.skip })
    out.push(...batch.nodes(`${key}-v`, (k, d, fill, opacity) => <path key={k} d={d} fill={fill} fillOpacity={opacity} />))
    if (level >= 2) out.push(<path key={`${key}-s`} d={ringD(ring)} fillRule="evenodd" fill={`url(#${uid}-sheen)`} />)
  }
  if (level >= 2 && ring.seams.length) {
    const seams = ring.seams.map((s) => `M${r1(s.a[0])} ${r1(s.a[1])}L${r1(s.b[0])} ${r1(s.b[1])}`).join('')
    out.push(<path key={`${key}-w`} d={seams} fill="none" stroke={tones.seam} strokeOpacity={tones.seamOpacity} strokeWidth={0.5} vectorEffect={NS} />)
  }
  if (opts.outline !== false) out.push(<path key={`${key}-o`} d={rectPathD(ring.outer)} fill="none" stroke={tones.outline} strokeOpacity={level === 0 ? 0.9 : 0.6} strokeWidth={0.5} vectorEffect={NS} />)
  return out
}

/** Pieza recta (travesaño, inversor): franjas en ambos cantos, veta a lo largo, uniones a tope. */
function barNodes(piece: ProfilePiece, p: Paint, key: string, clip?: string): ReactNode {
  const { a, patternId, tones, mirror, level, uid, tiles } = p
  const [p0, p1, p2, p3] = piece.polygon
  const vertical = piece.grain === 90
  const parts: ReactNode[] = [<path key="b" d={polyPath(piece.polygon)} fill={a.hex} />]
  if (patternId) parts.push(texturedPiece(piece, a, patternId, 't', tiles))
  if (level >= 1) {
    const batch = new VeilBatch(tones)
    if (patternId && a.grain !== 'none') pieceTone(batch, piece)
    const section = SECTIONS.frame[SHEET(level)]
    const bandsA = section.outer
    const bandsB = [...section.inner].reverse()
    if (vertical) {
      shadeEdge(batch, p0, p3, [1, 0], [-1, 0], bandsA, mirror)
      shadeEdge(batch, p1, p2, [-1, 0], [-1, 0], bandsB.map((b) => ({ ...b, slope: -b.slope })), mirror)
    } else {
      shadeEdge(batch, p0, p1, [0, 1], [0, -1], bandsA, mirror)
      shadeEdge(batch, p3, p2, [0, -1], [0, -1], bandsB.map((b) => ({ ...b, slope: -b.slope })), mirror)
    }
    parts.push(...batch.nodes('v', (k, d, fill, opacity) => <path key={k} d={d} fill={fill} fillOpacity={opacity} />))
    if (level >= 2) {
      parts.push(<path key="s" d={polyPath(piece.polygon)} fill={`url(#${uid}-sheen)`} />)
      // Uniones a tope: una línea fina contra el miembro que la limita.
      const ends = vertical ? `M${r1(p0[0])} ${r1(p0[1])}H${r1(p1[0])}M${r1(p3[0])} ${r1(p3[1])}H${r1(p2[0])}` : `M${r1(p0[0])} ${r1(p0[1])}V${r1(p3[1])}M${r1(p1[0])} ${r1(p1[1])}V${r1(p2[1])}`
      parts.push(<path key="e" d={ends} fill="none" stroke={tones.seam} strokeOpacity={tones.seamOpacity} strokeWidth={0.5} vectorEffect={NS} />)
    }
  }
  parts.push(<path key="o" d={polyPath(piece.polygon)} fill="none" stroke={tones.outline} strokeOpacity={0.45} strokeWidth={0.5} vectorEffect={NS} />)
  return (
    <g key={key} clipPath={clip}>
      {parts}
    </g>
  )
}

/** Junquillo a inglete, su escalón contra la hoja y el burlete contra el vidrio. */
function glazingNodes(g: GlazingGeometry, p: Paint, key: string, withBead: boolean): ReactNode[] {
  const out: ReactNode[] = []
  const { level, tones, mirror } = p
  // A poca escala el burlete mide menos de un píxel: un filete conserva el borde del vidrio.
  if (level <= 1 && g.fill === 'glass' && !g.outline) out.push(<path key={`${key}-hl`} d={rectPathD(g.glass)} fill="none" stroke="#1F2325" strokeOpacity={0.5} strokeWidth={0.5} vectorEffect={NS} />)
  if (level === 0) return out
  if (withBead && g.bead) {
    if (level >= 2) out.push(<path key={`${key}-st`} d={rectPathD(expandRect(g.bead.outer, 1.4)) + rectPathD(g.bead.outer)} fillRule="evenodd" fill={tones.shadow} fillOpacity={0.5} />)
    out.push(...ringNodes(g.bead, p, `${key}-bd`, { section: 'bead', outline: false }))
  }
  if (g.gasket) {
    out.push(<path key={`${key}-g`} d={rectPathD(g.gasket.outer) + rectPathD(g.gasket.inner)} fillRule="evenodd" fill="#1F2325" />)
    if (level >= 3) {
      const batch = new VeilBatch({ ...tones, lit: 0.34, dark: 0, shadow: '#000000' })
      shadeRing(batch, g.gasket.outer, g.gasket.inner, { outer: [{ w: 1, slope: 1 }], inner: [] }, mirror)
      out.push(...batch.nodes(`${key}-gl`, (k, d, fill, opacity) => <path key={k} d={d} fill={fill} fillOpacity={opacity} />))
    }
  }
  return out
}

/** Sombra propia: la pieza desplazada hacia abajo y a la derecha de la pantalla, en escalones suaves. */
function castShadow(rect: Rect, mirror: boolean, depth: number, alpha: number, color: string, key: string, steps = 3): ReactNode {
  const sx = mirror ? -1 : 1
  const layers: ReactNode[] = []
  for (let i = 0; i < steps; i++) {
    const d = depth * ((i + 1) / steps)
    const moved = { x: rect.x + sx * d * 0.72, y: rect.y + d, w: rect.w, h: rect.h }
    layers.push(<path key={i} d={rectPathD(moved) + rectPathD(rect)} fillRule="evenodd" fill={color} fillOpacity={r1((alpha / steps) * 100) / 100} />)
  }
  return <g key={key}>{layers}</g>
}

/** Rendija entre una pieza y lo que tiene detrás. */
function revealNodes(rect: Rect, p: Paint, key: string): ReactNode {
  return <path key={key} d={rectPathD(expandRect(rect, 2.2)) + rectPathD(rect)} fillRule="evenodd" fill="#14181A" fillOpacity={p.a.isLight ? 0.55 : 0.72} />
}

/** Panel ciego: foliado vertical con moldura rehundida. */
/** Paso de las lamas de una celosía (de dibujo). */
const LOUVER_PITCH_MM = 60

/** Celosía: lamas inclinadas que se solapan vistas de frente; entre ellas solo se ve la sombra de la de arriba. */
function louverNodes(rect: Rect, p: Paint, key: string): ReactNode[] {
  const { a, level } = p
  const out: ReactNode[] = [<rect key={`${key}-bg`} x={r1(rect.x)} y={r1(rect.y)} width={r1(rect.w)} height={r1(rect.h)} fill={mixHex(a.hex, '#000000', 0.38)} />]
  const n = Math.max(2, Math.round(rect.h / LOUVER_PITCH_MM))
  const pitch = rect.h / n
  for (let i = 0; i < n; i++) {
    const y = rect.y + i * pitch
    out.push(<rect key={`${key}-l${i}`} x={r1(rect.x)} y={r1(y)} width={r1(rect.w)} height={r1(pitch * 0.86)} fill={a.hex} />)
    if (level >= 1) out.push(<rect key={`${key}-s${i}`} x={r1(rect.x)} y={r1(y + pitch * 0.6)} width={r1(rect.w)} height={r1(pitch * 0.26)} fill="#000000" fillOpacity={0.13} />)
  }
  return out
}

function panelNodes(rect: Rect, p: Paint, key: string): ReactNode[] {
  const { a, patternId, tones, mirror, level, tiles } = p
  const out: ReactNode[] = []
  const piece: ProfilePiece = {
    id: key,
    role: 'sash',
    owner: key,
    side: 'run',
    polygon: [
      [rect.x, rect.y],
      [rect.x + rect.w, rect.y],
      [rect.x + rect.w, rect.y + rect.h],
      [rect.x, rect.y + rect.h],
    ],
    grain: 90,
    joints: ['butt', 'butt'],
    outer: [
      [rect.x, rect.y],
      [rect.x + rect.w, rect.y],
    ],
    inner: [
      [rect.x, rect.y],
      [rect.x + rect.w, rect.y],
    ],
    normal: [0, -1],
    face: rect.w,
    seed: 7919,
  }
  out.push(<rect key={`${key}-b`} x={r1(rect.x)} y={r1(rect.y)} width={r1(rect.w)} height={r1(rect.h)} fill={a.hex} />)
  if (patternId) out.push(texturedPiece(piece, a, patternId, `${key}-t`, tiles))
  const inset = Math.min(90, Math.min(rect.w, rect.h) * 0.14)
  const outer = shrinkRect(rect, inset)
  const inner = shrinkRect(outer, 24)
  if (level >= 1 && inner.w > 40 && inner.h > 40) {
    const batch = new VeilBatch(tones)
    shadeRing(batch, outer, inner, SECTIONS.panelMould[SHEET(level)], mirror)
    out.push(...batch.nodes(`${key}-v`, (k, d, fill, opacity) => <path key={k} d={d} fill={fill} fillOpacity={opacity} />))
  }
  out.push(<path key={`${key}-o`} d={rectPathD(rect)} fill="none" stroke={tones.outline} strokeOpacity={0.5} strokeWidth={0.5} vectorEffect={NS} />)
  return out
}

// ── Vidrio ───────────────────────────────────────────────────────────────────

type GlassLook = 'clear' | 'lowe' | 'laminated' | 'frosted' | 'tinted'

function glassLook(glass: Pick<Glass, 'name' | 'kind'> | undefined): GlassLook {
  const name = (glass?.name ?? '').toLowerCase()
  if (/mate|satin|esmeril|frost|opal|arenad|acid|translúc|transluc|privacidad/.test(name)) return 'frosted'
  if (/bronce|bronze|tint|reflect|gris|fum[eé]|solar/.test(name)) return 'tinted'
  if (/low.?e|bajo emis/.test(name)) return 'lowe'
  if (glass?.kind === 'laminated' || /lamin/.test(name)) return 'laminated'
  return 'clear'
}

/** Velo del tipo de vidrio sobre el entorno. */
function glassVeil(look: GlassLook, view: DrawingView): { fill: string; opacity: number } | null {
  switch (look) {
    case 'frosted':
      return { fill: '#F3F6F5', opacity: 0.86 }
    case 'tinted':
      return { fill: '#3E4A4C', opacity: view === 'interior' ? 0.32 : 0.4 }
    case 'lowe':
      return { fill: '#7E9C96', opacity: 0.12 }
    case 'laminated':
      return { fill: '#E9F0EE', opacity: 0.14 }
    default:
      return null
  }
}

function glassDefs(uid: string, view: DrawingView, mirror: boolean, W: number, H: number): ReactNode[] {
  const interior = view === 'interior'
  const sheenX0 = mirror ? W * 1.05 : -W * 0.05
  const sheenX1 = mirror ? -W * 0.05 : W * 1.05
  const reach = W * 0.5 + H * 0.866
  return [
    // Respaldo del entorno y vidrio de miniaturas.
    <linearGradient key="glass" id={`${uid}-glass`} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0" stopColor={interior ? '#C8DBE7' : '#6A92AF'} />
      <stop offset="0.72" stopColor={interior ? '#EFF4F6' : '#B4C9D4'} />
      <stop offset="1" stopColor={interior ? '#DFE6E1' : '#74857F'} />
    </linearGradient>,
    <linearGradient key="refl" id={`${uid}-refl`} gradientUnits="userSpaceOnUse" x1={r1(sheenX0)} y1={0} x2={r1(sheenX0 + (mirror ? -1 : 1) * reach * 0.5)} y2={r1(reach * 0.866)}>
      <stop offset="0.1" stopColor="#FFFFFF" stopOpacity="0" />
      <stop offset="0.24" stopColor="#FFFFFF" stopOpacity={interior ? 0.2 : 0.17} />
      <stop offset="0.29" stopColor="#FFFFFF" stopOpacity={interior ? 0.11 : 0.1} />
      <stop offset="0.33" stopColor="#FFFFFF" stopOpacity={interior ? 0.18 : 0.14} />
      <stop offset="0.46" stopColor="#FFFFFF" stopOpacity="0" />
      <stop offset="0.68" stopColor="#FFFFFF" stopOpacity="0" />
      <stop offset="0.76" stopColor="#FFFFFF" stopOpacity={interior ? 0.1 : 0.09} />
      <stop offset="0.84" stopColor="#FFFFFF" stopOpacity="0" />
    </linearGradient>,
    <linearGradient key="shv" id={`${uid}-shv`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#0A1215" stopOpacity={interior ? 0.42 : 0.55} />
      <stop offset="0.4" stopColor="#0A1215" stopOpacity={interior ? 0.14 : 0.2} />
      <stop offset="1" stopColor="#0A1215" stopOpacity="0" />
    </linearGradient>,
    <linearGradient key="shh" id={`${uid}-shh`} x1={mirror ? 1 : 0} y1="0" x2={mirror ? 0 : 1} y2="0">
      <stop offset="0" stopColor="#0A1215" stopOpacity={interior ? 0.32 : 0.42} />
      <stop offset="0.4" stopColor="#0A1215" stopOpacity={interior ? 0.1 : 0.15} />
      <stop offset="1" stopColor="#0A1215" stopOpacity="0" />
    </linearGradient>,
    // Luz amplia sobre los perfiles, en coordenadas de toda la ventana.
    <linearGradient key="sheen" id={`${uid}-sheen`} gradientUnits="userSpaceOnUse" x1={r1(sheenX0)} y1={r1(-H * 0.05)} x2={r1(sheenX1)} y2={r1(H * 1.05)}>
      <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.1" />
      <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
      <stop offset="0.5" stopColor="#000000" stopOpacity="0" />
      <stop offset="1" stopColor="#000000" stopOpacity="0.09" />
    </linearGradient>,
  ]
}

function hashText(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Luz diagonal sobre el vidrio: un solo degradado para toda la ventana, sin bordes, recortado por los paños. */
function sheenBands(uid: string, W: number, H: number): ReactNode {
  return (
    <g key="refl" clipPath={`url(#${uid}-gclip)`}>
      <rect x={0} y={0} width={r1(W)} height={r1(H)} fill={`url(#${uid}-refl)`} />
    </g>
  )
}

// ── Composición ──────────────────────────────────────────────────────────────

function glazingsOf(g: ReturnType<typeof windowGeometry>): GlazingGeometry[] {
  return [...g.fixed, ...g.sashes.map((s) => s.glazing), ...g.sliders.map((s) => s.glazing)]
}

/** Capas del dibujo realista. `body` va dentro del grupo en mm; `defs` en el `<defs>` del dibujo. */
export function realisticLayers(input: RealisticInput): RealisticOutput {
  const { uid, layout, design, catalog, view, mirror, appearance: a, patternId, level, environmentId } = input
  const geometry = windowGeometry(layout, design)
  const tones = tonesOf(a)
  const tiles: TileContext = { uid, n: 0 }
  const paint: Paint = { a, patternId: visibleTile(a, patternId, level), tones, mirror, level, uid, tiles }
  const interior = view === 'interior'
  const W = layout.width
  const H = layout.height
  const defs: ReactNode[] = []
  const body: ReactNode[] = []
  const glazings = glazingsOf(geometry)
  const glassPanes = glazings.filter((g) => g.fill === 'glass')
  const hasGlass = glassPanes.length > 0
  const tone = hardwareTone(a)
  const hw: HardwareContext = { uid, tone, mirror, level }

  defs.push(...glassDefs(uid, view, mirror, W, H))
  if (level >= 1) defs.push(...hardwareDefs(uid, tone, mirror))

  const glassById = (id: string) => catalog.glass?.find((g) => g.id === id)
  const paneClips = glassPanes.map((g, i) => (g.outline ? <path key={i} d={g.outline} /> : <rect key={i} x={r1(g.glass.x)} y={r1(g.glass.y)} width={r1(g.glass.w)} height={r1(g.glass.h)} />))
  if (hasGlass) defs.push(<clipPath key="gclip" id={`${uid}-gclip`}>{paneClips}</clipPath>)
  const innerOutline = geometry.shaped?.inner
  const frameClip = innerOutline ? `url(#${uid}-fclip)` : undefined
  if (innerOutline) defs.push(<clipPath key="fclip" id={`${uid}-fclip`}><path d={innerOutline} /></clipPath>)

  // Muro alrededor, o sombra sobre el papel: la silueta corrida abajo a la derecha.
  const floorLeaf = geometry.sashes.some((s) => s.sash.opening.kind === 'door' || s.sash.opening.use === 'balcony' || s.sash.opening.use === 'entrance') || geometry.threshold
  const wall = input.wall ? wallLayers({ uid, rect: input.wall, layout, geometry, view, mirror, level, appearance: a, patternId: paint.patternId, tiles, floor: floorLeaf, hasSill: Boolean(layout.attachments?.sill) }) : null
  if (wall) {
    defs.push(...wall.defs)
    body.push(<g key="wall" data-part="wall">{wall.back}</g>)
  }
  const silhouette = geometry.shaped?.outer ?? rectPathD(layout.frame.rect)
  if (!wall && level >= 1) {
    const sx = mirror ? -1 : 1
    const steps = level >= 3 ? [16, 11, 6] : [11, 5]
    body.push(
      <g key="ground" data-part="ground-shadow">
        {steps.map((d) => (
          <path key={d} d={silhouette} transform={`translate(${r1(sx * d * 0.7)} ${r1(d)})`} fill="#1A2226" fillOpacity={level >= 3 ? 0.055 : 0.07} />
        ))}
      </g>,
    )
  }

  // ── Vidrio ────────────────────────────────────────────────────────────────
  glassPanes.forEach((g, i) => {
    const key = `g-${i}`
    const glassData = glassById(g.glassId || design.glassId)
    const look = glassLook(glassData)
    const shape = g.outline ? <path d={g.outline} /> : <rect x={r1(g.glass.x)} y={r1(g.glass.y)} width={r1(g.glass.w)} height={r1(g.glass.h)} />
    const veil = glassVeil(look, view)
    if (environmentId && level >= 2) {
      // Cada hoja es otro plano: el entorno se corre apenas de un paño a otro.
      const seed = hashText(g.owner)
      const sashPlane = geometry.sashes.some((s) => s.sash.nodeId === g.owner) || geometry.sliders.some((s) => s.panel.panelId === g.owner)
      const shiftX = sashPlane ? (((seed & 255) / 255) * 2 - 1) * 0.07 : 0
      const shiftY = sashPlane ? ((((seed >>> 8) & 255) / 255) * 2 - 1) * 0.03 : 0
      const k = 1.16
      const ex = -W * 0.08 + W * shiftX
      const ey = -H * 0.08 + H * shiftY
      defs.push(<clipPath key={`pc-${i}`} id={`${uid}-p${i}`}>{shape}</clipPath>)
      body.push(
        <g key={key} clipPath={`url(#${uid}-p${i})`}>
          <rect x={r1(g.glass.x)} y={r1(g.glass.y)} width={r1(g.glass.w)} height={r1(g.glass.h)} fill={`url(#${uid}-glass)`} />
          <use href={`#${environmentId}`} transform={`translate(${r1(ex)} ${r1(ey)}) scale(${r1(W * k)} ${r1(H * k)})`} />
        </g>,
      )
    } else {
      body.push(g.outline ? <path key={key} d={g.outline} fill={`url(#${uid}-glass)`} /> : <rect key={key} x={r1(g.glass.x)} y={r1(g.glass.y)} width={r1(g.glass.w)} height={r1(g.glass.h)} fill={`url(#${uid}-glass)`} />)
    }
    if (veil) body.push(g.outline ? <path key={`${key}-v`} d={g.outline} fill={veil.fill} fillOpacity={veil.opacity} /> : <rect key={`${key}-v`} x={r1(g.glass.x)} y={r1(g.glass.y)} width={r1(g.glass.w)} height={r1(g.glass.h)} fill={veil.fill} fillOpacity={veil.opacity} />)
  })

  // Persiana y mosquitero van tras el vidrio (vista interior): se ven a través de él.
  const att = layout.attachments
  const light = { x: layout.frame.face, y: layout.frame.face, w: W - 2 * layout.frame.face, h: H - 2 * layout.frame.face }
  const shutterColor = input.exterior.isLight ? '#E4E6E4' : mixHex(input.exterior.hex, '#000000', 0.06)
  const curtain = att?.rollerShutter ? { x: light.x, y: light.y, w: light.w, h: Math.min(light.h * 0.16, 340) } : null
  if (curtain) {
    defs.push(
      <pattern key="slat" id={`${uid}-slat`} patternUnits="userSpaceOnUse" width="39" height="39">
        <rect width="39" height="39" fill={shutterColor} />
        <rect width="39" height="6" fill="#FFFFFF" fillOpacity="0.22" />
        <rect y="30" width="39" height="6" fill="#000000" fillOpacity="0.12" />
        <rect y="36" width="39" height="3" fill="#000000" fillOpacity="0.34" />
      </pattern>,
    )
  }
  const curtainNodes = (k: string, opacity: number) =>
    curtain ? (
      <g key={k} clipPath={hasGlass ? `url(#${uid}-gclip)` : undefined} opacity={opacity}>
        <rect x={r1(curtain.x)} y={r1(curtain.y)} width={r1(curtain.w)} height={r1(curtain.h)} fill={level >= 2 ? `url(#${uid}-slat)` : shutterColor} />
        <rect x={r1(curtain.x)} y={r1(curtain.y + curtain.h - 16)} width={r1(curtain.w)} height={16} fill={mixHex(shutterColor, '#000000', 0.16)} />
        <rect x={r1(curtain.x)} y={r1(curtain.y + curtain.h)} width={r1(curtain.w)} height={26} fill="#000000" fillOpacity={0.1} />
      </g>
    ) : null

  const fineMesh = input.scale >= 1.8
  if (att?.insectScreen && hasGlass && level >= 1 && fineMesh) {
    defs.push(
      <pattern key="mesh" id={`${uid}-mesh`} patternUnits="userSpaceOnUse" width="2.2" height="2.2">
        <path d="M0 0H2.2M0 0V2.2" stroke="#1F2326" strokeWidth="0.32" strokeOpacity="0.6" fill="none" />
      </pattern>,
    )
  }
  const meshNodes = (k: string, opacity: number) =>
    att?.insectScreen && hasGlass && level >= 1 ? (
      <g key={k} clipPath={`url(#${uid}-gclip)`} opacity={opacity}>
        <rect x={0} y={0} width={r1(W)} height={r1(H)} fill={fineMesh ? `url(#${uid}-mesh)` : '#1F2326'} fillOpacity={fineMesh ? 1 : 0.24} />
        {att.insectScreen.type === 'pleated' && !interior ? (
          <path d={Array.from({ length: Math.floor(W / 32) }, (_, i) => `M${r1((i + 1) * 32)} 0V${r1(H)}`).join('')} stroke="#1F2326" strokeOpacity={0.2} strokeWidth={0.5} vectorEffect={NS} />
        ) : null}
      </g>
    ) : null

  if (interior) {
    const c = curtainNodes('curtain-in', 0.88)
    if (c) body.push(c)
    const m = meshNodes('mesh-in', 0.42)
    if (m) body.push(m)
  }

  if (hasGlass && level >= 2) body.push(sheenBands(uid, W, H))

  // Sombra que proyecta lo que rodea al vidrio: viene de arriba y del lado de la luz.
  if (hasGlass && level >= 2) {
    const k = interior ? 1 : 1.5
    glassPanes.forEach((g, i) => {
      if (g.outline) return
      const gr = g.glass
      const dv = Math.min(30 * k, gr.h * 0.12)
      const dh = Math.min(22 * k, gr.w * 0.12)
      const x = mirror ? gr.x + gr.w - dh : gr.x
      body.push(<rect key={`shv-${i}`} x={r1(gr.x)} y={r1(gr.y)} width={r1(gr.w)} height={r1(dv)} fill={`url(#${uid}-shv)`} />)
      body.push(<rect key={`shh-${i}`} x={r1(x)} y={r1(gr.y)} width={r1(dh)} height={r1(gr.h)} fill={`url(#${uid}-shh)`} />)
      // Canto oscuro de la unidad sellada y, con detalle, el reflejo del junquillo en la primera cara.
      body.push(<path key={`ed-${i}`} d={rectPathD(gr) + rectPathD(shrinkRect(gr, 2.4))} fillRule="evenodd" fill="#101619" fillOpacity={0.3} />)
      if (level >= 3) {
        const echo = shrinkRect(gr, 9)
        const ex0 = mirror ? echo.x + echo.w : echo.x
        body.push(<path key={`ec-${i}`} d={`M${r1(ex0)} ${r1(echo.y + echo.h)}V${r1(echo.y)}H${r1(mirror ? echo.x : echo.x + echo.w)}`} fill="none" stroke="#0A1215" strokeOpacity={0.09} strokeWidth={1.6} />)
      }
    })
  }

  // ── Perfiles, de atrás hacia adelante ─────────────────────────────────────
  const sashToward = (kind: LayoutSash['opening']) => (kind.direction ?? defaultDirection(kind.kind)) === 'in'
  /** La hoja queda delante del marco si abre hacia quien mira. */
  const inFront = (s: LayoutSash) => sashToward(s.opening) === interior

  const sashNodes = (s: (typeof geometry.sashes)[number], i: number, front: boolean) => {
    const parts: ReactNode[] = []
    const showBead = interior && level >= 1
    const ring = showBead ? s.ring : s.fullRing
    if (front && level >= 1) {
      parts.push(castShadow(s.sash.rect, mirror, level >= 3 ? 12 : 9, a.isLight ? 0.3 : 0.42, tones.shadow, 'sh', level >= 3 ? 4 : 2))
      if (level >= 2) parts.push(revealNodes(s.sash.rect, paint, 'rv'))
    }
    parts.push(...ringNodes(ring, paint, 'r', { section: 'sash' }))
    if (s.glazing.fill === 'panel') parts.push(...panelNodes(s.glazing.glass, paint, 'pn'))
    else if (s.glazing.fill === 'louver') parts.push(...louverNodes(s.glazing.glass, paint, 'lv'))
    else parts.push(...glazingNodes(s.glazing, paint, 'gz', showBead))
    if (s.sash.zocalo && s.zocaloBar) {
      if (showBead && s.zocaloBead) parts.push(...ringNodes(s.zocaloBead, paint, 'zbd', { section: 'bead', outline: false }))
      parts.push(...panelNodes(s.sash.zocalo.panel, paint, 'zp'), barNodes(s.zocaloBar, paint, 'zb'))
    }
    return (
      <g key={`s-${i}`} data-part="sash" data-node={s.sash.nodeId} clipPath={frameClip}>
        {parts}
      </g>
    )
  }

  // Lo que queda detrás del marco.
  geometry.sashes.forEach((s, i) => {
    if (!inFront(s.sash)) body.push(sashNodes(s, i, false))
  })

  const frenchNodes = () => {
    geometry.french.forEach((f, i) => {
      if (level >= 1) {
        const xs = f.polygon.map((p) => p[0])
        const ys = f.polygon.map((p) => p[1])
        const x = Math.min(...xs)
        const y = Math.min(...ys)
        body.push(castShadow({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }, mirror, 7, 0.26, tones.shadow, `fs-${i}`, 2))
      }
      body.push(barNodes(f, paint, `fm-${i}`))
    })
  }
  if (!geometry.sashes.some((s) => inFront(s.sash))) frenchNodes()

  // Correderas: corren dentro del marco, que las tapa. Rieles de atrás hacia adelante.
  const sliders = mirror ? [...geometry.sliders].reverse() : geometry.sliders
  sliders.forEach((s, i) => {
    const parts: ReactNode[] = []
    // Solo proyecta sombra lo que corre por delante de otro plano: el plano del fondo no tiene sobre qué.
    const raised = s.plane !== sliders[0].plane
    if (raised && level >= 1) parts.push(castShadow(s.rect, mirror, level >= 3 ? 16 : 11, 0.34, tones.shadow, 'sh', level >= 3 ? 4 : 2))
    if (raised && level >= 2) parts.push(revealNodes(s.rect, paint, 'rv'))
    const showBead = interior && level >= 1
    parts.push(...ringNodes(showBead ? s.ring : s.fullRing, paint, 'r', { section: 'sash' }))
    parts.push(...glazingNodes(s.glazing, paint, 'gz', showBead))
    body.push(
      <g key={`sl-${i}`} data-part="slider" data-node={s.panel.panelId}>
        {parts}
      </g>,
    )
  })
  // Encuentros: el traslapo sobre el canto de la hoja de adelante; a tope, la junta con su felpa.
  geometry.meetings.forEach(({ meeting: m, interlock }, i) => {
    if (interlock) {
      if (level >= 2) body.push(<g key={`il-${i}`} data-part="interlock">{barNodes(interior ? interlock.interior : interlock.exterior, paint, 'b')}</g>)
      return
    }
    const seam = m.axis === 'x' ? { x: m.at - BUTT_GAP_MM / 2, y: m.from, w: BUTT_GAP_MM, h: m.to - m.from } : { x: m.from, y: m.at - BUTT_GAP_MM / 2, w: m.to - m.from, h: BUTT_GAP_MM }
    body.push(<rect key={`il-${i}`} data-part="butt-joint" x={r1(seam.x)} y={r1(seam.y)} width={r1(seam.w)} height={r1(seam.h)} fill="#101416" />)
  })

  // Marco: proyecta sombra sobre lo que tiene detrás (hojas de atrás, correderas, vidrio por fuera).
  if (geometry.frame && level >= 1 && (!interior || geometry.sliders.length || geometry.sashes.some((s) => !inFront(s.sash)))) {
    body.push(castShadow(geometry.frame.inner, mirror, level >= 3 ? 14 : 10, a.isLight ? 0.3 : 0.42, tones.shadow, 'frame-sh', level >= 3 ? 3 : 2))
  }
  if (geometry.frame) {
    const nodes = ringNodes(geometry.frame, paint, 'fr', { section: 'frame', skip: geometry.threshold ? ['bottom'] : undefined })
    const threshold = geometry.frame.pieces.find((p) => p.role === 'threshold')
    if (threshold) {
      const [t0, , t2] = threshold.polygon
      const x = Math.min(threshold.polygon[0][0], threshold.polygon[1][0])
      const w = Math.abs(threshold.polygon[0][0] - threshold.polygon[1][0])
      const y = Math.min(t0[1], t2[1])
      const h = Math.abs(t2[1] - t0[1])
      defs.push(
        <linearGradient key="alu" id={`${uid}-alu`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E3E6E6" />
          <stop offset="0.3" stopColor="#BDC2C3" />
          <stop offset="0.72" stopColor="#A3A9AB" />
          <stop offset="1" stopColor="#7E8587" />
        </linearGradient>,
      )
      nodes.push(<rect key="th" x={r1(x)} y={r1(y)} width={r1(w)} height={r1(h)} fill={`url(#${uid}-alu)`} />)
      if (level >= 2) {
        nodes.push(
          <path key="th-r" d={[0.3, 0.62].map((t) => `M${r1(x)} ${r1(y + h * t)}H${r1(x + w)}`).join('')} stroke="#50585B" strokeOpacity={0.6} strokeWidth={1.6} fill="none" />,
          <path key="th-h" d={[0.3, 0.62].map((t) => `M${r1(x)} ${r1(y + h * t + 1.6)}H${r1(x + w)}`).join('')} stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={1} fill="none" />,
        )
      }
    }
    // Rieles de la corredera: canales paralelos en los perfiles inferior y superior.
    if (geometry.sliders.length && level >= 2 && !threshold) {
      const f = geometry.frame.inner
      const b = f.y + f.h
      const rails = Math.max(1, layout.rails ?? 2)
      const gap = (H - b) / (rails + 1)
      const lines = Array.from({ length: rails }, (_, i) => `M${r1(f.x)} ${r1(b + gap * (i + 1))}H${r1(f.x + f.w)}`).join('')
      const tops = Array.from({ length: rails }, (_, i) => `M${r1(f.x)} ${r1(f.y - gap * (i + 1))}H${r1(f.x + f.w)}`).join('')
      nodes.push(
        <path key="tr" d={lines} stroke="#0D1113" strokeOpacity={0.42} strokeWidth={2} fill="none" />,
        <path key="trt" d={tops} stroke="#0D1113" strokeOpacity={0.2} strokeWidth={1.4} fill="none" />,
        <path key="trh" d={lines} transform="translate(0 1.8)" stroke="#FFFFFF" strokeOpacity={a.isLight ? 0.7 : 0.14} strokeWidth={0.9} fill="none" />,
      )
    }
    body.push(<g key="frame" data-part="frame">{nodes}</g>)
  } else if (geometry.shaped) {
    body.push(<g key="frame" data-part="frame">{shapedFrameNodes(geometry.shaped, paint, defs)}</g>)
  }

  // Alféizar: vuelo con goterón y tapas, en el color exterior.
  if (att?.sill) {
    const s = att.sill.rect
    const ex = input.exterior
    const tone1 = ex.isLight ? '#E9EBE9' : mixHex(ex.hex, '#FFFFFF', 0.08)
    defs.push(
      <linearGradient key="sill" id={`${uid}-sill`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={mixHex(tone1, '#FFFFFF', 0.45)} />
        <stop offset="0.22" stopColor={tone1} />
        <stop offset="0.72" stopColor={mixHex(tone1, '#000000', 0.06)} />
        <stop offset="1" stopColor={mixHex(tone1, '#000000', 0.34)} />
      </linearGradient>,
    )
    body.push(
      <g key="sill" data-part="sill">
        <rect x={r1(s.x)} y={r1(s.y + s.h)} width={r1(s.w)} height={r1(Math.min(14, s.h * 0.5))} fill="#000000" fillOpacity={0.1} />
        <rect x={r1(s.x)} y={r1(s.y)} width={r1(s.w)} height={r1(s.h)} fill={`url(#${uid}-sill)`} />
        <rect x={r1(s.x)} y={r1(s.y)} width={10} height={r1(s.h)} fill="#000000" fillOpacity={0.12} />
        <rect x={r1(s.x + s.w - 10)} y={r1(s.y)} width={10} height={r1(s.h)} fill="#000000" fillOpacity={0.12} />
        <rect x={r1(s.x)} y={r1(s.y)} width={r1(s.w)} height={r1(s.h)} fill="none" stroke={tones.outline} strokeOpacity={0.5} strokeWidth={0.5} vectorEffect={NS} />
      </g>,
    )
  }

  // Travesaños (uniones en T), por delante del marco.
  geometry.mullions.forEach((m, i) => body.push(barNodes(m, paint, `m-${i}`, frameClip)))

  // Junquillos y burletes de los paños fijos.
  geometry.fixed.forEach((g, i) => {
    if (g.fill === 'panel') {
      body.push(<g key={`fp-${i}`}>{panelNodes(g.glass, paint, `fp-${i}`)}</g>)
      return
    }
    if (g.fill === 'louver') {
      body.push(<g key={`fl-${i}`}>{louverNodes(g.glass, paint, `fl-${i}`)}</g>)
      return
    }
    if (g.outline) {
      // Paño con forma: junquillo como banda a lo largo del contorno del vidrio.
      const clipId = `${uid}-bc${i}`
      const outer = geometry.shaped?.outer ?? rectPathD(layout.frame.rect)
      defs.push(<clipPath key={`bc${i}`} id={clipId}><path d={outer + g.outline} clipRule="evenodd" /></clipPath>)
      const wide = 2 * (g.beadWidth + g.gasketWidth)
      // Un trazo con foliado no se puede recortar con la tesela: el junquillo curvo va en el tono medio.
      const stroke = a.hex
      defs.push(
        <linearGradient key={`bevel${i}`} id={`${uid}-bevel`} gradientUnits="userSpaceOnUse" x1={r1(mirror ? W * 0.85 : W * 0.15)} y1={r1(H * 0.1)} x2={r1(mirror ? W * 0.15 : W * 0.85)} y2={r1(H * 0.9)}>
          <stop offset="0" stopColor={tones.shadow} stopOpacity={0.3} />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity={Math.min(0.42, tones.lit * 0.7)} />
        </linearGradient>,
      )
      body.push(
        <g key={`fg-${i}`} clipPath={`url(#${clipId})`}>
          {interior && level >= 2 ? <path d={g.outline} fill="none" stroke={tones.shadow} strokeOpacity={0.5} strokeWidth={wide + 2.8} /> : null}
          {interior ? <path d={g.outline} fill="none" stroke={stroke} strokeWidth={wide} /> : null}
          {interior && level >= 2 ? <path d={g.outline} fill="none" stroke={`url(#${uid}-bevel)`} strokeWidth={wide} /> : null}
          <path d={g.outline} fill="none" stroke="#1F2325" strokeWidth={2 * g.gasketWidth} />
        </g>,
      )
      return
    }
    body.push(<g key={`fg-${i}`}>{glazingNodes(g, paint, `fg-${i}`, interior)}</g>)
  })

  // Hojas delante del marco.
  geometry.sashes.forEach((s, i) => {
    if (inFront(s.sash)) body.push(sashNodes(s, i, true))
  })

  // Inversor de la doble hoja: va con las hojas, delante del marco solo si ellas lo están.
  if (geometry.sashes.some((s) => inFront(s.sash))) frenchNodes()

  // Holguras de plegables.
  geometry.folds.forEach((r, i) => body.push(<rect key={`fold-${i}`} x={r1(r.x - 1)} y={r1(r.y)} width={r1(r.w + 2)} height={r1(r.h)} fill="#101416" fillOpacity={0.9} />))

  // ── Herrajes ──────────────────────────────────────────────────────────────
  if (level >= 1) {
    geometry.sashes.forEach((s) => {
      const sash = s.sash
      const kind = sash.opening.kind
      if (kind === 'fixed') return
      const toward = sashToward(sash.opening) === interior
      const entrance = kind === 'door' || sash.opening.use === 'entrance'
      const balcony = sash.opening.use === 'balcony'
      const door = entrance || balcony
      const hinge = sash.opening.hinge ?? 'left'
      const rect = sash.rect
      if (toward) {
        const node = hingeNodes(hw, hingeRects(sash, door), `hg-${sash.nodeId}`)
        if (node) body.push(node)
      }
      // La manilla de una ventana está siempre por dentro; por fuera solo la de una puerta de acceso.
      if ((!interior && !entrance) || sash.passive) return
      const side = sash.handle ?? defaultHandle(sash.opening)
      if (!side) return
      const face = side === 'left' ? s.ring.faces.left : side === 'right' ? s.ring.faces.right : side === 'top' ? s.ring.faces.top : s.ring.faces.bottom
      let cx: number
      let cy: number
      if (side === 'left' || side === 'right') {
        cx = side === 'left' ? rect.x + face / 2 : rect.x + rect.w - face / 2
        cy = door ? Math.min(rect.y + rect.h - 260, Math.max(rect.y + rect.h * 0.4, H - 1050)) : rect.y + rect.h / 2
      } else {
        cx = rect.x + rect.w / 2
        cy = side === 'top' ? rect.y + face / 2 : rect.y + rect.h - face / 2
      }
      if (entrance) body.push(doorHandle(hw, cx, cy, hinge === 'left' ? -1 : 1, `hd-${sash.nodeId}`))
      else body.push(windowHandle(hw, cx, cy, side === 'left' || side === 'right' ? 0 : -90, `hd-${sash.nodeId}`))
    })
    if (interior) {
      const lift = layout.slidingSystem === 'lift_slide'
      geometry.sliders.forEach((s) => {
        const p = s.panel
        const side = slidingPullSide(layout, p)
        if (!side) return
        const r = s.rect
        if (side === 'top' || side === 'bottom') {
          // Guillotina: tirador acostado en el travesaño con que se toma la hoja.
          const y = side === 'top' ? r.y + s.fullRing.faces.top / 2 : r.y + r.h - s.fullRing.faces.bottom / 2
          body.push(<g key={`pull-${p.panelId}`} transform={`rotate(90 ${r1(r.x + r.w / 2)} ${r1(y)})`}>{slidingPull(hw, r.x + r.w / 2, y, Math.min(190, r.w * 0.24), 'p')}</g>)
          return
        }
        // El tirador va en lo que se ve del montante: un encuentro a tope deja medio, y el marco tapa el borde.
        const frameEdge = layout.frame.face || 0
        const x0 = side === 'left' ? Math.max(r.x, frameEdge) : p.glassRect.x + p.glassRect.w
        const x1 = side === 'left' ? p.glassRect.x : Math.min(r.x + r.w, W - frameEdge)
        const stile = Math.max(0, x1 - x0)
        const x = (x0 + x1) / 2
        if (lift) body.push(liftSlideHandle(hw, x, Math.max(r.y + 330, Math.min(r.y + r.h - 180, H - 1050)), `pull-${p.panelId}`))
        else body.push(slidingPull(hw, x, r.y + r.h * 0.5, Math.min(190, r.h * 0.24), `pull-${p.panelId}`, Math.min(28, stile * 0.62)))
      })
    }
    // Bisagras entre hojas plegables.
    geometry.folds.forEach((r, i) => {
      const caps = [0.12, 0.5, 0.88].map((t) => ({ x: r.x + r.w / 2 - 9, y: r.y + r.h * t - 40, w: 18, h: 80 }))
      const node = hingeNodes(hw, caps, `fh-${i}`)
      if (node) body.push(node)
    })
    // Drenajes del perfil inferior, solo por fuera.
    if (!interior && geometry.frame && !geometry.threshold) {
      // Una hoja que abre hacia afuera tapa el perfil: el drenaje queda en la franja que asoma bajo ella.
      const lowestFront = Math.max(0, ...geometry.sashes.filter((s) => inFront(s.sash)).map((s) => s.sash.rect.y + s.sash.rect.h))
      const y = Math.max(H - layout.frame.face * 0.52, (lowestFront + H) / 2)
      const spans = geometry.sliders.length ? geometry.sliders.map((s) => s.panel.rect) : geometry.sashes.length ? geometry.sashes.filter((s) => s.sash.rect.y + s.sash.rect.h > H - layout.frame.face - 4).map((s) => s.sash.rect) : geometry.fixed.map((g) => g.glass)
      const xs = spans.flatMap((r) => (r.w > 420 ? [r.x + 130, r.x + r.w - 130] : [r.x + r.w / 2]))
      const node = drainCaps(hw, y, xs, a.isLight ? '#F1F2F0' : mixHex(a.hex, '#000000', 0.18), 'drains')
      if (node) body.push(node)
    }
  }

  // Cajón de persiana (monoblock y exterior); las guías y la cortina se ven por fuera.
  if (att?.rollerShutter) {
    const rs = att.rollerShutter
    const ex = input.exterior
    const exTones = tonesOf(ex)
    if (rs.type !== 'integrated' && rs.box.h > 0) {
      const box = rs.box
      const piece: ProfilePiece = {
        id: 'box',
        role: 'frame',
        owner: 'box',
        side: 'run',
        polygon: [
          [box.x, box.y],
          [box.x + box.w, box.y],
          [box.x + box.w, box.y + box.h],
          [box.x, box.y + box.h],
        ],
        grain: 0,
        joints: ['butt', 'butt'],
        outer: [
          [box.x, box.y],
          [box.x + box.w, box.y],
        ],
        inner: [
          [box.x, box.y + box.h],
          [box.x + box.w, box.y + box.h],
        ],
        normal: [0, -1],
        face: box.h,
        seed: 4049,
      }
      const boxA = interior ? a : ex
      const boxPattern = visibleTile(boxA, interior ? patternId : input.exteriorPatternId, level)
      const boxTones = interior ? tones : exTones
      const lid = box.y + box.h * 0.42
      const batch = new VeilBatch(boxTones)
      if (level >= 1) {
        shadeEdge(batch, [box.x, box.y], [box.x + box.w, box.y], [0, 1], [0, -1], SECTIONS.frame[SHEET(level)].outer, mirror)
        shadeEdge(batch, [box.x, box.y + box.h - 6], [box.x + box.w, box.y + box.h - 6], [0, 1], [0, 1], [{ w: 6, slope: -0.8 }] as Band[], mirror)
      }
      body.push(
        <g key="box" data-part="shutter-box">
          <rect x={r1(box.x)} y={r1(box.y)} width={r1(box.w)} height={r1(box.h)} fill={boxA.hex} />
          {texturedPiece(piece, boxA, boxPattern, 'bt', tiles)}
          {batch.nodes('v', (k, d, fill, opacity) => <path key={k} d={d} fill={fill} fillOpacity={opacity} />)}
          {level >= 2 && interior ? <path d={`M${r1(box.x + 18)} ${r1(lid)}H${r1(box.x + box.w - 18)}`} stroke={boxTones.outline} strokeOpacity={0.6} strokeWidth={0.6} vectorEffect={NS} /> : null}
          <rect x={r1(box.x)} y={r1(box.y)} width={14} height={r1(box.h)} fill="#000000" fillOpacity={0.07} />
          <rect x={r1(box.x + box.w - 14)} y={r1(box.y)} width={14} height={r1(box.h)} fill="#000000" fillOpacity={0.07} />
          <rect x={r1(box.x)} y={r1(box.y)} width={r1(box.w)} height={r1(box.h)} fill="none" stroke={boxTones.outline} strokeOpacity={0.6} strokeWidth={0.5} vectorEffect={NS} />
        </g>,
      )
    }
    if (!interior) {
      const c = curtainNodes('curtain-ex', 1)
      if (c) body.push(c)
      rs.guides.forEach((g, i) =>
        body.push(
          <g key={`guide-${i}`}>
            <rect x={r1(g.x)} y={r1(g.y)} width={r1(g.w)} height={r1(g.h)} fill={shutterColor} />
            <rect x={r1(g.x + g.w * 0.42)} y={r1(g.y)} width={r1(g.w * 0.16)} height={r1(g.h)} fill="#000000" fillOpacity={0.24} />
            <rect x={r1(g.x)} y={r1(g.y)} width={r1(g.w)} height={r1(g.h)} fill="none" stroke={exTones.outline} strokeOpacity={0.6} strokeWidth={0.5} vectorEffect={NS} />
          </g>,
        ),
      )
    }
  }
  if (!interior) {
    const m = meshNodes('mesh-ex', 0.75)
    if (m) body.push(m)
    if (att?.insectScreen?.type === 'roller' && hasGlass && !att.rollerShutter) {
      const cassette = { x: 0, y: 0, w: W, h: Math.min(52, layout.frame.face * 0.8) }
      body.push(
        <g key="cassette" data-part="screen-cassette">
          <rect x={0} y={r1(cassette.h)} width={r1(W)} height={10} fill={tones.shadow} fillOpacity={0.16} />
          <rect x={0} y={0} width={r1(W)} height={r1(cassette.h)} fill={shutterColor} />
          <rect x={0} y={0} width={r1(W)} height={2} fill="#FFFFFF" fillOpacity={0.3} />
          <rect x={0} y={0} width={r1(W)} height={r1(cassette.h)} fill="none" stroke={tones.outline} strokeOpacity={0.6} strokeWidth={0.5} vectorEffect={NS} />
        </g>,
      )
    }
  }

  if (wall) body.push(<g key="wall-front">{wall.front}</g>)
  return { defs, body }
}

/** Junta dovelas de a tres para el foliado: 15° por tramo no se notan y ahorran recortes. */
function foilSectors(pieces: readonly ProfilePiece[]): ProfilePiece[] {
  const out: ProfilePiece[] = []
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i]
    if (piece.side !== 'arc') {
      out.push(piece)
      continue
    }
    const run: ProfilePiece[] = [piece]
    while (run.length < 3 && pieces[i + 1]?.side === 'arc' && pieces[i + 1].seed === piece.seed) run.push(pieces[++i])
    const outer = run.map((r) => r.polygon[0]).concat([run[run.length - 1].polygon[1]])
    const inner = run.map((r) => r.polygon[3]).concat([run[run.length - 1].polygon[2]])
    const mid = run[Math.floor(run.length / 2)]
    out.push({ ...mid, polygon: [...outer, ...inner.reverse()], seed: mid.seed + i })
  }
  return out
}

/** Marco con forma: dovelas con veta, franjas por normal y contorno exacto (arcos sin facetas). */
function shapedFrameNodes(sh: NonNullable<ReturnType<typeof windowGeometry>['shaped']>, p: Paint, defs: ReactNode[]): ReactNode[] {
  const { a, patternId, tones, mirror, level, uid, tiles } = p
  const parts: ReactNode[] = [<path key="b" d={sh.outer + sh.inner} fillRule="evenodd" fill={a.hex} />]
  if (sh.pieces.length) {
    // Las dovelas son cuerdas: se recortan a la banda real del marco.
    defs.push(<clipPath key="band" id={`${uid}-band`}><path d={sh.outer + sh.inner} clipRule="evenodd" /></clipPath>)
    const group: ReactNode[] = []
    if (patternId) group.push(...foilSectors(sh.pieces).map((piece, i) => texturedPiece(piece, a, patternId, `p${i}`, tiles)))
    if (level >= 1) {
      const batch = new VeilBatch(tones)
      const section = SECTIONS.frame[SHEET(level)]
      const innerBands = [...section.inner].reverse()
      for (const piece of sh.pieces) {
        const inward: Pt = [-piece.normal[0], -piece.normal[1]]
        shadeEdge(batch, piece.outer[0], piece.outer[1], inward, piece.normal, section.outer, mirror)
        shadeEdge(batch, piece.inner[0], piece.inner[1], piece.normal, piece.normal, innerBands, mirror)
      }
      group.push(...batch.nodes('v', (k, d, fill, opacity) => <path key={k} d={d} fill={fill} fillOpacity={opacity} />))
      if (level >= 2) group.push(<path key="s" d={sh.outer + sh.inner} fillRule="evenodd" fill={`url(#${uid}-sheen)`} />)
    }
    parts.push(<g key="pieces" clipPath={`url(#${uid}-band)`}>{group}</g>)
    if (level >= 2) {
      const seams = sh.seams.map((s) => `M${r1(s.a[0])} ${r1(s.a[1])}L${r1(s.b[0])} ${r1(s.b[1])}`).join('')
      parts.push(<path key="seams" d={seams} fill="none" stroke={tones.seam} strokeOpacity={tones.seamOpacity} strokeWidth={0.5} vectorEffect={NS} />)
    }
  } else if (patternId) {
    parts.push(<path key="t" d={sh.outer + sh.inner} fillRule="evenodd" fill={`url(#${patternId})`} />)
  }
  parts.push(<path key="o" d={sh.outer} fill="none" stroke={tones.outline} strokeOpacity={0.6} strokeWidth={0.5} vectorEffect={NS} />)
  return parts
}

/** Bisagras a la vista: dos de canuto en ventanas (arriba y abajo), tres en puertas. */
function hingeRects(sash: LayoutSash, door: boolean): HingeShape[] {
  const r = sash.rect
  const kind = sash.opening.kind
  if (kind === 'tilt') {
    return [r.x + 80, r.x + r.w - 80].map((x) => ({ x: x - 32, y: r.y + r.h - 8, w: 64, h: 15 }))
  }
  if (kind === 'awning' || kind === 'pivot_h' || kind === 'pivot_v' || kind === 'tilt_slide' || kind === 'parallel_slide' || kind === 'folding') {
    if (kind === 'pivot_v') {
      const f = Math.min(0.95, Math.max(0.05, sash.opening.pivot ?? 0.5))
      const x = r.x + r.w * f
      return [
        { x: x - 11, y: r.y - 6, w: 22, h: 14 },
        { x: x - 11, y: r.y + r.h - 8, w: 22, h: 14 },
      ]
    }
    if (kind === 'pivot_h') {
      const f = Math.min(0.95, Math.max(0.05, sash.opening.pivot ?? 0.5))
      const y = r.y + r.h * f
      return [
        { x: r.x - 6, y: y - 11, w: 14, h: 22 },
        { x: r.x + r.w - 8, y: y - 11, w: 14, h: 22 },
      ]
    }
    return []
  }
  const x = (sash.opening.hinge ?? 'left') === 'left' ? r.x : r.x + r.w
  if (door) {
    const hw = 20
    const hh = 110
    const ys = [r.y + 260, r.y + r.h / 2, r.y + r.h - 260]
    return ys.map((y) => ({ x: x - hw / 2, y: y - hh / 2, w: hw, h: hh }))
  }
  return [
    { x: x - 8, y: r.y + 42, w: 16, h: 64 },
    { x: x - 8, y: r.y + r.h - 106, w: 16, h: 64 },
  ]
}

