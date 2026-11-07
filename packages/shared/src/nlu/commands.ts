/**
 * Registro de comandos locales y contrato de herramientas que produce el intérprete.
 *
 * Los nombres de herramientas conservan los de v4 donde existen (`add_window`, `update_window`,
 * `set_discount`…), así el ejecutor actual del navegador los entiende sin cambios; los nuevos siguen
 * el mismo estilo `verbo_objeto`. AGENT registra estas mismas herramientas en el servidor (o las
 * mapea): ver «Contrato para AGENT/BOT-UI» en el informe de NLU.
 *
 * Reglas de los argumentos:
 * - Medidas siempre en mm (enteros o con un decimal); porcentajes 0–100.
 * - Catálogo: `colorId`/`lineId`/`glassId` cuando el intérprete lo resolvió contra el catálogo, y
 *   siempre el nombre (`color`, `line`, `glass`: el nombre del catálogo, o el término en español si no
 *   había catálogo), para que el ejecutor v4 siga funcionando.
 * - Entidades: `quoteId`/`clientId`/`templateId`/`assistantId` cuando se resolvieron; si no, el texto.
 */
import type { AssemblyPresetId, InsectScreenType, OpeningKind, RollerShutterOperation, RollerShutterType, TypologyId } from '@dekopen/engine'
import type { QuoteStatus } from '../api'
import type { AssistantMode, MemoryScope, ToolRisk, ToolScope, UiDialog, UiNavTarget } from '../assistant-v2'
import type { Locale } from '../i18n/locales'

// ── Herramientas ─────────────────────────────────────────────────────────────

export const NLU_TOOL_NAMES = [
  // Cotización abierta (editor) — mismos nombres que v4
  'create_quote',
  'open_quote',
  'add_window',
  'add_assembly',
  'join_windows',
  'update_window',
  'duplicate_window',
  'remove_window',
  'set_discount',
  'set_title',
  'set_client',
  'explain_price',
  'show_document',
  'send_quote',
  'navigate',
  'search',
  // Nuevas (v5)
  'set_margin',
  'set_quote_notes',
  'set_quote_template',
  'set_quote_locale',
  'set_quote_status',
  'duplicate_quote',
  'delete_quote',
  'share_quote_link',
  'download_pdf',
  'create_work_order',
  'create_client',
  'open_client',
  'select_item',
  'open_dialog',
  'open_template_editor',
  'set_ui_locale',
  'set_theme',
  'switch_assistant',
  'set_assistant_mode',
  'new_conversation',
  'update_settings',
  'remember',
  'forget',
  'recall',
  'undo',
  'redo',
] as const

export type NluToolName = (typeof NLU_TOOL_NAMES)[number]

/** Dónde se ejecuta: editor abierto (puente), servidor (REST), interfaz o el propio panel. */
export type NluExecutor = 'editor' | 'server' | 'ui' | 'local'

export interface NluToolMeta {
  risk: ToolRisk
  /** Ámbito de negocio (los asistentes los habilitan); 'ui' y 'memory' están en todos los modos. */
  scope: ToolScope | 'ui' | 'memory'
  executor: NluExecutor
  /** Se puede deshacer (editor: historial; servidor: tool-run undo). */
  undoable: boolean
}

