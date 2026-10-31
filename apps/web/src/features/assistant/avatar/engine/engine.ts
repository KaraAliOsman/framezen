/*
 * Adaptado de bloub (https://github.com/jeremy-prt/bloub)
 * Copyright (c) 2026 Jérémy Perret — Licencia MIT (ver THIRD_PARTY_NOTICES.md)
 * Modificaciones (c) 2026 Framezen: sin formas personalizadas ni tabla de ajuste de
 * ojos, pastilla con color, ojos opacos (no agujeros), escala de ojos para tamaños
 * chicos, desfase de vida por instancia y modo de movimiento reducido.
 */
import { arcRender, type ArcRender } from './decor'
import { EXPRESSIONS, blendExpression, type Expression, type ExpressionId } from './expressions'
import { blinkScale, eyePoses, liveliness, type EyeCfg, type EyePose } from './face'
import { NO_LOOK, type Look } from './gaze'
import { clamp, easings, lerp, r2 } from './math'
import { POSES, blendPose, type Pose, type PoseDef, type PoseId } from './poses'
import { capsulePath, closedPath, radiusAtAngle, toPoints, type Point } from './shape'

/** Radio de la bola en reposo, en unidades de viewBox. Todo lo demás es fracción de él. */
export const RADIUS = 100
/**
 * Semilado del viewBox. La bola ocupa el 89 % de la caja (bloub usaba 158 = 63 %, que
 * achica demasiado un avatar de 36 px); los anillos de Marco llegan a ~1,10 R y caben.
 */
export const HALF_VIEWBOX = 112

/** Duración del parpadeo forzado que esconde un cambio de forma. */
const FORCED_BLINK = 0.2

export interface RenderedEye {
  d: string
  transform: string
  alpha: number
}

export interface RenderedDot {
  x: number
  y: number
  r: number
  opacity: number
}

export interface RenderedPill {
  x: number
  y: number
  r: number
  color: string
}

/** Un frame listo para pintar, en unidades de viewBox. */
export interface MarcoFrame {
  body: string
  eyes: RenderedEye[]
  dots: RenderedDot[]
  arcs: ArcRender[]
  pill: RenderedPill | null
  notch: { x: number; y: number; r: number } | null
}

export interface MarcoEngineOptions {
  /** radio de la bola en unidades de viewBox (por defecto 100) */
  scale?: number
  pose?: PoseId
  expression?: ExpressionId
  /** desfase (s) del calendario de vida: dos Marcos en pantalla no parpadean a la vez */
  lifeOffset?: number
  reducedMotion?: boolean
  /** agranda los ojos (no su posición) para que se lean en tamaños chicos */
  eyeScale?: number
}

const lerpLook = (a: Look, b: Look, t: number): Look => ({
  yaw: lerp(a.yaw, b.yaw, t),
  pitch: lerp(a.pitch, b.pitch, t),
  mix: lerp(a.mix, b.mix, t),
  spin: lerp(a.spin, b.spin, t),
  wander: lerp(a.wander, b.wander, t),
})

/**
 * Matriz SVG de un ojo: marco tangente de la esfera × inclinación propia, y después el
 * parpadeo como aplastamiento vertical en pantalla.
 */
export function eyeTransform(e: EyePose, cfg: EyeCfg, lid: number, x: number, y: number): string {
  const phi = ((cfg.tilt ?? 0) * Math.PI) / 180
  const cp = Math.cos(phi)
  const sp = Math.sin(phi)
  const ax = e.a * cp + e.c * sp
  const ay = e.b * cp + e.d * sp
  const cx = -e.a * sp + e.c * cp
  const cy = -e.b * sp + e.d * cp
  const k = blinkScale(Math.min(lid, cfg.open))
  return `matrix(${r2(ax)},${r2(ay * k)},${r2(cx)},${r2(cy * k)},${r2(x)},${r2(y)})`
}

/**
 * Motor sin reloj: `sample(t)` es una función pura del tiempo. Pausar, reanudar o
 * saltar a cualquier instante da exactamente la misma imagen, y se prueba sin DOM.
 * El estado externo entra solo por setters fechados.
 */
export class MarcoEngine {
  readonly scale: number

  static readonly EXPRESSION_MORPH = 0.45
  /**
   * Rapidez con que la mirada alcanza su objetivo. Como el objetivo se re-apunta en cada
   * frame, esta duración da la inercia: la mirada nunca alcanza del todo un cursor que se
   * mueve, y por eso se siente atenta y no mecánica.
   */
  static readonly LOOK_MORPH = 0.24

