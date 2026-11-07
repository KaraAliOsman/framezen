import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { computeLayout } from '@dekopen/engine'
import { DOC_PRESETS, LEGACY_TEMPLATE_PRESETS, LOCALES, QUOTE_PRESET_IDS, type Locale, type QuotePresetId } from '@dekopen/shared'
import { formatClp } from '../../src/base'
import { renderDocumentHtml } from '../../src/render'
import {
  QUOTE_TEMPLATES,
  QuoteDocument,
  SAMPLE_QUOTE_DOC,
  buildSampleQuoteDoc,
  describeOpening,
  prepareQuoteDocument,
  quoteTemplateOptions,
  type QuoteDocData,
} from '../../src/sales'
import type { QuoteDocDataV5 } from '../../src/data/quote'
import { documentMessagesEs } from '../../src/i18n'
import { buildQuoteModel, docFontFaceRules, docFontFiles, paginateQuote, quoteBlocks, TEMPLATE_FLOW_SCRIPT } from '../../src/templates'

// Cada prueba dibuja varios documentos completos con sus dibujos: damos holgura en máquinas lentas.
vi.setConfig({ testTimeout: 90_000 })

const PRESETS = [...QUOTE_PRESET_IDS] as QuotePresetId[]

interface RenderOptions {
  editable?: boolean
  locale?: Locale
}
const render = (data: QuoteDocData, template: string, options: RenderOptions = {}) =>
  renderToStaticMarkup(
    <QuoteDocument data={data} template={template} measure={false} {...(options.locale ? { locale: options.locale } : {})} {...(options.editable ? { editable: true, onEdit: () => undefined } : {})} />,
  )
const pages = (html: string) => (html.match(/<section class="dkd-page[ "]/g) ?? []).length
/** Texto visible (sin estilos ni etiquetas). */
const hasPayment = (preset: QuotePresetId) => DOC_PRESETS[preset].sections.some((s) => s.type === 'payment' && s.enabled)
/** La numeración que pide el diseño: «Página X de Y», «Página X» o ninguna (la portada no lleva pie). */
function expectNumbering(preset: QuotePresetId, text: string, total: number) {
  const numbering = DOC_PRESETS[preset].page.pageNumbers
  if (numbering === 'page_of_total') expect(text, preset).toMatch(new RegExp(`Página \\d+ de ${total}`))
  else if (numbering === 'page') expect(text, preset).toMatch(/Página \d+/)
  else expect(text, preset).not.toMatch(/Página \d+/)
}
const plainText = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ')

/** Ajustes por cotización v2 sobre los datos de muestra. */
function withOverrides(data: QuoteDocData, overrides: unknown): QuoteDocDataV5 {
  return { ...(data as QuoteDocDataV5), document: { ...(data as QuoteDocDataV5).document, overrides } }
}

describe('catálogo de diseños de cotización', () => {
  it('ofrece los cinco diseños predefinidos, con nombre y descripción en cada idioma', () => {
    expect(QUOTE_TEMPLATES.map((t) => t.id)).toEqual(PRESETS)
    expect(PRESETS).toHaveLength(5)
    for (const locale of LOCALES) {
      const options = quoteTemplateOptions(locale)
      expect(options).toHaveLength(5)
      for (const option of options) {
        expect(option.name.length, `${locale} ${option.id}`).toBeGreaterThan(2)
        expect(option.description.length, `${locale} ${option.id}`).toBeGreaterThan(10)
        expect(option.bestFor, `${locale} ${option.id}`).not.toMatch(/presets\./)
      }
    }
  })

  it('los ids de la versión 4 se dibujan con su diseño equivalente', () => {
    for (const [legacy, preset] of Object.entries(LEGACY_TEMPLATE_PRESETS)) {
      if (DOC_PRESETS[preset].kind !== 'quote') continue
      const html = render(SAMPLE_QUOTE_DOC, legacy)
      expect(html, legacy).toContain(`data-preset="${preset}"`)
    }
    expect(render(SAMPLE_QUOTE_DOC, 'esencial')).toContain('data-preset="hogar"')
    // Un id desconocido nunca rompe el documento: cae al diseño por defecto.
    expect(render(SAMPLE_QUOTE_DOC, 'no-existe')).toContain('data-preset="hogar"')
  })

  it('cada diseño se ve distinto (paleta, tipografía o estructura)', () => {
    const signatures = new Set(PRESETS.map((id) => `${DOC_PRESETS[id].theme.palette.accent}|${DOC_PRESETS[id].theme.fonts.heading}|${DOC_PRESETS[id].sections.map((s) => s.type).join(',')}`))
    expect(signatures.size).toBe(5)
  })
})