export const NLU_TOOLS: Readonly<Record<NluToolName, NluToolMeta>> = {
  create_quote: { risk: 'write', scope: 'quotes', executor: 'server', undoable: true },
  open_quote: { risk: 'read', scope: 'ui', executor: 'ui', undoable: false },
  add_window: { risk: 'write', scope: 'quotes', executor: 'editor', undoable: true },
  add_assembly: { risk: 'write', scope: 'quotes', executor: 'server', undoable: true },
  join_windows: { risk: 'write', scope: 'quotes', executor: 'server', undoable: true },
  update_window: { risk: 'write', scope: 'quotes', executor: 'editor', undoable: true },
  duplicate_window: { risk: 'write', scope: 'quotes', executor: 'editor', undoable: true },
  remove_window: { risk: 'write', scope: 'quotes', executor: 'editor', undoable: true },
  set_discount: { risk: 'write', scope: 'quotes', executor: 'editor', undoable: true },
  set_title: { risk: 'write', scope: 'quotes', executor: 'editor', undoable: true },
  set_client: { risk: 'write', scope: 'quotes', executor: 'editor', undoable: true },
  explain_price: { risk: 'read', scope: 'quotes', executor: 'editor', undoable: false },
  show_document: { risk: 'read', scope: 'ui', executor: 'ui', undoable: false },
  send_quote: { risk: 'external', scope: 'quotes', executor: 'server', undoable: false },
  navigate: { risk: 'read', scope: 'ui', executor: 'ui', undoable: false },
  search: { risk: 'read', scope: 'quotes', executor: 'server', undoable: false },
  set_margin: { risk: 'write', scope: 'quotes', executor: 'editor', undoable: true },
  set_quote_notes: { risk: 'write', scope: 'quotes', executor: 'editor', undoable: true },
  set_quote_template: { risk: 'write', scope: 'documents', executor: 'editor', undoable: true },
  set_quote_locale: { risk: 'write', scope: 'documents', executor: 'editor', undoable: true },
  set_quote_status: { risk: 'write', scope: 'quotes', executor: 'server', undoable: true },
  duplicate_quote: { risk: 'write', scope: 'quotes', executor: 'server', undoable: true },
  delete_quote: { risk: 'destructive', scope: 'quotes', executor: 'server', undoable: true },
  share_quote_link: { risk: 'external', scope: 'quotes', executor: 'server', undoable: false },
  download_pdf: { risk: 'read', scope: 'documents', executor: 'ui', undoable: false },
  create_work_order: { risk: 'production', scope: 'workshop', executor: 'server', undoable: false },
  create_client: { risk: 'write', scope: 'clients', executor: 'server', undoable: true },
  open_client: { risk: 'read', scope: 'ui', executor: 'ui', undoable: false },
  select_item: { risk: 'read', scope: 'ui', executor: 'ui', undoable: false },
  open_dialog: { risk: 'read', scope: 'ui', executor: 'ui', undoable: false },
  open_template_editor: { risk: 'read', scope: 'ui', executor: 'ui', undoable: false },
  set_ui_locale: { risk: 'read', scope: 'ui', executor: 'ui', undoable: true },
  set_theme: { risk: 'read', scope: 'ui', executor: 'ui', undoable: true },
  switch_assistant: { risk: 'read', scope: 'ui', executor: 'ui', undoable: false },
  set_assistant_mode: { risk: 'read', scope: 'ui', executor: 'ui', undoable: true },
  new_conversation: { risk: 'read', scope: 'ui', executor: 'ui', undoable: false },
  update_settings: { risk: 'write', scope: 'settings', executor: 'server', undoable: true },
  remember: { risk: 'write', scope: 'memory', executor: 'server', undoable: true },
  forget: { risk: 'write', scope: 'memory', executor: 'server', undoable: true },
  recall: { risk: 'read', scope: 'memory', executor: 'server', undoable: false },
  undo: { risk: 'read', scope: 'ui', executor: 'local', undoable: false },
  redo: { risk: 'read', scope: 'ui', executor: 'local', undoable: false },
}

// ── Argumentos ───────────────────────────────────────────────────────────────

/** Ítems a los que aplica: «V2» (ref), varios (items) o todos. Sin nada = el seleccionado. */
export interface NluItemTarget {
  ref?: string
  items?: string[]
  all?: boolean
}

/** Referencia a una cotización que no es la abierta. */
export interface NluQuoteTarget {
  quoteId?: string
  /** N° visible de la cotización. */
  number?: number
}

/** Persiana, mosquitero, alféizar, umbral (`null` = quitar). Forma de `WindowExtras` del motor. */
export interface NluExtras {
  rollerShutter?: { type?: RollerShutterType; operation?: RollerShutterOperation } | null
  insectScreen?: { type?: InsectScreenType } | null
  sill?: boolean
  threshold?: boolean
}

export interface NluDesignArgs {
  width?: number
  height?: number
  lineId?: string
  line?: string
  colorId?: string
  color?: string
  colorInId?: string
  color_in?: string
  glassId?: string
  glass?: string
  location?: string
  hinge?: 'left' | 'right'
  direction?: 'in' | 'out'
  sequence?: 'turn_first' | 'tilt_first'
  extras?: NluExtras
}

