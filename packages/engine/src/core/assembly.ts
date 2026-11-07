import type {
  Assembly,
  AssemblyGroup,
  AssemblyJoint,
  AssemblyKind,
  AssemblyNode,
  AssemblyUnit,
  Bom,
  Catalog,
  Coupling,
  CutPiece,
  DesignNode,
  FrameAddonKind,
  Id,
  ItemLine,
  Layout,
  LayoutAssemblyJoint,
  LayoutAssemblyPlan,
  LayoutDimension,
  LayoutPlanFacet,
  LayoutPlanPost,
  Line,
  Profile,
  Rect,
  Shape,
  Warning,
  WindowDesign,
} from '../types'
import { warning, type TypedWarning } from '../warnings'
import { mm1, round } from './format'
import { setSize } from './operations'
import { createDesign, getTypology } from './typologies'

/**
 * Conjuntos de ventanas: unidades completas (cada una con su marco, línea, color y vidrio) unidas
 * en fila o columna por un perfil de acople, y quebradas en planta por postes de esquina.
 *
 * Todo sale del catálogo: un acople o un poste existe solo si la línea lo trae y su nombre (o
 * `Profile.coupling`) declara lo que une. Si no está, la unión no se cotiza ni se reemplaza por otra
 * pieza: se avisa y queda fuera del total (ver `ItemPrice.pending`).
 *
 * Coordenadas: el desarrollo pone todas las unidades en un plano, en la convención del dibujo (vista
 * interior, y hacia abajo). La planta usa x a lo largo del muro e y hacia el exterior.
 *
 * El ángulo de una unión lleva su dirección: bajo 180 la punta sale hacia afuera (bow, esquina del
 * edificio) y sobre 180 entra hacia adentro. 210 es el poste de 150 puesto al revés: la pieza es la
 * misma, así que el catálogo y las listas siempre leen el ángulo plegado (`foldAngle`).
 */

/** Separador de ids dentro de un conjunto: `A:n3` = nodo n3 de la unidad A. */
export const UNIT_NODE_SEP = ':'

/** Tolerancia al comparar el ángulo pedido con el del poste. */
const ANGLE_EPS = 0.5
/** Desde este ángulo de poste un conjunto de varios paños se lee como bow; bajo él, como bay. */
const BOW_MIN_ANGLE = 140
/** Ángulos que tiene sentido pedir en planta. */
export const ASSEMBLY_ANGLE_LIMITS = { min: 45, max: 315 } as const
/** Paños de un bay o bow. */
export const ASSEMBLY_FACET_LIMITS = { min: 3, max: 9 } as const
/** Espesor de dibujo de la planta si la línea no trae `depth` (no entra a ningún cálculo). */
const PLAN_DEPTH_FALLBACK = 70
/** Descuento del refuerzo de un acople si la pauta no trae el de travesaño (igual que el inversor). */
const COUPLER_STEEL_DEDUCTION = 30

export const unitNodeId = (unitId: Id, nodeId: Id): Id => `${unitId}${UNIT_NODE_SEP}${nodeId}`

/** Separa `A:n3` en unidad y nodo. Sin separador es la unidad completa. */
export function parseUnitNodeId(id: Id): { unitId: Id; nodeId?: Id } {
  const at = id.indexOf(UNIT_NODE_SEP)
  return at < 0 ? { unitId: id } : { unitId: id.slice(0, at), nodeId: id.slice(at + 1) }
}

export function isAssembly(design: WindowDesign | undefined | null): design is WindowDesign & { assembly: Assembly } {
  return design?.assembly?.root?.type === 'group' && Array.isArray(design.assembly.root.children) && design.assembly.root.children.length > 0
}

function collectUnits(node: AssemblyNode, out: AssemblyUnit[]): AssemblyUnit[] {
  if (node.type === 'unit') out.push(node)
  else for (const child of node.children ?? []) collectUnits(child, out)
  return out
}

/** Unidades del conjunto, de izquierda a derecha y de arriba abajo. Sin conjunto, vacío. */
export function assemblyUnits(design: WindowDesign | undefined | null): AssemblyUnit[] {
  return isAssembly(design) ? collectUnits(design.assembly.root, []) : []
}

export function findUnit(design: WindowDesign, unitId: Id): AssemblyUnit | undefined {
  return assemblyUnits(design).find((u) => u.id === unitId)
}

// ─── Lo que el catálogo permite ─────────────────────────────────────────────

/** Ángulo del poste, sin dirección: 210° hacia adentro usa la misma pieza que 150° hacia afuera. */
export function foldAngle(angle: number): number {
  return angle > 180 ? 360 - angle : angle
}

const plain = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()

/**
 * Capacidad de un perfil de acople: la declarada en `Profile.coupling` o, si no, la que dice su
 * nombre. Solo se acepta lo explícito: «Pilar Esquinero 135°» es un poste de 135°, «Tubular Ángulo
 * Variable» admite ángulo variable y «Esquinero 60/60» es un esquinero sin ángulo declarado.
 */
export function couplingOf(profile: Profile | undefined): Coupling | undefined {
  if (!profile) return undefined
  if (profile.coupling?.kind) return profile.coupling
  if (profile.role !== 'coupler') return undefined
  const text = plain(`${profile.name ?? ''} ${profile.code ?? ''}`)
  if (/VARIABLE|ROTULA|GIRATORI|ARTICULAD/.test(text)) return { kind: 'variable' }
  const degrees = text.match(/(\d{2,3}(?:[.,]\d+)?)\s*[°º]/)
  if (degrees) {
    const angle = parseFloat(degrees[1].replace(',', '.'))
    if (angle >= ASSEMBLY_ANGLE_LIMITS.min && angle < 180) return { kind: 'corner', angle }
  }
  if (/ESQUIN|CORNER/.test(text)) return { kind: 'corner' }
  if (/COMPENSADOR|ADAPTADOR/.test(text)) return undefined
  if (/OCULTO|INVISIBLE|MUELLE/.test(text)) return { kind: 'hidden' }
  if (/ACOPLE|UNION|CONECTOR|MARCO\s*\/\s*MARCO|PILAR|TUBULAR|TUBO|AUXILIAR|PLETINA|PERFIL H/.test(text)) return { kind: 'flat' }
  return undefined
}

interface CatalogIndex {
  lines: Map<Id, Line>
  profiles: Map<Id, Profile>
  couplers: Map<Id, Profile[]>
  adapters: Map<Id, Profile[]>
}

const INDEXES = new WeakMap<Catalog, CatalogIndex>()

/** Índice por línea (se recalcula solo si cambia el catálogo: el dibujo pasa por aquí en cada arrastre). */
function indexOf(catalog: Catalog): CatalogIndex {
  const cached = INDEXES.get(catalog)
  if (cached) return cached
  const index: CatalogIndex = { lines: new Map(), profiles: new Map(), couplers: new Map(), adapters: new Map() }
  for (const line of catalog?.lines ?? []) index.lines.set(line.id, line)
  for (const p of catalog?.profiles ?? []) {
    index.profiles.set(p.id, p)
    if (p.role === 'coupler') index.couplers.set(p.lineId, [...(index.couplers.get(p.lineId) ?? []), p])
    else if (p.role === 'other' && /ADAPTADOR.*(ANGULO|VARIABLE)/.test(plain(p.name ?? ''))) index.adapters.set(p.lineId, [...(index.adapters.get(p.lineId) ?? []), p])
  }
  // El perfil por defecto de la línea puede venir de otra línea de la marca.
  for (const line of catalog?.lines ?? []) {
    const id = line.profiles?.coupler
    const p = id ? index.profiles.get(id) : undefined
    if (p && p.lineId !== line.id) index.couplers.set(line.id, [...(index.couplers.get(line.id) ?? []), p])
  }
  if (catalog && typeof catalog === 'object') INDEXES.set(catalog, index)
  return index
}

/** Lo que una línea permite unir. */
export interface LineCoupling {
  /** Acoples en un mismo plano (a la vista u ocultos). */
  flat: Profile[]
  /** Postes de esquina a ángulo fijo. */
  corners: { angle: number; profile: Profile }[]
  /** Postes de ángulo variable. */
  variable: { profile: Profile; minAngle?: number; maxAngle?: number }[]
  /** Esquineros sin ángulo declarado en el catálogo: se ofrecen solo a 90° y con aviso. */
  undeclared: Profile[]
}

