import { formatArea as engineArea, formatCLP, formatMM, formatPct as enginePct, formatSize as engineSize } from '@dekopen/engine'
import { afterEach, describe, expect, it } from 'vitest'
import {
  acceptLanguage,
  compileMessage,
  createFormatter,
  createTranslator,
  defineDictionary,
  diffTranslation,
  formatArea,
  formatDate,
  formatDocNumber,
  formatList,
  formatMessage,
  formatMeters,
  formatMm,
  formatMoney,
  formatNumber,
  formatPct,
  formatRelative,
  formatSize,
  formatTime,
  intlTag,
  isLocale,
  LOCALE_META,
  LOCALES,
  matchLocale,
  MessageSyntaxError,
  messageKeys,
  messageParams,
  pluralCategory,
  setI18nIssueHandler,
  translate,
  type I18nIssue,
  type Translation,
} from '../src'

const NBSP = ' '
const NNBSP = ' '

afterEach(() => setI18nIssueHandler(null))

function collectIssues(): I18nIssue[] {
  const issues: I18nIssue[] = []
  setI18nIssueHandler((issue) => issues.push(issue))
  return issues
}

describe('idiomas', () => {
  it('define los 7 idiomas con etiqueta Intl, nombre nativo y moneda sugerida', () => {
    expect(LOCALES).toEqual(['es', 'en', 'pt', 'fr', 'de', 'it', 'tr'])
    expect(LOCALES.map((l) => LOCALE_META[l].intl)).toEqual(['es-CL', 'en-US', 'pt-BR', 'fr-FR', 'de-DE', 'it-IT', 'tr-TR'])
    expect(LOCALE_META.tr.label).toBe('Türkçe')
    expect(LOCALE_META.es.currency).toBe('CLP')
    expect(isLocale('pt')).toBe(true)
    expect(isLocale('pt-BR')).toBe(false)
    expect(intlTag('xx')).toBe('es-CL')
  })

  it('elige el idioma desde Accept-Language respetando q y orden', () => {
    expect(matchLocale('en-US,en;q=0.9,es;q=0.8')).toBe('en')
    expect(matchLocale('de;q=0.5, fr;q=0.8')).toBe('fr')
    expect(matchLocale('fr;q=0, de')).toBe('de')
    expect(matchLocale('ja,zh-CN;q=0.9,tr;q=0.4')).toBe('tr')
    expect(matchLocale('es-419,es;q=0.9')).toBe('es')
  })

  it('acepta etiquetas sueltas, listas del navegador y cae al español', () => {
    expect(matchLocale('pt-BR')).toBe('pt')
    expect(matchLocale('PT_br')).toBe('pt')
    expect(matchLocale('pt-PT')).toBe('pt')
    expect(matchLocale(['it-IT', 'en'])).toBe('it')
    expect(matchLocale('ja,zh;q=0.9')).toBe('es')
    expect(matchLocale('ja', 'en')).toBe('en')
    expect(matchLocale('*')).toBe('es')
    expect(matchLocale('')).toBe('es')
    expect(matchLocale(null)).toBe('es')
    expect(matchLocale('en;q=abc')).toBe('es')
  })

  it('arma Accept-Language para pedir respuestas en el idioma', () => {
    expect(acceptLanguage('en')).toBe('en-US,en;q=0.9')
    expect(acceptLanguage('es')).toBe('es-CL,es;q=0.9')
    expect(matchLocale(acceptLanguage('tr'))).toBe('tr')
  })
})

