import { describe, expect, it } from 'vitest'
import {
  applyDocOp,
  applyDocOps,
  applyTermsPlacement,
  DEFAULT_CATALOG_PRESET_ID,
  cleanSeededPrefs,
  closingOrderViolation,
  getDocPreset,
  isSeededText,
  migrateDocTemplateInput,
  priceLevelOf,
  repairDocTemplate,
  resolveDocSettings,
  resolveQuoteDocument,
  validateDocTemplate,
  type DocSection,
  type DocTemplate,
} from '../../src/templates'

const order = (sections: readonly { type: string }[]) => sections.map((s) => s.type).join(' ')
const closing = (t: Pick<DocTemplate, 'sections'>) => order(t.sections.slice(t.sections.findIndex((s) => s.type === 'totals')))

describe('condiciones respecto del total', () => {
  const base = getDocPreset('hogar').sections

  it('por defecto van bajo el total', () => {
    expect(closing({ sections: base as DocSection[] })).toBe('totals options_comparison payment warranty terms acceptance')
  })

  it('las tres ubicaciones cumplen la regla del total y son idempotentes', () => {
    for (const placement of ['after_total', 'own_page', 'before_total'] as const) {
      const once = applyTermsPlacement(base, placement)
      expect(closingOrderViolation(once), placement).toBe(-1)
      expect(applyTermsPlacement(once, placement)).toEqual(once)
    }
  })

  it('`own_page` deja las condiciones al final, con la aceptación antes', () => {
    expect(order(applyTermsPlacement(base, 'own_page')).endsWith('warranty acceptance terms')).toBe(true)
  })

  it('`before_total` las sube y la lista del editor dice lo mismo que el PDF', () => {
    const r = applyDocOp(getDocPreset('hogar'), { op: 'setDocSettings', patch: { termsPlacement: 'before_total' } })
    expect(r.ok).toBe(true)
    const types = r.result.sections.map((s) => s.type)
    expect(types.indexOf('terms')).toBeLessThan(types.indexOf('totals'))
    expect(r.result.settings?.termsPlacement).toBe('before_total')
  })

  it('arrastrar las condiciones sobre el total cambia su ubicación', () => {
    const r = applyDocOp(getDocPreset('hogar'), { op: 'moveSection', sectionId: 'terms', beforeId: 'totals' })
    expect(r.ok, JSON.stringify(r.issues)).toBe(true)
    expect(r.result.settings?.termsPlacement).toBe('before_total')
  })
})

describe('datos guardados', () => {
  /** Plantilla de v6: sin ajustes, condiciones antes del total y opciones de ítems de entonces. */
  function storedV6(): Record<string, unknown> {
    const t = JSON.parse(JSON.stringify(getDocPreset('corporativa'))) as Record<string, unknown> & { sections: { type: string; options: Record<string, unknown> }[] }
    delete t.settings
    const types = ['groupPageBreak', 'priceTax', 'showRef', 'showSize', 'showQty', 'showLocation', 'showOpening', 'showAccessories', 'showHardware', 'showGlassBuildup', 'showRoughOpening', 'showColorNote', 'showOtherLines']
    for (const key of types) delete t.sections.find((s) => s.type === 'items')!.options[key]
    delete t.sections.find((s) => s.type === 'acceptance')!.options.showStatement
    t.sections = t.sections.filter((s) => s.type !== 'options_comparison')
    t.sections.find((s) => s.type === 'terms')!.options.blocks = ['conditions', 'lead_time', 'validity', 'notes']
    const legal = t.sections.filter((s) => s.type === 'warranty' || s.type === 'terms')
    t.sections = t.sections.filter((s) => s.type !== 'warranty' && s.type !== 'terms')
    t.sections.splice(t.sections.findIndex((s) => s.type === 'totals'), 0, ...legal)
    return t
  }

  it('una plantilla de v6 se lee, con las condiciones bajo el total y sin perder nada', () => {
    const r = validateDocTemplate(storedV6(), { kind: 'quote' })
    expect(r.ok, JSON.stringify(r.issues)).toBe(true)
    const t = r.template!
    expect(closing(t)).toBe('totals payment warranty terms acceptance')
    expect(t.sections.find((s) => s.type === 'items')!.options).toMatchObject({ showRef: true, priceTax: 'net', showHardware: false })
    expect(t.sections.find((s) => s.type === 'terms')!.options).toMatchObject({ blocks: ['includes', 'excludes', 'conditions', 'lead_time', 'validity', 'notes'] })
  })

  it('migrar dos veces da lo mismo y una decisión posterior no se pisa', () => {
    const once = migrateDocTemplateInput(storedV6())
    expect(migrateDocTemplateInput(once)).toEqual(once)
    const r = applyDocOp(validateDocTemplate(once).template!, { op: 'setDocSettings', patch: { termsPlacement: 'before_total' } })
    const again = validateDocTemplate(r.result)
    expect(order(again.template!.sections).indexOf('terms')).toBeLessThan(order(again.template!.sections).indexOf('totals'))
  })

  it('un parche de opciones no reescribe lo demás con valores por defecto', () => {
    const t = getDocPreset('hogar')
    const hidden = applyDocOp(t, { op: 'updateSectionOptions', sectionId: 'items', options: { showRef: false } }).result
    const next = applyDocOp(hidden, { op: 'updateSectionOptions', sectionId: 'items', options: { showQty: false } }).result
    expect(next.sections.find((s) => s.type === 'items')!.options).toMatchObject({ showRef: false, showQty: false })
  })
})

