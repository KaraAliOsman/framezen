/**
 * Carga de las teselas integradas (data URL WebP). Cada foliado es su propio módulo: la web solo descarga
 * los que dibuja (import dinámico = un trozo por foliado) y el servidor los lee igual, sin `fs`.
 *
 * - `loadBuiltinTextures(ids)` carga (una vez) y avisa a los suscriptores (los dibujos se redibujan).
 * - `builtinTextureHref(id)` lee la caché de forma síncrona (render estático: precargar antes).
 */
import type { BuiltinTextureId } from './registry'
import { BUILTIN_TEXTURE_IDS } from './registry'

type TileModule = { default: string }

const LOADERS: Record<BuiltinTextureId, () => Promise<TileModule>> = {
  white_9016: () => import('./builtin/white_9016'),
  cream_9001: () => import('./builtin/cream_9001'),
  grey_7035: () => import('./builtin/grey_7035'),
  quartz_grey_7039: () => import('./builtin/quartz_grey_7039'),
  anthracite_7016_smooth: () => import('./builtin/anthracite_7016_smooth'),
  anthracite_7016_woodgrain: () => import('./builtin/anthracite_7016_woodgrain'),
  anthracite_7016_sand: () => import('./builtin/anthracite_7016_sand'),
  black_9005: () => import('./builtin/black_9005'),
  black_brown_8022: () => import('./builtin/black_brown_8022'),
  chartwell_green: () => import('./builtin/chartwell_green'),
  golden_oak: () => import('./builtin/golden_oak'),
  nut_tree: () => import('./builtin/nut_tree'),
  mahogany: () => import('./builtin/mahogany'),
  winchester: () => import('./builtin/winchester'),
  sheffield_oak: () => import('./builtin/sheffield_oak'),
  irish_oak: () => import('./builtin/irish_oak'),
  metbrush_silver: () => import('./builtin/metbrush_silver'),
}

const cache = new Map<BuiltinTextureId, string>()
const pending = new Map<BuiltinTextureId, Promise<string | undefined>>()
const listeners = new Set<() => void>()
let version = 0

function notify() {
  version++
  for (const listener of [...listeners]) listener()
}

/** Tesela ya cargada (data URL) o undefined. */
export function builtinTextureHref(id: BuiltinTextureId): string | undefined {
  return cache.get(id)
}

/** Carga las teselas pedidas (por defecto todas). Nunca rechaza: un foliado que falla queda plano. */
export async function loadBuiltinTextures(ids: readonly BuiltinTextureId[] = BUILTIN_TEXTURE_IDS): Promise<Partial<Record<BuiltinTextureId, string>>> {
  const wanted = [...new Set(ids)].filter((id) => id in LOADERS)
  let changed = false
  await Promise.all(
    wanted.map((id) => {
      if (cache.has(id)) return cache.get(id)
      let job = pending.get(id)
      if (!job) {
        job = LOADERS[id]()
          .then((mod) => {
            const href = typeof mod.default === 'string' && mod.default.startsWith('data:image/') ? mod.default : undefined
            if (href) {
              cache.set(id, href)
              changed = true
            }
            return href
          })
          .catch(() => undefined)
          .finally(() => pending.delete(id))
        pending.set(id, job)
      }
      return job
    }),
  )
  if (changed) notify()
  const out: Partial<Record<BuiltinTextureId, string>> = {}
  for (const id of wanted) {
    const href = cache.get(id)
    if (href) out[id] = href
  }
  return out
}

/** ¿Están todas cargadas? */
export function builtinTexturesReady(ids: readonly BuiltinTextureId[]): boolean {
  return ids.every((id) => cache.has(id))
}

/** Suscripción a cargas nuevas (useSyncExternalStore). */
export function subscribeBuiltinTextures(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Versión de la caché: cambia cada vez que llega una tesela. */
export function builtinTexturesVersion(): number {
  return version
}
