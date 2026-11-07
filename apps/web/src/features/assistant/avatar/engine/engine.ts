/*
 * Adaptado de bloub (https://github.com/jeremy-prt/bloub)
 * Copyright (c) 2026 Jérémy Perret — Licencia MIT (ver THIRD_PARTY_NOTICES.md)
 * Modificaciones (c) 2026 DEKOPEN: diseño por avatar (forma, estilo de ojo, accesorio y
 * perfil de movimiento) con fundidos entre diseños, cara ajustada a cada forma por tabla,
 * paño de ventana, anclas de accesorios sobre el contorno real, pastilla con color, ojos
 * opacos (no agujeros), escala de ojos para tamaños chicos, gestos en reposo deterministas,
 * desfase de vida por instancia y modo de movimiento reducido.
 */
import { DEFAULT_AVATAR, type AvatarAccessory, type AvatarEyes, type AvatarMotion, type AvatarShape } from '@dekopen/shared'
import { accessoryDef, type AccessoryDef } from './accessories'
import { RINGS, arcRender, type ArcRender } from './decor'
import { EXPRESSIONS, blendExpression, type Expression, type ExpressionId } from './expressions'
import { EYE_STYLES, blendStyled, eyeShapePath, styleEye, type EyeStyleDef } from './eyes'
import { blinkScale, eyePoses, liveliness, type EyeCfg, type EyePose } from './face'
import type { FaceFit } from './facefit-table'
import { NO_LOOK, type Look } from './gaze'
import { TAU, clamp, easings, lerp, r2 } from './math'
import { FIDGETS, fidgetAt, motionProfile, type FidgetKind, type MotionProfile } from './motion'
import { POSES, blendPose, type Pose, type PoseCtx, type PoseDef, type PoseId } from './poses'
import { PROFILE_SAMPLES, closedPath, radiusAtAngle, sampleAngle, toPoints, type Point, type Silhouette } from './shape'
import { shapeDef, type ShapeDef } from './shapes'

/** Radio de la bola en reposo, en unidades de viewBox. Todo lo demás es fracción de él. */
export const RADIUS = 100
/**
 * Semilado del viewBox. La bola ocupa el 89 % de la caja (bloub usaba 158 = 63 %, que achica
 * demasiado un avatar de 36 px); los anillos llegan a ~1,10 R y caben.
 */
export const HALF_VIEWBOX = 112

/** Duración del parpadeo forzado que esconde un cambio de forma. */
const FORCED_BLINK = 0.2
/** Fundido entre dos formas o dos estilos de ojo (diseñador). */
const DESIGN_MORPH = 0.5
/** Entrada de un accesorio nuevo. */
const ACCESSORY_FADE = 0.25

export interface AvatarDesign {
  shape: AvatarShape
  eyes: AvatarEyes
  motion: AvatarMotion
  accessory: AvatarAccessory
}

export const DEFAULT_DESIGN: AvatarDesign = {
  shape: DEFAULT_AVATAR.shape,
  eyes: DEFAULT_AVATAR.eyes,
  motion: DEFAULT_AVATAR.motion,
  accessory: DEFAULT_AVATAR.accessory,
}

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
  tone: 'body' | 'accent'
}

export interface RenderedPill {
  x: number
  y: number
  r: number
  color: string
}

/** Transformación que lleva un dibujo hecho para la forma en reposo (R = 100) al cuerpo actual. */
export interface BodyTransform {
  x: number
  y: number
  /** grados */
  rot: number
  sx: number
  sy: number
}

/** Pieza de accesorio ya ubicada (unidades de viewBox; rotación en grados). */
export interface RenderedPart extends BodyTransform {
  opacity: number
}

/** Ojo para los lentes: centro y matriz tangente (sin parpadeo ni inclinación propia). */
export interface FaceAnchor {
  x: number
  y: number
  a: number
  b: number
  c: number
  d: number
  /** visibilidad por profundidad en la esfera */
  alpha: number
}

