/**
 * Corpus de aceptación (investigación 24 §9): las 25 intenciones en 7 idiomas producen el mismo plan
 * canónico, más los casos de borde con medidas escritas en palabras y la exportación a PDF.
 */
import { describe, expect, it } from 'vitest'
import { formatMoney } from '../../src/i18n/format'
import { LOCALES, type Locale } from '../../src/i18n/locales'
import type { NluCommandId, NluParseResult } from '../../src/nlu'
import { BOUNDARY, CORPUS, type CorpusIntent } from './corpus'
import { makeNlu, OCTOBER_SALES, QUOTE_CTX } from './fixtures'

interface Expectation {
  command: NluCommandId
  /** Llamadas esperadas (los argumentos se comparan como subconjunto). */
  calls?: [string, Record<string, unknown>][]
  status?: 'ready' | 'answer'
  check?: (r: NluParseResult, locale: Locale) => void
}

const EXPECTED: Record<CorpusIntent, Expectation> = {
  'quote.create': { command: 'quote.create', calls: [['create_quote', { title: 'Casa Sur' }]] },
  'item.add': { command: 'item.add', calls: [['add_window', { typology: 'sliding_2', width: 1500, height: 1200, qty: 3, colorId: 'col-white', glassId: 'gl-dvh' }]] },
  'items.set_color': { command: 'item.bulk', calls: [['update_window', { all: true, colorId: 'col-anthracite' }]] },
  'quote.discount': { command: 'quote.discount', calls: [['set_discount', { percent: 10 }]] },
  'quote.margin': { command: 'quote.margin', calls: [['set_margin', { percent: 30, mode: 'margin' }]] },
  'item.duplicate': { command: 'item.duplicate', calls: [['duplicate_window', { ref: 'V2' }]] },
  'item.remove': { command: 'item.remove', calls: [['remove_window', { ref: 'V3' }]] },
  'quote.rename': { command: 'quote.rename', calls: [['set_title', { quoteId: 'q123', title: 'Casa Sur etapa 2' }]] },
  'quote.assign_client': { command: 'quote.assign_client', calls: [['set_client', { clientId: 'cl-maria', name: 'María Soto' }]] },
  'client.create': { command: 'client.create', calls: [['create_client', { name: 'María Soto', phone: '+56 9 0000 0000', email: 'maria.soto@example.com' }]] },
  'client.search': { command: 'client.search', calls: [['search', { query: 'María Soto', kind: 'clients' }]] },
  'quote.open': { command: 'quote.open', calls: [['open_quote', { quoteId: 'q123' }]] },
  'quote.send': { command: 'quote.send', calls: [['send_quote', { quoteId: 'q123', channel: 'email' }]] },
  'quote.download_pdf': { command: 'quote.pdf', calls: [['download_pdf', { quoteId: 'q123' }]] },
  'quote.set_template': { command: 'quote.template', calls: [['set_quote_template', { templateId: 'tpl-moderna' }]] },
  navigate: { command: 'nav.go', calls: [['navigate', { to: 'catalog' }]] },
  'stats.sales': {
    command: 'stats.sales',
    status: 'answer',
    check: (r, locale) => expect(r.reply).toContain(formatMoney(OCTOBER_SALES, { currency: 'CLP', locale })),
  },
  'history.undo': { command: 'history.undo', calls: [['undo', {}]] },
  'memory.remember': {
    command: 'memory.remember',
    calls: [['remember', {}]],
    check: (r) => {
      const content = String((r.plan![0].args as { content: string }).content)
      expect(content).toMatch(/9/)
      expect(content).toMatch(/18/)
      expect(content.length).toBeGreaterThan(20)
    },
  },
  'preferences.language': { command: 'settings.ui_locale', calls: [['set_ui_locale', { locale: 'en' }]] },
  help: { command: 'help', status: 'answer', check: (r) => expect(r.reply!.length).toBeGreaterThan(80) },
  'item.set_profile': { command: 'item.update', calls: [['update_window', { ref: 'V2', lineId: 'ln-softline', line: 'SOFTLINE 70' }]] },
  'item.set_glass': { command: 'item.update', calls: [['update_window', { ref: 'V2', glassId: 'gl-dvh-lowe' }]] },
  'item.set_quantity': { command: 'item.update', calls: [['update_window', { ref: 'V2', qty: 5 }]] },
  'quote.print': { command: 'quote.print', calls: [['download_pdf', { quoteId: 'q123', print: true }]] },
}

