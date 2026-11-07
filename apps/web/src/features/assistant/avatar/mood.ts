/**
 * Del flujo del asistente al estado del avatar (DEKOPEN). Reductor puro: recibe los eventos
 * del turno (`TurnEvent` del asistente v2) y señales de la interfaz, y decide qué cara poner.
 *
 * Prioridad cuando varias cosas pasan a la vez:
 *   error > aprobación > trabajando > pensando > hablando > escuchando > listo > reposo
 * («alerta» y «celebración» son destellos: duran hasta el próximo evento o terminan solos).
 */
import type { TurnEvent } from '@dekopen/shared'
import { useCallback, useReducer } from 'react'
import type { AvatarState } from './engine/director'

export type AvatarPhase = 'idle' | 'thinking' | 'speaking' | 'working' | 'done' | 'error' | 'alert' | 'celebrate'

export interface AvatarMood {
  phase: AvatarPhase
  /** propuestas esperando aprobación */
  pending: number
  /** la persona está escribiendo en el compositor */
  typing: boolean
  /** hay un turno en curso */
  busy: boolean
}

/** Señales de la interfaz que no vienen del servidor. */
export type AvatarSignal =
  | TurnEvent
  /** se envió un mensaje (antes de que llegue `turn.started`) */
  | { type: 'ui.sent' }
  | { type: 'ui.typing'; typing: boolean }
  /** la persona resolvió una propuesta (aprobó o rechazó) */
  | { type: 'ui.approval_resolved' }
  /** comando local ejecutado (cero créditos) */
  | { type: 'ui.local_done'; ok: boolean }
  /** la persona detuvo el turno */
  | { type: 'ui.aborted' }
  /** algo que merece una pequeña fiesta (cotización aceptada, primer documento…) */
  | { type: 'ui.celebrate' }
  | { type: 'ui.reset' }

export const INITIAL_MOOD: AvatarMood = { phase: 'idle', pending: 0, typing: false, busy: false }

export function avatarMoodReducer(mood: AvatarMood, signal: AvatarSignal): AvatarMood {
  switch (signal.type) {
    case 'ui.sent':
    case 'turn.started':
      return { ...mood, busy: true, phase: 'thinking' }
    case 'message.delta':
      return { ...mood, busy: true, phase: 'speaking' }
    case 'message.done':
      return mood.busy ? { ...mood, phase: 'speaking' } : mood
    case 'tool.proposed':
      return { ...mood, pending: mood.pending + 1 }
    case 'tool.executed':
    case 'tool.failed':
      return { ...mood, busy: true, phase: 'working' }
    case 'notice':
      return signal.level === 'warning' ? { ...mood, phase: 'alert' } : mood
    case 'error':
      return { ...mood, busy: false, phase: 'error' }
    case 'done':
      switch (signal.reason) {
        case 'completed':
          return { ...mood, busy: false, phase: 'done' }
        case 'approval_required':
          return { ...mood, busy: false, phase: 'idle', pending: Math.max(mood.pending, 1) }
        case 'limit':
          return { ...mood, busy: false, phase: 'alert' }
        case 'error':
          return { ...mood, busy: false, phase: 'error' }
        default:
          return { ...mood, busy: false, phase: 'idle' }
      }
    case 'ui.typing':
      return signal.typing === mood.typing ? mood : { ...mood, typing: signal.typing }
    case 'ui.approval_resolved': {
      const pending = Math.max(0, mood.pending - 1)
      // al aprobar o rechazar, el servidor continúa el turno: vuelve a trabajar
      return { ...mood, pending, busy: true, phase: 'working' }
    }
    case 'ui.local_done':
      return { ...mood, busy: false, phase: signal.ok ? 'done' : 'error' }
    case 'ui.aborted':
      return { ...mood, busy: false, phase: 'idle' }
    case 'ui.celebrate':
      return { ...mood, phase: 'celebrate' }
    case 'ui.reset':
      return INITIAL_MOOD
    default:
      return mood
  }
}

/** Estado visible del avatar para un ánimo. */
export function avatarStateOf(mood: AvatarMood): AvatarState {
  if (mood.phase === 'error') return 'error'
  if (mood.pending > 0) return 'approval'
  if (mood.phase === 'alert') return 'alert'
  if (mood.phase === 'celebrate') return 'celebrate'
  if (mood.phase === 'working') return 'working'
  if (mood.phase === 'thinking') return 'thinking'
  if (mood.phase === 'speaking') return 'speaking'
  if (mood.typing && !mood.busy) return 'listening'
  if (mood.phase === 'done') return 'done'
  return 'idle'
}

/** Hook práctico: `const { state, dispatch } = useAvatarMood()`; pasar `state` al avatar. */
export function useAvatarMood(initial: AvatarMood = INITIAL_MOOD) {
  const [mood, dispatchRaw] = useReducer(avatarMoodReducer, initial)
  const dispatch = useCallback((signal: AvatarSignal) => dispatchRaw(signal), [])
  return { mood, state: avatarStateOf(mood), dispatch }
}
