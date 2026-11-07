/**
 * Documentos y plantillas (rutas de TPL-EDITOR en /api/templates) y ajustes del documento de una
 * cotización (DocOps sobre `documentOverrides`, validados con `applyDocOps` y guardados por
 * PUT /api/quotes/:id). Nunca HTML: solo operaciones estructuradas del esquema compartido.
 */
import {
  DOC_PRESETS,
  DOC_PRESET_IDS,
  applyDocOps,
  isDocPresetId,
  migrateQuoteDocOverrides,
  parseDocOps,
  presetName,
  sectionLabel,
  summarizeDocOps,
  type AgentToolArgs,
  type DocTemplate,
  type DocTemplateGenerateResponse,
  type DocTemplateListResponse,
  type DocTemplateOpsResponse,
  type DocTemplateRecord,
} from '@dekopen/shared'
import { ensureOk, loadQuoteFor, quoteNo, quoteUndo, saveQuote } from './common'
import { quoteBaseTemplate } from './documents-base'
import { ToolFailure, type ToolContext, type ToolHandler } from './types'

/** Plantilla compacta para el modelo: tema, página y secciones con ids (lo necesario para editar). */
function templateForModel(t: DocTemplate) {
  return {
    id: t.id,
    kind: t.kind,
    name: t.name,
    presetId: t.presetId,
    theme: t.theme,
    page: t.page,
    sections: t.sections.map((s) => ({ id: s.id, type: s.type, enabled: s.enabled, title: s.title, variant: (s as { variant?: string }).variant, options: s.options })),
  }
}

function nameOf(ctx: ToolContext, id: string, record?: Pick<DocTemplateRecord, 'name'> | null): string {
  if (record?.name) return record.name
  return isDocPresetId(id) ? presetName(id, ctx.text.locale) : id
}

const listTemplates: ToolHandler<'list_templates'> = async (ctx, args) => {
  const presets = DOC_PRESET_IDS.filter((id) => !args.kind || DOC_PRESETS[id].kind === args.kind).map((id) => ({ id, kind: DOC_PRESETS[id].kind, name: presetName(id, ctx.text.locale), builtin: true }))
  const res = await ctx.call<DocTemplateListResponse>('templatesList', { query: { kind: args.kind } })
  const own = res.ok ? res.data!.templates : []
  return {
    ok: true,
    summary: ctx.text.t('done.list_templates'),
    data: {
      presets,
      own: own.map((t) => ({ id: t.id, kind: t.kind, name: t.name, presetId: t.presetId, isDefault: t.isDefault, version: t.version })),
      ...(res.ok ? { defaults: res.data!.defaults, canEdit: res.data!.canEdit, canGenerate: res.data!.canGenerate } : {}),
    },
  }
}

async function loadTemplate(ctx: ToolContext, id: string): Promise<DocTemplateRecord> {
  return ensureOk(await ctx.call<DocTemplateRecord>('templateGet', { params: { id } }))
}

const getTemplate: ToolHandler<'get_template'> = async (ctx, args) => {
  const record = await loadTemplate(ctx, args.templateId)
  return {
    ok: true,
    summary: ctx.text.t('done.get_template', { name: record.name }),
    data: { builtin: record.builtin, version: record.version, isDefault: record.isDefault, template: templateForModel(record.template) },
  }
}

const createTemplate: ToolHandler<'create_template'> = async (ctx, args) => {
  const fromName = nameOf(ctx, args.from)
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.create_template', { name: fromName })
    return { ok: true, summary: title, preview: { title, lines: args.name ? [`${ctx.text.t('field.name')}: ${args.name}`] : [] } }
  }
  const body = { kind: args.kind, ...(args.name ? { name: args.name } : {}), ...(isDocPresetId(args.from) ? { fromPresetId: args.from } : { fromTemplateId: args.from }) }
  const record = ensureOk(await ctx.call<DocTemplateRecord>('templateCreate', { body }))
  return {
    ok: true,
    summary: ctx.text.t('done.create_template', { name: record.name }),
    data: { id: record.id, name: record.name, kind: record.kind, version: record.version },
    affected: [{ type: 'template', id: record.id, version: record.version }],
    ui: [{ kind: 'open_template_editor', templateId: record.id }],
    undo: {
      method: 'DELETE',
      path: `/api/templates/${record.id}`,
      route: 'templateDelete',
      params: { id: record.id },
      expectedVersion: record.version,
      entity: { type: 'template', id: record.id, version: record.version },
      guard: { route: 'templateGet', params: { id: record.id }, field: 'version', value: record.version },
    },
  }
}

