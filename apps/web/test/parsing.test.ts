import { describe, expect, it } from 'vitest'
import { parseMeasure, parseSize } from '../src/ui/NumberField'
import { parseCLP } from '../src/ui/MoneyField'
import { formatShortcut, matchesShortcut, parseShortcut } from '../src/lib/useShortcut'

describe('parseMeasure', () => {
  it('entiende cómo escribe un maestro las medidas', () => {
    expect(parseMeasure('1200')).toBe(1200)
    expect(parseMeasure('1.200')).toBe(1200)
    expect(parseMeasure('1 200')).toBe(1200)
    expect(parseMeasure('1200,5')).toBe(1200.5)
    expect(parseMeasure('1.249,5')).toBe(1249.5)
    expect(parseMeasure('1200 mm')).toBe(1200)
    expect(parseMeasure('120 cm')).toBe(1200)
    expect(parseMeasure('1,2 m')).toBe(1200)
  })

  it('devuelve null si no es una medida', () => {
    expect(parseMeasure('')).toBeNull()
    expect(parseMeasure('abc')).toBeNull()
    expect(parseMeasure('12,5,3')).toBeNull()
  })
})

describe('parseSize', () => {
  it('acepta ancho x alto en una sola escritura', () => {
    expect(parseSize('1200x1500')).toEqual({ width: 1200, height: 1500 })
    expect(parseSize('1200 × 1500')).toEqual({ width: 1200, height: 1500 })
    expect(parseSize('1.800 X 1.300')).toEqual({ width: 1800, height: 1300 })
    expect(parseSize('120 x 150 cm')).toEqual({ width: 1200, height: 1500 })
    expect(parseSize('1200*900')).toEqual({ width: 1200, height: 900 })
  })

  it('ignora lo que no son dos medidas', () => {
    expect(parseSize('1200')).toBeNull()
    expect(parseSize('1200x')).toBeNull()
    expect(parseSize('1x2x3')).toBeNull()
  })
})

describe('parseCLP', () => {
  it('lee montos con o sin separadores', () => {
    expect(parseCLP('$ 1.234.567')).toBe(1234567)
    expect(parseCLP('12000')).toBe(12000)
    expect(parseCLP('')).toBeNull()
    expect(parseCLP('-5.000')).toBe(-5000)
  })
})

describe('atajos', () => {
  it('interpreta combinaciones', () => {
    expect(parseShortcut('shift+mod+z')).toEqual({ key: 'z', mod: true, shift: true, alt: false })
    expect(parseShortcut('esc').key).toBe('escape')
  })

  it('muestra teclas según la plataforma', () => {
    expect(formatShortcut('mod+k', true)).toEqual(['⌘', 'K'])
    expect(formatShortcut('mod+k', false)).toEqual(['Ctrl', 'K'])
    expect(formatShortcut('delete', false)).toEqual(['Supr'])
  })

  it('reconoce el evento correcto', () => {
    const ctrlK = new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true })
    expect(matchesShortcut(ctrlK, parseShortcut('mod+k'), false)).toBe(true)
    expect(matchesShortcut(ctrlK, parseShortcut('mod+k'), true)).toBe(false)
    const a = new KeyboardEvent('keydown', { key: 'a', code: 'KeyA' })
    expect(matchesShortcut(a, parseShortcut('a'), false)).toBe(true)
    expect(matchesShortcut(a, parseShortcut('mod+a'), false)).toBe(false)
    const question = new KeyboardEvent('keydown', { key: '?', code: 'Slash', shiftKey: true })
    expect(matchesShortcut(question, parseShortcut('?'), false)).toBe(true)
    // «[» con AltGr en teclado latinoamericano (Windows lo reporta como Ctrl+Alt).
    const bracket = new KeyboardEvent('keydown', { key: '[', code: 'Quote', ctrlKey: true, altKey: true })
    expect(matchesShortcut(bracket, parseShortcut('['), false)).toBe(true)
    expect(matchesShortcut(bracket, parseShortcut('mod+k'), false)).toBe(false)
  })
})
