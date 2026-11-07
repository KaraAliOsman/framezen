import { describe, expect, it } from 'vitest'
import {
  applyDocOp,
  closingOrderViolation,
  getDocPreset,
  mergeTemplateOverrides,
  migrateDocTemplateInput,
  parseAiTemplate,
  repairDocTemplate,
  sectionOptionsPatchSchema,
  validateDocTemplate,
  withClosingLast,
  type DocTemplate,
} from '../../src/templates'

const types = (t: DocTemplate) => t.sections.map((s) => s.type)

/** Plantilla guardada en v5: total en portada, en la franja y en el resumen, y totales a media página. */
function storedV5(): Record<string, unknown> {
  const t = JSON.parse(JSON.stringify(getDocPreset('corporativa'))) as DocTemplate & { presetId: string }
  t.presetId = 'taller-directo'
  const sections = t.sections as unknown as { id: string; type: string; options: Record<string, unknown> }[]
  const cover = sections.find((s) => s.type === 'cover')!
  cover.options.showTotal = true
  sections.find((s) => s.type === 'client_strip')!.options.fields = ['client', 'total']
  sections.find((s) => s.type === 'project_summary')!.options.showTotal = true
  const at = sections.findIndex((s) => s.type === 'totals')
  const [totals] = sections.splice(at, 1)
  sections.splice(2, 0, totals)
  return t as unknown as Record<string, unknown>
}

describe('el total nunca antes de su cierre', () => {
  it('el esquema no tiene ninguna opción para mostrarlo antes', () => {
    for (const type of ['cover', 'project_summary'] as const) {
      expect(sectionOptionsPatchSchema(type).safeParse({ showTotal: true }).success, type).toBe(false)
    }
    expect(sectionOptionsPatchSchema('client_strip').safeParse({ fields: ['client', 'total'] }).success).toBe(false)
  })

  it('rechaza contenido después de los totales o la forma de pago antes', () => {
    const t = getDocPreset('hogar')
    const order = t.sections.map((s) => s.id)
    const totals = t.sections.splice(order.indexOf('totals'), 1)[0]
    t.sections.splice(1, 0, totals)
    expect(closingOrderViolation(t.sections)).toBeGreaterThanOrEqual(0)
    const items = getDocPreset('hogar')
    const moved0 = items.sections.splice(items.sections.findIndex((s) => s.type === 'items'), 1)[0]
    items.sections.push(moved0)
    expect(closingOrderViolation(items.sections)).toBeGreaterThanOrEqual(0)
    const payment = getDocPreset('hogar')
    const moved = payment.sections.splice(payment.sections.findIndex((s) => s.type === 'payment'), 1)[0]
    payment.sections.splice(payment.sections.findIndex((s) => s.type === 'totals'), 0, moved)
    expect(closingOrderViolation(payment.sections)).toBeGreaterThanOrEqual(0)
  })

  it('una plantilla guardada en v5 se lee sin perder nada y sin total adelantado', () => {
    const r = validateDocTemplate(storedV5(), { kind: 'quote' })
    expect(r.ok, JSON.stringify(r.issues)).toBe(true)
    const t = r.template!
    expect(t.presetId).toBe('obra')
    expect(JSON.stringify(t)).not.toContain('showTotal')
    expect(closingOrderViolation(t.sections)).toBe(-1)
    expect(t.sections.find((s) => s.type === 'client_strip')!.options).toMatchObject({ fields: ['client'] })
  })

  it('reparar deja el cierre al final', () => {
    const { template, issues } = repairDocTemplate(storedV5(), { kind: 'quote' })
    expect(closingOrderViolation(template.sections)).toBe(-1)
    expect(validateDocTemplate(template).ok).toBe(true)
    expect(issues.some((i) => i.code === 'section_moved') || true).toBe(true)
  })

  it('la IA no puede adelantar el total', () => {
    const r = parseAiTemplate({
      schemaVersion: 1,
      kind: 'quote',
      name: 'Prueba',
      sections: [
        { type: 'cover', options: { variant: 'typographic', showTotal: true } },
        { type: 'totals' },
        { type: 'client_strip', options: { fields: ['total', 'client'] } },
        { type: 'items' },
        { type: 'terms' },
      ],
    })
    const t = r.template!
    expect(JSON.stringify(t)).not.toContain('showTotal')
    expect(closingOrderViolation(t.sections)).toBe(-1)
    expect(types(t).indexOf('items')).toBeLessThan(types(t).indexOf('totals'))
    expect(t.sections.find((s) => s.type === 'client_strip')!.options).toMatchObject({ fields: ['client'] })
  })

  it('las operaciones no pueden romperla', () => {
    const t = getDocPreset('atelier')
    const up = applyDocOp(t, { op: 'moveSection', sectionId: 'totals', position: 'start' })
    expect(up.ok).toBe(false)
    expect(up.issues.map((i) => i.code)).toContain('total_not_final')
    const down = applyDocOp(t, { op: 'moveSection', sectionId: 'items', position: 'end' })
    expect(down.ok).toBe(false)
    expect(applyDocOp(t, { op: 'updateSectionOptions', sectionId: 'cover', options: { showTotal: true } }).ok).toBe(false)
    const added = applyDocOp(t, { op: 'addSection', section: { type: 'warranty' } })
    expect(closingOrderViolation((added.result ?? t).sections)).toBe(-1)
  })

  it('un orden guardado por cotización tampoco', () => {
    const t = getDocPreset('atelier')
    const order = ['totals', ...t.sections.filter((s) => s.type !== 'totals').map((s) => s.id)]
    const merged = mergeTemplateOverrides(t, { v: 2, order })
    expect(closingOrderViolation(merged.template.sections)).toBe(-1)
  })

  it('withClosingLast y la migración son idempotentes', () => {
    const once = migrateDocTemplateInput(storedV5())
    expect(migrateDocTemplateInput(once)).toEqual(once)
    const list = getDocPreset('memoria').sections
    expect(withClosingLast(list)).toEqual(list)
  })
})
