/**
 * Conjuntos en el diseñador. Una unidad de un conjunto es una ventana completa: la selección usa ids
 * `unidad:nodo` (`A:n3`) y todas las acciones de siempre trabajan sobre la unidad (`scopeOf`); al
 * terminar, `lift` devuelve el conjunto con esa unidad actualizada.
 */
import {
  assemblyUnits,
  createAssembly,
  createDesign,
  findUnit,
  foldAngle,
  isAssembly,
  joinWindow,
  lineFabricates,
  parseUnitNodeId,
  presetAvailability,
  setMullionAxis,
  unitNodeId,
  updateUnit,
  ASSEMBLY_ANGLE_LIMITS,
  ASSEMBLY_PRESETS,
  TYPOLOGIES,
  type AssemblyPreset,
  type Catalog,
  type Layout,
  type LayoutAssemblyJoint,
  type LayoutMullion,
  type Line,
  type UnitSide,
  type WindowDesign,
} from '@dekopen/engine'

export interface Scope {
  /** La ventana sobre la que se trabaja: la unidad, o el diseño si no es un conjunto. */
  design: WindowDesign
  nodeId: string | null
  unitId: string | null
  lift: (next: WindowDesign) => WindowDesign
  /** Id de un nodo de la unidad en el conjunto. */
  outer: (id: string) => string
}

export function scopeOf(design: WindowDesign, id: string | null | undefined, catalog: Catalog): Scope {
  const plain: Scope = { design, nodeId: id ?? null, unitId: null, lift: (next) => next, outer: (x) => x }
  if (!isAssembly(design) || !id) return plain
  const { unitId, nodeId } = parseUnitNodeId(id)
  const unit = findUnit(design, unitId)
  if (!unit) return { ...plain, nodeId: null }
  return { design: unit.design, nodeId: nodeId ?? null, unitId, lift: (next) => updateUnit(design, unitId, next, catalog), outer: (x) => unitNodeId(unitId, x) }
}

/** Mueve un travesaño: el eje llega en coordenadas del dibujo y la unidad lo mide desde su origen. */
export function moveMullion(design: WindowDesign, m: LayoutMullion, axis: number, layout: Layout, catalog: Catalog): WindowDesign {
  if (!isAssembly(design)) return setMullionAxis(design, m.nodeId, m.index, axis)
  const { unitId, nodeId } = parseUnitNodeId(m.nodeId)
  const placed = layout.assembly?.units.find((u) => u.unitId === unitId)
  if (!placed || !nodeId) return design
  const offset = m.dir === 'vertical' ? placed.rect.x : placed.rect.y
  return updateUnit(design, unitId, setMullionAxis(placed.design, nodeId, m.index, axis - offset), catalog)
}

/** Tramo donde se mueve un travesaño de una unidad: su propia ventana. */
export function unitSegment(layout: Layout, m: LayoutMullion): { segStart: number; segEnd: number } | null {
  if (!layout.assembly) return null
  const { unitId } = parseUnitNodeId(m.nodeId)
  const r = layout.assembly.units.find((u) => u.unitId === unitId)?.rect
  if (!r) return null
  return m.dir === 'vertical' ? { segStart: r.x, segEnd: r.x + r.w } : { segStart: r.y, segEnd: r.y + r.h }
}

/**
 * Duplica una ventana y la une por ese lado. Si la línea no trae la pieza de unión, se une igual: el
 * motor deja esa unión fuera del total con su aviso.
 */
export function addNeighbor(design: WindowDesign, side: UnitSide, catalog: Catalog, unitId?: string): WindowDesign {
  const base = (unitId ? findUnit(design, unitId)?.design : undefined) ?? assemblyUnits(design)[0]?.design ?? design
  return joinWindow(design, structuredClone(base), side, catalog, unitId)
}

/** Unión recién creada por `addNeighbor`, para abrir su control en el dibujo. */
export function addedJoint(before: WindowDesign, after: Layout, target?: string): LayoutAssemblyJoint | undefined {
  const joints = after.assembly?.joints ?? []
  if (!isAssembly(before)) return joints[0]
  const known = new Set(assemblyUnits(before).map((u) => u.id))
  const fresh = after.assembly?.units.find((u) => !known.has(u.unitId))?.unitId
  if (!fresh) return undefined
  const touches = joints.filter((j) => j.label.split('–').includes(fresh))
  return touches.find((j) => target && j.label.split('–').includes(target)) ?? touches[0]
}

/** ¿Esta unión puede quebrarse en planta? Solo las de la fila raíz; el resto es plano. */
export function jointBreakable(design: WindowDesign, joint: LayoutAssemblyJoint): boolean {
  const root = design.assembly?.root
  return root?.id === joint.groupId && root.dir === 'row'
}

/** Ángulo guardado de una unión, con su dirección (sobre 180 entra hacia adentro). */
export function jointAngle(design: WindowDesign, joint: LayoutAssemblyJoint): number {
  return jointBreakable(design, joint) ? (design.assembly?.root.joints[joint.index]?.angle ?? 180) : 180
}

/** Ángulo de poste más dirección: el valor que se guarda. Recto no tiene dirección. */
export function signedAngle(post: number, inward: boolean): number {
  return inward && post < 180 ? 360 - post : post
}

/**
 * Lo que escribe el usuario en el campo de ángulo: 0 (y 180) es recto, lo demás queda dentro de lo que
 * tiene sentido en planta. Un ángulo pasado de 180 es esa misma unión mirada desde el otro lado.
 */
