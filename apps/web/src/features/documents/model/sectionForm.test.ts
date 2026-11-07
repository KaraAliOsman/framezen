import { describe, expect, it } from 'vitest'
import { DOC_PRESET_IDS, SECTION_TYPES, createSection, getDocPreset, type DocSection } from '@dekopen/shared'
import { sectionFields, sectionVariants } from './sectionForm'

describe('controles del inspector derivados del esquema', () => {
  it('todo tipo de sección entrega sus campos sin fallar y sin claves repetidas', () => {
    for (const type of SECTION_TYPES) {
      const section = createSection({ type })
      const fields = sectionFields(section)
      const keys = fields.map((f) => f.key)
      expect(new Set(keys).size).toBe(keys.length)
      expect(keys).not.toContain('variant')
    }
  })

  it('todas las secciones de todos los diseños se pueden dibujar en el inspector', () => {
    for (const id of DOC_PRESET_IDS) {
      for (const section of getDocPreset(id).sections) {
        expect(() => sectionFields(section)).not.toThrow()
        expect(() => sectionVariants(section.type)).not.toThrow()
      }
    }
  })

  it('los tipos de campo salen del esquema: interruptores, opciones, números y texto', () => {
    const items = createSection({ type: 'items' })
    const fields = sectionFields(items)
    expect(fields.find((f) => f.key === 'showUnitPrices')).toEqual({ kind: 'switch', key: 'showUnitPrices' })
    expect(fields.find((f) => f.key === 'drawingView')).toMatchObject({ kind: 'choice', values: expect.arrayContaining(['interior', 'exterior', 'both']) })
    expect(fields.find((f) => f.key === 'columns')).toMatchObject({ kind: 'number-choice', values: [1, 2, 3] })
    expect(sectionFields(createSection({ type: 'custom_text' })).find((f) => f.key === 'content')).toMatchObject({ kind: 'richtext' })
  })

  it('la foto sólo se ofrece en las portadas que la usan', () => {
    const cover = createSection({ type: 'cover' })
    const withVariant = (variant: string): DocSection => ({ ...cover, options: { ...cover.options, variant } }) as DocSection
    expect(sectionFields(withVariant('photo')).some((f) => f.key === 'assetId')).toBe(true)
    expect(sectionFields(withVariant('drawing')).some((f) => f.key === 'assetId')).toBe(false)
  })

  it('las opciones que la variante no admite salen deshabilitadas, no ocultas', () => {
    for (const id of DOC_PRESET_IDS) {
      for (const section of getDocPreset(id).sections.filter((s) => s.type === 'items')) {
        const columns = sectionFields(section).find((f) => f.key === 'columns')
        expect(columns).toBeTruthy()
        if (columns && columns.kind === 'number-choice') {
          // Siempre queda alguna columna elegible y la actual nunca está deshabilitada.
          const current = (section.options as { columns?: number }).columns
          expect((columns.disabled ?? []).length).toBeLessThan(columns.values.length)
          if (current) expect(columns.disabled ?? []).not.toContain(current)
        }
      }
    }
  })

  it('las variantes salen de la unión del esquema', () => {
    expect(sectionVariants('items')).toEqual(expect.arrayContaining(['table', 'cards']))
    expect(sectionVariants('page_break')).toEqual([])
  })
})
