/**
 * La conversación con el asistente es de una sesión: una persona dentro de una empresa. En un PC de
 * taller compartido, quien entra después en la misma pestaña no debe ver lo que otra persona le pidió
 * (costos, márgenes) ni seguir su conversación bajo su propia sesión.
 *
 * - Al montar con sesión, la vista se asocia a `usuarioId:empresaId`; si era de otra, se descarta.
 * - Al terminar la sesión (salir, sesión vencida), se olvida todo, también lo guardado en la pestaña.
 */
import { useEffect, useLayoutEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Me } from '@dekopen/shared'
import { useAssistantStore } from '../../lib/stores'
import { qk } from '../../lib/queryClient'
import { declinePendingApprovals, undoRegistry } from './conversation'
import { useAssistantPanel } from './store'
import { useAssistantUi } from './uiState'

export function assistantOwner(me: Pick<Me, 'user' | 'org'> | null | undefined): string | null {
  return me ? `${me.user.id}:${me.org.id}` : null
}

/** Lo que vive solo en memoria y apunta a la sesión anterior (deshacer, aprobaciones). */
function forgetInMemory(): void {
  declinePendingApprovals()
  undoRegistry.clear()
}

/** Asocia la conversación a la sesión vigente; si era de otra persona o empresa, la descarta. */
export function bindAssistantSession(owner: string): void {
  if (useAssistantPanel.getState().bindSession(owner)) forgetInMemory()
}

/** Fin de sesión: el asistente olvida la conversación, el borrador y lo guardado en la pestaña. */
export function endAssistantSession(): void {
  forgetInMemory()
  useAssistantPanel.getState().clearSession()
  useAssistantPanel.persist.clearStorage()
  useAssistantStore.setState({ open: false, pendingPrompt: null })
  useAssistantUi.setState({ editor: null, memoryOpen: false })
}

/**
 * Engancha la conversación a la sesión. `stop` corta un turno en curso cuando la sesión termina,
 * para que una respuesta tardía no vuelva a escribir en el panel.
 */
export function useAssistantSession(me: Pick<Me, 'user' | 'org'> | null, stop: () => void): void {
  const client = useQueryClient()
  const owner = assistantOwner(me)

  // Antes de pintar y antes de cualquier envío: nunca se ve ni se manda una conversación ajena.
  useLayoutEffect(() => {
    if (owner) bindAssistantSession(owner)
  }, [owner])

  // El panel solo vive con sesión: si se desmonta porque ya no hay sesión, se olvida todo.
  useEffect(
    () => () => {
      if (client.getQueryData<Me | null>(qk.me)) return
      stop()
      endAssistantSession()
    },
    [client, stop],
  )
}

/** Alias de compatibilidad (v4). */
export const marcoOwner = assistantOwner
export const bindMarcoSession = bindAssistantSession
export const endMarcoSession = endAssistantSession
export const useMarcoSession = useAssistantSession