/** Un frame listo para pintar, en unidades de viewBox. */
export interface AvatarFrame {
  body: string
  /** alféizar (forma «window»): 0 mientras la pose no muestra la silueta */
  sillOpacity: number
  /** cuerpo en reposo → cuerpo actual, para el travesaño y la manilla de la ventana */
  local: BodyTransform
  eyes: RenderedEye[]
  /** dónde van los lentes (null si el accesorio no es de cara o no se ve) */
  face: { eyes: [FaceAnchor, FaceAnchor]; rim: number; opacity: number } | null
  /** piezas del accesorio, en el orden de `ACCESSORIES[id].parts` */
  parts: RenderedPart[]
  dots: RenderedDot[]
  arcs: ArcRender[]
  pill: RenderedPill | null
  notch: { x: number; y: number; r: number } | null
}

/** Nombre heredado (v4). */
export type MarcoFrame = AvatarFrame

export interface AvatarEngineOptions {
  /** radio de la bola en unidades de viewBox (por defecto 100) */
  scale?: number
  pose?: PoseId
  expression?: ExpressionId
  /** desfase (s) del calendario de vida: dos avatares en pantalla no parpadean a la vez */
  lifeOffset?: number
  reducedMotion?: boolean
  /** agranda los ojos (no su posición) para que se lean en tamaños chicos */
  eyeScale?: number
  design?: Partial<AvatarDesign>
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

/** Forma vista en un instante (posiblemente a mitad de un fundido entre dos formas). */
interface ShapeState {
  radii: number[]
  face: FaceFit
  sillWeight: number
  wobble: number
}

function shapeState(def: ShapeDef): ShapeState {
  return { radii: def.radii, face: def.face, sillWeight: def.sill ? 1 : 0, wobble: def.wobble ? 1 : 0 }
}

function blendShapeState(a: ShapeState, b: ShapeState, t: number): ShapeState {
  const radii = new Array<number>(PROFILE_SAMPLES)
  for (let i = 0; i < PROFILE_SAMPLES; i++) radii[i] = lerp(a.radii[i], b.radii[i], t)
  return {
    radii,
    face: { s: lerp(a.face.s, b.face.s, t), ox: lerp(a.face.ox, b.face.ox, t), oy: lerp(a.face.oy, b.face.oy, t) },
    sillWeight: lerp(a.sillWeight, b.sillWeight, t),
    wobble: lerp(a.wobble, b.wobble, t),
  }
}

/** Expresiones de los gestos en reposo. */
const FIDGET_FACES: Record<FidgetKind, Expression> = {
  curious: EXPRESSIONS.curious,
  happy: EXPRESSIONS.happy,
  proud: EXPRESSIONS.proud,
  glanceLeft: { ...EXPRESSIONS.attentive, gaze: { yaw: -21, pitch: 3, roll: -2 } },
  glanceRight: { ...EXPRESSIONS.attentive, gaze: { yaw: 22, pitch: 6, roll: -5 } },
}

/**
 * Motor sin reloj: `sample(t)` es una función pura del tiempo. Pausar, reanudar o saltar a
 * cualquier instante da exactamente la misma imagen, y se prueba sin DOM. El estado externo
 * entra solo por setters fechados.
 */
export class AvatarEngine {
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
  private lookMorph = AvatarEngine.LOOK_MORPH
  private reduced: boolean
  private readonly lifeOffset: number
  private eyeScale: number
  private readonly pts: Point[] = []

  private design: AvatarDesign
  private shape: ShapeState
  private shapeFrom: ShapeState | null = null
  private shapeAt = -10
  private eyeStyle: EyeStyleDef
  private eyeStyleFrom: EyeStyleDef | null = null
  private eyeStyleAt = -10
  private motion: MotionProfile
  private accessory: AccessoryDef
  private accessoryAt = -10
  private fidgets = false

