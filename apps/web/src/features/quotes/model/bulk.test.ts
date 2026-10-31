import { describe, expect, it } from 'vitest'
import { createDesign, setGlass, type Catalog } from '@framezen/engine'
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '@framezen/catalog'
import { applyColorToAll, applyGlassToAll, lineHasColor, refsText, sharedValue } from './bulk'
import type { QuoteDoc } from './doc'

const make = (lineId: string, typology = 'casement') => createDesign(typology, { lineId, colorId: SAMPLE_DEFAULTS.colorId, glassId: SAMPLE_DEFAULTS.glassId, width: 1000, height: 1200 })
const doc = (designs: ReturnType<typeof make>[]): QuoteDoc => ({
  title: 'Casa',
  items: designs.map((design, i) => ({ id: `i${i}`, ref: `V${i + 1}`, qty: 1, design })),
  extras: [],
  discountPct: 0,
})

describe('cambios a todas las ventanas', () => {
  it('color: cambia las que lo admiten y avisa las que su línea no fabrica', () => {
    const lines = SAMPLE_CATALOG.lines
    const limited: Catalog = { ...SAMPLE_CATALOG, lines: lines.map((l, i) => (i === 0 ? { ...l, colorIds: [SAMPLE_DEFAULTS.colorId] } : l)) }
    const color = SAMPLE_CATALOG.colors.find((c) => c.id !== SAMPLE_DEFAULTS.colorId)!.id
    const base = doc([make(lines[0].id), make(lines[1].id, 'sliding_2'), make(lines[2].id, 'door')])
    const result = applyColorToAll(base, limited, color)
    expect(result.changed).toEqual(['V2', 'V3'])
    expect(result.skipped).toEqual(['V1'])
    expect(result.doc.items[0].design.colorId).toBe(SAMPLE_DEFAULTS.colorId)
    expect(result.doc.items[1].design.colorId).toBe(color)
    expect(base.items[1].design.colorId).toBe(SAMPLE_DEFAULTS.colorId) // puro
    expect(lineHasColor(limited, base.items[0].design, color)).toBe(false)
  })

  it('color: sin cambios devuelve el mismo documento', () => {
    const base = doc([make(SAMPLE_CATALOG.lines[0].id)])
    const result = applyColorToAll(base, SAMPLE_CATALOG, SAMPLE_DEFAULTS.colorId)
    expect(result.doc).toBe(base)
    expect(result.changed).toEqual([])
  })

  it('vidrio: igual en todas y quita los vidrios propios de cada paño', () => {
    const other = SAMPLE_CATALOG.glass.find((g) => g.id !== SAMPLE_DEFAULTS.glassId)!.id
    const first = make(SAMPLE_CATALOG.lines[0].id)
    const leafId = (first.root as { id: string }).id
    const withPane = setGlass(first, leafId, other)
    const base = doc([withPane, make(SAMPLE_CATALOG.lines[0].id)])
    expect(sharedValue(base, (d) => d.glassId)).toBe(SAMPLE_DEFAULTS.glassId)
    const result = applyGlassToAll(base, SAMPLE_DEFAULTS.glassId)
    expect(result.changed).toEqual(['V1'])
    expect(JSON.stringify(result.doc.items[0].design.root)).not.toContain('"glassId"')
    const all = applyGlassToAll(base, other)
    expect(all.doc.items.every((i) => i.design.glassId === other)).toBe(true)
  })

  it('valor común y textos', () => {
    expect(sharedValue(doc([]), (d) => d.colorId)).toBeUndefined()
    expect(refsText(['V1'])).toBe('V1')
    expect(refsText(['V1', 'V2', 'V3'])).toBe('V1, V2 y V3')
  })
})
