import type { LayoutSash, Opening } from '@dekopen/engine'

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
  /** Pivotantes: media hoja entra y media sale. */
  pivot: deg(80),
  /** Plegable: ángulo de la primera hoja de cada grupo (el resto se pliega en zigzag). */
  folding: deg(84),
  /** Osciloparalela: inclinación máxima mientras la hoja sale hacia el interior. */
  tiltSlide: deg(6),
} as const

/** Cuánto sale hacia el interior una hoja paralela antes de correr (mm): libra el perfil del fijo. */
export const PARALLEL_OFFSET_MM = 64

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

/** Corredera paralela y osciloparalela (PSK): sale hacia el interior y corre por delante del fijo. */
export interface ParallelMotion {
  type: 'parallel'
  /** Punto de referencia (centro del canto inferior); la hoja se inclina sobre él. */
  pivot: { x: number; y: number; z: number }
  /** Recorrido (mm con signo, + = a la derecha vista desde el interior). */
  travel: number
  /** Cuánto sale hacia el interior (mm). */
  offset: number
  /** Inclinación máxima (rad) mientras sale: 0 en la corredera paralela. */
  tilt: number
}

export type SashMotion = RotateMotion | NoMotion | ParallelMotion

/** Hoja plegable con su movimiento relativo a la hoja de la que cuelga. */
export interface FoldStep {
  nodeId: string
  /** Hoja a la que está articulada (null = la jamba). */
  parent: string | null
  motion: RotateMotion
}

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

/** Salida, deslizamiento e inclinación (0–1) de una hoja paralela para un avance de la hoja dado. */
export function parallelProgress(move: number): { out: number; slide: number; tilt: number } {
  const m = clamp01(move)
  return { out: smoothstep(m / 0.4), slide: smoothstep((m - 0.3) / 0.7), tilt: Math.sin(Math.PI * clamp01(m / 0.4)) }
}

/** Elevadora: cuánto se levanta la hoja (mm) y su avance (0–1) antes de correr. */
export const LIFT_SLIDE_RISE_MM = 6
export function liftProgress(move: number): number {
  return smoothstep(clamp01(move) / 0.2)
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
    case 'tilt_slide':
    case 'parallel_slide':
      // El tirador va en el canto de cierre: el opuesto al sentido en que corre la hoja.
      return (opening.slide ?? 'left') === 'left' ? 'right' : 'left'
    case 'pivot_v':
      return 'right'
    case 'pivot_h':
      return 'top'
    default:
      return (opening.hinge ?? 'left') === 'left' ? 'right' : 'left'
  }
}

/**
 * Movimiento de una hoja practicable.
 * `zRange` es la profundidad que ocupa la hoja (back = lado exterior, front = lado interior).
 * `room` = mm libres hasta el marco a cada lado (para el recorrido de las paralelas).
 */
export function computeSashMotion(
  sash: Pick<LayoutSash, 'opening' | 'rect' | 'handle'>,
  zRange: { back: number; front: number },
  room?: { left: number; right: number },
): SashMotion {
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
    case 'pivot_v': {
      // Eje vertical dentro de la hoja: una mitad entra y la otra sale.
      const f = Math.min(0.95, Math.max(0.05, opening.pivot ?? 0.5))
      return { type: 'rotate', axis: 'y', pivot: { x: rect.x + rect.w * f, y: rect.y + rect.h / 2, z: (zRange.back + zRange.front) / 2 }, angle: -sign * OPENING_ANGLES.pivot }
    }
    case 'pivot_h': {
      const f = Math.min(0.95, Math.max(0.05, opening.pivot ?? 0.5))
      return { type: 'rotate', axis: 'x', pivot: { x: rect.x + rect.w / 2, y: rect.y + rect.h * f, z: (zRange.back + zRange.front) / 2 }, angle: -sign * OPENING_ANGLES.pivot }
    }
    case 'tilt_slide':
    case 'parallel_slide': {
      const slide = opening.slide ?? 'left'
      const available = room ? (slide === 'left' ? room.left : room.right) : rect.w
      // Corre por delante del paño vecino; nunca más allá del marco.
      const travel = Math.max(0, Math.min(rect.w, available))
      return {
        type: 'parallel',
        pivot: { x: rect.x + rect.w / 2, y: rect.y + rect.h, z: zRange.front },
        travel: slide === 'left' ? -travel : travel,
        offset: PARALLEL_OFFSET_MM,
        tilt: opening.kind === 'tilt_slide' ? OPENING_ANGLES.tiltSlide : 0,
      }
    }
    case 'folding':
      // Las hojas plegables se resuelven en cadena (`computeFoldingChains`); suelta, gira sobre su jamba.
      return computeFoldingChains([{ nodeId: 'leaf', rect, hinge: opening.hinge ?? 'left', direction }], zRange)[0].motion
    default:
      return { type: 'none' }
  }
}

/**
 * Cadena de hojas de un plegable. Las hojas se agrupan por el lado donde se apilan (`hinge`); la más
 * cercana a la jamba gira sobre ella y cada una de las demás cuelga de la anterior con el giro contrario
 * (zigzag), así que cada movimiento es relativo a su hoja madre. Con apertura completa las hojas quedan
 * casi paralelas, apiladas contra la jamba.
 */
export function computeFoldingChains(
  leaves: { nodeId: string; rect: { x: number; y: number; w: number; h: number }; hinge: 'left' | 'right'; direction?: 'in' | 'out' }[],
  zRange: { back: number; front: number },
): FoldStep[] {
  const steps: FoldStep[] = []
  for (const stack of ['left', 'right'] as const) {
    const group = leaves.filter((leaf) => leaf.hinge === stack).sort((a, b) => (stack === 'left' ? a.rect.x - b.rect.x : b.rect.x - a.rect.x))
    group.forEach((leaf, k) => {
      const inward = (leaf.direction ?? 'in') === 'in'
      const sign = (stack === 'left' ? -1 : 1) * (inward ? 1 : -1)
      // Primera hoja: la jamba. Siguientes: el canto que comparten con la hoja anterior.
      const x = stack === 'left' ? leaf.rect.x : leaf.rect.x + leaf.rect.w
      const angle = k === 0 ? sign * OPENING_ANGLES.folding : (k % 2 === 1 ? -2 : 2) * sign * OPENING_ANGLES.folding
      steps.push({
        nodeId: leaf.nodeId,
        parent: k === 0 ? null : group[k - 1].nodeId,
        motion: { type: 'rotate', axis: 'y', pivot: { x, y: leaf.rect.y + leaf.rect.h / 2, z: inward ? zRange.front : zRange.back }, angle },
      })
    })
  }
  return steps
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
