import { describe, expect, it } from 'vitest'
import {
  DOC_FONTS,
  DOC_FONT_IDS,
  DocTemplateSchema,
  RichTextSchema,
  SECTION_DEFAULT_OPTIONS,
  SECTION_OPTION_SCHEMAS,
  SECTION_TYPES,
  checkPaletteContrast,
  contrastRatio,
  createSection,
  ensureContrast,
  getDocPreset,
  nearestFontWeight,
  normalizeHex,
  repairPaletteContrast,
  richTextFromPlain,
  richTextToPlain,
  validateDocTemplate,
  type DocPalette,
  type DocTemplate,
} from '../../src/templates'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const NODE_MODULES = fileURLToPath(new URL('../../../../node_modules/', import.meta.url))

const luz = () => getDocPreset('atelier')
const codes = (input: unknown) => {
  const r = validateDocTemplate(input)
  return r.ok ? [] : r.issues.map((i) => i.code)
}
const withSections = (t: DocTemplate, mutate: (s: DocTemplate['sections']) => void) => {
  mutate(t.sections)
  return t
}

describe('DocTemplate v1 — forma', () => {
  it('acepta los diseños predefinidos', () => {
    expect(validateDocTemplate(luz()).ok).toBe(true)
  })

  it('cada tipo de sección tiene opciones por defecto válidas', () => {
    for (const type of SECTION_TYPES) {
      expect(SECTION_OPTION_SCHEMAS[type].safeParse(SECTION_DEFAULT_OPTIONS[type]).success, type).toBe(true)
    }
  })

  it('rechaza campos desconocidos en todos los niveles', () => {
    expect(codes({ ...luz(), extra: 1 })).toContain('unknown_field')
    const t = luz()
    ;(t.theme as Record<string, unknown>).css = 'body{}'
    expect(codes(t)).not.toEqual([])
    const s = luz()
    ;(s.sections[0] as Record<string, unknown>).style = 'color:red'
    expect(codes(s)).toContain('unknown_field')
    const o = luz()
    ;(o.sections[0].options as Record<string, unknown>).html = '<b>x</b>'
    expect(codes(o).length).toBeGreaterThan(0)
  })

  it('rechaza llaves de prototipo venidas de JSON', () => {
    const raw = JSON.parse(JSON.stringify(luz()).replace('"theme":', '"__proto__":{"isAdmin":true},"theme":'))
    expect(codes(raw)).toContain('forbidden_key')
  })

  it('rechaza HTML, scripts, URLs y CSS en cualquier texto', () => {
    const name = luz()
    name.name = '<script>alert(1)</script>'
    expect(codes(name)).toContain('unsafe_text')

    const title = withSections(luz(), (s) => {
      s[1].title = 'javascript:alert(document.cookie)'
    })
    expect(codes(title)).toContain('unsafe_text')

    const cover = withSections(luz(), (s) => {
      if (s[0].type === 'cover') s[0].options.subtitle = 'Visítanos en https://phishing.example'
    })
    expect(codes(cover)).toContain('unsafe_text')

    const css = luz()
    css.sections.push(createSection({ type: 'custom_text', options: { content: { blocks: [{ type: 'paragraph', children: [{ type: 'text', text: 'x{background:url(evil)}' }] }] } } }))
    expect(codes(css)).toContain('unsafe_text')

    const desc = luz()
    desc.description = 'linea‮oculta'
    expect(codes(desc)).toContain('unsafe_text')
  })

  it('rechaza textos enormes', () => {
    const t = luz()
    t.name = 'x'.repeat(10_000)
    expect(codes(t)).toContain('too_long')
    const big = luz()
    big.sections.push(createSection({ type: 'custom_text', options: { content: { blocks: Array.from({ length: 20 }, () => ({ type: 'paragraph' as const, children: [{ type: 'text' as const, text: 'a'.repeat(1_000) }] })) } } }))
    expect(codes(big)).toContain('too_long')
    const huge = { ...luz(), name: 'y'.repeat(400_000) }
    expect(codes(huge)).toContain('too_large')
  })

  it('las imágenes sólo van por id de recurso (nunca URL ni data URL)', () => {
    for (const assetId of ['https://evil.example/a.png', 'data:image/png;base64,AAAA', '../../etc/passwd', 'a b c d e f g h']) {
      const t = withSections(luz(), (s) => {
        if (s[0].type === 'cover') s[0].options.assetId = assetId
      })
      expect(codes(t), assetId).toContain('invalid_value')
    }
    const ok = withSections(luz(), (s) => {
      if (s[0].type === 'cover') s[0].options.assetId = '3f2c1d4e-9b8a-4c7d-8e6f-5a4b3c2d1e0f'
    })
    expect(validateDocTemplate(ok).ok).toBe(true)
  })

  it('limita secciones, márgenes y valores numéricos', () => {
    const many = luz()
    for (let i = 0; i < 40; i++) many.sections.push(createSection({ type: 'page_break' }, many.sections.map((s) => s.id)))
    expect(codes(many)).toContain('too_many')
    const margins = luz()
    margins.page.margins.top = 2
    expect(codes(margins)).toContain('out_of_range')
    const ints = luz()
    ints.page.margins.left = 12.5
    expect(codes(ints)).toContain('invalid_value')
  })

  it('valida ids estables: formato, reservados y duplicados', () => {
    expect(codes(withSections(luz(), (s) => (s[1].id = 'Items Con Espacios')))).toContain('invalid_value')
    expect(codes(withSections(luz(), (s) => (s[1].id = 'constructor')))).toContain('reserved_id')
    expect(codes(withSections(luz(), (s) => (s[1].id = s[2].id)))).toContain('duplicate_id')
  })
})