describe('mensajes ICU-lite', () => {
  it('deja intacto un texto sin llaves (español byte a byte)', () => {
    const text = `Medida «1.200 × 1.500 mm» · −$12.000${NBSP}… 35 % # l'ouvrant`
    expect(formatMessage(text)).toBe(text)
  })

  it('interpola parámetros; los números van sin formato', () => {
    expect(formatMessage('Hola, {name}. Tienes {n} cotizaciones.', { name: 'Ana', n: 1500 })).toBe('Hola, Ana. Tienes 1500 cotizaciones.')
    expect(formatMessage('{a}{b}', { a: '', b: null })).toBe('')
  })

  it('plural en español: one/other, casos exactos y # con formato del idioma', () => {
    const msg = '{count, plural, =0 {Sin ítems} one {# ítem} other {# ítems}}'
    expect(formatMessage(msg, { count: 0 }, 'es')).toBe('Sin ítems')
    expect(formatMessage(msg, { count: 1 }, 'es')).toBe('1 ítem')
    expect(formatMessage(msg, { count: 2 }, 'es')).toBe('2 ítems')
    expect(formatMessage(msg, { count: 1500 }, 'es')).toBe('1.500 ítems')
    expect(formatMessage(msg, { count: 1500 }, 'en')).toBe('1,500 ítems')
    // 1.000.000 es «many» en CLDR para es: sin ese caso, cae a «other».
    expect(pluralCategory(1_000_000, 'es')).toBe('many')
    expect(formatMessage(msg, { count: 1_000_000 }, 'es')).toBe('1.000.000 ítems')
  })

  it('plural en francés: 0 y 1 son singulares', () => {
    const msg = '{count, plural, one {# fenêtre} other {# fenêtres}}'
    expect(formatMessage(msg, { count: 0 }, 'fr')).toBe('0 fenêtre')
    expect(formatMessage(msg, { count: 1 }, 'fr')).toBe('1 fenêtre')
    expect(formatMessage(msg, { count: 2 }, 'fr')).toBe('2 fenêtres')
    expect(pluralCategory(1.5, 'fr')).toBe('one')
  })

  it('plural en portugués de Brasil, alemán, italiano y turco', () => {
    expect(pluralCategory(0, 'pt')).toBe('one')
    expect(pluralCategory(0, 'de')).toBe('other')
    expect(pluralCategory(1, 'de')).toBe('one')
    expect(pluralCategory(1, 'it')).toBe('one')
    expect(pluralCategory(1, 'tr')).toBe('one')
    expect(pluralCategory(2, 'tr')).toBe('other')
    const tr = '{count, plural, one {# kanat} other {# kanat}}'
    expect(formatMessage(tr, { count: 3 }, 'tr')).toBe('3 kanat')
  })

  it('ordinales, offset y número como texto', () => {
    const ord = '{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}'
    expect([1, 2, 3, 4, 11, 21, 22, 103].map((n) => formatMessage(ord, { n }, 'en'))).toEqual(['1st', '2nd', '3rd', '4th', '11th', '21st', '22nd', '103rd'])
    const others = '{count, plural, offset:1 =0 {Nadie} =1 {Solo {name}} one {{name} y # persona más} other {{name} y # personas más}}'
    expect(formatMessage(others, { count: 1, name: 'Ana' })).toBe('Solo Ana')
    expect(formatMessage(others, { count: 2, name: 'Ana' })).toBe('Ana y 1 persona más')
    expect(formatMessage(others, { count: 4, name: 'Ana' })).toBe('Ana y 3 personas más')
    expect(formatMessage('{n, plural, one {#} other {#}}', { n: '3' })).toBe('3')
  })

  it('select con argumentos anidados y # del plural que lo contiene', () => {
    const msg = '{n, plural, one {{kind, select, door {# puerta} other {# ventana}}} other {{kind, select, door {# puertas} other {# ventanas}}}}'
    expect(formatMessage(msg, { n: 1, kind: 'door' })).toBe('1 puerta')
    expect(formatMessage(msg, { n: 3, kind: 'window' })).toBe('3 ventanas')
    expect(formatMessage('{x, select, a {A} other {Otro}}', {})).toBe('Otro')
  })

  it('el apóstrofo es literal (francés, italiano)', () => {
    expect(formatMessage("L'ouvrant {name} n'a pas de prix", { name: 'A1' }, 'fr')).toBe("L'ouvrant A1 n'a pas de prix")
  })

  it('un mensaje mal formado no rompe: se informa y se devuelve tal cual', () => {
    const issues = collectIssues()
    expect(formatMessage('Hola {name', { name: 'x' })).toBe('Hola {name')
    expect(formatMessage('{n, plural, one {x}}', { n: 1 })).toBe('{n, plural, one {x}}')
    expect(issues.map((i) => i.kind)).toEqual(['syntax', 'syntax'])
    expect(() => compileMessage('{n, number}')).toThrow(MessageSyntaxError)
    expect(() => compileMessage('{a} cierre }')).toThrow(MessageSyntaxError)
    // Sin «{» no hay nada que interpretar: una llave de cierre suelta queda literal.
    expect(compileMessage('cierre }')).toEqual([{ t: 'text', v: 'cierre }' }])
  })

  it('avisa los parámetros que faltan', () => {
    const issues = collectIssues()
    expect(formatMessage('Hola {name}', {})).toBe('Hola ')
    expect(issues).toEqual([{ kind: 'param', key: undefined, locale: 'es', param: 'name' }])
  })

  it('lista los parámetros de un mensaje', () => {
    expect(messageParams('{a} {n, plural, one {{b}} other {#}} {k, select, x {{c}} other {}}').sort()).toEqual(['a', 'b', 'c', 'k', 'n'])
  })
})

