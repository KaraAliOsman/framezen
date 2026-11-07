import { describe, expect, it } from 'vitest'
import {
  DOC_OP_NAMES,
  applyDocOp,
  applyDocOps,
  contrastRatio,
  describeDocOp,
  describeDocOpKey,
  emptyQuoteDocOverrides,
  getDocPreset,
  mergeTemplateOverrides,
  parseDocOps,
  summarizeDocOps,
  validateDocTemplate,
  type DocOp,
  type DocTemplate,
  type QuoteDocOverridesV2,
} from '../../src/templates'

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v)
    Object.freeze(value)
  }
  return value
}

const frozenLuz = () => deepFreeze(getDocPreset('atelier'))
const ids = (t: DocTemplate) => t.sections.map((s) => s.id)

describe('applyDocOps sobre plantillas', () => {
  it('es pura: no muta la entrada (congelada) y devuelve un objeto nuevo válido', () => {
    const base = frozenLuz()
    const r = applyDocOps(base, [
      { op: 'rename', name: 'Mi diseño' },
      { op: 'setColor', role: 'accent', value: '#1d4ed8' },
      { op: 'setFontPair', pairId: 'public' },
      { op: 'setPage', patch: { size: 'A4', margins: { top: 20 } } },
    ])
    expect(r.ok).toBe(true)
    expect(r.changed).toBe(true)
    expect(r.result).not.toBe(base)
    expect(r.result.name).toBe('Mi diseño')
    expect(r.result.theme.palette.accent).toBe('#1D4ED8')
    expect(r.result.theme.fonts).toEqual({ heading: 'public-sans', body: 'public-sans', mono: 'jetbrains-mono' })
    expect(r.result.page.size).toBe('A4')
    expect(r.result.page.margins).toEqual({ top: 20, right: 14, bottom: 12, left: 14 })
    expect(validateDocTemplate(r.result).ok).toBe(true)
    expect(base.name).toBe('Atelier')
  })

  it('es idempotente: repetir una operación no cambia nada y conserva la referencia', () => {
    const first = applyDocOp(frozenLuz(), { op: 'toggleSection', sectionId: 'warranty', enabled: false })
    expect(first.changed).toBe(true)
    const second = applyDocOp(first.result, { op: 'toggleSection', sectionId: 'warranty', enabled: false })
    expect(second.ok).toBe(true)
    expect(second.changed).toBe(false)
    expect(second.result).toBe(first.result)
    expect(second.issues.map((i) => i.code)).toContain('op_noop')
    const removed = applyDocOp(frozenLuz(), { op: 'removeSection', sectionId: 'warranty' })
    const again = applyDocOp(removed.result, { op: 'removeSection', sectionId: 'warranty' })
    expect(again.ok).toBe(true)
    expect(again.changed).toBe(false)
    expect(again.issues.map((i) => i.code)).toContain('target_not_found')
  })

  it('atómico por defecto: si una operación falla no se aplica ninguna', () => {
    const base = frozenLuz()
    const r = applyDocOps(base, [
      { op: 'rename', name: 'Nuevo' },
      { op: 'moveSection', sectionId: 'no-existe', position: 'end' },
    ])
    expect(r.ok).toBe(false)
    expect(r.result).toBe(base)
    expect(r.applied).toEqual([])
    expect(r.issues.find((i) => i.severity === 'error')).toMatchObject({ code: 'target_not_found', opIndex: 1 })
  })

  it('best_effort aplica lo válido y salta lo inválido', () => {
    const r = applyDocOps(frozenLuz(), [{ op: 'rename', name: 'Nuevo' }, { op: 'removeSection', sectionId: 'totals' }, { op: 'setColor', role: 'ink', value: '#000000' }], { mode: 'best_effort' })
    expect(r.ok).toBe(true)
    expect(r.applied).toEqual([0, 2])
    expect(r.result.name).toBe('Nuevo')
    expect(ids(r.result)).toContain('totals')
    expect(r.issues.some((i) => i.code === 'section_required' && i.opIndex === 1)).toBe(true)
  })

  it('protege las secciones obligatorias', () => {
    expect(applyDocOp(frozenLuz(), { op: 'removeSection', sectionId: 'items' }).issues[0].code).toBe('section_required')
    expect(applyDocOp(frozenLuz(), { op: 'toggleSection', sectionId: 'totals', enabled: false }).ok).toBe(false)
    expect(applyDocOp(frozenLuz(), { op: 'updateSection', sectionId: 'totals', patch: { enabled: false } }).ok).toBe(false)
  })

  it('agrega secciones con valores por defecto, antes del cierre y con id estable', () => {
    const r = applyDocOp(frozenLuz(), { op: 'addSection', section: { type: 'custom_text', title: 'Instalación', options: { content: { blocks: [{ type: 'paragraph', children: [{ type: 'text', text: 'Incluye retiro y sellado.' }] }] } } } })
    expect(r.ok).toBe(true)
    const list = ids(r.result)
    expect(list.indexOf('custom-text')).toBe(list.indexOf('totals') - 1)
    const added = r.result.sections.find((s) => s.id === 'custom-text')!
    expect(added).toMatchObject({ type: 'custom_text', enabled: true, title: 'Instalación', options: { variant: 'paragraphs' } })
    const second = applyDocOp(r.result, { op: 'addSection', section: { type: 'custom_text' }, afterId: 'cover' })
    expect(ids(second.result)[1]).toBe('custom-text-2')
  })

  it('rechaza secciones de otro tipo de documento, duplicadas o sobre el máximo', () => {
    expect(applyDocOp(frozenLuz(), { op: 'addSection', section: { type: 'families' } }).issues[0].code).toBe('section_not_allowed')
    expect(applyDocOp(frozenLuz(), { op: 'addSection', section: { type: 'cover' } }).issues[0].code).toBe('section_limit')
    expect(applyDocOp(frozenLuz(), { op: 'addSection', section: { type: 'custom_text', id: 'items' } }).issues[0].code).toBe('duplicate_id')
    expect(applyDocOp(frozenLuz(), { op: 'duplicateSection', sectionId: 'totals' }).issues[0].code).toBe('section_limit')
  })

  it('mueve por ancla y la portada sigue primera', () => {
    const r = applyDocOp(frozenLuz(), { op: 'moveSection', sectionId: 'terms', afterId: 'cover' })
    expect(ids(r.result).slice(0, 2)).toEqual(['cover', 'terms'])
    const start = applyDocOp(frozenLuz(), { op: 'moveSection', sectionId: 'terms', position: 'start' })
    expect(ids(start.result).slice(0, 2)).toEqual(['cover', 'terms'])
    expect(start.issues.map((i) => i.code)).toContain('section_moved')
    const cover = applyDocOp(frozenLuz(), { op: 'moveSection', sectionId: 'cover', position: 'end' })
    expect(ids(cover.result)[0]).toBe('cover')
  })

  it('ajusta opciones y normaliza combinaciones de variante (nunca bloquea)', () => {
    const r = applyDocOp(frozenLuz(), { op: 'updateSectionOptions', sectionId: 'items', options: { variant: 'table' } })
    expect(r.ok).toBe(true)
    const items = r.result.sections.find((s) => s.id === 'items')!
    expect(items.options).toMatchObject({ variant: 'table', columns: 1, drawingSize: 's' })
    expect(r.issues.filter((i) => i.code === 'variant_adjusted').map((i) => i.severity)).toEqual(['info'])
    const explicit = applyDocOp(frozenLuz(), { op: 'updateSectionOptions', sectionId: 'items', options: { variant: 'sheet', columns: 3 } })
    expect(explicit.result.sections.find((s) => s.id === 'items')!.options).toMatchObject({ variant: 'sheet', columns: 1, drawingSize: 'xl' })
    expect(explicit.issues.find((i) => i.code === 'variant_adjusted' && i.path.at(-1) === 'columns')?.severity).toBe('warning')
  })

  it('rechaza opciones inválidas o de otro tipo', () => {
    expect(applyDocOp(frozenLuz(), { op: 'updateSectionOptions', sectionId: 'items', options: { variant: 'html' } }).ok).toBe(false)
    expect(applyDocOp(frozenLuz(), { op: 'updateSectionOptions', sectionId: 'items', options: { showQr: true } }).issues[0].code).toBe('unknown_field')
    expect(applyDocOp(frozenLuz(), { op: 'updateSectionOptions', sectionId: 'items', options: { __proto__: { x: 1 } } as never }).ok).toBe(true)
  })

  it('textos: limpia invisibles, rechaza contenido inseguro y valida marcadores', () => {
    const ok = applyDocOp(frozenLuz(), { op: 'setSectionText', sectionId: 'cover', slot: 'title', value: 'Propuesta para​ {client.name}' })
    expect(ok.ok).toBe(true)
    const cover = ok.result.sections[0]
    expect(cover.type === 'cover' && cover.options.title).toBe('Propuesta para {client.name}')
    expect(applyDocOp(frozenLuz(), { op: 'setSectionText', sectionId: 'cover', slot: 'title', value: '<img src=x onerror=alert(1)>' }).issues[0]).toMatchObject({ code: 'unsafe_text', params: { reason: 'html' } })
    expect(applyDocOp(frozenLuz(), { op: 'rename', name: 'Visita https://evil.example' }).issues[0].code).toBe('unsafe_text')
    expect(applyDocOp(frozenLuz(), { op: 'setSectionText', sectionId: 'terms', slot: 'title', value: 'Edición {catalog.title}' }).issues[0].code).toBe('placeholder_not_allowed')
    expect(applyDocOp(frozenLuz(), { op: 'setSectionText', sectionId: 'terms', slot: 'subtitle', value: 'x' }).issues[0].code).toBe('op_invalid')
    const long = applyDocOp(frozenLuz(), { op: 'rename', name: 'x'.repeat(150) })
    expect(long.ok).toBe(true)
    expect(long.result.name).toHaveLength(80)
    expect(long.issues.map((i) => i.code)).toContain('text_truncated')
  })

  it('texto enriquecido: reemplazo completo desde texto plano y edición por bloques', () => {
    const added = applyDocOp(frozenLuz(), { op: 'addSection', section: { type: 'custom_text', id: 'nota' } }).result
    const set = applyDocOp(added, { op: 'setSectionText', sectionId: 'nota', slot: 'content', value: 'Hola {client.name}\n\n- Uno\n- Dos' })
    const nota = () => set.result.sections.find((s) => s.id === 'nota')!
    expect(nota().type === 'custom_text' && nota().options.content.blocks.map((b) => b.type)).toEqual(['paragraph', 'bullet_list'])
    const appended = applyDocOp(set.result, { op: 'editRichText', sectionId: 'nota', action: 'append', block: { type: 'heading', level: 2, children: [{ type: 'text', text: 'Plazos' }] } })
    const moved = applyDocOp(appended.result, { op: 'editRichText', sectionId: 'nota', action: 'move', index: 2, toIndex: 0 })
    const s = moved.result.sections.find((x) => x.id === 'nota')!
    expect(s.type === 'custom_text' && s.options.content.blocks[0].type).toBe('heading')
    expect(applyDocOp(moved.result, { op: 'editRichText', sectionId: 'nota', action: 'remove', index: 9 }).issues[0].code).toBe('op_invalid')
    expect(applyDocOp(moved.result, { op: 'setSectionText', sectionId: 'nota', slot: 'content', value: 'Lee <script>x</script>' }).issues[0].code).toBe('unsafe_text')
    expect(applyDocOp(moved.result, { op: 'editRichText', sectionId: 'nota', action: 'append', block: { type: 'paragraph', children: [{ type: 'text', text: 'javascript:alert(1)' }] } }).ok).toBe(false)
  })

  it('tema: el contraste se corrige solo y el color elegido se respeta si puede', () => {
    const r = applyDocOp(frozenLuz(), { op: 'setColor', role: 'accent', value: '#2E8B57' })
    expect(r.ok).toBe(true)
    expect(r.result.theme.palette.accent).toBe('#2E8B57')
    expect(contrastRatio(r.result.theme.palette.onAccent, '#2E8B57')).toBeGreaterThanOrEqual(4.5)
    expect(r.issues.map((i) => i.code)).toContain('contrast_repaired')
    const ink = applyDocOp(frozenLuz(), { op: 'setColor', role: 'ink', value: '#EEEEEE' })
    expect(ink.ok).toBe(true)
    expect(contrastRatio(ink.result.theme.palette.ink, ink.result.theme.palette.paper)).toBeGreaterThanOrEqual(4.5)
    expect(applyDocOp(frozenLuz(), { op: 'setFontPair', body: 'jetbrains-mono' }).issues[0].code).toBe('font_role')
    const weight = applyDocOp(frozenLuz(), { op: 'setFontPair', pairId: 'instrument' })
    expect(weight.result.theme.headingWeight).toBe(500)
  })

  it('estilo de dibujo global hace que todas las secciones hereden', () => {
    const local = applyDocOp(frozenLuz(), { op: 'setDrawingStyle', style: 'technical', sectionId: 'items' }).result
    expect(local.sections.find((s) => s.id === 'items')!.options).toMatchObject({ drawingStyle: 'technical' })
    const global = applyDocOp(local, { op: 'setDrawingStyle', style: 'realistic' }).result
    expect(global.theme.drawingStyle).toBe('realistic')
    expect(global.sections.find((s) => s.id === 'items')!.options).toMatchObject({ drawingStyle: 'inherit' })
    expect(applyDocOp(frozenLuz(), { op: 'setDrawingStyle', style: 'technical', sectionId: 'terms' }).ok).toBe(false)
  })

  it('restablece al diseño de origen', () => {
    const edited = applyDocOps(frozenLuz(), [{ op: 'rename', name: 'Mío' }, { op: 'removeSection', sectionId: 'warranty' }, { op: 'setColor', role: 'accent', value: '#123456' }]).result
    const reset = applyDocOp(edited, { op: 'resetToPreset' })
    expect(reset.result.name).toBe('Mío')
    expect(reset.result.sections).toEqual(getDocPreset('atelier').sections)
    expect(reset.result.theme).toEqual(getDocPreset('atelier').theme)
    expect(applyDocOp(frozenLuz(), { op: 'resetToPreset', presetId: 'habitar' }).issues[0].code).toBe('kind_mismatch')
  })

  it('operaciones de cotización no aplican a plantillas', () => {
    expect(applyDocOp(frozenLuz(), { op: 'setText', field: 'intro', value: 'Hola' }).issues[0].code).toBe('op_not_supported')
    expect(applyDocOp(frozenLuz(), { op: 'setLocale', locale: 'en' }).issues[0].code).toBe('op_not_supported')
  })

  it('rechaza operaciones desconocidas, malformadas o en exceso', () => {
    expect(applyDocOp(frozenLuz(), { op: 'eval', code: 'x' }).issues[0].code).toBe('op_invalid')
    expect(applyDocOp(frozenLuz(), { op: 'setColor', role: 'accent', value: 'red' }).issues[0].code).toBe('invalid_value')
    expect(applyDocOp(frozenLuz(), { op: 'setColor', role: 'accent', value: '#123456', extra: 1 }).issues[0].code).toBe('unknown_field')
    expect(applyDocOps(frozenLuz(), Array.from({ length: 51 }, () => ({ op: 'rename', name: 'x' }))).issues[0].code).toBe('too_many_ops')
    expect(applyDocOps(frozenLuz(), 'rename' as never).ok).toBe(false)
  })
})

