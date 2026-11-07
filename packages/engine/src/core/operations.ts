import type { Catalog, DesignNode, Id, LeafNode, Opening, Shape, SlidingPanel, SlidingSystem, SplitNode, WindowDesign, WindowExtras } from '../types'
import { LEAF_USES, OPENING_KINDS } from '../types'
import { isAssembly, mapUnitDesigns, mapUnits } from './assembly'
import { convertRoot, defaultSlidingPanels } from './convert'
import { clamp, mm1 } from './format'
import { layoutTree, minExtent, splitSizes, type Box } from './geometry'
import { shapeGeometry } from './shapes'
import { idFactory } from './ids'
import { closeSum, equalShares, resolveSizes } from './sizes'
import { findNode, findParent, firstLeaf, mapNode } from './tree'

/**
 * Operaciones inmutables sobre un diseño, compartidas por el editor y el asistente. Ninguna
 * lanza: si la operación no aplica, devuelven el mismo diseño (misma referencia).
 */

const valid = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

function withRoot(design: WindowDesign, root: DesignNode): WindowDesign {
  return root === design.root ? design : { ...design, root }
}

/** Región a ejes de cada división del diseño actual. */
function splitBoxes(design: WindowDesign): Map<Id, Box> {
  return new Map(layoutTree(design).splits.map((s) => [s.node.id, s.box]))
}

const extentOf = (box: Box, dir: SplitNode['dir']): number => (dir === 'vertical' ? box.x1 - box.x0 : box.y1 - box.y0)

// ─── Medidas ────────────────────────────────────────────────────────────────

/** Cambia ancho y/o alto reescalando proporcionalmente las medidas de los paños y la forma. */
export function setSize(design: WindowDesign, size: { width?: number; height?: number }): WindowDesign {
  // Un conjunto no tiene medida propia: la dan sus unidades (`setUnitSize`).
  if (isAssembly(design)) return design
  const width = valid(size.width) ? mm1(size.width) : design.width
  const height = valid(size.height) ? mm1(size.height) : design.height
  if (width === design.width && height === design.height) return design
  const oldBox: Box = { x0: 0, y0: 0, x1: design.width, y1: design.height }
  const newBox: Box = { x0: 0, y0: 0, x1: width, y1: height }
  let root = design.root ? rescale(design.root, oldBox, newBox) : design.root
  const next: WindowDesign = { ...design, width, height, root }
  const shape = rescaleShape(design.shape, design.width, design.height, width, height)
  if (shape) {
    next.shape = shape
    // Si el primer travesaño iba en el arranque del arco (o en los hombros del frontón), lo sigue.
    const oldHead = shapeGeometry(design.shape, design.width, design.height)?.head
    const newHead = shapeGeometry(shape, width, height)?.head
    if (root?.type === 'split' && root.dir === 'horizontal' && oldHead !== undefined && newHead !== undefined) {
      const first = design.root.type === 'split' ? splitSizes(design.root, design.height)[0] : undefined
      if (first !== undefined && Math.abs(first - oldHead) < 0.5 && root.sizes.length >= 2) {
        root = { ...root, sizes: [mm1(newHead), ...root.sizes.slice(1).map(() => null)] }
        next.root = root
      }
    }
  }
  return next
}

