import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { createDesign, DEFAULT_PRICING, type WindowDesign } from '@dekopen/engine'
import { getDocPreset, type DocTemplate, type Org, type Quote, type QuoteItem } from '@dekopen/shared'
import { buildQuoteDocData, lineSeries, quoteDocGroups } from '../../src/data/quote'
import { QuoteDocument } from '../../src/sales'
import { buildQuoteModel, quoteDocChecks } from '../../src/templates'
import { paginateQuote, quoteBlocks } from '../../src/templates/Document'
import { paginateFlow, type FlowBlock } from '../../src/templates/flow'
import { sampleWorkshopCatalog } from '../../src/workshop/sample'

const catalog = sampleWorkshopCatalog()
const line = catalog.lines[0]
const glass = catalog.glass[0]
const LOGO = 'data:image/png;base64,iVBORw0KGgo='
const org = { id: 'o', name: 'Ventanas del Sur', createdAt: '2026-01-01T00:00:00.000Z' } as Org
const fixed = (width = 1000, height = 1000): WindowDesign => createDesign('fixed', { lineId: line.id, width, height, colorId: line.colorIds[0], glassId: glass.id })
const item = (id: string, extra: Partial<QuoteItem> = {}): QuoteItem => ({ id, ref: id.toUpperCase(), qty: 1, design: fixed(), ...extra })

