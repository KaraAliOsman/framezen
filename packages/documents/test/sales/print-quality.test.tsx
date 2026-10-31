// Regresiones de la revisión de los PDF reales (Chromium): cortes de página, textos desbordados,
// fuentes y datos que no sirven en papel.
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Warning } from '@framezen/engine'
import { DOCUMENT_FONT_FILES, FONT_STACKS, documentFontFaces } from '../../src/base'
import { CatalogDocument, QuoteDocument, SAMPLE_CATALOG_DOC, buildSampleQuoteDoc, type CatalogDocData } from '../../src/sales'
import { MaterialsDocument, PurchaseOrderDocument, WorkOrderDocument, sampleWorkshopData } from '../../src/workshop'

const pages = (html: string) => (html.match(/class="fzd-page[ "]/g) ?? []).length
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

/** Catálogo con muchas líneas (una cuenta nueva parte con ~17). */
function manyLines(n: number): CatalogDocData {
  const base = SAMPLE_CATALOG_DOC.entries
  const entries = Array.from({ length: n }, (_, i) => {
    const e = base[i % base.length]
    return { ...e, line: { ...e.line, id: `${e.line.id}-${i}`, name: `${e.line.name} ${i + 1}` } }
  })
  return { ...SAMPLE_CATALOG_DOC, entries }
}

describe('fuentes del PDF', () => {
  it('incrusta JetBrains Mono (códigos) y completa «²» con Inter Tight, sin depender del sistema', () => {
    expect(DOCUMENT_FONT_FILES.mono).toMatch(/jetbrains-mono.*400.*\.woff2$/)
    expect(DOCUMENT_FONT_FILES.monoMedium).toMatch(/jetbrains-mono.*500.*\.woff2$/)
    const css = documentFontFaces({ mono: '/m.woff2', monoMedium: '/m5.woff2' })
    expect(css).toContain("font-family: 'JetBrains Mono'")
    expect(css).toContain('font-weight: 500')
    expect(css).not.toContain('woff2-variations')
    expect(FONT_STACKS.instrument.indexOf('Inter Tight')).toBeGreaterThan(FONT_STACKS.instrument.indexOf('Instrument Sans'))
  })
})

describe('catálogo «Vitrina»', () => {
  it('con muchas líneas el índice de portada va en dos columnas y no se desborda', () => {
    const html = renderToStaticMarkup(<CatalogDocument data={manyLines(17)} template="vitrina" />)
    expect(html).toContain('fzd-vi-index--cols')
    expect(html).toContain('fzd-vi-cover--dense')
    // Más de 26 líneas: la portada nombra cuántas faltan en vez de salirse de la hoja.
    const huge = renderToStaticMarkup(<CatalogDocument data={manyLines(30)} template="vitrina" />)
    expect(text(huge)).toContain('y 4 líneas más en las páginas siguientes')
  })

  it('una línea que sigue en la hoja siguiente lleva «continuación» (sin hojas a medio llenar)', () => {
    // Una línea con 12 diseños (4 filas) no cabe en una hoja junto a su título: sigue en la próxima.
    const e = SAMPLE_CATALOG_DOC.entries[0]
    const big = { ...e, typologies: Array.from({ length: 12 }, (_, i) => e.typologies[i % e.typologies.length]) }
    const html = renderToStaticMarkup(<CatalogDocument data={{ ...SAMPLE_CATALOG_DOC, entries: [SAMPLE_CATALOG_DOC.entries[1], big] }} template="vitrina" />)
    expect(html).toContain('fzd-vi-cont')
    expect(text(html)).toContain('continuación')
  })

  it('los nombres con guion no se parten («S-70»)', () => {
    const data = { ...SAMPLE_CATALOG_DOC, entries: [{ ...SAMPLE_CATALOG_DOC.entries[0], line: { ...SAMPLE_CATALOG_DOC.entries[0].line, name: 'Americana S-70 Thermowin' } }] }
    for (const template of ['vitrina', 'ficha'] as const) {
      const html = renderToStaticMarkup(<CatalogDocument data={data} template={template} />)
      expect(html).toContain('<span style="white-space:nowrap">S-70</span>')
    }
  })

  it('el lookbook con muchas líneas resume marcas y cantidades en la portada', () => {
    const html = renderToStaticMarkup(<CatalogDocument data={manyLines(17)} template="lookbook" />)
    expect(text(html)).toMatch(/17 líneas · \d+ diseños hechos a medida/)
  })
})

describe('cotización', () => {
  it('compacta: dice «ventanas» (no «posiciones») y el detalle puede bajar de línea entre datos', () => {
    const data = buildSampleQuoteDoc({ items: 4 })
    const html = renderToStaticMarkup(<QuoteDocument data={data} template="compacta" />)
    // Con superficie, el cuadro de totales ya dice unidades y m² (no se repite al lado).
    expect(text(html)).toContain(`${data.totals.units} unidades`)
    expect(text(html)).not.toContain('posiciones')
    const noArea = renderToStaticMarkup(<QuoteDocument data={{ ...data, prefs: { ...data.prefs, showArea: false } }} template="compacta" />)
    expect(text(noArea)).toContain('4 ventanas')
    expect(html).toMatch(/fzd-co-meta">(<span[^>]*>.*?<\/span> )+<span/)
  })

  it('galería: «Proyecto: N ventanas, M unidades» en la portada', () => {
    const data = buildSampleQuoteDoc({ items: 3 })
    const html = renderToStaticMarkup(<QuoteDocument data={data} template="galeria" />)
    expect(text(html)).toContain('Proyecto')
    expect(text(html)).toMatch(/3 ventanas(, \d+ unidades)?/)
  })

  it('editorial: un título largo baja de tamaño y el dibujo cede espacio (la portada no se desborda)', () => {
    const base = buildSampleQuoteDoc({ items: 2 })
    const long = { ...base, quote: { ...base.quote, title: 'Edificio Mirador del Bío Bío · Torre B, departamentos 101 al 1204' } }
    const html = renderToStaticMarkup(<QuoteDocument data={long} template="editorial" />)
    expect(html).toContain('fzd-ed-cover__title--s')
    const short = renderToStaticMarkup(<QuoteDocument data={base} template="editorial" />)
    expect(short).not.toContain('fzd-ed-cover__title--')
    expect(pages(html)).toBe(pages(short))
  })
})

describe('documentos de taller', () => {
  const data = sampleWorkshopData()

  it('la OT no muestra avisos de precio (van en Costos y Materiales) y la ruta va arriba', () => {
    const priceWarning: Warning = { level: 'warn', code: 'price_missing_profile', message: 'El perfil X no tiene precio en Blanco: se cotiza en $0.' }
    const windows = data.windows.map((w, i) => (i === 0 ? { ...w, bom: { ...w.bom, warnings: [...w.bom.warnings, priceWarning] } } : w))
    const html = renderToStaticMarkup(<WorkOrderDocument data={{ ...data, windows }} />)
    expect(html).not.toContain('no tiene precio')
    const first = html.slice(0, html.indexOf('</section>'))
    expect(first.indexOf('class="fzw-stations"')).toBeGreaterThan(0)
    expect(first.indexOf('class="fzw-stations"')).toBeLessThan(first.indexOf('fzw-table-cuts"'))
  })

  it('los vidrios no muestran su id interno como código', () => {
    for (const html of [renderToStaticMarkup(<MaterialsDocument data={data} showCosts />), renderToStaticMarkup(<PurchaseOrderDocument data={data} />)]) {
      for (const glass of data.catalog?.glass ?? []) expect(text(html)).not.toContain(` ${glass.id} `)
    }
  })
})
