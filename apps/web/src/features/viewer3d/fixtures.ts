import type {
  Catalog,
  DesignNode,
  Layout,
  LayoutCell,
  LayoutMullion,
  LayoutPane,
  LayoutSash,
  LayoutSlidingPanel,
  LeafNode,
  Opening,
  Rect,
  Shape,
  SlidingPanel,
  WindowDesign,
} from '@framezen/engine'
import { defaultHandleSide } from './model/kinematics'

/**
 * Datos de ejemplo del visor 3D (ruta /dev/3d y pruebas). Geometría simplificada con la
 * pauta PRO6004 / PROSLD70; la geometría real la entrega computeLayout del motor.
 */

const PAUTA_60 = { weld: 3, frameDeduction: 44, sashWidth: 80, sashDeduction: 60, sashOverlap: 8, glassGap: 5, mullionDeduction: 20 }
const PAUTA_70 = { ...PAUTA_60, frameDeduction: 52 }

export const FIXTURE_CATALOG: Catalog = {
  colors: [
    { id: 'blanco', name: 'Blanco', hex: '#F6F5F1', code: 'BL' },
    { id: 'nogal', name: 'Nogal', hex: '#5B3A22', code: 'NO' },
    { id: 'roble-dorado', name: 'Roble dorado', hex: '#A8692E', code: 'RD' },
    { id: 'antracita', name: 'Antracita', hex: '#383E42', code: 'AN' },
    { id: 'negro', name: 'Negro', hex: '#0E0E10', code: 'NE' },
  ],
  brands: [{ id: 'ejemplo', name: 'Perfiles de ejemplo', kind: 'profiles' }],
  lines: [
    {
      id: 'practicable-60',
      brandId: 'ejemplo',
      name: 'Practicable 60',
      kind: 'casement',
      material: 'pvc',
      depth: 60,
      pauta: PAUTA_60,
      doorPauta: { sashWidth: 110, sashDeduction: 90 },
      profiles: {},
      colorIds: ['blanco', 'nogal', 'roble-dorado', 'antracita', 'negro'],
      typologyIds: [],
      hardwareRules: [],
      accessoryRules: [],
      source: 'ejemplo',
    },
    {
      id: 'corredera-70',
      brandId: 'ejemplo',
      name: 'Corredera 70',
      kind: 'sliding',
      material: 'pvc',
      depth: 70,
      pauta: PAUTA_70,
      profiles: {},
      colorIds: ['blanco', 'nogal', 'roble-dorado', 'antracita', 'negro'],
      typologyIds: [],
      hardwareRules: [],
      accessoryRules: [],
      source: 'ejemplo',
    },
  ],
  profiles: [],
  items: [],
  glass: [
    { id: 'dvh-4-12-4', name: 'DVH 4+12+4', kind: 'dvh', thickness: 20, pricePerM2: 0 },
    { id: 'incoloro-4', name: 'Incoloro 4 mm', kind: 'mono', thickness: 4, pricePerM2: 0 },
  ],
  brandSettings: [],
}

const FRAME_FACE = 64
const SLIDING_FRAME_FACE = 52
const MULLION_FACE = 80
const FRENCH_FACE = 64
/** Cuánto monta la hoja sobre la luz visible (marco 64 − (44 − 8)). */
const SASH_LIP = 28
/** Cuánto entra el vidrio bajo el perfil. */
const GLASS_UNDER = 12

type Edge = 'frame' | 'mullion' | 'french'
interface Edges {
  left: Edge
  right: Edge
  top: Edge
  bottom: Edge
}

const edgeInset = (edge: Edge) => (edge === 'frame' ? FRAME_FACE : edge === 'mullion' ? MULLION_FACE / 2 : 0)
const edgeLip = (edge: Edge) => (edge === 'french' ? 0 : SASH_LIP)

function inset(rect: Rect, left: number, top: number, right: number, bottom: number): Rect {
  return { x: rect.x + left, y: rect.y + top, w: rect.w - left - right, h: rect.h - top - bottom }
}

interface Acc {
  mullions: LayoutMullion[]
  sashes: LayoutSash[]
  panes: LayoutPane[]
  cells: LayoutCell[]
}

