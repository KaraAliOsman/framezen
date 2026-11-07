/**
 * Paños de una ventana vistos como lista: cuáles hay, cuánto mide cada uno y cómo cambiar su medida
 * sin tocar la medida exterior. Lo usa el asistente, que trabaja con frases como «la hoja batiente
 * a 500»: el resto de los paños de esa división reparte lo que queda.
 */
import type { DesignNode, Id, SlidingNode, SplitNode, WindowDesign } from '../types'
import { mm1 } from './format'
import { layoutTree, minExtent, splitSizes } from './geometry'
import { resolveSizes } from './sizes'
import { findParent, mapNode } from './tree'

export interface PaneInfo {
  /** 1 = primer paño (izquierda o arriba). */
  pane: number
  /** Apertura: las del motor, o `sliding` para un panel móvil de corredera. */
  opening: string
  width: number
  height: number
  /** Distancia desde el borde izquierdo y superior de la ventana. */
  x: number
  y: number
  nodeId: Id
}

/** En una corredera, los paneles se reparten a lo ancho (a lo alto en una guillotina). */
function slidingPanes(design: WindowDesign, root: SlidingNode): PaneInfo[] {
  const vertical = root.system === 'vertical'
  const extent = vertical ? design.height : design.width
  const sizes = resolveSizes(root.panels.map((_, i) => root.sizes?.[i] ?? null), extent)
  let at = 0
  return root.panels.map((panel, index) => {
    const size = sizes[index] ?? 0
    const info: PaneInfo = {
      pane: index + 1,
      opening: panel.kind === 'moving' ? 'sliding' : 'fixed',
      width: vertical ? design.width : size,
      height: vertical ? size : design.height,
      x: vertical ? 0 : at,
      y: vertical ? at : 0,
      nodeId: panel.id,
    }
    at = mm1(at + size)
    return info
  })
}

export function listPanes(design: WindowDesign): PaneInfo[] {
  if (design.root?.type === 'sliding') return slidingPanes(design, design.root)
  return layoutTree(design).cells.map((cell, index) => ({
    pane: index + 1,
    opening: cell.node.opening?.kind ?? 'fixed',
    width: mm1(cell.box.x1 - cell.box.x0),
    height: mm1(cell.box.y1 - cell.box.y0),
    x: mm1(cell.box.x0),
    y: mm1(cell.box.y0),
    nodeId: cell.node.id,
  }))
}

export type PaneProblem = 'whole_window' | 'no_room'

export interface PaneResize {
  /** Paños a cambiar. */
  panes: readonly PaneInfo[]
  width?: number
  height?: number
}

export interface PaneResizeResult {
  design: WindowDesign
  problem?: PaneProblem
}

/** Reparte lo que queda entre los hijos que no se pidieron, en proporción a lo que medían. */
function distribute(sizes: readonly number[], wanted: ReadonlyMap<number, number>, mins: readonly number[]): number[] | null {
  const total = sizes.reduce((sum, s) => sum + s, 0)
  const asked = [...wanted.values()].reduce((sum, s) => sum + s, 0)
  const others = sizes.map((_, i) => i).filter((i) => !wanted.has(i))
  if (!others.length) return null
  const left = total - asked
  const base = others.reduce((sum, i) => sum + sizes[i]!, 0)
  const next = sizes.map((size, i) => wanted.get(i) ?? mm1(left * (base > 0 ? size / base : 1 / others.length)))
  // Lo que se pierde al redondear lo toma el último, para que la suma siga siendo la misma.
  const last = others[others.length - 1]!
  next[last] = mm1(next[last]! + total - next.reduce((sum, s) => sum + s, 0))
  return next.every((size, i) => size >= mins[i]!) ? next : null
}

function setSplit(design: WindowDesign, split: SplitNode, sizes: number[]): WindowDesign {
  return { ...design, root: mapNode(design.root, split.id, (node) => ({ ...(node as SplitNode), sizes })) }
}

function resizeTree(design: WindowDesign, panes: readonly PaneInfo[], dir: SplitNode['dir'], mm: number): PaneResizeResult {
  const wanted = new Map<Id, Map<number, number>>()
  for (const pane of panes) {
    let id: Id = pane.nodeId
    let holder: { parent: SplitNode; index: number } | undefined
    for (let found = findParent(design.root, id); found; found = findParent(design.root, id)) {
      if (found.parent.dir === dir) {
        holder = found
        break
      }
      id = found.parent.id
    }
    if (!holder) return { design, problem: 'whole_window' }
    const map = wanted.get(holder.parent.id) ?? new Map<number, number>()
    map.set(holder.index, mm)
    wanted.set(holder.parent.id, map)
  }
  let next = design
  for (const [splitId, map] of wanted) {
    const entry = layoutTree(next).splits.find((s) => s.node.id === splitId)
    if (!entry) continue
    const mins = entry.node.children.map((child: DesignNode) => minExtent(child, dir))
    const sizes = distribute(splitSizes(entry.node, entry.sizes.reduce((sum, s) => sum + s, 0)), map, mins)
    if (!sizes) return { design, problem: 'no_room' }
    next = setSplit(next, entry.node, sizes)
  }
  return { design: next }
}

function resizeSliding(design: WindowDesign, root: SlidingNode, panes: readonly PaneInfo[], mm: number): PaneResizeResult {
  const extent = root.system === 'vertical' ? design.height : design.width
  const sizes = resolveSizes(root.panels.map((_, i) => root.sizes?.[i] ?? null), extent)
  const wanted = new Map(panes.map((pane) => [pane.pane - 1, mm]))
  const next = distribute(sizes, wanted, sizes.map(() => 200))
  if (!next) return { design, problem: 'no_room' }
  return { design: { ...design, root: { ...root, sizes: next } } }
}

/** Fija la medida de los paños pedidos. El ancho y el alto exteriores no cambian. */
export function resizePanes(design: WindowDesign, request: PaneResize): PaneResizeResult {
  const { panes, width, height } = request
  if (!panes.length) return { design }
  let current = design
  if (current.root?.type === 'sliding') {
    const mm = current.root.system === 'vertical' ? height : width
    return mm === undefined ? { design } : resizeSliding(current, current.root, panes, mm1(mm))
  }
  if (width !== undefined) {
    const result = resizeTree(current, panes, 'vertical', mm1(width))
    if (result.problem) return result
    current = result.design
  }
  if (height !== undefined) {
    const result = resizeTree(current, panes, 'horizontal', mm1(height))
    if (result.problem) return result
    current = result.design
  }
  return { design: current }
}
