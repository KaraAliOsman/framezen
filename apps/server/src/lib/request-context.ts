/**
 * Contexto de ejecución interno (AsyncLocalStorage) para las acciones que el asistente hace por
 * una persona. services/dispatch.ts lo abre alrededor de cada llamada interna a la API y
 * services/activity.ts lo agrega al `meta` de la actividad (`via: 'assistant'`, asistente,
 * herramienta), así el historial muestra qué hizo el bot.
 *
 * Solo se puede abrir desde el propio proceso: ninguna cabecera HTTP lo activa.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

export interface DispatchMeta {
  via: 'assistant'
  assistantId?: string
  assistantName?: string
  conversationId?: string
  toolRunId?: string
  toolCallId?: string
  tool?: string
}

interface DispatchScope {
  meta: DispatchMeta
  /** Profundidad de anidamiento (una herramienta nunca llama a otra). */
  depth: number
}

const storage = new AsyncLocalStorage<DispatchScope>()

/** Ejecuta `fn` con la marca del asistente. */
export function runWithDispatchMeta<T>(meta: DispatchMeta, fn: () => Promise<T>): Promise<T> {
  const parent = storage.getStore()
  return storage.run({ meta, depth: (parent?.depth ?? 0) + 1 }, fn)
}

/** Marca vigente (o undefined si la acción la hizo una persona directamente). */
export function currentDispatchMeta(): DispatchMeta | undefined {
  return storage.getStore()?.meta
}

export function dispatchDepth(): number {
  return storage.getStore()?.depth ?? 0
}

/** Campos para `activity.meta` (solo ids y nombres; nunca argumentos ni datos del negocio). */
export function activityMetaFromDispatch(meta: DispatchMeta | undefined = currentDispatchMeta()): Record<string, unknown> | undefined {
  if (!meta) return undefined
  const out: Record<string, unknown> = { via: meta.via }
  for (const key of ['assistantId', 'assistantName', 'conversationId', 'toolRunId', 'tool'] as const) if (meta[key]) out[key] = meta[key]
  return out
}
