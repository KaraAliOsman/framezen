/**
 * Herramientas siempre disponibles: memoria (recordar, buscar, olvidar), ayuda (manual de la app y
 * oficio del PVC) y acciones de interfaz (navegar, abrir documentos/editores, seleccionar,
 * destacar, idioma y tema), que viajan al navegador como eventos `ui` y no cambian datos.
 */
import { docTemplatePromptSpec, knowledgeTopic, resolveKnowledgeTopic, searchKnowledge, type AgentToolArgs } from '@dekopen/shared'
import { HttpError } from '../../../lib/errors'
import { canManageOrg, createMemory, deleteMemory, looksSensitive, searchMemories } from '../memory'
import { loadQuoteFor, quoteNo, resolveQuoteId } from './common'
import { resolveItems } from '../resolve'
import { ToolFailure, type ToolContext, type ToolHandler } from './types'

/** Traduce los errores de la memoria (HttpError) a fallas de herramienta con código estable. */
async function memoryCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof HttpError) throw new ToolFailure(error.code, error.message)
    throw error
  }
}

const remember: ToolHandler<'remember'> = async (ctx, args) => {
  if (looksSensitive(args.content)) throw new ToolFailure('sensitive_content', 'Refused: memories never store passwords, keys or card numbers.')
  const scope = args.scope ?? 'assistant'
  if (ctx.dryRun) {
    // Vista previa (recuerdo de toda la empresa pedido por el modelo): no guarda nada.
    if (scope === 'org' && !canManageOrg(ctx.viewer)) throw new ToolFailure('forbidden', 'Only company managers can store company-wide memories.')
    const content = args.content.trim()
    const title = `${ctx.text.t('done.remember', { content: content.length > 90 ? `${content.slice(0, 90)}…` : content })} (${ctx.text.t(`memory.${scope}`)})`
    return { ok: true, summary: title, preview: { title, lines: [content.slice(0, 500)] } }
  }
  const { memory, created } = await memoryCall(() =>
    createMemory(
      ctx.deps,
      ctx.auth,
      ctx.viewer,
      { scope, kind: args.kind ?? (args.explicit === false ? 'fact' : 'preference'), content: args.content, assistantId: ctx.assistant.id },
      { source: args.explicit === false ? 'auto' : 'explicit', now: ctx.deps.now() },
    ),
  )
  return {
    ok: true,
    summary: ctx.text.t('done.remember', { content: memory.content.length > 90 ? `${memory.content.slice(0, 90)}…` : memory.content }),
    data: { id: memory.id, scope: memory.scope, audience: ctx.text.t(`memory.${memory.scope}`), created },
    affected: [{ type: 'memory', id: memory.id }],
    undo: created ? { method: 'DELETE', path: `memory:${memory.id}`, internal: { kind: 'memory_delete', id: memory.id }, entity: { type: 'memory', id: memory.id } } : null,
  }
}

const recall: ToolHandler<'recall'> = async (ctx, args) => {
  const items = await searchMemories(ctx.deps, ctx.auth, ctx.viewer, ctx.assistant.id, args.query)
  return {
    ok: true,
    summary: ctx.text.t('done.recall', { count: items.length }),
    data: { memories: items.map((m) => ({ id: m.id, scope: m.scope, kind: m.kind, content: m.content, pinned: m.pinned })) },
  }
}

const forget: ToolHandler<'forget'> = async (ctx, args) => {
  let id = args.memoryId
  if (!id) {
    if (!args.query) throw new ToolFailure('invalid', 'Give memoryId or a query.')
    const found = await searchMemories(ctx.deps, ctx.auth, ctx.viewer, ctx.assistant.id, args.query)
    const editable = found.filter((m) => m.canEdit)
    if (!editable.length) throw new ToolFailure('not_found', `No editable memory matches "${args.query}".`)
    if (editable.length > 1) return { ok: false, summary: ctx.text.t('done.recall', { count: editable.length }), error: { code: 'ambiguous', message: 'Several memories match; ask which one.' }, data: { candidates: editable.slice(0, 5).map((m) => ({ id: m.id, content: m.content })) } }
    id = editable[0]!.id
  }
  const memory = await memoryCall(() => deleteMemory(ctx.deps, ctx.auth, ctx.viewer, id!))
  return {
    ok: true,
    summary: ctx.text.t('done.forget', { content: memory.content.length > 90 ? `${memory.content.slice(0, 90)}…` : memory.content }),
    data: { id: memory.id },
    affected: [{ type: 'memory', id: memory.id }],
    undo: { method: 'POST', path: `memory:${memory.id}`, internal: { kind: 'memory_restore', id: memory.id }, entity: { type: 'memory', id: memory.id } },
  }
}

const help: ToolHandler<'help'> = async (ctx, args) => {
  const id = resolveKnowledgeTopic({ topic: args.topic, query: args.query })
  const topic = knowledgeTopic(id, ctx.text.locale)
  const related = args.query ? searchKnowledge(args.query, 3).filter((t) => t !== id) : []
  return {
    ok: true,
    summary: ctx.text.t('done.help', { title: topic.title }),
    data: {
      topic: id,
      title: topic.title,
      body: topic.body,
      ...(id === 'document_ops' ? { templateSpec: docTemplatePromptSpec() } : {}),
      ...(related.length ? { related } : {}),
      answerIn: ctx.text.locale,
    },
  }
}