describe('textos sembrados', () => {
  const seeded = {
    intro: 'Gracias por confiar en nosotros. Te dejamos el detalle de las ventanas que conversamos: medidas, terminaciones y precio de cada una. Si quieres ajustar algo, escríbenos y lo vemos juntos.',
    warranty: 'Garantía de 5 años en perfiles y termopaneles, y de 1 año en herrajes e instalación, por defectos de fabricación.',
    paymentTerms: '50 % al aceptar la cotización y 50 % contra entrega.',
    validityDays: 15,
  }

  it('lo idéntico al sembrado se limpia, incluida la vigencia que nadie eligió', () => {
    const out = cleanSeededPrefs(seeded)
    expect(out).toMatchObject({ intro: '', warranty: '', paymentTerms: '', validityDays: 0 })
  })

  it('lo que el taller escribió se conserva', () => {
    const own = { warranty: 'Garantía de 10 años en perfiles.', paymentTerms: '30 % de anticipo.', validityDays: 15 }
    expect(cleanSeededPrefs(own)).toBe(own)
    expect(cleanSeededPrefs({ ...seeded, warranty: own.warranty, paymentTerms: own.paymentTerms, validityDays: 30 })).toMatchObject({ intro: '', warranty: own.warranty, validityDays: 30 })
    expect(isSeededText('warranty', `  ${seeded.warranty}\n`)).toBe(true)
  })

  it('no llegan al documento, ni desde la organización ni desde la cotización', () => {
    const r = resolveQuoteDocument({ template: getDocPreset('hogar'), orgPrefs: seeded, overrides: { v: 2, texts: { warranty: seeded.warranty } } })
    expect(r.texts.intro ?? '').toBe('')
    expect(r.texts.warranty).toBe('')
    expect(r.validityDays).toBeUndefined()
  })
})

describe('ajustes del documento', () => {
  it('se resuelven por capas: plantilla, taller y cotización', () => {
    const t = { ...getDocPreset('hogar'), settings: { docTitle: 'proposal' as const, lineDetail: 'full' as const } }
    const r = resolveQuoteDocument({ template: t, orgPrefs: { settings: { brandHardware: false, lineDetail: 'series' } }, overrides: { v: 2, settings: { docTitle: 'budget' } } })
    expect(r.settings).toMatchObject({ docTitle: 'budget', lineDetail: 'series', brandHardware: false, brandProfile: true, termsPlacement: 'after_total' })
  })

  it('los campos personalizados: la definición va en los ajustes y el valor en la cotización', () => {
    const t = getDocPreset('obra')
    const defined = applyDocOp(t, { op: 'setDocSettings', patch: { customFields: [{ id: 'oc', label: 'N° de OC' }] } })
    expect(defined.ok, JSON.stringify(defined.issues)).toBe(true)
    const valued = applyDocOp({ v: 2 }, { op: 'setCustomField', fieldId: 'oc', value: '4500123' }, { template: defined.result })
    expect(valued.ok).toBe(true)
    const r = resolveQuoteDocument({ template: defined.result, overrides: valued.result })
    expect(r.customFields).toEqual([{ id: 'oc', label: 'N° de OC', value: '4500123' }])
    // Sin definición, un valor suelto no se imprime.
    expect(resolveQuoteDocument({ template: t, overrides: valued.result }).customFields).toEqual([])
  })

  it('rechaza más campos de la cuenta, repetidos o inseguros', () => {
    const t = getDocPreset('obra')
    const many = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, label: 'x' }))
    expect(applyDocOp(t, { op: 'setDocSettings', patch: { customFields: many } }).ok).toBe(false)
    expect(applyDocOp(t, { op: 'setDocSettings', patch: { customFields: [{ id: 'a', label: 'x' }, { id: 'a', label: 'y' }] } }).ok).toBe(false)
    expect(applyDocOp(t, { op: 'setDocSettings', patch: { customTitle: '<b>Hola</b>' } }).ok).toBe(false)
  })

  it('`null` vuelve a la capa de abajo', () => {
    const on = applyDocOp({ v: 2 }, { op: 'setDocSettings', patch: { lineDetail: 'full' } }, { template: getDocPreset('hogar') })
    const off = applyDocOp(on.result, { op: 'setDocSettings', patch: { lineDetail: null } }, { template: getDocPreset('hogar') })
    expect(off.result.settings).toBeUndefined()
    expect(resolveDocSettings(off.result.settings).lineDetail).toBe('series')
  })

  it('los cuatro niveles de precio', () => {
    const items = (t: DocTemplate) => t.sections.find((s) => s.type === 'items')!.options as Parameters<typeof priceLevelOf>[0] & { groupBy: string }
    for (const level of ['full', 'lines', 'groups', 'total'] as const) {
      const r = applyDocOp(getDocPreset('obra'), { op: 'setPriceLevel', level })
      expect(r.ok).toBe(true)
      expect(priceLevelOf(items(r.result)), level).toBe(level)
      if (level === 'groups') expect(items(r.result).groupBy).toBe('room')
    }
  })

  it('todo también por DocOp en una cotización', () => {
    const t = getDocPreset('hogar')
    const r = applyDocOps(
      { v: 2 },
      [
        { op: 'setDocSettings', patch: { termsPlacement: 'own_page', numberPrefix: 'COT-', numberPad: 5, logoSize: 'l', brandPlacement: 'both', brandHardware: false } },
        { op: 'setItemDisplay', patch: { priceTax: 'gross', showQty: false, groupBy: 'floor', groupPageBreak: true, drawingSize: 'm' } },
        { op: 'setPriceLevel', level: 'lines' },
        { op: 'setText', field: 'includes', value: 'Instalación' },
        { op: 'setColor', role: 'accent', value: '#14365F' },
        { op: 'setPage', patch: { margins: { top: 20 } } },
      ],
      { template: t },
    )
    expect(r.ok, JSON.stringify(r.issues)).toBe(true)
    const resolved = resolveQuoteDocument({ template: t, overrides: r.result })
    expect(resolved.settings).toMatchObject({ numberPrefix: 'COT-', numberPad: 5, brandPlacement: 'both' })
    expect(resolved.template.sections.find((s) => s.type === 'items')!.options).toMatchObject({ priceTax: 'gross', showQty: false, showUnitPrices: false, showLineTotals: true })
    expect(resolved.texts.includes).toBe('Instalación')
  })

  it('una reparación conserva los ajustes válidos y suelta los malos', () => {
    const { template } = repairDocTemplate({ kind: 'quote', name: 'x', settings: { docTitle: 'budget', termsPlacement: 'arriba' }, sections: [{ type: 'items' }, { type: 'totals' }] }, { kind: 'quote' })
    expect(template.settings).toMatchObject({ docTitle: 'budget' })
    expect(template.settings?.termsPlacement).toBeUndefined()
  })
})