function layoutLeaf(node: LeafNode, region: Rect, edges: Edges, path: string[], acc: Acc, glassId: string, withHandle: boolean) {
  const luz = inset(region, edgeInset(edges.left), edgeInset(edges.top), edgeInset(edges.right), edgeInset(edges.bottom))
  acc.cells.push({ nodeId: node.id, rect: luz, path: [...path, node.id] })
  const fill = node.fill ?? 'glass'
  const nodeGlass = node.glassId ?? glassId
  if (node.opening.kind === 'fixed') {
    acc.panes.push({ nodeId: node.id, kind: 'fixed', glassRect: inset(luz, -GLASS_UNDER, -GLASS_UNDER, -GLASS_UNDER, -GLASS_UNDER), fill, glassId: nodeGlass })
    return
  }
  const face = node.opening.kind === 'door' ? 110 : 80
  const rect = inset(luz, -edgeLip(edges.left), -edgeLip(edges.top), -edgeLip(edges.right), -edgeLip(edges.bottom))
  const glassRect = inset(rect, face - GLASS_UNDER, face - GLASS_UNDER, face - GLASS_UNDER, face - GLASS_UNDER)
  acc.sashes.push({ nodeId: node.id, opening: node.opening, rect, face, glassRect, fill, handle: withHandle ? defaultHandleSide(node.opening) : undefined })
  acc.panes.push({ nodeId: node.id, kind: 'sash', glassRect, fill, glassId: nodeGlass })
}

function layoutNode(node: DesignNode, region: Rect, edges: Edges, path: string[], acc: Acc, glassId: string, withHandle = true) {
  if (node.type === 'leaf') {
    layoutLeaf(node, region, edges, path, acc, glassId, withHandle)
    return
  }
  if (node.type !== 'split') return
  const vertical = node.dir === 'vertical'
  const total = vertical ? region.w : region.h
  const fixedSum = node.sizes.reduce<number>((sum, size) => sum + (size ?? 0), 0)
  const free = node.sizes.filter((size) => size == null).length
  const share = free > 0 ? (total - fixedSum) / free : 0
  const joint: Edge = node.joint === 'french' ? 'french' : 'mullion'
  let start = vertical ? region.x : region.y
  node.children.forEach((child, i) => {
    const size = node.sizes[i] ?? share
    const end = i === node.children.length - 1 ? (vertical ? region.x + region.w : region.y + region.h) : start + size
    const childRegion: Rect = vertical ? { x: start, y: region.y, w: end - start, h: region.h } : { x: region.x, y: start, w: region.w, h: end - start }
    const childEdges: Edges = vertical
      ? { ...edges, left: i === 0 ? edges.left : joint, right: i === node.children.length - 1 ? edges.right : joint }
      : { ...edges, top: i === 0 ? edges.top : joint, bottom: i === node.children.length - 1 ? edges.bottom : joint }
    // En la unión francesa, la primera hoja es la pasiva (sin manilla).
    layoutNode(child, childRegion, childEdges, [...path, node.id], acc, glassId, node.joint === 'french' ? i > 0 : withHandle)
    if (i < node.children.length - 1) {
      const face = joint === 'french' ? FRENCH_FACE : MULLION_FACE
      const lip = joint === 'french' ? SASH_LIP : 0
      const rect: Rect = vertical
        ? { x: end - face / 2, y: region.y + edgeInset(edges.top) - lip, w: face, h: region.h - edgeInset(edges.top) - edgeInset(edges.bottom) + 2 * lip }
        : { x: region.x + edgeInset(edges.left) - lip, y: end - face / 2, w: region.w - edgeInset(edges.left) - edgeInset(edges.right) + 2 * lip, h: face }
      acc.mullions.push({ nodeId: node.id, index: i, dir: node.dir, rect, kind: joint === 'french' ? 'french' : 'mullion', axis: end, min: start + 200, max: end + 200 })
    }
    start = end
  })
}

function slidingLayout(design: WindowDesign, rails: number[]): Pick<Layout, 'sliding' | 'panes' | 'cells' | 'rails'> {
  const root = design.root
  if (root.type !== 'sliding') return { sliding: [], panes: [], cells: [], rails: 1 }
  const n = root.panels.length
  const face = 80
  const overlap = 8
  const panelW = (design.width - 2 * SLIDING_FRAME_FACE + 2 * overlap + (n - 1) * face) / n
  const panelH = design.height - 2 * SLIDING_FRAME_FACE + 2 * overlap
  const sliding: LayoutSlidingPanel[] = []
  const panes: LayoutPane[] = []
  const cells: LayoutCell[] = []
  root.panels.forEach((panel: SlidingPanel, index) => {
    const rect: Rect = { x: SLIDING_FRAME_FACE - overlap + index * (panelW - face), y: SLIDING_FRAME_FACE - overlap, w: panelW, h: panelH }
    const glassRect = inset(rect, face - GLASS_UNDER, face - GLASS_UNDER, face - GLASS_UNDER, face - GLASS_UNDER)
    sliding.push({ panelId: panel.id, index, kind: panel.kind, direction: panel.direction, rail: rails[index] ?? index % 2, rect, face, glassRect })
    panes.push({ nodeId: panel.id, kind: 'sash', glassRect, fill: 'glass', glassId: panel.glassId ?? design.glassId })
    cells.push({ nodeId: panel.id, rect: inset(rect, face, face, face, face), path: [root.id, panel.id] })
  })
  return { sliding, panes, cells, rails: root.rails }
}

