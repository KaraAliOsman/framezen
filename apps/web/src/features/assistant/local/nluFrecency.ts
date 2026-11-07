/**
 * Frecuencia del motor de comandos (`createNluFrecency`) persistida en este navegador. Solo se
 * actualiza al aceptar una sugerencia o ejecutar un comando; se puede borrar (`clearNluFrecency`).
 */
import { createNluFrecency, type NluFrecency, type NluFrecencySnapshot } from '@dekopen/shared'

const KEY = 'fz-assistant-nlu'

let instance: NluFrecency | null = null

function load(): NluFrecencySnapshot | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null
    return raw ? (JSON.parse(raw) as NluFrecencySnapshot) : null
  } catch {
    return null
  }
}

function persist(frecency: NluFrecency): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(frecency.snapshot()))
  } catch {
    // Sin almacenamiento (modo privado): se queda en memoria.
  }
}

/** La frecuencia de esta pestaña (única, para que todos los intérpretes compartan el aprendizaje). */
export function nluFrecency(): NluFrecency {
  if (instance) return instance
  const inner = createNluFrecency(load())
  instance = {
    record(key, now, weight) {
      inner.record(key, now, weight)
      persist(inner)
    },
    boost: (key, now) => inner.boost(key, now),
    snapshot: () => inner.snapshot(),
    clear() {
      inner.clear()
      try {
        localStorage.removeItem(KEY)
      } catch {
        // nada que borrar
      }
    },
  }
  return instance
}

/** Borra lo aprendido (ajustes de privacidad). */
export function clearNluFrecency(): void {
  nluFrecency().clear()
}

/** Solo pruebas. */
export function resetNluFrecency(): void {
  instance = null
}
