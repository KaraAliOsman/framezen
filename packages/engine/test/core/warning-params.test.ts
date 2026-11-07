/**
 * Parámetros tipados de los avisos: cada código del motor se produce con sus `params` (y cada
 * corrección con `key`/`params`), serializables, sin tocar `code` ni `message`.
 */
import { describe, expect, it } from 'vitest'
import { computeBom, createDesign, WARNING_CODES, WARNING_FIX_HAS_PARAMS, WARNING_FIX_KEYS, WARNING_HAS_PARAMS, warning } from '../../src'
import type { Warning, WarningCode } from '../../src'
import { prolineCatalog } from './fixtures'
import { collectWarningSamples } from './warning-samples'

const samples = collectWarningSamples()
const byCode = (code: string) => samples.filter((s) => s.warning.code === code)
/** El aviso de un código producido en el escenario que lo nombra. */
const inScenario = (code: string, scenario: string): Warning => {
  const found = samples.find((s) => s.warning.code === code && s.scenario === scenario)
  expect(found, `${code} en «${scenario}»`).toBeDefined()
  return found!.warning
}
const isScalar = (v: unknown) => typeof v === 'string' || typeof v === 'number'

describe('registro de códigos', () => {
  it('lista cada código una vez y los de corrección también', () => {
    expect(new Set(WARNING_CODES).size).toBe(WARNING_CODES.length)
    expect(WARNING_CODES.length).toBeGreaterThanOrEqual(50)
    expect(WARNING_CODES).toEqual(expect.arrayContaining(['opening_too_large', 'opening_too_small', 'element_too_large', 'shape_bending', 'panel_rules_missing']))
    expect([...WARNING_FIX_KEYS].sort()).toEqual(['make_fixed', 'square', 'to_casement', 'to_sliding', 'use', 'use_first_color', 'use_mullion'])
  })
})

describe('todo aviso del motor trae sus parámetros', () => {
  it('cada código se produce al menos una vez en los escenarios de prueba', () => {
    const missing = WARNING_CODES.filter((code) => byCode(code).length === 0)
    expect(missing).toEqual([])
  })

  it('el código está registrado y los parámetros existen exactamente cuando el registro lo dice', () => {
    for (const { scenario, warning: w } of samples) {
      const code = w.code as WarningCode
      expect(code in WARNING_HAS_PARAMS, `${scenario}: ${w.code}`).toBe(true)
      if (WARNING_HAS_PARAMS[code]) {
        // Algunos avisos salen sin params a propósito (material sin nombre): solo `price_missing` individual.
        if (w.params === undefined) expect(['price_missing'], `${scenario}: ${w.code}`).toContain(w.code)
      } else {
        expect(w.params, `${scenario}: ${w.code}`).toBeUndefined()
      }
    }
  })

  it('los parámetros son pequeños, planos y serializables (texto o número, sin NaN)', () => {
    for (const { scenario, warning: w } of samples) {
      const params = w.params ?? {}
      for (const [key, value] of Object.entries(params)) {
        expect(isScalar(value), `${scenario}: ${w.code}.${key}`).toBe(true)
        if (typeof value === 'number') expect(Number.isFinite(value), `${scenario}: ${w.code}.${key}`).toBe(true)
      }
      expect(JSON.parse(JSON.stringify(params)), `${scenario}: ${w.code}`).toEqual(params)
      expect(Object.keys(params).length, `${scenario}: ${w.code}`).toBeLessThanOrEqual(12)
    }
  })

  it('las correcciones llevan su clave y sus parámetros según el registro', () => {
    const fixes = samples.filter((s) => s.warning.fix)
    expect(new Set(fixes.map((s) => s.warning.fix!.key))).toEqual(new Set(WARNING_FIX_KEYS))
    for (const { scenario, warning: w } of fixes) {
      const fix = w.fix!
      expect(WARNING_FIX_KEYS, `${scenario}: ${w.code}`).toContain(fix.key)
      const key = fix.key as keyof typeof WARNING_FIX_HAS_PARAMS
      if (WARNING_FIX_HAS_PARAMS[key]) expect(fix.params, `${scenario}: ${w.code}`).toBeDefined()
      else expect(fix.params, `${scenario}: ${w.code}`).toBeUndefined()
      expect(typeof fix.label).toBe('string')
      expect(fix.patch).toBeDefined()
    }
  })
})

