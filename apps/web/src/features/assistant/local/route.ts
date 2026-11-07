/**
 * A dónde va cada herramienta de un plan local. El motor de comandos produce ~40 herramientas;
 * cada una se resuelve en un solo lugar:
 *
 * - `editor`: las del editor de cotizaciones (v4) sobre la cotización abierta, con deshacer;
 * - `ui`: navegar, abrir diálogos, seleccionar, idioma, tema, PDF… (instrucciones de interfaz);
 * - `panel`: cambiar de asistente o de modo y empezar otra conversación;
 * - `margin`: margen de la cotización (ajustes de precio propios de esa cotización);
 * - `server`: lo demás (estado, duplicar, eliminar, cliente nuevo, ajustes…) como turno local en el
 *   servidor (cero créditos, queda en el historial y en la bitácora con el asistente como autor).
 */
import type { LocalToolCall, UiAction, UiNavTarget } from '@dekopen/shared'
import { type AssistantMode, isAssistantTool } from '@dekopen/shared'
import type { QuoteEditorBridge } from '../bridge'
import { navPath, runUiAction, type UiEffectsEnv } from '../v2/effects'

export type LocalRoute = 'undo' | 'redo' | 'remember' | 'help' | 'editor' | 'ui' | 'panel' | 'margin' | 'server'

/** Herramientas del editor que, si apuntan a OTRA cotización, se piden al servidor. */
const EDITOR_TOOLS = new Set(['add_window', 'update_window', 'duplicate_window', 'remove_window', 'set_discount', 'set_title', 'set_client', 'explain_price', 'send_quote'])
/** Siempre las resuelve el editor / el navegador, aunque traigan un destino. */
const EDITOR_ALWAYS = new Set(['create_quote', 'open_quote', 'show_document', 'search'])
const UI_TOOLS = new Set(['navigate', 'open_client', 'select_item', 'open_dialog', 'open_template_editor', 'set_ui_locale', 'set_theme', 'download_pdf'])
const PANEL_TOOLS = new Set(['switch_assistant', 'set_assistant_mode', 'new_conversation'])

export interface OpenQuoteRef {
  id: string
  number: number
}

/** ¿La llamada apunta a una cotización distinta de la abierta en el editor? */
export function targetsOtherQuote(args: Record<string, unknown>, open: OpenQuoteRef | null): boolean {
  const id = typeof args.quoteId === 'string' && args.quoteId ? args.quoteId : undefined
  const number = typeof args.number === 'number' ? args.number : typeof args.quoteNumber === 'number' ? args.quoteNumber : undefined
  if (!id && number === undefined) return false
  if (!open) return true
  return (id !== undefined && id !== open.id) || (number !== undefined && number !== open.number)
}

export function routeOf(call: LocalToolCall, open: OpenQuoteRef | null): LocalRoute {
  const { tool } = call
  if (tool === 'undo') return 'undo'
  if (tool === 'redo') return 'redo'
  if (tool === 'remember') return 'remember'
  if (tool === 'help') return 'help'
  if (UI_TOOLS.has(tool)) return 'ui'
  if (PANEL_TOOLS.has(tool)) return 'panel'
  if (tool === 'set_margin') return 'margin'
  if (EDITOR_ALWAYS.has(tool)) return 'editor'
  if (EDITOR_TOOLS.has(tool) && isAssistantTool(tool)) return targetsOtherQuote(call.args ?? {}, open) ? 'server' : 'editor'
  return 'server'
}

// ── Interfaz y panel ─────────────────────────────────────────────────────────

