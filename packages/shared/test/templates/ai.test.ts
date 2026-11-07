import { describe, expect, it } from 'vitest'
import {
  DOC_OPS_JSON_SCHEMA,
  DOC_TEMPLATE_JSON_SCHEMA,
  DOC_TEMPLATE_PROMPT_SPEC,
  SECTION_TYPES,
  checkPaletteContrast,
  docTemplateJsonSchema,
  docTemplatePromptSpec,
  extractJsonText,
  getDocPreset,
  parseAiDocOps,
  parseAiTemplate,
  repairDocTemplate,
  validateDocTemplate,
} from '../../src/templates'

const minimal = {
  kind: 'quote',
  name: 'Minimalista con portada',
  theme: { palette: { accent: '#0F766E' } },
  sections: [{ type: 'cover', options: { variant: 'typographic' } }, { type: 'letter' }],
}

describe('parseAiTemplate — reparación de lo menor', () => {
  it('acepta JSON dentro de ```json y completa lo obligatorio', () => {
    const r = parseAiTemplate('Aquí tienes:\n```json\n' + JSON.stringify(minimal) + '\n```')
    expect(r.ok).toBe(true)
    const t = r.template!
    expect(t.id).toBe('draft')
    expect(t.name).toBe('Minimalista con portada')
    expect(t.sections.map((s) => s.type)).toEqual(expect.arrayContaining(['cover', 'letter', 'items', 'totals']))
    expect(t.sections[0].type).toBe('cover')
    expect(t.theme.palette.accent).toBe('#0F766E')
    expect(r.issues.filter((i) => i.code === 'section_added').map((i) => i.params?.section)).toEqual(['items', 'totals'])
    expect(validateDocTemplate(t).ok).toBe(true)
  })

  it('usa el id del servidor y el diseño base pedido', () => {
    const r = parseAiTemplate({ ...minimal, presetId: 'memoria' }, { id: '0b0c0d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e' })
    expect(r.template!.id).toBe('0b0c0d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e')
    expect(r.template!.theme.fonts.heading).toBe('overpass')
    expect(r.template!.presetId).toBe('memoria')
  })

  it('recorta, ajusta rangos y descarta campos desconocidos', () => {
    const r = parseAiTemplate({
      kind: 'quote',
      name: 'N'.repeat(300),
      extraRoot: true,
      page: { size: 'a4', margins: { top: 2, right: 99, bottom: 15.6, left: 'x' }, header: 'banner' },
      theme: { headingWeight: 950, density: 'COMPACT', radius: 'huge', fonts: { heading: 'comic-sans', body: 'jetbrains-mono' } },
      sections: [
        { type: 'items', id: 'Mis Ítems', tone: 'strong', options: { variant: 'table', columns: 3, drawingSize: 'xl', showSpecs: 'yes', unknownOpt: 1 } },
        { type: 'glass' },
        { type: 'hologram' },
        { type: 'totals', options: { variant: 'band' } },
        { type: 'cover' },
        { type: 'gallery', options: { images: [{ assetId: '3f2c1d4e-9b8a-4c7d-8e6f-5a4b3c2d1e0f', caption: 'Antes' }, { assetId: 'nope' }] } },
      ],
    })
    expect(r.ok).toBe(true)
    const t = r.template!
    expect(t.name).toHaveLength(80)
    expect(t.page).toMatchObject({ size: 'A4', margins: { top: 8, right: 30, bottom: 16 } })
    expect(t.theme.density).toBe('compact')
    expect(t.theme.headingWeight).toBe(800)
    expect(t.theme.fonts.heading).toBe(getDocPreset('hogar').theme.fonts.heading)
    expect(t.sections[0].type).toBe('cover')
    const items = t.sections.find((s) => s.type === 'items')!
    expect(items).toMatchObject({ id: 'items', tone: 'paper', options: { variant: 'table', columns: 1, drawingSize: 's', showSpecs: true } })
    expect(t.sections.some((s) => (s.type as string) === 'glass' || (s.type as string) === 'hologram')).toBe(false)
    const gallery = t.sections.find((s) => s.type === 'gallery')!
    expect(gallery.options).toMatchObject({ images: [{ assetId: '3f2c1d4e-9b8a-4c7d-8e6f-5a4b3c2d1e0f', caption: 'Antes' }] })
    const codes = r.issues.map((i) => i.code)
    expect(codes).toEqual(expect.arrayContaining(['section_not_allowed', 'section_dropped', 'section_moved', 'variant_adjusted', 'value_dropped', 'id_renamed']))
  })

  it('corrige el contraste de la paleta propuesta', () => {
    const r = parseAiTemplate({ ...minimal, theme: { palette: { paper: '#FFFFFF', ink: '#CCCCCC', muted: '#EEEEEE', accent: '#FFFF00', onAccent: '#FFFFFF' } } })
    expect(r.ok).toBe(true)
    expect(checkPaletteContrast(r.template!.theme.palette).every((c) => c.ok)).toBe(true)
    expect(r.template!.theme.palette.paper).toBe('#FFFFFF')
    expect(r.issues.filter((i) => i.code === 'contrast_repaired').length).toBeGreaterThanOrEqual(3)
  })

  it('convierte texto libre a AST y quita marcadores de otro tipo', () => {
    const r = parseAiTemplate({
      kind: 'quote',
      name: 'Con texto',
      sections: [
        { type: 'items' },
        { type: 'totals' },
        { type: 'custom_text', title: 'Para {client.name} {catalog.title}', options: { content: 'Hola {client.name}\n\n- Uno\n- Dos\n\nEdición {catalog.date}' } },
      ],
    })
    expect(r.ok).toBe(true)
    const custom = r.template!.sections.find((s) => s.type === 'custom_text')!
    expect(custom.title).toBe('Para {client.name}')
    expect(custom.type === 'custom_text' && custom.options.content.blocks.map((b) => b.type)).toEqual(['paragraph', 'bullet_list', 'paragraph'])
    expect(JSON.stringify(custom)).not.toContain('catalog.date')
  })

  it('respeta el tipo pedido y descarta secciones del otro', () => {
    const r = parseAiTemplate({ kind: 'catalog', name: 'X', sections: [{ type: 'items' }, { type: 'cover', options: { showTotal: true } }] }, { kind: 'catalog' })
    expect(r.ok).toBe(true)
    expect(r.template!.kind).toBe('catalog')
    expect(r.template!.sections[0].options).toMatchObject({ showClient: false })
    expect(r.template!.sections.some((s) => s.type === 'families' || s.type === 'product_cards' || s.type === 'matrix')).toBe(true)
    const mismatch = parseAiTemplate({ kind: 'catalog', name: 'X', sections: [{ type: 'items' }] }, { kind: 'quote' })
    expect(mismatch.template!.kind).toBe('quote')
    expect(mismatch.issues.map((i) => i.code)).toContain('kind_mismatch')
  })
})