  constructor(options: AvatarEngineOptions = {}) {
    this.scale = options.scale ?? RADIUS
    this.cur = options.pose ?? 'rest'
    this.expr = EXPRESSIONS[options.expression ?? 'attentive']
    this.lifeOffset = options.lifeOffset ?? 0
    this.reduced = options.reducedMotion ?? false
    this.eyeScale = options.eyeScale ?? 1
    this.design = { ...DEFAULT_DESIGN, ...options.design }
    this.shape = shapeState(shapeDef(this.design.shape))
    this.eyeStyle = EYE_STYLES[this.design.eyes] ?? EYE_STYLES.capsule
    this.motion = motionProfile(this.design.motion)
    this.accessory = accessoryDef(this.design.accessory)
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

  get currentDesign(): AvatarDesign {
    return this.design
  }

  get motionProfile(): MotionProfile {
    return this.motion
  }

  /** Movimiento reducido: poses quietas, sin fundidos, sin deriva y parpadeo mínimo. */
  setReducedMotion(on: boolean): void {
    this.reduced = on
  }

  setEyeScale(scale: number): void {
    if (Number.isFinite(scale) && scale > 0) this.eyeScale = scale
  }

  /** Gestos espontáneos en reposo (los enciende el director solo en «idle»). */
  setFidgets(on: boolean): void {
    this.fidgets = on
  }

  /**
   * Cambia el diseño. Forma y estilo de ojo se funden (con un parpadeo que esconde el cambio);
   * el perfil de movimiento se aplica al instante; un accesorio nuevo entra con un fundido.
   */
  setDesign(next: Partial<AvatarDesign>, now: number): void {
    const design = { ...this.design, ...next }
    if (design.shape !== this.design.shape) {
      this.shapeFrom = this.shapeAtTime(now)
      this.shape = shapeState(shapeDef(design.shape))
      this.shapeAt = now
      this.blinkAt = now
    }
    if (design.eyes !== this.design.eyes) {
      this.eyeStyleFrom = this.eyeStyle
      this.eyeStyle = EYE_STYLES[design.eyes] ?? EYE_STYLES.capsule
      this.eyeStyleAt = now
      this.blinkAt = now
    }
    if (design.motion !== this.design.motion) this.motion = motionProfile(design.motion)
    if (design.accessory !== this.design.accessory) {
      this.accessory = accessoryDef(design.accessory)
      this.accessoryAt = now
    }
    this.design = design
  }

  /**
   * Coloca al avatar en una pose y expresión SIN historial, como un motor recién creado en
   * ellas: al montar ya está en su estado, sin fundirse desde el reposo.
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
    this.shapeFrom = null
    this.eyeStyleFrom = null
    this.accessoryAt = -10
  }

  setExpression(id: ExpressionId, now: number): void {
    const next = EXPRESSIONS[id]
    if (!next || next === this.expr) return
    // parte de la cara visible en este instante, no de la anterior meta
    this.exprPrev = this.exprAtTime(now)
    this.expr = next
    this.exprAt = now
  }

  private morphScale(): number {
    return this.motion.morph
  }

  private exprAtTime(now: number): Expression {
    const to = this.expr
    const from = this.exprPrev
    let face = to
    if (from && !this.reduced) {
      const k = (now - this.exprAt) / (AvatarEngine.EXPRESSION_MORPH * this.morphScale())
      if (k < 1) face = blendExpression(from, to, easings.easeOutQuint(clamp(k)))
    }
    if (this.fidgets && this.motion.fidgets && !this.reduced) {
      const f = fidgetAt(now * this.motion.lifeRate + this.lifeOffset, FIDGETS[this.motion.id === 'lively' ? 'lively' : 'calm'])
      if (f) {
        // un gesto nunca le gana a una mirada que sigue algo
        const w = f.weight * (1 - this.lookAtTime(now).mix)
        if (w > 0.001) face = blendExpression(face, { ...FIDGET_FACES[f.kind], id: face.id }, w)
      }
    }
    return face
  }

  private shapeAtTime(now: number): ShapeState {
    const from = this.shapeFrom
    if (!from || this.reduced) return this.shape
    const k = (now - this.shapeAt) / (DESIGN_MORPH * this.morphScale())
    if (k >= 1) return this.shape
    return blendShapeState(from, this.shape, easings.easeOutQuint(clamp(k)))
  }

  /**
   * Nueva mirada externa (null = volver a la de la pose). Parte del valor ACTUAL, no de la
   * meta anterior: se llama en cada frame y si partiera de la meta vieja la mirada temblaría.
   * Rechaza valores no finitos: un NaN guardado una vez dejaría la mirada rota para siempre.
   */
  setLook(look: Look | null, now: number, morph = AvatarEngine.LOOK_MORPH): void {
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
   * Cambio de pose, fechado. Si llega durante un fundido se congela la pose compuesta actual y
   * se funde desde ella (continuo, sin saltos). Solo en ese caso: fuera de un fundido la pose
   * saliente ya es exactamente lo que se ve.
   */
  setPose(id: PoseId, now: number): void {
    if (id === this.cur) return
    const midBlend = this.prev !== null && now - this.tCur < this.morphOf(POSES[this.cur])
    this.frozen = midBlend ? this.composed(now, this.ctxAt(now)) : null
    this.prev = this.cur
    this.tPrev = this.tCur
    this.cur = id
    this.tCur = now
    // todo cambio de forma se esconde tras un parpadeo
    if (POSES[id].blinkIn) this.blinkAt = now
  }

  private morphOf(def: PoseDef): number {
    return this.reduced ? 0 : def.morph * this.morphScale()
  }

  /** Contexto de las poses en `now`: la forma (con su fundido y su ondular) y el movimiento. */
  private ctxAt(now: number): PoseCtx {
    const shape = this.shapeAtTime(now)
    const wobble = this.reduced ? 0 : shape.wobble
    return {
      motion: this.motion,
      body: (scale = 1, over = {}): Silhouette => {
        const radii = new Array<number>(PROFILE_SAMPLES)
        for (let i = 0; i < PROFILE_SAMPLES; i++) {
          let r = shape.radii[i] * scale
          if (wobble > 0) {
            const a = sampleAngle(i)
            r *= 1 + wobble * (0.016 * Math.sin(2 * a + now * 0.8) + 0.011 * Math.sin(3 * a - now * 0.57 + 1))
          }
          radii[i] = r
        }
        return { radii, rot: 0, cx: 0, cy: 0, sx: 1, sy: 1, ...over }
      },
    }
  }

  private posed(def: PoseDef, local: number, expr: Expression, ctx: PoseCtx): Pose {
    const pose = def.pose(this.reduced ? def.still : local, this.reduced, ctx)
    return def.baseFace ? { ...pose, gaze: expr.gaze, split: expr.split, eyes: expr.eyes, valence: expr.valence } : pose
  }

  private origin(now: number, expr: Expression, ctx: PoseCtx): Pose | null {
    if (this.frozen) return this.frozen
    if (!this.prev) return null
    return this.posed(POSES[this.prev], Math.max(0, now - this.tPrev), expr, ctx)
  }

  /** Pose compuesta en `now` (fundido incluido), antes de la capa de vida y mirada. */
  private composed(now: number, ctx: PoseCtx): Pose {
    const def = POSES[this.cur]
    const expr = this.exprAtTime(now)
    const since = now - this.tCur
    const pose = this.posed(def, Math.max(0, since), expr, ctx)
    const morph = this.morphOf(def)
    if (since >= morph) return pose
    const origin = this.origin(now, expr, ctx)
    if (!origin) return pose
    // el ratio se acota: leer un instante ANTERIOR al cambio muestra la pose saliente
    return blendPose(origin, pose, morph > 0 ? easings.easeOutQuint(clamp(since / morph)) : 0)
  }

  private styledAt(now: number, cfg: EyeCfg, valence: number) {
    const styled = styleEye(this.eyeStyle, cfg, valence)
    const from = this.eyeStyleFrom
    if (!from || this.reduced) return styled
    const k = (now - this.eyeStyleAt) / (DESIGN_MORPH * this.morphScale())
    if (k >= 1) return styled
    return blendStyled(styleEye(from, cfg, valence), styled, easings.easeOutQuint(clamp(k)))
  }

  sample(now: number): AvatarFrame {
    const R = this.scale
    const ctx = this.ctxAt(now)
    const shape = this.shapeAtTime(now)
    const pose = this.composed(now, ctx)

    // --- vida en reposo y mirada --------------------------------------------
    const alive = pose.eyeAlpha > 0.01
    const look = this.lookAtTime(now)
    const motion = this.motion
    const life = liveliness(now * motion.lifeRate + this.lifeOffset, {
      wander: alive && !this.reduced ? look.wander * motion.wander : 0,
      blink: !alive ? 'off' : this.reduced ? 'minimal' : 'full',
      float: !this.reduced && motion.float,
    })
    const gaze = {
      // la deriva se suma DESPUÉS de mezclar: sobrevive a una cabeza girada sin cursor
      yaw: lerp(pose.gaze.yaw, look.yaw, look.mix) + life.dYaw - look.spin - pose.spin,
      pitch: lerp(pose.gaze.pitch, look.pitch, look.mix) + life.dPitch + pose.nod,
      // el alabeo no sigue al cursor: la inclinación es parte de la expresión
      roll: pose.gaze.roll + life.dRoll,
    }
    const forced = clamp((now - this.blinkAt) / FORCED_BLINK)
    const lid = Math.min(life.lid, forced < 1 ? Math.abs(forced * 2 - 1) : 1)
    const offX = pose.sil.cx + life.driftX
    const offY = pose.sil.cy + life.driftY
    const sy = pose.sil.sy * life.breath

    // --- cuerpo ----------------------------------------------------------------
    const sil = { ...pose.sil, cx: offX, cy: offY, sy }
    const body = closedPath(toPoints(sil, R, this.pts))

    // tamaño del cuerpo respecto de su forma en reposo (trabajando = 0,82)
    let ratioSum = 0
    for (let i = 0; i < PROFILE_SAMPLES; i++) ratioSum += pose.sil.radii[i] / Math.max(shape.radii[i], 1e-6)
    const bodyScale = ratioSum / PROFILE_SAMPLES
    const local: BodyTransform = {
      x: r2(offX * R),
      y: r2(offY * R),
      rot: r2((pose.sil.rot * 180) / Math.PI),
      sx: r2(pose.sil.sx * bodyScale * 1000) / 1000,
      sy: r2(sy * bodyScale * 1000) / 1000,
    }

    const sillOpacity = r2(shape.sillWeight * pose.decor)

    // --- ojos ------------------------------------------------------------------
    const face = shape.face
    const eyes: RenderedEye[] = []
    const anchors: FaceAnchor[] = []
    const wantsFace = this.accessory.face !== null
    if (alive) {
      const poses = eyePoses(gaze, 1, pose.split)
      for (let i = 0; i < 2; i++) {
        const e = poses[i]
        const ux = e.x * face.s + face.ox
        const uy = e.y * face.s + face.oy
        // la cara acompaña al cuerpo cuando éste se encoge (pro rata del radio en esa dirección)
        const dir = Math.atan2(uy, ux) - pose.sil.rot
        const ratio = radiusAtAngle(pose.sil.radii, dir) / Math.max(radiusAtAngle(shape.radii, dir), 1e-6)
        const x = (ux * ratio + offX) * R
        const y = (uy * ratio + offY) * R
        const depthAlpha = clamp(e.depth / 0.12)
        if (wantsFace) {
          anchors.push({
            x: r2(x),
            y: r2(y),
            a: r2(e.a * face.s * 1000) / 1000,
            b: r2(e.b * face.s * 1000) / 1000,
            c: r2(e.c * face.s * 1000) / 1000,
            d: r2(e.d * face.s * 1000) / 1000,
            alpha: e.depth > 0.02 ? r2(depthAlpha) : 0,
          })
        }
        if (e.depth <= 0.02) continue
        const styled = this.styledAt(now, pose.eyes[i], pose.valence)
        eyes.push({
          d: eyeShapePath(styled, this.eyeScale * face.s * R),
          transform: eyeTransform(e, { w: styled.w, h: styled.h, open: styled.open, tilt: styled.tilt }, lid, x, y),
          // se desvanecen al pasar detrás del limbo de la esfera
          alpha: r2(pose.eyeAlpha * depthAlpha),
        })
      }
    }

    let faceOut: AvatarFrame['face'] = null
    if (wantsFace && anchors.length === 2) {
      const opacity = r2(pose.eyeAlpha * pose.decor)
      if (opacity > 0.01) {
        const st = this.eyeStyle
        const rim = (Math.max(st.w, st.h * 0.82) / 2 + 0.08) * this.eyeScale * R
        faceOut = { eyes: [anchors[0], anchors[1]], rim: r2(rim), opacity }
      }
    }

    // --- accesorio ---------------------------------------------------------------
    const parts: RenderedPart[] = []
    if (this.accessory.parts.length) {
      const fadeIn = this.reduced ? 1 : clamp((now - this.accessoryAt) / ACCESSORY_FADE)
      const opacity = r2(pose.decor * fadeIn)
      const halfWidth = (radiusAtAngle(pose.sil.radii, -pose.sil.rot) + radiusAtAngle(pose.sil.radii, Math.PI - pose.sil.rot)) / 2
      for (const part of this.accessory.parts) {
        const theta = (part.anchor * Math.PI) / 180
        const r = radiusAtAngle(pose.sil.radii, theta - pose.sil.rot) + part.out * bodyScale
        let px = Math.cos(theta) * r * pose.sil.sx
        let py = Math.sin(theta) * r * sy
        // acompaña el alabeo de la cabeza (gira alrededor del centro) y un poco el giro
        const psi = ((gaze.roll * part.follow) * Math.PI) / 180
        const cs = Math.cos(psi)
        const sn = Math.sin(psi)
        const rx = px * cs - py * sn + part.follow * Math.sin((gaze.yaw * Math.PI) / 180) * 0.12
        const ry = px * sn + py * cs
        px = rx
        py = ry
        const k = part.spanX ? halfWidth : bodyScale
        parts.push({
          x: r2((px + offX) * R),
          y: r2((py + offY) * R),
          rot: r2((psi * 180) / Math.PI),
          sx: r2(k * pose.sil.sx * 1000) / 1000,
          sy: r2(bodyScale * sy * 1000) / 1000,
          opacity,
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
        tone: p.tone ?? 'body',
      })
    }

    let pill: RenderedPill | null = null
    let notch: AvatarFrame['notch'] = null
    if (pose.pill && pose.pill.r > 0.001) {
      // la pastilla va sobre el contorno: sigue a la silueta si cambia de tamaño o de forma
      const angle = Math.atan2(pose.pill.y, pose.pill.x)
      const fit = radiusAtAngle(pose.sil.radii, angle - pose.sil.rot)
      const x = r2((pose.pill.x * fit + offX) * R)
      const y = r2((pose.pill.y * fit + offY) * R)
      pill = { x, y, r: r2(pose.pill.r * R), color: pose.pill.color }
      notch = { x, y, r: r2(pose.pill.notch * R) }
    }

    const arcs: ArcRender[] = []
    for (const a of pose.arcs) {
      const seed = RINGS[a.ring]
      if (seed && a.opacity > 0.01) arcs.push(arcRender(seed, a.t, R, a.ring, r2(a.opacity), this.reduced ? 1 : a.speed ?? 1))
    }

    return { body, sillOpacity, local, eyes, face: faceOut, parts, dots, arcs, pill, notch }
  }
}

/** Nombre heredado (v4): el motor de Marco es el motor de todos los avatares. */
export { AvatarEngine as MarcoEngine }
export type MarcoEngineOptions = AvatarEngineOptions

/** Vuelta completa en radianes (reexport práctico para las pruebas). */
export const FULL_TURN = TAU