function checkOps(ops: unknown[]) {
  const parsed = parseDocOps(ops)
  if (!parsed.ok) throw new ToolFailure('invalid_ops', `Invalid DocOps: ${parsed.issues.slice(0, 6).map((i) => `${i.path.join('.') || 'op'}: ${i.message}`).join('; ')}. Call help(topic: "document_ops").`)
  return parsed.ops
}

const editTemplate: ToolHandler<'edit_template'> = async (ctx, args) => {
  const ops = checkOps(args.ops)
  const record = await loadTemplate(ctx, args.templateId)
  if (record.builtin) throw new ToolFailure('builtin_template', 'Built-in presets are not edited: create an own template from it first (create_template).')
  const described = summarizeDocOps(ops, { locale: ctx.text.locale, template: record.template })
  if (ctx.dryRun) {
    const dry = applyDocOps(record.template, ops)
    if (!dry.ok) throw new ToolFailure('invalid_ops', `DocOps rejected: ${dry.issues.slice(0, 6).map((i) => i.message).join('; ')}`)
    const title = ctx.text.t('propose.edit_template', { name: record.name })
    return { ok: true, summary: title, preview: { title, lines: described ? [described] : [ctx.text.t('change.ops', { count: ops.length })] }, affected: [{ type: 'template', id: record.id, version: record.version }] }
  }
  const res = ensureOk(await ctx.call<DocTemplateOpsResponse>('templateOps', { params: { id: record.id }, body: { ops, version: record.version } }))
  if (!res.changed) {
    return { ok: !res.issues.some((i) => i.severity === 'error'), summary: ctx.text.t('done.edit_template', { name: record.name, changes: ctx.text.t('change.nothing') }), data: { changed: false, issues: res.issues.map((i) => i.message) } }
  }
  const after = res.template
  return {
    ok: true,
    summary: ctx.text.t('done.edit_template', { name: after.name, changes: res.summary || described || ctx.text.t('change.ops', { count: res.applied.length }) }),
    data: { id: after.id, version: after.version, applied: res.applied.length, issues: res.issues.filter((i) => i.severity !== 'info').map((i) => i.message) },
    affected: [{ type: 'template', id: after.id, version: after.version }],
    undo: {
      method: 'PUT',
      path: `/api/templates/${after.id}`,
      route: 'templateSave',
      params: { id: after.id },
      body: { template: record.template, version: after.version },
      expectedVersion: after.version,
      entity: { type: 'template', id: after.id, version: after.version },
    },
  }
}

const generateTemplate: ToolHandler<'generate_template'> = async (ctx, args) => {
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.generate_template')
    return {
      ok: true,
      summary: title,
      preview: { title, lines: [`${ctx.text.t('field.prompt')}: ${args.prompt}`, ...(args.base ? [`${ctx.text.t('field.base')}: ${nameOf(ctx, args.base)}`] : [])], irreversible: ctx.text.t('irreversible.credits') },
    }
  }
  const generated = ensureOk(
    await ctx.call<DocTemplateGenerateResponse>('templateGenerate', {
      body: { kind: args.kind, prompt: args.prompt, ...(args.base ? { baseTemplateId: args.base } : {}), locale: ctx.text.locale },
    }),
  )
  if (!generated.ok) throw new ToolFailure(generated.reason, `The template design failed (${generated.reason}); ask the user to rephrase or simplify.`)
  const template = { ...generated.template, ...(args.name ? { name: args.name } : {}) }
  const record = ensureOk(await ctx.call<DocTemplateRecord>('templateCreate', { body: { kind: args.kind, template, ...(args.name ? { name: args.name } : {}) } }))
  return {
    ok: true,
    summary: ctx.text.t('done.generate_template', { name: record.name }),
    data: { id: record.id, name: record.name, kind: record.kind, creditsSpent: generated.credits, issues: generated.issues.filter((i) => i.severity !== 'info').map((i) => i.message) },
    affected: [{ type: 'template', id: record.id, version: record.version }],
    ui: [{ kind: 'open_template_editor', templateId: record.id }],
    undo: {
      method: 'DELETE',
      path: `/api/templates/${record.id}`,
      route: 'templateDelete',
      params: { id: record.id },
      entity: { type: 'template', id: record.id, version: record.version },
      guard: { route: 'templateGet', params: { id: record.id }, field: 'version', value: record.version },
    },
  }
}