function archOutlines(width: number, height: number, rise: number) {
  const r = width / 2
  const springY = rise
  const path = (o: number) => {
    const rr = r - o
    return `M ${o} ${height - o} L ${o} ${springY} A ${rr} ${rr} 0 0 1 ${width - o} ${springY} L ${width - o} ${height - o} Z`
  }
  return { outline: path(0), innerOutline: path(FRAME_FACE), glass: path(FRAME_FACE - GLASS_UNDER) }
}

export function fixtureLayout(design: WindowDesign, rails: number[] = []): Layout {
  const { width, height } = design
  const sliding = design.root.type === 'sliding'
  const frameRect: Rect = { x: 0, y: 0, w: width, h: height }
  const base: Layout = {
    width,
    height,
    frame: { rect: frameRect, face: sliding ? SLIDING_FRAME_FACE : FRAME_FACE },
    mullions: [],
    sashes: [],
    panes: [],
    sliding: [],
    dimensions: [
      { axis: 'x', from: 0, to: width, value: width, level: 0, target: { kind: 'width' } },
      { axis: 'y', from: 0, to: height, value: height, level: 0, target: { kind: 'height' } },
    ],
    cells: [],
  }
  if (sliding) return { ...base, ...slidingLayout(design, rails) }

  const acc: Acc = { mullions: [], sashes: [], panes: [], cells: [] }
  layoutNode(design.root, frameRect, { left: 'frame', right: 'frame', top: 'frame', bottom: 'frame' }, [], acc, design.glassId)
  const layout: Layout = { ...base, ...acc }
  if (design.shape?.kind === 'arch') {
    const arch = archOutlines(width, height, design.shape.rise)
    layout.frame = { ...layout.frame, outline: arch.outline, innerOutline: arch.innerOutline }
    layout.panes = layout.panes.map((pane) => ({ ...pane, outline: arch.glass }))
  }
  return layout
}

// ─────────────────────────────────────────────────────────────────────────────
// Tipologías de muestra
// ─────────────────────────────────────────────────────────────────────────────

export type FixtureTypologyId =
  | 'fixed'
  | 'casement'
  | 'casement_out'
  | 'tilt_turn'
  | 'tilt'
  | 'awning'
  | 'casement_double'
  | 'fixed_casement'
  | 'casement_transom'
  | 'door'
  | 'arch'
  | 'sliding_2'
  | 'sliding_3'
  | 'sliding_4'

export interface FixtureTypology {
  id: FixtureTypologyId
  label: string
  width: number
  height: number
  lineId: string
  rails?: number[]
  shape?: Shape
  root: () => DesignNode
}

const leaf = (id: string, opening: Opening, fill?: 'glass' | 'panel'): LeafNode => ({ id, type: 'leaf', opening, ...(fill ? { fill } : {}) })

