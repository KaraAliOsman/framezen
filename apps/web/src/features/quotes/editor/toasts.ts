/**
 * Avisos del editor: arriba al centro, para no tapar los totales del pie ni la barra del
 * teléfono mientras cambian (el resto de la app los muestra abajo).
 */
import type { ExternalToast } from 'sonner'
import { toast as baseToast, toastUndo as baseToastUndo, type UndoToastOptions } from '../../../ui'

const AT = { position: 'top-center' } as const
type Message = Parameters<typeof baseToast>[0]

export const toast = Object.assign((message: Message, options?: ExternalToast) => baseToast(message, { ...AT, ...options }), {
  success: (message: Message, options?: ExternalToast) => baseToast.success(message, { ...AT, ...options }),
  error: (message: Message, options?: ExternalToast) => baseToast.error(message, { ...AT, ...options }),
  message: (message: Message, options?: ExternalToast) => baseToast.message(message, { ...AT, ...options }),
})

export function toastUndo(message: string, onUndo: () => void, options: UndoToastOptions = {}) {
  return baseToastUndo(message, onUndo, { ...AT, ...options })
}

/** Para acciones que llevan a otra pantalla: el aviso va donde lo muestra el resto de la app. */
export { baseToast as appToast, baseToastUndo as appToastUndo }
