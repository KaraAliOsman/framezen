/**
 * Contrato de los manejadores de herramientas del agente.
 *
 * Un manejador recibe argumentos YA validados (zod estricto del registro compartido) y un contexto
 * con la sesión de la persona. Toda escritura pasa por `ctx.call` (rutas fijas de routes-map.ts):
 * así aplica exactamente lo mismo que un clic en la web. Las lecturas pueden usar servicios del
 * servidor directamente, siempre filtrando por la organización de la sesión y redactando por rol.
 *
 * `ctx.dryRun`: el manejador calcula la vista previa (para la tarjeta de aprobación) sin escribir.
 */
import type { AgentToolArgs, AgentToolName, AffectedEntity, ToolPreview, TurnUiState, UiAction } from '@dekopen/shared'
import type { AppDeps, AuthContext } from '../../../context'
import type { ToolUndoData } from '../../../db/schema'
import type { Viewer } from '../../access'
import type { DispatchActor, DispatchCall, DispatchResult } from '../../dispatch'
import type { AssistantText } from '../i18n'
import type { AgentRouteKey } from '../routes-map'

/** Estado que se comparte entre las llamadas de un mismo turno. */
export interface TurnMemo {
  /** Cotización creada o abierta en este turno (las siguientes llamadas la usan por defecto). */
  quoteId?: string
  /** Último ítem tocado («otra igual», «ancho 1800» después de agregar). */
  lastItemId?: string
}

export interface ToolContext {
  deps: AppDeps
  auth: AuthContext
  actor: DispatchActor
  viewer: Viewer
  /** Textos en el idioma de la interfaz de la persona y formatos con la moneda de la empresa. */
  text: AssistantText
  ui: TurnUiState
  assistant: { id: string; name: string }
  conversationId: string
  toolCallId: string
  toolRunId?: string
  memo: TurnMemo
  dryRun: boolean
  signal?: AbortSignal
  /** Deshace la última acción ejecutada de esta conversación. */
  undoLast(): Promise<{ summary: string; affected: AffectedEntity[] } | null>
  /** Busca en conversaciones anteriores de esta persona. */
  searchConversations(query: string): Promise<{ title: string; when: string; excerpt?: string }[]>
  /** Llamada interna a una ruta fija con la sesión de la persona (marcada `via: 'assistant'`). */
  call<T = unknown>(route: AgentRouteKey, call?: DispatchCall): Promise<DispatchResult<T>>
}

/**
 * Un campo que debe seguir igual para poder deshacer. Cada paso del camino es una clave de objeto o,
 * en listas, un criterio `{ campo: valor }` que elige el primer elemento que calza (null = ausente).
 */
export interface UndoCheck {
  path: (string | Record<string, string | null>)[]
  value: unknown
}

/** Datos para deshacer: ruta fija por clave + guardia de conflicto. */
export interface AgentUndo extends ToolUndoData {
  /** Ruta fija que deshace (o `internal` para datos del propio asistente, como la memoria). */
  route?: AgentRouteKey
  params?: Record<string, string>
  internal?: { kind: 'memory_delete' | 'memory_restore'; id: string }
  /**
   * Antes de deshacer se lee `guard.route` y se compara `guard.field` con `guard.value`; si cambió,
   * alguien editó después y el deshacer responde 409 undo_conflict.
   */
  guard?: { route: AgentRouteKey; params: Record<string, string>; field: 'version' | 'updatedAt'; value: number | string }
  /**
   * Guardia por campos (entidades sin versión: ajustes, precios, plantilla predeterminada,
   * texturas): antes de deshacer se lee `expect.route` y cada `checks[i].path` debe seguir valiendo
   * lo que dejó la acción. Si otra persona cambió alguno de ESOS campos → 409 undo_conflict; los
   * cambios en otros campos no bloquean.
   */
  expect?: { route: AgentRouteKey; params?: Record<string, string>; query?: Record<string, string>; checks: UndoCheck[] }
  /** Pasos extra (p. ej. borrar un cliente creado junto con la cotización). */
  then?: {
    route: AgentRouteKey
    params?: Record<string, string>
    body?: unknown
    /** El paso solo corre si estos campos siguen así (si no, se omite: p. ej. un cliente que ya usa otra persona). */
    onlyIf?: { route: AgentRouteKey; params?: Record<string, string>; checks: UndoCheck[] }
  }[]
}

export interface ToolOutcome {
  ok: boolean
  /** Resultado compacto para el modelo (redactado por rol, sin secretos). */
  data?: unknown
  /** Frase corta para la línea de actividad, en el idioma de la persona. */
  summary: string
  error?: { code: string; message: string }
  affected?: AffectedEntity[]
  /** Acciones de interfaz que acompañan el resultado (abrir la cotización creada…). */
  ui?: UiAction[]
  undo?: AgentUndo | null
  /** Solo en `dryRun`: vista previa para la tarjeta de aprobación. */
  preview?: ToolPreview
}

export type ToolHandler<N extends AgentToolName = AgentToolName> = (ctx: ToolContext, args: AgentToolArgs[N]) => Promise<ToolOutcome>

export type ToolHandlers = { [N in AgentToolName]: ToolHandler<N> }

/** Error de herramienta con un código estable para el modelo (nunca lanza fuera del ejecutor). */
export class ToolFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly summary?: string,
  ) {
    super(message)
    this.name = 'ToolFailure'
  }
}
