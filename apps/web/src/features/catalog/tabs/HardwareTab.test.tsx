import '../../../../test/setup'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Catalog, Item } from '@dekopen/engine'
import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { HardwareTab, variantsText } from './HardwareTab'

const brown: Item = { id: 'fz.manilla-ventana-marron', brandId: 'dekopen-genericos', kind: 'hardware', code: 'FZ-MANILLA-M', name: 'Manilla de ventana marrón', unit: 'u', price: 2900 }

/** Ejemplo con la manilla de la línea practicable en marrón para nogal. */
function catalogWithVariant(): Catalog {
  return {
    ...SAMPLE_CATALOG,
    items: [...SAMPLE_CATALOG.items, brown],
    lines: SAMPLE_CATALOG.lines.map((line, index) =>
      index === 0
        ? { ...line, completeness: 'verified', hardwareRules: line.hardwareRules.map((rule) => (rule.itemId === 'fz.manilla-ventana' ? { ...rule, byColor: { nogal: brown.id } } : rule)) }
        : line,
    ),
  }
}

describe('HardwareTab', () => {
  it('avisa qué reglas cambian de artículo según el color de la ventana', () => {
    render(<HardwareTab catalog={catalogWithVariant()} loading={false} onEditPrice={() => {}} />)
    // Una sola fila con la nota: va junto al código en tablas angostas y tras el nombre en las anchas
    // (las dos copias se alternan con container queries; jsdom no las aplica).
    const notes = screen.getAllByText(/cambia con el color/)
    expect(notes).toHaveLength(2)
    expect(notes[0].closest('tr')).toBe(notes[1].closest('tr'))
    expect(notes[0].closest('tr')?.textContent).toContain('Manilla de ventana')
    for (const note of notes) expect(note.getAttribute('title')).toBe('Nogal: Manilla de ventana marrón')
    expect(notes.map((note) => note.className.split(/\s+/).includes('hidden'))).toEqual([false, true])
  })
})

describe('variantsText', () => {
  it('agrupa los colores que usan el mismo artículo y omite artículos que ya no están', () => {
    const items = new Map([[brown.id, brown]])
    const names = new Map([
      ['nogal', 'Nogal'],
      ['winchester', 'Winchester'],
    ])
    expect(variantsText({ byColor: { nogal: brown.id, winchester: brown.id } }, items, names)).toBe('Nogal, Winchester: Manilla de ventana marrón')
    expect(variantsText({ byColor: { nogal: 'no-existe' } }, items, names)).toBeUndefined()
    expect(variantsText({}, items, names)).toBeUndefined()
  })
})
