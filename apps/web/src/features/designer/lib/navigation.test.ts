import { describe, expect, it } from 'vitest'
import { arrowDirection, nextInDirection, type NavTarget } from './navigation'

// Ventana de 2 × 2 paños más un paño ancho abajo.
const grid: NavTarget[] = [
  { id: 'a', rect: { x: 0, y: 0, w: 100, h: 100 } },
  { id: 'b', rect: { x: 100, y: 0, w: 100, h: 100 } },
  { id: 'c', rect: { x: 0, y: 100, w: 100, h: 100 } },
  { id: 'd', rect: { x: 100, y: 100, w: 100, h: 100 } },
  { id: 'e', rect: { x: 0, y: 200, w: 200, h: 60 } },
]

describe('nextInDirection', () => {
  it('se mueve al vecino que se ve en esa dirección', () => {
    expect(nextInDirection(grid, 'a', 'right')).toBe('b')
    expect(nextInDirection(grid, 'a', 'down')).toBe('c')
    expect(nextInDirection(grid, 'd', 'left')).toBe('c')
    expect(nextInDirection(grid, 'd', 'up')).toBe('b')
    expect(nextInDirection(grid, 'c', 'down')).toBe('e')
  })

  it('se queda donde está si no hay nada en esa dirección', () => {
    expect(nextInDirection(grid, 'a', 'left')).toBe('a')
    expect(nextInDirection(grid, 'e', 'down')).toBe('e')
  })

  it('sin selección elige el primero; sin paños, nada', () => {
    expect(nextInDirection(grid, null, 'right')).toBe('a')
    expect(nextInDirection([], null, 'right')).toBeNull()
  })

  it('traduce las teclas de flecha', () => {
    expect(arrowDirection('ArrowLeft')).toBe('left')
    expect(arrowDirection('ArrowDown')).toBe('down')
    expect(arrowDirection('a')).toBeNull()
  })
})
