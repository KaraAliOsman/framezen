/**
 * Puente con el editor de asistentes de BOT-UI (`features/assistant/**`), sin importar su código.
 *
 * Contrato (eventos del navegador en `window`):
 * - `dekopen:assistant-editor` (CustomEvent cancelable, detail `AssistantEditorRequest`): Ajustes pide
 *   abrir el editor. Quien lo atiende (el panel del asistente) llama `event.preventDefault()`.
 *   Si nadie lo atiende, Ajustes abre su propio editor (`AssistantEditorSheet`), así nunca queda
 *   un botón muerto.
 * - `dekopen:assistants-changed` (Event): cualquiera que cree, edite o archive un asistente lo emite;
 *   Ajustes refresca su lista.
 */
export const ASSISTANT_EDITOR_EVENT = 'dekopen:assistant-editor'
export const ASSISTANTS_CHANGED_EVENT = 'dekopen:assistants-changed'

export interface AssistantEditorRequest {
  /** Asistente a editar; ausente = crear uno nuevo. */
  assistantId?: string
  /** Pestaña inicial sugerida del editor. */
  focus?: 'appearance' | 'personality' | 'behaviour'
  /** Desde dónde se pidió (para volver o medir). */
  source: 'settings'
}

/** Pide el editor de BOT-UI. Devuelve true si alguien lo abrió. */
export function requestAssistantEditor(detail: Omit<AssistantEditorRequest, 'source'>): boolean {
  if (typeof window === 'undefined') return false
  const event = new CustomEvent<AssistantEditorRequest>(ASSISTANT_EDITOR_EVENT, { detail: { ...detail, source: 'settings' }, cancelable: true })
  // dispatchEvent devuelve false si algún oyente llamó preventDefault().
  return !window.dispatchEvent(event)
}

/** Avisa a otras partes de la app que la lista de asistentes cambió. */
export function notifyAssistantsChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(ASSISTANTS_CHANGED_EVENT))
}