function quote(extra: Partial<Quote> = {}): Quote {
  return { id: 'q', number: 412, title: 'Casa Muñoz', status: 'draft', items: [item('a'), item('b')], extras: [], discountPct: 0, revision: 0, version: 1, createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-02T12:00:00.000Z', ...extra } as Quote
}

const doc = (q: Quote, documents: Record<string, unknown> = {}, assets?: Record<string, string>) =>
  buildQuoteDocData({ quote: q, org, catalog, settings: { pricing: DEFAULT_PRICING, documents: documents as never }, ...(assets ? { assets } : {}) })

const text = (data: ReturnType<typeof doc>, template: string | DocTemplate = 'hogar') =>
  renderToStaticMarkup(createElement(QuoteDocument, { data, template, measure: false }))
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')

const model = (data: ReturnType<typeof doc>, template: string | DocTemplate = 'hogar') => buildQuoteModel(data, { template })

describe('inicio del documento', () => {
  it('abre con identidad y alcance: sin saludo ni carta', () => {
    const t = text(doc(quote()))
    expect(t).not.toMatch(/Hola|Gracias|confiar|Un saludo/)
    expect(t).toContain('Alcance')
    expect(t).toContain('2 ventanas')
  })

  it('la carta es opcional: solo se imprime si el taller la enciende y la escribe', () => {
    const preset = getDocPreset('hogar')
    preset.sections.find((s) => s.type === 'letter')!.enabled = true
    expect(text(doc(quote()), preset)).not.toContain('Carta de texto propio')
    expect(text(doc(quote(), { intro: 'Carta de texto propio.' }), preset)).toContain('Carta de texto propio.')
    expect(text(doc(quote(), { intro: 'Carta de texto propio.' }), 'hogar')).not.toContain('Carta de texto propio.')
  })

  it('título y numeración configurables, en todo el documento', () => {
    const data = doc(quote(), { settings: { docTitle: 'budget', numberPrefix: 'COT-', numberPad: 6 } })
    const m = model(data)
    expect(m.docTitle).toBe('Presupuesto')
    expect(m.docNumber).toBe('COT-000412')
    expect(text(data)).toContain('COT-000412')
    expect(model(doc(quote(), { settings: { customTitle: 'Oferta técnica' } })).docTitle).toBe('Oferta técnica')
  })

  it('campos personalizados en el encabezado, solo con valor', () => {
    const settings = { customFields: [{ id: 'oc', label: 'N° de OC' }, { id: 'obra', label: 'N° de obra' }] }
    const t = text(doc(quote({ documentOverrides: { v: 2, fields: { oc: '4500123' } } }), { settings }))
    expect(t).toContain('N° de OC')
    expect(t).toContain('4500123')
    expect(t).not.toContain('N° de obra')
  })
})

describe('compromisos sin inventar', () => {
  it('vacíos no se imprimen ni dejan título huérfano, y el editor avisa cuáles faltan', () => {
    const data = doc(quote())
    const t = text(data)
    for (const word of ['Garantía', 'Forma de pago', 'Vigencia', 'Válida hasta', 'Plazo']) expect(t, word).not.toContain(word)
    expect(quoteDocChecks(model(data)).map((c) => c.code)).toEqual(expect.arrayContaining(['validity', 'warranty', 'payment', 'lead_time', 'conditions']))
  })

  it('escritos, se imprimen tal cual y dejan de avisarse', () => {
    const data = doc(quote({ validUntil: '2026-12-01' }), { warranty: 'Garantía propia de 7 años.', paymentTerms: '30 % de anticipo.', leadTimeText: 'En 40 días.', conditions: '- Sin sorpresas.' })
    const t = text(data)
    expect(t).toContain('Garantía propia de 7 años.')
    expect(quoteDocChecks(model(data)).map((c) => c.code).filter((c) => c !== 'brand_logo' && c !== 'hardware_logo')).toEqual([])
  })

  it('una ayuda aceptada sin completar se avisa', () => {
    const data = doc(quote(), { warranty: 'Garantía de [__] años.' })
    expect(quoteDocChecks(model(data))).toContainEqual({ code: 'blank', field: 'warranty' })
  })

  it('en el editor de plantillas lo vacío se ve como guía, nunca en el PDF', () => {
    const m = buildQuoteModel(doc(quote()), { template: 'hogar', onSectionEdit: () => undefined })
    expect(m.ghost).toBe(true)
    expect(quoteBlocks(m).some((b) => b.key.endsWith(':ghost'))).toBe(true)
    expect(quoteBlocks(model(doc(quote()))).some((b) => b.key.endsWith(':ghost'))).toBe(false)
  })
})

describe('marcas', () => {
  const documents = { brandLogos: { [line.brandId]: 'p1' }, hardwareLogos: [{ id: 'h', name: 'Herrajes Sur', assetId: 'h1' }] }
  const assets = { p1: LOGO, h1: LOGO }
  const html = (data: ReturnType<typeof doc>) => renderToStaticMarkup(createElement(QuoteDocument, { data, template: 'hogar', measure: false }))
  const logos = (s: string) => (s.match(/class="dkd-mark"/g) ?? []).length

  it('la línea va sola: la marca nunca se escribe delante', () => {
    expect(lineSeries('Proline PRO6004', 'Proline')).toBe('PRO6004')
    expect(lineSeries('PRO6004', 'Proline')).toBe('PRO6004')
    expect(lineSeries('Prolineal 60', 'Proline')).toBe('Prolineal 60')
    const d = doc(quote())
    expect(d.items[0].line?.name).toContain(d.items[0].line!.series!)
    expect(text(d)).not.toContain(`PVC ${line.name}`)
  })

  it('sin logo no hay marca en texto y el editor avisa', () => {
    const d = doc(quote())
    const m = model(d)
    expect(logos(html(d))).toBe(0)
    if (d.items[0].line?.brand) {
      expect(m.brandsWithoutLogo).toContain(d.items[0].line.brand)
      expect(quoteDocChecks(m)).toContainEqual({ code: 'brand_logo', brand: d.items[0].line.brand })
    }
  })

  it('ambos, uno o ninguno; una vez o por ítem', () => {
    const count = (settings: Record<string, unknown>) => logos(html(doc(quote(), { ...documents, settings }, assets)))
    expect(count({})).toBe(2)
    expect(count({ brandHardware: false })).toBe(1)
    expect(count({ brandProfile: false })).toBe(1)
    expect(count({ brandProfile: false, brandHardware: false })).toBe(0)
    expect(count({ brandPlacement: 'items' })).toBe(4)
    expect(count({ brandPlacement: 'both' })).toBe(6)
  })

  it('el detalle completo agrega solo lo que el catálogo trae', () => {
    const d = doc(quote(), { settings: { lineDetail: 'full' } })
    const facts = catalog.lines[0].description ?? ''
    if (facts) expect(text(d)).toContain(facts)
  })
})

describe('orden y total', () => {
  const data = () => doc(quote(), { warranty: 'Garantía propia.', paymentTerms: '30 % de anticipo.', conditions: '- Condición propia.' })
  const order = (settings: Record<string, unknown> | null) => {
    const d = doc(quote(), { warranty: 'Garantía propia.', paymentTerms: '30 % de anticipo.', conditions: '- Condición propia.', ...(settings ? { settings } : {}) })
    return text(d, 'obra')
  }

  it('las condiciones van bajo el total por defecto', () => {
    const t = order(null)
    const total = t.indexOf('Total con IVA')
    expect(total).toBeGreaterThan(0)
    expect(t.indexOf('Condición propia')).toBeGreaterThan(total)
    expect(t.indexOf('Garantía propia')).toBeGreaterThan(total)
    expect(t.indexOf('Forma de pago')).toBeGreaterThan(total)
  })

  it('`before_total` las sube; `own_page` las deja al final en su hoja', () => {
    const before = order({ termsPlacement: 'before_total' })
    expect(before.indexOf('Condición propia')).toBeLessThan(before.indexOf('Total con IVA'))
    const own = model(doc(quote(), { conditions: '- Condición propia.', settings: { termsPlacement: 'own_page' } }), 'obra')
    const blocks = quoteBlocks(own)
    const terms = blocks.find((b) => b.sectionType === 'terms')!
    expect(terms.breakBefore).toBe(true)
    expect(blocks.findIndex((b) => b.sectionType === 'acceptance')).toBeLessThan(blocks.findIndex((b) => b.sectionType === 'terms'))
  })

  it('el total nunca va antes de la última ventana', () => {
    for (const preset of ['atelier', 'corporativa', 'obra', 'hogar', 'memoria']) {
      const m = model(data(), preset)
      const blocks = quoteBlocks(m)
      const lastItem = blocks.map((b) => b.sectionType).lastIndexOf('items')
      expect(blocks.findIndex((b) => b.sectionType === 'totals'), preset).toBeGreaterThan(lastItem)
      expect(paginateQuote(m, blocks).overflow, preset).toEqual([])
    }
  })
})

describe('opcionales, alternativas y líneas', () => {
  const q = () =>
    quote({
      items: [
        item('a'),
        item('b', { role: 'optional' }),
        item('c', { role: 'alternative', altGroup: 'Terraza', included: true }),
        item('d', { role: 'alternative', altGroup: 'Terraza', design: fixed(1200, 1200) }),
      ],
      extras: [
        { id: 'x', label: 'Andamio', amount: 1000, line: true, description: 'Armado y retiro.' },
        { id: 'y', label: 'Mantención', amount: 500, role: 'optional' },
      ],
    })

  it('lo que no cuenta se muestra aparte y no suma', () => {
    const d = doc(q())
    const base = doc(quote({ items: [item('a'), item('c')] }))
    expect(d.totals.subtotal).toBe(base.totals.subtotal)
    expect(d.totals.extras).toBe(1000)
    expect(d.items.find((i) => i.id === 'b')).toMatchObject({ role: 'optional', included: false })
    expect(d.items.find((i) => i.id === 'c')).toMatchObject({ role: 'alternative', included: true })
    expect(d.items.find((i) => i.id === 'd')).toMatchObject({ included: false })
    const t = text(d)
    expect(t).toContain('Opcional · No incluido en el total')
    expect(t).toContain('Alternativa de Terraza · Incluido en el total')
    expect(t).toContain('Opcionales y alternativas')
    expect(t).toContain('Mantención')
  })

  it('sin opciones reales la sección no se imprime', () => {
    expect(text(doc(quote()))).not.toContain('Opcionales y alternativas')
  })

  it('el subtotal del grupo solo suma lo que cuenta', () => {
    const groups = quoteDocGroups(doc(q()).items, 'room')
    const d = doc(q())
    const counted = d.items.filter((i) => i.included !== false).reduce((a, i) => a + i.total, 0)
    expect(groups[0].subtotal).toBe(counted)
  })

  it('partida de texto con su detalle, sumada una sola vez', () => {
    const t = text(doc(q()))
    expect(t).toContain('Otras partidas')
    expect(t).toContain('Armado y retiro.')
  })

  it('descuento por línea: precio de lista a la vista y total rebajado', () => {
    const d = doc(quote({ items: [item('a', { discountPct: 10 }), item('b')] }))
    const [a, b] = d.items
    expect(a.lineDiscountPct).toBe(10)
    expect(a.unitPrice).toBe(b.unitPrice)
    expect(a.total).toBe(Math.round(b.total * 0.9))
    expect(d.totals.subtotal).toBe(a.total + b.total)
    expect(text(d)).toContain('−10 %')
  })

  it('un opcional no llega al taller', async () => {
    const { buildWorkshopData } = await import('@dekopen/engine')
    const data = buildWorkshopData(q(), catalog, DEFAULT_PRICING, {})
    expect(data.windows.map((w) => w.ref)).toEqual(['A', 'C'])
  })
})

describe('precio pendiente', () => {
  const pendingDesign = (): WindowDesign => ({ ...fixed(), glassId: 'no-existe' })

  it('nunca como $0 ni como incluido: se rotula y el total lo dice', () => {
    const d = doc(quote({ items: [item('a'), item('b', { design: pendingDesign() })] }))
    expect(d.items[1].pending).toBe('all')
    expect(d.totals.pendingItems).toBe(1)
    const t = text(d)
    expect(t).toContain('Precio por confirmar · No incluido en el total')
    expect(t).toContain('Por confirmar')
    expect(t).toContain('No incluye 1 ítem con precio por confirmar')
    expect(t).not.toMatch(/\$0(?![.,\d])/)
    expect(quoteDocChecks(model(d))).toContainEqual({ code: 'pending_price', count: 1 })
  })

  it('tampoco en la planilla ni en el grupo', () => {
    const d = doc(quote({ items: [item('a', { location: 'Living' }), item('b', { location: 'Bodega', design: pendingDesign() })] }))
    expect(text(d, 'obra')).not.toMatch(/\$0(?![.,\d])/)
    expect(text(d, 'corporativa')).not.toMatch(/\$0(?![.,\d])/)
  })

  it('con el precio fijado al enviar, un cambio de catálogo no lo vuelve pendiente', async () => {
    const { pinQuoteDocPrices } = await import('../../src/data/quote')
    const q = quote({ items: [item('a', { design: pendingDesign() })] })
    const pinned = pinQuoteDocPrices(doc(q), q, { a: { unitNet: 5000, totalNet: 5000 } })
    expect((pinned.items[0] as { pending?: string }).pending).toBeUndefined()
  })
})

describe('personalización', () => {
  it('precios: unitario y por ítem, por ítem, por grupo o solo total', () => {
    const preset = getDocPreset('obra')
    const items = preset.sections.find((s) => s.type === 'items')!
    Object.assign(items.options, { showUnitPrices: false, showLineTotals: false })
    const d = doc(quote())
    const t = text(d, preset)
    expect(t).not.toContain('Unitario')
    // La cifra de la ventana no aparece: el precio queda solo en el cierre.
    const price = d.items[0].total.toLocaleString('es-CL')
    expect(t).not.toContain(`$${price}`)
  })

  it('con impuesto, el precio de la línea sale del motor', () => {
    const preset = getDocPreset('obra')
    Object.assign(preset.sections.find((s) => s.type === 'items')!.options, { priceTax: 'gross' })
    const d = doc(quote())
    expect(text(d, preset)).toContain('Con IVA')
  })

  it('agrupa por piso y por línea, con recinto como respaldo de datos antiguos', () => {
    const d = doc(quote({ items: [item('a', { floor: 'Piso 1' }), item('b', { floor: 'Piso 1' }), item('c', { floor: 'Piso 2' })] }))
    expect(d.document?.groupsByFloor?.map((g) => g.label)).toEqual(['Piso 1', 'Piso 2'])
    const preset = getDocPreset('corporativa')
    const t = text(d, preset)
    expect(t).toContain('Piso 1')
    expect(t).toContain('Subtotal Piso 1')
    const legacy = doc(quote({ items: [item('a', { location: 'Piso 1' }), item('b', { location: 'Piso 1' }), item('c', { location: 'Piso 2' })] }))
    expect(text(legacy, preset)).toContain('Subtotal Piso 1')
  })

  it('cada dato por ítem se puede apagar', () => {
    const preset = getDocPreset('hogar')
    Object.assign(preset.sections.find((s) => s.type === 'items')!.options, { showRef: false, showSize: false, showOpening: false, showSystem: false })
    const t = text(doc(quote()), preset)
    expect(renderToStaticMarkup(createElement(QuoteDocument, { data: doc(quote()), template: preset, measure: false }))).not.toContain('dkd-ihead__ref')
    expect(t).not.toContain('Apertura')
    expect(t).not.toContain('Línea')
  })
})

describe('siete idiomas', () => {
  it.each(['en', 'pt', 'fr', 'de', 'it', 'tr'] as const)('%s sin restos en español', (locale) => {
    const q = quote({ items: [item('a'), item('b', { role: 'optional' })] })
    const t = renderToStaticMarkup(createElement(QuoteDocument, { data: doc(q), template: 'hogar', locale, measure: false })).replace(/<style[\s\S]*?<\/style>/g, ' ')
    expect(t).not.toMatch(/No incluido|Alcance|Ventanas y puertas/)
  })
})

describe('conteo veraz y cierre', () => {
  const units = (n: number) => Array.from({ length: n }, (_, i) => ({ id: String.fromCharCode(65 + i), typologyId: 'fixed', width: 1000, height: 1000 }))

  it('un conjunto cuenta por sus unidades, no como una sola', () => {
    const data = doc(quote())
    const withAssembly = { ...data, items: data.items.map((row, i) => (i === 0 ? { ...row, assembly: { kind: 'flat', units: units(9), joints: [] } } : row)) } as typeof data
    const plain = text(withAssembly, 'atelier')
    expect(plain).toContain('2 ítems, 10 unidades')
    expect(plain).not.toContain('2 ventanas, 2 unidades')
  })

  it('«Qué incluye» nombra lo que quedó por confirmar', () => {
    const data = doc(quote())
    const pending = { ...data, items: data.items.map((row, i) => (i === 1 ? { ...row, pending: 'all' as const } : row)), totals: { ...data.totals, pendingItems: 1 } } as typeof data
    const template = getDocPreset('hogar')
    const decision = { ...template, sections: template.sections.map((sec) => (sec.type === 'totals' ? { ...sec, options: { ...sec.options, variant: 'decision' } } : sec)) } as DocTemplate
    const plain = text(pending, decision)
    expect(plain).toContain('1 ventana a medida')
    expect(plain).toContain('Por confirmar, fuera de este total: B')
  })
})

describe('lo que lee el cliente', () => {
  const door = createDesign('door', { lineId: line.id, width: 900, height: 2100, colorId: line.colorIds[0], glassId: glass.id })

  it('cuenta puertas y ventanas por su nombre, y las unidades solo si dicen algo más', () => {
    const both = text(doc(quote({ items: [item('a'), item('b'), item('c', { design: door })] })))
    expect(both).toContain('2 ventanas y 1 puerta')
    expect(both).not.toContain('3 unidades')
    expect(text(doc(quote({ items: [item('a', { qty: 3 })] })))).toContain('1 ventana de PVC, 3 unidades')
  })

  it('sin descuento ni extras no repite la misma cifra como subtotal y neto', () => {
    expect(text(doc(quote()))).not.toContain('Subtotal')
    expect(text(doc(quote({ discountPct: 10 })))).toContain('Subtotal')
  })

  it('un color igual por dentro y por fuera ocupa una sola fila', () => {
    const t = text(doc(quote()))
    expect(t).toContain('Color')
    expect(t).not.toMatch(/Exterior .* Interior /)
  })
})

describe('última hoja', () => {
  const block = (key: string, sectionType: string, height: number, sectionId = sectionType): FlowBlock => ({ key, sectionId, sectionType, node: null, height, space: 10 })

  it('las condiciones bajan enteras a acompañar la firma si la última hoja queda casi vacía', () => {
    const blocks = [block('tot', 'totals', 500), block('t0', 'terms', 200), block('t1', 'terms', 200), block('t2', 'terms', 120), block('acc', 'acceptance', 300)]
    const { pages } = paginateFlow(blocks, { lead: 1000, rest: 1000, cover: 1000 }, (b) => b.height)
    expect(pages.map((p) => p.blocks.map((b) => b.block.key))).toEqual([['tot'], ['t0', 't1', 't2', 'acc']])
  })

  it('nunca mueve el total ni deja la hoja anterior casi vacía', () => {
    const blocks = [block('tot', 'totals', 950), block('acc', 'acceptance', 300)]
    const { pages } = paginateFlow(blocks, { lead: 1000, rest: 1000, cover: 1000 }, (b) => b.height)
    expect(pages.map((p) => p.blocks.map((b) => b.block.key))).toEqual([['tot'], ['acc']])
  })
})
