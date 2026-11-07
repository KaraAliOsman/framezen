/**
 * Números escritos con palabras en 7 idiomas, cifras con coma o punto, unidades y la heurística de
 * medidas sin unidad (60×120 = cm; 1,5 × 1,2 = m) con su supuesto visible.
 */
import { describe, expect, it } from 'vitest'
import type { Locale } from '../../src/i18n/locales'
import { readWordNumber } from '../../src/nlu/numbers'
import { readNumeric, tokenize } from '../../src/nlu/text'
import { makeNlu, QUOTE_CTX } from './fixtures'

function words(text: string, locale: Locale): number | undefined {
  const tokens = tokenize(text)
  const r = readWordNumber(tokens, 0, [locale])
  return r && r.end === tokens.length ? r.value : undefined
}

const TABLE: Record<Locale, [string, number][]> = {
  es: [
    ['mil quinientos', 1500],
    ['cero', 0],
    ['veintiuno', 21],
    ['setenta y uno', 71],
    ['ochenta', 80],
    ['noventa y uno', 91],
    ['ciento uno', 101],
    ['novecientos noventa y nueve', 999],
    ['dos mil cien', 2100],
    ['doscientas', 200],
    ['uno coma cinco', 1.5],
  ],
  en: [
    ['one thousand five hundred', 1500],
    ['fifteen hundred', 1500],
    ['twenty-one', 21],
    ['seventy one', 71],
    ['eighty', 80],
    ['one hundred and one', 101],
    ['nine hundred ninety nine', 999],
    ['two thousand one hundred', 2100],
    ['one point zero five', 1.05],
    ['one point twenty five', 1.25],
  ],
  pt: [
    ['mil e quinhentos', 1500],
    ['mil quinhentos', 1500],
    ['vinte e um', 21],
    ['setenta e um', 71],
    ['oitenta', 80],
    ['cento e um', 101],
    ['novecentos e noventa e nove', 999],
    ['duas mil e cem', 2100],
    ['dezesseis', 16],
    ['um vírgula cinco', 1.5],
  ],
  fr: [
    ['mille cinq cents', 1500],
    ['vingt et un', 21],
    ['soixante et onze', 71],
    ['quatre-vingts', 80],
    ['quatre-vingt-onze', 91],
    ['cent un', 101],
    ['neuf cent quatre-vingt-dix-neuf', 999],
    ['deux mille cent', 2100],
    ['un virgule cinq', 1.5],
  ],
  de: [
    ['eintausendfünfhundert', 1500],
    ['tausendfünfhundert', 1500],
    ['fünfzehnhundert', 1500],
    ['einundzwanzig', 21],
    ['einundsiebzig', 71],
    ['achtzig', 80],
    ['hunderteins', 101],
    ['neunhundertneunundneunzig', 999],
    ['zweitausendeinhundert', 2100],
    ['dreißig', 30],
    ['dreissig', 30],
    ['eins komma fünf', 1.5],
  ],
  it: [
    ['millecinquecento', 1500],
    ['ventuno', 21],
    ['settantuno', 71],
    ['ottanta', 80],
    ['novantuno', 91],
    ['centouno', 101],
    ['novecentonovantanove', 999],
    ['duemilacento', 2100],
    ['centottanta', 180],
    ['uno virgola cinque', 1.5],
  ],
  tr: [
    ['bin beş yüz', 1500],
    ['yirmi bir', 21],
    ['yetmiş bir', 71],
    ['seksen', 80],
    ['doksan bir', 91],
    ['yüz bir', 101],
    ['dokuz yüz doksan dokuz', 999],
    ['iki bin yüz', 2100],
    ['bir virgül beş', 1.5],
  ],
}

describe('números con palabras', () => {
  for (const [locale, rows] of Object.entries(TABLE) as [Locale, [string, number][]][]) {
    it(locale, () => {
      for (const [text, value] of rows) expect(words(text, locale), text).toBeCloseTo(value, 6)
    })
  }

  it('nunca lee «cero cinco» como 5 ni una secuencia arbitraria de palabras numéricas', () => {
    expect(words('cero cinco', 'es')).toBeUndefined()
    expect(words('treinta dos', 'es')).toBeUndefined()
  })

  it('los artículos solos son débiles («una ventana» no es una cantidad fuerte)', () => {
    const tokens = tokenize('una ventana')
    expect(readWordNumber(tokens, 0, ['es'])?.weak).toBe(true)
  })
})

describe('cifras con separadores', () => {
  it('decimal con coma o punto, miles válidos y mixtos', () => {
    expect(readNumeric('1,5')!.value).toBe(1.5)
    expect(readNumeric('1.5')!.value).toBe(1.5)
    expect(readNumeric('1.234.567')!.value).toBe(1234567)
    expect(readNumeric('1.500,5')!.value).toBe(1500.5)
    expect(readNumeric('1,500.5')!.value).toBe(1500.5)
  })

  it('un solo separador con tres dígitos es ambiguo: miles salvo en metros', () => {
    expect(readNumeric('1.500')).toMatchObject({ value: 1500, ambiguous: true, alt: 1.5 })
    expect(readNumeric('1.500', true)).toMatchObject({ value: 1.5, ambiguous: true })
  })
})

