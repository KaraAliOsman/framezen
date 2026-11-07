// Regresiones de la revisión de los PDF reales (Chromium): cortes de página, textos desbordados,
// fuentes y datos que no sirven en papel.
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Warning } from '@dekopen/engine'
import { CATALOG_PRESET_IDS, QUOTE_PRESET_IDS } from '@dekopen/shared'
import { DOCUMENT_FONT_FILES, FONT_STACKS, documentFontFaces } from '../../src/base'
import { CatalogDocument, QuoteDocument, SAMPLE_CATALOG_DOC, SAMPLE_QUOTE_DOC, assembleCatalog, buildSampleQuoteDoc, prepareCatalogDocument, prepareQuoteDocument, type CatalogDocData } from '../../src/sales'
import { TEMPLATE_CSS, docFontFiles } from '../../src/templates'
import { MaterialsDocument, PurchaseOrderDocument, WorkOrderDocument, sampleWorkshopData } from '../../src/workshop'

vi.setConfig({ testTimeout: 90_000 })

const pages = (html: string) => (html.match(/<section class="dkd-page[ "]/g) ?? []).length
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')
const quote = (data: ReturnType<typeof buildSampleQuoteDoc>, template: string) => renderToStaticMarkup(<QuoteDocument data={data} template={template} measure={false} />)

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
  it('los documentos de taller incrustan JetBrains Mono (códigos) y completan «²» con Inter Tight, sin depender del sistema', () => {
    expect(DOCUMENT_FONT_FILES.mono).toMatch(/jetbrains-mono.*400.*\.woff2$/)
    expect(DOCUMENT_FONT_FILES.monoMedium).toMatch(/jetbrains-mono.*500.*\.woff2$/)
    const css = documentFontFaces({ mono: '/m.woff2', monoMedium: '/m5.woff2' })
    expect(css).toContain("font-family: 'JetBrains Mono'")
    expect(css).toContain('font-weight: 500')
    expect(css).not.toContain('woff2-variations')
    expect(FONT_STACKS.instrument.indexOf('Inter Tight')).toBeGreaterThan(FONT_STACKS.instrument.indexOf('Instrument Sans'))
  })

  it('cada fuente que piden los diseños de cotización y de catálogo existe en disco, con latin y latin-ext', () => {
    const require = createRequire(import.meta.url)
    const themes = [
      ...QUOTE_PRESET_IDS.map((id) => prepareQuoteDocument({ data: SAMPLE_QUOTE_DOC, template: id }).model.theme),
      ...CATALOG_PRESET_IDS.map((id) => prepareCatalogDocument({ data: SAMPLE_CATALOG_DOC, template: id }).template.theme),
    ]
    expect(themes).toHaveLength(9)
    const missing: string[] = []
    for (const theme of themes) {
      const files = docFontFiles(theme, { italic: true })
      expect(files.some((f) => f.subset === 'latin')).toBe(true)
      expect(files.some((f) => f.subset === 'latin-ext')).toBe(true)
      for (const f of files) {
        try {
          if (!existsSync(require.resolve(f.file))) missing.push(f.file)
        } catch {
          missing.push(f.file)
        }
      }
    }
    expect(missing, 'archivos de fuente que faltan en node_modules').toEqual([])
  })
})

