import type { DesignNode, Id, LeafNode, SlidingPanel, SplitNode, WindowDesign } from '../types'

type Root = DesignNode | WindowDesign

const isObject = (v: unknown): v is object => typeof v === 'object' && v !== null

const rootOf = (r: Root): DesignNode | undefined => (isObject(r) && 'root' in r ? r.root : r)

/**
 * Hijos de una división. Los diseños guardados solo traen validado `root.type`, así que un
 * nodo puede llegar sin `children` (o con basura): se trata como división vacía.
 */
export function childrenOf(node: DesignNode | undefined): DesignNode[] {
  return isObject(node) && node.type === 'split' && Array.isArray(node.children) ? node.children : []
}

/** Paneles de una corredera; [] si el nodo llega sin `panels` (mismo motivo que childrenOf). */
export function panelsOf(node: DesignNode | undefined): SlidingPanel[] {
  return isObject(node) && node.type === 'sliding' && Array.isArray(node.panels) ? node.panels : []
}

/** Busca un nodo por id (en un diseño o en un subárbol). */
export function findNode(root: Root, id: Id): DesignNode | undefined {
  const start = rootOf(root)
  if (!isObject(start)) return undefined
  if (start.id === id) return start
  for (const child of childrenOf(start)) {
    const found = findNode(child, id)
    if (found) return found
  }
  return undefined
}

/** Busca un panel de corredera por id. */
export function findPanel(root: Root, id: Id): SlidingPanel | undefined {
  let found: SlidingPanel | undefined
  const start = rootOf(root)
  if (!start) return undefined
  walkNodes(start, (node) => {
    if (!found && node.type === 'sliding') found = panelsOf(node).find((p) => isObject(p) && p.id === id)
  })
  return found
}

/** Padre (división) de un nodo y su índice entre los hijos. */
export function findParent(root: Root, id: Id): { parent: SplitNode; index: number } | undefined {
  const start = rootOf(root)
  if (!isObject(start) || start.type !== 'split') return undefined
  const children = childrenOf(start)
  const index = children.findIndex((c) => isObject(c) && c.id === id)
  if (index >= 0) return { parent: start, index }
  for (const child of children) {
    const found = findParent(child, id)
    if (found) return found
  }
  return undefined
}

/** Ids desde la raíz hasta el nodo (incluido), o undefined si no existe. */
export function nodePath(root: Root, id: Id): Id[] | undefined {
  const start = rootOf(root)
  if (!isObject(start)) return undefined
  if (start.id === id) return [start.id]
  for (const child of childrenOf(start)) {
    const sub = nodePath(child, id)
    if (sub) return [start.id, ...sub]
  }
  if (panelsOf(start).some((p) => isObject(p) && p.id === id)) return [start.id, id]
  return undefined
}

/**
 * Reemplaza inmutablemente el nodo `id` por `fn(nodo)`. Las ramas no tocadas se comparten;
 * si el id no existe devuelve el mismo árbol.
 */
export function mapNode(root: DesignNode, id: Id, fn: (node: DesignNode) => DesignNode): DesignNode {
  if (!isObject(root)) return root
  if (root.id === id) return fn(root)
  if (root.type !== 'split' || !Array.isArray(root.children)) return root
  let changed = false
  const children = root.children.map((child) => {
    const next = mapNode(child, id, fn)
    if (next !== child) changed = true
    return next
  })
  return changed ? { ...root, children } : root
}

/** Recorre todos los nodos en orden (padre antes que hijos). Salta ramas nulas o que no son nodos. */
export function walkNodes(root: DesignNode, visit: (node: DesignNode, depth: number) => void, depth = 0): void {
  if (!isObject(root)) return
  visit(root, depth)
  for (const child of childrenOf(root)) walkNodes(child, visit, depth + 1)
}

export function collectLeaves(root: DesignNode): LeafNode[] {
  const leaves: LeafNode[] = []
  walkNodes(root, (n) => {
    if (n.type === 'leaf') leaves.push(n)
  })
  return leaves
}

export function firstLeaf(root: DesignNode): LeafNode | undefined {
  return collectLeaves(root)[0]
}
