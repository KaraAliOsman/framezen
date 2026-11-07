/**
 * Avatares de los asistentes (equipo AVATAR). Contrato público para el panel, el editor de
 * asistentes, la paleta de comandos y la landing:
 *
 *   <AssistantAvatar spec={assistant.avatar} state="thinking" size={28} />
 *   <AvatarDesigner value={avatar} onChange={setAvatar} name={assistant.name} />
 *
 * `MarcoAvatar` sigue existiendo como alias (v4).
 */
export {
  AssistantAvatar,
  avatarViewBox,
  eyeScaleFor,
  type AssistantAvatarProps,
  type AvatarLookAt,
  type AvatarPoint,
} from './AssistantAvatar'
export { AvatarDesigner, randomAvatar, type AvatarDesignerProps } from './AvatarDesigner'
export { MarcoAvatar, type MarcoAvatarProps, type MarcoLookAt, type MarcoPoint } from './MarcoAvatar'
export {
  AVATAR_STATES,
  MARCO_STATES,
  PLANS as AVATAR_PLANS,
  AvatarDirector,
  MarcoDirector,
  isAvatarState,
  type AvatarState,
  type MarcoState,
} from './engine/director'
export { AvatarEngine, MarcoEngine, type AvatarDesign, type AvatarFrame, type MarcoFrame } from './engine/engine'
export { EXPRESSION_IDS, isExpressionId, type ExpressionId } from './engine/expressions'
export { stillFrame } from './engine/still'
export { AVATAR_PALETTE_CHOICES, MARCO_STATE_LABELS, avatarPaletteLabel, avatarStateLabel, useAvatarLabels } from './labels'
export { INITIAL_MOOD, avatarMoodReducer, avatarStateOf, useAvatarMood, type AvatarMood, type AvatarPhase, type AvatarSignal } from './mood'
export { emitBotReaction } from './reactions'
export { adviseColors, contrastRatio, resolveAvatarColors, type ColorAdvice, type ResolvedAvatarColors } from './colors'