function rescale(node: DesignNode, oldBox: Box, newBox: Box): DesignNode {
  if (node.type === 'sliding') {
    // Anchos propios de los paneles: proporcionales al ancho nuevo.
    if (!Array.isArray(node.sizes)) return node
    const oldW = oldBox.x1 - oldBox.x0
    const f = oldW > 0 ? (newBox.x1 - newBox.x0) / oldW : 1
    return { ...node, sizes: node.sizes.map((v) => (typeof v === 'number' ? mm1(v * f) : null)) }
  }
  if (node.type !== 'split') return node
  const vertical = node.dir === 'vertical'
  const oldExtent = extentOf(oldBox, node.dir)
  const newExtent = extentOf(newBox, node.dir)
  const oldSizes = splitSizes(node, oldExtent)
  const f = oldExtent > 0 ? newExtent / oldExtent : 1
  const raw = node.children.map((_, i) => node.sizes?.[i] ?? null)
  let sizes: (number | null)[] = raw.map((s) => (typeof s === 'number' ? mm1(s * f) : null))
  if (!sizes.some((s) => s === null)) sizes = closeSum(sizes as number[], newExtent)
  const newSizes = resolveSizes(sizes, newExtent)
  let oldPos = vertical ? oldBox.x0 : oldBox.y0
  let newPos = vertical ? newBox.x0 : newBox.y0
  const children = node.children.map((child, i) => {
    const ob: Box = vertical ? { ...oldBox, x0: oldPos, x1: oldPos + oldSizes[i] } : { ...oldBox, y0: oldPos, y1: oldPos + oldSizes[i] }
    const nb: Box = vertical ? { ...newBox, x0: newPos, x1: newPos + newSizes[i] } : { ...newBox, y0: newPos, y1: newPos + newSizes[i] }
    oldPos += oldSizes[i]
    newPos += newSizes[i]
    return rescale(child, ob, nb)
  })
  return { ...node, sizes, children }
}

function rescaleShape(shape: Shape | undefined, oldW: number, oldH: number, w: number, h: number): Shape | undefined {
  if (!shape) return undefined
  const fy = oldH > 0 ? h / oldH : 1
  if (shape.kind === 'arch') {
    const semicircle = Math.abs(shape.rise - oldW / 2) < 0.15
    return { kind: 'arch', rise: mm1(Math.min(h, semicircle ? w / 2 : shape.rise * fy)) }
  }
  if (shape.kind === 'trapezoid') {
    return { kind: 'trapezoid', leftHeight: mm1(Math.min(h, shape.leftHeight * fy)), rightHeight: mm1(Math.min(h, shape.rightHeight * fy)) }
  }
  if (shape.kind === 'gable') {
    return { kind: 'gable', shoulderHeight: mm1(Math.min(h - 1, shape.shoulderHeight * fy)) }
  }
  if (shape.kind === 'octagon' && typeof shape.chamfer === 'number') {
    const fx = oldW > 0 ? w / oldW : 1
    return { kind: 'octagon', chamfer: mm1(Math.min(Math.min(w, h) / 2 - 1, shape.chamfer * Math.min(fx, fy))) }
  }
  return shape
}

/**
 * Fija la medida a ejes del hijo `index` de una división moviendo un solo travesaño: compensa
 * el vecino siguiente (o el anterior si es el último) y respeta el paño mínimo de 200 mm.
 */
export function setNodeSize(design: WindowDesign, splitNodeId: Id, index: number, mm: number): WindowDesign {
  const node = findNode(design, splitNodeId)
  if (!node || node.type !== 'split' || !Number.isFinite(mm)) return design
  const n = node.children.length
  if (n < 2 || index < 0 || index >= n) return design
  const box = splitBoxes(design).get(node.id)
  if (!box) return design
  const sizes = splitSizes(node, extentOf(box, node.dir))
  const other = index < n - 1 ? index + 1 : index - 1
  const pair = sizes[index] + sizes[other]
  const min = minExtent(node.children[index], node.dir)
  const minOther = minExtent(node.children[other], node.dir)
  const value = mm1(pair < min + minOther ? pair / 2 : clamp(mm, min, pair - minOther))
  if (value === sizes[index]) {
    // Igual valor: aun así se fijan las medidas para que dejen de repartirse solas.
    if (node.sizes.every((s) => typeof s === 'number')) return design
  }
  const next = [...sizes]
  next[index] = value
  next[other] = mm1(pair - value)
  if (next.length === node.sizes.length && next.every((v, i) => node.sizes[i] === v)) return design
  return withRoot(design, mapNode(design.root, node.id, (n0) => ({ ...(n0 as SplitNode), sizes: next })))
}

