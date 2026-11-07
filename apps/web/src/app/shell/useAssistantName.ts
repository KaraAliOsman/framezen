/**
 * Nombre del asistente por defecto de la organización (dato: cada empresa puede renombrarlo o tener
 * varios). Lo usan la paleta ⌘K y los atajos. Se consulta de buena fe a la API v2 del asistente; si
 * aún no responde (o falla), devuelve `undefined` y los textos usan «el asistente».
 *
 * Contrato: clave de caché `ASSISTANTS_QUERY_KEY` (`['assistant-v2', 'assistants']`), mismo cuerpo
 * `AssistantListResponse`. Quien cree, renombre o borre asistentes puede invalidarla.
 */
import { useQuery } from '@tanstack/react-query'
import { ASSISTANT_V2_PATHS, type AssistantListResponse } from '@dekopen/shared'
import { request } from '../../lib/api'

export const ASSISTANTS_QUERY_KEY = ['assistant-v2', 'assistants'] as const

/** Ruta relativa a `/api` (request ya antepone `/api`). */
const ASSISTANTS_PATH = ASSISTANT_V2_PATHS.assistants.replace(/^\/api/, '')

export function useAssistantName({ enabled = true }: { enabled?: boolean } = {}): string | undefined {
  const { data } = useQuery({
    queryKey: ASSISTANTS_QUERY_KEY,
    queryFn: ({ signal }) => request<AssistantListResponse>(ASSISTANTS_PATH, { signal, retry: 0 }),
    enabled,
    retry: false,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  })
  const items = Array.isArray(data?.items) ? data.items : []
  const chosen = items.find((a) => a.isDefault) ?? items[0]
  const name = typeof chosen?.name === 'string' ? chosen.name.trim() : ''
  return name || undefined
}
