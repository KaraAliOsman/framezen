import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { computeLayout } from '@framezen/engine'
import type { QuoteTemplateId } from '@framezen/shared'
import { formatClp } from '../../src/base'
import { renderDocumentHtml } from '../../src/render'
import { QUOTE_TEMPLATES, QuoteDocument, SAMPLE_QUOTE_DOC, buildSampleQuoteDoc, describeOpening, type QuoteDocData } from '../../src/sales'

const TEMPLATES: QuoteTemplateId[] = ['esencial', 'galeria', 'compacta', 'editorial']
const render = (data: QuoteDocData, template: QuoteTemplateId, editable = false) =>
  renderToStaticMarkup(<QuoteDocument data={data} template={template} editable={editable} onEdit={editable ? () => undefined : undefined} />)
const pages = (html: string) => (html.match(/class="fzd-page[ "]/g) ?? []).length

describe('QuoteDocument', () => {
  it('ofrece los cuatro diseños', () => {
    expect(QUOTE_TEMPLATES.map((t) => t.id)).toEqual(TEMPLATES)
  })

  it.each(TEMPLATES)('«%s» muestra lo esencial de la cotización', (template) => {
    const data = SAMPLE_QUOTE_DOC
    const html = render(data, template)
    expect(html).toContain('fzd-quote--' + template)
    expect(html).toContain('412')
    expect(html).toContain('Carolina Muñoz')
    expect(html).toContain('Casa Muñoz · Puerto Varas')
    expect(html).toContain(formatClp(data.totals.total))
    expect(html).toContain(formatClp(data.totals.iva))
    for (const item of data.items) {
      expect(html).toContain(`>${item.ref}<`)
      expect(html).toContain(formatClp(item.total))
    }
    expect(html).toContain('Página 1 de ' + pages(html))
    expect(html).toContain('Condiciones')
    expect(html).toContain('Garantía')
    expect(html).toContain('15 de noviembre de 2026')
    // Cuotas calculadas de la forma de pago (50 % / 50 %).
    expect(html).toContain('Al aceptar')
    expect(html).toContain('Firma del cliente')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('undefined')
    expect(html).not.toMatch(/contenteditable/i)
  })

  it.each(TEMPLATES)('«%s» respeta las preferencias de qué mostrar', (template) => {
    const data = buildSampleQuoteDoc({ prefs: { showUnitPrice: false, showGlass: false, showLine: false, showArea: false, showColorSwatch: false, showExteriorView: false } })
    const html = render(data, template)
    const v2 = data.items[1] // 2 unidades: unitario ≠ total
    expect(html).toContain(formatClp(v2.total))
    expect(html).not.toContain(formatClp(v2.unitPrice))
    expect(html).not.toContain('Termopanel 4-12-4')
    expect(html).not.toContain('PVC Serie 60')
    expect(html).not.toContain('fzd-swatch')
    expect(html).not.toContain('vista exterior')
    expect(html).not.toContain(' c/u')
  })

  it('con todo activado se ven unitario, vidrio, línea, muestras y vista exterior', () => {
    for (const template of TEMPLATES) {
      const html = render(SAMPLE_QUOTE_DOC, template)
      expect(html, template).toContain('Termopanel 4-12-4')
      expect(html, template).toContain('PVC Serie 60')
      expect(html, template).toContain('fzd-swatch')
      expect(html, template).toContain('vista exterior')
    }
    expect(render(SAMPLE_QUOTE_DOC, 'esencial')).toContain(formatClp(SAMPLE_QUOTE_DOC.items[1].unitPrice))
  })

  it.each(TEMPLATES)('«%s» permite editar los textos en pantalla', (template) => {
    const html = render(SAMPLE_QUOTE_DOC, template, true)
    for (const field of ['intro', 'conditions', 'paymentTerms', 'warranty', 'leadTimeText', 'validityDays', 'title']) {
      expect(html, field).toContain(`data-field="${field}"`)
    }
    expect(html).toMatch(/contenteditable="plaintext-only"/i)
  })

  it('editorial: portada, una página por ventana y cierre con firma', () => {
    const html = render(SAMPLE_QUOTE_DOC, 'editorial')
    expect(pages(html)).toBeGreaterThanOrEqual(1 + SAMPLE_QUOTE_DOC.items.length + 1)
    expect(html).toContain('Propuesta de ventanas')
    expect(html).toContain('Vista exterior')
    expect(html).toContain('Aceptación y firma')
    expect(html).toContain('Apertura')
  })

  it('galería: portada con la fachada de ventanas y tarjetas', () => {
    const html = render(SAMPLE_QUOTE_DOC, 'galeria')
    expect(html).toContain('fzd-elevation')
    expect(html).toContain('Propuesta para')
    expect((html.match(/fzd-ga-card"/g) ?? []).length).toBe(SAMPLE_QUOTE_DOC.items.length)
  })

  it('compacta: 20 ventanas en dos hojas y 24 en tres como máximo', () => {
    const twenty = render(buildSampleQuoteDoc({ items: 20 }), 'compacta')
    expect(pages(twenty)).toBeLessThanOrEqual(2)
    expect(twenty).toContain('>V20<')
    const many = render(buildSampleQuoteDoc({ items: 24 }), 'compacta')
    expect(pages(many)).toBeLessThanOrEqual(3)
  })

  it('esencial: la última hoja nunca queda solo con condiciones y firma si se puede evitar', () => {
    const lastPage = (html: string) => html.split(/class="fzd-page[ "]/).pop() ?? ''
    for (const items of [2, 3, 4, 5, 8, 9]) {
      const html = render(buildSampleQuoteDoc({ items }), 'esencial')
      expect(lastPage(html), `${items} ventanas`).toMatch(/fzd-es-row|fzd-es-close/)
    }
    // 5 ventanas: filas densas y la firma junto a los totales → 2 hojas en vez de 3.
    const five = render(buildSampleQuoteDoc({ items: 5 }), 'esencial')
    expect(pages(five)).toBe(2)
    expect(five).toContain('fzd-es-row--dense')
    expect(five).toContain('fzd-accept--inline')
    expect(five).toContain('Firma del cliente')
    // Si no hace falta, queda el diseño amplio con la firma al final, a todo el ancho.
    const three = render(buildSampleQuoteDoc({ items: 3 }), 'esencial')
    expect(three).not.toContain('fzd-es-row--dense')
    expect(three).not.toContain('fzd-accept--inline')
    expect(three).toContain('Firma del cliente')
  })

  it('editorial: la firma va junto a los totales solo si así el cierre ahorra una hoja', () => {
    const seven = render(buildSampleQuoteDoc({ items: 7 }), 'editorial')
    expect(pages(seven)).toBe(9) // portada + 7 ventanas + 1 hoja de cierre
    expect(seven).toContain('fzd-accept--inline')
    expect(seven).toContain('Aceptación y firma')
    const three = render(buildSampleQuoteDoc({ items: 3 }), 'editorial')
    expect(three).not.toContain('fzd-accept--inline')
    expect(three).toContain('Aceptación y firma')
  })

  it('compacta: una obra de 5 ventanas cabe en una hoja, con la firma junto a los totales', () => {
    for (const items of [4, 5]) {
      const html = render(buildSampleQuoteDoc({ items }), 'compacta')
      expect(pages(html), `${items} ventanas`).toBe(1)
      expect(html).toContain('fzd-accept--inline')
      expect(html).toContain('Firma del cliente')
    }
  })

  it.each(TEMPLATES)('«%s» sin cliente omite el bloque «Para» (sin guiones sueltos)', (template) => {
    const data: QuoteDocData = { ...SAMPLE_QUOTE_DOC, client: undefined }
    const html = render(data, template)
    const plain = html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    expect(plain).not.toMatch(/Para —|Cliente —|Contacto —/)
    expect(plain).not.toContain('Propuesta para')
    expect(html).not.toContain('Carolina')
    if (template === 'esencial') {
      expect(html).toContain('fzd-es-strip--noclient')
      expect(plain).not.toMatch(/\bPara\b/)
    }
    if (template === 'compacta') {
      expect(html).toContain('fzd-co-strip--2')
      expect(plain).not.toContain('Cliente')
    }
    // Con cliente, el bloque sí aparece.
    expect(render(SAMPLE_QUOTE_DOC, template)).toContain('Carolina Muñoz')
  })

  it.each(['galeria', 'editorial'] as const)('«%s»: la superficie de la portada es la misma de los totales (2 decimales)', (template) => {
    const data: QuoteDocData = { ...SAMPLE_QUOTE_DOC, totals: { ...SAMPLE_QUOTE_DOC.totals, area: 10.5833 } }
    const html = render(data, template)
    expect(html).toContain('10,58')
    expect(html).not.toMatch(/10,6\s?m²/)
  })

  it('funciona sin cliente, sin ítems y sin textos (nunca bloquea)', () => {
    const empty: QuoteDocData = {
      ...SAMPLE_QUOTE_DOC,
      client: undefined,
      items: [],
      extras: [],
      prefs: { ...SAMPLE_QUOTE_DOC.prefs, intro: '', conditions: '', paymentTerms: '', warranty: '', leadTimeText: '', footer: undefined, signatureName: undefined },
      totals: { ...SAMPLE_QUOTE_DOC.totals, subtotal: 0, discount: 0, discountPct: 0, extras: 0, net: 0, iva: 0, total: 0, units: 0, area: 0 },
      quote: { ...SAMPLE_QUOTE_DOC.quote, notes: undefined, validUntil: undefined },
    }
    for (const template of TEMPLATES) {
      const html = render(empty, template)
      expect(html, template).toContain('$0')
      expect(html, template).not.toContain('NaN')
      expect(html, template).not.toContain('Carolina')
    }
  })

  it('revisión B, aceptación en línea y papel A4', () => {
    const data = buildSampleQuoteDoc({ prefs: { paper: 'a4', font: 'serif', accent: '#0F5E5A' } })
    data.quote = { ...data.quote, revision: 2, acceptedBy: { name: 'Carolina Muñoz', at: '2026-11-03T12:00:00Z' } }
    const html = render(data, 'esencial')
    expect(html).toContain('412 · Rev. B')
    expect(html).toContain('Aceptada en línea')
    expect(html).toContain('data-paper="a4"')
    expect(html).toContain('Fraunces')
    expect(html).toContain('--fzd-accent:#0F5E5A')
  })

  it('HTML completo listo para Chromium', () => {
    const html = renderDocumentHtml(<QuoteDocument data={SAMPLE_QUOTE_DOC} template="galeria" />, { title: 'Cotización N° 412' })
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('@page { size: letter; margin: 0; }')
    expect(html).toContain('.fzd-ga-card')
  })

  it('con la geometría real del motor (computeLayout) se renderizan las cuatro plantillas', () => {
    const data = buildSampleQuoteDoc({ layout: computeLayout, items: 12 })
    for (const template of TEMPLATES) {
      const html = render(data, template)
      expect(html, template).toContain('>V12<')
      expect(html, template).not.toContain('NaN')
    }
  })

  it('describe la apertura en lenguaje de cliente', () => {
    expect(describeOpening(SAMPLE_QUOTE_DOC.items[0].design)).toBe('2 hojas correderas, 2 rieles')
    expect(describeOpening(SAMPLE_QUOTE_DOC.items[2].design)).toBe('Fijo + abatible hacia adentro con bisagras a la derecha')
  })
})

describe('datos de muestra', () => {
  it('el cliente de muestra usa el RUT de prueba conocido, nunca uno que pueda ser de una persona real', () => {
    // 15.678.234-3 (el anterior) tiene dígito verificador válido y cae en un rango de RUT ya asignado.
    expect(SAMPLE_QUOTE_DOC.client?.rut).toBe('12.345.678-5')
    expect(render(SAMPLE_QUOTE_DOC, 'esencial')).not.toContain('15.678.234')
  })
})