describe('parseAiTemplate — rechazo de contenido inseguro', () => {
  const attacks: [string, unknown, string][] = [
    ['script en el nombre', { ...minimal, name: '<script>fetch("//x")</script>' }, 'unsafe_text'],
    ['javascript: en un título', { ...minimal, sections: [{ type: 'letter', title: 'javascript:alert(1)' }] }, 'unsafe_text'],
    ['URL en texto', { ...minimal, description: 'Paga en https://evil.example/pago' }, 'unsafe_text'],
    ['CSS en un campo desconocido', { ...minimal, style: 'body{background:url(x)}' }, 'unsafe_text'],
    ['expresión CSS', { ...minimal, theme: { palette: { accent: 'expression(alert(1))' } } }, 'unsafe_text'],
    ['data URL como imagen', { ...minimal, sections: [{ type: 'cover', options: { variant: 'photo', assetId: 'data:image/svg+xml;base64,PHN2Zz4=' } }] }, 'unsafe_text'],
    ['plantillas ejecutables', { ...minimal, name: '{{7*7}}' }, 'unsafe_text'],
    ['bidi oculto', { ...minimal, name: 'Total‮ 000.1$' }, 'unsafe_text'],
    ['HTML en llaves', { ...minimal, ['<img src=x>']: 1 }, 'unsafe_text'],
  ]
  for (const [label, input, code] of attacks) {
    it(label, () => {
      const r = parseAiTemplate(input)
      expect(r.ok).toBe(false)
      expect(r.template).toBeUndefined()
      expect(r.issues.map((i) => i.code)).toContain(code)
    })
  }

  it('contaminación de prototipos', () => {
    const r = parseAiTemplate('{"kind":"quote","name":"x","sections":[],"__proto__":{"isAdmin":true}}')
    expect(r.ok).toBe(false)
    expect(r.issues[0].code).toBe('forbidden_key')
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined()
  })

  it('respuestas gigantes, profundas, cíclicas o que no son JSON', () => {
    expect(parseAiTemplate('x'.repeat(300 * 1024)).issues[0].code).toBe('too_large')
    let deep: Record<string, unknown> = {}
    const root = deep
    for (let i = 0; i < 30; i++) {
      deep.a = {}
      deep = deep.a as Record<string, unknown>
    }
    expect(parseAiTemplate({ ...minimal, deep: root }).issues[0].code).toBe('too_deep')
    const cyclic: Record<string, unknown> = { ...minimal }
    cyclic.self = cyclic
    expect(parseAiTemplate(cyclic).ok).toBe(false)
    expect(parseAiTemplate('Lo siento, no puedo hacer eso.').issues[0].code).toBe('invalid_json')
    expect(parseAiTemplate({ ...minimal, fn: () => 1 }).issues[0].code).toBe('non_json')
  })

  it('los mensajes vienen en español', () => {
    const r = parseAiTemplate({ ...minimal, name: '<b>x</b>' })
    expect(r.issues[0].message).toBe('Este texto no puede contener etiquetas HTML.')
  })
})

