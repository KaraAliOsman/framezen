/**
 * Documentos de taller que crecen con las unidades (etiquetas, barras de corte, fichas de
 * montaje). Una sola ventana con cantidad 1.000 son 28.000 etiquetas: dibujarlas en la
 * pestaña son millones de nodos y la congelan o la botan. Por eso:
 * - la vista previa dibuja solo una muestra (el documento recibe el tope);
 * - sobre cierto tamaño, «Imprimir» no arma el documento en el navegador: baja el PDF del
 *   servidor, que lo arma sin trabar la pantalla.
 */
import { formatNumber } from '../../../lib/format'

/** Lo que dibuja la vista previa como máximo. */
export const PREVIEW_LIMITS = {
  /** Etiquetas: tres hojas de 10. */
  labels: 30,
  /** Barras de la hoja de cortes (el resumen por perfil va completo). */
  cutBars: 60,
  /** Hojas del listado de montaje (dos fichas por hoja). */
  assemblySheets: 6,
} as const

/**
 * Lo máximo que se arma en el navegador para «Imprimir» (≈ 200.000 nodos, un par de
 * segundos). Más que eso, solo el PDF del servidor.
 */
export const BROWSER_PRINT_LIMITS = {
  labels: 1500,
  cutBars: 4000,
  assemblySheets: 400,
} as const

/**
 * Si el documento es demasiado grande para armarlo en el navegador, el porqué (para el
 * aviso); si no, undefined.
 */
export function browserPrintNotice(count: number, limit: number, what: string): string | undefined {
  if (!(count > limit)) return undefined
  return `Son ${formatNumber(count)} ${what}: es demasiado para armarlo en el navegador sin trabarlo.`
}

/** Pie de la vista previa cuando muestra solo una parte; undefined si muestra todo. */
export function previewFooter(shown: number, total: number, what: string): string | undefined {
  if (!(total > shown)) return undefined
  return `Muestra de las primeras ${formatNumber(shown)} ${what}. Al imprimir salen las ${formatNumber(total)}.`
}
