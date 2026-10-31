/**
 * Guardado automático (SPEC §1.3): junta los cambios, espera un respiro y guarda. Nunca hay botón
 * «Guardar». Si no hay conexión, conserva los cambios y reintenta solo; si el servidor rechaza un
 * dato (4xx), lo dice en lenguaje humano y deja seguir trabajando.
 *
 * La cola de cada guardado vive fuera del componente: si sales de la sección (o de la pantalla)
 * con un cambio sin guardar, se sigue reintentando con espera creciente y al volver la conexión.
 * Con `key`, la misma cola se retoma al volver: el indicador sigue diciendo «Sin conexión», el
 * cambio pendiente se puede leer con `unsaved()` y lo nuevo se suma encima (nunca lo viejo pisa a
 * lo nuevo). Mientras quede algo sin guardar, el navegador pregunta antes de cerrar la página.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ApiRequestError, humanError } from '../../../lib/api'
import type { SaveStatus } from '../../../ui/SaveIndicator'
import { toast } from '../../../ui/Toaster'

export interface AutosaveOptions {
  /** Espera tras el último cambio antes de guardar (ms). */
  delay?: number
  /** Primer reintento ante cortes de red o fallas del servidor (ms); luego crece hasta 30 s. */
  retryDelay?: number
  /**
   * Qué se guarda (p. ej. «settings:pricing»). Dos pantallas con la misma clave comparten la cola,
   * así que deben guardar lo mismo y de la misma forma.
   */
  key?: string
}

export interface Autosave<P> {
  status: SaveStatus
  savedAt: Date | null
  /** Último mensaje de error humano (4xx), para mostrarlo en línea. */
  error: string | null
  /** Agrega cambios a la cola (los más nuevos ganan) y programa el guardado. */
  queue: (patch: P) => void
  /** Guarda ya lo pendiente (al salir de un campo, al cambiar de paso). */
  flush: () => Promise<void>
  /** Hay cambios sin guardar. */
  dirty: () => boolean
  /** Lo que aún no confirma el servidor (en camino o pendiente), o `null`. */
  unsaved: () => P | null
}

function isRetryable(error: unknown): boolean {
  if (error instanceof ApiRequestError) return error.status === 0 || error.status >= 500 || error.status === 429
  return true
}

// ── Cola compartida (fuera de React) ────────────────────────────────────────

interface Snapshot {
  status: SaveStatus
  savedAt: Date | null
  error: string | null
}

interface SaveQueue {
  id: string
  save: (patch: object) => Promise<unknown>
  retryDelay: number
  /** Cambios por enviar (los más nuevos ganan). */
  pending: object | null
  /** Cambios que van en la petición en curso. */
  inflight: object | null
  timer: ReturnType<typeof setTimeout> | null
  running: Promise<void> | null
  attempts: number
  /** Pantallas montadas que usan esta cola. */
  holders: number
  snapshot: Snapshot
  listeners: Set<() => void>
}

const IDLE: Snapshot = { status: 'idle', savedAt: null, error: null }
const queues = new Map<string, SaveQueue>()
let anonymousCount = 0
let listening = false

function emit(q: SaveQueue, patch: Partial<Snapshot>) {
  q.snapshot = { ...q.snapshot, ...patch }
  for (const listener of q.listeners) listener()
}

function clearTimer(q: SaveQueue) {
  if (q.timer) clearTimeout(q.timer)
  q.timer = null
}

function hasWork(q: SaveQueue): boolean {
  return q.pending !== null || q.running !== null || q.timer !== null
}

/** Sin pantallas ni nada por guardar: la cola se olvida (al volver se parte de cero). */
function release(q: SaveQueue) {
  if (q.holders > 0 || hasWork(q)) return
  if (queues.get(q.id) === q) queues.delete(q.id)
}

async function run(q: SaveQueue): Promise<void> {
  clearTimer(q)
  if (q.running) {
    await q.running
    if (q.pending) return run(q)
    return
  }
  const patch = q.pending
  if (!patch) {
    release(q)
    return
  }
  q.pending = null
  q.inflight = patch
  const job = (async () => {
    try {
      await q.save(patch)
      q.attempts = 0
      q.inflight = null
      emit(q, q.pending ? { error: null } : { status: 'saved', savedAt: new Date(), error: null })
    } catch (err) {
      q.inflight = null
      if (isRetryable(err)) {
        // Lo nuevo que llegó mientras tanto gana sobre lo que falló.
        q.pending = { ...patch, ...(q.pending ?? {}) }
        q.attempts += 1
        emit(q, { status: err instanceof ApiRequestError && err.status === 0 ? 'offline' : 'error' })
        const wait = Math.min(30_000, q.retryDelay * 2 ** Math.min(q.attempts - 1, 4))
        clearTimer(q)
        q.timer = setTimeout(() => void run(q), wait)
      } else {
        q.attempts = 0
        emit(q, { status: 'error', error: humanError(err) })
        // Nadie lo está mirando: que no se pierda en silencio.
        if (q.holders === 0) toast.error(`No pudimos guardar un cambio: ${humanError(err)}`)
      }
    }
  })()
  q.running = job
  try {
    await job
  } finally {
    q.running = null
  }
  if (q.pending && !q.timer) return run(q)
  release(q)
}