describe('catálogo con muchas líneas', () => {
  it('«Habitar» resume líneas, diseños y colores en la portada y su contenido nombra cada línea', () => {
    const html = renderToStaticMarkup(<CatalogDocument data={manyLines(17)} template="habitar" />)
    expect(text(html)).toMatch(/17 líneas\s+\d+ diseños\s+\d+ colores/)
    for (const n of [1, 9, 17]) expect(text(html)).toContain(`Serie 60 ${n}`)
  })

  it('con 30 líneas el catálogo sigue repartido en hojas completas y ninguna línea se pierde', () => {
    for (const preset of CATALOG_PRESET_IDS) {
      const { pages: list } = assembleCatalog({ data: manyLines(30), template: preset })
      expect(list.length, preset).toBeGreaterThan(10)
      // Ninguna hoja vacía (salvo que sea la portada) y los números de hoja son correlativos.
      list.forEach((p, i) => {
        expect(p.index, preset).toBe(i)
        if (!p.cover) expect(p.blocks.length, `${preset} hoja ${i + 1}`).toBeGreaterThan(0)
      })
      const html = renderToStaticMarkup(<CatalogDocument data={manyLines(30)} template={preset} />)
      expect(text(html), preset).toContain('Serie 60 29')
    }
  })

  it('una línea que sigue en la hoja siguiente lleva «continuación» (sin hojas a medio llenar)', () => {
    // Una línea con 12 diseños no cabe en una hoja junto a su título: sigue en la próxima.
    const e = SAMPLE_CATALOG_DOC.entries[0]
    const big = { ...e, typologies: Array.from({ length: 12 }, (_, i) => e.typologies[i % e.typologies.length]) }
    const data = { ...SAMPLE_CATALOG_DOC, entries: [SAMPLE_CATALOG_DOC.entries[1], big] }
    for (const preset of ['coleccion-modular', 'sistema'] as const) {
      const html = renderToStaticMarkup(<CatalogDocument data={data} template={preset} />)
      expect(text(html), preset).toContain('continuación')
    }
  })
})

describe('cotización', () => {
  it('dice «ventanas» (no «posiciones») con sus unidades, con o sin superficie', () => {
    const data = buildSampleQuoteDoc({ items: 4 })
    for (const preset of ['hogar', 'hogar', 'atelier'] as const) {
      const plain = text(quote(data, preset))
      expect(plain, preset).toContain('4 ventanas')
      expect(plain, preset).toContain(`${data.totals.units} unidades`)
      expect(plain, preset).not.toContain('posiciones')
    }
  })

  it('la portada es limpia: logo, cliente, proyecto y fecha, sin precios', () => {
    const data = buildSampleQuoteDoc({ items: 3 })
    for (const preset of ['atelier', 'corporativa'] as const) {
      const html = quote(data, preset)
      const cover = html.slice(html.indexOf('dkd-page--cover'), html.indexOf('</section>'))
      const plain = text(cover)
      expect(plain, preset).toContain(data.client!.name)
      expect(plain, preset).toContain(data.quote.title)
      expect(plain, preset).not.toMatch(/\$\s?\d/)
    }
  })

  it('un título largo baja de tamaño en la portada y no agrega hojas', () => {
    const base = buildSampleQuoteDoc({ items: 2 })
    const long = { ...base, quote: { ...base.quote, title: 'Edificio Mirador del Bío Bío · Torre B, departamentos 101 al 1204 y áreas comunes del primer piso' } }
    for (const preset of ['atelier', 'corporativa'] as const) {
      const html = quote(long, preset)
      expect(html, preset).toMatch(/dkd-cover--t[sm]\b/)
      const short = quote(base, preset)
      expect(short, preset).toMatch(/dkd-cover--tl\b/)
      expect(pages(html), preset).toBe(pages(short))
      expect(html, preset).not.toMatch(/class="[^"]*dkd-block--overflow/)
    }
  })

  it('los números largos (total en millones) no se parten ni se cortan en el cierre', () => {
    const base = buildSampleQuoteDoc({ items: 2 })
    const big = { ...base, totals: { ...base.totals, total: 1_234_567_890, net: 1_037_452_000, iva: 197_115_880, subtotal: 1_037_452_000 } }
    for (const preset of ['hogar', 'atelier', 'atelier'] as const) {
      const html = quote(big, preset)
      expect(text(html), preset).toContain('$1.234.567.890')
    }
    // Las cifras de totales van en una sola línea y la columna del total mide lo que ocupa su cifra.
    expect(TEMPLATE_CSS).toMatch(/\.dkd-tot__grand dd \{[^}]*white-space: nowrap/)
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