describe('parámetros de avisos concretos', () => {
  const one = (code: string, pick: (w: Warning) => boolean = () => true): Warning => {
    const found = byCode(code).find((s) => pick(s.warning))
    expect(found, code).toBeDefined()
    return found!.warning
  }

  it('línea y color con nombres del catálogo, y la corrección «usar»', () => {
    const w = one('color_not_in_line')
    expect(w.params).toEqual({ line: 'PROSLD70', color: 'Antracita' })
    expect(w.fix).toMatchObject({ label: 'Usar Blanco', key: 'use', params: { name: 'Blanco' } })
  })

  it('medidas en bruto (mm) y no en texto: la redonda con ancho y alto distintos', () => {
    const w = one('round_not_square')
    expect(w.params).toEqual({ width: 1000, height: 900 })
    expect(w.fix).toMatchObject({ key: 'square', params: { width: 1000, height: 1000 } })
    expect(w.message).toBe('Una ventana redonda tiene el mismo ancho y alto: con 1.000 mm × 900 mm se calculó como óvalo.')
  })

  it('el aviso de un paño dice qué paño es (tipo, posición y número)', () => {
    expect(inScenario('pane_small', 'paño muy chico').params).toMatchObject({ paneKind: 'fixed', paneV: 'none', paneH: 'left', paneN: 0, size: 126, dim: 'width' })
    expect(inScenario('pane_impossible', 'paño imposible').params).toMatchObject({ paneKind: 'fixed', paneH: 'left', variant: 'fit' })
    const sliding = one('pane_impossible', (x) => x.params?.variant === 'sliding')
    expect(sliding.params).toMatchObject({ variant: 'sliding', panels: 6, paneH: 'none' })
    expect(one('pane_impossible', (x) => x.params?.variant === 'outside').params).toMatchObject({ paneKind: 'fixed', variant: 'outside' })
    // Con varias hojas iguales, el número desambigua: «hoja 4» en una corredera de 6.
    expect(byCode('pane_impossible').some((s) => s.warning.params?.paneN === 4)).toBe(true)
  })

  it('hoja sin herraje: bordes del hueco redondeados y cantidad', () => {
    const between = inScenario('hardware_out_of_range', 'hoja sin herraje para su alto (entre rangos)')
    expect(between.params).toEqual({ line: 'PRO6004', size: 928, dim: 'height', count: 1, coverage: 'between', below: 600, above: 1200 })
    expect(between.message).toBe('No hay herraje de PRO6004 para hojas de 928 mm de alto (cubre hasta 600 y desde 1.200). Queda fuera del total.')
    expect(inScenario('hardware_out_of_range', 'hoja sin herraje para su alto (sobre todos los rangos)').params).toMatchObject({ dim: 'height', coverage: 'upto', below: 1400 })
    expect(inScenario('hardware_out_of_range', 'hoja sin herraje para su ancho (bajo todos los rangos)').params).toMatchObject({ dim: 'width', coverage: 'from', above: 500 })
    expect(inScenario('hardware_out_of_range', 'dos hojas sin herraje').params?.count).toBe(2)
  })

  it('rangos de apertura: el tipo de hoja y los límites en mm', () => {
    const w = inScenario('opening_too_large', 'hoja demasiado grande')
    expect(w.params).toMatchObject({ limit: 'casement', paneKind: 'sash', minW: 400, maxW: 1000, minH: 400, maxH: 1500 })
    expect(Number(w.params?.width)).toBeGreaterThan(1000)
    expect(inScenario('opening_too_small', 'hoja demasiado chica').params).toMatchObject({ limit: 'tilt_slide', paneKind: 'sash', minW: 670, maxW: 2000 })
  })

  it('el precio manual y el margen llevan los importes sin formato', () => {
    const below = inScenario('below_cost', 'precio manual bajo el costo')
    expect(below.params).toMatchObject({ price: 1000 })
    expect(Number(below.params?.loss)).toBeCloseTo(Number(below.params?.cost) - 1000, 6)
    expect(one('margin_invalid', (x) => x.params?.variant === 'high').params).toEqual({ variant: 'high', pct: 97.2 })
    expect(one('margin_invalid', (x) => x.params?.variant === 'low').params).toEqual({ variant: 'low', pct: -5 })
  })

  it('materiales sin precio: uno por aviso (hasta 3) o un resumen con los dos primeros', () => {
    const many = one('price_missing', (x) => x.params?.variant === 'many')
    expect(many.params).toMatchObject({ variant: 'many' })
    expect(Number(many.params?.count)).toBeGreaterThan(3)
    expect(Number(many.params?.rest)).toBe(Number(many.params?.count) - 2)
    const kinds = new Set(byCode('price_missing').flatMap((s) => (s.warning.params?.variant === 'one' ? [`${s.warning.params.kind}/${s.warning.params.issue}`] : [])))
    expect([...kinds]).toEqual(expect.arrayContaining(['reinforcement/no_price', 'glass/no_price_m2', 'hardware/no_price', 'consumable/no_price', 'reinforcement/not_in_catalog', 'glass/not_in_catalog', 'hardware/not_in_catalog']))
  })

  it('la lista de campos de la pauta viaja como ids', () => {
    expect(one('pauta_incomplete').params).toEqual({ line: 'PRO6004', fields: 'sashWidth,sashDeduction,sashOverlap,glassGap,mullionDeduction' })
  })

  it('sin línea, el aviso del umbral sale sin nombre (versión genérica en otros idiomas)', () => {
    const w = one('threshold_missing', (x) => x.params?.kind === 'lift_slide')
    expect(w.params).toEqual({ kind: 'lift_slide', line: 'HST 85' })
    const noLine = computeBom(createDesign('lift_slide_2', { lineId: 'nada', colorId: 'blanco', glassId: 'dvh-4-12-4' }), prolineCatalog()).warnings.find((x) => x.code === 'threshold_missing')
    expect(noLine?.params).toEqual({ kind: 'lift_slide' })
  })
})