function hasUnsaved(q: SaveQueue): boolean {
  return q.pending !== null || q.inflight !== null
}

/** Hay algún cambio de cualquier pantalla que el servidor aún no confirma. */
export function hasUnsavedChanges(): boolean {
  for (const q of queues.values()) if (hasUnsaved(q)) return true
  return false
}

function listenWindow() {
  if (listening || typeof window === 'undefined') return
  listening = true
  // Volvió la conexión: no esperamos al próximo reintento.
  window.addEventListener('online', () => {
    for (const q of [...queues.values()]) if (q.pending && !q.running) void run(q)
  })
  // Al cerrar la página, un último intento (sin esperar).
  window.addEventListener('pagehide', () => {
    for (const q of [...queues.values()]) if (q.pending && !q.running) void run(q)
  })
  window.addEventListener('beforeunload', (event) => {
    if (!hasUnsavedChanges()) return
    event.preventDefault()
    // Navegadores antiguos piden un texto (no lo muestran).
    event.returnValue = ''
  })
}

function getQueue(id: string, save: (patch: object) => Promise<unknown>, retryDelay: number): SaveQueue {
  listenWindow()
  let q = queues.get(id)
  if (!q) {
    q = {
      id,
      save,
      retryDelay,
      pending: null,
      inflight: null,
      timer: null,
      running: null,
      attempts: 0,
      holders: 0,
      snapshot: IDLE,
      listeners: new Set(),
    }
    queues.set(id, q)
  }
  return q
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useAutosave<P extends object>(save: (patch: P) => Promise<unknown>, options: AutosaveOptions = {}): Autosave<P> {
  const { delay = 600, retryDelay = 3000, key } = options
  const [privateId] = useState(() => `autosave:${++anonymousCount}`)
  const id = key ?? privateId
  // Solo depende de la clave: la función y la espera se actualizan abajo en cada render.
  const q = useMemo(() => getQueue(id, save as (patch: object) => Promise<unknown>, retryDelay), [id])
  // La cola sigue guardando con la última función aunque la pantalla ya no esté.
  q.save = save as (patch: object) => Promise<unknown>
  q.retryDelay = retryDelay

  const subscribe = useCallback(
    (listener: () => void) => {
      q.listeners.add(listener)
      return () => {
        q.listeners.delete(listener)
      }
    },
    [q],
  )
  const snapshot = useSyncExternalStore(subscribe, () => q.snapshot, () => q.snapshot)

  useEffect(() => {
    if (queues.get(q.id) !== q) queues.set(q.id, q)
    q.holders += 1
    return () => {
      q.holders -= 1
      // Al salir guardamos ya lo pendiente (sin esperar la pausa); si falla, la cola sigue
      // reintentando sola. Si hay una petición en curso, sale apenas termine.
      if (q.pending) {
        clearTimer(q)
        if (!q.running) void run(q)
      } else release(q)
    }
  }, [q])

  const queue = useCallback(
    (patch: P) => {
      q.pending = { ...(q.pending ?? {}), ...patch }
      emit(q, { status: 'saving', error: null })
      clearTimer(q)
      q.timer = setTimeout(() => void run(q), delay)
    },
    [q, delay],
  )

  const flush = useCallback(() => run(q), [q])
  const dirty = useCallback(() => q.pending !== null, [q])
  const unsaved = useCallback(() => (hasUnsaved(q) ? ({ ...(q.inflight ?? {}), ...(q.pending ?? {}) } as P) : null), [q])

  return { ...snapshot, queue, flush, dirty, unsaved }
}

/** Combina varios indicadores en uno (el peor estado manda). */
export function combineStatus(...statuses: SaveStatus[]): SaveStatus {
  const order: SaveStatus[] = ['error', 'offline', 'saving', 'saved', 'idle']
  for (const s of order) if (statuses.includes(s)) return s
  return 'idle'
}
