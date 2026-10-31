import type { DesignNode, LeafNode, WindowDesign } from '@framezen/engine'

/** Cómo abre una ventana, en palabras de cliente (vista interior). */

function leafPhrase(leaf: LeafNode): string {
  const o: Partial<LeafNode['opening']> = leaf.opening ?? { kind: 'fixed' }
  const side = o.hinge === 'right' ? 'derecha' : 'izquierda'
  const out = o.direction === 'out'
  switch (o.kind) {
    case 'fixed':
      return leaf.fill === 'panel' ? 'panel fijo' : 'fijo'
    case 'casement':
      return `abatible hacia ${out ? 'afuera' : 'adentro'} con bisagras a la ${side}`
    case 'tilt_turn':
      return `oscilobatiente con bisagras a la ${side}`
    case 'tilt':
      return 'oscilante (abre arriba hacia adentro)'
    case 'awning':
      return 'proyectante (abre abajo hacia afuera)'
    case 'door':
      return `puerta hacia ${out ? 'afuera' : 'adentro'} con bisagras a la ${side}`
    default:
      return 'fijo'
  }
}

/** Hojas del árbol. El árbol guardado puede venir incompleto: se saltan nodos nulos y listas que no lo son. */
function leaves(node: DesignNode | null | undefined, out: LeafNode[] = [], depth = 0): LeafNode[] {
  if (!node || typeof node !== 'object' || depth > 64) return out
  if (node.type === 'leaf') out.push(node)
  else if (node.type === 'split' && Array.isArray(node.children)) node.children.forEach((c) => leaves(c, out, depth + 1))
  return out
}

export function describeOpening(design: WindowDesign): string {
  const root = design?.root
  if (!root || typeof root !== 'object') return 'Fijo'
  if (root.type === 'sliding') {
    const panels = Array.isArray(root.panels) ? root.panels.filter((p) => p && typeof p === 'object') : []
    const moving = panels.filter((p) => p.kind === 'moving').length
    const fixed = panels.length - moving
    const parts = [`${moving} ${moving === 1 ? 'hoja corredera' : 'hojas correderas'}`]
    if (fixed) parts.push(`${fixed} ${fixed === 1 ? 'fija' : 'fijas'}`)
    const rails = root.rails === 1 ? 'monorriel' : Number.isFinite(root.rails) ? `${root.rails} rieles` : ''
    return rails ? `${parts.join(' y ')}, ${rails}` : parts.join(' y ')
  }
  const list = leaves(root)
  if (list.length === 0) return 'Fijo'
  if (list.every((l) => (l.opening?.kind ?? 'fixed') === 'fixed')) return list.length === 1 ? 'Paño fijo' : `${list.length} paños fijos`
  const phrases = list.map(leafPhrase)
  const text = phrases.length > 3 ? `${phrases.slice(0, 3).join(', ')} y ${phrases.length - 3} más` : phrases.join(' + ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}
