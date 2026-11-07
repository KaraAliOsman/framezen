import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resetI18nForTests } from '../../../lib/i18n'
import { fakeEditor } from '../testing'
import { clearFrecency, recordUse, resetFrecencyCache } from './frecency'
import { createFallbackInterpreter, isConfident, type InterpreterContext } from './interpreter'

function ctx(partial: Partial<InterpreterContext> = {}): InterpreterContext {
  return {
    locale: 'es',
    route: '/inicio',
    bridge: null,
    entities: {
      clients: [
        { id: 'c1', name: 'Marcela Fuentes', detail: 'Concepción' },
        { id: 'c2', name: 'Marco Antonio Ruiz' },
        { id: 'c3', name: 'Constructora Andes' },
      ],
      quotes: [{ id: 'q1', number: 412, title: 'Casa Soto', clientName: 'Juan Soto' }],
      colors: ['Blanco', 'Nogal', 'Antracita', 'Roble dorado'],
      lines: ['Serie 70', 'Serie 70 corredera'],
      glass: ['DVH 4+12+4', 'Laminado 3+3'],
    },
    ideas: ['Cotiza una corredera de 1.500 × 1.200', 'Busca a Pérez'],
    ...partial,
  }
}

beforeEach(() => {
  clearFrecency()
  resetFrecencyCache()
})
afterEach(() => resetI18nForTests())

describe('intérprete local · parse', () => {
  it('entiende un comando y muestra lo que va a hacer', () => {
    const parse = createFallbackInterpreter(ctx({ bridge: fakeEditor().bridge, route: '/cotizaciones/q1' })).parse('agrega una corredera de 1500 x 1200 en nogal')
    expect(isConfident(parse)).toBe(true)
    expect(parse.plan?.[0]).toMatchObject({ tool: 'add_window', args: expect.objectContaining({ typology: 'sliding_2', width: 1500, height: 1200 }) })
    expect(parse.interpretation).toMatch(/^Corredera 2 hojas · 1\.500 × 1\.200 mm/)
  })

  it('las preguntas libres no se disfrazan de comando: van a la IA', () => {
    const nlu = createFallbackInterpreter(ctx())
    for (const text of ['¿por qué bajaron las ventas este mes?', 'escríbele un correo amable a Marcela explicando el atraso']) {
      const parse = nlu.parse(text)
      expect(isConfident(parse)).toBe(false)
      expect(parse.plan).toBeNull()
    }
  })

  it('deshacer, recordar y ayuda se resuelven sin IA', () => {
    const nlu = createFallbackInterpreter(ctx())
    expect(nlu.parse('deshacer').plan?.[0].tool).toBe('undo')
    expect(nlu.parse('recuerda que siempre cotizamos con termopanel').plan?.[0]).toMatchObject({ tool: 'remember', args: { content: 'siempre cotizamos con termopanel' } })
    expect(nlu.parse('ayuda').reply).toMatch(/^Puedo armar/)
  })
})

describe('intérprete local · completar', () => {
  it('con la entrada vacía ofrece ideas de la pantalla (sin fantasma)', () => {
    const c = createFallbackInterpreter(ctx()).complete('', 0)
    expect(c.ghost).toBeUndefined()
    expect(c.items.map((i) => i.label)).toEqual(['Cotiza una corredera de 1.500 × 1.200', 'Busca a Pérez'])
  })

  it('el fantasma es la continuación común de los comandos que calzan', () => {
    const nlu = createFallbackInterpreter(ctx())
    expect(nlu.complete('nueva coti', 10).ghost).toBe('zación para ')
    // «Agrega una …» tiene varias continuaciones: solo se completa lo común.
    expect(nlu.complete('agr', 3).ghost).toBe('ega una ')
  })

  it('dentro de un comando sugiere valores del catálogo y de tus datos', () => {
    const nlu = createFallbackInterpreter(ctx())
    const colors = nlu.complete('Cambia todo a no', 16)
    expect(colors.ghost).toBe('gal')
    expect(colors.items[0]).toMatchObject({ kind: 'color', label: 'nogal', insert: 'Cambia todo a nogal' })
    const clients = nlu.complete('Nueva cotización para mar', 25)
    expect(clients.items.map((i) => i.label)).toEqual(['Marcela Fuentes', 'Marco Antonio Ruiz'])
    // Dos clientes posibles: el fantasma solo completa lo común («Marc»), nunca elige por ti.
    expect(clients.ghost).toBe('c')
  })

  it('sin tildes ni mayúsculas igual calza', () => {
    const c = createFallbackInterpreter(ctx()).complete('abre la cotizacion 4', 20)
    expect(c.items[0]).toMatchObject({ kind: 'quote', label: '412' })
  })

  it('con el cursor en medio no propone nada', () => {
    expect(createFallbackInterpreter(ctx()).complete('agrega una', 3)).toEqual({ items: [] })
  })

  it('lo que más usas sube, sin pasar por encima de una coincidencia exacta', () => {
    recordUse('client:c2', 5)
    const nlu = createFallbackInterpreter(ctx())
    expect(nlu.complete('Nueva cotización para mar', 25).items[0].label).toBe('Marco Antonio Ruiz')
    expect(nlu.complete('Nueva cotización para marcela fuentes', 37).items[0].label).toBe('Marcela Fuentes')
  })

  it('es rápido: < 2 ms por tecla con 500 clientes', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ id: `c${i}`, name: `Cliente ${i} Pérez` }))
    const nlu = createFallbackInterpreter(ctx({ entities: { ...ctx().entities, clients: many } }))
    const text = 'Nueva cotización para cliente 4'
    nlu.complete(text, text.length)
    const start = performance.now()
    for (let i = 0; i < 100; i++) nlu.complete(text.slice(0, 22 + (i % 10)), 22 + (i % 10))
    const perCall = (performance.now() - start) / 100
    expect(perCall).toBeLessThan(2)
  })
})
