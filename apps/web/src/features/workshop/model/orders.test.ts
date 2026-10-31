import { describe, expect, it } from 'vitest'
import type { WorkOrder } from '@framezen/shared'
import {
  daysUntil,
  dueInfo,
  dueSentence,
  filterCounts,
  filterOrders,
  friendlyDate,
  matchesQuery,
  shortDate,
  sortOrders,
  todayIn,
  workshopOverview,
} from './orders'

// 31 de octubre de 2026, 10:00 en Chile (UTC−3).
const NOW = new Date('2026-10-31T13:00:00Z')

function order(over: Partial<WorkOrder> & Pick<WorkOrder, 'id' | 'number'>): WorkOrder {
  return {
    quoteId: `q${over.number}`,
    quoteNumber: 400 + over.number,
    title: 'Obra',
    status: 'open',
    progress: { V1: 'cut' },
    createdAt: '2026-10-01T12:00:00Z',
    updatedAt: '2026-10-01T12:00:00Z',
    ...over,
  }
}

describe('fechas comprometidas', () => {
  it('usa el día de Chile, no el de UTC', () => {
    // 01:30 UTC del 1 de noviembre = 31 de octubre en Chile.
    expect(todayIn(new Date('2026-11-01T01:30:00Z'))).toBe('2026-10-31')
    expect(daysUntil('2026-11-01', new Date('2026-11-01T01:30:00Z'))).toBe(1)
  })

  it('en palabras y con tono', () => {
    expect(dueInfo('2026-10-29', { now: NOW })).toMatchObject({ tone: 'late', label: 'Atrasada 2 días', days: -2 })
    expect(dueInfo('2026-10-30', { now: NOW }).label).toBe('Atrasada 1 día')
    expect(dueInfo('2026-10-31', { now: NOW })).toMatchObject({ tone: 'soon', label: 'Vence hoy' })
    expect(dueInfo('2026-11-01', { now: NOW })).toMatchObject({ tone: 'soon', label: 'Vence mañana' })
    expect(dueInfo('2026-11-03', { now: NOW })).toMatchObject({ tone: 'soon', label: 'En 3 días' })
    expect(dueInfo('2026-11-20', { now: NOW })).toMatchObject({ tone: 'calm', label: 'En 20 días', date: '20 nov' })
    expect(dueInfo(undefined, { now: NOW })).toMatchObject({ tone: 'none', label: 'Por definir' })
    expect(dueInfo('mañana', { now: NOW }).tone).toBe('none')
    // Una OT lista no se marca atrasada.
    expect(dueInfo('2026-10-20', { now: NOW, done: true })).toMatchObject({ tone: 'done', label: '20 oct' })
  })

  it('la tarjeta dice la entrega en una frase que se entiende sola', () => {
    const at = (iso?: string, done = false) => dueSentence(dueInfo(iso, { now: NOW, done }))
    expect(at(undefined)).toBe('Entrega por definir')
    expect(at('2026-10-31')).toBe('Entrega hoy')
    expect(at('2026-11-01')).toBe('Entrega mañana')
    expect(at('2026-11-20')).toBe('Entrega en 20 días')
    expect(at('2026-10-29')).toBe('Atrasada 2 días')
    expect(at('2026-10-20', true)).toBe('Entrega 20 oct')
  })

  it('formatos cortos', () => {
    expect(shortDate('2026-11-05')).toBe('05-11-2026')
    expect(friendlyDate('2027-01-05', NOW)).toBe('5 ene 2027')
    expect(friendlyDate('2026-09-01T00:00:00Z', NOW)).toBe('1 sept')
  })
})

describe('lista de OT', () => {
  const orders = [
    order({ id: 'a', number: 10, title: 'Casa Pérez · Concepción', clientName: 'Pedro Pérez', dueDate: '2026-11-10' }),
    order({ id: 'b', number: 11, title: 'Oficinas Lota', dueDate: '2026-10-28', status: 'in_progress', progress: { V1: 'weld', V2: 'cut' } }),
    order({ id: 'c', number: 12, title: 'Depto. Rojas' }),
    order({ id: 'd', number: 9, title: 'Galpón', status: 'done', progress: { V1: 'ready' }, updatedAt: '2026-10-30T12:00:00Z' }),
    order({ id: 'e', number: 8, title: 'Bodega', status: 'done', progress: { V1: 'installed' }, updatedAt: '2026-10-29T12:00:00Z' }),
  ]

  it('busca por número, cotización, obra o cliente, sin tildes', () => {
    expect(matchesQuery(orders[0]!, 'concepcion')).toBe(true)
    expect(matchesQuery(orders[0]!, 'OT 10')).toBe(true)
    expect(matchesQuery(orders[0]!, 'N° 10')).toBe(true)
    expect(matchesQuery(orders[0]!, '410')).toBe(true)
    expect(matchesQuery(orders[0]!, 'pérez casa')).toBe(true)
    expect(matchesQuery(orders[0]!, 'lota')).toBe(false)
    expect(matchesQuery(orders[0]!, '   ')).toBe(true)
  })

  it('primero lo atrasado, luego por fecha; sin fecha al final; listas por novedad', () => {
    expect(sortOrders(orders, NOW).map((o) => o.id)).toEqual(['b', 'a', 'c', 'd', 'e'])
  })

  it('filtros y conteos', () => {
    expect(filterOrders(orders, 'open', '', NOW).map((o) => o.id)).toEqual(['b', 'a', 'c'])
    expect(filterOrders(orders, 'done', '', NOW).map((o) => o.id)).toEqual(['d', 'e'])
    expect(filterOrders(orders, 'all', 'galpon', NOW).map((o) => o.id)).toEqual(['d'])
    expect(filterCounts(orders)).toEqual({ open: 3, done: 2, all: 5 })
  })

  it('resumen del taller', () => {
    expect(workshopOverview(orders, NOW)).toEqual({ open: 3, windowsInProcess: 4, dueThisWeek: 0, late: 1 })
    const soon = [order({ id: 'x', number: 1, dueDate: '2026-11-04' })]
    expect(workshopOverview(soon, NOW).dueThisWeek).toBe(1)
  })
})
