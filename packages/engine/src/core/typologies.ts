import type { DesignNode, Id, LeafNode, Opening, Shape, SlidingPanel, Typology, TypologyId, WindowDesign } from '../types'
import { clamp, mm1 } from './format'

/** Galería de tipologías: cada una arma el árbol del diseño para un ancho × alto. */

type Build = Typology['build']

/** Generador local de ids deterministas para una tipología recién creada. */
function ids(): () => Id {
  let n = 0
  return () => `n${++n}`
}

const roundTo10 = (n: number): number => Math.round(n / 10) * 10

const leaf = (id: Id, opening: Opening, fill?: LeafNode['fill']): LeafNode =>
  fill ? { id, type: 'leaf', opening, fill } : { id, type: 'leaf', opening }

const FIXED: Opening = { kind: 'fixed' }
const casementIn = (hinge: 'left' | 'right'): Opening => ({ kind: 'casement', hinge, direction: 'in' })
const door = (hinge: 'left' | 'right'): Opening => ({ kind: 'door', hinge, direction: 'in' })

const single = (opening: Opening): Build => () => {
  const id = ids()
  return { root: leaf(id(), opening) }
}

function vsplit(openings: Opening[], sizes?: (w: number) => (number | null)[], joint: 'mullion' | 'french' = 'mullion'): Build {
  return (w) => {
    const id = ids()
    const root: DesignNode = {
      id: id(),
      type: 'split',
      dir: 'vertical',
      joint,
      children: openings.map((o) => leaf(id(), o)),
      sizes: sizes ? sizes(w) : openings.map(() => null),
    }
    return { root }
  }
}

function hsplit(openings: Opening[], sizes: (h: number) => (number | null)[]): Build {
  return (_w, h) => {
    const id = ids()
    const root: DesignNode = {
      id: id(),
      type: 'split',
      dir: 'horizontal',
      joint: 'mullion',
      children: openings.map((o) => leaf(id(), o)),
      sizes: sizes(h),
    }
    return { root }
  }
}

function sliding(rails: 1 | 2 | 3, panels: Omit<SlidingPanel, 'id'>[]): Build {
  return () => {
    const id = ids()
    const rootId = id()
    return { root: { id: rootId, type: 'sliding', rails, panels: panels.map((p) => ({ id: id(), ...p })) } }
  }
}

function shaped(shape: (w: number, h: number) => Shape): Build {
  return (w, h) => {
    const id = ids()
    return { root: leaf(id(), FIXED), shape: shape(w, h) }
  }
}

/** Sobreluz: 400 mm en vanos altos; un tercio en vanos bajos. */
const transom = (h: number): number => (h >= 1500 ? 400 : roundTo10(h / 3))
/** Proyectante inferior: 500 mm en vanos altos; 40 % en vanos bajos. */
const bottomVent = (h: number): number => (h >= 1200 ? 500 : roundTo10(h * 0.4))
/** Puerta junto a un fijo lateral: 900 mm de puerta si cabe. */
const doorWidth = (w: number): number => (w >= 1200 ? 900 : roundTo10(w * 0.65))