describe('DocTemplate v1 — reglas cruzadas', () => {
  it('exige ítems y totales visibles en cotizaciones', () => {
    expect(codes(withSections(luz(), (s) => s.splice(s.findIndex((x) => x.type === 'totals'), 1)))).toContain('section_required')
    const hidden = withSections(luz(), (s) => {
      s.find((x) => x.type === 'items')!.enabled = false
    })
    expect(codes(hidden)).toContain('section_required')
  })

  it('exige una sección de productos visible en catálogos', () => {
    const cat = getDocPreset('sistema')
    cat.sections = cat.sections.filter((s) => !['families', 'product_cards', 'matrix'].includes(s.type))
    expect(codes(cat)).toContain('section_required_any')
  })

  it('no mezcla secciones de cotización y catálogo', () => {
    const t = luz()
    t.sections.push(createSection({ type: 'families' }))
    expect(codes(t)).toContain('section_not_allowed')
    const c = getDocPreset('habitar')
    c.sections.push(createSection({ type: 'totals' }))
    expect(codes(c)).toContain('section_not_allowed')
  })

  it('portada única y primera', () => {
    const t = luz()
    t.sections.push(t.sections.shift()!)
    expect(codes(t)).toContain('cover_not_first')
    const two = luz()
    two.sections.splice(1, 0, createSection({ type: 'cover', id: 'cover-2' }))
    expect(codes(two)).toEqual(expect.arrayContaining(['section_limit', 'cover_not_first']))
  })

  it('fondos permitidos por tipo y títulos sólo donde corresponde', () => {
    expect(codes(withSections(luz(), (s) => (s.find((x) => x.type === 'items')!.tone = 'strong')))).toContain('tone_not_allowed')
    const t = luz()
    t.sections.push(createSection({ type: 'page_break' }))
    t.sections[t.sections.length - 1].title = 'Hola'
    expect(codes(t)).toContain('title_not_allowed')
  })

  it('combinaciones de variante incompatibles', () => {
    const t = withSections(luz(), (s) => {
      const items = s.find((x) => x.type === 'items')
      if (items?.type === 'items') {
        items.options.variant = 'table'
        items.options.columns = 3
        items.options.drawingSize = 'xl'
      }
    })
    const issues = validateDocTemplate(t)
    expect(issues.ok).toBe(false)
    expect(issues.issues.filter((i) => i.code === 'variant_incompatible').map((i) => i.path.at(-1))).toEqual(['columns', 'drawingSize'])
  })

  it('un catálogo no muestra cliente en la portada', () => {
    const c = getDocPreset('habitar')
    const cover = c.sections[0]
    if (cover.type === 'cover') cover.options.showClient = true
    expect(codes(c)).toContain('catalog_quote_data')
  })

  it('marcadores: sólo los de la lista y del tipo de documento', () => {
    expect(codes(withSections(luz(), (s) => (s[1].title = 'Para {cliente}')))).toContain('invalid_placeholder')
    expect(codes(withSections(luz(), (s) => (s[1].title = 'Edición {catalog.title}')))).toContain('placeholder_not_allowed')
    expect(validateDocTemplate(withSections(luz(), (s) => (s[1].title = 'Para {client.name}'))).ok).toBe(true)
    const rich = luz()
    rich.sections.push(createSection({ type: 'custom_text', options: { content: { blocks: [{ type: 'paragraph', children: [{ type: 'placeholder', key: 'catalog.date' }] }] } } }))
    expect(codes(rich)).toContain('placeholder_not_allowed')
    const braces = luz()
    braces.sections.push(createSection({ type: 'custom_text', options: { content: { blocks: [{ type: 'paragraph', children: [{ type: 'text', text: 'Hola {client.name}' }] }] } } }))
    expect(codes(braces)).toContain('placeholder_in_text')
  })

  it('validateDocTemplate puede exigir un tipo', () => {
    const r = validateDocTemplate(luz(), { kind: 'catalog' })
    expect(r.ok).toBe(false)
    expect(r.issues[0].code).toBe('kind_mismatch')
  })
})

