/**
 * Textos de estado del avatar, listos para una región aria-live="polite" junto a él: el estado
 * se anuncia con texto, nunca con el SVG.
 */
import { AVATAR_PALETTE_IDS, type AvatarAccessory, type AvatarEyes, type AvatarMotion, type AvatarPaletteId, type AvatarShape } from '@dekopen/shared'
import { translate, useT, type Locale } from '../../../lib/i18n'
import type { AvatarState, MarcoState } from './engine/director'
import es from './i18n/es'

/** Línea de estado en el idioma de la interfaz (o en `locale`). */
export function avatarStateLabel(state: AvatarState, locale?: Locale): string {
  return translate(es, `state.${state}`, undefined, locale)
}

/** Hook: devuelve la función de etiquetas y se refresca al cambiar el idioma. */
export function useAvatarLabels() {
  const t = useT(es)
  return {
    state: (state: AvatarState) => t(`state.${state}`),
    stateName: (state: AvatarState) => t(`stateName.${state}`),
    shape: (shape: AvatarShape) => t(`shape.${shape}`),
    palette: (palette: AvatarPaletteId | 'custom') => t(`palette.${palette}`),
    eyes: (eyes: AvatarEyes) => t(`eyes.${eyes}`),
    accessory: (accessory: AvatarAccessory) => t(`accessory.${accessory}`),
    motion: (motion: AvatarMotion) => t(`motion.${motion}`),
    motionHint: (motion: AvatarMotion) => t(`motionHint.${motion}`),
  }
}

/** Nombre de una paleta en el idioma actual (sin React). */
export function avatarPaletteLabel(palette: AvatarPaletteId | 'custom', locale?: Locale): string {
  return translate(es, `palette.${palette}`, undefined, locale)
}

/** Las 12 paletas con nombre (para selectores). */
export const AVATAR_PALETTE_CHOICES: readonly AvatarPaletteId[] = AVATAR_PALETTE_IDS

/**
 * Compatibilidad v4: etiquetas en español de los siete estados de Marco. Código nuevo:
 * `avatarStateLabel(state)` o `useAvatarLabels().state(state)`, que siguen el idioma.
 */
export const MARCO_STATE_LABELS: Record<MarcoState, string> = {
  idle: es.state.idle,
  listening: es.state.listening,
  thinking: es.state.thinking,
  working: es.state.working,
  done: es.state.done,
  approval: es.state.approval,
  error: es.state.error,
}
