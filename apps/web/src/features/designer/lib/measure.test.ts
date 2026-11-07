import { describe, expect, it } from 'vitest'
import { measureDraft, parseMeasureExpression, parseSizeExpression, parseSizeLine, parseSizeList } from './measure'

describe('parseSizeLine', () => {
  it('entiende la cantidad escrita de varias formas', () => {
    expect(parseSizeLine('1500x1200')).toEqual({ width: 1500, height: 1200, qty: 1 })
    expect(parseSizeLine('1500x1200 x2')).toEqual({ width: 1500, height: 1200, qty: 2 })
    expect(parseSizeLine('1500 × 1200 × 3')).toEqual({ width: 1500, height: 1200, qty: 3 })
    expect(parseSizeLine('1500x1200 (4)')).toEqual({ width: 1500, height: 1200, qty: 4 })
    expect(parseSizeLine('1500x1200 2 un')).toEqual({ width: 1500, height: 1200, qty: 2 })
    expect(parseSizeLine('2 x 1500 x 1200')).toEqual({ width: 1500, height: 1200, qty: 2 })
  })
  it('no confunde la altura con una cantidad', () => {
    expect(parseSizeLine('900x800')).toEqual({ width: 900, height: 800, qty: 1 })
    expect(parseSizeLine('1500x120')).toEqual({ width: 1500, height: 120, qty: 1 })
  })
  it('acepta metros, centímetros, miles y columnas de planilla', () => {
    expect(parseSizeLine('1,50 x 1,20')).toEqual({ width: 1500, height: 1200, qty: 1 })
    expect(parseSizeLine('150 x 120 cm x 2')).toEqual({ width: 1500, height: 1200, qty: 2 })
    expect(parseSizeLine('1.500 x 1.200')).toEqual({ width: 1500, height: 1200, qty: 1 })
    expect(parseSizeLine('1500\t1200\t3')).toEqual({ width: 1500, height: 1200, qty: 3 })
  })
  it('lo que no se entiende queda en null', () => {
    expect(parseSizeLine('vitrina grande')).toBeNull()
    expect(parseSizeLine('1500')).toBeNull()
    expect(parseSizeLine('50x50')).toBeNull()
    expect(parseSizeLine('')).toBeNull()
  })
  it('la lista marca cada línea y se salta las vacías', () => {
    const rows = parseSizeList('1500x1200 x2\r\n\nno sé\n900x1100; 800x600')
    expect(rows.map((r) => r.size?.qty ?? null)).toEqual([2, null, 1, 1])
    expect(rows[1].text).toBe('no sé')
  })
})

describe('parseMeasureExpression', () => {
  it.each([
    ['1200', 1200],
    ['1.200', 1200],
    ['1 200', 1200],
    ['1200,5', 1200.5],
    ['1.249,5', 1249.5],
    ['1200 mm', 1200],
    ['120 cm', 1200],
    ['1,2 m', 1200],
  ])('lee la medida «%s» como %d mm', (text, mm) => {
    expect(parseMeasureExpression(text)).toBe(mm)
  })

  it.each([
    ['2400/2', 1200],
    ['2400 / 2', 1200],
    ['1200+50', 1250],
    ['1200 − 50', 1150],
    ['(2400-80)/2', 1160],
    ['=2400/2', 1200],
    ['1.200/2', 600],
    ['600*2', 1200],
    ['2400÷3', 800],
    ['-50+100', 50],
    ['1000/3', 333.3],
    ['120cm/2', 600],
  ])('resuelve la expresión «%s» = %d', (text, mm) => {
    expect(parseMeasureExpression(text)).toBe(mm)
  })

  it.each(['', '   ', 'abc', '1200x', '2400/0', '(1200', '1200)', '12..00', '++'])('devuelve null si no entiende «%s»', (text) => {
    expect(parseMeasureExpression(text)).toBeNull()
  })
})

describe('parseSizeExpression', () => {
  it.each([
    ['1500x1200', { width: 1500, height: 1200 }],
    ['1500 × 1200', { width: 1500, height: 1200 }],
    ['1.500 X 1.200', { width: 1500, height: 1200 }],
    ['2400/2 x 1200', { width: 1200, height: 1200 }],
    ['150 x 120 cm', { width: 1500, height: 1200 }],
    ['1,5 x 1,2 m', { width: 1500, height: 1200 }],
  ])('lee «%s»', (text, size) => {
    expect(parseSizeExpression(text)).toEqual(size)
  })

  it('devuelve null sin dos medidas', () => {
    expect(parseSizeExpression('1500')).toBeNull()
    expect(parseSizeExpression('1500x')).toBeNull()
    expect(parseSizeExpression('1x2x3')).toBeNull()
  })
})

describe('measureDraft', () => {
  it('escribe sin puntos de miles y con coma decimal', () => {
    expect(measureDraft(1200)).toBe('1200')
    expect(measureDraft(1200.5)).toBe('1200,5')
    expect(measureDraft(599.96)).toBe('600')
  })
})
