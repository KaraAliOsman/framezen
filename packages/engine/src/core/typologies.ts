import type { DesignNode, Id, LeafNode, Line, Opening, Profile, Shape, SlidingPanel, SlidingSystem, SplitNode, Typology, TypologyId, WindowDesign } from '../types'
import { TYPOLOGY_IDS } from '../types'
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
const TILT: Opening = { kind: 'tilt', direction: 'in' }
const AWNING: Opening = { kind: 'awning', direction: 'out' }
const casementIn = (hinge: 'left' | 'right'): Opening => ({ kind: 'casement', hinge, direction: 'in' })
const door = (hinge: 'left' | 'right'): Opening => ({ kind: 'door', hinge, direction: 'in' })
const tiltTurn = (hinge: 'left' | 'right'): Opening => ({ kind: 'tilt_turn', hinge, direction: 'in' })
const entranceDoor = (hinge: 'left' | 'right'): Opening => ({ kind: 'door', hinge, direction: 'in', use: 'entrance' })
const balconyDoor = (hinge: 'left' | 'right'): Opening => ({ kind: 'casement', hinge, direction: 'in', use: 'balcony' })
const tiltSlide = (slide: 'left' | 'right'): Opening => ({ kind: 'tilt_slide', slide })
const parallelSlide = (slide: 'left' | 'right'): Opening => ({ kind: 'parallel_slide', slide })
/** Hoja plegable: `hinge` = lado hacia donde se apila su grupo. */
const foldingLeaf = (stack: 'left' | 'right'): Opening => ({ kind: 'folding', hinge: stack })

/** Nodo hoja o subárbol para armar compuestas. */
type Part = Opening | ((id: () => Id, w: number, h: number) => DesignNode)
const partNode = (part: Part, id: () => Id, w: number, h: number): DesignNode => (typeof part === 'function' ? part(id, w, h) : leaf(id(), part))

const single = (opening: Opening): Build => () => {
  const id = ids()
  return { root: leaf(id(), opening) }
}

interface SplitOptions {
  joint?: SplitNode['joint']
  passive?: SplitNode['passive']
}

function splitNode(id: () => Id, dir: SplitNode['dir'], parts: Part[], sizes: (number | null)[] | undefined, w: number, h: number, opts: SplitOptions = {}): SplitNode {
  const node: SplitNode = {
    id: id(),
    type: 'split',
    dir,
    joint: opts.joint ?? 'mullion',
    children: [],
    sizes: sizes ?? parts.map(() => null),
  }
  if (opts.passive) node.passive = opts.passive
  node.children = parts.map((part) => partNode(part, id, w, h))
  return node
}

function vsplit(openings: Part[], sizes?: (w: number) => (number | null)[], joint: SplitNode['joint'] = 'mullion', passive?: SplitNode['passive']): Build {
  return (w, h) => {
    const id = ids()
    return { root: splitNode(id, 'vertical', openings, sizes ? sizes(w) : undefined, w, h, { joint, passive }) }
  }
}

function hsplit(openings: Part[], sizes: (h: number) => (number | null)[]): Build {
  return (w, h) => {
    const id = ids()
    return { root: splitNode(id, 'horizontal', openings, sizes(h), w, h) }
  }
}

interface SlidingOptions {
  system?: SlidingSystem
  /** Ancho de cada panel sobre el ancho total (null = reparte). */
  sizes?: (w: number) => (number | null)[]
}

function sliding(rails: 1 | 2 | 3, panels: Omit<SlidingPanel, 'id'>[], opts: SlidingOptions = {}): Build {
  return (w) => {
    const id = ids()
    const rootId = id()
    const root: DesignNode = { id: rootId, type: 'sliding', rails, panels: panels.map((p) => ({ id: id(), ...p })) }
    if (opts.system && opts.system !== 'standard') root.system = opts.system
    if (opts.sizes) root.sizes = opts.sizes(w)
    return { root }
  }
}

function shaped(shape: (w: number, h: number) => Shape): Build {
  return (w, h) => {
    const id = ids()
    return { root: leaf(id(), FIXED), shape: shape(w, h) }
  }
}

/**
 * Plegable de n hojas en una sola cadena (unión 'fold'). `left` hojas se apilan a la izquierda y
 * el resto a la derecha. Medidas iguales.
 */
function folding(n: number, left: number): Build {
  return vsplit(
    Array.from({ length: n }, (_, i) => foldingLeaf(i < left ? 'left' : 'right')),
    undefined,
    'fold',
  )
}

/** Hoja con zócalo: panel de 800 mm en una puerta de altura normal; 40 % en una baja. */
const zocaloHeight = (h: number): number => (h >= 1800 ? 800 : roundTo10(h * 0.4))
const zocaloLeaf = (opening: Opening): Part => (id, _w, h) => ({ id: id(), type: 'leaf', opening, zocalo: { height: zocaloHeight(h) } })
/** Paño fijo inferior («paño bajo»): 500 mm en vanos altos; un tercio en vanos bajos. */
const bottomFixed = (h: number): number => (h >= 1500 ? 500 : roundTo10(h / 3))

