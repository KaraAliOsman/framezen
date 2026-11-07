/*
 * Ajuste de la cara a cada forma (DEKOPEN; la idea viene de eyefit.ts de bloub, MIT).
 *
 * Los ojos viven en una esfera. En una forma angosta (triángulo, estrella, cápsula) la esfera
 * de radio 1 deja los ojos contra el borde y el recorte del cuerpo los corta. Este módulo
 * busca, una vez y fuera del bucle de dibujo, la escala y el centro de la cara que dejan los
 * ojos adentro en TODAS las expresiones, estilos de ojo y derivas de la mirada, con el mismo
 * margen que tiene el círculo de referencia. El resultado vive como tabla en
 * `facefit-table.ts`; la prueba `facefit.test.ts` la vuelve a verificar.
 */
import { AVATAR_EYES, type AvatarEyes } from '@dekopen/shared'
import { EXPRESSIONS } from './expressions'
import { EYE_STYLES, styleEye, type StyledEye } from './eyes'
import { eyePoses, type EyeCfg, type HeadGaze } from './face'
import type { FaceFit } from './facefit-table'
import { PROFILE_SAMPLES, radiusAtAngle } from './shape'

export interface FaceCase {
  gaze: HeadGaze
  split: number
  eyes: [EyeCfg, EyeCfg]
  valence: number
  /** tamaño del cuerpo relativo a su forma (trabajando = 0,82) */
  ratio: number
}

/** Deriva máxima de la mirada en reposo con el movimiento «vivo» (cotas exactas de liveliness). */
export const DRIFT_YAW = (5.5 + 1.6) * 1.25
export const DRIFT_PITCH = (4.2 + 1.3) * 1.25
export const DRIFT_ROLL = 2.2 * 1.25
/** Mirada externa más decidida (objetivo explícito) con la deriva que conserva. */
const AIM_YAW = 20 + DRIFT_YAW * 0.35
const AIM_PITCH_UP = 4 + 18 + DRIFT_PITCH * 0.35
const AIM_PITCH_DOWN = 4 - 18 - DRIFT_PITCH * 0.35

/** Margen deseado entre el ojo y el borde, en radios de la bola. */
export const FACE_MARGIN = 0.03

function driftCorners(base: FaceCase): FaceCase[] {
  const out: FaceCase[] = []
  for (const dy of [-1, 1]) {
    for (const dp of [-1, 1]) {
      for (const dr of [-1, 1]) {
        out.push({
          ...base,
          gaze: {
            yaw: base.gaze.yaw + dy * DRIFT_YAW,
            pitch: base.gaze.pitch + dp * DRIFT_PITCH,
            roll: base.gaze.roll + dr * DRIFT_ROLL,
          },
        })
      }
    }
  }
  return out
}

const eyePair = (w: number, h: number): [EyeCfg, EyeCfg] => [
  { w, h, open: 1 },
  { w, h, open: 1 },
]

/** Casos a cubrir: cada expresión con su deriva y siguiendo un objetivo, más las poses con cara. */
export function faceCases(): FaceCase[] {
  const cases: FaceCase[] = []
  for (const e of Object.values(EXPRESSIONS)) {
    const base: FaceCase = { gaze: e.gaze, split: e.split, eyes: e.eyes, valence: e.valence, ratio: 1 }
    cases.push(...driftCorners(base))
    for (const yaw of [-AIM_YAW, AIM_YAW]) {
      for (const pitch of [AIM_PITCH_DOWN, AIM_PITCH_UP]) cases.push({ ...base, gaze: { yaw, pitch, roll: e.gaze.roll } })
    }
  }
  // poses con cara propia (ver poses.ts): guiño, trabajando (cuerpo al 82 %) y aprobación
  cases.push(
    ...driftCorners({
      gaze: { yaw: -5.37, pitch: 4.55, roll: 6.7 },
      split: 16.25,
      eyes: [
        { w: 0.236, h: 0.464, open: 1 },
        { w: 0.447, h: 0.089, open: 1 },
      ],
      valence: 1,
      ratio: 1,
    }),
    ...driftCorners({ gaze: { yaw: 16, pitch: -14, roll: -4 }, split: 15.5, eyes: eyePair(0.18, 0.34), valence: 0, ratio: 0.82 }),
    ...driftCorners({ gaze: { yaw: -6, pitch: 3, roll: -5 }, split: 17, eyes: eyePair(0.24, 0.46), valence: 0, ratio: 1 }),
  )
  return cases
}

/** Contorno muestreado de un ojo estilizado, en su espacio local (unidades de radio). */
function outline(eye: StyledEye): Array<[number, number]> {
  const hw = eye.w / 2
  const hh = eye.h / 2
  const pts: Array<[number, number]> = []
  const N = 16
  if (eye.kind === 'ellipse') {
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2
      pts.push([Math.cos(a) * hw, Math.sin(a) * hh])
    }
    return pts
  }
  // cápsula (también cubre la medialuna, que cabe en su caja)
  const r = Math.min(hw, hh)
  const ax = hw - r
  const ay = hh - r
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * Math.PI * 2
    const cx = Math.cos(a) >= 0 ? ax : -ax
    const cy = Math.sin(a) >= 0 ? ay : -ay
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r])
  }
  return pts
}

