import { translate } from '../../../lib/i18n'
import es from '../i18n/es'
import type { SaveInfo } from '../model/store'

/**
 * Texto del indicador de guardado cuando el de siempre no dice la verdad: sin conexión los cambios
 * solo están «a salvo» si quedaron en este equipo, y un rechazo del servidor (4xx) no se reintenta
 * solo. `undefined` = el texto de siempre.
 */
export function editorSaveLabel(save: Pick<SaveInfo, 'status' | 'message' | 'retrying' | 'local'>): string | undefined {
  if (save.status === 'offline') return translate(es, save.local ? 'save.offlineLocal' : 'save.offline')
  if (save.status === 'error' && !save.retrying) return save.message ? translate(es, 'save.errorWith', { message: save.message }) : translate(es, 'save.error')
  return undefined
}
