/**
 * Autocompletado slot por slot: comandos al empezar, tipología → medida → color → vidrio, entidades
 * reales (clientes, cotizaciones, plantillas, idiomas, destinos), texto fantasma solo si es claro y
 * literal, uso reciente, y que todo lo que se inserta se vuelve a entender.
 */
import { TYPOLOGY_IDS } from '@dekopen/engine'
import { describe, expect, it } from 'vitest'
import { LOCALES, type Locale } from '../../src/i18n/locales'
import { assemblyLabel, createNlu, createNluFrecency, nluMessages, type NluCompletion } from '../../src/nlu'
import { ASSEMBLY_CONCEPTS } from '../../src/nlu/clause'
import { typologyInsert } from '../../src/nlu/complete'
import { conceptSurface } from '../../src/nlu/lexicon'
import { CATALOG, ENTITIES, GLOSSARY, HOME_CTX, makeNlu, QUOTE_CTX } from './fixtures'

const nlu = makeNlu('es')
const complete = (text: string, ctx = QUOTE_CTX, cursor = text.length): NluCompletion => nlu.complete(text, cursor, ctx)
const inserts = (c: NluCompletion) => c.items.map((s) => s.insertText)

describe('autocompletado', () => {
  it('campo vacío: comandos según el contexto (con y sin cotización abierta)', () => {
    const inQuote = complete('')
    expect(inQuote.items[0]).toMatchObject({ kind: 'command', id: 'item.add', insertText: 'agrega una ' })
    expect(inQuote.ghost).toBeUndefined()
    const home = complete('', HOME_CTX)
    expect(home.items.map((s) => s.id)).toContain('quote.create')
    expect(home.items.map((s) => s.id)).not.toContain('item.add')
  })

  it('palabra inicial: comandos que empiezan así, fantasma con el prefijo común', () => {
    const r = complete('agr')
    expect(inserts(r)).toContain('agrega una ')
    expect(r.ghost).toBe('ega una')
    expect(r.replace).toEqual([0, 3])
  })

  it('slot por slot: tipología → medida → color → vidrio', () => {
    expect(complete('agrega una ').items[0]).toMatchObject({ kind: 'typology', id: 'sliding_2', insertText: 'corredera 2 hojas' })
    const corr = complete('agrega una corr')
    expect(corr.items.every((s) => s.kind === 'typology' && s.insertText.startsWith('corredera'))).toBe(true)
    expect(corr.ghost).toBe('edera')
    const size = complete('agrega una corredera ')
    expect(size.items).toEqual([expect.objectContaining({ kind: 'hint', insertText: '', label: '[ancho × alto] mm' })])
    expect(complete('agrega una corredera 15').items.at(-1)).toMatchObject({ kind: 'hint', label: '15 × ___ mm' })
    expect(complete('agrega una corredera 1500x1200 ').items.map((s) => s.kind)).toEqual(['color', 'color', 'color', 'color'])
    const nog = complete('agrega una corredera 1500x1200 nog')
    expect(nog.items[0]).toMatchObject({ kind: 'color', id: 'col-walnut', insertText: 'Nogal' })
    expect(nog.ghost).toBe('al')
    expect(complete('agrega una corredera 1500x1200 nogal con ter').items[0]).toMatchObject({ kind: 'glass', id: 'gl-dvh' })
  })

  it('valores de otros slots: destino, cliente, cotización, idioma, porcentaje, plantilla, ítem', () => {
    expect(complete('ve a cot')).toMatchObject({ ghost: 'izaciones', items: [expect.objectContaining({ kind: 'nav', id: 'quotes', canExecute: true })] })
    const clients = complete('asigna el cliente Ma')
    expect(clients.items.map((s) => s.id)).toEqual(expect.arrayContaining(['cl-maria', 'cl-mario']))
    expect(clients.ghost).toBe('r')
    expect(inserts(complete('abre la cotización 12'))).toEqual(['#123', '#124'])
    expect(complete('cambia el idioma a ').items).toHaveLength(7)
    expect(complete('cambia el idioma a ing').items[0]).toMatchObject({ kind: 'locale', id: 'en', insertText: 'inglés' })
    expect(inserts(complete('aplica un descuento de 1'))).toEqual(['10%', '15%'])
    expect(complete('cambia la plantilla a M').items[0]).toMatchObject({ kind: 'template', id: 'tpl-moderna' })
    expect(complete('duplica la ').items.map((s) => s.insertText)).toEqual(['V1', 'V2', 'V3', 'V4'])
  })

  it('«ponle …»: primero el cambio, después la ventana', () => {
    const r = complete('ponle ')
    expect(r.items[0].kind).toBe('color')
    expect(complete('ponle term').items[0]).toMatchObject({ kind: 'glass', id: 'gl-dvh' })
  })

  it('fantasma solo literal, con el cursor al final y sin ambigüedad', () => {
    expect(complete('Mar', HOME_CTX).ghost).toBeUndefined() // «márcala…» lleva tilde: no es continuación literal
    expect(complete('agrega una corr', QUOTE_CTX, 12).ghost).toBeUndefined() // cursor en medio
    const mid = complete('agrega una corr 1500x1200', QUOTE_CTX, 15)
    expect(mid.replace).toEqual([11, 15])
    expect(mid.items[0].kind).toBe('typology')
    expect(complete('crea una cotización llamada "Casa ').items).toEqual([]) // dentro de comillas
  })

  it('el uso reciente ordena dentro de la misma banda (nunca sobre una coincidencia mejor)', () => {
    const frecency = createNluFrecency()
    for (let i = 0; i < 5; i++) frecency.record('typology:sliding_3', Date.now())
    const withRecency = createNlu({ locale: 'es', glossary: GLOSSARY, catalog: CATALOG, entities: ENTITIES, frecency })
    expect(withRecency.complete('agrega una corr', 15, QUOTE_CTX).items[0].id).toBe('sliding_3')
    expect(withRecency.complete('agrega una osc', 14, QUOTE_CTX).items[0].id).toBe('tilt_turn')
    const restored = createNluFrecency(frecency.snapshot())
    expect(restored.boost('typology:sliding_3')).toBeGreaterThan(0)
    restored.clear()
    expect(restored.boost('typology:sliding_3')).toBe(0)
  })

  it('sin catálogo propone los colores y vidrios del léxico en el idioma de quien escribe', () => {
    const bare = makeNlu('en', { withData: false })
    expect(bare.complete('add a sliding window 1500x1200 whi', 34, QUOTE_CTX).items[0]).toMatchObject({ kind: 'color', insertText: 'white' })
    expect(bare.complete('add a sli', 9, QUOTE_CTX).items[0]).toMatchObject({ kind: 'typology', id: 'sliding_2' })
  })

  it('cada tipología que se inserta vuelve a la misma tipología en los 7 idiomas', () => {
    for (const locale of LOCALES) {
      const n = makeNlu(locale)
      for (const id of TYPOLOGY_IDS) {
        const ins = typologyInsert(id, locale, GLOSSARY)
        const text = locale === 'tr' ? `${ins} 1500x1200 ekle` : `${nluMessages[locale].say.item_add}${ins} 1500x1200`
        const r = n.parse(text, QUOTE_CTX)
        expect(r.plan?.find((c) => c.tool === 'add_window')?.args, `${locale}: ${text}`).toMatchObject({ typology: id })
      }
    }
  })

  it('cada conjunto que se sugiere vuelve a un plan de conjunto en los 7 idiomas', () => {
    for (const locale of LOCALES) {
      const n = makeNlu(locale)
      for (const [concept, preset] of ASSEMBLY_CONCEPTS) {
        const ins = conceptSurface(concept, locale)!
        const text = locale === 'tr' ? `${ins} 1000x1400 ekle` : `${nluMessages[locale].say.item_add}${ins} 1000x1400`
        const call = n.parse(text, QUOTE_CTX).plan?.find((c) => c.tool === 'add_assembly')
        expect(call?.args, `${locale}: ${text}`).toMatchObject({ preset })
      }
    }
  })

  it('las tipologías nuevas y los conjuntos aparecen en el autocompletado', () => {
    for (const [locale, text, id] of [
      ['es', 'agrega una guillo', 'vertical_sliding'],
      ['es', 'agrega una celo', 'louver_fixed'],
      ['es', 'agrega un bow', 'assembly:bow'],
      ['en', 'add a double h', 'vertical_sliding_double'],
      ['de', 'füge ein Erker', 'assembly:bay'],
      ['tr', 'giyo', 'vertical_sliding'],
    ] as const) {
      const r = makeNlu(locale).complete(text, text.length, QUOTE_CTX)
      expect(r.items.map((i) => i.id), `${locale}: ${text}`).toContain(id)
    }
  })

  it('las frases de inicio y los ejemplos de cada idioma se entienden (es lo que se muestra y se inserta)', () => {
    for (const locale of LOCALES) {
      const n = makeNlu(locale)
      const examples = nluMessages[locale].example as Record<string, string>
      const starters = nluMessages[locale].say as Record<string, string>
      for (const [key, text] of Object.entries(examples)) {
        const command = key.replace('_', '.')
        const r = n.parse(text, QUOTE_CTX)
        expect(r.command, `${locale} ejemplo ${key}: ${text}`).toBe(command)
        expect(['ready', 'answer'], `${locale} ejemplo ${key}: ${text} → ${r.status}`).toContain(r.status)
        const s = n.parse(starters[key], QUOTE_CTX)
        if (command !== 'dialog.open') expect(s.command, `${locale} inicio ${key}: «${starters[key]}»`).toBe(command)
      }
    }
  })

  it('completa en otros idiomas', () => {
    const de = makeNlu('de')
    expect(de.complete('füge ein Schie', 14, QUOTE_CTX).items[0]).toMatchObject({ kind: 'typology', id: 'sliding_2' })
    const tr = makeNlu('tr')
    expect(tr.complete('kataloğa g', 10, HOME_CTX).items.length).toBeGreaterThan(0)
    const fr = makeNlu('fr')
    expect(fr.complete('va au cat', 9, HOME_CTX).items[0]).toMatchObject({ kind: 'nav', id: 'catalog', insertText: 'catalogue' })
  })

  it('frase a medio escribir: completa «tilt and tur» y no la fija en la «Tür» alemana', () => {
    const en = makeNlu('en')
    const text = 'add a tilt and tur'
    const c = en.complete(text, text.length, QUOTE_CTX)
    expect(c.items[0]).toMatchObject({ kind: 'typology', id: 'tilt_turn', insertText: 'tilt and turn', replace: [6, 18] })
    expect(c.items.map((s) => s.id)).not.toContain('door')
    expect(c.ghost).toBe('n')
    // Al enviar a medio escribir: se muestra la interpretación (oscilobatiente) y se pide confirmar.
    const r = en.parse(text, QUOTE_CTX)
    expect(r.status).toBe('ambiguous')
    expect(r.plan).toBeNull()
    expect(r.summary.toLowerCase()).toContain('tilt and turn')
    expect(r.repairs.map((x) => x.text)).toContain('add a tilt and turn')
    expect(en.parse('add a tilt and turn', QUOTE_CTX)).toMatchObject({ status: 'ready', plan: [{ tool: 'add_window', args: { typology: 'tilt_turn' } }] })
  })

  it('coincidencia corta de otro idioma («tur» = Tür) nunca se ejecuta sin confirmar', () => {
    const en = makeNlu('en')
    const r = en.parse('add a tur', QUOTE_CTX)
    expect(r.status).toBe('ambiguous')
    expect(r.plan).toBeNull()
    expect(r.repairs.map((x) => x.text)).toContain('add a door')
    // Las mezclas largas y exactas siguen funcionando.
    expect(makeNlu('es').parse('agrega sliding 2 hojas white', QUOTE_CTX).status).toBe('ready')
  })

  it('cifras mientras falta la medida: solo la pista de medida (no vidrios «4/16/4»)', () => {
    const one = complete('agrega una corredera de 1')
    expect(one.items.map((s) => s.kind)).toEqual(['hint'])
    expect(one.items[0].label).toBe('1 × ___ mm')
    const height = complete('agrega una corredera de 1500 por 1')
    expect(height.items.map((s) => s.kind)).toEqual(['hint'])
    expect(height.items[0].label).toBe('1500 × 1… mm')
    // Con la medida puesta, «con termo» sí sugiere vidrios.
    expect(complete('agrega una corredera de 1500 x 1200 con termo').items[0]).toMatchObject({ kind: 'glass' })
  })

  it('entrada fuera de rango o hostil no lanza', () => {
    expect(complete('x'.repeat(5000)).items).toEqual([])
    expect(() => complete('agrega', QUOTE_CTX, -5)).not.toThrow()
    expect(() => complete('agrega', QUOTE_CTX, 999)).not.toThrow()
  })
})

