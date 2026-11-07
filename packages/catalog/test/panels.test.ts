/**
 * Paneles ciegos (`fill: 'panel'`) con el catálogo de ejemplo: se cotizan por m² de panel con la
 * regla genérica `scope: 'panels'`, y un diseño sin paneles no cambia en nada.
 */
import { collectLeaves, computeBom, createDesign, mapNode, priceItem, TYPOLOGY_IDS, type Catalog, type Item, type WindowDesign } from '@dekopen/engine'
import { describe, expect, it } from 'vitest'
import { buildLineRules, GENERIC_ACCESSORY_RULES, GENERIC_ITEMS, GENERIC_PANEL_ACCESSORY_RULES, genericRulesFor, SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '../src/index'

const PANEL_ITEM = 'fz.panel-ciego'

/** El catálogo de ejemplo sin nada de paneles (ni regla ni artículo): lo que había antes. */
const WITHOUT_PANELS: Catalog = {
  ...SAMPLE_CATALOG,
  items: SAMPLE_CATALOG.items.filter((item) => item.id !== PANEL_ITEM),
  lines: SAMPLE_CATALOG.lines.map((line) => ({ ...line, accessoryRules: line.accessoryRules.filter((rule) => rule.scope !== 'panels') })),
}

const withPanels = (design: WindowDesign): WindowDesign => {
  let root = design.root
  for (const leaf of collectLeaves(design.root)) root = mapNode(root, leaf.id, (n) => (n.type === 'leaf' ? { ...n, fill: 'panel' } : n))
  return { ...design, root }
}

describe('regla genérica de panel ciego', () => {
  it('el artículo es un panel por m² y la regla cuenta solo paneles', () => {
    const item = GENERIC_ITEMS.find((i) => i.id === PANEL_ITEM)
    expect(item).toMatchObject({ unit: 'm2', kind: 'accessory', code: 'FZ-PANEL-CIEGO' })
    expect(item!.price).toBeGreaterThan(0)
    expect(GENERIC_PANEL_ACCESSORY_RULES).toEqual([{ id: 'fz.p.panel-ciego', itemId: PANEL_ITEM, per: 'area_m2', qty: 1, scope: 'panels' }])
    expect(GENERIC_ACCESSORY_RULES).toEqual(expect.arrayContaining(GENERIC_PANEL_ACCESSORY_RULES))
    for (const kind of ['casement', 'sliding'] as const) expect(genericRulesFor(kind).accessoryRules.some((r) => r.scope === 'panels')).toBe(true)
  })

  it('las cuatro líneas de ejemplo la traen y su artículo está en el catálogo', () => {
    expect(SAMPLE_CATALOG.items.some((i) => i.id === PANEL_ITEM)).toBe(true)
    for (const line of SAMPLE_CATALOG.lines) expect(line.accessoryRules.some((r) => r.scope === 'panels' && r.itemId === PANEL_ITEM), line.name).toBe(true)
  })

  it('buildLineRules (listas de marcas reales) completa con el panel genérico y lo anota', () => {
    const rules = buildLineRules('casement', [[] as Item[]], 'marca.linea')
    expect(rules.accessoryRules.some((r) => r.scope === 'panels' && r.itemId === PANEL_ITEM)).toBe(true)
    expect(rules.fromGeneric).toContain('paneles ciegos')
    expect(rules.genericItemIds).toContain(PANEL_ITEM)
  })
})

describe('puerta con panel ciego en el catálogo de ejemplo', () => {
  const line = SAMPLE_CATALOG.lines.find((l) => l.kind === 'casement' && l.typologyIds.includes('entrance_door'))!
  const base = { lineId: line.id, colorId: SAMPLE_DEFAULTS.colorId, glassId: SAMPLE_DEFAULTS.glassId }

  it('se cotiza completa: sin vidrio, con panel por m², sin avisos de faltantes', () => {
    const glassDesign = createDesign('entrance_door', base)
    const panelDesign = withPanels(glassDesign)
    const g = priceItem(computeBom(glassDesign, SAMPLE_CATALOG), glassDesign, SAMPLE_CATALOG, {})
    const bom = computeBom(panelDesign, SAMPLE_CATALOG)
    const p = priceItem(bom, panelDesign, SAMPLE_CATALOG, {})
    expect(bom.glass).toEqual([])
    expect(bom.panels?.length).toBeGreaterThan(0)
    const m2 = bom.panels!.reduce((a, x) => a + x.area, 0)
    const item = SAMPLE_CATALOG.items.find((i) => i.id === PANEL_ITEM)!
    const costLine = p.lines.find((l) => l.code === 'FZ-PANEL-CIEGO')!
    expect(costLine.unitCost).toBe(item.price)
    expect(costLine.qty).toBeCloseTo(m2, 1)
    expect(costLine.total).toBeGreaterThan(0)
    expect(p.materials.glass).toBe(0)
    expect(g.materials.glass).toBeGreaterThan(0)
    expect(p.warnings.map((w) => w.code)).toEqual([])
    expect([...bom.warnings].map((w) => w.code)).not.toContain('panel_rules_missing')
  })

  it('un diseño sin paneles cotiza exactamente igual con y sin la regla (todas las tipologías y líneas)', () => {
    for (const id of TYPOLOGY_IDS) {
      for (const l of SAMPLE_CATALOG.lines.filter((x) => x.typologyIds.includes(id))) {
        const d = createDesign(id, { lineId: l.id, colorId: 'blanco', glassId: SAMPLE_DEFAULTS.glassId })
        const a = computeBom(d, SAMPLE_CATALOG)
        const b = computeBom(d, WITHOUT_PANELS)
        expect(a, `${id} en ${l.name}`).toEqual(b)
        expect(priceItem(a, d, SAMPLE_CATALOG, {}), `${id} en ${l.name}`).toEqual(priceItem(b, d, WITHOUT_PANELS, {}))
      }
    }
  })
})
