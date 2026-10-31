/**
 * Completitud de las líneas en lenguaje humano. La regla vive en @framezen/catalog
 * (`lineReadiness`, la misma del importador); aquí solo están los textos, los tonos y el
 * puente hacia la pestaña Precios («Completar precios» abre justo lo que falta).
 * Se recalcula en vivo con los precios propios del taller: cargar un precio cambia el estado.
 */
import type { Catalog, Id, Line } from '@framezen/engine'
import { catalogReadiness, type LineReadiness, type ReadinessState } from '@framezen/catalog'
import type { BadgeTone } from '../../../ui'
import { overrideKey, type PriceFocus } from './prices'

export type { LineReadiness, ReadinessState }

export const READINESS_COPY: Record<ReadinessState, { label: string; tone: BadgeTone; dot: string; help: string }> = {
  ready: {
    label: 'Lista para cotizar',
    tone: 'ok',
    dot: 'bg-ok-600',
    help: 'Una ventana completa sale con todos sus perfiles, refuerzos, herrajes y accesorios con precio.',
  },
  warnings: {
    label: 'Cotiza con avisos',
    tone: 'warn',
    dot: 'bg-warn-600',
    help: 'Cotizas igual: lo que no tiene precio entra en $0 y la cotización te avisa qué es.',
  },
  geometry: {
    label: 'Solo medidas',
    tone: 'neutral',
    dot: 'bg-paper-350',
    help: 'Dibuja y corta con sus medidas. El costo sale en $0 hasta que cargues tus precios.',
  },
}

/** Completitud de todas las líneas del catálogo (por id). */
export function readinessByLine(catalog: Catalog | undefined): Map<Id, LineReadiness> {
  return catalog ? catalogReadiness(catalog) : new Map()
}

/**
 * Claves de las filas de la pestaña Precios que faltan para que la línea quede lista: cada
 * perfil requerido en los colores que ofrece la línea, los refuerzos y los herrajes de sus reglas.
 */
export function missingPriceKeys(readiness: LineReadiness): string[] {
  const keys = new Set<string>()
  for (const gap of readiness.unpricedRoles) for (const colorId of gap.colorIds) keys.add(overrideKey({ kind: 'profile', id: gap.profileId, colorId }))
  for (const id of readiness.unpricedSteel) keys.add(overrideKey({ kind: 'profile', id }))
  for (const id of readiness.unpricedItems) keys.add(overrideKey({ kind: 'item', id }))
  return [...keys]
}

/** Filtro «Lo que falta en …» para la pestaña Precios; null si no falta ningún precio. */
export function completePricesFocus(line: Pick<Line, 'name'>, readiness: LineReadiness): PriceFocus | null {
  const keys = missingPriceKeys(readiness)
  return keys.length ? { label: `Lo que falta en ${line.name}`, keys } : null
}

/** Texto del botón según cuánto falta. */
export function completePricesLabel(readiness: LineReadiness): string {
  const count = missingPriceKeys(readiness).length
  if (!count) return 'Completar precios'
  return count === 1 ? 'Cargar el precio que falta' : `Completar ${count.toLocaleString('es-CL')} precios`
}