/** Mueve el travesaño `index` (entre el hijo index e index+1) a la posición de eje indicada (mm). */
export function setMullionAxis(design: WindowDesign, splitNodeId: Id, index: number, axis: number): WindowDesign {
  const split = layoutTree(design).splits.find((s) => s.node.id === splitNodeId)
  if (!split || index < 0 || index >= split.node.children.length - 1 || !Number.isFinite(axis)) return design
  return setNodeSize(design, splitNodeId, index, axis - split.positions[index])
}

// ─── Divisiones ─────────────────────────────────────────────────────────────

function cloneLeaf(source: LeafNode | undefined, id: Id): LeafNode {
  const leaf: LeafNode = { id, type: 'leaf', opening: source?.opening ? { ...source.opening } : { kind: 'fixed' } }
  if (source?.glassId) leaf.glassId = source.glassId
  if (source?.fill) leaf.fill = source.fill
  return leaf
}

/**
 * Divide un paño en `parts` partes iguales con travesaños verticales u horizontales. Si el
 * padre ya está dividido en la misma dirección, los paños nuevos se suman a esa división.
 */
export function splitNode(design: WindowDesign, nodeId: Id, dir: SplitNode['dir'], parts = 2): WindowDesign {
  const target = findNode(design, nodeId)
  if (!target || target.type === 'sliding' || (dir !== 'vertical' && dir !== 'horizontal')) return design
  const count = clamp(Math.floor(Number.isFinite(parts) ? parts : 2), 2, 8)
  const newId = idFactory(design)

  if (target.type === 'leaf') {
    const parentInfo = findParent(design, nodeId)
    if (parentInfo && parentInfo.parent.dir === dir) {
      const { parent, index } = parentInfo
      const box = splitBoxes(design).get(parent.id)
      if (!box) return design
      const sizes = splitSizes(parent, extentOf(box, dir))
      const shares = equalShares(sizes[index], count)
      const clones = Array.from({ length: count - 1 }, () => cloneLeaf(target, newId()))
      const children = [...parent.children.slice(0, index), target, ...clones, ...parent.children.slice(index + 1)]
      const nextSizes = [...sizes.slice(0, index), ...shares, ...sizes.slice(index + 1)]
      return withRoot(design, mapNode(design.root, parent.id, () => ({ ...parent, children, sizes: nextSizes })))
    }
    const split: SplitNode = {
      id: newId(),
      type: 'split',
      dir,
      joint: 'mullion',
      children: [target, ...Array.from({ length: count - 1 }, () => cloneLeaf(target, newId()))],
      sizes: Array.from({ length: count }, () => null),
    }
    return withRoot(design, mapNode(design.root, nodeId, () => split))
  }

  // Una división completa: en la misma dirección se agregan paños (todos iguales); si no, se envuelve.
  if (target.dir === dir) {
    const last = target.children[target.children.length - 1]
    const template = last?.type === 'leaf' ? last : firstLeaf(target)
    const added = Array.from({ length: count - 1 }, () => cloneLeaf(template, newId()))
    const children = [...target.children, ...added]
    return withRoot(design, mapNode(design.root, nodeId, () => ({ ...target, children, sizes: children.map(() => null) })))
  }
  const wrapper: SplitNode = {
    id: newId(),
    type: 'split',
    dir,
    joint: 'mullion',
    children: [target, ...Array.from({ length: count - 1 }, () => cloneLeaf(firstLeaf(target), newId()))],
    sizes: Array.from({ length: count }, () => null),
  }
  return withRoot(design, mapNode(design.root, nodeId, () => wrapper))
}

/**
 * Quita una división:
 * - `mergeNode(d, splitId, index)`: quita el travesaño `index` y une sus dos paños;
 * - `mergeNode(d, splitId)`: deja toda la división como un solo paño (el primero);
 * - `mergeNode(d, leafId)`: quita ese paño y su medida pasa al vecino.
 */
