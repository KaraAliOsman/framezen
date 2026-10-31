/**
 * La conversación con Marco es de una sesión: una persona dentro de una empresa. En un PC de taller
 * compartido, quien entra después en la misma pestaña no debe ver lo que otra persona le pidió a
 * Marco (costos, márgenes) ni reenviar ese historial a la IA bajo su propia sesión.
 *
 * - Al montar con sesión, la conversación se asocia a `usuarioId:empresaId`; si era de otra, se descarta.
 * - Al terminar la sesión (salir, sesión vencida), se olvida todo, también lo guardado en la pestaña.
 */
import { useEffect, useLayoutEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Me } from '@framezen/shared'
import { useAssistantStore } from '../../lib/stores'
import { qk } from '../../lib/queryClient'
import { declinePendingApprovals, undoRegistry } from './conversation'
import { useMarcoStore } from './store'

export function marcoOwner(me: Pick<Me, 'user' | 'org'> | null | undefined): string | null {
  return me ? `${me.user.id}:${me.org.id}` : null
}

/** Lo que vive solo en memoria y apunta a la sesión anterior (deshacer, aprobaciones). */
function forgetInMemory(): void {
  declinePendingApprovals()
  undoRegistry.clear()
}

/** Asocia la conversación a la sesión vigente; si era de otra persona o empresa, la descarta. */
export function bindMarcoSession(owner: string): void {
  if (useMarcoStore.getState().bindSession(owner)) forgetInMemory()
}

/** Fin de sesión: Marco olvida la conversación, el borrador y lo guardado en la pestaña. */
export function endMarcoSession(): void {
  forgetInMemory()
  useMarcoStore.getState().clearSession()
  useMarcoStore.persist.clearStorage()
  useAssistantStore.setState({ open: false, pendingPrompt: null })
}

/**
 * Engancha la conversación a la sesión. `stop` corta un turno en curso cuando la sesión termina,
 * para que una respuesta tardía no vuelva a escribir en el panel.
 */
export function useMarcoSession(me: Pick<Me, 'user' | 'org'> | null, stop: () => void): void {
  const client = useQueryClient()
  const owner = marcoOwner(me)

  // Antes de pintar y antes de cualquier envío: nunca se ve ni se manda una conversación ajena.
  useLayoutEffect(() => {
    if (owner) bindMarcoSession(owner)
  }, [owner])

  // El panel solo vive con sesión: si se desmonta porque ya no hay sesión, se olvida todo.
  useEffect(
    () => () => {
      if (client.getQueryData<Me | null>(qk.me)) return
      stop()
      endMarcoSession()
    },
    [client, stop],
  )
}