  private cur: PoseId
  private prev: PoseId | null = null
  /** pose compuesta congelada cuando un cambio llega a mitad de un fundido */
  private frozen: Pose | null = null
  private tCur = 0
  private tPrev = 0
  private blinkAt = -10
  private expr: Expression
  private exprPrev: Expression | null = null
  private exprAt = -10
  private look: Look = NO_LOOK
  private lookPrev: Look = NO_LOOK
  private lookSince = -10
  private lookMorph = MarcoEngine.LOOK_MORPH
  private reduced: boolean
  private readonly lifeOffset: number
  private eyeScale: number
  private readonly pts: Point[] = []

  constructor(options: MarcoEngineOptions = {}) {
    this.scale = options.scale ?? RADIUS
    this.cur = options.pose ?? 'rest'
    this.expr = EXPRESSIONS[options.expression ?? 'attentive']
    this.lifeOffset = options.lifeOffset ?? 0
    this.reduced = options.reducedMotion ?? false
    this.eyeScale = options.eyeScale ?? 1
  }

  get pose(): PoseId {
    return this.cur
  }

  get expression(): ExpressionId {
    return this.expr.id
  }

  get reducedMotion(): boolean {
    return this.reduced
  }

  /** Movimiento reducido: poses quietas, sin fundidos, sin deriva y parpadeo mínimo. */
  setReducedMotion(on: boolean): void {
    this.reduced = on
  }

  setEyeScale(scale: number): void {
    if (Number.isFinite(scale) && scale > 0) this.eyeScale = scale
  }

  /**
   * Coloca a Marco en una pose y expresión SIN historial, como un motor recién creado
   * en ellas: al montar ya está en su estado, sin fundirse desde el reposo.
   */
  reset(pose: PoseId, expression: ExpressionId | undefined, now: number): void {
    this.cur = pose
    this.prev = null
    this.frozen = null
    this.tCur = now
    this.tPrev = now
    this.blinkAt = -10
    if (expression) this.expr = EXPRESSIONS[expression]
    this.exprPrev = null
    this.exprAt = -10
  }

  setExpression(id: ExpressionId, now: number): void {
    const next = EXPRESSIONS[id]
    if (next === this.expr) return
    // parte de la cara visible en este instante, no de la anterior meta
    this.exprPrev = this.exprAtTime(now)
    this.expr = next
    this.exprAt = now
  }

  private exprAtTime(now: number): Expression {
    const to = this.expr
    const from = this.exprPrev
    if (!from || this.reduced) return to
    const k = (now - this.exprAt) / MarcoEngine.EXPRESSION_MORPH
    if (k >= 1) return to
    return blendExpression(from, to, easings.easeOutQuint(clamp(k)))
  }

  /**
   * Nueva mirada externa (null = volver a la de la pose). Parte del valor ACTUAL, no de
   * la meta anterior: se llama en cada frame y si partiera de la meta vieja la mirada
   * temblaría. Rechaza valores no finitos: un NaN guardado una vez dejaría a Marco con la
   * mirada rota para siempre.
   */
  setLook(look: Look | null, now: number, morph = MarcoEngine.LOOK_MORPH): void {
    if (look && !Number.isFinite(look.yaw + look.pitch + look.mix + look.spin + look.wander)) return
    if (!Number.isFinite(now)) return
    this.lookPrev = this.lookAtTime(now)
    this.look = look ?? NO_LOOK
    this.lookSince = now
    this.lookMorph = Math.max(morph, 1 / 240)
  }

  /** Mirada efectiva en `now`, persecución en curso incluida. */
  lookAtTime(now: number): Look {
    const k = (now - this.lookSince) / this.lookMorph
    if (k >= 1) return this.look
    return lerpLook(this.lookPrev, this.look, easings.easeOutQuint(clamp(k)))
  }

  /**
   * Cambio de pose, fechado. Si llega durante un fundido se congela la pose compuesta
   * actual y se funde desde ella (continuo, sin saltos). Solo en ese caso: fuera de un
   * fundido la pose saliente ya es exactamente lo que se ve.
   */
  setPose(id: PoseId, now: number): void {
    if (id === this.cur) return
    const midBlend = this.prev !== null && now - this.tCur < this.morphOf(POSES[this.cur])
    this.frozen = midBlend ? this.composed(now) : null
    this.prev = this.cur
    this.tPrev = this.tCur
    this.cur = id
    this.tCur = now
    // todo cambio de forma se esconde tras un parpadeo
    if (POSES[id].blinkIn) this.blinkAt = now
  }

  private morphOf(def: PoseDef): number {
    return this.reduced ? 0 : def.morph
  }

  private posed(def: PoseDef, local: number, expr: Expression): Pose {
    const pose = def.pose(this.reduced ? def.still : local, this.reduced)
    return def.baseFace ? { ...pose, gaze: expr.gaze, split: expr.split, eyes: expr.eyes } : pose
  }