describe('repairDocTemplate', () => {
  it('nunca lanza y siempre devuelve forma completa', () => {
    for (const input of [undefined, null, 42, 'x', [], { sections: 'no' }, { theme: [], page: 7, sections: [null, 1, 'x'] }]) {
      const r = repairDocTemplate(input)
      expect(validateDocTemplate(r.template).ok).toBe(true)
    }
  })
})

describe('contrato JSON para la IA', () => {
  it('esquema JSON estricto con todas las secciones y sin propiedades libres', () => {
    const schema = JSON.parse(JSON.stringify(DOC_TEMPLATE_JSON_SCHEMA)) as { type: string; additionalProperties: boolean; properties: Record<string, unknown>; required: string[] }
    expect(schema.type).toBe('object')
    expect(schema.additionalProperties).toBe(false)
    expect(schema.required).toEqual(expect.arrayContaining(['kind', 'name', 'sections']))
    const text = JSON.stringify(schema)
    for (const type of SECTION_TYPES) expect(text).toContain(`"const":"${type}"`)
    const quoteOnly = JSON.stringify(docTemplateJsonSchema('quote'))
    expect(quoteOnly).not.toContain('"const":"families"')
    expect(quoteOnly).toContain('"const":"items"')
    expect(Object.keys(DOC_OPS_JSON_SCHEMA)).toEqual(expect.arrayContaining(['type', 'properties']))
    expect(JSON.stringify(DOC_OPS_JSON_SCHEMA)).toContain('"const":"setColor"')
  })

  it('especificación textual compacta y completa', () => {
    for (const type of SECTION_TYPES) expect(DOC_TEMPLATE_PROMPT_SPEC).toContain(`- ${type} [`)
    const spec = docTemplatePromptSpec('catalog')
    expect(spec).not.toContain('- items [')
    expect(spec).toContain('catalog.title')
    expect(DOC_TEMPLATE_PROMPT_SPEC.length).toBeLessThan(16_000)
    expect(DOC_TEMPLATE_PROMPT_SPEC).toContain('Never output HTML')
  })

  it('extrae JSON de respuestas con ruido', () => {
    expect(extractJsonText('```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(extractJsonText('Claro: {"a":1} ¡listo!')).toBe('{"a":1}')
  })

  it('parseAiDocOps valida operaciones con el mismo filtro de seguridad', () => {
    const ok = parseAiDocOps('{"ops":[{"op":"setColor","role":"accent","value":"#123456"},{"op":"toggleSection","sectionId":"warranty","enabled":false}]}')
    expect(ok.ok).toBe(true)
    expect(ok.ops).toHaveLength(2)
    const bad = parseAiDocOps([{ op: 'setText', field: 'intro', value: '<iframe src=//x>' }])
    expect(bad.ok).toBe(false)
    expect(bad.issues[0].code).toBe('unsafe_text')
    expect(parseAiDocOps({ ops: [{ op: 'deleteDatabase' }] }).ok).toBe(false)
  })
})