describe('medidas en una orden', () => {
  const nlu = makeNlu('es')
  const add = (text: string) => {
    const r = nlu.parse(text, QUOTE_CTX)
    return { r, args: r.plan?.find((c) => c.tool === 'add_window')?.args as Record<string, unknown> | undefined }
  }

  it('sin unidad: < 10 metros, < 400 centímetros, desde 400 milímetros (supuesto visible + reparación)', () => {
    const cm = add('agrega una corredera de 60x120')
    expect(cm.args).toMatchObject({ width: 600, height: 1200 })
    expect(cm.r.assumptions.join(' ')).toMatch(/centímetros/)
    expect(cm.r.repairs.some((x) => x.text.includes('60x120 mm'))).toBe(true)

    const m = add('agrega un paño fijo de 1,5 por 1,2')
    expect(m.args).toMatchObject({ width: 1500, height: 1200 })
    expect(m.r.assumptions.join(' ')).toMatch(/metros/)

    const mm = add('agrega una corredera 1500x1200')
    expect(mm.args).toMatchObject({ width: 1500, height: 1200 })
    expect(mm.r.assumptions.join(' ')).not.toMatch(/metros/)
  })

  it('unidades explícitas por eje y compartidas, decimales con coma o punto', () => {
    expect(add('agrega una corredera de 1.5 m x 120 cm').args).toMatchObject({ width: 1500, height: 1200 })
    expect(add('agrega una corredera de 150 por 120 cm').args).toMatchObject({ width: 1500, height: 1200 })
    expect(add('agrega una corredera de 1,5x1,2 m').args).toMatchObject({ width: 1500, height: 1200 })
    expect(add('agrega una corredera de 1.800 × 1.300').args).toMatchObject({ width: 1800, height: 1300 })
    expect(add('agrega una corredera ancho 1500 alto 1200').args).toMatchObject({ width: 1500, height: 1200 })
    expect(makeNlu('en').parse('add a sliding window height 1200 width 1500 mm', QUOTE_CTX).plan![0].args).toMatchObject({ width: 1500, height: 1200 })
    expect(makeNlu('en').parse('add a sliding window 59 by 47 in', QUOTE_CTX).plan![0].args).toMatchObject({ width: 1498.6, height: 1193.8 })
  })

  it('separadores de cada idioma', () => {
    const cases: [Locale, string][] = [
      ['en', 'add a fixed window 1500 by 1200 mm'],
      ['pt', 'adicione uma janela fixa de 1500 por 1200 mm'],
      ['fr', 'ajoute une fenêtre fixe de 1500 par 1200 mm'],
      ['de', 'füge ein Festfenster 1500 mal 1200 mm hinzu'],
      ['it', 'aggiungi una finestra fissa 1500 per 1200 mm'],
      ['tr', '1500 çarpı 1200 mm sabit pencere ekle'],
    ]
    for (const [locale, text] of cases) expect(makeNlu(locale).parse(text, QUOTE_CTX).plan![0].args, text).toMatchObject({ typology: 'fixed', width: 1500, height: 1200 })
  })

  it('cantidad, hojas y referencia no se confunden', () => {
    expect(add('3 ventanas corredera 2 hojas 1500x1200 mm').args).toMatchObject({ qty: 3, typology: 'sliding_2' })
    expect(add('agrega una corredera de 3 hojas 2400x1200').args).toMatchObject({ typology: 'sliding_3' })
    expect(add('agrega una corredera 1500x1200 x4').args).toMatchObject({ qty: 4 })
  })

  it('cantidades contradictorias o un tercer número pegado no se ejecutan', () => {
    const conflict = nlu.parse('agrega 3 ventanas correderas 1500x1200 x4', QUOTE_CTX)
    expect(conflict.status).toBe('invalid')
    expect(conflict.plan).toBeNull()
    const third = nlu.parse('agrega una corredera de 1500x1200x3', QUOTE_CTX)
    expect(third.status).toBe('invalid')
    expect(third.reply).toMatch(/1500x1200 x3/)
  })

  it('medida a medio escribir: falta el alto (no va a la IA)', () => {
    const r = nlu.parse('agrega una corredera de 1500x', QUOTE_CTX)
    expect(r.status).toBe('incomplete')
    expect(r.missing[0].kind).toBe('height')
    expect(r.missing[0].prompt).toMatch(/1\.500 × ___ mm/)
  })

  it('recetas de vidrio, #123 y RAL no son medidas ni cantidades', () => {
    const r = nlu.parse('agrega una corredera 1500x1200 con DVH 4/16/4', QUOTE_CTX)
    expect(r.plan![0].args).toMatchObject({ width: 1500, height: 1200, glassId: 'gl-dvh-lowe' })
    expect(r.plan![0].args).not.toHaveProperty('qty', 4)
  })
})