/**
 * Margen mínimo (radial) de los dos ojos de un caso dentro de un perfil, para una cara dada.
 * Negativo = el ojo se sale.
 */
export function caseMargin(radii: readonly number[], fit: FaceFit, c: FaceCase, styleId: AvatarEyes): number {
  const style = EYE_STYLES[styleId]
  const poses = eyePoses(c.gaze, 1, c.split)
  let worst = Infinity
  for (let i = 0; i < 2; i++) {
    const e = poses[i]
    if (e.depth <= 0.02) continue
    const styled = styleEye(style, c.eyes[i], c.valence)
    const phi = (styled.tilt * Math.PI) / 180
    const cp = Math.cos(phi)
    const sp = Math.sin(phi)
    const ax = e.a * cp + e.c * sp
    const ay = e.b * cp + e.d * sp
    const bx = -e.a * sp + e.c * cp
    const by = -e.b * sp + e.d * cp
    const cx = (e.x * fit.s + fit.ox) * c.ratio
    const cy = (e.y * fit.s + fit.oy) * c.ratio
    for (const [qx, qy] of outline(styled)) {
      const px = cx + (qx * ax + qy * bx) * fit.s
      const py = cy + (qx * ay + qy * by) * fit.s
      const limit = radiusAtAngle(radii as number[], Math.atan2(py, px)) * c.ratio
      const m = limit - Math.hypot(px, py)
      if (m < worst) worst = m
    }
  }
  return worst
}

/** Margen exigido por caso y estilo: el deseado, o el del círculo si el círculo mismo tiene menos. */
export function referenceMargins(cases: FaceCase[]): number[][] {
  const circle = new Array<number>(PROFILE_SAMPLES).fill(1)
  const id: FaceFit = { s: 1, ox: 0, oy: 0 }
  return cases.map((c) => AVATAR_EYES.map((style) => Math.min(FACE_MARGIN, caseMargin(circle, id, c, style))))
}

/** Holgura mínima de una cara respecto de lo exigido (≥ 0 = cabe). */
export function fitSlack(radii: readonly number[], fit: FaceFit, cases: FaceCase[], required: number[][]): number {
  let worst = Infinity
  for (let k = 0; k < cases.length; k++) {
    for (let j = 0; j < AVATAR_EYES.length; j++) {
      const slack = caseMargin(radii, fit, cases[k], AVATAR_EYES[j]) - required[k][j]
      if (slack < worst) worst = slack
    }
  }
  return worst
}

function isSymmetric(radii: readonly number[]): boolean {
  const n = radii.length
  for (let i = 0; i < n; i++) if (Math.abs(radii[i] - radii[(n / 2 - i + n) % n]) > 0.004) return false
  return true
}

/**
 * Busca la cara más grande que cabe (búsqueda binaria en la escala, rejilla en el centro) y,
 * entre las que caben, la de mayor holgura. Solo para generar la tabla y para las pruebas.
 */
export function solveFaceFit(radii: readonly number[], cases = faceCases(), required = referenceMargins(cases)): FaceFit {
  const identity: FaceFit = { s: 1, ox: 0, oy: 0 }
  if (fitSlack(radii, identity, cases, required) >= 0) return identity
  const xs = isSymmetric(radii) ? [0] : Array.from({ length: 9 }, (_, i) => -0.12 + i * 0.03)
  const ys = Array.from({ length: 31 }, (_, i) => -0.2 + i * 0.02)
  // entre las caras que caben, la más cercana al centro (la cara de una forma no debe irse a
  // un borde solo porque ahí sobra un poco de margen)
  const best = (s: number): { fit: FaceFit; slack: number } | null => {
    let found: { fit: FaceFit; slack: number; dist: number } | null = null
    for (const ox of xs) {
      for (const oy of ys) {
        const fit = { s, ox, oy }
        const dist = ox * ox + oy * oy
        if (found && dist > found.dist + 1e-9) continue
        const slack = fitSlack(radii, fit, cases, required)
        if (slack < 0) continue
        if (!found || dist < found.dist - 1e-9 || slack > found.slack) found = { fit, slack, dist }
      }
    }
    return found
  }
  let lo = 0.5
  let hi = 1
  let winner = best(lo)
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2
    const r = best(mid)
    if (r) {
      lo = mid
      winner = r
    } else {
      hi = mid
    }
  }
  const fit = winner?.fit ?? { s: 0.5, ox: 0, oy: 0 }
  // la escala se redondea hacia abajo (lo seguro); el centro, a 0,005
  return { s: Math.floor(fit.s * 100) / 100, ox: Math.round(fit.ox * 200) / 200, oy: Math.round(fit.oy * 200) / 200 }
}