export function lineCoupling(lineId: Id | undefined, catalog: Catalog): LineCoupling {
  const out: LineCoupling = { flat: [], corners: [], variable: [], undeclared: [] }
  if (!lineId) return out
  for (const profile of indexOf(catalog).couplers.get(lineId) ?? []) {
    const c = couplingOf(profile)
    if (!c) continue
    if (c.kind === 'flat' || c.kind === 'hidden') out.flat.push(profile)
    else if (c.kind === 'variable') out.variable.push({ profile, minAngle: c.minAngle, maxAngle: c.maxAngle })
    else if (typeof c.angle === 'number') out.corners.push({ angle: c.angle, profile })
    else out.undeclared.push(profile)
  }
  return out
}

function variableFits(v: LineCoupling['variable'][number], angle: number): boolean {
  return (v.minAngle === undefined || angle >= v.minAngle - ANGLE_EPS) && (v.maxAngle === undefined || angle <= v.maxAngle + ANGLE_EPS)
}

const isFlatAngle = (angle: number): boolean => Math.abs(angle - 180) < ANGLE_EPS

const ADDON_NAMES: { kind: FrameAddonKind; pattern: RegExp }[] = [
  { kind: 'subframe', pattern: /PREMARCO|PRE-MARCO/ },
  { kind: 'extension', pattern: /ENSANCHE/ },
  { kind: 'sill_profile', pattern: /VIERTE\s?AGUA/ },
]

/**
 * Piezas de contorno que trae la línea, por su nombre en el catálogo. Lo que la línea no trae no se
 * ofrece. Un perfil de hoja que dice «vierte agua» no cuenta: solo los perfiles sin rol de la ventana.
 */
export function lineFrameAddons(lineId: Id | undefined, catalog: Catalog): { kind: FrameAddonKind; profiles: Profile[] }[] {
  const all = (catalog?.profiles ?? []).filter((p) => p.lineId === lineId && p.role === 'other')
  return ADDON_NAMES.map(({ kind, pattern }) => ({ kind, profiles: all.filter((p) => pattern.test(plain(p.name ?? ''))) })).filter((a) => a.profiles.length > 0)
}

/** Ángulos en planta que ofrece una línea: los de sus postes (y si admite cualquiera). */
export interface AssemblyOptions {
  flat: boolean
  /** Ángulos fijos de los postes del catálogo, de menor a mayor. */
  angles: number[]
  /** Tiene poste de ángulo variable. */
  variable: boolean
  /** Límites del poste variable, si el catálogo los publica. */
  minAngle?: number
  maxAngle?: number
  /** Trae esquineros sin ángulo declarado (se ofrecen a 90° con aviso). */
  undeclared: boolean
}

export function assemblyOptions(lineIds: readonly (Id | undefined)[], catalog: Catalog): AssemblyOptions {
  const out: AssemblyOptions = { flat: false, angles: [], variable: false, undeclared: false }
  for (const lineId of new Set(lineIds)) {
    const c = lineCoupling(lineId, catalog)
    if (c.flat.length) out.flat = true
    for (const { angle } of c.corners) if (!out.angles.some((a) => Math.abs(a - angle) < ANGLE_EPS)) out.angles.push(angle)
    for (const v of c.variable) {
      out.variable = true
      if (v.minAngle !== undefined) out.minAngle = out.minAngle === undefined ? v.minAngle : Math.min(out.minAngle, v.minAngle)
      if (v.maxAngle !== undefined) out.maxAngle = out.maxAngle === undefined ? v.maxAngle : Math.max(out.maxAngle, v.maxAngle)
    }
    if (c.undeclared.length) out.undeclared = true
  }
  out.angles.sort((a, b) => a - b)
  return out
}

/** ¿El sistema de estas líneas permite este ángulo? 180 = acople plano. */
export function angleAllowed(angle: number, options: AssemblyOptions): boolean {
  const post = foldAngle(angle)
  if (isFlatAngle(post)) return options.flat
  if (options.angles.some((a) => Math.abs(a - post) < ANGLE_EPS)) return true
  if (options.undeclared && Math.abs(post - 90) < ANGLE_EPS) return true
  return options.variable && (options.minAngle === undefined || post >= options.minAngle - ANGLE_EPS) && (options.maxAngle === undefined || post <= options.maxAngle + ANGLE_EPS)
}

function hasPrice(profile: Profile, colorId: Id | undefined): boolean {
  const prices = profile.priceByColor ?? {}
  if (colorId && (prices[colorId] ?? 0) > 0) return true
  return ['*', 'default', 'any', ''].some((k) => (prices[k] ?? 0) > 0)
}

/** Un acople resuelto contra el catálogo. */
export interface JointResolution {
  kind: LayoutAssemblyJoint['kind']
  status: LayoutAssemblyJoint['status']
  profile?: Profile
  /** Adaptador del poste variable (uno por lado), si la línea lo trae. */
  adapter?: Profile
  /** Cara vista en el desarrollo: 0 si es oculto o si el catálogo no la trae. */
  face: number
  /** El catálogo no trae la cara vista: el ancho total no la suma. */
  faceUnknown: boolean
}

function jointFace(profile: Profile | undefined): { face: number; faceUnknown: boolean } {
  if (!profile) return { face: 0, faceUnknown: false }
  if (profile.face && profile.face > 0) return { face: profile.face, faceUnknown: false }
  return { face: 0, faceUnknown: couplingOf(profile)?.kind !== 'hidden' }
}

/**
 * Pieza que corresponde a una unión: primero la elegida (si es compatible con ese ángulo), si no el
 * perfil por defecto de la línea y luego los que tengan precio en ese color. Si ninguno sirve, no hay
 * pieza: nunca se usa una «parecida».
 */
export function resolveJoint(joint: Pick<AssemblyJoint, 'angle' | 'profileId'>, a: WindowDesign, b: WindowDesign, catalog: Catalog): JointResolution {
  const index = indexOf(catalog)
  const lineIds = [...new Set([a.lineId, b.lineId])]
  const couplings = lineIds.map((id) => lineCoupling(id, catalog))
  const colorId = a.colorId
  const rank = (list: Profile[]): Profile[] => {
    const defaults = new Set(lineIds.map((id) => index.lines.get(id)?.profiles?.coupler))
    const score = (p: Profile) => (hasPrice(p, colorId) ? 0 : 2) + (defaults.has(p.id) ? 0 : 1)
    return [...list].sort((x, y) => score(x) - score(y))
  }
  const finish = (kind: JointResolution['kind'], status: JointResolution['status'], list: Profile[], adapter?: Profile): JointResolution => {
    const chosen = list.find((p) => p.id === joint.profileId) ?? rank(list)[0]
    return { kind, status, profile: chosen, adapter, ...jointFace(chosen) }
  }
  const post = foldAngle(joint.angle)
  if (isFlatAngle(post)) {
    const flat = couplings.flatMap((c) => c.flat)
    return flat.length ? finish('coupler', 'ok', flat) : { kind: 'coupler', status: 'missing', face: 0, faceUnknown: false }
  }
  const fixed = couplings.flatMap((c) => c.corners).filter((c) => Math.abs(c.angle - post) < ANGLE_EPS).map((c) => c.profile)
  if (fixed.length) return finish('corner_post', 'ok', fixed)
  const variable = couplings.flatMap((c) => c.variable).filter((v) => variableFits(v, post)).map((v) => v.profile)
  if (variable.length) {
    const adapter = lineIds.flatMap((id) => index.adapters.get(id) ?? [])[0]
    return finish('variable_post', 'ok', variable, adapter)
  }
  const undeclared = couplings.flatMap((c) => c.undeclared)
  if (undeclared.length && Math.abs(post - 90) < ANGLE_EPS) return finish('corner_post', 'unverified', undeclared)
  return { kind: 'corner_post', status: 'missing', face: 0, faceUnknown: false }
}

// ─── Disposición ────────────────────────────────────────────────────────────

/** Una unión con todo lo que necesitan dibujo y despiece. */
export interface PlacedJoint {
  id: Id
  label: string
  group: AssemblyGroup
  index: number
  dir: 'vertical' | 'horizontal'
  angle: number
  a: WindowDesign
  b: WindowDesign
  resolution: JointResolution
  rect: Rect
  length: number
  /** Las unidades no llegan a tocarse. */
  noContact: boolean
}