describe('traductor', () => {
  const es = {
    save: 'Guardar',
    items: { count: '{count, plural, one {# ítem} other {# ítems}}', title: 'Ítems de {name}' },
    onlySpanish: 'Solo en español',
  } as const
  const dict = defineDictionary({
    es,
    en: { save: 'Save', items: { count: '{count, plural, one {# item} other {# items}}', title: 'Items of {name}' } } as unknown as Translation<typeof es>,
    pt: { save: 'Salvar', items: { count: '{count, plural, one {# item} other {# itens}}', title: 'Itens de {name}' }, onlySpanish: 'Só' },
    fr: { save: 'Enregistrer', items: { count: '{count, plural, one {# article} other {# articles}}', title: 'Articles de {name}' }, onlySpanish: 'Seul' },
    de: { save: 'Speichern', items: { count: '{count, plural, one {# Position} other {# Positionen}}', title: 'Positionen von {name}' }, onlySpanish: 'Nur' },
    it: { save: 'Salva', items: { count: '{count, plural, one {# voce} other {# voci}}', title: 'Voci di {name}' }, onlySpanish: 'Solo' },
    tr: { save: 'Kaydet', items: { count: '{count, plural, one {# kalem} other {# kalem}}', title: '{name} kalemleri' }, onlySpanish: 'Yalnız' },
  })

  it('traduce por clave con puntos, con parámetros y plural del idioma', () => {
    expect(translate(dict, 'save')).toBe('Guardar')
    expect(translate(dict, 'save', undefined, 'de')).toBe('Speichern')
    expect(translate(dict, 'items.count', { count: 0 }, 'fr')).toBe('0 article')
    expect(translate(dict, 'items.title', { name: 'Casa Sur' }, 'tr')).toBe('Casa Sur kalemleri')
  })

  it('cae al español por clave, con reglas de plural del español, y lo informa', () => {
    const issues = collectIssues()
    expect(translate(dict, 'onlySpanish', undefined, 'en')).toBe('Solo en español')
    expect(issues).toEqual([{ kind: 'missing', key: 'onlySpanish', locale: 'en' }])
  })

  it('una clave inexistente devuelve la clave', () => {
    const issues = collectIssues()
    expect(translate(dict, 'nope' as never, undefined, 'en')).toBe('nope')
    expect(issues.at(-1)).toMatchObject({ kind: 'missing', key: 'nope' })
  })

  it('crea traductores ligados a un idioma', () => {
    const t = createTranslator(dict, 'it')
    expect(t.locale).toBe('it')
    expect(t('save')).toBe('Salva')
    expect(t.has('items.count')).toBe(true)
    expect(t.has('items')).toBe(false)
    expect(t.has('nope')).toBe(false)
  })

  it('compara traducciones con el español', () => {
    expect(messageKeys(es)).toEqual(['save', 'items.count', 'items.title', 'onlySpanish'])
    expect(diffTranslation(es, dict.en as never)).toEqual({ missing: ['onlySpanish'], extra: [] })
    expect(diffTranslation(es, { ...es, extra: 'x' })).toEqual({ missing: [], extra: ['extra'] })
  })
})