export function typedAngle(value: number): number {
  if (!Number.isFinite(value)) return 180
  const post = foldAngle(Math.abs(value) % 360)
  if (post < 1) return 180
  return Math.min(180, Math.max(ASSEMBLY_ANGLE_LIMITS.min, post))
}

/** Cambia la tipología de una ventana conservando medidas, línea, colores, vidrio y accesorios. */
export function changeTypology(design: WindowDesign, typologyId: string): WindowDesign {
  const next = createDesign(typologyId, { lineId: design.lineId, colorId: design.colorId, glassId: design.glassId, width: design.width, height: design.height })
  if (design.colorInId) next.colorInId = design.colorInId
  if (design.extras) next.extras = design.extras
  return next
}

/** Caja de una ventana en px del escenario. */
export interface EdgeBox {
  id: string
  x: number
  y: number
  w: number
  h: number
}

/** Borde que tiene cerca el cursor: `along` es dónde va el botón, medido desde el inicio del borde. */
export interface NearEdge {
  id: string
  side: UnitSide
  along: number
}

const EDGE_OUTSIDE = 34
const EDGE_INSIDE = 30
const EDGE_CORNER = 34
const EDGE_MARGIN = 14

/**
 * Borde más cercano al cursor: hasta `EDGE_OUTSIDE` px por fuera de la ventana y `EDGE_INSIDE` por
 * dentro. En una esquina vale el lado izquierdo o derecho, que es por donde crece un bow.
 */
export function nearestEdge(point: { x: number; y: number }, boxes: readonly EdgeBox[]): NearEdge | null {
  let best: NearEdge | null = null
  let bestDistance = Infinity
  for (const b of boxes) {
    if (point.x < b.x - EDGE_OUTSIDE || point.x > b.x + b.w + EDGE_OUTSIDE || point.y < b.y - EDGE_OUTSIDE || point.y > b.y + b.h + EDGE_OUTSIDE) continue
    const left = Math.abs(point.x - b.x)
    const right = Math.abs(point.x - (b.x + b.w))
    const top = Math.abs(point.y - b.y)
    const bottom = Math.abs(point.y - (b.y + b.h))
    const nearV = Math.min(left, right)
    const nearH = Math.min(top, bottom)
    const inside = point.x > b.x && point.x < b.x + b.w && point.y > b.y && point.y < b.y + b.h
    const inset = Math.min(EDGE_INSIDE, b.w / 3, b.h / 3)
    if (inside && nearV > inset && nearH > inset) continue
    const corner = nearV <= EDGE_CORNER && nearH <= EDGE_CORNER
    const beside = corner || nearV <= nearH
    const distance = corner ? Math.hypot(nearV, nearH) : Math.min(nearV, nearH)
    if (distance >= bestDistance) continue
    bestDistance = distance
    const clamp = (value: number, length: number) => Math.min(Math.max(EDGE_MARGIN, value), Math.max(EDGE_MARGIN, length - EDGE_MARGIN))
    best = beside
      ? { id: b.id, side: left <= right ? 'left' : 'right', along: clamp(point.y - b.y, b.h) }
      : { id: b.id, side: top <= bottom ? 'top' : 'bottom', along: clamp(point.x - b.x, b.w) }
  }
  return best
}

/** Tipologías que la línea fabrica, para cambiar el tipo de una unidad. */
export function unitTypologies(line: Line | undefined, catalog: Catalog) {
  if (!line) return []
  return TYPOLOGIES.filter((t) => t.kind === line.kind && lineFabricates(line, t.id, catalog.profiles))
}

export interface PresetChoice {
  preset: AssemblyPreset
  /** Línea donde se creará; sin ninguna línea en el catálogo, null. */
  lineId: string | null
  angle: number
  /** Ninguna línea trae la pieza de unión: se crea igual y la unión queda fuera del total, con aviso. */
  reason?: 'no_coupler' | 'no_post'
}

/**
 * Plantillas con la línea que las fabrica: primero la preferida; si no, cualquiera que pueda. Si
 * ninguna trae el poste, el conjunto se puede dibujar y cotizar igual en la línea preferida: el motor
 * deja la unión fuera del total y lo avisa. No se bloquea ni se inventa la pieza.
 */
export function presetChoices(catalog: Catalog, preferred: readonly (string | undefined)[]): PresetChoice[] {
  const lines = catalog.lines ?? []
  const ordered = [...preferred.filter((id): id is string => !!id), ...lines.filter((l) => l.kind === 'casement').map((l) => l.id), ...lines.map((l) => l.id)]
  return ASSEMBLY_PRESETS.map((preset) => {
    let reason: PresetChoice['reason']
    for (const lineId of new Set(ordered)) {
      const a = presetAvailability(preset, lineId, catalog)
      if (a.ok) return { preset, lineId, angle: a.angle }
      reason ??= a.reason
    }
    const casement = [...new Set(ordered)].find((id) => lines.find((l) => l.id === id)?.kind === 'casement')
    return { preset, lineId: casement ?? ordered[0] ?? null, angle: preset.angle, reason: reason ?? 'no_coupler' }
  })
}

export function createFromPreset(choice: PresetChoice, colorId: string, glassId: string, catalog: Catalog): WindowDesign | null {
  if (!choice.lineId) return null
  return createAssembly(choice.preset.id, { lineId: choice.lineId, colorId, glassId, angle: choice.angle }, catalog)
}