export const FIXTURE_TYPOLOGIES: FixtureTypology[] = [
  { id: 'fixed', label: 'Paño fijo', width: 1200, height: 1000, lineId: 'practicable-60', root: () => leaf('p1', { kind: 'fixed' }) },
  { id: 'casement', label: 'Abatir', width: 700, height: 1100, lineId: 'practicable-60', root: () => leaf('h1', { kind: 'casement', hinge: 'left', direction: 'in' }) },
  {
    id: 'casement_out',
    label: 'Abatir exterior',
    width: 700,
    height: 1100,
    lineId: 'practicable-60',
    root: () => leaf('h1', { kind: 'casement', hinge: 'right', direction: 'out' }),
  },
  { id: 'tilt_turn', label: 'Oscilobatiente', width: 800, height: 1200, lineId: 'practicable-60', root: () => leaf('h1', { kind: 'tilt_turn', hinge: 'left', direction: 'in' }) },
  { id: 'tilt', label: 'Oscilante', width: 1000, height: 600, lineId: 'practicable-60', root: () => leaf('h1', { kind: 'tilt', direction: 'in' }) },
  { id: 'awning', label: 'Proyectante', width: 1000, height: 700, lineId: 'practicable-60', root: () => leaf('h1', { kind: 'awning', direction: 'out' }) },
  {
    id: 'casement_double',
    label: 'Abatir 2 hojas',
    width: 1300,
    height: 1200,
    lineId: 'practicable-60',
    root: () => ({
      id: 's1',
      type: 'split',
      dir: 'vertical',
      joint: 'french',
      sizes: [null, null],
      children: [leaf('h1', { kind: 'casement', hinge: 'left', direction: 'in' }), leaf('h2', { kind: 'casement', hinge: 'right', direction: 'in' })],
    }),
  },
  {
    id: 'fixed_casement',
    label: 'Fijo + abatir',
    width: 1500,
    height: 1200,
    lineId: 'practicable-60',
    root: () => ({
      id: 's1',
      type: 'split',
      dir: 'vertical',
      joint: 'mullion',
      sizes: [null, null],
      children: [leaf('p1', { kind: 'fixed' }), leaf('h1', { kind: 'casement', hinge: 'right', direction: 'in' })],
    }),
  },
  {
    id: 'casement_transom',
    label: 'Abatir + sobreluz',
    width: 800,
    height: 1700,
    lineId: 'practicable-60',
    root: () => ({
      id: 's1',
      type: 'split',
      dir: 'horizontal',
      joint: 'mullion',
      sizes: [450, null],
      children: [leaf('p1', { kind: 'fixed' }), leaf('h1', { kind: 'casement', hinge: 'left', direction: 'in' })],
    }),
  },
  { id: 'door', label: 'Puerta', width: 900, height: 2100, lineId: 'practicable-60', root: () => leaf('h1', { kind: 'door', hinge: 'left', direction: 'in' }) },
  { id: 'arch', label: 'Medio punto', width: 1200, height: 1500, lineId: 'practicable-60', shape: { kind: 'arch', rise: 600 }, root: () => leaf('p1', { kind: 'fixed' }) },
  {
    id: 'sliding_2',
    label: 'Corredera 2 hojas',
    width: 1800,
    height: 1200,
    lineId: 'corredera-70',
    rails: [0, 1],
    root: () => ({
      id: 'c1',
      type: 'sliding',
      rails: 2,
      panels: [
        { id: 'c1a', kind: 'moving', direction: 'right' },
        { id: 'c1b', kind: 'moving', direction: 'left' },
      ],
    }),
  },
  {
    id: 'sliding_3',
    label: 'Corredera 3 hojas',
    width: 2400,
    height: 1300,
    lineId: 'corredera-70',
    rails: [1, 0, 1],
    root: () => ({
      id: 'c1',
      type: 'sliding',
      rails: 2,
      panels: [
        { id: 'c1a', kind: 'moving', direction: 'right' },
        { id: 'c1b', kind: 'fixed' },
        { id: 'c1c', kind: 'moving', direction: 'left' },
      ],
    }),
  },
  {
    id: 'sliding_4',
    label: 'Corredera 4 hojas',
    width: 2800,
    height: 1400,
    lineId: 'corredera-70',
    rails: [0, 1, 1, 0],
    root: () => ({
      id: 'c1',
      type: 'sliding',
      rails: 2,
      panels: [
        { id: 'c1a', kind: 'fixed' },
        { id: 'c1b', kind: 'moving', direction: 'left' },
        { id: 'c1c', kind: 'moving', direction: 'right' },
        { id: 'c1d', kind: 'fixed' },
      ],
    }),
  },
]

export interface FixtureWindow {
  design: WindowDesign
  layout: Layout
  catalog: Catalog
}

/** Diseño + geometría de muestra para una tipología. */
export function fixtureWindow(id: FixtureTypologyId, options: { colorId?: string; colorInId?: string } = {}): FixtureWindow {
  const typology = FIXTURE_TYPOLOGIES.find((item) => item.id === id) ?? FIXTURE_TYPOLOGIES[0]
  const design: WindowDesign = {
    version: 1,
    lineId: typology.lineId,
    width: typology.width,
    height: typology.height,
    colorId: options.colorId ?? 'blanco',
    ...(options.colorInId ? { colorInId: options.colorInId } : {}),
    glassId: 'dvh-4-12-4',
    ...(typology.shape ? { shape: typology.shape } : {}),
    root: typology.root(),
  }
  return { design, layout: fixtureLayout(design, typology.rails), catalog: FIXTURE_CATALOG }
}