describe('tema: tipografías', () => {
  it('la lista cerrada coincide con lo instalado en disco (latin y latin-ext)', () => {
    for (const id of DOC_FONT_IDS) {
      const info = DOC_FONTS[id]
      const pkg = require.resolve(`${info.package}/package.json`)
      expect(existsSync(pkg), info.package).toBe(true)
      const dir = pkg.replace(/package\.json$/, 'files/')
      const base = id
      const latinExt = info.variable ? `${base}-latin-ext-wght-normal.woff2` : `${base}-latin-ext-400-normal.woff2`
      expect(existsSync(dir + latinExt), `${id}: ${latinExt}`).toBe(true)
    }
  })

  it('roles y pesos', () => {
    const body = luz()
    body.theme.fonts.body = 'jetbrains-mono'
    expect(codes(body)).toContain('font_role')
    const mono = luz()
    mono.theme.fonts.mono = 'inter-tight'
    expect(codes(mono)).toContain('font_role')
    const weight = luz()
    weight.theme.fonts.heading = 'schibsted-grotesk'
    weight.theme.headingWeight = 300
    expect(codes(weight)).toContain('font_weight')
    expect(nearestFontWeight('schibsted-grotesk', 300)).toBe(400)
    expect(nearestFontWeight('instrument-sans', 300)).toBe(400)
    const unknown = luz() as unknown as { theme: { fonts: { heading: string } } }
    unknown.theme.fonts.heading = 'Comic Sans MS'
    expect(codes(unknown).length).toBeGreaterThan(0)
  })
})

describe('tema: contraste WCAG', () => {
  it('razón de contraste conocida', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5)
    expect(contrastRatio('#767676', '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
    expect(normalizeHex('#abc')).toBe('#AABBCC')
    expect(normalizeHex('url(x)')).toBeNull()
  })

  it('ensureContrast alcanza el mínimo moviendo lo mínimo', () => {
    const fixed = ensureContrast('#FFD500', '#FFFFFF', 3)
    expect(contrastRatio(fixed, '#FFFFFF')).toBeGreaterThanOrEqual(3)
    expect(ensureContrast('#222222', '#FFFFFF', 4.5)).toBe('#222222')
    const onMid = ensureContrast('#777777', '#808080', 4.5)
    expect(contrastRatio(onMid, '#808080')).toBeGreaterThanOrEqual(4.5)
  })

  it('rechaza paletas ilegibles', () => {
    const t = luz()
    t.theme.palette.ink = '#DDDDDD'
    expect(codes(t)).toContain('low_contrast')
    const accent = luz()
    accent.theme.palette.onAccent = accent.theme.palette.accent
    expect(codes(accent)).toContain('low_contrast')
  })

  it('repairPaletteContrast deja todo legible sin tocar el papel', () => {
    const bad: DocPalette = { paper: '#FFFFFF', surface: '#F4F4F4', ink: '#BBBBBB', muted: '#DDDDDD', rule: '#FEFEFE', accent: '#FFE600', onAccent: '#FFFFFF', strong: '#333333', onStrong: '#444444' }
    const { palette, changed } = repairPaletteContrast(bad)
    expect(palette.paper).toBe('#FFFFFF')
    expect(checkPaletteContrast(palette).every((c) => c.ok)).toBe(true)
    expect(changed).toEqual(expect.arrayContaining(['ink', 'muted', 'accent', 'onAccent', 'onStrong']))
  })

  it('con el acento bloqueado ajusta el texto sobre el acento', () => {
    const p = { ...luz().theme.palette, accent: '#2E8B57', onAccent: '#FFFFFF' }
    const { palette, changed } = repairPaletteContrast(p, { locked: ['accent'] })
    expect(palette.accent).toBe('#2E8B57')
    expect(changed).toContain('onAccent')
    expect(contrastRatio(palette.onAccent, palette.accent)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('texto enriquecido', () => {
  it('convierte el Markdown mínimo de v4 en AST con marcadores', () => {
    const doc = richTextFromPlain('# Condiciones\n\nHola {client.name}, **gracias** por *preferirnos*.\n\n- Retiro\n- Sellado\n\n1. Medición\n2. Instalación\nY {cliente} sin llaves')
    expect(RichTextSchema.safeParse(doc).success).toBe(true)
    expect(doc.blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'bullet_list', 'ordered_list', 'paragraph'])
    expect(richTextToPlain(doc)).toContain('Hola {client.name}, gracias por preferirnos.')
    expect(richTextToPlain(doc, { 'client.name': 'Ana' })).toContain('Hola Ana,')
    expect(richTextToPlain(doc)).toContain('Y cliente sin llaves')
  })

  it('rechaza nodos y anidamientos fuera del vocabulario', () => {
    expect(RichTextSchema.safeParse({ blocks: [{ type: 'html', html: '<b>x</b>' }] }).success).toBe(false)
    expect(RichTextSchema.safeParse({ blocks: [{ type: 'paragraph', children: [{ type: 'link', href: 'https://x' }] }] }).success).toBe(false)
    expect(RichTextSchema.safeParse({ blocks: [{ type: 'bullet_list', items: [{ children: [{ type: 'bullet_list', items: [] }] }] }] }).success).toBe(false)
    expect(RichTextSchema.safeParse({ blocks: [{ type: 'paragraph', children: [{ type: 'text', text: 'a\nb' }] }] }).success).toBe(false)
  })
})

describe('esquema completo con DocTemplateSchema', () => {
  it('parsea y devuelve datos idénticos', () => {
    const t = luz()
    const parsed = DocTemplateSchema.parse(t)
    expect(parsed).toEqual(t)
  })
})
