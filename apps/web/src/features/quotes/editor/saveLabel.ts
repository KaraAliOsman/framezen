import type { SaveInfo } from '../model/store'

/**
 * Texto del indicador de guardado cuando el de siempre no dice la verdad: sin conexión los cambios
 * solo están «a salvo» si quedaron en este equipo, y un rechazo del servidor (4xx) no se reintenta
 * solo. `undefined` = el texto de siempre.
 */
export function editorSaveLabel(save: Pick<SaveInfo, 'status' | 'message' | 'retrying' | 'local'>): string | undefined {
  if (save.status === 'offline') return save.local ? 'Sin conexión · guardado en este equipo' : 'Sin conexión · no cierres esta pestaña'
  if (save.status === 'error' && !save.retrying) return save.message ? `No pudimos guardar: ${save.message}` : 'No pudimos guardar tus cambios'
  return undefined
}