describe('warning(): constructor estricto', () => {
  it('devuelve el aviso tal cual, con los parámetros que pide su código', () => {
    const w = warning({ level: 'info', code: 'invalid_piece', message: 'Una pieza sin largo válido quedó fuera de la optimización.', params: { count: 1 } })
    expect(w).toEqual({ level: 'info', code: 'invalid_piece', message: 'Una pieza sin largo válido quedó fuera de la optimización.', params: { count: 1 } })
  })

  it('en compilación: faltan parámetros, sobran claves o el código no existe', () => {
    // @ts-expect-error: `invalid_piece` exige `count`
    warning({ level: 'info', code: 'invalid_piece', message: '' })
    // @ts-expect-error: parámetro desconocido para el código
    warning({ level: 'info', code: 'invalid_piece', message: '', params: { count: 1, nope: 2 } })
    // @ts-expect-error: `size_invalid` no lleva parámetros
    warning({ level: 'error', code: 'size_invalid', message: '', params: { x: 1 } })
    // @ts-expect-error: código desconocido
    warning({ level: 'info', code: 'no_existe', message: '' })
    // @ts-expect-error: una corrección `square` exige sus medidas
    warning({ level: 'info', code: 'size_invalid', message: '', fix: { label: '', key: 'square', patch: {} } })
    expect(true).toBe(true)
  })
})
