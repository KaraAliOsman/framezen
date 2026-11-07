/*
 * Compatibilidad v4: `MarcoAvatar` es ahora un alias de `AssistantAvatar`. Sin `spec` dibuja el
 * avatar por defecto (círculo antracita con ojos de cápsula), con las mismas props de siempre:
 * `color` reemplaza el cuerpo y la variable CSS `--marco-eye` (si un ancestro la define)
 * reemplaza los ojos.
 */
import { memo } from 'react'
import { AssistantAvatar, eyeScaleFor, type AssistantAvatarProps, type AvatarLookAt, type AvatarPoint } from './AssistantAvatar'

export { eyeScaleFor }
export type MarcoLookAt = AvatarLookAt
export type MarcoPoint = AvatarPoint

export interface MarcoAvatarProps extends Omit<AssistantAvatarProps, 'state'> {
  state: NonNullable<AssistantAvatarProps['state']>
}

export const MarcoAvatar = memo(function MarcoAvatar({ eyeColor, ...props }: MarcoAvatarProps) {
  return <AssistantAvatar eyeColor={eyeColor ?? (props.spec ? undefined : 'var(--marco-eye, #FFFFFF)')} {...props} />
})
