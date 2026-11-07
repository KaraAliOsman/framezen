import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { computeLayout } from '@dekopen/engine'
import { CATALOG_PRESET_IDS, DOC_PRESETS, LEGACY_TEMPLATE_PRESETS, LOCALES, duplicateDocPreset, typologyName, type CatalogPresetId, type DocLocale } from '@dekopen/shared'
import {
  CATALOG_TEMPLATES,
  CatalogDocument,
  SAMPLE_CATALOG_DOC,
  assembleCatalog,
  buildSampleCatalogDoc,
  catalogSafeImageSrc,
  catalogTemplates,
  pickCatalogTemplateRef,
  prepareCatalogDocument,
  type CatalogDocData,
} from '../../src/sales'

// Cada prueba arma varios catálogos completos con sus dibujos.
vi.setConfig({ testTimeout: 90_000 })

const PRESETS = [...CATALOG_PRESET_IDS] as CatalogPresetId[]
const render = (data: CatalogDocData, template: string, locale?: DocLocale) => renderToStaticMarkup(<CatalogDocument data={data} template={template} {...(locale ? { locale } : {})} />)
const pages = (html: string) => (html.match(/class="dkc-page[ "]/g) ?? []).length
const text = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ')
/** Los diseños técnicos y de colección muestran el precio «desde»; los de estilo de vida y de materiales no. */
const pricedPresets = (): CatalogPresetId[] => ['sistema', 'coleccion-modular']

/** Catálogo con muchas líneas (una cuenta nueva parte con ~17). */
function manyLines(n: number): CatalogDocData {
  const base = SAMPLE_CATALOG_DOC.entries
  const entries = Array.from({ length: n }, (_, i) => {
    const e = base[i % base.length]
    return { ...e, line: { ...e.line, id: `${e.line.id}-${i}`, name: `${e.line.name} ${i + 1}` } }
  })
  return { ...SAMPLE_CATALOG_DOC, entries }
}

describe('diseños de catálogo', () => {
  it('ofrece los cuatro diseños predefinidos, con nombre y descripción en cada idioma', () => {
    expect(CATALOG_TEMPLATES.map((t) => t.id)).toEqual(PRESETS)
    expect(PRESETS).toEqual(['habitar', 'sistema', 'coleccion-modular', 'materia-y-color'])
    for (const locale of LOCALES) {
      for (const t of catalogTemplates(locale)) {
        expect(t.name.length, `${locale} ${t.id}`).toBeGreaterThan(2)
        expect(t.description.length, `${locale} ${t.id}`).toBeGreaterThan(10)
      }
    }
  })

  it('los ids de la versión 4 se muestran con su diseño equivalente', () => {
    const expected: Record<string, string> = { vitrina: 'coleccion-modular', ficha: 'sistema', lookbook: 'habitar' }
    for (const [legacy, preset] of Object.entries(expected)) {
      expect(LEGACY_TEMPLATE_PRESETS[legacy as keyof typeof LEGACY_TEMPLATE_PRESETS], legacy).toBe(preset)
      expect(render(SAMPLE_CATALOG_DOC, legacy), legacy).toContain(`data-template="${preset}"`)
    }
    // Pedido → preferido del taller → diseño por defecto; un id de cotización no sirve para el catálogo.
    expect(pickCatalogTemplateRef('sistema', 'habitar')).toBe('sistema')
    expect(pickCatalogTemplateRef('hogar', 'habitar')).toBe('habitar')
    expect(pickCatalogTemplateRef(undefined, 'vitrina')).toBe('vitrina')
    expect(pickCatalogTemplateRef('nope', undefined)).toBe('coleccion-modular')
    expect(pickCatalogTemplateRef(undefined, undefined)).toBe('coleccion-modular')
  })
})