export function mergeNode(design: WindowDesign, nodeId: Id, index?: number): WindowDesign {
  const node = findNode(design, nodeId)
  if (!node || node.type === 'sliding') return design

  if (node.type === 'split') {
    const n = node.children.length
    if (index === undefined || !Number.isInteger(index) || index < 0 || index >= n - 1) {
      const keep = firstLeaf(node)
      if (!keep) return design
      return withRoot(design, mapNode(design.root, node.id, () => keep))
    }
    const box = splitBoxes(design).get(node.id)
    if (!box) return design
    const sizes = splitSizes(node, extentOf(box, node.dir))
    const a = node.children[index]
    const keep: DesignNode = a.type === 'leaf' ? a : (firstLeaf(a) ?? cloneLeaf(undefined, idFactory(design)()))
    const children = [...node.children.slice(0, index), keep, ...node.children.slice(index + 2)]
    const nextSizes = [...sizes.slice(0, index), mm1(sizes[index] + sizes[index + 1]), ...sizes.slice(index + 2)]
    const replacement: DesignNode = children.length === 1 ? children[0] : { ...node, children, sizes: nextSizes }
    return withRoot(design, mapNode(design.root, node.id, () => replacement))
  }

  const parentInfo = findParent(design, nodeId)
  if (!parentInfo) return design
  const { parent, index: i } = parentInfo
  const box = splitBoxes(design).get(parent.id)
  if (!box) return design
  const sizes = splitSizes(parent, extentOf(box, parent.dir))
  const neighbor = i > 0 ? i - 1 : i + 1
  const nextSizes = [...sizes]
  nextSizes[neighbor] = mm1(sizes[neighbor] + sizes[i])
  nextSizes.splice(i, 1)
  const children = parent.children.filter((_, k) => k !== i)
  const replacement: DesignNode = children.length === 1 ? children[0] : { ...parent, children, sizes: nextSizes }
  return withRoot(design, mapNode(design.root, parent.id, () => replacement))
}

/**
 * Travesaño fijo, unión francesa o cadena plegable (francesa y plegable solo entre hojas lado a
 * lado). Al pasar a plegable las hojas se vuelven plegables (se conserva el vidrio y el relleno).
 */
export function setJoint(design: WindowDesign, splitNodeId: Id, joint: 'mullion' | 'french' | 'fold'): WindowDesign {
  const node = findNode(design, splitNodeId)
  if (!node || node.type !== 'split') return design
  if (joint !== 'mullion' && joint !== 'french' && joint !== 'fold') return design
  if ((joint === 'french' || joint === 'fold') && node.dir !== 'vertical') return design
  if ((node.joint ?? 'mullion') === joint) return design
  return withRoot(
    design,
    mapNode(design.root, node.id, (n) => {
      const split = n as SplitNode
      if (joint !== 'fold') return { ...split, joint }
      const children = split.children.map((child) =>
        child.type === 'leaf' && child.opening?.kind !== 'folding' ? { ...child, opening: { kind: 'folding' as const, hinge: 'left' as const } } : child,
      )
      return { ...split, joint, children }
    }),
  )
}

/** Hoja pasiva de una unión francesa (la que lleva el inversor y pasadores), vista desde el interior. */
export function setPassiveLeaf(design: WindowDesign, splitNodeId: Id, side: 'left' | 'right'): WindowDesign {
  const node = findNode(design, splitNodeId)
  if (!node || node.type !== 'split' || node.joint !== 'french' || (side !== 'left' && side !== 'right')) return design
  if (node.passive === side) return design
  return withRoot(design, mapNode(design.root, node.id, (n) => ({ ...(n as SplitNode), passive: side })))
}

// ─── Aperturas, vidrios, colores ────────────────────────────────────────────

