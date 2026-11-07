/**
 * Entrada hostil: textos largos (1200+), unicode raro, controles bidi, marcas combinantes, emojis,
 * comillas sin cerrar y patrones patológicos no cuelgan ni lanzan. Generador con semilla fija.
 */
import { describe, expect, it } from 'vitest'
import { LOCALES } from '../../src/i18n/locales'
import { makeNlu, QUOTE_CTX } from './fixtures'

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const POOL = [
  ...'abcdefghijklmnopqrstuvwxyzáéíóúñüçğışöÇĞİŞÖÜßæœ',
  ...'ABCXYZÑÜİI0123456789',
  ' ', ' ', ' ', '\n', '\t', ' ', ' ',
  ...'.,;:!?¿¡"\'«»“”„‹›()[]{}#%+-*/×x$€@_',
  '‮', '‭', '⁦', '⁧', '⁩', '​', '‍', '﻿',
  '́', '̈', '̧',
  '😀', '🪟', '👨‍👩‍👧', '\ud83d',
  '﷽', 'ﬃ', '①', '㎜',
]
const WORDS = ['agrega', 'corredera', 'V2', 'mil', 'quinientos', 'por', 'x', '1500', 'nogal', 'descuento', '%', '"', 'Marco', 'recuerda', 'que', 'y', 'todas', 'İÇ', 'DIŞ', 'eintausendfünfhundert', 'quatre-vingt', '#123', '4/16/4', '+56 9 1234 5678', 'a@b.cl']

describe('fuzz', () => {
  it('textos aleatorios con caracteres raros (parse y complete en todo cursor)', () => {
    const random = rng(20261101)
    for (const locale of LOCALES) {
      const nlu = makeNlu(locale)
      for (let n = 0; n < 60; n++) {
        const len = Math.floor(random() * 220)
        let text = ''
        for (let i = 0; i < len; i++) text += random() < 0.7 ? POOL[Math.floor(random() * POOL.length)] : ` ${WORDS[Math.floor(random() * WORDS.length)]} `
        const t = performance.now()
        expect(() => nlu.parse(text, QUOTE_CTX)).not.toThrow()
        for (let c = 0; c <= text.length; c += 17) expect(() => nlu.complete(text, c, QUOTE_CTX)).not.toThrow()
        expect(performance.now() - t).toBeLessThan(1500)
      }
    }
    // 7 idiomas × 60 textos de hasta 220 caracteres: holgado también con la máquina cargada (CI en paralelo).
  }, 60_000)

  it('patrones patológicos acotados en tiempo', () => {
    const nlu = makeNlu('es')
    const cases = [
      '1x'.repeat(600),
      'mil '.repeat(300),
      'a.'.repeat(600),
      '"'.repeat(1300),
      '«'.repeat(700) + '»',
      'V1 a V999 '.repeat(100),
      'agrega una corredera y '.repeat(60),
      '+5'.repeat(500),
      '#1'.repeat(600),
      'a@'.repeat(600),
      '4/16/4 '.repeat(170),
      'ein'.repeat(400),
      'quatre-vingt-'.repeat(90),
      `${'x'.repeat(1199)}y`,
      '‮'.repeat(1200),
      'ı'.repeat(1300),
      'recuerda que '.repeat(100),
      '¿'.repeat(1200),
    ]
    for (const text of cases) {
      // La mejor de 3: un cuelgue falla siempre; una pausa del sistema con la suite en paralelo, no.
      let best = Infinity
      for (let round = 0; round < 3 && best >= 250; round++) {
        const t = performance.now()
        const r = nlu.parse(text, QUOTE_CTX)
        nlu.complete(text, text.length, QUOTE_CTX)
        nlu.complete(text, Math.floor(text.length / 2), QUOTE_CTX)
        best = Math.min(best, performance.now() - t)
        expect(['ready', 'incomplete', 'ambiguous', 'invalid', 'answer', 'unmatched']).toContain(r.status)
      }
      expect(best, text.slice(0, 20)).toBeLessThan(250)
    }
  })

  it('tipos inesperados desde JavaScript no lanzan', () => {
    const nlu = makeNlu('es')
    expect(nlu.parse(undefined as unknown as string).status).toBe('unmatched')
    expect(nlu.parse(42 as unknown as string).status).toBe('unmatched')
    expect(Array.isArray(nlu.complete(null as unknown as string).items)).toBe(true)
    expect(() => nlu.parse('agrega una corredera', { now: 'no-es-fecha', items: [] })).not.toThrow()
    expect(() => nlu.parse('¿cuánto vendí este mes?', { stats: { quotes: [{ id: 'x', status: 'accepted', createdAt: 'mal', acceptedAt: 'mal', total: Number.NaN }] } })).not.toThrow()
  })
})
