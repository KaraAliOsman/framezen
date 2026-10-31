/**
 * Mover la selección con las flechas, según lo que se ve (en vista exterior izquierda y derecha
 * se invierten, por eso trabaja con rectángulos ya mapeados a pantalla).
 */
import type { Rect } from '@framezen/engine'

export type ArrowDirection = 'left' | 'right' | 'up' | 'down'

export interface NavTarget {
  id: string
  rect: Rect
}

const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

export function arrowDirection(key: string): ArrowDirection | null {
  switch (key) {
    case 'ArrowLeft':
      return 'left'
    case 'ArrowRight':
      return 'right'
    case 'ArrowUp':
      return 'up'
    case 'ArrowDown':
      return 'down'
    default:
      return null
  }
}

/**
 * El vecino más cercano en esa dirección: debe estar del lado pedido y se prefiere el que
 * comparte fila o columna (la distancia perpendicular pesa el triple). Sin selección, el primero.
 */
export function nextInDirection(targets: NavTarget[], currentId: string | null, dir: ArrowDirection): string | null {
  if (targets.length === 0) return null
  const current = targets.find((t) => t.id === currentId)
  if (!current) return targets[0].id
  const c = center(current.rect)
  let best: { id: string; score: number } | null = null
  for (const t of targets) {
    if (t.id === current.id) continue
    const p = center(t.rect)
    const dx = p.x - c.x
    const dy = p.y - c.y
    let primary: number
    let cross: number
    switch (dir) {
      case 'left':
        primary = -dx
        cross = Math.abs(dy)
        break
      case 'right':
        primary = dx
        cross = Math.abs(dy)
        break
      case 'up':
        primary = -dy
        cross = Math.abs(dx)
        break
      case 'down':
        primary = dy
        cross = Math.abs(dx)
        break
    }
    if (primary <= 0.5) continue
    const score = primary + cross * 3
    if (!best || score < best.score) best = { id: t.id, score }
  }
  return best ? best.id : current.id
}