export interface NluToolArgs {
  create_quote: { title?: string; client?: string; clientId?: string }
  open_quote: NluQuoteTarget & { query?: string }
  add_window: NluDesignArgs & { typology?: TypologyId; qty?: number }
  add_assembly: NluDesignArgs & { preset: AssemblyPresetId; panes?: number; qty?: number }
  join_windows: { items: string[]; side?: 'left' | 'right' | 'top' | 'bottom' }
  update_window: NluItemTarget & NluDesignArgs & { typology?: TypologyId; qty?: number; pane?: number; opening?: OpeningKind }
  duplicate_window: { ref?: string; copies?: number }
  remove_window: NluItemTarget
  set_discount: NluQuoteTarget & { percent: number }
  set_title: NluQuoteTarget & { title: string }
  set_client: NluQuoteTarget & { clientId?: string; name?: string; email?: string; phone?: string; rut?: string; clear?: boolean }
  explain_price: NluQuoteTarget & { ref?: string }
  show_document: { view: 'document' | 'design' }
  send_quote: NluQuoteTarget & { channel?: 'email' | 'whatsapp' | 'link'; to?: string }
  navigate: { to: UiNavTarget; id?: string; section?: NluSettingsSection | NluCatalogSection }
  search: { query: string; kind: 'quotes' | 'clients' | 'all' }
  set_margin: NluQuoteTarget & { percent: number; mode: 'margin' | 'markup' }
  set_quote_notes: NluQuoteTarget & { text: string }
  set_quote_template: NluQuoteTarget & { templateId?: string; template?: string }
  set_quote_locale: NluQuoteTarget & { locale: Locale }
  set_quote_status: NluQuoteTarget & { status: QuoteStatus }
  duplicate_quote: NluQuoteTarget
  delete_quote: NluQuoteTarget
  share_quote_link: NluQuoteTarget
  download_pdf: NluQuoteTarget & { print?: boolean }
  create_work_order: NluQuoteTarget
  create_client: { name: string; email?: string; phone?: string; rut?: string }
  open_client: { clientId: string }
  select_item: { ref: string }
  open_dialog: { dialog: UiDialog }
  open_template_editor: { templateId: string }
  set_ui_locale: { locale: Locale }
  set_theme: { theme: 'light' | 'dark' | 'system' }
  switch_assistant: { assistantId: string }
  set_assistant_mode: { mode: AssistantMode }
  new_conversation: Record<string, never>
  /** Mismos nombres que `update_settings` del agente (`document_locale`); `currency` es nuevo. */
  update_settings: { document_locale?: Locale; currency?: string }
  /** `content` ≤ 1000 caracteres (mismo límite que la herramienta del agente). */
  remember: { content: string; scope?: MemoryScope }
  forget: { query: string }
  recall: { query?: string }
  undo: Record<string, never>
  redo: Record<string, never>
}

/** Secciones de ajustes (slugs en español, contrato con UI-SETTINGS). */
export const NLU_SETTINGS_SECTIONS = ['empresa', 'precios', 'taller', 'equipo', 'plan', 'idioma', 'asistentes', 'ia', 'plantillas', 'texturas'] as const
export type NluSettingsSection = (typeof NLU_SETTINGS_SECTIONS)[number]
/** Pestañas del catálogo que tienen destino propio. */
export type NluCatalogSection = 'colores'

/** Llamada producida por el intérprete (forma de `LocalToolCall` de assistant-v2). */
export interface NluToolCall<N extends NluToolName = NluToolName> {
  id: string
  tool: N
  args: NluToolArgs[N]
}

// ── Comandos ─────────────────────────────────────────────────────────────────

export const NLU_COMMAND_IDS = [
  'quote.create',
  'quote.open',
  'quote.rename',
  'quote.duplicate',
  'quote.delete',
  'quote.assign_client',
  'quote.clear_client',
  'quote.discount',
  'quote.margin',
  'quote.notes',
  'quote.template',
  'quote.locale',
  'quote.status',
  'quote.send',
  'quote.share',
  'quote.pdf',
  'quote.print',
  'quote.preview',
  'quote.design',
  'quote.explain_price',
  'quote.to_workshop',
  'quote.search',
  'item.add',
  'item.update',
  'item.bulk',
  'item.duplicate',
  'item.join',
  'item.remove',
  'item.select',
  'client.create',
  'client.search',
  'client.open',
  'nav.go',
  'dialog.open',
  'template.open',
  'catalog.lookup',
  'stats.sales',
  'stats.count',
  'stats.conversion',
  'stats.pending',
  'stats.top',
  'stats.average',
  'settings.ui_locale',
  'settings.theme',
  'settings.doc_locale',
  'settings.currency',
  'assistant.switch',
  'assistant.mode',
  'assistant.new_conversation',
  'memory.remember',
  'memory.forget',
  'memory.recall',
  'history.undo',
  'history.redo',
  'help',
  'greeting',
  'thanks',
] as const

export type NluCommandId = (typeof NLU_COMMAND_IDS)[number]

/**
 * Comandos que trabajan sobre la cotización abierta en el editor. Sin cotización abierta: agregar
 * con verbo explícito crea una cotización nueva primero (`create_quote` + `add_window`, visible en
 * los supuestos); el resto queda incompleto pidiendo la cotización.
 */
export const NLU_NEEDS_OPEN_QUOTE: ReadonlySet<NluCommandId> = new Set<NluCommandId>([
  'item.add',
  'item.update',
  'item.bulk',
  'item.duplicate',
  'item.join',
  'item.remove',
  'item.select',
  'quote.explain_price',
  'quote.preview',
  'quote.design',
])

/** Riesgo efectivo de un plan: el mayor de sus llamadas. */
export function planRisk(calls: readonly { tool: string }[]): ToolRisk {
  const order: ToolRisk[] = ['read', 'write', 'external', 'production', 'destructive']
  let max = 0
  for (const c of calls) {
    const meta = NLU_TOOLS[c.tool as NluToolName]
    if (meta) max = Math.max(max, order.indexOf(meta.risk))
  }
  return order[max]
}

export function isNluTool(name: string): name is NluToolName {
  return (NLU_TOOL_NAMES as readonly string[]).includes(name)
}
