/** El documento muestra los colores conocidos del catálogo en su idioma; los propios, tal cual. */
import { describe, expect, it } from 'vitest'
import { itemColors } from '../src/templates/sections/item-parts'
import type { QuoteModel } from '../src/templates/model'
import type { QuoteDocItemV5 } from '../src/data/quote'

const model = (locale: string) =>
  ({
    kit: { locale },
    data: { catalog: { colors: [{ id: 'nogal', name: 'Nogal', hex: '#5B3A22' }, { id: 'custom-nogal', name: 'Nogal de la casa', hex: '#5B3A22' }] } },
  }) as unknown as QuoteModel

describe('colores en el documento', () => {
  it('traduce los nombres conocidos al idioma del documento', () => {
    const item = { design: { colorId: 'nogal' } } as unknown as QuoteDocItemV5
    expect(itemColors(model('en'), item).out?.name).toBe('Walnut')
    expect(itemColors(model('it'), item).out?.name).toBe('Noce')
    expect(itemColors(model('es'), item).out?.name).toBe('Nogal')
    const snapshot = { colorOut: { id: 'nogal', name: 'Nogal', hex: '#5B3A22' } } as unknown as QuoteDocItemV5
    expect(itemColors(model('de'), snapshot).out?.name).toBe('Nussbaum')
  })

  it('un color propio queda como se escribió', () => {
    const item = { design: { colorId: 'custom-nogal' } } as unknown as QuoteDocItemV5
    expect(itemColors(model('en'), item).out?.name).toBe('Nogal de la casa')
  })
})
