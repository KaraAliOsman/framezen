import type { DesignNode, Id, LeafNode, Pauta, Rect, SlidingNode, SplitNode, WindowDesign } from '../types'
import { FOLD_GAP_MM, MIN_PANE_MM } from './defaults'
import { mm1 } from './format'
import { resolveSizes } from './sizes'

/**
 * Geometría del árbol en «regiones a eje»: cada nodo ocupa la región limitada por el borde
 * exterior del marco o por los ejes de los travesaños vecinos. `sizes` de una división se
 * miden sobre esa región. Es independiente de la pauta: layout y despiece la comparten.
 */

export type EdgeKind = 'frame' | 'mullion' | 'french' | 'fold' | 'threshold'

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
  /**
   * Hoja pasiva: en una unión francesa lleva el inversor y pasadores, sin manilla; en un plegable,
   * toda hoja que no lleva la manilla de su grupo.
   */
  passive: boolean
  /** Unión que la hace activa o pasiva (sin dato = hoja independiente). */
  pair?: 'french' | 'fold'
  /** Plegable: hoja de paso (la de la jamba en un grupo impar; abre sola como puerta). */
  foldAccess?: boolean
}

export interface TreeDivider {
  node: SplitNode
  index: number
  dir: 'vertical' | 'horizontal'
  kind: 'mullion' | 'french' | 'fold'
  axis: number
  /** Región del padre (el travesaño la cruza completa). */
  box: Box
  min: number
  max: number
  /** Se pidió unión francesa pero no hay dos hojas que abran: se calcula como travesaño. */
  frenchFallback: boolean
  /** Se pidió unión plegable pero no hay dos hojas plegables vecinas: se calcula como travesaño. */
  foldFallback: boolean
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

/**
 * Descuento de luz desde cada borde de la región a eje: marco/umbral → frameDeduction; travesaño →
 * mullionDeduction desde su eje; unión francesa → 0 (supuesto v4: la luz llega al eje); encuentro
 * de plegable → traslapo de la hoja + media holgura (cada hoja termina a FOLD_GAP_MM/2 del eje).
 */
export function luzInset(base: Pauta, kind: EdgeKind): number {
  if (kind === 'mullion') return base.mullionDeduction
  if (kind === 'french') return 0
  if (kind === 'fold') return base.sashOverlap + FOLD_GAP_MM / 2
  return base.frameDeduction
}

/** Luz de pauta de un paño (sin acotar a cero: un paño imposible queda con medida negativa). */
export function cellLuz(base: Pauta, cell: Pick<TreeCell, 'box' | 'edges'>): Rect {
  const { box, edges } = cell
  const l = luzInset(base, edges.left)
  const r = luzInset(base, edges.right)
  const t = luzInset(base, edges.top)
  const b = luzInset(base, edges.bottom)
  return { x: mm1(box.x0 + l), y: mm1(box.y0 + t), w: mm1(box.x1 - box.x0 - l - r), h: mm1(box.y1 - box.y0 - t - b) }
}

const opens = (n: DesignNode | undefined): n is LeafNode => !!n && n.type === 'leaf' && n.opening?.kind !== 'fixed'
const folds = (n: DesignNode | undefined): n is LeafNode => !!n && n.type === 'leaf' && n.opening?.kind === 'folding'

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
    const wantsFold = node.joint === 'fold'
    const jointKinds: ('mullion' | 'french' | 'fold')[] = []
    for (let i = 0; i < children.length - 1; i++) {
      const french = wantsFrench && vertical && opens(children[i]) && opens(children[i + 1])
      const fold = wantsFold && vertical && folds(children[i]) && folds(children[i + 1])
      jointKinds.push(french ? 'french' : fold ? 'fold' : 'mullion')
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
        foldFallback: wantsFold && !fold,
      })
    }

    // La hoja pasiva de una unión francesa: la izquierda (v4) o la que indique `passive`.
    const passiveRight = node.passive === 'right'
    const childCells: number[][] = []
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
      childCells.push(Array.from({ length: out.cells.length - firstCell }, (_, k) => firstCell + k))
      const frenchPassive = passiveRight ? before === 'french' : after === 'french'
      if (frenchPassive) {
        for (let k = firstCell; k < out.cells.length; k++) {
          out.cells[k].passive = true
          out.cells[k].pair = 'french'
        }
      } else if (before === 'french' || after === 'french') {
        for (let k = firstCell; k < out.cells.length; k++) out.cells[k].pair = out.cells[k].pair ?? 'french'
      }
    })
    if (wantsFold) markFoldChains(children, jointKinds, childCells)
  }

  /**
   * Plegables: cada tramo de hojas unidas por 'fold' es una cadena. Las hojas con bisagra a la
   * derecha forman el grupo que se apila a la derecha; el resto, el de la izquierda. En cada grupo
   * la hoja de la jamba va colgada del marco: si el grupo es impar, esa hoja es la de paso (abre
   * sola, lleva la manilla); si es par, la manilla va en la hoja que encabeza el grupo (la más
   * lejana de su jamba). Las demás son pasivas. Supuesto documentado en research 25 §6.2 y L16.
   */
  function markFoldChains(children: DesignNode[], joints: ('mullion' | 'french' | 'fold')[], childCells: number[][]): void {
    let start = 0
    for (let i = 0; i <= children.length - 1; i++) {
      const chainEnds = i === children.length - 1 || joints[i] !== 'fold'
      if (!chainEnds) continue
      const run = Array.from({ length: i - start + 1 }, (_, k) => start + k)
      start = i + 1
      if (run.length < 2) continue
      const cellOf = (index: number) => out.cells[childCells[index][0]]
      const left = run.filter((index) => cellOf(index)?.node.opening?.hinge !== 'right')
      const right = run.filter((index) => cellOf(index)?.node.opening?.hinge === 'right')
      const active = new Set<number>()
      const access = new Set<number>()
      if (left.length) {
        if (left.length % 2 === 1) {
          active.add(left[0])
          access.add(left[0])
        } else active.add(left[left.length - 1])
      }
      if (right.length) {
        if (right.length % 2 === 1) {
          active.add(right[right.length - 1])
          access.add(right[right.length - 1])
        } else active.add(right[0])
      }
      for (const index of run) {
        const cell = cellOf(index)
        if (!cell) continue
        cell.pair = 'fold'
        cell.passive = !active.has(index)
        if (access.has(index)) cell.foldAccess = true
      }
    }
  }
}