function expectPlan(r: NluParseResult, exp: Expectation, locale: Locale): void {
  expect(r.command).toBe(exp.command)
  expect(r.status).toBe(exp.status ?? 'ready')
  if (exp.calls) {
    expect(r.plan).not.toBeNull()
    expect(r.plan!.map((c) => c.tool)).toEqual(exp.calls.map((c) => c[0]))
    exp.calls.forEach(([, args], i) => expect(r.plan![i].args).toMatchObject(args))
    for (const call of r.plan!) expect(call.id).toMatch(/^nlu_/)
  }
  if (exp.status === 'answer') expect(r.plan).toEqual([])
  // Nada con significado se ignoró y hay una interpretación visible.
  expect(r.ignored).toEqual([])
  expect(r.interpretation.length).toBeGreaterThan(0)
  expect(r.confidence).toBeGreaterThanOrEqual(0.7)
  exp.check?.(r, locale)
}

describe('corpus de 175 ejemplos (25 intenciones × 7 idiomas)', () => {
  for (const locale of LOCALES) {
    describe(locale, () => {
      const nlu = makeNlu(locale)
      for (const [intent, text] of CORPUS[locale]) {
        it(`${intent}: ${text}`, () => {
          expectPlan(nlu.parse(text, QUOTE_CTX), EXPECTED[intent], locale)
        })
      }
    })
  }

  it('el corpus está completo: 25 intenciones alineadas en cada idioma', () => {
    for (const locale of LOCALES) {
      expect(CORPUS[locale]).toHaveLength(25)
      expect(CORPUS[locale].map(([intent]) => intent)).toEqual(CORPUS.es.map(([intent]) => intent))
    }
  })

  it('detecta el idioma de cada frase aunque la interfaz esté en español', () => {
    const nlu = makeNlu('es')
    let detected = 0
    for (const locale of LOCALES) {
      for (const [, text] of CORPUS[locale]) if (nlu.parse(text, QUOTE_CTX).language === locale) detected++
    }
    expect(detected / (LOCALES.length * 25)).toBeGreaterThan(0.9)
  })

  it('los 175 se entienden también con la interfaz en otro idioma (el idioma de la UI solo desempata)', () => {
    const nlu = makeNlu('de')
    for (const locale of LOCALES) {
      for (const [intent, text] of CORPUS[locale]) {
        const r = nlu.parse(text, QUOTE_CTX)
        expect(r.command, `${locale}: ${text}`).toBe(EXPECTED[intent].command)
      }
    }
  })
})

describe('casos de borde (§9.8)', () => {
  for (const [locale, words, exportText] of BOUNDARY) {
    it(`${locale}: medidas en palabras → fijo 1500 × 1200 mm`, () => {
      const r = makeNlu(locale).parse(words, QUOTE_CTX)
      expect(r.status).toBe('ready')
      expect(r.plan![0]).toMatchObject({ tool: 'add_window', args: { typology: 'fixed', width: 1500, height: 1200 } })
    })
    it(`${locale}: ${exportText}`, () => {
      const r = makeNlu(locale).parse(exportText, QUOTE_CTX)
      expect(r.status).toBe('ready')
      expect(r.command).toBe('quote.pdf')
      expect(r.plan![0]).toMatchObject({ tool: 'download_pdf', args: { quoteId: 'q123', number: 123 } })
    })
  }
})
