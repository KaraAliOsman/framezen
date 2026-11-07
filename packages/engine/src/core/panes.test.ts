import { describe, expect, it } from 'vitest'
import type { WindowDesign } from '../types'
import { getTypology } from './typologies'
import { listPanes, resizePanes } from './panes'

const design = (id: string, width: number, height: number) => ({ ...getTypology(id as never)!.build(width, height), width, height }) as WindowDesign

describe('paños', () => {
  it('reduce el batiente de un fijo + batiente sin cambiar el ancho exterior', () => {
    const base = design('fixed_casement', 1700, 1400)
    const panes = listPanes(base)
    expect(panes.map((p) => p.opening)).toEqual(['fixed', 'casement'])
    const { design: next, problem } = resizePanes(base, { panes: panes.filter((p) => p.opening !== 'fixed'), width: 500 })
    expect(problem).toBeUndefined()
    expect(next.width).toBe(1700)
    expect(listPanes(next).map((p) => p.width)).toEqual([1200, 500])
    expect(listPanes(next).map((p) => p.opening)).toEqual(['fixed', 'casement'])
  })

  it('con dos batientes y un fijo, el fijo toma lo que sobra', () => {
    const base = design('casement_fixed_casement', 3000, 1400)
    const { design: next } = resizePanes(base, { panes: listPanes(base).filter((p) => p.opening !== 'fixed'), width: 500 })
    expect(listPanes(next).map((p) => p.width)).toEqual([500, 2000, 500])
  })

  it('una ventana de un solo paño no se puede repartir', () => {
    const base = design('casement', 800, 1200)
    expect(resizePanes(base, { panes: listPanes(base), width: 500 }).problem).toBe('whole_window')
  })

  it('no deja un paño más chico de lo posible', () => {
    const base = design('fixed_casement', 700, 1200)
    const [, casement] = listPanes(base)
    expect(resizePanes(base, { panes: [casement!], width: 650 }).problem).toBe('no_room')
  })

  it('reparte también los paneles de una corredera', () => {
    const base = design('sliding_2_fixed', 2000, 1200)
    const panes = listPanes(base)
    const { design: next } = resizePanes(base, { panes: panes.filter((p) => p.opening === 'sliding'), width: 800 })
    expect(listPanes(next).map((p) => p.width).sort((a, b) => a - b)).toEqual([800, 1200])
    expect(next.width).toBe(2000)
  })
})