export interface PlacedUnit {
  unit: AssemblyUnit
  rect: Rect
  facet: number
}

export interface AssemblyPlacement {
  width: number
  height: number
  units: PlacedUnit[]
  joints: PlacedJoint[]
  plan?: LayoutAssemblyPlan
}

const validSize = (n: number | undefined): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0)

function boundaryUnit(node: AssemblyNode, side: 'start' | 'end'): AssemblyUnit | undefined {
  if (node.type === 'unit') return node
  const list = node.children ?? []
  const child = side === 'end' && node.dir === 'row' ? list[list.length - 1] : list[0]
  return child ? boundaryUnit(child, side) : undefined
}

interface Extent {
  w: number
  h: number
}

/** Desarrollo de un conjunto: dónde cae cada unidad y cada unión. Nunca lanza. */
export function placeAssembly(design: WindowDesign, catalog: Catalog): AssemblyPlacement {
  const empty: AssemblyPlacement = { width: 0, height: 0, units: [], joints: [] }
  if (!isAssembly(design)) return empty
  const root = design.assembly.root

  const faces = new Map<string, JointResolution>()
  const keyOf = (group: AssemblyGroup, i: number) => `${group.id}#${i}`
  const resolve = (group: AssemblyGroup, i: number): JointResolution => {
    const key = keyOf(group, i)
    const known = faces.get(key)
    if (known) return known
    const a = boundaryUnit(group.children[i], 'end')
    const b = boundaryUnit(group.children[i + 1], 'start')
    const joint = group.joints?.[i]
    const angle = group === root && group.dir === 'row' ? normalizeAngle(joint?.angle) : 180
    const resolved = a && b ? resolveJoint({ angle, profileId: joint?.profileId }, a.design, b.design, catalog) : { kind: 'coupler' as const, status: 'missing' as const, face: 0, faceUnknown: false }
    faces.set(key, resolved)
    return resolved
  }

  const extent = (node: AssemblyNode): Extent => {
    if (node.type === 'unit') return { w: validSize(node.design?.width), h: validSize(node.design?.height) }
    const sizes = (node.children ?? []).map(extent)
    const gaps = sizes.slice(1).reduce((sum, _, i) => sum + resolve(node, i).face, 0)
    return node.dir === 'row'
      ? { w: sizes.reduce((sum, s) => sum + s.w, 0) + gaps, h: Math.max(0, ...sizes.map((s) => s.h)) }
      : { w: Math.max(0, ...sizes.map((s) => s.w)), h: sizes.reduce((sum, s) => sum + s.h, 0) + gaps }
  }

  const units: PlacedUnit[] = []
  const joints: PlacedJoint[] = []
  const seat = (align: AssemblyGroup['align'], room: number, own: number): number => (align === 'end' ? room - own : align === 'center' ? (room - own) / 2 : 0)

  const place = (node: AssemblyNode, x: number, y: number): void => {
    if (node.type === 'unit') {
      units.push({ unit: node, rect: { x: mm1(x), y: mm1(y), w: validSize(node.design?.width), h: validSize(node.design?.height) }, facet: 0 })
      return
    }
    const own = extent(node)
    const row = node.dir === 'row'
    let cursor = row ? x : y
    const children = node.children ?? []
    children.forEach((child, i) => {
      const e = extent(child)
      const across = row ? y + seat(node.align, own.h, e.h) : x + seat(node.align, own.w, e.w)
      place(child, row ? cursor : across, row ? across : cursor)
      cursor += row ? e.w : e.h
      if (i === children.length - 1) return
      const next = extent(children[i + 1])
      const nextAcross = row ? y + seat(node.align, own.h, next.h) : x + seat(node.align, own.w, next.w)
      const a = boundaryUnit(child, 'end')
      const b = boundaryUnit(children[i + 1], 'start')
      const resolution = resolve(node, i)
      const angle = node === root && row ? normalizeAngle(node.joints?.[i]?.angle) : 180
      const from = Math.max(across, nextAcross)
      const to = Math.min(across + (row ? e.h : e.w), nextAcross + (row ? next.h : next.w))
      const spanFrom = isFlatAngle(angle) ? from : Math.min(across, nextAcross)
      const spanTo = isFlatAngle(angle) ? to : Math.max(across + (row ? e.h : e.w), nextAcross + (row ? next.h : next.w))
      const length = Math.max(0, spanTo - spanFrom)
      const face = resolution.face
      if (a && b) {
        joints.push({
          id: `J${joints.length + 1}`,
          label: `${a.id}–${b.id}`,
          group: node,
          index: i,
          dir: row ? 'vertical' : 'horizontal',
          angle,
          a: a.design,
          b: b.design,
          resolution,
          rect: row ? { x: mm1(cursor), y: mm1(spanFrom), w: mm1(face), h: mm1(length) } : { x: mm1(spanFrom), y: mm1(cursor), w: mm1(length), h: mm1(face) },
          length: mm1(length),
          noContact: to - from <= 0.05,
        })
      }
      cursor += face
    })
  }
  place(root, 0, 0)
  const total = extent(root)
  const plan = root.dir === 'row' ? planOf(design, catalog, units, joints) : undefined
  if (plan) {
    for (const facet of plan.facets) for (const id of facet.unitIds) {
      const placed = units.find((u) => u.unit.id === id)
      if (placed) placed.facet = facet.index
    }
  }
  const out: AssemblyPlacement = { width: mm1(total.w), height: mm1(total.h), units, joints }
  if (plan) out.plan = plan
  return out
}

function normalizeAngle(angle: number | undefined): number {
  if (typeof angle !== 'number' || !Number.isFinite(angle)) return 180
  return Math.min(ASSEMBLY_ANGLE_LIMITS.max, Math.max(ASSEMBLY_ANGLE_LIMITS.min, angle))
}

const rad = (deg: number): number => (deg * Math.PI) / 180

/**
 * Planta de un conjunto quebrado: cada paño recto (una o más unidades en un mismo plano) va de poste
 * en poste. El rumbo baja en cada poste lo que el ángulo se aleja de 180: un paño que sale del muro,
 * uno paralelo y uno que vuelve. El primero parte con la mitad del giro total para que el conjunto sea
 * simétrico respecto del muro; una esquina deja de frente el paño de `assembly.front` (el que ya
 * estaba al unir, sin dato el último) y gira el otro. Bajo 180 el giro baja y la punta sale hacia
 * afuera; sobre 180 sube y la punta entra.
 */
