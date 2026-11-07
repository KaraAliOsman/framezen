/**
 * Estado visible del avatar del asistente (lo que el panel le pide mostrar) y su línea de estado.
 * El avatar (equipo AVATAR) puede tener más estados; estos son los que el panel decide.
 */
import { translate } from '../../lib/i18n'
import es from './i18n/es'

export const FACE_STATES = ['idle', 'listening', 'thinking', 'speaking', 'working', 'done', 'approval', 'error', 'offline'] as const
export type FaceState = (typeof FACE_STATES)[number]

/** Escuchando mientras escribes, salvo que esté ocupado o esperando. */
export function displayFace(face: FaceState, busy: boolean, typing: boolean): FaceState {
  if (busy || face === 'approval' || face === 'thinking' || face === 'speaking' || face === 'working') return face
  if (typing) return 'listening'
  return face
}

/** Texto para la región aria-live junto al avatar. */
export function faceLabel(face: FaceState, options: { step?: string; localOnly?: boolean } = {}): string {
  if (face === 'working') return options.step ?? translate(es, 'face.working')
  if (face === 'idle' && options.localOnly) return translate(es, 'face.localOnly')
  return translate(es, `face.${face}`)
}
