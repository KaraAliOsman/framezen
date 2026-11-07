import type { DesignNode, LeafNode, LineKind, SlidingPanel, WindowDesign } from '../types'
import { MAX_SLIDING_PANELS } from './defaults'
import { layoutTree } from './geometry'
import { idFactory } from './ids'

/**
 * Conversión practicable ↔ corredera conservando medidas, vidrios por paño y el orden de
 * izquierda a derecha. Se usa al cambiar de línea y como corrección en un clic.
 */

/** Paneles por defecto para n hojas (fijos a los costados en 4 hojas, como la tipología). */
export function defaultSlidingPanels(n: number, nextId: () => string): SlidingPanel[] {
  const count = Math.max(2, Math.min(MAX_SLIDING_PANELS, Math.floor(n)))
  if (count === 4) {
    return [
      { id: nextId(), kind: 'fixed' },
      { id: nextId(), kind: 'moving', direction: 'left' },
      { id: nextId(), kind: 'moving', direction: 'right' },
      { id: nextId(), kind: 'fixed' },
    ]
  }
  return Array.from({ length: count }, (_, i) => ({
    id: nextId(),
    kind: 'moving' as const,
    direction: i < count / 2 ? ('right' as const) : ('left' as const),
  }))
}

/** Árbol equivalente para el otro tipo de línea (o el mismo si ya corresponde). */
export function convertRoot(design: WindowDesign, kind: LineKind): { root: DesignNode; dropShape: boolean } {
  const root = design.root
  const nextId = idFactory(design)
  if (kind === 'sliding') {
    if (root?.type === 'sliding') return { root, dropShape: false }
    const cells = layoutTree(design)
      .cells.slice()
      .sort((a, b) => a.box.x0 - b.box.x0 || a.box.y0 - b.box.y0)
    // Una columna por posición horizontal (las sobreluces se absorben).
    const columns: LeafNode[] = []
    let lastX = -1
    for (const c of cells) {
      if (c.box.x0 > lastX + 0.05) {
        columns.push(c.node)
        lastX = c.box.x0
      }
    }
    const count = Math.max(2, Math.min(MAX_SLIDING_PANELS, columns.length))
    let panels: SlidingPanel[]
    if (columns.length < 2) {
      panels = defaultSlidingPanels(2, nextId)
      const glassId = columns[0]?.glassId
      if (glassId) panels = panels.map((p) => ({ ...p, glassId }))
    } else {
      panels = columns.slice(0, count).map((leaf, i) => {
        const fixed = leaf.opening?.kind === 'fixed'
        const panel: SlidingPanel = fixed
          ? { id: nextId(), kind: 'fixed' }
          : { id: nextId(), kind: 'moving', direction: i < count / 2 ? 'right' : 'left' }
        if (leaf.glassId) panel.glassId = leaf.glassId
        return panel
      })
      if (!panels.some((p) => p.kind === 'moving')) {
        const last = panels[panels.length - 1]
        panels[panels.length - 1] = { ...last, kind: 'moving', direction: 'left' }
      }
    }
    return { root: { id: nextId(), type: 'sliding', rails: 2, panels }, dropShape: true }
  }

  if (root?.type !== 'sliding') return { root, dropShape: false }
  const panels = root.panels ?? []
  const leaves: LeafNode[] = panels.map((p, i) => {
    const leaf: LeafNode =
      p.kind === 'fixed'
        ? { id: nextId(), type: 'leaf', opening: { kind: 'fixed' } }
        : {
            id: nextId(),
            type: 'leaf',
            opening: { kind: 'casement', hinge: i < panels.length / 2 ? 'left' : 'right', direction: 'in' },
          }
    if (p.glassId) leaf.glassId = p.glassId
    return leaf
  })
  if (leaves.length <= 1) {
    return { root: leaves[0] ?? { id: nextId(), type: 'leaf', opening: { kind: 'fixed' } }, dropShape: false }
  }
  return {
    root: { id: nextId(), type: 'split', dir: 'vertical', children: leaves, sizes: leaves.map(() => null), joint: 'mullion' },
    dropShape: false,
  }
}