const setDefaultTemplate: ToolHandler<'set_default_template'> = async (ctx, args) => {
  const list = ensureOk(await ctx.call<DocTemplateListResponse>('templatesList', { query: { kind: args.kind } }))
  const previous = list.defaults[args.kind]
  const own = list.templates.find((t) => t.id === args.templateId)
  const name = nameOf(ctx, args.templateId, own)
  if (previous === args.templateId) return { ok: true, summary: ctx.text.t('done.set_default_template', { name }), data: { changed: false } }
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.set_default_template', { name })
    return { ok: true, summary: title, preview: { title, lines: [], changes: [{ field: 'template', label: ctx.text.t('field.template'), before: previous ? nameOf(ctx, previous, list.templates.find((t) => t.id === previous)) : '—', after: name }] } }
  }
  const saved = ensureOk(await ctx.call<{ defaults?: Record<string, string> }>('templateDefault', { body: { kind: args.kind, templateId: args.templateId } }))
  return {
    ok: true,
    summary: ctx.text.t('done.set_default_template', { name }),
    data: { kind: args.kind, templateId: args.templateId, previous },
    affected: [{ type: 'settings' }],
    undo: previous
      ? {
          method: 'PUT',
          path: '/api/templates/default',
          route: 'templateDefault',
          body: { kind: args.kind, templateId: previous },
          entity: { type: 'settings' },
          // Si alguien eligió otra predeterminada después, deshacer no la revierte.
          expect: { route: 'templatesList', query: { kind: args.kind }, checks: [{ path: ['defaults', args.kind], value: saved?.defaults?.[args.kind] ?? args.templateId }] },
        }
      : null,
  }
}

const editQuoteDocument: ToolHandler<'edit_quote_document'> = async (ctx, args) => {
  const ops = checkOps(args.ops)
  const quote = await loadQuoteFor(ctx, args)
  const base = await quoteBaseTemplate(ctx, quote)
  const current = migrateQuoteDocOverrides(quote.documentOverrides ?? null).overrides
  const applied = applyDocOps(current, ops, { template: base })
  if (!applied.ok) throw new ToolFailure('invalid_ops', `DocOps rejected: ${applied.issues.slice(0, 6).map((i) => `${i.path.join('.') || 'op'}: ${i.message}`).join('; ')}`)
  const described = summarizeDocOps(ops, { locale: ctx.text.locale, template: base }) || ctx.text.t('change.ops', { count: ops.length })
  if (!applied.changed) return { ok: true, summary: ctx.text.t('done.edit_quote_document', { number: quoteNo(ctx, quote), changes: ctx.text.t('change.nothing') }), data: { changed: false } }
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.edit_quote_document', { number: quoteNo(ctx, quote) })
    return { ok: true, summary: title, preview: { title, lines: [described] }, affected: [{ type: 'quote', id: quote.id, version: quote.version }] }
  }
  const { before, after } = await saveQuote(ctx, quote, { documentOverrides: applied.result }, (fresh) => {
    const again = applyDocOps(migrateQuoteDocOverrides(fresh.documentOverrides ?? null).overrides, ops, { template: base })
    return again.ok ? { documentOverrides: again.result } : null
  })
  return {
    ok: true,
    summary: ctx.text.t('done.edit_quote_document', { number: quoteNo(ctx, after), changes: described }),
    data: { number: after.number, applied: applied.applied.length, sections: base.sections.map((s) => ({ id: s.id, type: sectionLabel(s.type, 'en') })) },
    affected: [{ type: 'quote', id: after.id, version: after.version }],
    ui: [{ kind: 'open_document_editor', quoteId: after.id }],
    undo: quoteUndo(before, after),
  }
}

export const DOCUMENT_HANDLERS = {
  list_templates: listTemplates,
  get_template: getTemplate,
  create_template: createTemplate,
  edit_template: editTemplate,
  generate_template: generateTemplate,
  set_default_template: setDefaultTemplate,
  edit_quote_document: editQuoteDocument,
} satisfies { [K in keyof AgentToolArgs]?: ToolHandler<K> }
