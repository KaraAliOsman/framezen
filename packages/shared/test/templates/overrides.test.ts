import { describe, expect, it } from 'vitest'
import type { DocumentPrefs } from '../../src/api'
import {
  QuoteDocOverridesV2Schema,
  applySectionOrder,
  compactQuoteDocOverrides,
  contrastRatio,
  getDocPreset,
  mergeTemplateOverrides,
  migrateQuoteDocOverrides,
  parseValidityDays,
  pickQuoteTemplateRef,
  resolveQuoteDocument,
  validateDocTemplate,
  type QuoteDocOverridesV2,
} from '../../src/templates'

const V1_FULL: Partial<DocumentPrefs> & { notes: string } = {
  quoteTemplate: 'galeria',
  catalogTemplate: 'ficha',
  font: 'serif',
  accent: '#2747c2',
  showUnitPrice: false,
  showArea: true,
  showGlass: false,
  showLine: true,
  showColorSwatch: false,
  showExteriorView: true,
  paper: 'a4',
  intro: 'Estimado cliente:\n\nGracias por su confianza.',
  conditions: '**Condiciones**\n- Precios con IVA',
  paymentTerms: '50% al aceptar, 50% contra entrega',
  warranty: '10 años en perfiles',
  validityDays: 20,
  leadTimeText: 'Fabricación e instalación en 15 días hábiles',
  signatureName: 'Ana Pérez',
  footer: 'Gracias por preferirnos',
  notes: 'Incluye retiro de ventanas antiguas.',
}

describe('migración v1 → v2', () => {
  it('convierte todos los campos v1 sin perder datos', () => {
    const r = migrateQuoteDocOverrides(V1_FULL)
    expect(r.migrated).toBe(true)
    expect(r.overrides).toEqual({
      v: 2,
      templateId: 'hogar',
      texts: {
        intro: 'Estimado cliente:\n\nGracias por su confianza.',
        conditions: '**Condiciones**\n- Precios con IVA',
        paymentTerms: '50% al aceptar, 50% contra entrega',
        warranty: '10 años en perfiles',
        leadTimeText: 'Fabricación e instalación en 15 días hábiles',
        signatureName: 'Ana Pérez',
        footer: 'Gracias por preferirnos',
        clientNote: 'Incluye retiro de ventanas antiguas.',
      },
      validityDays: 20,
      theme: { palette: { accent: '#2747C2' }, fonts: { heading: 'literata', body: 'source-sans-3', mono: 'jetbrains-mono' } },
      page: { size: 'A4' },
      itemDisplay: { showUnitPrices: false, showArea: true, showGlass: false, showSystem: true, showSwatches: false, drawingView: 'both' },
    })
    expect(QuoteDocOverridesV2Schema.safeParse(r.overrides).success).toBe(true)
    expect(r.issues.map((i) => i.code)).toContain('legacy_migrated')
  })

  it('capa de organización: conserva política y marca, no tipografía ni presentación v4', () => {
    const r = migrateQuoteDocOverrides(V1_FULL, { source: 'org' })
    expect(r.overrides.templateId).toBeUndefined()
    expect(r.overrides.theme).toEqual({ palette: { accent: '#2747C2' } })
    expect(r.overrides.itemDisplay).toEqual({ showUnitPrices: false })
    expect(r.overrides.page).toEqual({ size: 'A4' })
    expect(r.overrides.texts?.intro).toBe(V1_FULL.intro)
  })

  it('descarta contenido inseguro, limpia llaves y recorta', () => {
    const r = migrateQuoteDocOverrides({
      intro: 'Hola <script>alert(1)</script>',
      conditions: 'Precio {aprox} para {client.name} y {catalog.title}',
      warranty: 'w'.repeat(5000),
      footer: 'Pie‮ oculto',
      validityDays: '45',
      notes: 42,
      accent: 'javascript:alert(1)',
      font: 'comic-sans',
      paper: 'tabloid',
      quoteTemplate: 'no-existe',
    })
    expect(r.overrides.texts?.intro).toBeUndefined()
    expect(r.overrides.texts?.conditions).toBe('Precio aprox para {client.name} y')
    expect(r.overrides.texts?.warranty).toHaveLength(2000)
    expect(r.overrides.texts?.footer).toBe('Pie oculto')
    expect(r.overrides.validityDays).toBe(45)
    expect(r.overrides.theme).toBeUndefined()
    expect(r.overrides.page).toBeUndefined()
    expect(r.overrides.templateId).toBeUndefined()
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['unsafe_text', 'text_truncated']))
  })

  it('validez como en v4', () => {
    expect(parseValidityDays('15')).toBe(15)
    expect(parseValidityDays(0)).toBeUndefined()
    expect(parseValidityDays(400)).toBeUndefined()
    expect(parseValidityDays('abc')).toBeUndefined()
  })

  it('v2 válido pasa intacto; inválido se repara campo a campo', () => {
    const v2: QuoteDocOverridesV2 = { v: 2, texts: { intro: 'Hola' }, sections: { warranty: { type: 'warranty', enabled: false } } }
    const ok = migrateQuoteDocOverrides(v2)
    expect(ok.migrated).toBe(false)
    expect(ok.overrides).toEqual(v2)
    const broken = migrateQuoteDocOverrides({
      v: 2,
      texts: { intro: 'Hola', footer: '<b>x</b>', hack: 'y' },
      sections: { warranty: { type: 'warranty', enabled: false }, constructor: { type: 'items' }, items: { type: 'items', options: { variant: 'html' } } },
      added: [{ id: 'nota', type: 'custom_text', enabled: true, pageBreak: 'auto', tone: 'paper', options: { variant: 'paragraphs', content: { blocks: [] } } }, { id: 'x', type: 'warranty' }],
      locale: 'xx',
      evil: true,
    })
    expect(broken.migrated).toBe(true)
    expect(broken.overrides).toEqual({
      v: 2,
      texts: { intro: 'Hola' },
      sections: { warranty: { type: 'warranty', enabled: false } },
      added: [{ id: 'nota', type: 'custom_text', enabled: true, pageBreak: 'auto', tone: 'paper', options: { variant: 'paragraphs', content: { blocks: [] } } }],
    })
    expect(broken.issues.length).toBeGreaterThan(0)
  })

  it('basura o vacío → v2 vacío', () => {
    expect(migrateQuoteDocOverrides(null).overrides).toEqual({ v: 2 })
    expect(migrateQuoteDocOverrides('texto').overrides).toEqual({ v: 2 })
    expect(migrateQuoteDocOverrides([1, 2]).overrides).toEqual({ v: 2 })
  })

  it('el esquema v2 rechaza tamaños abusivos', () => {
    const items = Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`i${i}`, { note: 'x' }]))
    expect(QuoteDocOverridesV2Schema.safeParse({ v: 2, items }).success).toBe(false)
    expect(QuoteDocOverridesV2Schema.safeParse({ v: 2, texts: { intro: 'x'.repeat(4001) } }).success).toBe(false)
    expect(QuoteDocOverridesV2Schema.safeParse({ v: 2, order: ['a', 'a'] }).success).toBe(false)
  })
})