/** Sobreluz: 400 mm en vanos altos; un tercio en vanos bajos. */
const transom = (h: number): number => (h >= 1500 ? 400 : roundTo10(h / 3))
/** Proyectante inferior: 500 mm en vanos altos; 40 % en vanos bajos. */
const bottomVent = (h: number): number => (h >= 1200 ? 500 : roundTo10(h * 0.4))
/** Puerta junto a un fijo lateral: 900 mm de puerta si cabe. */
const doorWidth = (w: number): number => (w >= 1200 ? 900 : roundTo10(w * 0.65))
/** Puerta de acceso entre dos fijos: 1.000 mm si cabe; si no, 60 % del ancho. */
const entranceWidth = (w: number): number => (w >= 1600 ? 1000 : roundTo10(w * 0.6))
/** Puerta doble entre dos fijos: 1.500 mm si cabe; si no, 65 % del ancho. */
const doublePairWidth = (w: number): number => (w >= 2300 ? 1500 : roundTo10(w * 0.65))
/** Frontón: lados verticales para un techo a 45° si cabe; si no, 60 % del alto. */
const gableShoulder = (w: number, h: number): number => mm1(clamp(h - w / 2 >= h * 0.3 ? h - w / 2 : h * 0.6, 1, h - 1))

type Spec = Omit<Typology, 'id'> & {
  /**
   * Combinación de piezas que la línea ya fabrica: no hace falta que el catálogo la liste (ver
   * `lineFabricates`). `@vertical_sash` exige una hoja de guillotina en la línea.
   */
  requires?: (TypologyId | '@vertical_sash')[]
}

/**
 * Todas las tipologías por id: el tipo `Record<TypologyId, …>` obliga a que cada id de
 * `TYPOLOGY_IDS` tenga su plantilla (y a que no sobre ninguna).
 */
