import { stillStep, type AvatarState } from './director'
import { AvatarEngine, type AvatarDesign, type AvatarFrame } from './engine'
import type { ExpressionId } from './expressions'

export interface StillOptions {
  eyeScale?: number
  design?: Partial<AvatarDesign>
  /** cara de reposo distinta (solo en estados con cara de reposo: idle, listening…) */
  expression?: ExpressionId
}

/**
 * Frame quieto y representativo de un estado (miniaturas junto a los mensajes, toasts,
 * selectores del diseñador). Determinista: misma entrada, mismo SVG. «Listo» se muestra
 * feliz, no guiñando.
 */
export function stillFrame(state: AvatarState, options: StillOptions = {}): AvatarFrame {
  const step = stillStep(state)
  const engine = new AvatarEngine({
    pose: step.pose,
    expression: options.expression && step.pose === 'rest' && step.expression === 'attentive' ? options.expression : (step.expression ?? 'attentive'),
    reducedMotion: true,
    eyeScale: options.eyeScale,
    design: options.design,
  })
  // t = 1: antes del primer parpadeo del calendario, ojos abiertos
  return engine.sample(1)
}