/**
 * Cambia la apertura de un paño. Se normaliza: solo pasan los campos que entiende el motor y con
 * valores válidos (`sequence` solo en oscilobatiente, `slide` en osciloparalela y paralela, `pivot`
 * en pivotantes, `use` en hojas que pueden ser puerta).
 */
export function setOpening(design: WindowDesign, nodeId: Id, opening: Opening): WindowDesign {
  const node = findNode(design, nodeId)
  if (!node || node.type !== 'leaf' || !opening?.kind || !(OPENING_KINDS as readonly string[]).includes(opening.kind)) return design
  const next = normalizeOpening(opening)
  if (sameOpening(node.opening, next)) return design
  return withRoot(design, mapNode(design.root, nodeId, (n) => ({ ...(n as LeafNode), opening: next })))
}

const side = (v: unknown): v is 'left' | 'right' => v === 'left' || v === 'right'

export function normalizeOpening(opening: Opening): Opening {
  const next: Opening = { kind: opening.kind }
  if (side(opening.hinge)) next.hinge = opening.hinge
  if (opening.direction === 'in' || opening.direction === 'out') next.direction = opening.direction
  if (opening.kind === 'tilt_turn' && (opening.sequence === 'tilt_first' || opening.sequence === 'turn_first')) next.sequence = opening.sequence
  if ((opening.kind === 'tilt_slide' || opening.kind === 'parallel_slide') && side(opening.slide)) next.slide = opening.slide
  if ((opening.kind === 'pivot_v' || opening.kind === 'pivot_h') && typeof opening.pivot === 'number' && Number.isFinite(opening.pivot)) {
    next.pivot = Math.round(clamp(opening.pivot, 0.05, 0.95) * 1000) / 1000
  }
  if ((opening.kind === 'casement' || opening.kind === 'tilt_turn' || opening.kind === 'door') && opening.use && (LEAF_USES as readonly string[]).includes(opening.use)) {
    next.use = opening.use
  }
  return next
}

/** Misma apertura ya normalizada (tipo, bisagras y sentido, sin claves de más). */
function sameOpening(a: Opening | undefined, b: Opening): boolean {
  if (!a) return false
  const keys = Object.keys(a) as (keyof Opening)[]
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
}

/** Mapea los hijos y devuelve la misma división si ninguno cambió (ramas compartidas). */
function mapChildren(node: SplitNode, fn: (child: DesignNode) => DesignNode): SplitNode {
  let changed = false
  const children = node.children.map((child) => {
    const next = fn(child)
    if (next !== child) changed = true
    return next
  })
  return changed ? { ...node, children } : node
}

function withoutGlass<T extends { glassId?: Id }>(item: T): T {
  if (!('glassId' in item)) return item
  const { glassId: _drop, ...rest } = item
  return rest as T
}

function clearGlass(node: DesignNode): DesignNode {
  if (node.type === 'leaf') return withoutGlass(node)
  if (node.type === 'sliding') {
    if (!node.panels.some((p) => 'glassId' in p)) return node
    return { ...node, panels: node.panels.map(withoutGlass) }
  }
  return mapChildren(node, clearGlass)
}

function applyGlass(node: DesignNode, glassId: Id): DesignNode {
  if (node.type === 'leaf') return node.glassId === glassId ? node : { ...node, glassId }
  if (node.type === 'sliding') {
    if (node.panels.every((p) => p.glassId === glassId)) return node
    return { ...node, panels: node.panels.map((p) => (p.glassId === glassId ? p : { ...p, glassId })) }
  }
  return mapChildren(node, (c) => applyGlass(c, glassId))
}

/**
 * Vidrio de toda la ventana (`nodeId` null: cambia el vidrio por defecto y quita los vidrios
 * por paño), de un paño, de todos los paños de una división o de un panel de corredera.
 */
