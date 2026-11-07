/**
 * Estado del editor de plantillas (puro, sin React): plantilla vigente, historial de deshacer con una
 * entrada por operación (`DocOp`), sección elegida y operaciones aún no confirmadas por el servidor
 * (para rehacerlas sobre la versión de otra persona si hay conflicto).
 *
 * Toda edición pasa por `applyDocOps` de @dekopen/shared: la misma función que valida el servidor,
 * los comandos locales y la IA. Si una operación no es válida, la plantilla no cambia y quedan los
 * problemas en `issues` para mostrarlos junto al control.
 */
import { applyDocOps, cloneDocJson, docJsonEqual, type DocIssue, type DocOp, type DocTemplate } from '@dekopen/shared'

/** Qué produjo un paso del historial (para la etiqueta «Deshacer: …»). */
export type EditorCause =
  | { kind: 'op'; op: DocOp }
  | { kind: 'replace'; reason: 'ai' | 'reset' | 'restore' }
  /** Texto de la empresa escrito en la hoja: vive en sus ajustes, no en la plantilla. */
  | { kind: 'text'; field: string; before: string; after: string }

export interface EditorEntry {
  /** Plantilla ANTES del cambio. */
  template: DocTemplate
  cause: EditorCause
  mergeKey?: string
  at: number
}

export interface EditorState {
  template: DocTemplate
  past: EditorEntry[]
  future: EditorEntry[]
  selectedId: string | null
  /** Problemas de la última operación rechazada (o avisos de la última aplicada). */
  issues: DocIssue[]
  /**
   * Operaciones desde el último guardado iniciado. `null` = el cambio no se puede expresar como
   * operaciones (deshacer, reemplazo): ante un conflicto se guarda la versión propia.
   */
  pendingOps: DocOp[] | null
  /** Hubo una fusión con cambios de otra persona (aviso en la cabecera). */
  rebased: boolean
}

export type EditorAction =
  | { type: 'load'; template: DocTemplate }
  | { type: 'apply'; ops: DocOp[]; mergeKey?: string; at: number }
  | { type: 'replace'; template: DocTemplate; reason: 'ai' | 'reset' | 'restore'; at: number }
  | { type: 'text'; field: string; before: string; after: string; at: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'select'; id: string | null }
  | { type: 'saveStarted' }
  /** Conflicto: rehace `ops` sobre la versión del servidor (sin historial previo, que ya no aplica). */
  | { type: 'rebase'; server: DocTemplate; ops: DocOp[] }
  | { type: 'dismissRebased' }
  | { type: 'clearIssues' }

export const HISTORY_LIMIT = 120
export const MERGE_WINDOW_MS = 900

export function createEditorState(template: DocTemplate): EditorState {
  return { template, past: [], future: [], selectedId: null, issues: [], pendingOps: [], rebased: false }
}

function keepSelection(template: DocTemplate, id: string | null): string | null {
  return id && template.sections.some((s) => s.id === id) ? id : null
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'load':
      return { ...createEditorState(action.template), selectedId: keepSelection(action.template, state.selectedId) }
    case 'apply': {
      if (!action.ops.length) return state
      const result = applyDocOps(state.template, action.ops, { mode: 'atomic' })
      if (!result.ok) return { ...state, issues: result.issues }
      if (!result.changed) return state.issues.length ? { ...state, issues: [] } : state
      const last: EditorEntry | undefined = state.past[state.past.length - 1]
      const cause: EditorCause = { kind: 'op', op: action.ops[action.ops.length - 1] }
      const merge = last !== undefined && action.mergeKey !== undefined && last.mergeKey === action.mergeKey && action.at - last.at <= MERGE_WINDOW_MS && state.future.length === 0
      const entry: EditorEntry = merge ? { ...last, cause, at: action.at } : { template: state.template, cause, mergeKey: action.mergeKey, at: action.at }
      const past: EditorEntry[] = merge ? [...state.past.slice(0, -1), entry] : [...state.past, entry].slice(-HISTORY_LIMIT)
      // Una sección recién agregada o duplicada queda elegida.
      const added = result.result.sections.find((s) => !state.template.sections.some((o) => o.id === s.id))
      return {
        ...state,
        template: result.result,
        past,
        future: [],
        issues: result.issues.filter((i) => i.severity !== 'info'),
        pendingOps: state.pendingOps ? [...state.pendingOps, ...action.ops] : null,
        selectedId: added ? added.id : keepSelection(result.result, state.selectedId),
      }
    }
    case 'replace': {
      if (docJsonEqual(action.template, state.template)) return state
      return {
        ...state,
        template: action.template,
        past: [...state.past, { template: state.template, cause: { kind: 'replace' as const, reason: action.reason }, at: action.at }].slice(-HISTORY_LIMIT),
        future: [],
        issues: [],
        pendingOps: null,
        selectedId: keepSelection(action.template, state.selectedId),
      }
    }
    case 'text':
      return {
        ...state,
        past: [...state.past, { template: state.template, cause: { kind: 'text' as const, field: action.field, before: action.before, after: action.after }, at: action.at }].slice(-HISTORY_LIMIT),
        future: [],
      }
    case 'undo': {
      const entry = state.past[state.past.length - 1]
      if (!entry) return state
      if (entry.cause.kind === 'text') return { ...state, past: state.past.slice(0, -1), future: [entry, ...state.future] }
      return {
        ...state,
        template: entry.template,
        past: state.past.slice(0, -1),
        future: [{ ...entry, template: state.template }, ...state.future],
        issues: [],
        pendingOps: null,
        selectedId: keepSelection(entry.template, state.selectedId),
      }
    }
    case 'redo': {
      const [entry, ...future] = state.future
      if (!entry) return state
      if (entry.cause.kind === 'text') return { ...state, past: [...state.past, entry], future }
      return {
        ...state,
        template: entry.template,
        past: [...state.past, { ...entry, template: state.template }],
        future,
        issues: [],
        pendingOps: null,
        selectedId: keepSelection(entry.template, state.selectedId),
      }
    }
    case 'select':
      return state.selectedId === action.id ? state : { ...state, selectedId: action.id }
    case 'saveStarted':
      return { ...state, pendingOps: [] }
    case 'rebase': {
      const replayed = applyDocOps(action.server, action.ops, { mode: 'best_effort' })
      const template = replayed.result
      return {
        ...createEditorState(template),
        selectedId: keepSelection(template, state.selectedId),
        // Lo rehecho todavía no está guardado: se guarda como operaciones normales.
        pendingOps: replayed.changed ? cloneDocJson(action.ops) as DocOp[] : [],
        rebased: true,
      }
    }
    case 'dismissRebased':
      return state.rebased ? { ...state, rebased: false } : state
    case 'clearIssues':
      return state.issues.length ? { ...state, issues: [] } : state
  }
}

export const canUndo = (s: EditorState) => s.past.length > 0
export const canRedo = (s: EditorState) => s.future.length > 0