function planOf(design: WindowDesign, catalog: Catalog, units: PlacedUnit[], joints: PlacedJoint[]): LayoutAssemblyPlan | undefined {
  const root = design.assembly!.root
  const rootJoints = joints.filter((j) => j.group === root)
  const breaks = rootJoints.filter((j) => !isFlatAngle(j.angle))
  if (breaks.length === 0) return undefined
  const index = indexOf(catalog)

  // Paños: tramos del desarrollo entre uniones que quiebran.
  const bounds: number[] = [0]
  for (const j of breaks) bounds.push(j.rect.x)
  const facets: { x0: number; x1: number; unitIds: Id[]; depth?: number }[] = []
  breaks.forEach((j, i) => facets.push({ x0: i === 0 ? 0 : breaks[i - 1].rect.x + breaks[i - 1].rect.w, x1: j.rect.x, unitIds: [] }))
  const last = breaks[breaks.length - 1]
  facets.push({ x0: last.rect.x + last.rect.w, x1: Math.max(...units.map((u) => u.rect.x + u.rect.w)), unitIds: [] })
  for (const u of units) {
    const mid = u.rect.x + u.rect.w / 2
    const facet = facets.find((f) => mid >= f.x0 - 0.05 && mid <= f.x1 + 0.05)
    if (!facet) continue
    facet.unitIds.push(u.unit.id)
    const depth = index.lines.get(u.unit.design.lineId)?.depth
    if (depth && depth > 0) facet.depth = Math.max(facet.depth ?? 0, depth)
  }

  const deflections = breaks.map((j) => 180 - j.angle)
  const sweep = deflections.reduce((a, b) => a + b, 0)
  const corner = design.assembly!.kind === 'corner' && breaks.length === 1
  const firstInFront = design.assembly!.front === 'start'
  let heading = corner ? (firstInFront ? 0 : sweep) : sweep / 2
  const planFacets: LayoutPlanFacet[] = []
  const posts: LayoutPlanPost[] = []
  let x = 0
  let y = 0
  facets.forEach((facet, i) => {
    const width = Math.max(0, facet.x1 - facet.x0)
    const c = Math.cos(rad(heading))
    const s = Math.sin(rad(heading))
    const toX = x + width * c
    const toY = y + width * s
    const f: LayoutPlanFacet = {
      index: i,
      unitIds: facet.unitIds,
      from: { x, y },
      to: { x: toX, y: toY },
      heading: round(heading, 3),
      width: mm1(width),
      depth: facet.depth ?? PLAN_DEPTH_FALLBACK,
    }
    if (!facet.depth) f.depthAssumed = true
    planFacets.push(f)
    x = toX
    y = toY
    const joint = breaks[i]
    if (!joint) return
    const face = joint.resolution.face
    const next = heading - deflections[i]
    const px = x + (face / 2) * c
    const py = y + (face / 2) * s
    posts.push({ jointId: joint.id, x: px, y: py, heading: round(heading - deflections[i] / 2, 3), angle: foldAngle(joint.angle), face, status: joint.resolution.status })
    x = px + (face / 2) * Math.cos(rad(next))
    y = py + (face / 2) * Math.sin(rad(next))
    heading = next
  })

  const xs = planFacets.flatMap((f) => [f.from.x, f.to.x])
  const ys = planFacets.flatMap((f) => [f.from.y, f.to.y])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  for (const f of planFacets) {
    f.from = { x: mm1(f.from.x - minX), y: mm1(f.from.y - minY) }
    f.to = { x: mm1(f.to.x - minX), y: mm1(f.to.y - minY) }
  }
  for (const p of posts) {
    p.x = mm1(p.x - minX)
    p.y = mm1(p.y - minY)
  }
  const plan: LayoutAssemblyPlan = {
    facets: planFacets,
    posts,
    span: mm1(Math.max(...xs) - minX),
    projection: mm1(Math.max(...ys) - minY),
    developed: mm1(planFacets.reduce((a, f) => a + f.width, 0) + posts.reduce((a, p) => a + p.face, 0)),
  }
  if (design.assembly!.kind === 'bow') {
    const sameAngle = deflections.every((d) => Math.abs(d - deflections[0]) < ANGLE_EPS)
    const sameWidth = planFacets.every((f) => Math.abs(f.width - planFacets[0].width) < 0.5)
    if (sameAngle && sameWidth && Math.abs(deflections[0]) > 0.1) {
      plan.radius = mm1((planFacets[0].width + (posts[0]?.face ?? 0)) / (2 * Math.sin(rad(Math.abs(deflections[0]) / 2))))
    }
  }
  return plan
}

// ─── Dibujo ─────────────────────────────────────────────────────────────────

const shifted = (r: Rect, dx: number, dy: number): Rect => ({ x: mm1(r.x + dx), y: mm1(r.y + dy), w: r.w, h: r.h })

/** Dónde queda una unidad en planta: sobre su paño, a la distancia que indica el desarrollo. */
function unitPlacement(placed: AssemblyPlacement, rect: Rect, facet: number): { x: number; y: number; heading: number; top: number } {
  const f = placed.plan?.facets[facet]
  if (!f) return { x: rect.x, y: 0, heading: 0, top: rect.y }
  const first = Math.min(...placed.units.filter((u) => u.facet === facet).map((u) => u.rect.x))
  const along = rect.x - first
  const h = rad(f.heading)
  return { x: mm1(f.from.x + along * Math.cos(h)), y: mm1(f.from.y + along * Math.sin(h)), heading: f.heading, top: rect.y }
}

/**
 * Geometría del conjunto: el dibujo de cada unidad, sus uniones, la planta y, en listas planas, todas
 * las piezas en coordenadas del desarrollo con id `unidad:nodo` para seleccionar y editar.
 */
export function assemblyLayout(design: WindowDesign, catalog: Catalog, compute: (d: WindowDesign, c: Catalog) => Layout): Layout {
  const placed = placeAssembly(design, catalog)
  const layout: Layout = {
    width: placed.width,
    height: placed.height,
    frame: { rect: { x: 0, y: 0, w: placed.width, h: placed.height }, face: 0 },
    mullions: [],
    sashes: [],
    panes: [],
    sliding: [],
    dimensions: [
      { axis: 'x', from: 0, to: placed.width, value: placed.width, level: 0 },
      { axis: 'y', from: 0, to: placed.height, value: placed.height, level: 0 },
    ],
    cells: [],
    assembly: {
      kind: design.assembly?.kind ?? 'flat',
      units: [],
      joints: placed.joints.map((j) => {
        const out: LayoutAssemblyJoint = {
          id: j.id,
          label: j.label,
          groupId: j.group.id,
          index: j.index,
          dir: j.dir,
          rect: j.rect,
          angle: foldAngle(j.angle),
          kind: j.resolution.kind,
          status: j.resolution.status,
          length: j.length,
        }
        if (j.angle > 180 + ANGLE_EPS) out.inward = true
        const p = j.resolution.profile
        if (p) {
          out.profileId = p.id
          out.code = p.code
          out.name = p.name
        }
        return out
      }),
    },
  }
  if (placed.plan) layout.assembly!.plan = placed.plan
  const seenDims = new Set<string>()
  const addDim = (dim: LayoutDimension) => {
    const key = `${dim.axis}|${dim.from}|${dim.to}`
    if (seenDims.has(key)) return
    seenDims.add(key)
    layout.dimensions.push(dim)
  }
  for (const { unit, rect, facet } of placed.units) {
    const own = compute(unit.design, catalog)
    layout.assembly!.units.push({ unitId: unit.id, rect, layout: own, design: unit.design, facet, placement: unitPlacement(placed, rect, facet) })
    const { x, y } = rect
    const id = (nodeId: Id) => unitNodeId(unit.id, nodeId)
    for (const m of own.mullions) layout.mullions.push({ ...m, nodeId: id(m.nodeId), rect: shifted(m.rect, x, y), axis: mm1(m.axis + (m.dir === 'vertical' ? x : y)), min: mm1(m.min + (m.dir === 'vertical' ? x : y)), max: mm1(m.max + (m.dir === 'vertical' ? x : y)) })
    for (const s of own.sashes) layout.sashes.push({ ...s, nodeId: id(s.nodeId), rect: shifted(s.rect, x, y), glassRect: shifted(s.glassRect, x, y) })
    for (const p of own.panes) layout.panes.push({ ...p, nodeId: id(p.nodeId), glassRect: shifted(p.glassRect, x, y) })
    for (const p of own.sliding) layout.sliding.push({ ...p, panelId: id(p.panelId), rect: shifted(p.rect, x, y), glassRect: shifted(p.glassRect, x, y) })
    for (const c of own.cells) layout.cells.push({ ...c, nodeId: id(c.nodeId), rect: shifted(c.rect, x, y), path: c.path.map(id) })
    addDim({ axis: 'x', from: x, to: mm1(x + rect.w), value: rect.w, level: 1, target: { kind: 'width', unitId: unit.id } })
    addDim({ axis: 'y', from: y, to: mm1(y + rect.h), value: rect.h, level: 1, target: { kind: 'height', unitId: unit.id } })
  }
  return layout
}

// ─── Despiece ───────────────────────────────────────────────────────────────

function prefixed<T extends { nodeId?: Id; label?: string }>(entry: T, unitId: Id): T {
  const out = { ...entry }
  if (entry.nodeId) out.nodeId = unitNodeId(unitId, entry.nodeId)
  return out
}

function unitWarning(w: Warning, unit: AssemblyUnit, design: WindowDesign, catalog: Catalog): Warning {
  const out: Warning = { ...w, unitId: unit.id, ...(w.nodeId ? { nodeId: unitNodeId(unit.id, w.nodeId) } : {}) }
  if (w.fix) {
    const patched = { ...unit.design, ...w.fix.patch }
    out.fix = { ...w.fix, patch: { assembly: updateUnit(design, unit.id, patched, catalog).assembly } }
  }
  return out
}