export function setGlass(design: WindowDesign, nodeId: Id | null, glassId: Id): WindowDesign {
  if (isAssembly(design)) return nodeId ? design : mapUnitDesigns(design, (unit) => setGlass(unit, null, glassId))
  if (!glassId) return design
  if (nodeId === null || nodeId === undefined) {
    const root = design.root ? clearGlass(design.root) : design.root
    if (glassId === design.glassId && root === design.root) return design
    return { ...design, glassId, root }
  }
  const node = findNode(design, nodeId)
  if (node) return withRoot(design, mapNode(design.root, nodeId, (n) => applyGlass(n, glassId)))
  const root = design.root
  const panel = root?.type === 'sliding' ? root.panels.find((p) => p.id === nodeId) : undefined
  if (root?.type === 'sliding' && panel) {
    if (panel.glassId === glassId) return design
    return { ...design, root: { ...root, panels: root.panels.map((p) => (p.id === nodeId ? { ...p, glassId } : p)) } }
  }
  return design
}

/** Color exterior; `colorInId` distinto = bicolor; omitido o igual = un solo color. */
export function setColor(design: WindowDesign, colorId: Id, colorInId?: Id): WindowDesign {
  if (isAssembly(design)) return mapUnitDesigns(design, (unit) => setColor(unit, colorId, colorInId))
  if (!colorId) return design
  const inner = colorInId && colorInId !== colorId ? colorInId : undefined
  if (design.colorId === colorId && (inner ? design.colorInId === inner : !('colorInId' in design))) return design
  const next: WindowDesign = { ...design, colorId }
  if (inner) next.colorInId = inner
  else delete next.colorInId
  return next
}

/** Forma del marco (rectangular, arco, trapecio, triángulo). */
export function setShape(design: WindowDesign, shape: Shape | undefined): WindowDesign {
  const target = !shape || shape.kind === 'rect' ? undefined : shape
  if (target ? sameShape(design.shape, target) : !('shape' in design)) return design
  const next: WindowDesign = { ...design }
  if (target) next.shape = target
  else delete next.shape
  return next
}

function sameShape(a: Shape | undefined, b: Shape): boolean {
  if (!a) return false
  if (a === b) return true
  const keys = Object.keys(a) as (keyof Shape)[]
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
}

/**
 * Cambia la línea. Si pasa de practicable a corredera (o al revés) convierte el árbol
 * conservando medidas, vidrios por paño y el orden de izquierda a derecha.
 */
export function setLine(design: WindowDesign, lineId: Id, catalog: Catalog): WindowDesign {
  if (isAssembly(design)) return mapUnits(design, (unit) => setLine(unit, lineId, catalog), catalog)
  if (!lineId) return design
  const line = catalog?.lines?.find((l) => l.id === lineId)
  const convert = !!line && !!design.root && (line.kind === 'sliding') !== (design.root.type === 'sliding')
  if (lineId === design.lineId && !convert) return design
  const next: WindowDesign = { ...design, lineId }
  if (!line || !convert) return next
  const { root, dropShape } = convertRoot(design, line.kind)
  next.root = root
  if (dropShape) delete next.shape
  return next
}

/**
 * Paneles de una corredera: un número (reparte con la disposición típica y conserva ids y
 * vidrios de los primeros) o la lista completa. `rails` opcional (1, 2 o 3).
 */
