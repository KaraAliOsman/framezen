/**
 * Asistentes v2 vistos desde Ajustes (contrato `ASSISTANT_V2_PATHS` de @dekopen/shared, servidor de
 * AGENT). Todo es tolerante: si la ruta todavía no responde (404, sin conexión) la pantalla sigue
 * en pie con lo que sabe del plan, y lo dice.
 */
import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ASSISTANT_V2_PATHS,
  type AssistantCreateBody,
  type AssistantDeleteResponse,
  type AssistantListResponse,
  type AssistantPatchBody,
  type AssistantProfile,
  type AssistantV2Status,
} from '@dekopen/shared'
import { ApiRequestError, request } from '../../../lib/api'
import { ASSISTANTS_CHANGED_EVENT } from './assistantBridge'

/** Las rutas del contrato son absolutas (`/api/…`); `request` ya antepone `/api`. */
export const apiPath = (path: string) => path.replace(/^\/api(?=\/)/, '')

export const assistantsKey = ['assistant-v2', 'assistants'] as const
export const assistantStatusKey = ['assistant-v2', 'status'] as const

/** La ruta existe pero no está montada todavía (o la empresa no la tiene). */
export function isMissingRoute(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.status === 404 || error.status === 405 || error.status === 501)
}

export function useAssistants(options: { enabled?: boolean } = {}) {
  const client = useQueryClient()
  // El editor del asistente (BOT-UI) avisa cuando guarda: la lista se refresca sola.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const refresh = () => void client.invalidateQueries({ queryKey: ['assistant-v2'] })
    window.addEventListener(ASSISTANTS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(ASSISTANTS_CHANGED_EVENT, refresh)
  }, [client])
  return useQuery({
    queryKey: assistantsKey,
    queryFn: () => request<AssistantListResponse>(apiPath(ASSISTANT_V2_PATHS.assistants), { retry: 0 }),
    retry: (count, error) => !isMissingRoute(error) && count < 1,
    staleTime: 30_000,
    enabled: options.enabled,
  })
}

export function useAssistantStatus(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: assistantStatusKey,
    queryFn: () => request<AssistantV2Status>(apiPath(ASSISTANT_V2_PATHS.status), { retry: 0 }),
    retry: (count, error) => !isMissingRoute(error) && count < 1,
    staleTime: 30_000,
    enabled: options.enabled,
  })
}

function replaceIn(list: AssistantListResponse | undefined, next: AssistantProfile): AssistantListResponse | undefined {
  if (!list) return list
  const items = list.items.map((a) => (a.id === next.id ? next : next.isDefault ? { ...a, isDefault: false } : a))
  return { ...list, items }
}

/**
 * Cambia un asistente con su `version` (el servidor responde 409 si alguien lo cambió antes: en ese
 * caso refrescamos y la persona vuelve a intentarlo sobre lo último).
 */
export function usePatchAssistant() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: AssistantPatchBody }) =>
      request<AssistantProfile>(apiPath(ASSISTANT_V2_PATHS.assistant(id)), { method: 'PATCH', body: patch }),
    onMutate: async ({ id, patch }) => {
      await client.cancelQueries({ queryKey: assistantsKey })
      const previous = client.getQueryData<AssistantListResponse>(assistantsKey)
      const current = previous?.items.find((a) => a.id === id)
      if (previous && current) {
        const { version: _version, ...rest } = patch
        void _version
        client.setQueryData(assistantsKey, replaceIn(previous, { ...current, ...(rest as Partial<AssistantProfile>) }))
      }
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(assistantsKey, context.previous)
      void client.invalidateQueries({ queryKey: assistantsKey })
    },
    onSuccess: (profile) => {
      client.setQueryData<AssistantListResponse | undefined>(assistantsKey, (list) => replaceIn(list, profile))
    },
  })
}

export function useCreateAssistant() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: AssistantCreateBody) => request<AssistantProfile>(apiPath(ASSISTANT_V2_PATHS.assistants), { method: 'POST', body }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['assistant-v2'] }),
  })
}

export const assistantsApi = {
  archive: (id: string) => request<AssistantDeleteResponse>(apiPath(ASSISTANT_V2_PATHS.assistant(id)), { method: 'DELETE' }),
  restore: (id: string) => request<AssistantProfile>(apiPath(ASSISTANT_V2_PATHS.assistantRestore(id)), { method: 'POST' }),
}
