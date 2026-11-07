/**
 * Consultas del asistente v2 (react-query). Ninguna bloquea el panel: si el servidor no tiene aún el
 * asistente v2 o no hay red, el panel sigue con comandos locales y el nombre/aspecto por defecto.
 */
import { useQuery } from '@tanstack/react-query'
import {
  clampMode,
  DEFAULT_ASSISTANT_MODE,
  DEFAULT_AVATAR,
  type AssistantMode,
  type AssistantProfile,
  type AssistantV2Status,
} from '@dekopen/shared'
import { ApiRequestError } from '../../../lib/api'
import { translate } from '../../../lib/i18n'
import es from '../i18n/es'
import { assistantApi } from './client'

export const assistantKeys = {
  all: ['assistant-v2'] as const,
  status: ['assistant-v2', 'status'] as const,
  assistants: ['assistant-v2', 'assistants'] as const,
  conversations: (q: string, assistantId?: string | null) => ['assistant-v2', 'conversations', q, assistantId ?? null] as const,
  conversationsAll: ['assistant-v2', 'conversations'] as const,
  memories: (assistantId?: string | null) => ['assistant-v2', 'memories', assistantId ?? null] as const,
  memoriesAll: ['assistant-v2', 'memories'] as const,
}

export function useAssistantStatus(enabled = true) {
  return useQuery({ queryKey: assistantKeys.status, queryFn: ({ signal }) => assistantApi.status(signal), enabled, staleTime: 60_000, retry: false })
}

export function useAssistants(enabled = true) {
  return useQuery({ queryKey: assistantKeys.assistants, queryFn: () => assistantApi.assistants.list(), enabled, staleTime: 5 * 60_000, retry: false })
}

export function useConversations(q: string, enabled = true) {
  return useQuery({
    queryKey: assistantKeys.conversations(q),
    queryFn: ({ signal }) => assistantApi.conversations.list({ q: q || undefined, limit: 60 }, signal),
    enabled,
    staleTime: 15_000,
    retry: false,
    placeholderData: (prev) => prev,
  })
}

export function useMemories(assistantId: string | null, enabled = true) {
  return useQuery({
    queryKey: assistantKeys.memories(assistantId),
    queryFn: () => assistantApi.memories.list(assistantId ? { assistantId } : {}),
    enabled,
    staleTime: 30_000,
    retry: false,
  })
}

/** Perfil que se ve: el elegido, si no el predeterminado, si no el primero; null sin servidor. */
export function pickAssistant(items: readonly AssistantProfile[] | undefined, chosen: string | null): AssistantProfile | null {
  if (!items?.length) return null
  return items.find((a) => a.id === chosen) ?? items.find((a) => a.isDefault) ?? items[0]
}

export function assistantName(profile: AssistantProfile | null | undefined): string {
  return profile?.name?.trim() || translate(es, 'defaultName')
}

export function assistantAvatar(profile: AssistantProfile | null | undefined) {
  return profile?.avatar ?? DEFAULT_AVATAR
}

/** Modo efectivo: el elegido (o el del asistente), acotado a lo que el plan y el rol permiten. */
export function effectiveMode(chosen: AssistantMode | null, profile: AssistantProfile | null, status: AssistantV2Status | undefined): AssistantMode {
  const wanted = chosen ?? profile?.defaultMode ?? DEFAULT_ASSISTANT_MODE
  const allowed = status?.modes
  if (!allowed?.length || allowed.includes(wanted)) return wanted
  const ceiling: AssistantMode = allowed.includes('full') ? 'full' : allowed.includes('supervised') ? 'supervised' : 'chat'
  return clampMode(wanted, ceiling)
}

/** ¿Hay IA ahora? undefined = todavía no se sabe (se intenta igual). */
export function aiAvailable(status: AssistantV2Status | undefined, statusError: unknown): boolean | undefined {
  if (status) return status.ai.available
  // 404/501: este servidor todavía no tiene el asistente v2. Un corte de red no decide nada.
  if (statusError instanceof ApiRequestError && (statusError.status === 404 || statusError.status === 501)) return false
  return undefined
}