describe('unir ventanas al escribir (7 idiomas)', () => {
  const ARTICLE: readonly [Locale, string][] = [['es', 'une la'], ['en', 'join the'], ['pt', 'unir a'], ['fr', 'jumelle la'], ['de', 'kopple die'], ['it', 'unisci la']]
  const AFTER_FIRST: readonly [Locale, string][] = [['es', 'une la V1 '], ['en', 'join V1 '], ['pt', 'unir V1 '], ['fr', 'jumelle V1 '], ['de', 'kopple V1 '], ['it', 'unisci V1 '], ['tr', 'birleştir V1 ']]

  it.each(ARTICLE)('%s: «%s» sin espacio ofrece ventanas, no palabras sueltas', (locale, text) => {
    const r = makeNlu(locale).complete(text, text.length, QUOTE_CTX)
    expect(r.items.map((i) => i.label)).toEqual(['V1', 'V2', 'V3', 'V4'])
    expect(r.items.every((i) => i.kind === 'value')).toBe(true)
    // Se escribe después del artículo: aceptar la sugerencia deja una frase que se entiende.
    const [from, to] = r.items[0]!.replace
    expect(`${text.slice(0, from)}${r.items[0]!.insertText}${text.slice(to)}`).toBe(`${text} V1`)
  })

  it.each(AFTER_FIRST)('%s: «%s» ofrece la otra ventana', (locale, text) => {
    const n = makeNlu(locale)
    const labels = n.complete(text, text.length, QUOTE_CTX).items.map((i) => i.label)
    expect(labels).not.toContain('V1')
    expect(labels).toContain('V2')
    expect(n.parse(text, QUOTE_CTX).missing?.flatMap((m) => m.choices ?? []).map((c) => c.label)).not.toContain('V1')
  })

  it('con dos ventanas elegidas ya no ofrece más, y con una sola ofrece lo que queda', () => {
    const n = makeNlu('es')
    expect(n.complete('une la V1 con la V2 ', 20, QUOTE_CTX).items.filter((i) => i.kind === 'value')).toEqual([])
    const two = { ...QUOTE_CTX, items: QUOTE_CTX.items!.slice(0, 2) }
    expect(n.complete('une la V1 con la ', 17, two).items.map((i) => i.label)).toEqual(['V2'])
  })

  it('otras órdenes sobre una ventana tampoco caen en palabras sueltas', () => {
    expect(makeNlu('es').complete('elimina la', 10, QUOTE_CTX).items.every((i) => i.kind === 'value')).toBe(true)
  })

  it('una palabra que empieza como artículo sigue completando normal', () => {
    expect(nlu.complete('agrega una late', 15, QUOTE_CTX).items.some((i) => i.kind === 'typology')).toBe(true)
  })
})

