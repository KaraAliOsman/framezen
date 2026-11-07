import { afterEach, describe, expect, it } from 'vitest'
import { createDesign } from '@dekopen/engine'
import { resetI18nForTests, setLocale } from '../../../lib/i18n'
import { fakeEditor } from '../testing'
import { isConfident } from './interpreter'
import { createNluInterpreter, type NluInterpreterContext } from './nluInterpreter'

function ctx(partial: Partial<NluInterpreterContext> = {}): NluInterpreterContext {
  return {
    locale: 'es',
    route: '/inicio',
    bridge: null,
    catalog: {
      version: 'test',
      lines: [{ id: 'l1', name: 'Serie 70' }],
      colors: [
        { id: 'c-blanco', name: 'Blanco' },
        { id: 'c-nogal', name: 'Nogal' },
      ],
      glass: [
        { id: 'g1', name: 'DVH 4+12+4', kind: 'dvh' },
        { id: 'g2', name: 'Laminado 3+3', kind: 'laminated' },
        { id: 'g3', name: 'Laminado 4+4', kind: 'laminated' },
      ],
    },
    entities: {
      version: 'test',
      clients: [{ id: 'k1', name: 'Constructora Andes' }],
      quotes: [{ id: 'q1', number: 412, title: 'Casa Soto', clientName: 'Juan Soto' }],
      templates: [],
      assistants: [{ id: 'a1', name: 'Marco' }],
    },
    ideas: ['Cotiza una corredera de 1.500 × 1.200'],
    ...partial,
  }
}

afterEach(() => resetI18nForTests())

describe('intérprete local sobre el motor de comandos · parse', () => {
  it('un comando listo trae su plan, el «Entendí» y es confiable (gratis)', () => {
    const nlu = createNluInterpreter(ctx({ bridge: fakeEditor().bridge, route: '/cotizaciones/q1' }))
    const parse = nlu.parse('agrega una corredera de 1500 x 1200 en nogal')
    expect(parse.status).toBe('ready')
    expect(isConfident(parse)).toBe(true)
    expect(parse.plan?.[0]).toMatchObject({ tool: 'add_window', args: expect.objectContaining({ typology: 'sliding_2', width: 1500, height: 1200, colorId: 'c-nogal' }) })
    expect(parse.interpretation).toMatch(/1\.500 × 1\.200/)
  })

  it('palabra a medio escribir («tilt and tur»): no se ejecuta con Enter; muestra la lectura y la confirma', () => {
    const nlu = createNluInterpreter(ctx({ locale: 'en', bridge: fakeEditor().bridge, route: '/cotizaciones/q1' }))
    const parse = nlu.parse('add a tilt and tur')
    expect(parse.status).toBe('ambiguous')
    expect(isConfident(parse)).toBe(false)
    expect(parse.plan).toBeNull()
    expect(parse.choices?.map((c) => c.text)).toContain('add a tilt and turn')
    // La sugerencia reemplaza la frase entera (el nombre depende del glosario cargado).
    const top = nlu.complete('add a tilt and tur', 18).items[0]
    expect(top).toMatchObject({ kind: 'typology', id: 'typology:tilt_turn' })
    expect(top.insert).not.toMatch(/tilt and (tur|turn) /)
  })

  it('lo que falta se pregunta con opciones (comandos completos) y no se manda a la IA', () => {
    const nlu = createNluInterpreter(ctx({ bridge: fakeEditor().bridge, route: '/cotizaciones/q1' }))
    const parse = nlu.parse('agrega una ventana')
    expect(parse.status).toBe('incomplete')
    expect(parse.plan).toBeNull()
    expect(isConfident(parse)).toBe(false)
    expect(parse.missing[0]).toMatch(/tipolog/i)
    expect(parse.choices?.length).toBeGreaterThan(3)
    // Cada opción es un comando que el motor entiende solo.
    for (const choice of parse.choices!.slice(0, 4)) expect(nlu.parse(choice.text).status).toBe('ready')
  })

  it('una duda de vidrio ofrece los vidrios del catálogo', () => {
    const editor = fakeEditor()
    editor.bridge.addItem(createDesign('casement', { lineId: 'serie-70', colorId: 'blanco', glassId: 'dvh' }))
    const nlu = createNluInterpreter(ctx({ bridge: editor.bridge, route: '/cotizaciones/q1' }))
    const parse = nlu.parse('todas con vidrio laminado')
    expect(parse.status).not.toBe('ready')
    expect(parse.choices?.map((c) => c.label)).toEqual(expect.arrayContaining(['Laminado 3+3', 'Laminado 4+4']))
  })

  it('respuestas deterministas (ayuda, saludo) llegan como `reply`', () => {
    const nlu = createNluInterpreter(ctx())
    expect(nlu.parse('hola').reply).toBeTruthy()
    expect(isConfident(nlu.parse('hola'))).toBe(true)
  })

  it('las preguntas libres no se disfrazan de comando: van a la IA', () => {
    const nlu = createNluInterpreter(ctx())
    for (const text of ['¿por qué bajaron las ventas este mes?', 'escríbele un correo amable a Marcela explicando el atraso']) {
      const parse = nlu.parse(text)
      expect(isConfident(parse)).toBe(false)
      expect(parse.plan).toBeNull()
      expect(parse.status).toBe('unmatched')
    }
  })

  it('las estadísticas se responden con los datos de la pantalla (sin datos, van a la IA)', () => {
    const none = createNluInterpreter(ctx()).parse('cuánto vendí este mes')
    expect(none.reply).toBeUndefined()
    const now = new Date()
    const withData = createNluInterpreter(
      ctx({ stats: { complete: true, quotes: [{ id: 'q1', number: 1, status: 'accepted', total: 1_000_000, createdAt: now.toISOString(), acceptedAt: now.toISOString() }] } }),
    ).parse('cuánto vendí este mes')
    expect(withData.reply).toMatch(/1\.000\.000/)
  })

  it('entiende otros idiomas', async () => {
    await setLocale('en')
    const nlu = createNluInterpreter(ctx({ locale: 'en', bridge: fakeEditor().bridge, route: '/cotizaciones/q1' }))
    const parse = nlu.parse('add a sliding window 60x120')
    expect(parse.status).toBe('ready')
    expect(parse.plan?.[0].args).toMatchObject({ typology: 'sliding_2', width: 600, height: 1200 })
    expect(parse.notes?.[0]).toBeTruthy()
  })

  it('texto vacío: nada que entender', () => {
    const parse = createNluInterpreter(ctx()).parse('   ')
    expect(parse.plan).toBeNull()
    expect(isConfident(parse)).toBe(false)
  })
})