describe('formatos por idioma', () => {
  it('dinero en español es idéntico al motor (CLP)', () => {
    for (const v of [0, 1234567, -12000, 999.5, 1e9]) expect(formatMoney(v)).toBe(formatCLP(v))
    expect(formatMoney(12000, { sign: 'always' })).toBe('+$12.000')
    expect(formatMoney(0, { sign: 'always' })).toBe('$0')
    expect(formatMoney(Number.NaN)).toBe('$0')
  })

  it('dinero con la moneda de la empresa y los decimales de la moneda', () => {
    expect(formatMoney(1234.5, { currency: 'USD', locale: 'en' })).toBe('$1,234.50')
    expect(formatMoney(-1234.5, { currency: 'USD', locale: 'en' })).toBe('−$1,234.50')
    expect(formatMoney(1234.5, { currency: 'EUR', locale: 'de' })).toBe(`1.234,50${NBSP}€`)
    expect(formatMoney(1234.5, { currency: 'EUR', locale: 'fr' })).toBe(`1${NNBSP}234,50${NBSP}€`)
    expect(formatMoney(1234.5, { currency: 'EUR', locale: 'it' })).toBe(`1234,50${NBSP}€`)
    expect(formatMoney(1234.5, { currency: 'BRL', locale: 'pt' })).toBe(`R$${NBSP}1.234,50`)
    expect(formatMoney(1234.5, { currency: 'TRY', locale: 'tr' })).toBe('₺1.234,50')
    expect(formatMoney(1234567, { currency: 'CLP', locale: 'en' })).toBe(`CLP${NBSP}1,234,567`)
    expect(formatMoney(10, { currency: 'eur', locale: 'de', sign: 'always' })).toBe(`+10,00${NBSP}€`)
    expect(formatMoney(1234.5, { currency: 'USD', locale: 'en', fractionDigits: 0 })).toBe('$1,235')
  })

  it('una moneda inválida no rompe', () => {
    expect(formatMoney(1234.5, { currency: 'NOPE', locale: 'en' })).toBe('1,234.50 NOPE')
  })

  it('números con separadores del idioma y signo menos tipográfico', () => {
    expect(formatNumber(1249.5, { maxDecimals: 1 })).toBe('1.249,5')
    expect(formatNumber(1249.5, { locale: 'en', maxDecimals: 1 })).toBe('1,249.5')
    expect(formatNumber(1249.5, { locale: 'fr', maxDecimals: 1 })).toBe(`1${NNBSP}249,5`)
    expect(formatNumber(1500, { locale: 'it' })).toBe('1500')
    expect(formatNumber(-3.25, { locale: 'de', maxDecimals: 2 })).toBe('−3,25')
    expect(formatNumber(-0.001, { locale: 'en', maxDecimals: 1 })).toBe('0')
    expect(formatNumber(2, { maxDecimals: 2, minDecimals: 2 })).toBe('2,00')
  })

  it('medidas: en español idénticas al motor; en otros idiomas con su formato', () => {
    expect(formatMm(1200)).toBe(formatMM(1200))
    expect(formatMm(554.5, { unit: true })).toBe('554,5 mm')
    expect(formatSize(1500, 1200)).toBe(engineSize(1500, 1200))
    expect(formatSize(1500, 1200)).toBe('1.500 × 1.200 mm')
    expect(formatSize(1500, 1200, { locale: 'en' })).toBe('1,500 × 1,200 mm')
    expect(formatSize(1500, 1200, { locale: 'de' })).toBe('1.500 × 1.200 mm')
    expect(formatSize(1500, 1200, { locale: 'fr' })).toBe(`1${NNBSP}500 × 1${NNBSP}200 mm`)
    expect(formatSize(1500, 1200, { locale: 'it' })).toBe('1500 × 1200 mm')
    expect(formatSize(1249.55, 600, { locale: 'en' })).toBe('1,249.6 × 600 mm')
  })

  it('superficie, metros y porcentajes', () => {
    expect(formatArea(1.95)).toBe(engineArea(1.95))
    expect(formatArea(1.95, { locale: 'en' })).toBe('1.95 m²')
    expect(formatMeters(4392)).toBe('4,39 m')
    expect(formatMeters(4392, { locale: 'en' })).toBe('4.39 m')
    expect(formatPct(35)).toBe(enginePct(35))
    expect(formatPct(97.25)).toBe('97,3 %')
    expect(formatPct(35, { locale: 'en' })).toBe('35%')
    expect(formatPct(35, { locale: 'tr' })).toBe('%35')
    expect(formatPct(35, { locale: 'de' })).toBe(`35${NBSP}%`)
    expect(formatPct(35, { locale: 'fr' })).toBe(`35${NBSP}%`)
    expect(formatPct(-5, { locale: 'en' })).toBe('−5%')
  })

  it('fechas en la zona del negocio', () => {
    const d = '2026-10-04T15:00:00Z'
    expect(formatDate(d)).toBe('04-10-2026')
    expect(formatDate(d, { locale: 'en' })).toBe('10/04/2026')
    expect(formatDate(d, { locale: 'de' })).toBe('04.10.2026')
    expect(formatDate(d, { locale: 'fr' })).toBe('04/10/2026')
    expect(formatDate('2026-10-31T15:00:00Z', { style: 'long' })).toBe('31 de octubre de 2026')
    expect(formatDate('2026-10-31T15:00:00Z', { locale: 'en', style: 'long' })).toBe('October 31, 2026')
    expect(formatDate('2026-10-31T15:00:00Z', { locale: 'tr', style: 'long' })).toBe('31 Ekim 2026')
    expect(formatDate('2026-11-01T02:00:00Z')).toBe('31-10-2026')
    expect(formatDate('nope')).toBe('')
    expect(formatTime('2026-10-31T17:05:00Z')).toBe('14:05')
    expect(formatTime('2026-10-31T17:05:00Z', { locale: 'en' })).toMatch(/^2:05\sPM$/u)
    expect(formatTime('2026-10-31T17:05:00Z', { locale: 'de' })).toBe('14:05')
  })

  it('tiempo relativo: español con los textos de hoy; otros idiomas con Intl', () => {
    const now = new Date('2026-10-31T12:00:00Z')
    const rel = (iso: string, locale?: 'en' | 'de' | 'fr' | 'tr') => formatRelative(iso, { now, locale })
    expect(rel('2026-10-31T11:59:40Z')).toBe('hace un momento')
    expect(rel('2026-10-31T11:55:00Z')).toBe('hace 5 min')
    expect(rel('2026-10-31T09:00:00Z')).toBe('hace 3 h')
    expect(rel('2026-10-30T10:00:00Z')).toBe('ayer')
    expect(rel('2026-10-27T10:00:00Z')).toBe('hace 4 días')
    expect(rel('2026-10-01T10:00:00Z')).toBe('01-10-2026')
    expect(rel('2026-11-02T10:00:00Z')).toBe('02-11-2026')
    expect(rel('2026-10-31T11:59:40Z', 'en')).toBe('just now')
    expect(rel('2026-10-31T11:55:00Z', 'en')).toBe(new Intl.RelativeTimeFormat('en-US', { style: 'short' }).format(-5, 'minute'))
    expect(rel('2026-10-30T10:00:00Z', 'en')).toBe('yesterday')
    expect(rel('2026-10-30T10:00:00Z', 'de')).toBe('gestern')
    expect(rel('2026-10-27T10:00:00Z', 'en')).toBe('4 days ago')
    expect(rel('2026-10-27T10:00:00Z', 'fr')).toBe('il y a 4 jours')
    expect(rel('2026-10-01T10:00:00Z', 'tr')).toBe('01.10.2026')
  })

  it('listas y número de documento', () => {
    expect(formatList(['a', 'b', 'c'])).toBe('a, b y c')
    expect(formatList(['a', 'b', 'c'], { locale: 'en' })).toBe('a, b, and c')
    expect(formatList(['a', 'b'], { locale: 'de', type: 'disjunction' })).toBe('a oder b')
    expect(formatDocNumber(412)).toBe('N° 412')
    expect(formatDocNumber(412, { locale: 'de' })).toBe('Nr. 412')
    expect(formatDocNumber(412, { locale: 'en' })).toBe('No. 412')
  })

  it('formateador ligado a idioma, moneda y zona', () => {
    const f = createFormatter('de', { currency: 'eur' })
    expect(f.currency).toBe('EUR')
    expect(f.money(99)).toBe(`99,00${NBSP}€`)
    expect(f.money(99, { currency: 'CHF' })).toBe(`99,00${NBSP}CHF`)
    expect(f.size(1500, 1200)).toBe('1.500 × 1.200 mm')
    expect(f.date('2026-10-04T15:00:00Z')).toBe('04.10.2026')
    expect(f.docNumber(7)).toBe('Nr. 7')
    const es = createFormatter()
    expect(es.money(1234567)).toBe('$1.234.567')
    expect(es.relative('2026-10-30T10:00:00Z', new Date('2026-10-31T12:00:00Z'))).toBe('ayer')
  })
})
