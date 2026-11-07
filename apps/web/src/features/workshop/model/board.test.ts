import { describe, expect, it } from 'vitest'
import type { Quote, QuoteItem, WorkOrder } from '@dekopen/shared'
import { boardOrders, buildBoard, moveInProgress, orderRefs, parseCardId } from './board'

const NOW = new Date('2026-10-31T13:00:00Z')

function order(over: Partial<WorkOrder> & Pick<WorkOrder, 'id' | 'number'>): WorkOrder {
  return {
    quoteId: `q-${over.id}`,
    quoteNumber: 400 + over.number,
    title: `Obra ${over.number}`,
    status: 'open',
    progress: {},
    createdAt: '2026-10-01T12:00:00Z',
    updatedAt: '2026-10-30T12:00:00Z',
    ...over,
  }
}

const item = (ref: string, qty = 1): QuoteItem => ({
  id: ref,
  ref,
  qty,
  design: { version: 1, lineId: 'l', width: 1000, height: 1000, colorId: 'blanco', glassId: 'g', root: { id: 'n1', type: 'leaf', opening: { kind: 'fixed' } } },
})

const quote = (items: QuoteItem[]): Quote =>
  ({ id: 'q', number: 1, title: 'x', status: 'workshop', items, extras: [], discountPct: 0, revision: 0, version: 1, createdAt: '', updatedAt: '' }) as Quote

describe('tablero', () => {
  it('muestra lo que sigue en taller y lo listo reciente o sin instalar', () => {
    const list = [
      order({ id: 'a', number: 1 }),
      order({ id: 'b', number: 2, status: 'done', progress: { V1: 'ready' }, updatedAt: '2026-01-01T00:00:00Z' }),
      order({ id: 'c', number: 3, status: 'done', progress: { V1: 'installed' }, updatedAt: '2026-10-25T00:00:00Z' }),
      order({ id: 'd', number: 4, status: 'done', progress: { V1: 'installed' }, updatedAt: '2026-08-01T00:00:00Z' }),
    ]
    expect(boardOrders(list, NOW).map((o) => o.id)).toEqual(['a', 'b', 'c'])
  })

  it('refs en el orden de la cotización, sin cantidad 0 ni repetidas; si no hay cotización, las del avance', () => {
    const o = order({ id: 'a', number: 1, progress: { V2: 'weld', V1: 'cut' } })
    expect(orderRefs(o, quote([item('V1'), item('V2'), item('V2'), item('V3', 0)])).map((r) => r.ref)).toEqual(['V1', 'V2'])
    expect(orderRefs(o).map((r) => r.ref)).toEqual(['V2', 'V1'])
  })

  it('arma columnas: lo más urgente arriba, luego por OT y ref', () => {
    const a = order({ id: 'a', number: 7, dueDate: '2026-11-20', progress: { V1: 'cut', V2: 'weld', V10: 'cut' } })
    const b = order({ id: 'b', number: 5, dueDate: '2026-11-02', progress: { V1: 'cut' }, clientName: 'Rojas' })
    const columns = buildBoard([{ order: a }, { order: b }], '', NOW)
    expect(columns.cut.map((c) => c.id)).toEqual(['b:V1', 'a:V1', 'a:V10'])
    expect(columns.weld.map((c) => c.id)).toEqual(['a:V2'])
    expect(columns.ready).toEqual([])
    // Con la cotización, la tarjeta trae el dibujo y las unidades.
    const withQuote = buildBoard([{ order: b, quote: quote([item('V1', 3)]) }], '', NOW)
    expect(withQuote.cut[0]?.item?.qty).toBe(3)
    // Búsqueda por cliente.
    expect(buildBoard([{ order: a }, { order: b }], 'rojas', NOW).cut.map((c) => c.id)).toEqual(['b:V1'])
  })

  it('mover una ventana', () => {
    const progress = { V1: 'cut', V2: 'weld' } as const
    expect(moveInProgress(progress, 'V1', 'weld')).toEqual({ V1: 'weld', V2: 'weld' })
    expect(moveInProgress(progress, 'V2', 'weld')).toBe(progress)
    expect(parseCardId('abc:V1')).toEqual({ orderId: 'abc', ref: 'V1' })
    expect(parseCardId('abc:V1:2')).toEqual({ orderId: 'abc', ref: 'V1:2' })
    expect(parseCardId('sinref')).toBeNull()
  })
})