describe('intérprete local sobre el motor de comandos · completar', () => {
  it('ofrece la continuación (fantasma) y una lista con el texto completo ya armado', () => {
    const nlu = createNluInterpreter(ctx({ bridge: fakeEditor().bridge, route: '/cotizaciones/q1' }))
    const completion = nlu.complete('cambia todo a n', 'cambia todo a n'.length)
    expect(completion.ghost).toBe('ogal')
    expect(completion.items[0]).toMatchObject({ kind: 'color', label: 'Nogal', insert: 'cambia todo a Nogal' })
  })

  it('con la entrada vacía mezcla lo que más usas con ideas de la pantalla', () => {
    const completion = createNluInterpreter(ctx()).complete('', 0)
    expect(completion.ghost).toBeUndefined()
    expect(completion.items.some((i) => i.insert === 'Cotiza una corredera de 1.500 × 1.200')).toBe(true)
  })

  it('cada tecla sigue siendo barata con cientos de clientes (margen holgado: la medición fina está en packages/shared/test/nlu/bench)', () => {
    const clients = Array.from({ length: 500 }, (_, i) => ({ id: `k${i}`, name: `Cliente número ${i} Constructora` }))
    const nlu = createNluInterpreter(ctx({ entities: { version: 'big', clients, quotes: [], templates: [], assistants: [] }, bridge: fakeEditor().bridge, route: '/cotizaciones/q1' }))
    const text = 'asigna el cliente Constructora'
    nlu.complete(text, text.length)
    const start = performance.now()
    for (let i = 0; i < 40; i++) nlu.complete(text, text.length)
    expect((performance.now() - start) / 40).toBeLessThan(30)
  })
})