const SPECS: Record<TypologyId, Spec> = {
  fixed: {
    name: 'Paño fijo',
    kind: 'casement',
    group: 'window',
    build: single(FIXED),
    defaultSize: { width: 1000, height: 1000 },
    tags: ['ventana', 'fijo', 'paño fijo', 'vidrio fijo'],
  },
  casement: {
    name: 'Abatible',
    kind: 'casement',
    group: 'window',
    build: single(casementIn('left')),
    defaultSize: { width: 600, height: 1000 },
    tags: ['ventana', 'abatir', 'abatible', 'batiente', '1 hoja', 'interior'],
  },
  casement_out: {
    name: 'Abatible exterior',
    kind: 'casement',
    group: 'window',
    build: single({ kind: 'casement', hinge: 'left', direction: 'out' }),
    defaultSize: { width: 600, height: 1000 },
    tags: ['ventana', 'abatir', 'abatible', 'batiente', '1 hoja', 'exterior', 'hacia afuera'],
  },
  tilt_turn: {
    name: 'Oscilobatiente',
    kind: 'casement',
    group: 'window',
    build: single(tiltTurn('left')),
    defaultSize: { width: 700, height: 1200 },
    tags: ['ventana', 'oscilobatiente', 'oscilo', 'batiente', '1 hoja', 'europea'],
  },
  tilt: {
    name: 'Oscilante',
    kind: 'casement',
    group: 'window',
    build: single({ kind: 'tilt', direction: 'in' }),
    defaultSize: { width: 800, height: 500 },
    tags: ['ventana', 'oscilante', 'banderola', 'baño', 'ventilación', 'abatible inferior'],
  },
  awning: {
    name: 'Proyectante',
    kind: 'casement',
    group: 'window',
    build: single({ kind: 'awning', direction: 'out' }),
    defaultSize: { width: 800, height: 600 },
    tags: ['ventana', 'proyectante', 'proyectable', 'baño', 'cocina', 'ventilación', 'abatible superior'],
  },
  casement_double: {
    name: 'Abatible 2 hojas',
    kind: 'casement',
    group: 'window',
    build: vsplit([casementIn('left'), casementIn('right')], undefined, 'french'),
    defaultSize: { width: 1200, height: 1200 },
    tags: ['ventana', 'abatible', '2 hojas', 'doble hoja', 'francesa', 'sin parante'],
  },
  fixed_casement: {
    name: 'Fijo + abatible',
    kind: 'casement',
    group: 'window',
    build: vsplit([FIXED, casementIn('right')]),
    defaultSize: { width: 1200, height: 1200 },
    tags: ['ventana', 'fijo', 'abatible', '2 paños', 'travesaño'],
  },
  fixed_tilt_turn: {
    name: 'Fijo + oscilobatiente',
    kind: 'casement',
    group: 'window',
    build: vsplit([FIXED, tiltTurn('right')]),
    defaultSize: { width: 1400, height: 1200 },
    tags: ['ventana', 'fijo', 'oscilobatiente', '2 paños', 'travesaño'],
  },
  casement_transom: {
    name: 'Abatible con sobreluz',
    kind: 'casement',
    group: 'window',
    build: hsplit([FIXED, casementIn('left')], (h) => [transom(h), null]),
    defaultSize: { width: 800, height: 1600 },
    tags: ['ventana', 'abatible', 'sobreluz', 'fijo arriba', 'travesaño'],
  },
  fixed_awning_bottom: {
    name: 'Fijo + proyectante abajo',
    kind: 'casement',
    group: 'window',
    build: hsplit([FIXED, { kind: 'awning', direction: 'out' }], (h) => [null, bottomVent(h)]),
    defaultSize: { width: 1000, height: 1500 },
    tags: ['ventana', 'fijo', 'proyectante', 'ventilación abajo', 'travesaño'],
  },
  fixed_3: {
    name: 'Tres paños fijos',
    kind: 'casement',
    group: 'window',
    build: vsplit([FIXED, FIXED, FIXED]),
    defaultSize: { width: 2100, height: 1000 },
    tags: ['ventana', 'fijo', '3 paños', 'ventanal', 'travesaños'],
  },
  casement_fixed_casement: {
    name: 'Abatible + fijo + abatible',
    kind: 'casement',
    group: 'window',
    build: vsplit([casementIn('left'), FIXED, casementIn('right')]),
    defaultSize: { width: 1800, height: 1200 },
    tags: ['ventana', 'abatible', 'fijo', '3 paños', 'ventanal', 'living'],
  },
  door: {
    name: 'Puerta',
    kind: 'casement',
    group: 'door',
    build: single(door('left')),
    defaultSize: { width: 900, height: 2100 },
    tags: ['puerta', '1 hoja', 'balconera', 'acceso', 'terraza'],
  },
  door_double: {
    name: 'Puerta 2 hojas',
    kind: 'casement',
    group: 'door',
    build: vsplit([door('left'), door('right')], undefined, 'french'),
    defaultSize: { width: 1500, height: 2100 },
    tags: ['puerta', '2 hojas', 'doble', 'francesa', 'balconera', 'terraza'],
  },
  door_sidelight: {
    name: 'Puerta con fijo lateral',
    kind: 'casement',
    group: 'door',
    build: vsplit([door('left'), FIXED], (w) => [doorWidth(w), null]),
    defaultSize: { width: 1300, height: 2100 },
    tags: ['puerta', 'fijo lateral', 'acceso', 'balconera'],
  },
  door_transom: {
    name: 'Puerta con sobreluz',
    kind: 'casement',
    group: 'door',
    build: hsplit([FIXED, door('left')], (h) => [transom(h), null]),
    defaultSize: { width: 900, height: 2500 },
    tags: ['puerta', 'sobreluz', 'fijo arriba', 'balconera'],
  },
  arch: {
    name: 'Medio punto',
    kind: 'casement',
    group: 'shape',
    build: shaped((w, h) => ({ kind: 'arch', rise: mm1(Math.min(w / 2, h)) })),
    defaultSize: { width: 1000, height: 1200 },
    tags: ['ventana', 'arco', 'medio punto', 'forma', 'fijo'],
  },
  trapezoid: {
    name: 'Fijo irregular',
    kind: 'casement',
    group: 'shape',
    build: shaped((_w, h) => ({ kind: 'trapezoid', leftHeight: mm1(clamp(h / 2, 1, h)), rightHeight: mm1(h) })),
    defaultSize: { width: 1000, height: 1000 },
    tags: ['ventana', 'trapecio', 'irregular', 'inclinado', 'forma', 'fijo'],
  },
  triangle: {
    name: 'Fijo triangular',
    kind: 'casement',
    group: 'shape',
    build: shaped(() => ({ kind: 'triangle', apex: 'center' })),
    defaultSize: { width: 1000, height: 800 },
    tags: ['ventana', 'triángulo', 'frontón', 'forma', 'fijo'],
  },
  sliding_2: {
    name: 'Corredera 2 hojas',
    kind: 'sliding',
    group: 'sliding',
    build: sliding(2, [
      { kind: 'moving', direction: 'right' },
      { kind: 'moving', direction: 'left' },
    ]),
    defaultSize: { width: 1500, height: 1200 },
    tags: ['ventana', 'corredera', '2 hojas', 'deslizante'],
  },
  sliding_2_fixed: {
    name: 'Corredera hoja + fijo',
    kind: 'sliding',
    group: 'sliding',
    build: sliding(2, [{ kind: 'fixed' }, { kind: 'moving', direction: 'left' }]),
    defaultSize: { width: 1500, height: 1200 },
    tags: ['ventana', 'corredera', '1 hoja', 'fijo', 'deslizante'],
  },
  sliding_3: {
    name: 'Corredera 3 hojas',
    kind: 'sliding',
    group: 'sliding',
    build: sliding(2, [
      { kind: 'moving', direction: 'right' },
      { kind: 'moving', direction: 'left' },
      { kind: 'moving', direction: 'left' },
    ]),
    defaultSize: { width: 2400, height: 1200 },
    tags: ['ventana', 'corredera', '3 hojas', 'doble riel', 'ventanal'],
  },
  sliding_3_rail: {
    name: 'Corredera 3 hojas, 3 rieles',
    kind: 'sliding',
    group: 'sliding',
    // Cada hoja en su riel: la de la izquierda arranca junto a la jamba y solo puede correr a la derecha.
    build: sliding(3, [
      { kind: 'moving', direction: 'right' },
      { kind: 'moving', direction: 'left' },
      { kind: 'moving', direction: 'left' },
    ]),
    defaultSize: { width: 2400, height: 1200 },
    tags: ['ventana', 'corredera', '3 hojas', 'triple riel', 'ventanal', 'telescópica'],
  },
  sliding_4: {
    name: 'Corredera 4 hojas',
    kind: 'sliding',
    group: 'sliding',
    build: sliding(2, [
      { kind: 'fixed' },
      { kind: 'moving', direction: 'left' },
      { kind: 'moving', direction: 'right' },
      { kind: 'fixed' },
    ]),
    defaultSize: { width: 3000, height: 1200 },
    tags: ['ventana', 'corredera', '4 hojas', 'centrales', 'ventanal', 'living'],
  },
  sliding_mono: {
    name: 'Corredera monorriel',
    kind: 'sliding',
    group: 'sliding',
    build: sliding(1, [{ kind: 'fixed' }, { kind: 'moving', direction: 'left' }]),
    defaultSize: { width: 1200, height: 1000 },
    tags: ['ventana', 'corredera', 'monorriel', '1 riel', 'fijo', 'deslizante'],
  },
  // ── v5: correderas y sistemas especiales ───────────────────────────────────
  sliding_6: {
    name: 'Corredera 6 hojas',
    kind: 'sliding',
    group: 'sliding',
    // Dos grupos telescópicos de 3 que abren al centro sobre 3 rieles; las hojas de los extremos
    // quedan fijas (abre cerca de dos tercios, research 25 §6.1 «sliding_6_3rail»).
    build: sliding(3, [
      { kind: 'fixed', rail: 0 },
      { kind: 'moving', direction: 'left', rail: 1 },
      { kind: 'moving', direction: 'left', rail: 2 },
      { kind: 'moving', direction: 'right', rail: 2 },
      { kind: 'moving', direction: 'right', rail: 1 },
      { kind: 'fixed', rail: 0 },
    ]),
    defaultSize: { width: 3600, height: 1200 },
    tags: ['ventana', 'corredera', '6 hojas', 'triple riel', 'ventanal', 'telescópica', 'abre al centro'],
  },
  sliding_3_center_fixed: {
    name: 'Corredera 3 hojas, central fija',
    kind: 'sliding',
    group: 'sliding',
    // Fijo central del doble de ancho: cada hoja móvil se estaciona tras la mitad del fijo.
    build: sliding(
      2,
      [
        { kind: 'moving', direction: 'right' },
        { kind: 'fixed' },
        { kind: 'moving', direction: 'left' },
      ],
      { sizes: (w) => [null, mm1(w / 2), null] },
    ),
    defaultSize: { width: 2400, height: 1200 },
    tags: ['ventana', 'corredera', '3 hojas', 'fijo central', 'doble riel', 'ventanal'],
  },
  sliding_4_center_fixed: {
    name: 'Corredera 4 hojas, centrales fijas',
    kind: 'sliding',
    group: 'sliding',
    build: sliding(2, [
      { kind: 'moving', direction: 'right' },
      { kind: 'fixed' },
      { kind: 'fixed' },
      { kind: 'moving', direction: 'left' },
    ]),
    defaultSize: { width: 3000, height: 1200 },
    tags: ['ventana', 'corredera', '4 hojas', 'fijos centrales', 'ventanal', 'living'],
  },
  lift_slide_2: {
    name: 'Corredera elevadora 2 hojas',
    kind: 'sliding',
    group: 'sliding',
    build: sliding(2, [{ kind: 'fixed' }, { kind: 'moving', direction: 'left' }], { system: 'lift_slide' }),
    defaultSize: { width: 3000, height: 2200 },
    tags: ['puerta', 'corredera', 'elevadora', 'elevable', 'hst', 'hs', '2 hojas', 'terraza', 'ventanal'],
  },
  lift_slide_3: {
    name: 'Corredera elevadora 3 hojas',
    kind: 'sliding',
    group: 'sliding',
    // Fijo y dos hojas telescópicas que se apilan sobre él (3 rieles).
    build: sliding(
      3,
      [
        { kind: 'fixed', rail: 0 },
        { kind: 'moving', direction: 'left', rail: 1 },
        { kind: 'moving', direction: 'left', rail: 2 },
      ],
      { system: 'lift_slide' },
    ),
    defaultSize: { width: 4400, height: 2200 },
    tags: ['puerta', 'corredera', 'elevadora', 'elevable', 'hst', '3 hojas', '3 rieles', 'terraza', 'ventanal'],
  },
  lift_slide_4: {
    name: 'Corredera elevadora 4 hojas',
    kind: 'sliding',
    group: 'sliding',
    build: sliding(
      2,
      [
        { kind: 'fixed' },
        { kind: 'moving', direction: 'left' },
        { kind: 'moving', direction: 'right' },
        { kind: 'fixed' },
      ],
      { system: 'lift_slide' },
    ),
    defaultSize: { width: 5800, height: 2200 },
    tags: ['puerta', 'corredera', 'elevadora', 'elevable', 'hst', '4 hojas', 'abre al centro', 'terraza', 'ventanal'],
  },
  tilt_slide: {
    name: 'Osciloparalela',
    kind: 'casement',
    group: 'sliding',
    build: vsplit([FIXED, tiltSlide('left')]),
    defaultSize: { width: 2400, height: 2200 },
    tags: ['puerta', 'ventana', 'osciloparalela', 'oscilo paralela', 'psk', 'corredera basculante', 'terraza'],
  },
  tilt_slide_2: {
    name: 'Osciloparalela 2 hojas',
    kind: 'casement',
    group: 'sliding',
    build: vsplit([FIXED, tiltSlide('left'), tiltSlide('right'), FIXED]),
    defaultSize: { width: 4400, height: 2200 },
    tags: ['puerta', 'osciloparalela', 'psk', '2 hojas', 'abre al centro', 'terraza', 'ventanal'],
  },
  parallel_slide: {
    name: 'Corredera paralela',
    kind: 'casement',
    group: 'sliding',
    build: vsplit([FIXED, parallelSlide('left')]),
    defaultSize: { width: 2400, height: 2200 },
    tags: ['puerta', 'ventana', 'corredera paralela', 'paralela', 'ps', 'hermética', 'terraza'],
  },
  folding_3: {
    name: 'Plegable 3 hojas',
    kind: 'casement',
    group: 'folding',
    build: folding(3, 3),
    defaultSize: { width: 2700, height: 2200 },
    tags: ['puerta', 'plegable', 'acordeón', 'libro', 'fuelle', '3 hojas', 'terraza'],
  },
  folding_4: {
    name: 'Plegable 4 hojas',
    kind: 'casement',
    group: 'folding',
    build: folding(4, 4),
    defaultSize: { width: 3200, height: 2200 },
    tags: ['puerta', 'plegable', 'acordeón', 'libro', 'fuelle', '4 hojas', 'terraza'],
  },
  folding_5: {
    name: 'Plegable 5 hojas',
    kind: 'casement',
    group: 'folding',
    build: folding(5, 5),
    defaultSize: { width: 4000, height: 2200 },
    tags: ['puerta', 'plegable', 'acordeón', 'libro', 'fuelle', '5 hojas', 'terraza'],
  },
  folding_6: {
    name: 'Plegable 6 hojas',
    kind: 'casement',
    group: 'folding',
    build: folding(6, 3),
    defaultSize: { width: 4800, height: 2200 },
    tags: ['puerta', 'plegable', 'acordeón', 'libro', 'fuelle', '6 hojas', 'abre al centro', 'terraza'],
  },
  folding_7: {
    name: 'Plegable 7 hojas',
    kind: 'casement',
    group: 'folding',
    build: folding(7, 7),
    defaultSize: { width: 5600, height: 2200 },
    tags: ['puerta', 'plegable', 'acordeón', 'libro', 'fuelle', '7 hojas', 'terraza', 'ventanal'],
  },
  pivot_v: {
    name: 'Pivotante vertical',
    kind: 'casement',
    group: 'window',
    build: single({ kind: 'pivot_v', direction: 'in', pivot: 0.5 }),
    defaultSize: { width: 900, height: 1400 },
    tags: ['ventana', 'pivotante', 'pivote', 'eje vertical', 'basculante vertical'],
  },
  pivot_h: {
    name: 'Pivotante horizontal',
    kind: 'casement',
    group: 'window',
    build: single({ kind: 'pivot_h', direction: 'in', pivot: 0.5 }),
    defaultSize: { width: 1200, height: 1200 },
    tags: ['ventana', 'pivotante', 'pivote', 'eje horizontal', 'basculante'],
  },
  // ── v5: doble hoja, puertas y compuestas ────────────────────────────────────
  french_casement: {
    name: 'Francesa abatible',
    kind: 'casement',
    group: 'window',
    build: vsplit([casementIn('left'), casementIn('right')], undefined, 'french', 'left'),
    defaultSize: { width: 1200, height: 1200 },
    tags: ['ventana', 'francesa', 'abatible', '2 hojas', 'doble hoja', 'sin parante', 'inversor', 'hoja pasiva'],
  },
  french_tilt_turn: {
    name: 'Francesa oscilobatiente',
    kind: 'casement',
    group: 'window',
    // Pasiva abatible a la izquierda, activa oscilobatiente a la derecha (solo una oscila).
    build: vsplit([casementIn('left'), tiltTurn('right')], undefined, 'french', 'left'),
    defaultSize: { width: 1400, height: 1400 },
    tags: ['ventana', 'francesa', 'oscilobatiente', '2 hojas', 'doble hoja', 'sin parante', 'inversor'],
  },
  balcony_door: {
    name: 'Puerta balconera',
    kind: 'casement',
    group: 'door',
    build: single(balconyDoor('left')),
    defaultSize: { width: 900, height: 2100 },
    tags: ['puerta', 'balconera', 'puerta balcón', 'terraza', 'puerta ventana', '1 hoja'],
  },
  balcony_door_double: {
    name: 'Puerta balconera 2 hojas',
    kind: 'casement',
    group: 'door',
    build: vsplit([balconyDoor('left'), balconyDoor('right')], undefined, 'french', 'left'),
    defaultSize: { width: 1500, height: 2100 },
    tags: ['puerta', 'balconera', 'doble', '2 hojas', 'francesa', 'terraza'],
  },
  entrance_door: {
    name: 'Puerta de acceso',
    kind: 'casement',
    group: 'door',
    build: single(entranceDoor('left')),
    defaultSize: { width: 1000, height: 2100 },
    tags: ['puerta', 'acceso', 'entrada', 'principal', 'cerradura multipunto', '1 hoja'],
  },
  entrance_door_sidelights: {
    name: 'Puerta de acceso con fijos laterales',
    kind: 'casement',
    group: 'door',
    build: vsplit([FIXED, entranceDoor('left'), FIXED], (w) => [null, entranceWidth(w), null]),
    defaultSize: { width: 2000, height: 2100 },
    tags: ['puerta', 'acceso', 'entrada', 'fijos laterales', 'luces laterales'],
  },
  door_double_sidelights: {
    name: 'Puerta 2 hojas con fijos laterales',
    kind: 'casement',
    group: 'door',
    build: vsplit(
      [FIXED, (id, w, h) => splitNode(id, 'vertical', [door('left'), door('right')], undefined, w, h, { joint: 'french' }), FIXED],
      (w) => [null, doublePairWidth(w), null],
    ),
    defaultSize: { width: 2700, height: 2100 },
    tags: ['puerta', 'doble', '2 hojas', 'francesa', 'fijos laterales', 'acceso'],
  },
  fixed_tilt_turn_fixed: {
    name: 'Fijo + oscilobatiente + fijo',
    kind: 'casement',
    group: 'window',
    build: vsplit([FIXED, tiltTurn('left'), FIXED]),
    defaultSize: { width: 2100, height: 1200 },
    tags: ['ventana', 'fijo', 'oscilobatiente', '3 paños', 'ventanal', 'travesaños'],
  },
  tilt_turn_double_transom: {
    name: 'Oscilobatiente 2 hojas con sobreluz',
    kind: 'casement',
    group: 'window',
    build: hsplit(
      [FIXED, (id, w, h) => splitNode(id, 'vertical', [tiltTurn('left'), tiltTurn('right')], undefined, w, h)],
      (h) => [transom(h), null],
    ),
    defaultSize: { width: 1400, height: 1800 },
    tags: ['ventana', 'oscilobatiente', '2 hojas', 'sobreluz', 'fijo arriba', 'travesaño'],
  },
  // ── v7: combinaciones de taller ─────────────────────────────────────────────
  casement_bottom_fixed: {
    name: 'Abatible con paño inferior',
    kind: 'casement',
    group: 'window',
    requires: ['casement', 'fixed'],
    build: hsplit([casementIn('left'), FIXED], (h) => [null, bottomFixed(h)]),
    defaultSize: { width: 900, height: 1800 },
    tags: ['ventana', 'abatible', 'paño inferior', 'paño bajo', 'fijo abajo', 'antepecho', 'travesaño'],
  },
  tilt_turn_bottom_fixed: {
    name: 'Oscilobatiente con paño inferior',
    kind: 'casement',
    group: 'window',
    requires: ['tilt_turn', 'fixed'],
    build: hsplit([tiltTurn('left'), FIXED], (h) => [null, bottomFixed(h)]),
    defaultSize: { width: 900, height: 1900 },
    tags: ['ventana', 'oscilobatiente', 'paño inferior', 'paño bajo', 'fijo abajo', 'antepecho', 'travesaño'],
  },
  casement_double_bottom_fixed: {
    name: 'Abatible 2 hojas con paño inferior',
    kind: 'casement',
    group: 'window',
    requires: ['casement_double', 'fixed'],
    build: hsplit(
      [(id, w, h) => splitNode(id, 'vertical', [casementIn('left'), casementIn('right')], undefined, w, h, { joint: 'french' }), FIXED],
      (h) => [null, bottomFixed(h)],
    ),
    defaultSize: { width: 1400, height: 1900 },
    tags: ['ventana', 'abatible', '2 hojas', 'francesa', 'paño inferior', 'paño bajo', 'antepecho'],
  },
  tilt_turn_transom: {
    name: 'Oscilobatiente con sobreluz',
    kind: 'casement',
    group: 'window',
    requires: ['tilt_turn', 'fixed'],
    build: hsplit([FIXED, tiltTurn('left')], (h) => [transom(h), null]),
    defaultSize: { width: 900, height: 1800 },
    tags: ['ventana', 'oscilobatiente', 'sobreluz', 'fijo arriba', 'travesaño'],
  },
  awning_transom: {
    name: 'Proyectante arriba con fijo',
    kind: 'casement',
    group: 'window',
    requires: ['awning', 'fixed'],
    build: hsplit([AWNING, FIXED], (h) => [bottomVent(h), null]),
    defaultSize: { width: 1000, height: 1500 },
    tags: ['ventana', 'proyectante', 'fijo', 'ventilación arriba', 'travesaño'],
  },
  fixed_tilt: {
    name: 'Fijo con oscilante arriba',
    kind: 'casement',
    group: 'window',
    requires: ['tilt', 'fixed'],
    build: hsplit([TILT, FIXED], (h) => [transom(h), null]),
    defaultSize: { width: 1000, height: 1600 },
    tags: ['ventana', 'oscilante', 'banderola', 'fijo', 'ventilación arriba', 'travesaño'],
  },
  fixed_awning_side: {
    name: 'Fijo + proyectante lateral',
    kind: 'casement',
    group: 'window',
    requires: ['awning', 'fixed'],
    build: vsplit([FIXED, AWNING]),
    defaultSize: { width: 1600, height: 1000 },
    tags: ['ventana', 'fijo', 'proyectante', '2 paños', 'travesaño'],
  },
  casement_double_mullion: {
    name: 'Abatible 2 hojas con parante',
    kind: 'casement',
    group: 'window',
    requires: ['casement'],
    build: vsplit([casementIn('left'), casementIn('right')]),
    defaultSize: { width: 1200, height: 1200 },
    tags: ['ventana', 'abatible', '2 hojas', 'parante fijo', 'travesaño'],
  },
  tilt_turn_fixed_tilt_turn: {
    name: 'Oscilobatiente + fijo + oscilobatiente',
    kind: 'casement',
    group: 'window',
    requires: ['tilt_turn', 'fixed'],
    build: vsplit([tiltTurn('left'), FIXED, tiltTurn('right')]),
    defaultSize: { width: 2200, height: 1400 },
    tags: ['ventana', 'oscilobatiente', 'fijo', '3 paños', 'ventanal'],
  },
  // ── v7: puertas con relleno ─────────────────────────────────────────────────
  door_panel: {
    name: 'Puerta ciega',
    kind: 'casement',
    group: 'door',
    requires: ['door'],
    build: () => {
      const id = ids()
      return { root: leaf(id(), door('left'), 'panel') }
    },
    defaultSize: { width: 900, height: 2100 },
    tags: ['puerta', 'ciega', 'panel', 'panelada', 'acceso', 'servicio', '1 hoja'],
  },
  door_zocalo: {
    name: 'Puerta con zócalo',
    kind: 'casement',
    group: 'door',
    requires: ['door'],
    build: (w, h) => {
      const id = ids()
      return { root: partNode(zocaloLeaf(door('left')), id, w, h) }
    },
    defaultSize: { width: 900, height: 2100 },
    tags: ['puerta', 'zócalo', 'panel inferior', 'media vidriada', 'balconera', '1 hoja'],
  },
  door_double_zocalo: {
    name: 'Puerta 2 hojas con zócalo',
    kind: 'casement',
    group: 'door',
    requires: ['door_double'],
    build: vsplit([zocaloLeaf(door('left')), zocaloLeaf(door('right'))], undefined, 'french'),
    defaultSize: { width: 1500, height: 2100 },
    tags: ['puerta', 'zócalo', '2 hojas', 'doble', 'francesa', 'panel inferior'],
  },
  door_out: {
    name: 'Puerta hacia afuera',
    kind: 'casement',
    group: 'door',
    requires: ['door'],
    build: single({ kind: 'door', hinge: 'left', direction: 'out' }),
    defaultSize: { width: 900, height: 2100 },
    tags: ['puerta', 'exterior', 'abre hacia afuera', 'evacuación', '1 hoja'],
  },
  // ── v7: guillotina y celosía ────────────────────────────────────────────────
  vertical_sliding: {
    name: 'Guillotina',
    kind: 'sliding',
    group: 'sliding',
    requires: ['@vertical_sash'],
    build: sliding(2, [{ kind: 'fixed' }, { kind: 'moving', direction: 'up' }], { system: 'vertical' }),
    defaultSize: { width: 900, height: 1500 },
    tags: ['ventana', 'guillotina', 'corredera vertical', 'hoja sube', 'americana'],
  },
  vertical_sliding_double: {
    name: 'Guillotina doble',
    kind: 'sliding',
    group: 'sliding',
    requires: ['@vertical_sash'],
    build: sliding(
      2,
      [
        { kind: 'moving', direction: 'down' },
        { kind: 'moving', direction: 'up' },
      ],
      { system: 'vertical' },
    ),
    defaultSize: { width: 900, height: 1500 },
    tags: ['ventana', 'guillotina', 'doble', 'corredera vertical', 'americana'],
  },
  louver_fixed: {
    name: 'Celosía fija',
    kind: 'casement',
    group: 'window',
    requires: ['fixed'],
    build: () => {
      const id = ids()
      return { root: leaf(id(), FIXED, 'louver') }
    },
    defaultSize: { width: 600, height: 600 },
    tags: ['celosía', 'lamas', 'ventilación', 'quincho', 'fijo'],
  },
  // ── v5: formas ─────────────────────────────────────────────────────────────
  round: {
    name: 'Fijo redondo',
    kind: 'casement',
    group: 'shape',
    build: shaped(() => ({ kind: 'round' })),
    defaultSize: { width: 1000, height: 1000 },
    tags: ['ventana', 'redonda', 'circular', 'ojo de buey', 'forma', 'fijo'],
  },
  oval: {
    name: 'Fijo ovalado',
    kind: 'casement',
    group: 'shape',
    build: shaped(() => ({ kind: 'oval' })),
    defaultSize: { width: 1200, height: 800 },
    tags: ['ventana', 'ovalada', 'elíptica', 'óvalo', 'forma', 'fijo'],
  },
  pentagon: {
    name: 'Fijo pentagonal',
    kind: 'casement',
    group: 'shape',
    build: shaped(() => ({ kind: 'pentagon' })),
    defaultSize: { width: 1000, height: 1000 },
    tags: ['ventana', 'pentágono', 'pentagonal', 'forma', 'fijo'],
  },
  octagon: {
    name: 'Fijo octogonal',
    kind: 'casement',
    group: 'shape',
    build: shaped(() => ({ kind: 'octagon' })),
    defaultSize: { width: 1000, height: 1000 },
    tags: ['ventana', 'octógono', 'octogonal', 'ochavada', 'forma', 'fijo'],
  },
  gable: {
    name: 'Fijo a dos aguas',
    kind: 'casement',
    group: 'shape',
    build: shaped((w, h) => ({ kind: 'gable', shoulderHeight: gableShoulder(w, h) })),
    defaultSize: { width: 1000, height: 1400 },
    tags: ['ventana', 'frontón', 'casita', 'forma de casa', 'dos aguas', 'forma', 'fijo'],
  },
  arch_segmental: {
    name: 'Arco rebajado',
    kind: 'casement',
    group: 'shape',
    // Flecha de un quinto del ancho (arco rebajado típico), sin pasar del alto.
    build: shaped((w, h) => ({ kind: 'arch', rise: mm1(clamp(roundTo10(w / 5), 1, h)) })),
    defaultSize: { width: 1200, height: 1400 },
    tags: ['ventana', 'arco', 'arco rebajado', 'carpanel', 'segmental', 'forma', 'fijo'],
  },
  arch_casement: {
    name: 'Medio punto con abatible',
    kind: 'casement',
    group: 'shape',
    // Medio punto fijo arriba (travesaño en el arranque del arco) y abatible rectangular abajo.
    build: (w, h) => {
      const id = ids()
      const head = mm1(archHead(w, h))
      return { root: splitNode(id, 'horizontal', [FIXED, casementIn('left')], [head, null], w, h), shape: { kind: 'arch', rise: head } }
    },
    defaultSize: { width: 1000, height: 1700 },
    tags: ['ventana', 'arco', 'medio punto', 'abatible', 'sobreluz en arco', 'forma'],
  },
}