/** Despiece del conjunto: la suma de sus unidades más acoples, postes, refuerzos y adaptadores. */
export function assemblyBom(design: WindowDesign, catalog: Catalog, compute: (d: WindowDesign, c: Catalog) => Bom): Bom {
  const placed = placeAssembly(design, catalog)
  const units = placed.units.map(({ unit }) => ({ unitId: unit.id, design: unit.design, bom: compute(unit.design, catalog) }))
  const warnings: Warning[] = []
  const seen = new Set<string>()
  const add = (w: TypedWarning, key: string) => {
    if (seen.has(key)) return
    seen.add(key)
    warnings.push(warning(w))
  }
  const index = indexOf(catalog)
  const items = new Map(catalog?.items?.map((i) => [i.id, i]) ?? [])
  const cuts: CutPiece[] = []
  const jointItems = new Map<Id, ItemLine>()
  const missingJoints: { jointId: Id; label: string; angle: number }[] = []
  let jointKg = 0

  for (const j of placed.joints) {
    const { resolution: r } = j
    const lineName = index.lines.get(j.a.lineId)?.name ?? 'La línea'
    const flat = isFlatAngle(j.angle)
    const nodeId = j.id
    if (j.noContact) {
      add({ level: 'warn', code: 'assembly_no_contact', nodeId, message: `Las unidades ${j.label} no se tocan: revisa sus medidas o cómo están alineadas.`, params: { joint: j.label } }, `nc|${j.id}`)
    }
    if (r.status === 'missing' || !r.profile) {
      missingJoints.push({ jointId: j.id, label: j.label, angle: foldAngle(j.angle) })
      add(
        {
          level: 'error',
          code: 'assembly_joint_missing',
          nodeId,
          message: flat
            ? `${lineName} no tiene perfil de acople en el catálogo: la unión ${j.label} queda sin pieza y fuera del total.`
            : `${lineName} no tiene poste para ${formatAngle(foldAngle(j.angle))} en el catálogo: la unión ${j.label} queda sin pieza y fuera del total. Usa un ángulo que el sistema permita.`,
          params: flat ? { variant: 'flat', line: lineName, joint: j.label } : { variant: 'corner', line: lineName, joint: j.label, angle: foldAngle(j.angle) },
        },
        `missing|${j.id}`,
      )
      continue
    }
    const p = r.profile
    const label = `${flat ? 'acople' : 'poste'} ${j.label}`
    const side = j.dir === 'vertical' ? 'mullion' : 'transom'
    const colorId = j.a.colorId
    const piece = (profile: Profile, qty: number, text: string): CutPiece => ({
      kind: 'profile',
      profileId: profile.id,
      code: profile.code,
      name: profile.name,
      role: profile.role,
      colorId,
      length: j.length,
      qty,
      angleStart: 90,
      angleEnd: 90,
      side,
      label: text,
      nodeId,
      barLength: profile.barLength > 0 ? profile.barLength : 0,
    })
    if (!(p.barLength > 0)) {
      add({ level: 'info', code: 'bar_length_missing', message: `${p.code} no trae largo de barra en el catálogo: se optimiza con el largo de Ajustes › Taller.`, params: { profile: p.code } }, `bar|${p.code}`)
    }
    if (j.length > 0) {
      cuts.push(piece(p, 1, label))
      if (r.adapter) cuts.push(piece(r.adapter, 2, `adaptador ${j.label}`))
    }
    const steel = p.reinforcementId ? index.profiles.get(p.reinforcementId) : undefined
    if (steel && j.length > 0) {
      const deduction = index.lines.get(p.lineId)?.pauta?.reinforcement?.mullion
      const length = mm1(j.length - (deduction ?? COUPLER_STEEL_DEDUCTION))
      if (deduction === undefined) {
        add({ level: 'info', code: 'reinforcement_deduction_missing', message: `${p.code} lleva refuerzo, pero la pauta no indica cuánto descontarle: usamos corte − ${COUPLER_STEEL_DEDUCTION} mm.`, params: { deduction: COUPLER_STEEL_DEDUCTION, profile: p.code } }, `ded|${p.code}`)
      }
      if (length > 0) cuts.push({ ...piece(steel, 1, label), kind: 'reinforcement', role: 'reinforcement', colorId: undefined, length })
    } else if (!flat) {
      add({ level: 'info', code: 'assembly_post_no_steel', nodeId, message: `El poste ${p.code} no tiene refuerzo asignado en el catálogo: confirma con tu proveedor si lo lleva.`, params: { profile: p.code } }, `steel|${p.code}`)
    }
    if (r.status === 'unverified') {
      add({ level: 'warn', code: 'assembly_post_unverified', nodeId, message: `El esquinero ${p.code} no declara su ángulo en el catálogo: se usó a 90°. Confírmalo con tu proveedor.`, params: { profile: p.code } }, `unv|${p.code}`)
    }
    if (r.faceUnknown) {
      add({ level: 'info', code: 'assembly_coupler_no_face', nodeId, message: `${p.code} no trae su cara vista en el catálogo: el ancho total no la suma. Agrégala para que la medida sea exacta.`, params: { profile: p.code } }, `face|${p.code}`)
    }
    const la = index.lines.get(j.a.lineId)
    const lb = index.lines.get(j.b.lineId)
    if (la && lb && la.id !== lb.id && (la.brandId !== lb.brandId || (la.depth && lb.depth && la.depth !== lb.depth))) {
      add({ level: 'warn', code: 'assembly_mixed_systems', nodeId, message: `La unión ${j.label} junta ${la.name} y ${lb.name}, que no son del mismo sistema: confirma con tu proveedor que el acople sirve para ambas.`, params: { joint: j.label, a: la.name, b: lb.name } }, `mix|${la.id}|${lb.id}`)
    }
    for (const rule of la?.accessoryRules ?? []) {
      if (rule.per !== 'coupler_m' || !(rule.qty > 0)) continue
      const qty = round((rule.qty * j.length) / 1000, 2)
      const item = items.get(rule.itemId)
      const prev = jointItems.get(rule.itemId)
      if (prev) prev.qty = round(prev.qty + qty, 2)
      else jointItems.set(rule.itemId, { itemId: rule.itemId, code: item?.code ?? rule.itemId, name: item?.name ?? 'Accesorio sin ficha', unit: item?.unit ?? 'u', qty, kind: item?.kind ?? 'accessory' })
    }
    jointKg += (j.length / 1000) * (p.weightKgM ?? 0)
  }

  const jointBom: Bom = { cuts, glass: [], items: [...jointItems.values()], warnings, area: 0, perimeter: 0, weightKg: round(jointKg, 1) }
  const out: Bom = {
    cuts: [],
    glass: [],
    items: [],
    warnings: [],
    area: 0,
    perimeter: 0,
    weightKg: jointBom.weightKg,
    assembly: { units, joints: jointBom, missingJoints },
  }
  for (const { unitId, bom } of units) {
    const unit = placed.units.find((u) => u.unit.id === unitId)!.unit
    for (const c of bom.cuts) out.cuts.push({ ...prefixed(c, unitId), label: `${unitId} · ${c.label}` })
    for (const g of bom.glass) out.glass.push({ ...prefixed(g, unitId), label: `${unitId} · ${g.label}` })
    for (const p of bom.panels ?? []) (out.panels ??= []).push({ ...prefixed(p, unitId), label: `${unitId} · ${p.label}` })
    for (const it of bom.items) out.items.push(prefixed(it, unitId))
    for (const w of bom.warnings) out.warnings.push(unitWarning(w, unit, design, catalog))
    out.area = round(out.area + (bom.area ?? 0), 4)
    out.perimeter = round(out.perimeter + (bom.perimeter ?? 0), 3)
    out.weightKg = round((out.weightKg ?? 0) + (bom.weightKg ?? 0), 1)
  }
  out.cuts.push(...cuts)
  out.items.push(...jointBom.items)
  out.warnings.push(...warnings)
  return out
}

const formatAngle = (angle: number): string => `${String(round(angle, 1)).replace('.', ',')}°`

// ─── Edición ────────────────────────────────────────────────────────────────

function mapAssembly(node: AssemblyNode, fn: (n: AssemblyNode) => AssemblyNode): AssemblyNode {
  const next = fn(node)
  if (next.type !== 'group') return next
  const children = next.children.map((c) => mapAssembly(c, fn))
  return children.some((c, i) => c !== next.children[i]) ? { ...next, children } : next
}

/**
 * Deja al día los datos del conjunto que dependen de sus unidades: totales desarrollados y línea,
 * color y vidrio de la primera (lo que muestran las listas). `root` queda como paño fijo de reserva.
 */