export const TYPOLOGIES: Typology[] = [
  {
    id: 'fixed',
    name: 'Paño fijo',
    kind: 'casement',
    build: single(FIXED),
    defaultSize: { width: 1000, height: 1000 },
    tags: ['ventana', 'fijo', 'paño fijo', 'vidrio fijo'],
  },
  {
    id: 'casement',
    name: 'Abatible',
    kind: 'casement',
    build: single(casementIn('left')),
    defaultSize: { width: 600, height: 1000 },
    tags: ['ventana', 'abatir', 'abatible', 'batiente', '1 hoja', 'interior'],
  },
  {
    id: 'casement_out',
    name: 'Abatible exterior',
    kind: 'casement',
    build: single({ kind: 'casement', hinge: 'left', direction: 'out' }),
    defaultSize: { width: 600, height: 1000 },
    tags: ['ventana', 'abatir', 'abatible', 'batiente', '1 hoja', 'exterior', 'hacia afuera'],
  },
  {
    id: 'tilt_turn',
    name: 'Oscilobatiente',
    kind: 'casement',
    build: single({ kind: 'tilt_turn', hinge: 'left', direction: 'in' }),
    defaultSize: { width: 700, height: 1200 },
    tags: ['ventana', 'oscilobatiente', 'oscilo', 'batiente', '1 hoja', 'europea'],
  },
  {
    id: 'tilt',
    name: 'Oscilante',
    kind: 'casement',
    build: single({ kind: 'tilt', direction: 'in' }),
    defaultSize: { width: 800, height: 500 },
    tags: ['ventana', 'oscilante', 'banderola', 'baño', 'ventilación'],
  },
  {
    id: 'awning',
    name: 'Proyectante',
    kind: 'casement',
    build: single({ kind: 'awning', direction: 'out' }),
    defaultSize: { width: 800, height: 600 },
    tags: ['ventana', 'proyectante', 'proyectable', 'baño', 'cocina', 'ventilación'],
  },
  {
    id: 'casement_double',
    name: 'Abatible 2 hojas',
    kind: 'casement',
    build: vsplit([casementIn('left'), casementIn('right')], undefined, 'french'),
    defaultSize: { width: 1200, height: 1200 },
    tags: ['ventana', 'abatible', '2 hojas', 'doble hoja', 'francesa', 'sin parante'],
  },
  {
    id: 'fixed_casement',
    name: 'Fijo + abatible',
    kind: 'casement',
    build: vsplit([FIXED, casementIn('right')]),
    defaultSize: { width: 1200, height: 1200 },
    tags: ['ventana', 'fijo', 'abatible', '2 paños', 'travesaño'],
  },
  {
    id: 'fixed_tilt_turn',
    name: 'Fijo + oscilobatiente',
    kind: 'casement',
    build: vsplit([FIXED, { kind: 'tilt_turn', hinge: 'right', direction: 'in' }]),
    defaultSize: { width: 1400, height: 1200 },
    tags: ['ventana', 'fijo', 'oscilobatiente', '2 paños', 'travesaño'],
  },
  {
    id: 'casement_transom',
    name: 'Abatible con sobreluz',
    kind: 'casement',
    build: hsplit([FIXED, casementIn('left')], (h) => [transom(h), null]),
    defaultSize: { width: 800, height: 1600 },
    tags: ['ventana', 'abatible', 'sobreluz', 'fijo arriba', 'travesaño'],
  },
  {
    id: 'fixed_awning_bottom',
    name: 'Fijo + proyectante abajo',
    kind: 'casement',
    build: hsplit([FIXED, { kind: 'awning', direction: 'out' }], (h) => [null, bottomVent(h)]),
    defaultSize: { width: 1000, height: 1500 },
    tags: ['ventana', 'fijo', 'proyectante', 'ventilación abajo', 'travesaño'],
  },
  {
    id: 'fixed_3',
    name: 'Tres paños fijos',
    kind: 'casement',
    build: vsplit([FIXED, FIXED, FIXED]),
    defaultSize: { width: 2100, height: 1000 },
    tags: ['ventana', 'fijo', '3 paños', 'ventanal', 'travesaños'],
  },
  {
    id: 'casement_fixed_casement',
    name: 'Abatible + fijo + abatible',
    kind: 'casement',
    build: vsplit([casementIn('left'), FIXED, casementIn('right')]),
    defaultSize: { width: 1800, height: 1200 },
    tags: ['ventana', 'abatible', 'fijo', '3 paños', 'ventanal', 'living'],
  },
  {
    id: 'door',
    name: 'Puerta',
    kind: 'casement',
    build: single(door('left')),
    defaultSize: { width: 900, height: 2100 },
    tags: ['puerta', '1 hoja', 'balconera', 'acceso', 'terraza'],
  },
  {
    id: 'door_double',
    name: 'Puerta 2 hojas',
    kind: 'casement',
    build: vsplit([door('left'), door('right')], undefined, 'french'),
    defaultSize: { width: 1500, height: 2100 },
    tags: ['puerta', '2 hojas', 'doble', 'francesa', 'balconera', 'terraza'],
  },
  {
    id: 'door_sidelight',
    name: 'Puerta con fijo lateral',
    kind: 'casement',
    build: vsplit([door('left'), FIXED], (w) => [doorWidth(w), null]),
    defaultSize: { width: 1300, height: 2100 },
    tags: ['puerta', 'fijo lateral', 'acceso', 'balconera'],
  },
  {
    id: 'door_transom',
    name: 'Puerta con sobreluz',
    kind: 'casement',
    build: hsplit([FIXED, door('left')], (h) => [transom(h), null]),
    defaultSize: { width: 900, height: 2500 },
    tags: ['puerta', 'sobreluz', 'fijo arriba', 'balconera'],
  },
  {
    id: 'arch',
    name: 'Medio punto',
    kind: 'casement',
    build: shaped((w, h) => ({ kind: 'arch', rise: mm1(Math.min(w / 2, h)) })),
    defaultSize: { width: 1000, height: 1200 },
    tags: ['ventana', 'arco', 'medio punto', 'forma', 'fijo'],
  },
  {
    id: 'trapezoid',
    name: 'Fijo irregular',
    kind: 'casement',
    build: shaped((_w, h) => ({ kind: 'trapezoid', leftHeight: mm1(clamp(h / 2, 1, h)), rightHeight: mm1(h) })),
    defaultSize: { width: 1000, height: 1000 },
    tags: ['ventana', 'trapecio', 'irregular', 'inclinado', 'forma', 'fijo'],
  },
  {
    id: 'triangle',
    name: 'Fijo triangular',
    kind: 'casement',
    build: shaped(() => ({ kind: 'triangle', apex: 'center' })),
    defaultSize: { width: 1000, height: 800 },
    tags: ['ventana', 'triángulo', 'frontón', 'forma', 'fijo'],
  },
  {
    id: 'sliding_2',
    name: 'Corredera 2 hojas',
    kind: 'sliding',
    build: sliding(2, [
      { kind: 'moving', direction: 'right' },
      { kind: 'moving', direction: 'left' },
    ]),
    defaultSize: { width: 1500, height: 1200 },
    tags: ['ventana', 'corredera', '2 hojas', 'deslizante'],
  },
  {
    id: 'sliding_2_fixed',
    name: 'Corredera hoja + fijo',
    kind: 'sliding',
    build: sliding(2, [{ kind: 'fixed' }, { kind: 'moving', direction: 'left' }]),
    defaultSize: { width: 1500, height: 1200 },
    tags: ['ventana', 'corredera', '1 hoja', 'fijo', 'deslizante'],
  },
  {
    id: 'sliding_3',
    name: 'Corredera 3 hojas',
    kind: 'sliding',
    build: sliding(2, [
      { kind: 'moving', direction: 'right' },
      { kind: 'moving', direction: 'left' },
      { kind: 'moving', direction: 'left' },
    ]),
    defaultSize: { width: 2400, height: 1200 },
    tags: ['ventana', 'corredera', '3 hojas', 'doble riel', 'ventanal'],
  },
  {
    id: 'sliding_3_rail',
    name: 'Corredera 3 hojas, 3 rieles',
    kind: 'sliding',
    build: sliding(3, [
      { kind: 'moving', direction: 'left' },
      { kind: 'moving', direction: 'left' },
      { kind: 'moving', direction: 'left' },
    ]),
    defaultSize: { width: 2400, height: 1200 },
    tags: ['ventana', 'corredera', '3 hojas', 'triple riel', 'ventanal', 'telescópica'],
  },
  {
    id: 'sliding_4',
    name: 'Corredera 4 hojas',
    kind: 'sliding',
    build: sliding(2, [
      { kind: 'fixed' },
      { kind: 'moving', direction: 'left' },
      { kind: 'moving', direction: 'right' },
      { kind: 'fixed' },
    ]),
    defaultSize: { width: 3000, height: 1200 },
    tags: ['ventana', 'corredera', '4 hojas', 'centrales', 'ventanal', 'living'],
  },
  {
    id: 'sliding_mono',
    name: 'Corredera monorriel',
    kind: 'sliding',
    build: sliding(1, [{ kind: 'fixed' }, { kind: 'moving', direction: 'left' }]),
    defaultSize: { width: 1200, height: 1000 },
    tags: ['ventana', 'corredera', 'monorriel', '1 riel', 'fijo', 'deslizante'],
  },
]

const BY_ID = new Map<TypologyId, Typology>(TYPOLOGIES.map((t) => [t.id, t]))

export function getTypology(id: TypologyId | string): Typology | undefined {
  return BY_ID.get(id as TypologyId)
}

export interface CreateDesignOptions {
  lineId: Id
  width?: number
  height?: number
  colorId: Id
  glassId: Id
}

/** Crea un diseño desde una tipología (id desconocido → paño fijo). Medidas a 0,1 mm. */
export function createDesign(typologyId: TypologyId | string, options: CreateDesignOptions): WindowDesign {
  const typology = getTypology(typologyId) ?? TYPOLOGIES[0]
  const valid = (n: number | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0
  const width = mm1(valid(options.width) ? options.width : typology.defaultSize.width)
  const height = mm1(valid(options.height) ? options.height : typology.defaultSize.height)
  const { root, shape } = typology.build(width, height)
  const design: WindowDesign = {
    version: 1,
    lineId: options.lineId,
    width,
    height,
    colorId: options.colorId,
    glassId: options.glassId,
    root,
  }
  if (shape) design.shape = shape
  return design
}
