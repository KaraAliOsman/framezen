/**
 * Cara del asistente en el panel: el avatar animado (equipo AVATAR) con TODO el aspecto del perfil
 * (`AvatarSpec`: forma, colores, ojos, accesorio y movimiento). Un solo punto de contacto con el
 * avatar para todo el panel.
 */
import { memo } from 'react'
import { DEFAULT_AVATAR, type AvatarSpec } from '@dekopen/shared'
import { AssistantAvatar, type AvatarState, type MarcoLookAt } from '../avatar'

export interface BotFaceProps {
  spec?: AvatarSpec | null
  state: AvatarState
  size: number
  animated?: boolean
  lookAt?: MarcoLookAt
  /** Recibe las reacciones del asistente activo (teclas, mensajes, herramientas). */
  reactive?: boolean
  /** Al tocarlo, reacciona. */
  pokeable?: boolean
  /** Segundos sin actividad antes de dormirse. */
  sleepAfter?: number | false
  /** Etiqueta accesible; sin ella es decorativo. */
  title?: string
  className?: string
}

export const BotFace = memo(function BotFace({ spec, state, size, animated = true, lookAt = 'pointer', reactive, pokeable, sleepAfter, title, className }: BotFaceProps) {
  return (
    <span style={{ display: 'inline-flex' }} className={className}>
      <AssistantAvatar spec={spec ?? DEFAULT_AVATAR} state={state} size={size} animated={animated} lookAt={lookAt} reactive={reactive} pokeable={pokeable} sleepAfter={sleepAfter} title={title} />
    </span>
  )
})