describe('CatalogDocument', () => {
  it.each(PRESETS)('«%s» muestra el taller, las líneas y todas las tipologías con su nombre', (preset) => {
    const html = render(SAMPLE_CATALOG_DOC, preset)
    const plain = text(html)
    expect(html).toContain(`data-template="${preset}"`)
    expect(html).toContain('dkc-page')
    expect(plain).toContain('Taller de ejemplo')
    for (const entry of SAMPLE_CATALOG_DOC.entries) expect(plain, entry.line.name).toContain(entry.line.name)
    expect(plain).toContain('Serie 60')
    expect(plain).toContain('Corredera 70')
    // Cada tipología con el nombre del glosario del idioma del documento.
    for (const entry of SAMPLE_CATALOG_DOC.entries) for (const t of entry.typologies) expect(plain, t.typologyId).toContain(typologyName(t.typologyId, 'es', t.name))
    expect(html).not.toContain('NaN')
    expect(html).not.toContain('undefined')
    expect(html).not.toMatch(/(?:src|href)=["']https?:/i)
    expect(html).not.toContain('<script')
  })

  it('los diseños con precio muestran «Desde $X/m²» con el precio del motor', () => {
    for (const preset of pricedPresets()) {
      const plain = text(render(SAMPLE_CATALOG_DOC, preset))
      expect(plain, preset).toContain('Desde')
      expect(plain, preset).toContain('$118.000')
      expect(plain, preset).toMatch(/\/m²|\/ m²/)
    }
  })

  it('sin precio (o con datos incompletos) muestra «Precio a consultar» y sin tipologías no falla', () => {
    const data: CatalogDocData = {
      ...SAMPLE_CATALOG_DOC,
      entries: SAMPLE_CATALOG_DOC.entries.map((e, i) => ({ ...e, typologies: i === 0 ? e.typologies.map((t) => ({ ...t, fromPricePerM2: undefined })) : [] })),
    }
    // La colección muestra el precio en cada diseño: sin dato dice «Precio a consultar».
    expect(text(render(data, 'coleccion-modular'))).toContain('Precio a consultar')
    // Nunca un «desde $0» engañoso, en ningún diseño.
    for (const preset of PRESETS) {
      const plain = text(render(data, preset))
      expect(plain, preset).not.toMatch(/Desde \$0|NaN|Precio a medida/)
    }
    for (const preset of PRESETS) expect(render({ ...SAMPLE_CATALOG_DOC, entries: [] }, preset), preset).not.toContain('NaN')
  })

  it('la numeración de hojas sigue al diseño y cada hoja dice cuántas son', () => {
    for (const preset of PRESETS) {
      const html = render(SAMPLE_CATALOG_DOC, preset)
      const numbering = DOC_PRESETS[preset].page.pageNumbers
      const plain = text(html)
      if (numbering === 'page_of_total') expect(plain, preset).toContain(`de ${pages(html)}`)
      else if (numbering === 'page') expect(plain, preset).toMatch(/Página \d+/)
      expect(html, preset).toContain(`data-pages="${pages(html)}"`)
    }
  })

  it('papel A4 o Carta según el diseño y los ajustes del taller', () => {
    const a4 = buildSampleCatalogDoc({ prefs: { paper: 'a4' } })
    for (const preset of PRESETS) {
      const html = render(a4, preset)
      expect(html, preset).toContain('data-paper="a4"')
      expect(html, preset).toContain('@page { size: A4; margin: 0; }')
    }
    expect(render(SAMPLE_CATALOG_DOC, 'sistema')).toContain('data-paper="letter"')
  })

  it('el color de marca del taller se aplica a los diseños predefinidos', () => {
    const data = buildSampleCatalogDoc({ org: { accent: '#0F5E5A' } })
    for (const preset of PRESETS) expect(render(data, preset).toLowerCase(), preset).toContain('#0f5e5a')
  })

  it('con muchas líneas el catálogo se reparte en más hojas, sin desbordes ni líneas repetidas', () => {
    const few = pages(render(SAMPLE_CATALOG_DOC, 'coleccion-modular'))
    for (const preset of PRESETS) {
      const html = render(manyLines(17), preset)
      expect(pages(html), preset).toBeGreaterThan(few)
      expect(html, preset).not.toContain('NaN')
      expect(text(html), preset).toContain('Serie 60 1')
      expect(text(html), preset).toContain('Serie 60 5')
    }
  })

  it('una línea que sigue en la hoja siguiente lo dice («continuación») y repite su título', () => {
    const e = SAMPLE_CATALOG_DOC.entries[0]
    const big = { ...e, typologies: Array.from({ length: 12 }, (_, i) => ({ ...e.typologies[i % e.typologies.length], name: `Diseño ${i + 1}` })) }
    const html = render({ ...SAMPLE_CATALOG_DOC, entries: [SAMPLE_CATALOG_DOC.entries[1], big] }, 'coleccion-modular')
    expect(text(html)).toContain('continuación')
  })

  it('el catálogo se arma una sola vez por hoja: cada tipología aparece en un solo lugar', () => {
    const assembled = assembleCatalog({ data: SAMPLE_CATALOG_DOC, template: 'sistema' })
    const ids = assembled.pages.flatMap((p) => p.blocks).filter((b) => b.data.kind === 'productRow' || b.data.kind === 'cards').map((b) => b.key)
    expect(new Set(ids).size).toBe(ids.length)
    expect(assembled.pages.length).toBeGreaterThanOrEqual(4)
  })

  it('con la geometría real del motor', () => {
    const data = buildSampleCatalogDoc({ layout: computeLayout, prefs: { paper: 'a4' } })
    for (const preset of PRESETS) {
      const html = render(data, preset)
      expect(html, preset).toContain('data-paper="a4"')
      expect(html, preset).not.toContain('NaN')
    }
  })

  it('una plantilla propia válida manda; una inválida cae al diseño de respaldo sin romper', () => {
    const spec = duplicateDocPreset('habitar', { id: 'mi-catalogo', name: 'Mi catálogo' })
    expect(prepareCatalogDocument({ data: SAMPLE_CATALOG_DOC, spec, template: 'mi-catalogo' }).template.name).toBe('Mi catálogo')
    expect(renderToStaticMarkup(<CatalogDocument data={SAMPLE_CATALOG_DOC} template="mi-catalogo" spec={spec} />)).toContain('dkc-page')
    // Sin la plantilla propia cargada se usa el diseño del que se duplicó.
    expect(render(SAMPLE_CATALOG_DOC, 'mi-catalogo')).toContain('dkc-page')
    const html = renderToStaticMarkup(<CatalogDocument data={SAMPLE_CATALOG_DOC} template="org:x" spec={{ nada: true }} />)
    expect(html).toContain('dkc-page')
  })

  it('imágenes y enlaces: solo data URL de imagen rasterizada y URL web (nunca SVG ni javascript:)', () => {
    expect(catalogSafeImageSrc('data:image/png;base64,iVBORw0KGgo=')).toBeTruthy()
    expect(catalogSafeImageSrc('data:image/svg+xml;base64,PHN2Zz4=')).toBeUndefined()
    expect(catalogSafeImageSrc('https://ejemplo.cl/x.png')).toBeUndefined()
    const evil = renderToStaticMarkup(<CatalogDocument data={SAMPLE_CATALOG_DOC} template="sistema" requestUrl="javascript:alert(1)" />)
    expect(evil).not.toContain('javascript:')
    const good = renderToStaticMarkup(<CatalogDocument data={SAMPLE_CATALOG_DOC} template="sistema" requestUrl="https://ventanasdelmaule.cl/cotiza" />)
    expect(text(good)).toContain('ejemplo.cl')
  })

  it('los textos del taller no pueden inyectar HTML', () => {
    const evil = '<script>alert(1)</script><img src=x onerror=alert(2)>'
    const e = SAMPLE_CATALOG_DOC.entries[0]
    const data = { ...SAMPLE_CATALOG_DOC, title: evil, org: { ...SAMPLE_CATALOG_DOC.org, name: evil }, entries: [{ ...e, line: { ...e.line, name: evil } }] }
    for (const preset of PRESETS) {
      const html = render(data, preset)
      expect(html, preset).not.toContain('<script>alert')
      expect(html, preset).not.toMatch(/<img[^>]*onerror/i)
    }
  })
})

describe('CatalogDocument: idiomas', () => {
  it.each(LOCALES)('los cuatro diseños se dibujan en «%s» sin rótulos en español ni claves sueltas', (locale) => {
    for (const preset of PRESETS) {
      const html = render(SAMPLE_CATALOG_DOC, preset, locale)
      const plain = text(html)
      expect(html, preset).toMatch(new RegExp(`lang="${locale}-[A-Z]{2}"`))
      expect(plain, preset).not.toMatch(/NaN|undefined|\{[a-z]+\}|\[object|\bheading\.|\bdocument\.|\bprice\./)
      if (locale !== 'es') expect(plain, preset).not.toMatch(/Precio a consultar|Colores y terminaciones|Herrajes|Catálogo de ventanas|Pide tu cotización|Diseños disponibles/)
    }
  })

  it('el precio sale en la moneda de la organización y el formato del idioma', () => {
    const html = renderToStaticMarkup(<CatalogDocument data={SAMPLE_CATALOG_DOC} template="sistema" locale="en" currency="USD" />)
    expect(text(html)).toMatch(/\$\s?[\d,]+(\.\d{2})?\s?\/\s?m²|USD|US\$/)
  })
})
