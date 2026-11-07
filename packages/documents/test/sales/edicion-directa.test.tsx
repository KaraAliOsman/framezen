import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { createDesign, DEFAULT_PRICING, type WindowDesign } from '@dekopen/engine'
import { applyDocOps, getDocPreset, QUOTE_PRESET_IDS, type DocOp, type DocTemplate, type Org, type Quote, type QuoteItem } from '@dekopen/shared'
import { buildQuoteDocData } from '../../src/data/quote'
import { QuoteDocument } from '../../src/sales'
import { sampleWorkshopCatalog } from '../../src/workshop/sample'

const catalog = sampleWorkshopCatalog()
const line = catalog.lines[0]
const glass = catalog.glass[0]
const LOGO = 'data:image/png;base64,iVBORw0KGgo='
const ASSET = 'img_0123456789abcdef'
const org = { id: 'o', name: 'Ventanas del Sur', createdAt: '2026-01-01T00:00:00.000Z' } as Org
const fixed = (): WindowDesign => createDesign('fixed', { lineId: line.id, width: 1000, height: 1000, colorId: line.colorIds[0], glassId: glass.id })
const item = (id: string): QuoteItem => ({ id, ref: id.toUpperCase(), qty: 1, design: fixed() })
const quote = { id: 'q', number: 412, title: 'Casa Muñoz', status: 'draft', items: [item('a'), item('b')], extras: [], discountPct: 0, revision: 0, version: 1, createdAt: '2026-10-01T12:00:00.000Z', updatedAt: '2026-10-02T12:00:00.000Z' } as unknown as Quote
const documents = { warranty: '5 años en perfiles y 1 año en herrajes.', paymentTerms: '50% al aceptar y 50% contra entrega', conditions: 'Primero.\n\nSegundo.', leadTimeText: '20 días hábiles' }
const data = (assets?: Record<string, string>) => buildQuoteDocData({ quote, org, catalog, settings: { pricing: DEFAULT_PRICING, documents: documents as never }, ...(assets ? { assets } : {}) })

function html(template: DocTemplate, props: Record<string, unknown> = {}, assets?: Record<string, string>): string {
  return renderToStaticMarkup(createElement(QuoteDocument, { data: data(assets), template, measure: false, ...props })).replace(/<style[\s\S]*?<\/style>/g, ' ')
}
const plain = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

function withOps(preset: string, ops: unknown[]): DocTemplate {
  const result = applyDocOps(getDocPreset(preset as 'hogar'), ops, { mode: 'atomic' })
  expect(result.issues.filter((i) => i.severity === 'error')).toEqual([])
  return result.result
}
const display = (patch: Record<string, unknown>) => ({ op: 'setItemDisplay', patch }) as DocOp

describe('una cotización sin dibujo', () => {
  it.each(['table', 'cards', 'sheet', 'gallery', 'per_page'])('«%s» no imprime la ventana y sigue mostrando sus datos', (variant) => {
    const base = getDocPreset('hogar').sections.find((s) => s.type === 'items')!
    const template = withOps('hogar', [{ op: 'updateSectionOptions', sectionId: base.id, options: { variant } }, display({ drawingSize: 'none' })])
    const out = html(template)
    expect(out).not.toContain('data-dk-el="drawing"')
    expect(out).not.toContain('dkd-well')
    expect(out).toContain('$')
    expect(plain(out)).toContain('A')
  })

  it('sin dibujo no ocupa una hoja por ventana', () => {
    const base = getDocPreset('hogar').sections.find((s) => s.type === 'items')!
    const template = withOps('hogar', [{ op: 'updateSectionOptions', sectionId: base.id, options: { variant: 'per_page' } }, display({ drawingSize: 'none' })])
    expect(html(template)).not.toContain('data-dk-own')
  })

  it('un tamaño que no existe se rechaza', () => {
    const result = applyDocOps(getDocPreset('hogar'), [display({ drawingSize: 'gigante' })], { mode: 'atomic' })
    expect(result.ok).toBe(false)
  })
})