  private origin(now: number, expr: Expression): Pose | null {
    if (this.frozen) return this.frozen
    if (!this.prev) return null
    return this.posed(POSES[this.prev], Math.max(0, now - this.tPrev), expr)
  }

  /** Pose compuesta en `now` (fundido incluido), antes de la capa de vida y mirada. */
  private composed(now: number): Pose {
    const def = POSES[this.cur]
    const expr = this.exprAtTime(now)
    const since = now - this.tCur
    const pose = this.posed(def, Math.max(0, since), expr)
    const morph = this.morphOf(def)
    if (since >= morph) return pose
    const origin = this.origin(now, expr)
    if (!origin) return pose
    // el ratio se acota: leer un instante ANTERIOR al cambio muestra la pose saliente
    return blendPose(origin, pose, morph > 0 ? easings.easeOutQuint(clamp(since / morph)) : 0)
  }

  sample(now: number): MarcoFrame {
    const R = this.scale
    const pose = this.composed(now)

    // --- vida en reposo y mirada ----------------------------------------------
    const alive = pose.eyeAlpha > 0.01
    const look = this.lookAtTime(now)
    const life = liveliness(now + this.lifeOffset, {
      wander: alive && !this.reduced ? look.wander : 0,
      blink: !alive ? 'off' : this.reduced ? 'minimal' : 'full',
      float: !this.reduced,
    })
    const gaze = {
      // la deriva se suma DESPUÉS de mezclar: sobrevive a una cabeza girada sin cursor
      yaw: lerp(pose.gaze.yaw, look.yaw, look.mix) + life.dYaw - look.spin,
      pitch: lerp(pose.gaze.pitch, look.pitch, look.mix) + life.dPitch,
      // el alabeo no sigue al cursor: la inclinación es parte de la expresión
      roll: pose.gaze.roll + life.dRoll,
    }
    const forced = clamp((now - this.blinkAt) / FORCED_BLINK)
    const lid = Math.min(life.lid, forced < 1 ? Math.abs(forced * 2 - 1) : 1)
    const offX = pose.sil.cx + life.driftX
    const offY = pose.sil.cy + life.driftY

    // --- cuerpo ----------------------------------------------------------------
    const body = closedPath(toPoints({ ...pose.sil, cx: offX, cy: offY, sy: pose.sil.sy * life.breath }, R, this.pts))

    // --- ojos ------------------------------------------------------------------
    // viven en una esfera de radio 1; si la silueta se achica, se acercan al centro
    const eyes: RenderedEye[] = []
    if (alive) {
      const poses = eyePoses(gaze, R, pose.split)
      for (let i = 0; i < 2; i++) {
        const e = poses[i]
        if (e.depth <= 0.02) continue
        const cfg = pose.eyes[i]
        const fit = radiusAtAngle(pose.sil.radii, Math.atan2(e.y, e.x) - pose.sil.rot)
        eyes.push({
          d: capsulePath(cfg.w * this.eyeScale * R, cfg.h * this.eyeScale * R),
          transform: eyeTransform(e, cfg, lid, e.x * fit + offX * R, e.y * fit + offY * R),
          // se desvanecen al pasar detrás del limbo de la esfera
          alpha: r2(pose.eyeAlpha * clamp(e.depth / 0.12)),
        })
      }
    }

    // --- decoración --------------------------------------------------------------
    const dots: RenderedDot[] = []
    for (const p of pose.dots) {
      if (p.opacity <= 0.01 || p.r <= 0.0005) continue
      dots.push({
        x: r2((p.x + life.driftX) * R),
        y: r2((p.y + life.driftY) * R),
        r: r2(p.r * R),
        opacity: r2(p.opacity),
      })
    }

    let pill: RenderedPill | null = null
    let notch: MarcoFrame['notch'] = null
    if (pose.pill && pose.pill.r > 0.001) {
      // la pastilla va sobre el contorno: sigue a la silueta si cambia de tamaño
      const fit = radiusAtAngle(pose.sil.radii, Math.atan2(pose.pill.y, pose.pill.x) - pose.sil.rot)
      const x = r2((pose.pill.x * fit + offX) * R)
      const y = r2((pose.pill.y * fit + offY) * R)
      pill = { x, y, r: r2(pose.pill.r * R), color: pose.pill.color }
      notch = { x, y, r: r2(pose.pill.notch * R) }
    }

    const arcs: ArcRender[] = []
    for (const a of pose.arcs) {
      if (a.opacity > 0.01) arcs.push(arcRender(a.seed, a.t, R, a.ring, r2(a.opacity)))
    }

    return { body, eyes, dots, arcs, pill, notch }
  }
}