export function syncAssembly(design: WindowDesign, catalog: Catalog): WindowDesign {
  if (!isAssembly(design)) return design
  const placed = placeAssembly(design, catalog)
  const first = assemblyUnits(design)[0]?.design
  const next: WindowDesign = {
    ...design,
    width: placed.width,
    height: placed.height,
    lineId: first?.lineId ?? design.lineId,
    colorId: first?.colorId ?? design.colorId,
    glassId: first?.glassId ?? design.glassId,
    root: { id: 'n1', type: 'leaf', opening: { kind: 'fixed' } },
  }
  if (first?.colorInId) next.colorInId = first.colorInId
  else delete next.colorInId
  return next
}

function withRoot(design: WindowDesign, root: AssemblyGroup, catalog: Catalog): WindowDesign {
  return syncAssembly({ ...design, assembly: { ...design.assembly!, root } }, catalog)
}

/** Lo que el conjunto es según sus uniones: nadie elige «bow», se arma y se nombra solo. */
export function assemblyKindOf(root: AssemblyGroup): AssemblyKind {
  if (root.dir !== 'row') return 'flat'
  const breaks = root.joints.map((j) => foldAngle(normalizeAngle(j.angle))).filter((a) => !isFlatAngle(a))
  if (breaks.length === 0) return 'flat'
  if (breaks.length === 1) return 'corner'
  return breaks.every((a) => a >= BOW_MIN_ANGLE - ANGLE_EPS) ? 'bow' : 'bay'
}

/** Como `withRoot`, cuando cambian las uniones o los paños: el tipo del conjunto se recalcula. */
function withJoints(design: WindowDesign, root: AssemblyGroup, catalog: Catalog): WindowDesign {
  return syncAssembly({ ...design, assembly: { ...design.assembly!, root, kind: assemblyKindOf(root) } }, catalog)
}

/** Reemplaza el diseño de una unidad (misma referencia si no cambia). */
export function updateUnit(design: WindowDesign, unitId: Id, next: WindowDesign, catalog: Catalog): WindowDesign {
  if (!isAssembly(design)) return design
  const clean = stripAssembly(next)
  let changed = false
  const root = mapAssembly(design.assembly.root, (n) => {
    if (n.type !== 'unit' || n.id !== unitId || n.design === next) return n
    changed = true
    return { ...n, design: clean }
  }) as AssemblyGroup
  return changed ? withRoot(design, root, catalog) : design
}

/** Medida de una unidad, reescalando sus divisiones internas como cualquier ventana. */
export function setUnitSize(design: WindowDesign, unitId: Id, width: number, height: number, catalog: Catalog): WindowDesign {
  const unit = findUnit(design, unitId)
  if (!unit) return design
  const next = setSize(unit.design, { width, height })
  return next === unit.design ? design : updateUnit(design, unitId, next, catalog)
}

function stripAssembly(design: WindowDesign): WindowDesign {
  if (!design?.assembly) return design
  const { assembly: _ignored, ...rest } = design
  return rest
}

function unitLetter(i: number): Id {
  const letter = String.fromCharCode(65 + (i % 26))
  return i < 26 ? letter : `${String.fromCharCode(64 + Math.floor(i / 26))}${letter}`
}

function nextUnitId(units: AssemblyUnit[]): Id {
  const used = new Set(units.map((u) => u.id))
  for (let i = 0; ; i++) if (!used.has(unitLetter(i))) return unitLetter(i)
}

function nextGroupId(root: AssemblyGroup): Id {
  const used = new Set<Id>()
  const walk = (n: AssemblyNode) => {
    if (n.type === 'group') {
      used.add(n.id)
      n.children.forEach(walk)
    }
  }
  walk(root)
  for (let i = 1; ; i++) if (!used.has(`g${i}`)) return `g${i}`
}

export type UnitSide = 'left' | 'right' | 'top' | 'bottom'

/**
 * Une dos ventanas: `design` queda como unidad A y `other` como unidad B, al lado pedido. Si luego la
 * unión se quiebra, la que ya estaba queda de frente y gira la nueva.
 */
function startAssembly(design: WindowDesign, other: WindowDesign, side: UnitSide, catalog: Catalog): WindowDesign {
  const row = side === 'left' || side === 'right'
  const before = side === 'left' || side === 'top'
  const a: AssemblyUnit = { id: 'A', type: 'unit', design: stripAssembly(design) }
  const b: AssemblyUnit = { id: 'B', type: 'unit', design: stripAssembly(other) }
  const root: AssemblyGroup = { id: 'g1', type: 'group', dir: row ? 'row' : 'column', children: before ? [{ ...b, id: 'A' }, { ...a, id: 'B' }] : [a, b], joints: [{ angle: 180 }] }
  return syncAssembly({ ...design, assembly: { kind: 'flat', root, front: before ? 'end' : 'start' } }, catalog)
}

/**
 * Agrega una ventana junto a otra: si `design` todavía es una ventana suelta, la convierte en
 * conjunto; si ya es un conjunto, inserta junto a la unidad `targetUnitId`. En una fila que ya se
 * quiebra la nueva unión toma el ángulo de su vecina (así, repetir arma un bow); si no, nace plana.
 * Una ventana agregada arriba en una fila deja la fila apoyada abajo: la nueva sube, nada se corre.
 */
export function joinWindow(design: WindowDesign, other: WindowDesign, side: UnitSide, catalog: Catalog, targetUnitId?: Id): WindowDesign {
  if (!isAssembly(design)) return startAssembly(design, other, side, catalog)
  const units = assemblyUnits(design)
  const targetId = targetUnitId ?? units[units.length - 1]?.id
  const newUnit: AssemblyUnit = { id: nextUnitId(units), type: 'unit', design: stripAssembly(other) }
  const dir = side === 'left' || side === 'right' ? 'row' : 'column'
  const before = side === 'left' || side === 'top'
  const root = design.assembly.root
  let inserted = false

  const insert = (group: AssemblyGroup): AssemblyGroup => {
    const at = group.children.findIndex((c) => c.type === 'unit' && c.id === targetId)
    if (at >= 0) {
      inserted = true
      if (group.dir === dir) {
        const pos = before ? at : at + 1
        const children = [...group.children.slice(0, pos), newUnit, ...group.children.slice(pos)]
        const neighbor = group.joints[Math.min(at, group.joints.length - 1)]
        const angle = group === root && dir === 'row' ? (neighbor?.angle ?? 180) : 180
        const joints = [...group.joints.slice(0, pos > 0 ? pos - 1 : 0), { angle }, ...group.joints.slice(pos > 0 ? pos - 1 : 0)]
        return { ...group, children, joints }
      }
      // Otra dirección: la unidad pasa a ser un subgrupo con la nueva.
      const target = group.children[at]
      const wrapper: AssemblyGroup = {
        id: nextGroupId(root),
        type: 'group',
        dir,
        children: before ? [newUnit, target] : [target, newUnit],
        joints: [{ angle: 180 }],
      }
      const seated = side === 'top' && group.dir === 'row' && !group.align ? { align: 'end' as const } : {}
      return { ...group, ...seated, children: group.children.map((c, i) => (i === at ? wrapper : c)) }
    }
    return { ...group, children: group.children.map((c) => (c.type === 'group' && !inserted ? insert(c) : c)) }
  }
  const nextRoot = insert(root)
  return inserted ? withJoints(design, nextRoot, catalog) : design
}

/**
 * Quita una unidad. Un grupo con un solo hijo desaparece; si queda una sola unidad, el conjunto vuelve
 * a ser una ventana suelta.
 */
export function removeUnit(design: WindowDesign, unitId: Id, catalog: Catalog): WindowDesign {
  if (!isAssembly(design)) return design
  const units = assemblyUnits(design)
  if (!units.some((u) => u.id === unitId)) return design
  if (units.length <= 2) return units.find((u) => u.id !== unitId)?.design ?? design

  const prune = (group: AssemblyGroup): AssemblyGroup | AssemblyNode | null => {
    const at = group.children.findIndex((c) => c.type === 'unit' && c.id === unitId)
    let children = group.children
    let joints = group.joints
    if (at >= 0) {
      children = group.children.filter((_, i) => i !== at)
      joints = group.joints.filter((_, i) => i !== Math.min(at, group.joints.length - 1))
    } else {
      children = []
      joints = [...group.joints]
      group.children.forEach((c, i) => {
        const pruned = c.type === 'group' ? prune(c) : c
        if (pruned) children.push(pruned)
        else joints.splice(Math.min(i, joints.length - 1), 1)
      })
    }
    if (children.length === 0) return null
    if (children.length === 1) return children[0]
    return { ...group, children, joints }
  }
  const next = prune(design.assembly.root)
  if (!next) return design
  const root: AssemblyGroup = next.type === 'group' ? next : { id: 'g1', type: 'group', dir: 'row', children: [next], joints: [] }
  return withJoints(design, root, catalog)
}