describe('datos de cada ventana', () => {
  it('apagar las especificaciones las quita de la hoja', () => {
    expect(html(getDocPreset('hogar'))).toContain('data-dk-el="showSpecs"')
    expect(html(withOps('hogar', [display({ showSpecs: false, showSize: false })]))).not.toContain('data-dk-el="showSpecs"')
  })

  it('la imagen del vidrio se apaga sin quitar su nombre', () => {
    const out = html(withOps('hogar', [display({ showGlassImage: false })]))
    expect(out).not.toContain('data-dk-el="showGlassImage"')
    expect(out).toContain('data-dk-el="showGlass"')
  })

  it('la ficha técnica también obedece: lo apagado no vuelve', () => {
    const base = getDocPreset('hogar').sections.find((s) => s.type === 'items')!
    const template = withOps('hogar', [{ op: 'updateSectionOptions', sectionId: base.id, options: { variant: 'sheet', drawingSize: 'l' } }, display({ showGlass: false, showSystem: false })])
    const out = html(template)
    expect(out).not.toContain('data-dk-el="showGlass"')
    expect(out).not.toContain('data-dk-el="showSystem"')
  })

  it('el corte del vidrio en capas se puede quitar y queda su descripción', () => {
    const specs = withOps('hogar', [{ op: 'addSection', section: { type: 'technical_specs', options: { variant: 'glass_layers' } } }])
    const id = specs.sections.find((s) => s.type === 'technical_specs')!.id
    expect(html(specs)).toContain('dkd-layers__svg')
    const off = applyDocOps(specs, [{ op: 'updateSectionOptions', sectionId: id, options: { showGlassImage: false } }], { mode: 'atomic' }).result
    expect(html(off)).not.toContain('dkd-layers__svg')
    expect(html(off)).toContain('dkd-layers__name')
  })

  it('ocultar la sección técnica la saca entera', () => {
    const specs = withOps('hogar', [{ op: 'addSection', section: { type: 'technical_specs' } }])
    const id = specs.sections.find((s) => s.type === 'technical_specs')!.id
    const off = applyDocOps(specs, [{ op: 'toggleSection', sectionId: id, enabled: false }], { mode: 'atomic' }).result
    expect(html(off)).not.toContain(`data-dk-section="${id}"`)
  })
})

describe('logo del documento', () => {
  it('un logo propio reemplaza al de la empresa; sin la imagen vuelve el nombre', () => {
    const template = withOps('hogar', [{ op: 'setDocSettings', patch: { logoAssetId: ASSET } }])
    expect(html(template, {}, { [ASSET]: LOGO })).toContain(LOGO)
    expect(html(template)).toContain('dkd-wordmark')
  })

  it('el logo se puede quitar del encabezado', () => {
    const template = withOps('hogar', [{ op: 'setDocSettings', patch: { showLogo: false } }])
    expect(html(template)).not.toContain('data-dk-image="logo"')
  })
})

describe('lo que se edita es lo que se imprime', () => {
  const noop = () => undefined
  const editing = { editable: true, onEdit: noop, onSectionEdit: noop, guides: false }
  // Sin el guión de lo vacío, la hoja editable y la impresa dicen lo mismo.
  const filled = { ...documents, intro: 'Hola.', signatureName: 'Rosa', includes: 'Instalación', excludes: 'Obras civiles', footer: 'Pie', validityDays: 15 }

  it.each(QUOTE_PRESET_IDS)('«%s» muestra en edición las mismas cifras y cuotas', (preset) => {
    const d = buildQuoteDocData({ quote: { ...quote, documentOverrides: { v: 2, texts: { clientNote: 'Nota para el cliente.' } } } as unknown as Quote, org, catalog, settings: { pricing: DEFAULT_PRICING, documents: filled as never } })
    const printed = renderToStaticMarkup(createElement(QuoteDocument, { data: d, template: preset, measure: false }))
    const edited = renderToStaticMarkup(createElement(QuoteDocument, { data: d, template: preset, measure: false, ...editing }))
    const money = (markup: string) => (plain(markup.replace(/<style[\s\S]*?<\/style>/g, ' ')).match(/\$[\d.]+/g) ?? []).join(' ')
    expect(money(edited)).toBe(money(printed))
    expect((edited.match(/dkd-page\b/g) ?? []).length).toBe((printed.match(/dkd-page\b/g) ?? []).length)
  })

  it('los marcadores se ven resueltos hasta entrar al campo', () => {
    const d = buildQuoteDocData({ quote, org, catalog, settings: { pricing: DEFAULT_PRICING, documents: { ...documents, warranty: 'Para {quote.title}.' } as never } })
    const out = renderToStaticMarkup(createElement(QuoteDocument, { data: d, template: 'hogar', measure: false, ...editing }))
    expect(out).toContain('Para')
    expect(plain(out)).toContain('Casa Muñoz')
    expect(plain(out)).not.toContain('{quote.title}')
  })

  it('el total aparece una sola vez, también con todo editable', () => {
    const total = plain(html(getDocPreset('hogar'))).match(/Total con IVA/g) ?? []
    expect(total.length).toBeGreaterThan(0)
    const d = data()
    const figure = d.totals.total.toLocaleString('es-CL')
    const edited = plain(renderToStaticMarkup(createElement(QuoteDocument, { data: d, template: 'hogar', measure: false, ...editing })).replace(/<style[\s\S]*?<\/style>/g, ' '))
    expect(edited.split(figure).length - 1).toBe(1)
  })
})
