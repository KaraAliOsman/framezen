/**
 * Señal pública del panel de Marco para otras pantallas: `<html data-assistant="open|minimized|closed">`
 * y `<html data-assistant-place="right|items|none">` (las publica MarcoRoot junto con
 * `--fz-assistant-inset`). Las pantallas que quieran reservar el espacio del panel en escritorio leen
 * estas señales en vez de depender del store del asistente.
 *
 * - `right`: panel abierto a la derecha; reserva `--fz-assistant-inset` (380 px).
 * - `items`: panel abierto en el lugar de la columna de ventanas del editor (bajo xl); no reserva
 *   nada (`--fz-assistant-inset` = 0 px), el lienzo conserva su ancho.
 * - `none`: cerrado, minimizado o en el teléfono (hoja inferior).
 */
import { useSyncExternalStore } from 'react'

export type AssistantPanelState = 'open' | 'minimized' | 'closed'
export type AssistantPlace = 'right' | 'items' | 'none'

function read(): AssistantPanelState {
  if (typeof document === 'undefined') return 'closed'
  const value = document.documentElement.dataset.assistant
  return value === 'open' || value === 'minimized' ? value : 'closed'
}

function readPlace(): AssistantPlace {
  if (typeof document === 'undefined') return 'none'
  const value = document.documentElement.dataset.assistantPlace
  return value === 'right' || value === 'items' ? value : 'none'
}

function subscribe(onChange: () => void): () => void {
  if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return () => undefined
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-assistant', 'data-assistant-place'] })
  return () => observer.disconnect()
}

/** Estado del panel de Marco (reactivo). En el teléfono el panel es una hoja: no reserva espacio. */
export function useAssistantPanelState(): AssistantPanelState {
  return useSyncExternalStore(subscribe, read, () => 'closed')
}

/** Dónde está el panel abierto en escritorio (reactivo). Solo `right` pide reservar espacio. */
export function useAssistantPlace(): AssistantPlace {
  return useSyncExternalStore(subscribe, readPlace, () => 'none')
}
