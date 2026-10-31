import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { computeLayout } from '@framezen/engine'
import type { CatalogTemplateId } from '@framezen/shared'
import { CATALOG_TEMPLATES, CatalogDocument, SAMPLE_CATALOG_DOC, buildSampleCatalogDoc, fichaPages, type CatalogDocData } from '../../src/sales'

const TEMPLATES: CatalogTemplateId[] = ['vitrina', 'ficha', 'lookbook']
const render = (data: CatalogDocData, template: CatalogTemplateId) => renderToStaticMarkup(<CatalogDocument data={data} template={template} />)

describe('CatalogDocument', () => {
  it('ofrece los tres diseños', () => {
    expect(CATALOG_TEMPLATES.map((t) => t.id)).toEqual(TEMPLATES)
  })

  it.each(TEMPLATES)('«%s» muestra líneas, tipologías y precios desde', (template) => {
    const html = render(SAMPLE_CATALOG_DOC, template)
    expect(html).toContain('fzd-catalog--' + template)
    expect(html).toContain('Ventanas del Maule')
    expect(html).toContain('Serie 60')
    expect(html).toContain('Corredera 70')
    for (const entry of SAMPLE_CATALOG_DOC.entries) for (const t of entry.typologies) expect(html, t.name).toContain(t.name)
    expect(html).toContain('Desde')
    expect(html).toContain('$118.000')
    expect(html).toContain('Página 1 de')
    expect(html).not.toContain('NaN')
  })

  it('sin precio (o con datos incompletos) muestra «Precio a consultar» y sin tipologías no falla', () => {
    const data: CatalogDocData = {
      ...SAMPLE_CATALOG_DOC,
      entries: SAMPLE_CATALOG_DOC.entries.map((e, i) => ({ ...e, typologies: i === 0 ? e.typologies.map((t) => ({ ...t, fromPricePerM2: undefined })) : [] })),
    }
    for (const template of TEMPLATES) {
      const html = render(data, template)
      expect(html, template).toContain('Precio a consultar')
      expect(html, template).not.toContain('Precio a medida')
    }
  })

  it('ficha técnica: dos líneas cortas comparten hoja y los vidrios son los de la línea', () => {
    const base = SAMPLE_CATALOG_DOC.entries[0]
    const glassIds = SAMPLE_CATALOG_DOC.catalog.glass.slice(0, 2).map((g) => g.id)
    const short = (i: number) => ({ ...base, line: { ...base.line, id: `l${i}`, name: `Línea ${i}` }, typologies: base.typologies.slice(0, 2), glassIds })
    const data: CatalogDocData = { ...SAMPLE_CATALOG_DOC, entries: [1, 2, 3, 4].map(short) }
    const html = render(data, 'ficha')
    const pages = (html.match(/class="fzd-page[ "]/g) ?? []).length
    expect(html.split('class="fzd-fi-sheet"').length - 1).toBe(4)
    expect(pages).toBeLessThanOrEqual(2)
    // El primer vidrio es el del precio; no se listan vidrios ajenos a la línea.
    const glassNames = SAMPLE_CATALOG_DOC.catalog.glass.map((g) => g.name)
    expect(html).toContain(`${glassNames[0]}<span class="fzd-muted"> · base del precio</span>`)
    for (const other of glassNames.slice(2)) expect(html.includes(`<span>${other}</span>`), other).toBe(false)
  })

  it('ficha técnica: una línea larga se parte en tramos parejos con su total de diseños', () => {
    const base = SAMPLE_CATALOG_DOC.entries[0]
    const many = Array.from({ length: 13 }, (_, i) => ({ ...base.typologies[i % base.typologies.length], name: `Diseño ${i + 1}` }))
    const data: CatalogDocData = { ...SAMPLE_CATALOG_DOC, entries: [{ ...base, typologies: many }] }
    const html = render(data, 'ficha')
    const sheets = html.split('class="fzd-fi-sheet"').slice(1)
    expect(sheets.length).toBe(2)
    const rows = sheets.map((s) => s.split('class="fzd-fi-row"').length - 1)
    expect(Math.abs(rows[0] - rows[1])).toBeLessThanOrEqual(1)
    expect(html).toContain('Diseños')
  })

  it('ficha técnica: llena la hoja empezada partiendo la línea que sigue, sin hojas a medio llenar', () => {
    const base = SAMPLE_CATALOG_DOC.entries[0]
    const entry = (id: string, n: number) => ({
      ...base,
      line: { ...base.line, id, name: id },
      typologies: Array.from({ length: n }, (_, i) => ({ ...base.typologies[i % base.typologies.length], name: `${id}-${i + 1}` })),
    })
    const entries = [entry('a', 3), entry('b', 9), entry('c', 2), entry('d', 13)]
    const opts = { first: 900, rest: 900, gap: 50, sideHeight: () => 300 }
    const pages = fichaPages(entries, opts)
    const height = (b: (typeof pages)[number][number]) => Math.max(300, 21 + 67 * b.items.length + 46) + opts.gap
    // Cada diseño una sola vez y en orden.
    for (const e of entries) expect(pages.flat().filter((b) => b.entry === e).flatMap((b) => b.items)).toEqual(e.typologies)
    // Ninguna hoja (salvo la última) con más del 40 % libre, ninguna continuación con un solo diseño.
    pages.slice(0, -1).forEach((page, i) => expect(page.reduce((s, b) => s + height(b), 0) / opts.rest, `hoja ${i + 1}`).toBeGreaterThanOrEqual(0.6))
    for (const b of pages.flat()) expect(b.items.length).toBeGreaterThanOrEqual(b.items.length === b.entry.typologies.length ? 1 : 2)
    // La «b» empieza en la hoja de la «a»; la «d» (más larga que una hoja) va en tramos parejos.
    expect(pages[0]?.map((b) => b.entry.line.id)).toEqual(['a', 'b'])
    const d = pages.flat().filter((b) => b.entry.line.id === 'd').map((b) => b.items.length)
    expect(d).toEqual([7, 6])
  })

  it('con la geometría real del motor', () => {
    const data = buildSampleCatalogDoc({ layout: computeLayout, prefs: { font: 'grotesk', paper: 'a4' } })
    for (const template of TEMPLATES) {
      const html = render(data, template)
      expect(html, template).toContain('data-paper="a4"')
      expect(html, template).not.toContain('NaN')
    }
  })
})
