import { stillStep, type MarcoState } from './director'
import { MarcoEngine, type MarcoFrame } from './engine'

/**
 * Frame quieto y representativo de un estado (miniaturas junto a los mensajes, toasts).
 * Determinista: misma entrada, mismo SVG. «Listo» se muestra feliz, no guiñando.
 */
export function stillFrame(state: MarcoState, options: { eyeScale?: number } = {}): MarcoFrame {
  const step = stillStep(state)
  const engine = new MarcoEngine({
    pose: step.pose,
    expression: step.expression ?? 'attentive',
    reducedMotion: true,
    eyeScale: options.eyeScale,
  })
  // t = 1: antes del primer parpadeo del calendario, ojos abiertos
  return engine.sample(1)
}