// ── Interfaz ─────────────────────────────────────────────────────────────────

const navigate: ToolHandler<'navigate'> = async (ctx, args) => ({
  ok: true,
  summary: ctx.text.t('done.navigate', { target: ctx.text.t(`nav.${args.to}`) }),
  data: { to: args.to },
  ui: [{ kind: 'navigate', to: args.to, ...(args.id ? { id: args.id } : {}) }],
})

const openDocument: ToolHandler<'open_document'> = async (ctx, args) => {
  const quote = await loadQuoteFor(ctx, args)
  return {
    ok: true,
    summary: ctx.text.t('done.open_document', { number: quoteNo(ctx, quote) }),
    data: { quoteId: quote.id },
    ui: [{ kind: 'open_document_editor', quoteId: quote.id }],
  }
}

const openTemplateEditor: ToolHandler<'open_template_editor'> = async (ctx, args) => ({
  ok: true,
  summary: ctx.text.t('done.open_template_editor'),
  data: { templateId: args.templateId },
  ui: [{ kind: 'open_template_editor', templateId: args.templateId }],
})

async function itemOf(ctx: ToolContext, args: AgentToolArgs['select_item']) {
  const quote = await loadQuoteFor(ctx, args)
  const { items } = resolveItems(quote, { ref: args.ref })
  const item = items[0]
  if (!item) throw new ToolFailure('not_found', `Window ${args.ref} not found in this quote.`)
  return { quote, item }
}

const selectItem: ToolHandler<'select_item'> = async (ctx, args) => {
  const { quote, item } = await itemOf(ctx, args)
  ctx.memo.lastItemId = item.id
  return {
    ok: true,
    summary: ctx.text.t('done.select_item', { ref: item.ref }),
    data: { ref: item.ref },
    ui: [{ kind: 'select_item', quoteId: quote.id, itemId: item.id }],
  }
}

const highlight: ToolHandler<'highlight'> = async (ctx, args) => ({
  ok: true,
  summary: ctx.text.t('done.highlight'),
  ui: [{ kind: 'highlight', target: args.target, id: args.id, ...(args.fields?.length ? { fields: args.fields } : {}) }],
})

const openDialog: ToolHandler<'open_dialog'> = async (ctx, args) => {
  const quoteId = args.dialog === 'send_quote' ? await resolveQuoteId(ctx, {}, { optional: true }) : undefined
  return { ok: true, summary: ctx.text.t('done.open_dialog'), ui: [{ kind: 'open_dialog', dialog: args.dialog, ...(quoteId ? { id: quoteId } : {}) }] }
}

const setUiLocale: ToolHandler<'set_ui_locale'> = async (ctx, args) => ({
  ok: true,
  summary: ctx.text.t('done.set_ui_locale', { language: ctx.text.language(args.locale) }),
  data: { locale: args.locale },
  ui: [{ kind: 'set_locale', locale: args.locale }],
})

const setZoom: ToolHandler<'set_zoom'> = async (ctx, args) => ({
  ok: true,
  summary: ctx.text.t('done.set_zoom', { percent: args.percent }),
  data: { percent: args.percent },
  ui: [{ kind: 'set_zoom', percent: args.percent }],
})

const searchConversations: ToolHandler<'search_conversations'> = async (ctx, args) => {
  const found = await ctx.searchConversations(args.query)
  return { ok: true, summary: ctx.text.t('done.search_conversations', { count: found.length }), data: { conversations: found } }
}

const undoLast: ToolHandler<'undo_last'> = async (ctx) => {
  if (ctx.dryRun) return { ok: true, summary: ctx.text.t('propose.undo_last'), preview: { title: ctx.text.t('propose.undo_last'), lines: [] } }
  const undone = await ctx.undoLast()
  if (!undone) throw new ToolFailure('nothing_to_undo', 'There is nothing to undo in this conversation.')
  return { ok: true, summary: ctx.text.t('done.undo_last', { summary: undone.summary }), data: { undone: undone.summary }, affected: undone.affected }
}

const setTheme: ToolHandler<'set_theme'> = async (ctx, args) => ({
  ok: true,
  summary: ctx.text.t('done.set_theme'),
  data: { theme: args.theme },
  ui: [{ kind: 'set_theme', theme: args.theme }],
})

export const CORE_HANDLERS = {
  remember,
  recall,
  forget,
  help,
  navigate,
  open_document: openDocument,
  open_template_editor: openTemplateEditor,
  select_item: selectItem,
  highlight,
  open_dialog: openDialog,
  set_ui_locale: setUiLocale,
  set_theme: setTheme,
  set_zoom: setZoom,
  search_conversations: searchConversations,
  undo_last: undoLast,
} satisfies { [K in keyof AgentToolArgs]?: ToolHandler<K> }
