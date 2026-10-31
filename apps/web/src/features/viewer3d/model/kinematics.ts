import type { LayoutSash, Opening } from '@framezen/engine'

/**
 * Cinemática de apertura, pura y sin three.js.
 *
 * Espacio del modelo (mm): X a la derecha vista desde el interior, Y hacia arriba,
 * Z hacia el interior (z = 0 cara exterior del marco, z = profundidad cara interior).
 */

const deg = (value: number) => (value * Math.PI) / 180

/** Ángulos máximos de cada apertura (radianes, sin signo). */
export const OPENING_ANGLES = {
  casement: deg(82),
  tilt_turn: deg(80),
  door: deg(85),
  tilt: deg(20),
  awning: deg(30),
} as const

/** La manilla gira primero y luego se mueve la hoja, como en la vida real. */
const HANDLE_PHASE_END = 0.16
const MOVE_PHASE_START = 0.12

export type HandleSide = 'left' | 'right' | 'top' | 'bottom'

export interface RotateMotion {
  type: 'rotate'
  axis: 'x' | 'y'
  /** Punto de giro en coordenadas del dibujo: x, y (mm, y hacia abajo) y z (mm desde la cara exterior). */
  pivot: { x: number; y: number; z: number }
  /** Ángulo con signo a apertura completa, en el espacio del modelo (Y arriba). */
  angle: number
}

export interface NoMotion {
  type: 'none'
}

export type SashMotion = RotateMotion | NoMotion

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return value < 0 ? 0 : value > 1 ? 1 : value
}

