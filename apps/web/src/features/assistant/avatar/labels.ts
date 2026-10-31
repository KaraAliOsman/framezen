import type { MarcoState } from './engine/director'

/**
 * Línea de estado de Marco, lista para una región aria-live="polite" junto al avatar.
 * El estado se anuncia con texto, no con el SVG.
 */
export const MARCO_STATE_LABELS: Record<MarcoState, string> = {
  idle: 'Disponible',
  listening: 'Te escucho',
  thinking: 'Pensando…',
  working: 'Trabajando en eso…',
  done: 'Listo',
  approval: 'Espera tu visto bueno',
  error: 'Algo no salió bien',
}
