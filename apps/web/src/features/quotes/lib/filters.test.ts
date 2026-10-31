import { describe, expect, it } from 'vitest'
import { FILTERS, filterFromParam } from './filters'

describe('filtro de /cotizaciones desde ?estado=', () => {
  it('lee el QuoteStatus del embudo de Inicio', () => {
    expect(filterFromParam('draft')).toBe('draft')
    expect(filterFromParam('sent')).toBe('sent')
    expect(filterFromParam('accepted')).toBe('accepted')
    expect(filterFromParam('workshop')).toBe('workshop')
    expect(filterFromParam('installed')).toBe('workshop')
    expect(filterFromParam('rejected')).toBe('rejected')
  })

  it('acepta las palabras de la pantalla, con o sin tildes ni mayúsculas', () => {
    expect(filterFromParam('Borradores')).toBe('draft')
    expect(filterFromParam('enviadas')).toBe('sent')
    expect(filterFromParam('en taller')).toBe('workshop')
    expect(filterFromParam('en-taller')).toBe('workshop')
    expect(filterFromParam('RECHAZADA')).toBe('rejected')
  })

  it('sin valor o desconocido muestra todas (nunca rompe)', () => {
    expect(filterFromParam(null)).toBe('all')
    expect(filterFromParam('')).toBe('all')
    expect(filterFromParam('closed')).toBe('all')
    expect(filterFromParam('cualquier cosa')).toBe('all')
  })

  it('cada filtro distinto de «todas» tiene sus estados', () => {
    for (const f of FILTERS) {
      if (f.value === 'all') expect(f.statuses).toBeUndefined()
      else expect(f.statuses?.length).toBeGreaterThan(0)
    }
    expect(FILTERS.find((f) => f.value === 'workshop')?.statuses).toEqual(['workshop', 'installed'])
  })
})