describe('la vista previa de un conjunto dice lo que hará (7 idiomas)', () => {
  it.each(LOCALES)('%s: 2 y 3 ventanas unidas son un conjunto, no copias', (locale) => {
    const n = makeNlu(locale)
    const surface = conceptSurface('asm.coupled', locale)!
    for (const [count, preset] of [[2, 'coupled_2'], [3, 'coupled_3']] as const) {
      const text = locale === 'tr' ? `${count} ${surface} 1000x1400 ekle` : `${nluMessages[locale].say.item_add}${count} ${surface} 1000x1400`
      const r = n.parse(text, QUOTE_CTX)
      const call = r.plan?.find((c) => c.tool === 'add_assembly')
      expect(call?.args, text).toMatchObject({ preset })
      expect((call?.args as { qty?: number }).qty, text).toBeUndefined()
      expect(r.interpretation, text).toContain(assemblyLabel(preset, locale))
    }
  })

  it('«dos ventanas unidas» en palabras muestra lo mismo que el plan', () => {
    const r = nlu.parse('agrega dos ventanas unidas', QUOTE_CTX)
    expect(r.interpretation).toBe(`Entendí: Agregar ${assemblyLabel('coupled_2', 'es')}`)
    expect(r.interpretation).not.toContain('unidades')
    expect(r.plan?.[0]?.args).not.toHaveProperty('qty')
  })

  it('más de 3 no se disfrazan de copias: lo dice', () => {
    const r = nlu.parse('agrega cuatro ventanas unidas', QUOTE_CTX)
    expect(r.plan ?? []).toEqual([])
    expect(JSON.stringify(r)).toContain('2 o 3 ventanas unidas')
  })

  it('las copias de un conjunto sí se muestran como copias', () => {
    const r = nlu.parse('agrega 2 bay windows de 800 por 1400', QUOTE_CTX)
    expect(r.plan?.[0]).toMatchObject({ tool: 'add_assembly', args: { preset: 'bay', qty: 2 } })
    expect(r.interpretation).toContain('2 unidades')
  })
})