describe('applyDocOps sobre ajustes por cotización', () => {
  const base = deepFreeze(getDocPreset('atelier'))
  const empty = () => deepFreeze(emptyQuoteDocOverrides())

  it('textos, validez, idioma, notas por ítem y presentación de ítems', () => {
    const r = applyDocOps(empty(), [
      { op: 'setText', field: 'intro', value: 'Estimado {client.name}:\n\nGracias.' },
      { op: 'setText', field: 'leadTimeText', value: 'Fabricación\nen 15 días' },
      { op: 'setValidityDays', days: 30 },
      { op: 'setLocale', locale: 'pt' },
      { op: 'setItemNote', itemId: 'item-1', note: 'Vidrio laminado por seguridad.' },
      { op: 'setItemDisplay', patch: { showUnitPrices: false } },
    ])
    expect(r.ok).toBe(true)
    expect(r.result).toEqual({
      v: 2,
      texts: { intro: 'Estimado {client.name}:\n\nGracias.', leadTimeText: 'Fabricación en 15 días' },
      validityDays: 30,
      locale: 'pt',
      items: { 'item-1': { note: 'Vidrio laminado por seguridad.' } },
      itemDisplay: { showUnitPrices: false },
    })
    const cleared = applyDocOps(r.result, [
      { op: 'setText', field: 'intro', value: null },
      { op: 'setItemNote', itemId: 'item-1', note: null },
      { op: 'setLocale', locale: null },
    ])
    expect(cleared.result).toEqual({ v: 2, texts: { leadTimeText: 'Fabricación en 15 días' }, validityDays: 30, itemDisplay: { showUnitPrices: false } })
  })

  it('rechaza textos inseguros y marcadores ajenos', () => {
    expect(applyDocOp(empty(), { op: 'setText', field: 'conditions', value: 'Paga en https://evil.example' }).issues[0].code).toBe('unsafe_text')
    expect(applyDocOp(empty(), { op: 'setText', field: 'conditions', value: 'Hola {catalog.title}' }).issues[0].code).toBe('placeholder_not_allowed')
    expect(applyDocOp(empty(), { op: 'setItemNote', itemId: '__proto__', note: 'x' }).ok).toBe(false)
  })

  it('operaciones de sección requieren la plantilla base', () => {
    expect(applyDocOp(empty(), { op: 'toggleSection', sectionId: 'warranty', enabled: false }).issues[0].code).toBe('base_template_required')
  })

  it('ocultar, mover, ajustar opciones y títulos por id estable', () => {
    const r = applyDocOps(
      empty(),
      [
        { op: 'toggleSection', sectionId: 'warranty' },
        { op: 'moveSection', sectionId: 'terms', afterId: 'cover' },
        { op: 'updateSectionOptions', sectionId: 'items', options: { variant: 'table' } },
        { op: 'updateSection', sectionId: 'totals', patch: { title: 'Inversión' } },
        { op: 'setSectionText', sectionId: 'cover', slot: 'subtitle', value: 'Para {client.name}' },
      ],
      { template: base },
    )
    expect(r.ok).toBe(true)
    expect(r.result.sections?.warranty).toEqual({ type: 'warranty', enabled: false })
    expect(r.result.sections?.items).toEqual({ type: 'items', options: { variant: 'table', drawingSize: 's' } })
    const merged = mergeTemplateOverrides(base, r.result).template
    expect(ids(merged).slice(0, 2)).toEqual(['cover', 'terms'])
    expect(merged.sections.find((s) => s.id === 'warranty')!.enabled).toBe(false)
    expect(merged.sections.find((s) => s.id === 'totals')!.title).toBe('Inversión')
    expect(validateDocTemplate(merged).ok).toBe(true)
  })

  it('agregar texto libre sólo a esta cotización; quitar secciones del diseño las oculta', () => {
    const r = applyDocOps(empty(), [{ op: 'addSection', section: { type: 'custom_text', id: 'aviso' }, afterId: 'items' }, { op: 'setSectionText', sectionId: 'aviso', slot: 'content', value: 'Precios sujetos a medición en obra.' }], { template: base })
    expect(r.ok).toBe(true)
    expect(r.result.added?.[0]).toMatchObject({ id: 'aviso', type: 'custom_text' })
    const merged = mergeTemplateOverrides(base, r.result).template
    expect(ids(merged)[ids(merged).indexOf('items') + 1]).toBe('aviso')
    expect(applyDocOp(r.result, { op: 'addSection', section: { type: 'warranty' } }, { template: base }).issues[0].code).toBe('op_not_supported')
    const hidden = applyDocOp(r.result, { op: 'removeSection', sectionId: 'payment' }, { template: base })
    expect(hidden.result.sections?.payment).toEqual({ type: 'payment', enabled: false })
    expect(hidden.issues.map((i) => i.code)).toContain('removed_as_hidden')
    const gone = applyDocOp(r.result, { op: 'removeSection', sectionId: 'aviso' }, { template: base })
    expect(gone.result.added).toBeUndefined()
    expect(applyDocOp(r.result, { op: 'toggleSection', sectionId: 'totals', enabled: false }, { template: base }).issues[0].code).toBe('section_required')
  })

  it('tema y página por cotización con corrección de contraste', () => {
    const r = applyDocOps(empty(), [{ op: 'setColor', role: 'accent', value: '#FFE600' }, { op: 'setPage', patch: { size: 'A4' } }], { template: base })
    expect(r.ok).toBe(true)
    expect(r.result.theme?.palette?.accent).toBe('#FFE600')
    const merged = mergeTemplateOverrides(base, r.result).template
    expect(contrastRatio(merged.theme.palette.accent, merged.theme.palette.paper)).toBeGreaterThanOrEqual(3)
    expect(merged.page.size).toBe('A4')
  })

  it('reset por ámbito', () => {
    const full: QuoteDocOverridesV2 = { v: 2, templateId: 'memoria', locale: 'en', texts: { intro: 'x' }, validityDays: 10, theme: { density: 'airy' }, page: { size: 'A4' }, sections: { warranty: { type: 'warranty', enabled: false } }, order: ['terms'], items: { a1: { note: 'n' } }, itemDisplay: { showArea: true } }
    expect(applyDocOp(full, { op: 'reset', scope: 'theme' }).result.theme).toBeUndefined()
    expect(applyDocOp(full, { op: 'reset', scope: 'sections' }).result).not.toHaveProperty('order')
    expect(applyDocOp(full, { op: 'reset', scope: 'all' }).result).toEqual({ v: 2 })
    expect(applyDocOp(full, { op: 'resetSection', sectionId: 'warranty' }).result.sections).toBeUndefined()
  })
})

