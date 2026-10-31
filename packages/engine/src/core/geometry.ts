import type { DesignNode, Id, LeafNode, SlidingNode, SplitNode, WindowDesign } from '../types'
import { MIN_PANE_MM } from './defaults'
import { mm1 } from './format'
import { resolveSizes } from './sizes'

/**
 * Geometría del árbol en «regiones a eje»: cada nodo ocupa la región limitada por el borde
 * exterior del marco o por los ejes de los travesaños vecinos. `sizes` de una división se
 * miden sobre esa región. Es independiente de la pauta: layout y despiece la comparten.
 */

export type EdgeKind = 'frame' | 'mullion' | 'french' | 'threshold'

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface CellEdges {
  left: EdgeKind
  right: EdgeKind
  top: EdgeKind
  bottom: EdgeKind
}

export interface TreeCell {
  node: LeafNode
  path: Id[]
  box: Box
  edges: CellEdges
  /** Hoja pasiva de una unión francesa (lleva el inversor, sin manilla). */
  passive: boolean
}

export interface TreeDivider {
  node: SplitNode
  index: number
  dir: 'vertical' | 'horizontal'
  kind: 'mullion' | 'french'
  axis: number
  /** Región del padre (el travesaño la cruza completa). */
  box: Box
  min: number
  max: number
  /** Se pidió unión francesa pero no hay dos hojas que abran: se calcula como travesaño. */
  frenchFallback: boolean
}

export interface TreeSplit {
  node: SplitNode
  box: Box
  sizes: number[]
  /** Bordes de los hijos a lo largo del eje de la división (n + 1 valores). */
  positions: number[]
}

export interface TreeLayout {
  cells: TreeCell[]
  dividers: TreeDivider[]
  splits: TreeSplit[]
  sliding?: SlidingNode
  /** Correderas anidadas (no fabricables así): se ignoran con aviso. */
  misplacedSliding: SlidingNode[]
}

const opens = (n: DesignNode | undefined): n is LeafNode => !!n && n.type === 'leaf' && n.opening?.kind !== 'fixed'

/** Medida mínima (a ejes) que necesita un nodo a lo largo de una dirección. */
export function minExtent(node: DesignNode, dir: 'vertical' | 'horizontal'): number {
  if (!node) return MIN_PANE_MM
  if (node.type === 'leaf') return MIN_PANE_MM
  if (node.type === 'sliding') return dir === 'vertical' ? MIN_PANE_MM * Math.max(1, node.panels.length) : MIN_PANE_MM
  const mins = node.children.map((c) => minExtent(c, dir))
  if (mins.length === 0) return MIN_PANE_MM
  return node.dir === dir ? mins.reduce((a, b) => a + b, 0) : Math.max(...mins)
}

/** Medidas concretas de una división para su región. */
export function splitSizes(node: SplitNode, extent: number): number[] {
  const n = node.children.length
  const sizes = Array.from({ length: n }, (_, i) => node.sizes?.[i] ?? null)
  return resolveSizes(sizes, extent)
}

export function layoutTree(design: WindowDesign): TreeLayout {
  const out: TreeLayout = { cells: [], dividers: [], splits: [], misplacedSliding: [] }
  const W = Number.isFinite(design.width) ? Math.max(0, design.width) : 0
  const H = Number.isFinite(design.height) ? Math.max(0, design.height) : 0
  const root = design.root
  if (!root) return out
  const frame: CellEdges = { left: 'frame', right: 'frame', top: 'frame', bottom: 'frame' }
  visit(root, { x0: 0, y0: 0, x1: W, y1: H }, frame, [], true)
  return out

  function visit(node: DesignNode, box: Box, edges: CellEdges, path: Id[], isRoot: boolean): void {
    if (!node) return
    if (node.type === 'leaf') {
      out.cells.push({ node, path: [...path, node.id], box, edges, passive: false })
      return
    }
    if (node.type === 'sliding') {
      if (isRoot) out.sliding = node
      else out.misplacedSliding.push(node)
      return
    }
    const children = node.children ?? []
    if (children.length === 0) return
    const vertical = node.dir === 'vertical'
    const start = vertical ? box.x0 : box.y0
    const extent = vertical ? box.x1 - box.x0 : box.y1 - box.y0
    const sizes = splitSizes(node, extent)
    const positions = [start]
    for (const s of sizes) positions.push(mm1(positions[positions.length - 1] + s))
    positions[positions.length - 1] = vertical ? box.x1 : box.y1
    out.splits.push({ node, box, sizes, positions })

    const wantsFrench = node.joint === 'french'
    const jointKinds: ('mullion' | 'french')[] = []
    for (let i = 0; i < children.length - 1; i++) {
      const french = wantsFrench && vertical && opens(children[i]) && opens(children[i + 1])
      jointKinds.push(french ? 'french' : 'mullion')
      const axis = positions[i + 1]
      out.dividers.push({
        node,
        index: i,
        dir: node.dir,
        kind: jointKinds[i],
        axis,
        box,
        min: mm1(positions[i] + minExtent(children[i], node.dir)),
        max: mm1(positions[i + 2] - minExtent(children[i + 1], node.dir)),
        frenchFallback: wantsFrench && !french,
      })
    }

    children.forEach((child, i) => {
      const childBox: Box = vertical
        ? { x0: positions[i], x1: positions[i + 1], y0: box.y0, y1: box.y1 }
        : { x0: box.x0, x1: box.x1, y0: positions[i], y1: positions[i + 1] }
      const before: EdgeKind | undefined = i > 0 ? jointKinds[i - 1] : undefined
      const after: EdgeKind | undefined = i < children.length - 1 ? jointKinds[i] : undefined
      const childEdges: CellEdges = vertical
        ? { ...edges, left: before ?? edges.left, right: after ?? edges.right }
        : { ...edges, top: before ?? edges.top, bottom: after ?? edges.bottom }
      const firstCell = out.cells.length
      visit(child, childBox, childEdges, [...path, node.id], false)
      // La hoja a la izquierda de una unión francesa es la pasiva (lleva el inversor).
      if (after === 'french') for (let k = firstCell; k < out.cells.length; k++) out.cells[k].passive = true
    })
  }
}