/** Flecha del medio punto de `arch_casement`: semicírculo si deja al menos 300 mm para la hoja. */
function archHead(w: number, h: number): number {
  return w / 2 <= h - 300 ? w / 2 : Math.max(1, h / 2)
}

export const TYPOLOGIES: Typology[] = TYPOLOGY_IDS.map((id) => {
  const { requires: _requires, ...spec } = SPECS[id]
  return { id, ...spec }
})

/** Hoja de guillotina de la línea: el catálogo la trae como perfil con ese nombre. */
export function verticalSashProfile(lineId: Id, profiles: readonly Profile[]): Profile | undefined {
  return profiles.find((p) => p.lineId === lineId && p.role === 'sliding_sash' && /guillotina/i.test(p.name ?? ''))
}

/**
 * ¿La línea fabrica esta tipología? La lista del catálogo manda; las combinaciones de v7 (mismas
 * hojas, otra disposición) se dan por fabricables si la línea tiene sus partes y, si dividen el marco,
 * su travesaño. La guillotina exige su hoja propia.
 */
export function lineFabricates(line: Line, id: TypologyId | string, profiles: readonly Profile[]): boolean {
  if (Array.isArray(line.typologyIds) && line.typologyIds.includes(id)) return true
  const requires = SPECS[id as TypologyId]?.requires
  if (!requires) return false
  const needsMullion = getTypology(id)?.build(1000, 1000).root.type === 'split'
  if (needsMullion && !line.profiles?.mullion && !requires.some((r) => r === 'door_double')) return false
  return requires.every((r) => (r === '@vertical_sash' ? !!verticalSashProfile(line.id, profiles) : line.typologyIds?.includes(r)))
}

const BY_ID = new Map<TypologyId, Typology>(TYPOLOGIES.map((t) => [t.id, t]))

export function getTypology(id: TypologyId | string): Typology | undefined {
  return BY_ID.get(id as TypologyId)
}

/** true si el id es una tipología de la galería (validación de datos guardados o recibidos). */
export function isTypologyId(id: unknown): id is TypologyId {
  return typeof id === 'string' && BY_ID.has(id as TypologyId)
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