describe('parseDocOps y descripciones', () => {
  it('valida sin aplicar', () => {
    const r = parseDocOps([{ op: 'setTemplate', templateId: 'memoria' }, { op: 'nope' }])
    expect(r.ok).toBe(false)
    expect(r.ops).toHaveLength(1)
    expect(DOC_OP_NAMES).toContain('editRichText')
  })

  it('describe en español con llaves traducibles y en otros idiomas', () => {
    const t = getDocPreset('atelier')
    const ops: DocOp[] = [
      { op: 'toggleSection', sectionId: 'warranty', enabled: false },
      { op: 'setTemplate', templateId: 'hogar' },
      { op: 'setValidityDays', days: 1 },
      { op: 'updateSectionOptions', sectionId: 'items', options: { variant: 'cards' } },
      { op: 'setLocale', locale: 'de' },
      { op: 'reset', scope: 'theme' },
    ]
    expect(ops.map((op) => describeDocOp(op, { template: t }))).toEqual([
      'Ocultó la sección «Garantía»',
      'Cambió el diseño a «Hogar»',
      'Cambió la validez a 1 día',
      'Cambió «Ítems» a la variante «Tarjetas»',
      'Cambió el idioma del documento a alemán',
      'Restableció el tema',
    ])
    expect(describeDocOp(ops[1], { locale: 'en' })).toBe('Changed the design to “Home”')
    expect(describeDocOp(ops[0], { template: t, locale: 'tr' })).toBe('“Garanti” bölümünü gizledi')
    expect(describeDocOpKey(ops[0], { template: t })).toEqual({ group: 'ops', key: 'hideSection', params: { section: 'Garantía' } })
    expect(summarizeDocOps(ops)).toBe('6 cambios en el documento')
    expect(describeDocOp({ op: 'setItemNote', itemId: 'i1', note: 'x' }, { itemLabel: () => 'V-03' })).toBe('Agregó una nota al ítem V-03')
  })
})
