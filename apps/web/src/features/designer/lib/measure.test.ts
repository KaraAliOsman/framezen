import { describe, expect, it } from 'vitest'
import { measureDraft, parseMeasureExpression, parseSizeExpression } from './measure'

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
