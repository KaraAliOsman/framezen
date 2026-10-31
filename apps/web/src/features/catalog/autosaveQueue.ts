/**
 * Cola de guardado automático a nivel de módulo: vive más que las pantallas.
 *
 * Un cambio agendado no depende del componente que lo hizo. Si sales de la pantalla con algo
 * pendiente o sin conexión, el cambio queda aquí y se sigue reintentando (con espera creciente y
 * en cuanto vuelve la red) hasta que el servidor lo acepte o lo rechace. Mientras haya algo sin
 * guardar, cerrar o recargar la pestaña pide confirmación (como el editor de cotizaciones).
 *
 * - Los cambios de una misma `key` (una marca, una línea…) se guardan en orden y de a uno: un
 *   reintento viejo nunca pisa un cambio más nuevo hecho después en otra pantalla.
 * - Dentro de un mismo dueño (una instancia de `useAutosave`) cada valor reemplaza al anterior,
 *   así que debe llevar todo lo pendiente (igual que antes: los cambios seguidos se juntan).
 */
import { ApiRequestError } from '../../lib/api'

export interface AutosaveOwner {
  /** Hay un cambio en la espera corta del hook que todavía no entra a la cola. */
  hasDraft(): boolean
  /** Pasa ya a la cola lo que esté en la espera corta. */
  flushDraft(): void
  /** El servidor aceptó un valor de este dueño; `more` = le quedan otros en la cola. */
  onSaved(more: boolean): void
  /** Falló un intento; `willRetry` = el cambio sigue en la cola y se reintenta solo. */
  onFailed(error: unknown, willRetry: boolean): void
}

type SaveFn = (value: unknown) => Promise<unknown>

interface Job {
  owner: AutosaveOwner
  value: unknown
  save: SaveFn
}

interface Lane {
  jobs: Job[]
  /** El primer trabajo está en vuelo. */
  running: boolean
  /** Reintento programado tras una falla de red o del servidor. */
  timer: ReturnType<typeof setTimeout> | null
  attempts: number
}

/** Primer reintento (ms); luego se duplica hasta `MAX_RETRY_MS`. */
export const RETRY_MS = 4000
const MAX_RETRY_MS = 30_000

const lanes = new Map<string, Lane>()
const owners = new Set<AutosaveOwner>()
let listening = false

/** Corte de red o falla del servidor: vale la pena insistir. Un 4xx es un dato rechazado. */
export function isTransientSaveError(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.isNetwork || error.status >= 500)
}

function retryDelay(attempts: number): number {
  return Math.min(MAX_RETRY_MS, RETRY_MS * 2 ** Math.max(0, attempts - 1))
}

function hasDrafts(): boolean {
  for (const owner of owners) if (owner.hasDraft()) return true
  return false
}

/** Cambios que todavía no llegan al servidor (en la cola o en la espera corta de una pantalla). */
export function pendingAutosaves(): number {
  let count = 0
  for (const lane of lanes.values()) count += lane.jobs.length
  for (const owner of owners) if (owner.hasDraft()) count += 1
  return count
}

function onBeforeUnload(event: BeforeUnloadEvent) {
  for (const owner of owners) owner.flushDraft()
  if (!pendingAutosaves()) return
  event.preventDefault()
  // Navegadores antiguos piden además returnValue para mostrar el aviso.
  event.returnValue = ''
}

function onOnline() {
  for (const [key, lane] of lanes) if (lane.timer) void drain(key, lane)
}

/** Escucha `beforeunload` y `online` solo mientras haya algo pendiente (no estorba al bfcache). */
export function syncAutosaveGuard(): void {
  if (typeof window === 'undefined') return
  const pending = hasDrafts() || [...lanes.values()].some((lane) => lane.jobs.length > 0)
  if (pending && !listening) {
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('online', onOnline)
    listening = true
  } else if (!pending && listening) {
    window.removeEventListener('beforeunload', onBeforeUnload)
    window.removeEventListener('online', onOnline)
    listening = false
  }
}

/** Una pantalla montada que puede tener cambios en su espera corta. Devuelve cómo darse de baja. */
export function registerAutosaveOwner(owner: AutosaveOwner): () => void {
  owners.add(owner)
  return () => {
    owners.delete(owner)
    syncAutosaveGuard()
  }
}

/** Pone un valor en la cola de `key` y lo intenta guardar en cuanto le toque. */
export function enqueueAutosave(key: string, owner: AutosaveOwner, value: unknown, save: SaveFn): void {
  let lane = lanes.get(key)
  if (!lane) {
    lane = { jobs: [], running: false, timer: null, attempts: 0 }
    lanes.set(key, lane)
  }
  // El último valor de este dueño que aún no sale reemplaza al nuevo (mantiene su turno).
  let waiting: Job | undefined
  for (let i = lane.jobs.length - 1; i >= 0; i--) {
    if (lane.jobs[i].owner !== owner) continue
    if (!(i === 0 && lane.running)) waiting = lane.jobs[i]
    break
  }
  if (waiting) {
    waiting.value = value
    waiting.save = save
  } else lane.jobs.push({ owner, value, save })
  syncAutosaveGuard()
  // Un cambio nuevo se intenta enseguida, aunque la cola estuviera esperando un reintento.
  void drain(key, lane)
}

async function drain(key: string, lane: Lane): Promise<void> {
  if (lane.running) return
  if (lane.timer) clearTimeout(lane.timer)
  lane.timer = null
  lane.running = true
  try {
    while (lane.jobs.length) {
      const job = lane.jobs[0]
      try {
        await job.save(job.value)
      } catch (error) {
        // Si el mismo dueño ya mandó un valor más nuevo, ese lleva todo: el que falló sobra.
        const superseded = lane.jobs.some((other, i) => i > 0 && other.owner === job.owner)
        if (isTransientSaveError(error) && !superseded) {
          lane.attempts += 1
          lane.timer = setTimeout(() => void drain(key, lane), retryDelay(lane.attempts))
          job.owner.onFailed(error, true)
          return
        }
        lane.jobs.shift()
        lane.attempts = 0
        if (!superseded) job.owner.onFailed(error, false)
        continue
      }
      lane.jobs.shift()
      lane.attempts = 0
      job.owner.onSaved(lane.jobs.some((other) => other.owner === job.owner))
    }
  } finally {
    lane.running = false
    if (!lane.jobs.length && !lane.timer && lanes.get(key) === lane) lanes.delete(key)
    syncAutosaveGuard()
  }
}

/** Solo para pruebas: vacía la cola y suelta los avisos del navegador. */
export function resetAutosaveQueue(): void {
  for (const lane of lanes.values()) if (lane.timer) clearTimeout(lane.timer)
  lanes.clear()
  owners.clear()
  syncAutosaveGuard()
}