function smoothstep(t: number): number {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

/** Avance de la manilla (0–1) para una apertura global dada. */
export function handleProgress(amount: number): number {
  return smoothstep(clamp01(amount) / HANDLE_PHASE_END)
}

/** Avance de la hoja (0–1) para una apertura global dada. */
export function moveProgress(amount: number): number {
  return clamp01((clamp01(amount) - MOVE_PHASE_START) / (1 - MOVE_PHASE_START))
}

/** Dirección de apertura efectiva: el proyectante abre hacia fuera; el resto, hacia dentro. */
export function openingDirection(opening: Opening): 'in' | 'out' {
  if (opening.direction) return opening.direction
  return opening.kind === 'awning' ? 'out' : 'in'
}

/** Lado de bisagras efectivo para aperturas laterales. */
export function hingeSide(opening: Opening, handle?: HandleSide): 'left' | 'right' {
  if (opening.hinge) return opening.hinge
  return handle === 'left' ? 'right' : 'left'
}

/** Dónde va la manilla si el motor no lo dice: en el lado de cierre. */
export function defaultHandleSide(opening: Opening): HandleSide | undefined {
  switch (opening.kind) {
    case 'fixed':
      return undefined
    case 'tilt':
      return 'top'
    case 'awning':
      return 'bottom'
    default:
      return (opening.hinge ?? 'left') === 'left' ? 'right' : 'left'
  }
}

/**
 * Movimiento de una hoja practicable.
 * `zRange` es la profundidad que ocupa la hoja (back = lado exterior, front = lado interior).
 */
export function computeSashMotion(sash: Pick<LayoutSash, 'opening' | 'rect' | 'handle'>, zRange: { back: number; front: number }): SashMotion {
  const { opening, rect } = sash
  const direction = openingDirection(opening)
  const sign = direction === 'in' ? 1 : -1
  const hingeZ = direction === 'in' ? zRange.front : zRange.back

  switch (opening.kind) {
    case 'fixed':
      return { type: 'none' }
    case 'tilt': {
      // Bisagras abajo: la parte superior se inclina.
      return { type: 'rotate', axis: 'x', pivot: { x: rect.x + rect.w / 2, y: rect.y + rect.h, z: hingeZ }, angle: sign * OPENING_ANGLES.tilt }
    }
    case 'awning': {
      // Bisagras arriba: la parte inferior se proyecta.
      return { type: 'rotate', axis: 'x', pivot: { x: rect.x + rect.w / 2, y: rect.y, z: hingeZ }, angle: -sign * OPENING_ANGLES.awning }
    }
    case 'casement':
    case 'tilt_turn':
    case 'door': {
      const hinge = hingeSide(opening, sash.handle)
      const max = OPENING_ANGLES[opening.kind]
      const x = hinge === 'left' ? rect.x : rect.x + rect.w
      // Giro sobre Y: con bisagra izquierda, ángulo negativo lleva la hoja hacia +Z (interior).
      const angle = (hinge === 'left' ? -1 : 1) * sign * max
      return { type: 'rotate', axis: 'y', pivot: { x, y: rect.y + rect.h / 2, z: hingeZ }, angle }
    }
    default:
      return { type: 'none' }
  }
}

/** Giro de la palanca de la manilla (eje Z del modelo) y orientación de reposo. */
export function handleLever(kind: Opening['kind'], side: HandleSide): { rest: number; turn: number } {
  if (kind === 'door') {
    // Manilla de puerta: horizontal apuntando a las bisagras; baja ~35° al accionarla.
    if (side === 'left') return { rest: deg(90), turn: -deg(35) }
    return { rest: -deg(90), turn: deg(35) }
  }
  // Ventana con manilla lateral: en reposo apunta hacia abajo y gira 90° hacia el centro de la hoja.
  if (side === 'right') return { rest: 0, turn: -deg(90) }
  if (side === 'left') return { rest: 0, turn: deg(90) }
  // Manilla arriba o abajo: en reposo queda acostada sobre el perfil y gira hacia el vidrio.
  if (side === 'top') return { rest: deg(90), turn: -deg(90) }
  return { rest: deg(90), turn: deg(90) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Correderas
// ─────────────────────────────────────────────────────────────────────────────

export interface SlidingSpan {
  kind: 'moving' | 'fixed'
  direction?: 'left' | 'right'
  /** Carril físico efectivo (0 = exterior). */
  track: number
  x0: number
  x1: number
}

/**
 * Carriles efectivos. Si una hoja móvil comparte riel con una fija (monorriel), la fija
 * pasa a un carril propio para que la móvil pueda deslizarse por delante.
 */
export function resolveSlidingTracks(panels: { kind: 'moving' | 'fixed'; rail: number }[], rails = 1): { tracks: number[]; count: number } {
  const maxRail = panels.reduce((max, panel) => Math.max(max, Math.max(0, Math.floor(panel.rail))), 0)
  let count = Math.max(1, Math.floor(rails), maxRail + 1)
  const tracks = panels.map((panel) => Math.max(0, Math.floor(panel.rail)))
  const extraTrack = new Map<number, number>()
  for (let rail = 0; rail <= maxRail; rail++) {
    const onRail = panels.filter((_, i) => tracks[i] === rail)
    const hasMoving = onRail.some((panel) => panel.kind === 'moving')
    const hasFixed = onRail.some((panel) => panel.kind === 'fixed')
    if (hasMoving && hasFixed) extraTrack.set(rail, count++)
  }
  panels.forEach((panel, i) => {
    const extra = extraTrack.get(tracks[i])
    if (extra !== undefined && panel.kind === 'fixed') tracks[i] = extra
  })
  return { tracks, count }
}

function coveredLength(spans: [number, number][]): number {
  const sorted = spans.filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0])
  let total = 0
  let start = -Infinity
  let end = -Infinity
  for (const [a, b] of sorted) {
    if (a > end) {
      if (end > start) total += end - start
      start = a
      end = b
    } else if (b > end) {
      end = b
    }
  }
  if (end > start) total += end - start
  return total
}

/**
 * Recorrido de cada hoja (mm con signo, + = hacia la derecha) a apertura completa.
 *
 * Cada hoja móvil, en orden, avanza en su sentido hasta el marco o hasta topar otra hoja
 * de su mismo carril, eligiendo el recorrido que deja más vano libre (así dos hojas
 * enfrentadas no se cruzan y una corredera telescópica se apila entera).
 */
export function computeSlidingTravel(spans: SlidingSpan[]): number[] {
  const travel = spans.map(() => 0)
  if (spans.length === 0) return travel
  const minLeft = Math.min(...spans.map((s) => s.x0))
  const maxRight = Math.max(...spans.map((s) => s.x1))
  const center = (minLeft + maxRight) / 2
  const total = maxRight - minLeft
  const current: [number, number][] = spans.map((s) => [s.x0, s.x1])
  const tolerance = 0.5

  spans.forEach((span, i) => {
    if (span.kind !== 'moving') return
    const direction = span.direction ?? ((span.x0 + span.x1) / 2 < center ? 'right' : 'left')
    const sign = direction === 'right' ? 1 : -1
    const [x0, x1] = current[i]

    let limit = sign > 0 ? maxRight - x1 : x0 - minLeft
    spans.forEach((other, j) => {
      if (j === i || other.track !== span.track) return
      const [o0, o1] = current[j]
      if (sign > 0 && o0 >= x1 - tolerance) limit = Math.min(limit, o0 - x1)
      if (sign < 0 && o1 <= x0 + tolerance) limit = Math.min(limit, x0 - o1)
    })
    limit = Math.max(0, limit)
    if (limit < tolerance) return

    const candidates = new Set<number>([0, limit])
    current.forEach(([o0, o1], j) => {
      if (j === i) return
      for (const edge of [o0, o1]) {
        for (const own of [x0, x1]) {
          const t = sign * (edge - own)
          if (t > 0 && t < limit) candidates.add(t)
        }
      }
    })

    const openFor = (t: number) => {
      const moved: [number, number][] = current.map((s, j) => (j === i ? [s[0] + sign * t, s[1] + sign * t] : s))
      return total - coveredLength(moved)
    }

    let best = 0
    let bestOpen = openFor(0)
    for (const t of [...candidates].sort((a, b) => a - b)) {
      const open = openFor(t)
      if (open > bestOpen + tolerance || (Math.abs(open - bestOpen) <= tolerance && t > best)) {
        best = t
        bestOpen = Math.max(open, bestOpen)
      }
    }
    travel[i] = best === 0 ? 0 : sign * best
    current[i] = [x0 + sign * best, x1 + sign * best]
  })
  return travel
}
