/**
 * Cambios de una cotización que aún no confirma el servidor, guardados en este equipo
 * (localStorage). Si la pestaña se cierra, se recarga o el navegador la descarta sin conexión,
 * al volver a abrir la cotización el editor los recupera y los vuelve a guardar.
 */
import type { Id } from '@dekopen/engine'
import type { QuoteDoc } from './doc'

export interface LocalDraft {
  quoteId: Id
  /** Versión del servidor sobre la que se hicieron los cambios. */
  baseVersion: number
  /** Lo que tenía el servidor en esa versión (base para fusionar si cambió después). */
  base: QuoteDoc
  /** Documento con los cambios pendientes. */
  doc: QuoteDoc
  /** Momento en que se escribió (ms). */
  at: number
}

export interface LocalDraftStore {
  read(quoteId: Id): LocalDraft | null
  /** true si quedó guardado en el equipo. */
  write(draft: LocalDraft): boolean
  remove(quoteId: Id): void
}

const PREFIX = 'fz:quote-draft:'
/** Un borrador más viejo que esto ya no se ofrece (y se limpia). */
const MAX_AGE_MS = 30 * 86_400_000

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null
  } catch {
    // Navegación privada estricta o cookies bloqueadas.
    return null
  }
}

function isDraft(value: unknown, quoteId: Id): value is LocalDraft {
  const d = value as Partial<LocalDraft> | null
  return (
    !!d &&
    d.quoteId === quoteId &&
    typeof d.baseVersion === 'number' &&
    typeof d.at === 'number' &&
    !!d.doc &&
    Array.isArray(d.doc.items) &&
    !!d.base &&
    Array.isArray(d.base.items)
  )
}

export function createLocalDraftStore(now: () => number = () => Date.now()): LocalDraftStore {
  return {
    read(quoteId) {
      const ls = storage()
      if (!ls) return null
      try {
        const raw = ls.getItem(PREFIX + quoteId)
        if (!raw) return null
        const parsed: unknown = JSON.parse(raw)
        if (!isDraft(parsed, quoteId) || now() - parsed.at > MAX_AGE_MS) {
          ls.removeItem(PREFIX + quoteId)
          return null
        }
        return parsed
      } catch {
        return null
      }
    },
    write(draft) {
      const ls = storage()
      if (!ls) return false
      try {
        ls.setItem(PREFIX + draft.quoteId, JSON.stringify(draft))
        return true
      } catch {
        // Sin espacio o almacenamiento bloqueado: los cambios siguen solo en memoria.
        return false
      }
    },
    remove(quoteId) {
      try {
        storage()?.removeItem(PREFIX + quoteId)
      } catch {
        // Nada que hacer.
      }
    },
  }
}

/** Borra borradores abandonados (cotizaciones que no se volvieron a abrir). */
export function pruneLocalDrafts(now: () => number = () => Date.now()): void {
  const ls = storage()
  if (!ls) return
  try {
    const stale: string[] = []
    for (let i = 0; i < ls.length; i++) {
      const key = ls.key(i)
      if (!key?.startsWith(PREFIX)) continue
      try {
        const at = (JSON.parse(ls.getItem(key) ?? 'null') as { at?: unknown } | null)?.at
        if (typeof at !== 'number' || now() - at > MAX_AGE_MS) stale.push(key)
      } catch {
        stale.push(key)
      }
    }
    for (const key of stale) ls.removeItem(key)
  } catch {
    // Nada que hacer.
  }
}

/** Almacén por defecto del navegador. */
export const localDrafts: LocalDraftStore = createLocalDraftStore()