export interface LocalToolEnv extends UiEffectsEnv {
  panel: {
    switchAssistant(assistantId: string): void
    setMode(mode: AssistantMode): void
    newConversation(): void
  }
  /** Descarga el PDF de una cotización (true si salió). */
  downloadQuotePdf(quoteId: string, number: number): Promise<boolean>
  /** Abre el PDF para imprimir. */
  printQuotePdf(quoteId: string): void
  /** Margen propio de la cotización (guarda y, si está abierta, la recarga como un paso de deshacer). */
  setQuoteMargin(target: { quoteId?: string; number?: number }, margin: { percent: number; mode: 'margin' | 'markup' }): Promise<{ ok: boolean; message?: string }>
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/** Ruta de una sección de ajustes o del catálogo. */
function sectionPath(to: string, section: string | undefined): string | undefined {
  if (!section) return undefined
  if (section === 'colores') return '/catalogo?tab=colores'
  if (to === 'settings' || to === 'company' || to === 'assistants' || to === 'pricing' || to === 'plan' || to === 'team') return `/ajustes/${encodeURIComponent(section)}`
  return undefined
}

export interface UiCallResult {
  ok: boolean
  /** Clave de lugar al que se fue (para la frase), si hubo navegación. */
  place?: string
  /** Mensaje de lo que no se pudo. */
  problem?: 'no_quote' | 'no_item' | 'pdf_failed'
}

/** Ejecuta una instrucción de interfaz del motor de comandos. Nunca lanza. */
export async function runUiCall(call: LocalToolCall, env: LocalToolEnv): Promise<UiCallResult> {
  const a = call.args ?? {}
  const act = (action: UiAction) => runUiAction(action, env)
  switch (call.tool) {
    case 'navigate': {
      const to = (str(a.to) ?? 'home') as UiNavTarget
      const path = sectionPath(to, str(a.section))
      if (path) env.navigate(path)
      else await act({ kind: 'navigate', to, ...(str(a.id) ? { id: str(a.id) } : {}) })
      return { ok: true, place: str(a.section) ? `${to}:${str(a.section)}` : to }
    }
    case 'open_client': {
      const id = str(a.clientId)
      if (!id) return { ok: false }
      env.navigate(navPath('client', id))
      return { ok: true, place: 'client' }
    }
    case 'select_item': {
      const bridge = env.getEditor()
      if (!bridge) return { ok: false, problem: 'no_quote' }
      const ref = str(a.ref)?.toUpperCase()
      const item = bridge.getQuote().items.find((i) => i.ref.toUpperCase() === ref)
      if (!item) return { ok: false, problem: 'no_item' }
      bridge.selectItem(item.id)
      return { ok: true }
    }
    case 'open_dialog': {
      const dialog = str(a.dialog)
      if (!dialog) return { ok: false }
      await act({ kind: 'open_dialog', dialog: dialog as Extract<UiAction, { kind: 'open_dialog' }>['dialog'] })
      return { ok: true }
    }
    case 'open_template_editor': {
      const templateId = str(a.templateId)
      if (!templateId) return { ok: false }
      await act({ kind: 'open_template_editor', templateId })
      return { ok: true }
    }
    case 'set_ui_locale': {
      const locale = str(a.locale)
      if (!locale) return { ok: false }
      await act({ kind: 'set_locale', locale: locale as Extract<UiAction, { kind: 'set_locale' }>['locale'] })
      return { ok: true }
    }
    case 'set_theme': {
      const theme = str(a.theme)
      if (!theme) return { ok: false }
      await act({ kind: 'set_theme', theme: theme as Extract<UiAction, { kind: 'set_theme' }>['theme'] })
      return { ok: true }
    }
    case 'download_pdf': {
      const bridge: QuoteEditorBridge | null = env.getEditor()
      const quoteId = str(a.quoteId) ?? bridge?.quoteId
      const number = typeof a.number === 'number' ? a.number : bridge && bridge.quoteId === quoteId ? bridge.getQuote().number : 0
      if (!quoteId) return { ok: false, problem: 'no_quote' }
      if (a.print === true) {
        env.printQuotePdf(quoteId)
        return { ok: true }
      }
      const ok = await env.downloadQuotePdf(quoteId, number)
      return ok ? { ok: true } : { ok: false, problem: 'pdf_failed' }
    }
    default:
      return { ok: false }
  }
}

/** Cambios del propio panel. Devuelve false si falta el dato. */
export function runPanelCall(call: LocalToolCall, env: LocalToolEnv): boolean {
  const a = call.args ?? {}
  switch (call.tool) {
    case 'switch_assistant': {
      const id = str(a.assistantId)
      if (!id) return false
      env.panel.switchAssistant(id)
      return true
    }
    case 'set_assistant_mode': {
      const mode = str(a.mode)
      if (mode !== 'chat' && mode !== 'supervised' && mode !== 'full') return false
      env.panel.setMode(mode)
      return true
    }
    case 'new_conversation':
      env.panel.newConversation()
      return true
    default:
      return false
  }
}