export function setSlidingPanels(design: WindowDesign, panels: number | SlidingPanel[], rails?: 1 | 2 | 3): WindowDesign {
  const root = design.root
  const current = root?.type === 'sliding' ? root : undefined
  const newId = idFactory(design)
  let list: SlidingPanel[]
  if (typeof panels === 'number') {
    if (!Number.isFinite(panels)) return design
    const fresh = defaultSlidingPanels(panels, () => '')
    list = fresh.map((p, i) => {
      const prev = current?.panels[i]
      if (!prev) return { ...p, id: newId() }
      const kept: SlidingPanel = { ...p, id: prev.id }
      if (prev.glassId) kept.glassId = prev.glassId
      return kept
    })
  } else {
    if (!Array.isArray(panels) || panels.length === 0) return design
    const used = new Set<Id>()
    list = panels.map((p) => {
      const id = p.id && !used.has(p.id) ? p.id : newId()
      used.add(id)
      return { ...p, id, kind: p.kind === 'fixed' ? 'fixed' : 'moving' }
    })
  }
  const railCount = rails === 1 || rails === 2 || rails === 3 ? rails : (current?.rails ?? 2)
  if (current && current.rails === railCount && !('shape' in design) && samePanels(current.panels, list)) return design
  const next: DesignNode = { id: current?.id ?? newId(), type: 'sliding', rails: railCount, panels: list }
  // Se conserva el sistema (elevadora) y, si no cambia la cantidad, los anchos propios.
  if (current?.system && current.system !== 'standard') next.system = current.system
  if (current?.sizes && current.sizes.length === list.length) next.sizes = [...current.sizes]
  const out: WindowDesign = { ...design, root: next }
  delete out.shape
  return out
}

/** Corredera estándar o elevadora (HST). Solo para diseños de corredera. */
export function setSlidingSystem(design: WindowDesign, system: SlidingSystem): WindowDesign {
  const root = design.root
  if (root?.type !== 'sliding' || (system !== 'standard' && system !== 'lift_slide')) return design
  if ((root.system ?? 'standard') === system) return design
  const next: DesignNode = { ...root }
  if (system === 'standard') delete next.system
  else next.system = system
  return { ...design, root: next }
}

/**
 * Extras de la ventana (persiana, mosquitero, alféizar, umbral). Cada clave con valor la pone; con
 * `undefined` o `false` la quita. Sin extras queda sin la clave `extras`.
 */
/**
 * Zócalo de una hoja: banda ciega abajo, bajo un travesaño de hoja. `undefined` lo quita. Una hoja
 * sigue siendo una hoja: mismos herrajes, misma medida.
 */
export function setZocalo(design: WindowDesign, nodeId: Id, height: number | undefined): WindowDesign {
  const node = findNode(design, nodeId)
  if (!node || node.type !== 'leaf') return design
  if (height === undefined) {
    if (!node.zocalo) return design
    const { zocalo: _gone, ...rest } = node
    return withRoot(design, mapNode(design.root, nodeId, () => rest))
  }
  if (!valid(height)) return design
  const value = mm1(height)
  if (node.zocalo?.height === value) return design
  return withRoot(design, mapNode(design.root, nodeId, (n) => (n.type === 'leaf' ? { ...n, zocalo: { height: value } } : n)))
}

export function setExtras(design: WindowDesign, patch: Partial<WindowExtras>): WindowDesign {
  if (!patch || typeof patch !== 'object') return design
  const current: WindowExtras = { ...(design.extras ?? {}) }
  let changed = false
  for (const key of Object.keys(patch) as (keyof WindowExtras)[]) {
    const value = patch[key]
    if (value === undefined || value === false || value === null) {
      if (key in current) {
        delete current[key]
        changed = true
      }
      continue
    }
    if (JSON.stringify(current[key]) !== JSON.stringify(value)) {
      ;(current as Record<string, unknown>)[key] = value
      changed = true
    }
  }
  // El mosquitero tipado reemplaza al booleano de v4.
  if (patch.insectScreen && 'screen' in current) {
    delete current.screen
    changed = true
  }
  if (!changed) return design
  const next: WindowDesign = { ...design }
  if (Object.keys(current).length > 0) next.extras = current
  else delete next.extras
  return next
}

/** Mismos paneles en el mismo orden (id, tipo, sentido y vidrio). */
function samePanels(a: readonly SlidingPanel[], b: readonly SlidingPanel[]): boolean {
  if (a.length !== b.length) return false
  return a.every((p, i) => {
    const q = b[i]
    const keys = Object.keys(p) as (keyof SlidingPanel)[]
    return keys.length === Object.keys(q).length && keys.every((k) => p[k] === q[k])
  })
}