describe('fusión plantilla ⊕ ajustes', () => {
  const base = getDocPreset('atelier')

  it('sin ajustes devuelve la misma plantilla', () => {
    expect(mergeTemplateOverrides(base, null).template).toBe(base)
  })

  it('aplica tema, página, presentación de ítems, secciones, agregadas y orden', () => {
    const o: QuoteDocOverridesV2 = {
      v: 2,
      theme: { palette: { accent: '#FFE600' }, density: 'compact' },
      page: { size: 'A4', margins: { left: 22 } },
      itemDisplay: { showUnitPrices: false, drawingView: 'both' },
      sections: {
        warranty: { type: 'warranty', enabled: false },
        totals: { type: 'totals', title: 'Inversión', tone: 'surface', options: { variant: 'band' } },
        items: { type: 'items', options: { variant: 'table' } },
        payment: { type: 'items', enabled: false },
        fantasma: { type: 'terms', enabled: false },
      },
      added: [{ id: 'nota', type: 'custom_text', enabled: true, pageBreak: 'auto', tone: 'paper', options: { variant: 'callout', content: { blocks: [{ type: 'paragraph', children: [{ type: 'text', text: 'Hola' }] }] } } }],
      order: ['nota', 'totals'],
    }
    const { template, issues } = mergeTemplateOverrides(base, o)
    expect(validateDocTemplate(template).ok).toBe(true)
    expect(template.theme.density).toBe('compact')
    expect(contrastRatio(template.theme.palette.accent, template.theme.palette.paper)).toBeGreaterThanOrEqual(3)
    expect(template.page.size).toBe('A4')
    expect(template.page.margins.left).toBe(22)
    const items = template.sections.find((s) => s.id === 'items')!
    expect(items.options).toMatchObject({ variant: 'table', showUnitPrices: false, drawingView: 'both', columns: 1, drawingSize: 's' })
    expect(template.sections.find((s) => s.id === 'warranty')!.enabled).toBe(false)
    expect(template.sections.find((s) => s.id === 'totals')).toMatchObject({ title: 'Inversión', tone: 'surface', options: { variant: 'band' } })
    expect(template.sections[0].id).toBe('cover')
    const order = template.sections.map((s) => s.id)
    expect(order.indexOf('nota')).toBeLessThan(order.indexOf('totals'))
    expect(issues.filter((i) => i.code === 'override_ignored').map((i) => i.params?.id)).toEqual(['payment', 'fantasma'])
  })

  it('vuelve a mostrar secciones obligatorias ocultas por ajustes', () => {
    const { template, issues } = mergeTemplateOverrides(base, { v: 2, sections: { totals: { type: 'totals', enabled: false } } })
    expect(template.sections.find((s) => s.id === 'totals')!.enabled).toBe(true)
    expect(issues.map((i) => i.code)).toContain('section_reenabled')
  })

  it('orden: los listados ocupan sus lugares, los demás no se mueven', () => {
    const list = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }))
    expect(applySectionOrder(list, ['d', 'b']).map((s) => s.id)).toEqual(['a', 'd', 'c', 'b', 'e'])
    expect(applySectionOrder(list, ['e', 'd', 'c', 'b', 'a']).map((s) => s.id)).toEqual(['e', 'd', 'c', 'b', 'a'])
    expect(applySectionOrder([...list, { id: 'nueva' }], ['e', 'd', 'c', 'b', 'a', 'a']).map((s) => s.id)).toEqual(['e', 'd', 'c', 'b', 'a', 'nueva'])
    expect(applySectionOrder(list, ['zz']).map((s) => s.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(applySectionOrder(list, undefined).map((s) => s.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('compacta objetos vacíos', () => {
    expect(compactQuoteDocOverrides({ v: 2, texts: {}, theme: { palette: {} }, sections: { a: { type: 'items', options: {} } }, order: [], added: [] })).toEqual({ v: 2 })
  })
})

describe('resolveQuoteDocument', () => {
  const orgPrefs: Partial<DocumentPrefs> = { quoteTemplate: 'esencial', font: 'grotesk', accent: '#7A1F5C', showUnitPrice: true, showArea: false, paper: 'letter', intro: 'Texto de la organización', warranty: 'Garantía org', validityDays: 15 }

  it('capa de organización + cotización: textos, validez, idioma, notas', () => {
    const r = resolveQuoteDocument({
      template: getDocPreset('atelier'),
      orgPrefs,
      overrides: { intro: 'Texto de la cotización', notes: 'Nota', showUnitPrice: false, validityDays: 30 },
      orgLocale: 'es',
    })
    expect(r.texts).toMatchObject({ intro: 'Texto de la cotización', warranty: 'Garantía org', clientNote: 'Nota' })
    expect(r.validityDays).toBe(30)
    expect(r.locale).toBe('es')
    expect(r.migrated).toBe(true)
    const items = r.template.sections.find((s) => s.type === 'items')!
    expect(items.options).toMatchObject({ showUnitPrices: false })
    expect(r.template.theme.fonts.heading).toBe('hanken-grotesk')
    expect(r.template.page.size).toBe('Letter')
    expect(validateDocTemplate(r.template).ok).toBe(true)
  })

  it('el acento de marca sólo se aplica a diseños predefinidos', () => {
    const preset = resolveQuoteDocument({ template: getDocPreset('atelier'), orgPrefs: {}, brandAccent: '#7A1F5C' })
    expect(preset.template.theme.palette.accent).toBe('#7A1F5C')
    const own = { ...getDocPreset('atelier'), id: '3f2c1d4e-9b8a-4c7d-8e6f-5a4b3c2d1e0f', presetId: 'hogar' as const }
    const custom = resolveQuoteDocument({ template: own, orgPrefs, brandAccent: '#7A1F5C' })
    expect(custom.template.theme.palette.accent).toBe(own.theme.palette.accent)
  })

  it('notas por ítem y idioma de la cotización', () => {
    const r = resolveQuoteDocument({ template: getDocPreset('memoria'), overrides: { v: 2, locale: 'tr', items: { a: { note: 'Not' } } }, orgLocale: 'es' })
    expect(r.locale).toBe('tr')
    expect(r.itemNotes).toEqual({ a: 'Not' })
  })

  it('elige plantilla: la de la cotización, la de la organización (ids v4) o la predeterminada', () => {
    expect(pickQuoteTemplateRef(orgPrefs, null)).toMatchObject({ id: 'hogar', source: 'legacy' })
    expect(pickQuoteTemplateRef(orgPrefs, { v: 2, templateId: 'memoria' })).toMatchObject({ id: 'memoria', source: 'preset' })
    expect(pickQuoteTemplateRef({ quoteTemplate: 'compacta' }, { quoteTemplate: 'editorial' })).toMatchObject({ id: 'atelier' })
    expect(pickQuoteTemplateRef({ quoteTemplate: 'f7a1c2d3-0000-4000-8000-000000000001' as never }, null)).toMatchObject({ source: 'org', fallbackPresetId: 'hogar' })
    expect(pickQuoteTemplateRef(null, null)).toMatchObject({ id: 'hogar', source: 'default' })
    expect(pickQuoteTemplateRef({ quoteTemplate: 'vitrina' as never }, null)).toMatchObject({ id: 'hogar', source: 'default' })
  })
})