describe('edición directa sobre la hoja', () => {
  const hogar = getDocPreset('hogar')
  const overrides = { v: 2 as const }

  it('drawingSize admite «none» en cualquier composición de ventanas', () => {
    for (const variant of ['table', 'cards', 'sheet', 'gallery', 'per_page']) {
      const items = hogar.sections.find((s) => s.type === 'items')!
      const r = applyDocOps(hogar, [{ op: 'updateSectionOptions', sectionId: items.id, options: { variant, drawingSize: 'none' } }])
      expect(r.ok, variant).toBe(true)
      expect(r.result.sections.find((s) => s.type === 'items')?.options).toMatchObject({ drawingSize: 'none' })
    }
  })

  it('«none» no es un tamaño del catálogo de productos', () => {
    const catalog = getDocPreset(DEFAULT_CATALOG_PRESET_ID)
    const cards = catalog.sections.find((s) => s.type === 'product_cards')!
    expect(applyDocOps(catalog, [{ op: 'updateSectionOptions', sectionId: cards.id, options: { drawingSize: 'none' } }]).ok).toBe(false)
  })

  it('el último cambio manda: setItemDisplay no queda tapado por un ajuste anterior de la sección', () => {
    const items = hogar.sections.find((s) => s.type === 'items')!
    const first = applyDocOps(overrides, [{ op: 'updateSectionOptions', sectionId: items.id, options: { showGlass: true } }], { template: hogar })
    const next = applyDocOps(first.result, [{ op: 'setItemDisplay', patch: { showGlass: false } }], { template: hogar })
    expect(resolveQuoteDocument({ template: hogar, overrides: next.result }).template.sections.find((s) => s.type === 'items')?.options).toMatchObject({ showGlass: false })
  })

  it('mover las condiciones sobre el total en una cotización cambia su ubicación', () => {
    const totals = hogar.sections.find((s) => s.type === 'totals')!
    const terms = hogar.sections.find((s) => s.type === 'terms')!
    const r = applyDocOps(overrides, [{ op: 'moveSection', sectionId: terms.id, beforeId: totals.id }], { template: hogar })
    expect(r.ok).toBe(true)
    expect(r.result.settings?.termsPlacement).toBe('before_total')
  })

  it('el logo propio es un id de imagen, nunca una dirección', () => {
    expect(applyDocOps(hogar, [{ op: 'setDocSettings', patch: { logoAssetId: 'https://x.y/logo.png' } }]).ok).toBe(false)
  })
})