/** Cambia una unión de una fila o columna (misma referencia si no cambia). */
export function setAssemblyJoint(design: WindowDesign, groupId: Id, index: number, patch: Partial<AssemblyJoint>, catalog: Catalog): WindowDesign {
  if (!isAssembly(design)) return design
  let changed = false
  const root = mapAssembly(design.assembly.root, (n) => {
    if (n.type !== 'group' || n.id !== groupId || !n.joints[index]) return n
    const prev = n.joints[index]
    const merged: AssemblyJoint = { ...prev, ...patch }
    if (patch.profileId === undefined && 'profileId' in patch) delete merged.profileId
    if (merged.angle === prev.angle && merged.profileId === prev.profileId) return n
    changed = true
    return { ...n, joints: n.joints.map((j, i) => (i === index ? merged : j)) }
  }) as AssemblyGroup
  return changed ? withJoints(design, root, catalog) : design
}

/** Mismo ángulo en todas las uniones de la fila raíz (bay y bow). */
export function setAssemblyAngle(design: WindowDesign, angle: number, catalog: Catalog): WindowDesign {
  if (!isAssembly(design) || design.assembly.root.dir !== 'row') return design
  const root = design.assembly.root
  const value = normalizeAngle(angle)
  if (root.joints.every((j) => j.angle === value)) return design
  return withJoints(design, { ...root, joints: root.joints.map(() => ({ angle: value })) }, catalog)
}

/** Qué extremo de una esquina queda de frente al muro: el otro es el que gira. */
export function setAssemblyFront(design: WindowDesign, front: 'start' | 'end', catalog: Catalog): WindowDesign {
  if (!isAssembly(design) || (design.assembly.front ?? 'end') === front) return design
  return syncAssembly({ ...design, assembly: { ...design.assembly, front } }, catalog)
}

/** Da vuelta las uniones de la fila: lo que salía hacia afuera entra, y al revés. */
export function invertAssembly(design: WindowDesign, catalog: Catalog): WindowDesign {
  if (!isAssembly(design) || design.assembly.root.dir !== 'row') return design
  const root = design.assembly.root
  if (root.joints.every((j) => isFlatAngle(normalizeAngle(j.angle)))) return design
  return withJoints(design, { ...root, joints: root.joints.map((j) => (isFlatAngle(normalizeAngle(j.angle)) ? j : { ...j, angle: 360 - normalizeAngle(j.angle) })) }, catalog)
}

const otherSide = (side: 'left' | 'right'): 'left' | 'right' => (side === 'left' ? 'right' : 'left')

function mirrorNode(node: DesignNode): DesignNode {
  if (node.type === 'leaf') {
    const opening = { ...node.opening }
    if (opening.hinge) opening.hinge = otherSide(opening.hinge)
    if (opening.slide) opening.slide = otherSide(opening.slide)
    if (typeof opening.pivot === 'number' && opening.kind === 'pivot_v') opening.pivot = round(1 - opening.pivot, 4)
    return { ...node, opening }
  }
  if (node.type === 'sliding') {
    const panels = [...node.panels].reverse().map((p) => (p.direction === 'left' || p.direction === 'right' ? { ...p, direction: otherSide(p.direction) } : p))
    return node.sizes ? { ...node, panels, sizes: [...node.sizes].reverse() } : { ...node, panels }
  }
  const children = node.children.map(mirrorNode)
  if (node.dir !== 'vertical') return { ...node, children }
  const out: DesignNode = { ...node, children: children.reverse(), sizes: [...node.sizes].reverse() }
  if (node.joint === 'french') out.passive = otherSide(node.passive ?? 'left')
  return out
}

function mirrorShape(shape: Shape | undefined): Shape | undefined {
  if (shape?.kind === 'trapezoid') return { ...shape, leftHeight: shape.rightHeight, rightHeight: shape.leftHeight }
  if (shape?.kind === 'triangle' && shape.apex !== 'center') return { ...shape, apex: otherSide(shape.apex) }
  return shape
}

/** La misma ventana vista en un espejo: divisiones invertidas y bisagras al otro lado. */
function mirrorDesign(design: WindowDesign): WindowDesign {
  const next: WindowDesign = { ...design, root: mirrorNode(design.root) }
  const shape = mirrorShape(design.shape)
  if (shape) next.shape = shape
  return next
}

/**
 * Da vuelta todo el conjunto de izquierda a derecha, como en un espejo: el orden de las ventanas, sus
 * divisiones y bisagras. Cada ángulo y su dirección se conservan, y las letras se vuelven a repartir
 * de izquierda a derecha para que despiece y dibujo sigan coincidiendo.
 */
export function mirrorAssembly(design: WindowDesign, catalog: Catalog): WindowDesign {
  if (!isAssembly(design)) return design
  const flip = (node: AssemblyNode): AssemblyNode => {
    if (node.type === 'unit') return { ...node, design: mirrorDesign(node.design) }
    const children = node.children.map(flip)
    if (node.dir === 'row') return { ...node, children: children.reverse(), joints: [...node.joints].reverse() }
    return { ...node, children, align: !node.align || node.align === 'start' ? 'end' : node.align === 'end' ? 'start' : 'center' }
  }
  let letter = 0
  const relabel = (node: AssemblyNode): AssemblyNode => (node.type === 'unit' ? { ...node, id: unitLetter(letter++) } : { ...node, children: node.children.map(relabel) })
  const root = relabel(flip(design.assembly.root)) as AssemblyGroup
  return syncAssembly({ ...design, assembly: { ...design.assembly, root, front: design.assembly.front === 'start' ? 'end' : 'start' } }, catalog)
}

/** Alineación de los hijos de un grupo cuando no miden lo mismo. */
export function setAssemblyAlign(design: WindowDesign, groupId: Id, align: AssemblyGroup['align'], catalog: Catalog): WindowDesign {
  if (!isAssembly(design)) return design
  let changed = false
  const root = mapAssembly(design.assembly.root, (n) => {
    if (n.type !== 'group' || n.id !== groupId || (n.align ?? 'start') === (align ?? 'start')) return n
    changed = true
    return { ...n, align }
  }) as AssemblyGroup
  return changed ? withRoot(design, root, catalog) : design
}

/**
 * Aplica a todas las unidades un cambio que no altera sus medidas (color, vidrio): no necesita el
 * catálogo porque los totales no se mueven.
 */
export function mapUnitDesigns(design: WindowDesign, fn: (unit: WindowDesign) => WindowDesign): WindowDesign {
  if (!isAssembly(design)) return fn(design)
  let changed = false
  const root = mapAssembly(design.assembly.root, (n) => {
    if (n.type !== 'unit') return n
    const next = fn(n.design)
    if (next === n.design) return n
    changed = true
    return { ...n, design: next }
  }) as AssemblyGroup
  if (!changed) return design
  const first = collectUnits(root, [])[0]?.design
  const out: WindowDesign = { ...design, assembly: { ...design.assembly, root }, colorId: first?.colorId ?? design.colorId, glassId: first?.glassId ?? design.glassId }
  if (first?.colorInId) out.colorInId = first.colorInId
  else delete out.colorInId
  return out
}

/** Aplica un cambio a todas las unidades y recalcula los totales (cambio de línea, por ejemplo). */
export function mapUnits(design: WindowDesign, fn: (unit: WindowDesign) => WindowDesign, catalog: Catalog): WindowDesign {
  if (!isAssembly(design)) return fn(design)
  let changed = false
  const root = mapAssembly(design.assembly.root, (n) => {
    if (n.type !== 'unit') return n
    const next = fn(n.design)
    if (next === n.design) return n
    changed = true
    return { ...n, design: stripAssembly(next) }
  }) as AssemblyGroup
  return changed ? withRoot(design, root, catalog) : design
}

// ─── Plantillas ─────────────────────────────────────────────────────────────

