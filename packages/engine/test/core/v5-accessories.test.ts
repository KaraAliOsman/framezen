import { describe, expect, it } from 'vitest'
import { computeBom, computeLayout, createDesign, normalizeExtras, priceItem, setExtras } from '../../src'
import type { Bom, WindowDesign } from '../../src/types'
import { prolineCatalog } from './fixtures'
import { v5Catalog } from './v5-fixtures'

const catalog = v5Catalog()
const base = { lineId: 'pro6004', colorId: 'blanco', glassId: 'dvh-4-12-4' }
const qty = (bom: Bom, itemId: string) => bom.items.filter((i) => i.itemId === itemId).reduce((a, i) => a + i.qty, 0)
const window = (extras: WindowDesign['extras']): WindowDesign => ({ ...createDesign('casement', { ...base, width: 800, height: 1200 }), extras })

describe('persianas', () => {
  it('monoblock con motor: cortina por m², cajón por metro de ancho, 2 guías por metro de alto y motor', () => {
    const bom = computeBom(window({ rollerShutter: { type: 'monoblock', operation: 'motor' } }), catalog)
    expect(qty(bom, 'X-CORT')).toBe(0.96)
    expect(qty(bom, 'X-CAJM')).toBe(0.8)
    expect(qty(bom, 'X-CAJE')).toBe(0)
    expect(qty(bom, 'X-GUIA')).toBe(2.4)
    expect(qty(bom, 'X-MOT')).toBe(1)
    expect(qty(bom, 'X-MAN')).toBe(0)
    const price = priceItem(bom, window({ rollerShutter: { type: 'monoblock', operation: 'motor' } }), catalog, {})
    const plain = priceItem(computeBom(window(undefined), catalog), window(undefined), catalog, {})
    expect(price.materials.accessories - plain.materials.accessories).toBe(Math.round(0.96 * 30000) + Math.round(0.8 * 20000) + Math.round(2.4 * 5000) + 90000)
    const cort = price.lines.find((l) => l.code === 'X-CORT')
    expect(cort).toMatchObject({ unit: 'm2', qty: 0.96 })
  })

  it('exterior con manivela: cambia el cajón y el accionamiento', () => {
    const bom = computeBom(window({ rollerShutter: { type: 'exterior', operation: 'crank' } }), catalog)
    expect([qty(bom, 'X-CAJE'), qty(bom, 'X-CAJM'), qty(bom, 'X-MAN'), qty(bom, 'X-MOT')]).toEqual([0.8, 0, 1, 0])
  })

  it('dibujo: cajón sobre el marco (alto típico o el pedido) y guías laterales', () => {
    const layout = computeLayout(window({ rollerShutter: { type: 'monoblock', operation: 'strap' } }), catalog)
    expect(layout.attachments?.rollerShutter).toEqual({
      type: 'monoblock',
      operation: 'strap',
      box: { x: 0, y: -165, w: 800, h: 165 },
      guides: [
        { x: 0, y: 0, w: 45, h: 1200 },
        { x: 755, y: 0, w: 45, h: 1200 },
      ],
    })
    const custom = computeLayout(window({ rollerShutter: { type: 'exterior', operation: 'motor', boxHeight: 205 } }), catalog)
    expect(custom.attachments?.rollerShutter?.box).toEqual({ x: 0, y: -205, w: 800, h: 205 })
  })
})

describe('mosquiteros, alféizar y umbral', () => {
  it('mosquitero por tipo: plisado por m², abatible por hoja; el booleano de v4 es un mosquitero fijo', () => {
    expect(qty(computeBom(window({ insectScreen: { type: 'pleated' } }), catalog), 'X-MOSP')).toBe(0.96)
    expect(qty(computeBom(window({ insectScreen: { type: 'hinged' } }), catalog), 'X-MOSA')).toBe(1)
    const legacy = computeBom(window({ screen: true }), catalog)
    expect(qty(legacy, 'X-MOSF')).toBe(0.96)
    expect(normalizeExtras(window({ screen: true })).insectScreen).toEqual({ type: 'fixed' })
    expect(computeLayout(window({ insectScreen: { type: 'roller' } }), catalog).attachments).toEqual({ insectScreen: { type: 'roller' } })
  })

  it('alféizar por metro de ancho, dibujado bajo el marco con su vuelo', () => {
    const d = window({ sill: true })
    expect(qty(computeBom(d, catalog), 'X-ALF')).toBe(0.8)
    expect(computeLayout(d, catalog).attachments?.sill).toEqual({ rect: { x: -25, y: 1200, w: 850, h: 30 } })
  })

  it('las tapas de umbral solo se cobran si el umbral se puso de verdad', () => {
    expect(qty(computeBom(window({ threshold: true }), catalog), 'X-UMB')).toBe(0)
    const door = { ...createDesign('door', base), extras: { threshold: true } }
    expect(qty(computeBom(door, catalog), 'X-UMB')).toBe(1)
  })

  it('extras sin reglas en la línea: aviso informativo, se dibujan igual', () => {
    const bom = computeBom(window({ rollerShutter: { type: 'monoblock', operation: 'motor' }, sill: true }), prolineCatalog())
    expect(bom.warnings.filter((w) => w.code === 'extra_rules_missing').map((w) => w.message)).toEqual([
      'PRO6004 no tiene precios para persianas en el catálogo: se dibuja, pero la ventana queda fuera del total. Agrégalos en Catálogo › Accesorios.',
      'PRO6004 no tiene precios para alféizares en el catálogo: se dibuja, pero la ventana queda fuera del total. Agrégalos en Catálogo › Accesorios.',
    ])
  })

  it('tipos desconocidos se ignoran sin romper el cálculo', () => {
    const odd = window({ rollerShutter: { type: 'veneciana', operation: 'magia' } } as unknown as WindowDesign['extras'])
    expect(normalizeExtras(odd).rollerShutter).toBeUndefined()
    expect(computeBom(odd, catalog).warnings.filter((w) => w.level === 'error')).toEqual([])
  })
})

describe('setExtras', () => {
  it('pone y quita extras sin mutar; misma referencia si no cambia nada', () => {
    const d = createDesign('casement', base)
    const a = setExtras(d, { rollerShutter: { type: 'monoblock', operation: 'motor' } })
    expect(a.extras).toEqual({ rollerShutter: { type: 'monoblock', operation: 'motor' } })
    expect(d.extras).toBeUndefined()
    expect(setExtras(a, { rollerShutter: { type: 'monoblock', operation: 'motor' } })).toBe(a)
    const b = setExtras({ ...a, extras: { ...a.extras, screen: true } }, { insectScreen: { type: 'pleated' } })
    expect(b.extras).toEqual({ rollerShutter: { type: 'monoblock', operation: 'motor' }, insectScreen: { type: 'pleated' } })
    expect('extras' in setExtras(a, { rollerShutter: undefined })).toBe(false)
  })
})