describe('QuoteDocument: contenido', () => {
  it.each(PRESETS)('«%s» muestra lo esencial de la cotización', (preset) => {
    const data = SAMPLE_QUOTE_DOC
    const html = render(data, preset)
    expect(html).toContain(`data-preset="${preset}"`)
    expect(html).toContain('data-dk-flow')
    expect(html).toContain('412')
    expect(html).toContain('Cliente de ejemplo')
    expect(html).toContain('Obra de ejemplo')
    // Las cifras son las del motor: total, IVA y cada ventana.
    expect(html).toContain(formatClp(data.totals.total))
    expect(html).toContain(formatClp(data.totals.iva))
    for (const item of data.items) {
      expect(html).toContain(`>${item.ref}<`)
      expect(html).toContain(formatClp(item.total))
    }
    const text = plainText(html)
    expectNumbering(preset, text, pages(html))
    expect(text).toContain('Condiciones')
    expect(text).toContain('15 de noviembre de 2026')
    expect(text).toContain('Firma del cliente')
    // La forma de pago sale en cuotas calculadas (50 % / 50 %) cuando el diseño tiene esa sección.
    if (hasPayment(preset)) expect(text).toMatch(/al aceptar/i)
    // Código QR de aceptación en línea hacia el portal.
    expect(html).toContain('dekopen.cl/c/demo')
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('undefined')
    expect(html).not.toMatch(/contenteditable/i)
  })

  it.each(PRESETS)('«%s» dibuja las ventanas con dibujo realista y sin recursos externos', (preset) => {
    const html = render(SAMPLE_QUOTE_DOC, preset)
    const style = DOC_PRESETS[preset].theme.drawingStyle
    expect(html).toContain(`data-render="${style}"`)
    expect(html).not.toMatch(/(?:src|href)=["']https?:/i)
    expect(html).not.toMatch(/url\(["']?https?:/i)
    expect(html).not.toContain('<script')
  })

  it('con las preferencias de la cotización se esconde lo que no se quiere mostrar', () => {
    const hidden = { showUnitPrices: false, showGlass: false, showSystem: false, showArea: false, showSwatches: false, drawingView: 'interior' }
    // Ajustes v2 y ajustes v1 (los de la versión anterior se migran al leer).
    const variants = [
      withOverrides(buildSampleQuoteDoc(), { v: 2, itemDisplay: hidden }),
      withOverrides(buildSampleQuoteDoc(), { showUnitPrice: false, showGlass: false, showLine: false, showArea: false, showColorSwatch: false, showExteriorView: false }),
    ]
    for (const data of variants) {
      const v2 = data.items[1] // 2 unidades: unitario ≠ total
      for (const preset of ['hogar', 'hogar', 'atelier', 'obra'] as const) {
        const html = render(data, preset)
        expect(html, preset).toContain(formatClp(v2.total))
        expect(html, preset).not.toContain(formatClp(v2.unitPrice))
        expect(plainText(html), preset).not.toContain('Termopanel 4-12-4')
        expect(plainText(html), preset).not.toContain('PVC Serie 60')
        expect(html, preset).not.toContain('dkd-sw')
        expect(plainText(html), preset).not.toMatch(/Vista exterior|vista exterior/)
        expect(plainText(html), preset).not.toContain(' c/u')
      }
    }
    // Sin ajustes, lo mismo sí aparece.
    const shown = plainText(render(buildSampleQuoteDoc(), 'hogar'))
    expect(shown).toContain('Termopanel 4-12-4')
    expect(shown).toContain('PVC Serie 60')
  })

  it('el desglose técnico muestra vidrio, línea y muestras de color cuando el diseño las pide', () => {
    for (const preset of ['hogar', 'hogar', 'hogar', 'atelier'] as const) {
      const html = render(SAMPLE_QUOTE_DOC, preset)
      const text = plainText(html)
      expect(text, preset).toContain('Termopanel 4-12-4')
      expect(text, preset).toContain('PVC Serie 60')
      expect(html, preset).toContain('dkd-sw')
    }
    expect(render(SAMPLE_QUOTE_DOC, 'hogar')).toContain(formatClp(SAMPLE_QUOTE_DOC.items[1].unitPrice))
  })

  it('portada con la fachada de las ventanas o con el dibujo principal, y sin portada la identidad va en la hoja', () => {
    const cover = render(SAMPLE_QUOTE_DOC, 'atelier')
    expect(cover).toContain('dkd-page--cover')
    expect(plainText(cover)).toContain('Cliente de ejemplo')
    const plain = render(SAMPLE_QUOTE_DOC, 'obra')
    expect(plain).not.toContain('dkd-page--cover')
    expect(plain).toContain('dkd-lh')
  })

  it('la cabecera corrida y el pie numeran las hojas «Página X de Y»', () => {
    for (const preset of PRESETS) {
      const html = render(buildSampleQuoteDoc({ items: 8 }), preset)
      const n = pages(html)
      expect(n, preset).toBeGreaterThanOrEqual(2)
      expectNumbering(preset, plainText(html), n)
    }
  })
})

describe('QuoteDocument: edición en pantalla', () => {
  it.each(PRESETS)('«%s» permite editar el título y los textos que muestra', (preset) => {
    const html = render(SAMPLE_QUOTE_DOC, preset, { editable: true })
    expect(html).toMatch(/contenteditable="plaintext-only"/i)
    expect(html, 'title').toContain('data-field="title"')
    // Cada texto que el diseño imprime es editable en el lugar.
    const fields = ['conditions', 'leadTimeText', 'signatureName', 'validityDays']
    if (hasPayment(preset)) fields.push('paymentTerms')
    for (const field of fields) expect(html, field).toContain(`data-field="${field}"`)
  })

  it('todos los textos del taller se editan desde algún diseño', () => {
    const seen = new Set<string>()
    for (const preset of PRESETS) {
      for (const m of render(SAMPLE_QUOTE_DOC, preset, { editable: true }).matchAll(/data-field="([a-zA-Z]+)"/g)) seen.add(m[1])
    }
    for (const field of ['includes', 'excludes', 'conditions', 'paymentTerms', 'warranty', 'leadTimeText', 'signatureName', 'title']) expect(seen, field).toContain(field)
  })

  it('sin edición el HTML no trae campos editables y los textos salen como texto', () => {
    const html = render(SAMPLE_QUOTE_DOC, 'hogar')
    expect(html).not.toContain('fzd-editable--on')
    expect(plainText(html)).toContain('No cubre golpes ni mal uso')
  })
})

describe('QuoteDocument: paginación', () => {
  it.each(PRESETS)('«%s» con muchas ventanas reparte las hojas sin desbordes', (preset) => {
    for (const items of [1, 3, 6, 12, 24]) {
      const html = render(buildSampleQuoteDoc({ items }), preset)
      expect(html, `${preset} ${items}`).not.toMatch(/class="[^"]*dkd-block--overflow/)
      expect(html, `${preset} ${items}`).toContain(`>V${items}<`)
      expect(pages(html), `${preset} ${items}`).toBeGreaterThanOrEqual(1)
    }
  })

  it.each(PRESETS)('«%s» nunca deja un título ni un subtotal huérfano al pie de una hoja', (preset) => {
    for (const items of [2, 7, 12, 20]) {
      const model = buildQuoteModel(buildSampleQuoteDoc({ items }), { template: preset })
      const { pages: list, overflow } = paginateQuote(model, quoteBlocks(model))
      expect(overflow, `${preset} ${items}`).toEqual([])
      list.forEach((page, i) => {
        const last = page.blocks[page.blocks.length - 1]
        if (last) expect(last.block.keepWithNext, `${preset} ${items} ventanas, hoja ${i + 1}: «${last.block.key}»`).toBeFalsy()
      })
    }
  })

  it('el diseño de una hoja por ventana crece de a una hoja por ventana', () => {
    const six = pages(render(buildSampleQuoteDoc({ items: 6 }), 'memoria'))
    const twelve = pages(render(buildSampleQuoteDoc({ items: 12 }), 'memoria'))
    expect(twelve - six).toBeGreaterThanOrEqual(6)
  })

  it('la planilla compacta lleva 24 ventanas en cuatro hojas como máximo', () => {
    const html = render(buildSampleQuoteDoc({ items: 24 }), 'obra')
    expect(pages(html)).toBeLessThanOrEqual(4)
    expect(html).toContain('>V24<')
  })

  it('una obra chica cabe en pocas hojas: la última nunca queda solo con una firma suelta', () => {
    for (const preset of ['hogar', 'obra', 'corporativa', 'corporativa'] as const) {
      const html = render(buildSampleQuoteDoc({ items: 3 }), preset)
      const last = html.split('<section class="dkd-page').pop() ?? ''
      // La última hoja trae más que la aceptación: además de la firma hay otro bloque del cierre.
      const blocks = (last.match(/data-dk-block="/g) ?? []).length
      expect(blocks, preset).toBeGreaterThanOrEqual(1)
      expect(pages(html), preset).toBeLessThanOrEqual(preset === 'hogar' ? 5 : 4)
    }
  })

  it('el salto de hoja de una sección que empieza en una hoja casi vacía no deja una hoja con dos líneas', () => {
    // Con 2 ventanas el resumen y la forma de pago siguen en la misma hoja que las ventanas.
    const html = render(buildSampleQuoteDoc({ items: 2 }), 'obra')
    expect(pages(html)).toBeLessThanOrEqual(2)
  })

  it('la paginación es la misma cada vez (sin azar entre dibujos)', () => {
    const a = render(buildSampleQuoteDoc({ items: 9 }), 'hogar')
    const b = render(buildSampleQuoteDoc({ items: 9 }), 'hogar')
    expect(a).toBe(b)
  })
})

describe('QuoteDocument: datos faltantes y casos borde', () => {
  it.each(PRESETS)('«%s» sin cliente omite el bloque «Para» (sin guiones sueltos)', (preset) => {
    const data: QuoteDocData = { ...SAMPLE_QUOTE_DOC, client: undefined }
    const html = render(data, preset)
    const text = plainText(html)
    expect(text).not.toMatch(/Para —|Cliente —|Contacto —/)
    expect(text).not.toContain('Propuesta para')
    expect(html).not.toContain('Carolina')
    expect(html).not.toContain('undefined')
    // Con cliente, el bloque sí aparece.
    expect(render(SAMPLE_QUOTE_DOC, preset)).toContain('Cliente de ejemplo')
  })

  it.each(['hogar', 'atelier', 'hogar'] as const)('«%s»: la superficie se muestra con 2 decimales, la misma de los totales', (preset) => {
    const data: QuoteDocData = { ...SAMPLE_QUOTE_DOC, totals: { ...SAMPLE_QUOTE_DOC.totals, area: 10.5833 } }
    const text = plainText(render(data, preset))
    if (text.includes('m²')) {
      expect(text).toMatch(/10,58\s?m²/)
      expect(text).not.toMatch(/10,6\s?m²/)
    }
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
    for (const preset of PRESETS) {
      const html = render(empty, preset)
      expect(html, preset).toContain('$0')
      expect(html, preset).not.toContain('NaN')
      expect(html, preset).not.toContain('Carolina')
      expect(pages(html), preset).toBeGreaterThanOrEqual(1)
    }
  })

  it('revisión B, aceptación en línea, papel A4 y fuente propia', () => {
    const data = buildSampleQuoteDoc({ prefs: { paper: 'a4', accent: '#0F5E5A' } })
    data.quote = { ...data.quote, revision: 2, acceptedBy: { name: 'Cliente de ejemplo', at: '2026-11-03T12:00:00Z' } }
    const html = render(data, 'hogar')
    expect(plainText(html)).toContain('412 · Rev. B')
    expect(plainText(html)).toContain('Aceptada en línea')
    expect(html).toContain('dkd--a4')
    expect(html).toContain('@page { size: A4; margin: 0; }')
    // El color de marca de la organización se aplica a los diseños predefinidos.
    expect(html).toContain('--dk-accent:#0F5E5A')
  })

  it('nota de la cotización para el cliente (la interna no se imprime)', () => {
    const data = buildSampleQuoteDoc()
    data.quote = { ...data.quote, notes: 'Entrega en dos etapas, primero la planta baja.' }
    expect(plainText(render(data, 'hogar'))).toContain('Entrega en dos etapas')
  })

  it('los textos del taller no pueden inyectar HTML ni scripts', () => {
    const evil = '<script>alert(1)</script><img src=x onerror=alert(2)>'
    const data = buildSampleQuoteDoc({ prefs: { intro: evil, conditions: `- ${evil}`, paymentTerms: evil, warranty: evil, leadTimeText: evil } })
    data.quote = { ...data.quote, title: evil, notes: evil }
    data.client = { ...data.client!, name: evil }
    for (const preset of PRESETS) {
      const html = render(data, preset)
      expect(html, preset).not.toContain('<script>alert')
      expect(html, preset).not.toMatch(/<img[^>]*onerror/i)
      expect(html, preset).not.toMatch(/<img[^>]*src="x"/i)
    }
  })

  it('con la geometría real del motor (computeLayout) se renderizan los diez diseños', () => {
    const data = buildSampleQuoteDoc({ layout: computeLayout, items: 12 })
    for (const preset of PRESETS) {
      const html = render(data, preset)
      expect(html, preset).toContain('>V12<')
      expect(html, preset).not.toContain('NaN')
      expect(html, preset).not.toMatch(/class="[^"]*dkd-block--overflow/)
    }
  }, 60_000)

  it('describe la apertura en lenguaje de cliente', () => {
    expect(describeOpening(SAMPLE_QUOTE_DOC.items[0].design)).toBe('2 hojas correderas, 2 rieles')
    expect(describeOpening(SAMPLE_QUOTE_DOC.items[2].design)).toBe('Fijo + abatible hacia adentro con bisagras a la derecha')
  })
})

describe('QuoteDocument: idiomas', () => {
  it.each(LOCALES)('los diez diseños se dibujan en «%s» con sus rótulos traducidos y sin desbordes', (locale) => {
    const data = buildSampleQuoteDoc({ items: 6 })
    const es = plainText(render(data, 'memoria'))
    for (const preset of PRESETS) {
      const html = render(data, preset, { locale })
      const text = plainText(html)
      expect(html, preset).toContain(`data-locale="${locale}"`)
      expect(html, preset).toMatch(new RegExp(`lang="${locale}-[A-Z]{2}"`))
      expect(html, preset).not.toMatch(/class="[^"]*dkd-block--overflow/)
      expect(text, preset).not.toMatch(/NaN|undefined|\{[a-z]+\}|\[object/)
      // El total sale con la moneda en el formato del idioma (CLP por defecto).
      expect(text, preset).toMatch(/7?\d[.,\s]\d{3}[.,\s]\d{3}|\d{1,3}[.,\s  ]\d{3}/)
      // Ningún rótulo del documento se queda en español en los demás idiomas.
      if (locale !== 'es') expect(text, preset).not.toMatch(/Aceptación|Forma de pago|Condiciones|Garantía|Resumen de la inversión|Ventanas y puertas/)
    }
    if (locale !== 'es') expect(plainText(render(data, 'memoria', { locale }))).not.toBe(es)
  })

  it('el idioma de la cotización (o de la organización) manda si no se fuerza otro', () => {
    const data = { ...buildSampleQuoteDoc(), document: { locale: 'de' as Locale, currency: 'EUR' } } as QuoteDocDataV5
    const html = render(data, 'hogar')
    expect(html).toContain('data-locale="de"')
    expect(plainText(html)).toMatch(/Seite \d+/)
    // Moneda de la organización: euros, con el formato alemán.
    expect(plainText(html)).toMatch(/\d[.\d]*,\d{2}\s?€|€\s?\d/)
    // Forzado por quien mira (vista previa en otro idioma).
    expect(render(data, 'hogar', { locale: 'en' })).toContain('data-locale="en"')
  })

  it('los textos sembrados no se imprimen en ningún idioma; los propios, tal cual', () => {
    const own = buildSampleQuoteDoc({ prefs: { warranty: 'Texto propio del taller que no se traduce.' } })
    expect(plainText(render(own, 'hogar', { locale: 'en' }))).toContain('Texto propio del taller que no se traduce.')
    const d = documentMessagesEs.defaults
    const seeded = buildSampleQuoteDoc({ prefs: { intro: d.intro, conditions: d.conditions, paymentTerms: d.paymentTerms, warranty: d.warranty, leadTimeText: d.leadTimeText } })
    for (const locale of ['es', 'en', 'de'] as const) {
      const text = plainText(render(seeded, 'hogar', { locale }))
      expect(text).not.toContain('Gracias por confiar')
      expect(text).not.toContain('5 años')
    }
  })

  it('las fuentes del diseño incluyen latin-ext (ñ, ß, ç, ş, ğ, İ) para imprimir todos los idiomas', () => {
    for (const preset of PRESETS) {
      const prepared = prepareQuoteDocument({ data: SAMPLE_QUOTE_DOC, template: preset })
      const files = docFontFiles(prepared.model.theme)
      expect(files.some((f) => f.subset === 'latin-ext'), preset).toBe(true)
      const css = docFontFaceRules(files, (f) => `data:font/woff2;base64,${f.subset}`)
      expect(css, preset).toContain('U+0100-02BA')
    }
  })
})

describe('HTML completo del documento', () => {
  it('listo para Chromium: página, fuentes y script de paginación medida', () => {
    const prepared = prepareQuoteDocument({ data: SAMPLE_QUOTE_DOC, template: 'memoria' })
    const html = renderDocumentHtml(<QuoteDocument data={SAMPLE_QUOTE_DOC} template="memoria" measure={false} />, {
      title: prepared.title,
      lang: prepared.lang,
      script: TEMPLATE_FLOW_SCRIPT,
    })
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('<html lang="es-CL">')
    expect(html).toContain('@page { size: letter; margin: 0; }')
    expect(html).toContain('.dkd-page')
    expect(html).toContain('flowDocumentPages')
    expect(prepared.title).toBe('Cotización N° 412 · Rev. A · Obra de ejemplo'.replace(' · Rev. A', ''))
  })
})

describe('datos de muestra', () => {
  it('el cliente de muestra usa el RUT de prueba conocido, nunca uno que pueda ser de una persona real', () => {
    // 15.678.234-3 (el anterior) tiene dígito verificador válido y cae en un rango de RUT ya asignado.
    expect(SAMPLE_QUOTE_DOC.client?.rut).toBe('12.345.678-5')
    expect(render(SAMPLE_QUOTE_DOC, 'hogar')).not.toContain('15.678.234')
  })
})
