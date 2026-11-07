import { describe, expect, it } from 'vitest'
import { createContentFilter, stripProviderMarkup } from '../src/services/ai/sanitize'

const LEAK = '<ds_safety>[分类]其他\n[规则]无</ds_safety>Safe'

function stream(parts: string[]) {
  let out = ''
  const filter = createContentFilter((text) => (out += text))
  for (const part of parts) filter.push(part)
  filter.flush()
  return out
}

describe('marcas internas del modelo', () => {
  it('quita el bloque y su veredicto', () => {
    expect(stripProviderMarkup(LEAK)).toBe('')
    expect(stripProviderMarkup(`Listo, quedó la V2.${LEAK}`)).toBe('Listo, quedó la V2.')
  })

  it('no toca el texto normal', () => {
    expect(stripProviderMarkup('Ancho < 500 mm y alto > 300 mm')).toBe('Ancho < 500 mm y alto > 300 mm')
    expect(stream(['Ancho < ', '500 mm', ' y más'])).toBe('Ancho < 500 mm y más')
  })

  it('filtra aunque la marca llegue partida en trozos', () => {
    expect(stream(['Hola ', '<d', 's_saf', 'ety>[x]', '</ds_saf', 'ety>', 'Sa', 'fe'])).toBe('Hola ')
    expect(stream(['<ds_safety>x</ds_safety> Safe', ' Listo.'])).toBe('Listo.')
  })

  it('una marca sin cerrar no se muestra', () => {
    expect(stream(['Listo. <ds_safety>[x]'])).toBe('Listo. ')
  })
})
