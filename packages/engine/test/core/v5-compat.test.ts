/**
 * Compatibilidad con diseños guardados en v4: cargan sin cambios, se reconocen con su tipología de
 * siempre y calculan igual (los dorados de la OT 385 viven en golden.test.ts).
 */
import { describe, expect, it } from 'vitest'
import { TYPOLOGIES, computeBom, computeLayout, createDesign, designName, matchTypology, priceItem } from '../../src'
import type { Catalog, TypologyId, WindowDesign } from '../../src/types'
import { lengths, prolineCatalog } from './fixtures'

const catalog = prolineCatalog()

/** Diseños tal como se guardaban en v4 (JSON de la base, sin campos nuevos). */
const SAVED_V4: [TypologyId, WindowDesign][] = [
  [
    'casement_double',
    {
      version: 1,
      lineId: 'pro6004',
      width: 1200,
      height: 1300,
      colorId: 'blanco',
      glassId: 'dvh-4-12-4',
      root: {
        id: 'n1',
        type: 'split',
        dir: 'vertical',
        joint: 'french',
        sizes: [null, null],
        children: [
          { id: 'n2', type: 'leaf', opening: { kind: 'casement', hinge: 'left', direction: 'in' } },
          { id: 'n3', type: 'leaf', opening: { kind: 'casement', hinge: 'right', direction: 'in' } },
        ],
      },
    },
  ],
  [
    'door',
    {
      version: 1,
      lineId: 'pro6004',
      width: 862,
      height: 2246,
      colorId: 'winchester',
      colorInId: 'blanco',
      glassId: 'dvh-4-12-4',
      extras: { threshold: false, screen: false },
      root: { id: 'n1', type: 'leaf', opening: { kind: 'door', hinge: 'left', direction: 'in' } },
    },
  ],
  [
    'arch',
    {
      version: 1,
      lineId: 'pro6004',
      width: 1000,
      height: 1200,
      colorId: 'blanco',
      glassId: 'dvh-4-12-4',
      shape: { kind: 'arch', rise: 500 },
      root: { id: 'n1', type: 'leaf', opening: { kind: 'fixed' } },
    },
  ],
  [
    'sliding_4',
    {
      version: 1,
      lineId: 'prosld70',
      width: 3000,
      height: 1200,
      colorId: 'blanco',
      glassId: 'dvh-4-12-4',
      root: {
        id: 'n1',
        type: 'sliding',
        rails: 2,
        panels: [
          { id: 'n2', kind: 'fixed' },
          { id: 'n3', kind: 'moving', direction: 'left' },
          { id: 'n4', kind: 'moving', direction: 'right' },
          { id: 'n5', kind: 'fixed' },
        ],
      },
    },
  ],
]

describe('diseños v4 guardados', () => {
  it.each(SAVED_V4)('%s se reconoce, se nombra y calcula sin avisos nuevos', (id, saved) => {
    expect(matchTypology(saved)).toBe(id)
    expect(designName(saved)).toBe(TYPOLOGIES.find((t) => t.id === id)!.name)
    const bom = computeBom(saved, catalog)
    expect(bom.warnings.map((w) => w.code).filter((c) => /opening_too|element_too|shape_not_fixed|fold|folding|extra_rules/.test(c))).toEqual([])
    expect(priceItem(bom, saved, catalog, {}).cost).toBeGreaterThan(0)
    // Igual que el diseño recién creado desde su tipología (los ids v4 siguen armando lo mismo).
    const fresh = createDesign(id, { lineId: saved.lineId, width: saved.width, height: saved.height, colorId: saved.colorId, glassId: saved.glassId })
    expect(fresh.root).toEqual(saved.root)
    expect(fresh.shape).toEqual(saved.shape)
  })

  it('doble hoja v4 (sin hoja pasiva declarada): pasiva a la izquierda con su inversor, como antes', () => {
    const inv = { id: 'INV', lineId: 'pro6004', code: 'INV-01', name: 'Inversor', role: 'french_mullion' as const, barLength: 5800, priceByColor: { blanco: 15000 } }
    const cat: Catalog = { ...catalog, profiles: [...catalog.profiles, inv], lines: catalog.lines.map((l) => (l.id === 'pro6004' ? { ...l, profiles: { ...l.profiles, french_mullion: 'INV' } } : l)) }
    const [, saved] = SAVED_V4[0]
    const bom = computeBom(saved, cat)
    expect(lengths(bom.cuts, { role: 'french_mullion', nodeId: 'n2' })).toEqual([[1300 - 88 + 16, 1]])
    expect(computeLayout(saved, cat).sashes.map((s) => s.handle ?? null)).toEqual([null, 'left'])
  })

  it('puerta balconera de la OT 385 (V1): marco completo, mismos cortes que en v4', () => {
    const [, saved] = SAVED_V4[1]
    const bom = computeBom(saved, catalog)
    expect(lengths(bom.cuts, { code: 'PRO01' })).toEqual([
      [868, 2],
      [2252, 2],
    ])
    expect(lengths(bom.cuts, { role: 'threshold' })).toEqual([])
  })

  it('el color con textura no cambia ningún número (el motor nunca la lee)', () => {
    const textured: Catalog = {
      ...catalog,
      colors: catalog.colors.map((c) => ({ ...c, texture: { kind: 'builtin', id: 'wood-winchester', scaleMm: 500, finish: 'woodgrain' } })),
    }
    for (const [, saved] of SAVED_V4) {
      expect(computeBom(saved, textured)).toEqual(computeBom(saved, catalog))
      expect(priceItem(computeBom(saved, textured), saved, textured, {}).unitNet).toBe(priceItem(computeBom(saved, catalog), saved, catalog, {}).unitNet)
    }
  })
})
