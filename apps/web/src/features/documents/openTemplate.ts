/**
 * Plantilla abierta en el editor de Documentos, para quien necesite saberlo fuera de esa pantalla (el
 * agente, por ejemplo). Fuera del editor es `null`. Solo describe lo abierto; no permite cambiarlo.
 *
 *   getOpenTemplate()?.id              lectura puntual
 *   useOpenTemplate()                  en React, se actualiza sola
 *   subscribeOpenTemplate(fn)          fuera de React; devuelve cómo dejar de escuchar
 */
import { useSyncExternalStore } from 'react'
import type { DocTemplateKind } from '@dekopen/shared'

export interface OpenTemplate {
  /** Id de la plantilla propia, o del estilo DEKOPEN si se está viendo uno. */
  id: string
  kind: DocTemplateKind
  name: string
  /** Estilo DEKOPEN de solo lectura: el primer cambio crea una copia con otro id. */
  builtin: boolean
  /** Versión guardada que se abrió (la que piden las operaciones sobre la plantilla). */
  version: number
}

let current: OpenTemplate | null = null
const listeners = new Set<() => void>()

export function getOpenTemplate(): OpenTemplate | null {
  return current
}

export function subscribeOpenTemplate(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useOpenTemplate(): OpenTemplate | null {
  return useSyncExternalStore(subscribeOpenTemplate, getOpenTemplate, () => null)
}

/** El editor avisa qué tiene abierto; la función devuelta lo retira al cerrar. */
export function publishOpenTemplate(template: OpenTemplate): () => void {
  current = template
  listeners.forEach((fn) => fn())
  return () => {
    if (current !== template) return
    current = null
    listeners.forEach((fn) => fn())
  }
}