export const ASSEMBLY_PRESET_IDS = ['coupled_2', 'coupled_3', 'coupled_stack', 'coupled_mixed', 'corner_90', 'corner_variable', 'bay', 'bow'] as const
export type AssemblyPresetId = (typeof ASSEMBLY_PRESET_IDS)[number]

export interface AssemblyPreset {
  id: AssemblyPresetId
  name: string
  kind: AssemblyKind
  /** Paños por defecto (bay y bow lo pueden cambiar). */
  count: number
  /** Ángulo por defecto entre paños (180 = plano). */
  angle: number
  size: { width: number; height: number }
  tags: string[]
}

export const ASSEMBLY_PRESETS: AssemblyPreset[] = [
  { id: 'coupled_2', name: 'Dos ventanas unidas', kind: 'flat', count: 2, angle: 180, size: { width: 1200, height: 1400 }, tags: ['unir', 'acople', 'acopladas', 'dos ventanas', 'unión'] },
  { id: 'coupled_3', name: 'Tres ventanas unidas', kind: 'flat', count: 3, angle: 180, size: { width: 1000, height: 1400 }, tags: ['unir', 'acople', 'acopladas', 'tres ventanas', 'fila', 'ventanal'] },
  { id: 'coupled_stack', name: 'Ventana sobre paño', kind: 'flat', count: 2, angle: 180, size: { width: 1500, height: 1000 }, tags: ['unir', 'acople', 'columna', 'sobreluz', 'paño inferior', 'corredera con fijo'] },
  { id: 'coupled_mixed', name: 'Puerta con ventana y sobreluz', kind: 'flat', count: 3, angle: 180, size: { width: 1000, height: 2100 }, tags: ['unir', 'acople', 'puerta', 'ventana', 'distinto alto', 'sobreluz'] },
  { id: 'corner_90', name: 'Ventana en esquina', kind: 'corner', count: 2, angle: 90, size: { width: 1200, height: 1400 }, tags: ['esquina', 'esquinero', '90', 'poste', 'ochavo'] },
  { id: 'corner_variable', name: 'Esquina de ángulo variable', kind: 'corner', count: 2, angle: 120, size: { width: 1200, height: 1400 }, tags: ['esquina', 'ángulo variable', 'poste', 'tubular'] },
  { id: 'bay', name: 'Bay window', kind: 'bay', count: 3, angle: 135, size: { width: 800, height: 1400 }, tags: ['bay', 'bay window', 'mirador', 'tres paños', 'ochavo', '135'] },
  { id: 'bow', name: 'Bow window', kind: 'bow', count: 5, angle: 160, size: { width: 700, height: 1400 }, tags: ['bow', 'bow window', 'mirador curvo', 'facetado', 'paños'] },
]

export interface CreateAssemblyOptions {
  lineId: Id
  colorId: Id
  glassId: Id
  /** Ancho de cada unidad (en un bay, de los paños laterales; el central mide el doble). */
  width?: number
  height?: number
  /** Paños de un bay o bow. */
  count?: number
  /** Ángulo entre paños. */
  angle?: number
}

/** Disponibilidad de una plantilla en una línea: si no se puede, por qué. */
export interface PresetAvailability {
  ok: boolean
  /** Ángulo con que se creará (el de la plantilla o el más cercano que permita el sistema). */
  angle: number
  reason?: 'no_coupler' | 'no_post'
}

/**
 * ¿La línea puede fabricar esta plantilla? Un bay usa el poste de la línea más cercano a 135°, un
 * bow necesita poste de ángulo variable o uno fijo cerrado: se ofrece solo lo que el sistema permite.
 */
export function presetAvailability(preset: AssemblyPreset, lineId: Id | undefined, catalog: Catalog): PresetAvailability {
  const options = assemblyOptions([lineId], catalog)
  if (preset.kind === 'flat') return options.flat ? { ok: true, angle: 180 } : { ok: false, angle: 180, reason: 'no_coupler' }
  if (preset.id === 'corner_variable') return options.variable ? { ok: true, angle: preset.angle } : { ok: false, angle: preset.angle, reason: 'no_post' }
  if (preset.kind === 'corner') return angleAllowed(preset.angle, options) ? { ok: true, angle: preset.angle } : { ok: false, angle: preset.angle, reason: 'no_post' }
  if (preset.kind === 'bow') {
    if (options.variable) return { ok: true, angle: preset.angle }
    const shallow = options.angles.filter((a) => a >= 140)
    return shallow.length ? { ok: true, angle: shallow[shallow.length - 1] } : { ok: false, angle: preset.angle, reason: 'no_post' }
  }
  if (options.angles.some((a) => Math.abs(a - preset.angle) < ANGLE_EPS) || options.variable) return { ok: true, angle: preset.angle }
  const usable = options.angles.filter((a) => a > 90)
  return usable.length ? { ok: true, angle: usable.reduce((best, a) => (Math.abs(a - preset.angle) < Math.abs(best - preset.angle) ? a : best)) } : { ok: false, angle: preset.angle, reason: 'no_post' }
}

function unitDesign(typologyId: string, options: CreateAssemblyOptions, width: number, height: number): WindowDesign {
  return createDesign(getTypology(typologyId) ? typologyId : 'fixed', { lineId: options.lineId, colorId: options.colorId, glassId: options.glassId, width, height })
}

/** Crea un conjunto desde una plantilla, todo en la misma línea, color y vidrio. */
export function createAssembly(presetId: AssemblyPresetId | string, options: CreateAssemblyOptions, catalog: Catalog): WindowDesign {
  const preset = ASSEMBLY_PRESETS.find((p) => p.id === presetId) ?? ASSEMBLY_PRESETS[0]
  const w = validSize(options.width) || preset.size.width
  const h = validSize(options.height) || preset.size.height
  const unit = (id: Id, typologyId: string, width = w, height = h): AssemblyUnit => ({ id, type: 'unit', design: unitDesign(typologyId, options, width, height) })
  const letter = (i: number): Id => String.fromCharCode(65 + i)
  const flat = (): AssemblyJoint => ({ angle: 180 })
  let root: AssemblyGroup
  switch (preset.id) {
    case 'coupled_3':
      root = { id: 'g1', type: 'group', dir: 'row', children: [unit('A', 'fixed'), unit('B', 'fixed'), unit('C', 'fixed')], joints: [flat(), flat()] }
      break
    case 'coupled_stack':
      root = { id: 'g1', type: 'group', dir: 'column', children: [unit('A', 'fixed', w, Math.round(h * 0.5)), unit('B', 'fixed', w, h)], joints: [flat()] }
      break
    case 'coupled_mixed':
      root = {
        id: 'g1',
        type: 'group',
        dir: 'row',
        align: 'end',
        children: [
          unit('A', 'fixed', w, h),
          {
            id: 'g2',
            type: 'group',
            dir: 'column',
            children: [unit('B', 'fixed', 900, 500), unit('C', 'fixed', 900, h - 500)],
            joints: [flat()],
          },
        ],
        joints: [flat()],
      }
      break
    case 'corner_90':
    case 'corner_variable': {
      const angle = validAngle(options.angle, preset.angle)
      root = { id: 'g1', type: 'group', dir: 'row', children: [unit('A', 'fixed'), unit('B', 'fixed')], joints: [{ angle }] }
      break
    }
    case 'bay':
    case 'bow': {
      const count = Math.min(ASSEMBLY_FACET_LIMITS.max, Math.max(preset.id === 'bay' ? 3 : ASSEMBLY_FACET_LIMITS.min, Math.round(options.count ?? preset.count)))
      const angle = validAngle(options.angle, preset.angle)
      const middle = (count - 1) / 2
      const children = Array.from({ length: count }, (_, i) => unit(letter(i), 'fixed', preset.id === 'bay' && i === middle ? w * 2 : w))
      root = { id: 'g1', type: 'group', dir: 'row', children, joints: Array.from({ length: count - 1 }, () => ({ angle })) }
      break
    }
    default:
      root = { id: 'g1', type: 'group', dir: 'row', children: [unit('A', 'fixed'), unit('B', 'fixed')], joints: [flat()] }
  }
  const first = assemblyUnits({ assembly: { kind: preset.kind, root } } as WindowDesign)[0].design
  return syncAssembly({ ...first, assembly: { kind: preset.kind, root } }, catalog)
}

function validAngle(angle: number | undefined, fallback: number): number {
  return typeof angle === 'number' && Number.isFinite(angle) ? normalizeAngle(angle) : fallback
}
