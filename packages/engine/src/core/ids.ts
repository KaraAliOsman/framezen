import type { DesignNode, Id, WindowDesign } from '../types'
import { panelsOf, walkNodes } from './tree'

const ID_RE = /^n(\d+)$/

/** Mayor número usado en ids 'n1', 'n2'… (nodos y paneles de corredera). */
export function maxIdNumber(source: WindowDesign | DesignNode): number {
  const root = typeof source === 'object' && source !== null && 'root' in source ? source.root : source
  let max = 0
  const consider = (id: Id) => {
    const m = ID_RE.exec(id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  if (!root) return 0
  walkNodes(root, (node) => {
    consider(node.id)
    for (const p of panelsOf(node)) if (p) consider(p.id)
  })
  return max
}

/** Siguiente id libre y determinista ('n' + (máximo existente + 1)). Nunca usa azar. */
export function nextId(source: WindowDesign | DesignNode): Id {
  return `n${maxIdNumber(source) + 1}`
}

/** Generador de ids consecutivos a partir del máximo existente (uso interno). */
export function idFactory(source?: WindowDesign | DesignNode | number): () => Id {
  let n = typeof source === 'number' ? source : source ? maxIdNumber(source) : 0
  return () => `n${++n}`
}
