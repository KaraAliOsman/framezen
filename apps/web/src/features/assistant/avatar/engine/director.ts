/*
 * Director de estados del avatar (DEKOPEN). Diseño propio; maneja el motor adaptado de bloub
 * (MIT, ver THIRD_PARTY_NOTICES.md).
 *
 * TS puro y sin setTimeout: todo avanza con el reloj de escena que recibe `advance`, así que
 * es determinista y se prueba igual que el motor.
 */
import type { AvatarEngine } from './engine'
import type { ExpressionId } from './expressions'
import { ENGAGE_TIME, RELEASE_MORPH, SHAKE_TIME, aimLook, shakeLook, type Aim } from './gaze'
import { clamp, easings } from './math'
import type { PoseId } from './poses'

/**
 * Estados visibles del avatar. Los siete primeros son los de Marco (v4) y siguen igual; el
 * resto es nuevo en v5.
 */
export const AVATAR_STATES = [
  'idle',
  'listening',
  'thinking',
  'working',
  'done',
  'approval',
  'error',
  'offline',
  'speaking',
  'sleep',
  'alert',
  'celebrate',
  'orbit',
  'swirl',
] as const

export type AvatarState = (typeof AVATAR_STATES)[number]

/** Estados de Marco (v4): subconjunto que siguen usando el panel y la landing. */
export type MarcoState = 'idle' | 'listening' | 'thinking' | 'working' | 'done' | 'approval' | 'error'

export const MARCO_STATES: readonly MarcoState[] = ['idle', 'listening', 'thinking', 'working', 'done', 'approval', 'error']

export function isAvatarState(value: unknown): value is AvatarState {
  return typeof value === 'string' && (AVATAR_STATES as readonly string[]).includes(value)
}

/** Qué hace la mirada en un paso: seguir un objetivo, quedarse en la pose o negar. */
export type GazeMode = 'follow' | 'none' | 'shake'

export interface PlanStep {
  pose: PoseId
  expression?: ExpressionId
  /** segundos que dura el paso; el último no tiene (se queda) */
  hold?: number
  gaze: GazeMode
}

export interface Plan {
  steps: PlanStep[]
  /** espera antes de mostrarse: si el estado cambia antes, nunca aparece (evita parpadeos) */
  delay?: number
  /** tiempo mínimo en pantalla una vez visible */
  minHold?: number
  /** paso que representa al estado en una miniatura estática */
  still?: number
}

export const PLANS: Record<AvatarState, Plan> = {
  idle: { steps: [{ pose: 'rest', expression: 'attentive', gaze: 'follow' }] },
  listening: { steps: [{ pose: 'rest', expression: 'listening', gaze: 'follow' }] },
  // «pensando» solo si la espera supera 250 ms, y entonces al menos 600 ms
  thinking: { steps: [{ pose: 'dots', gaze: 'none' }], delay: 0.25, minHold: 0.6 },
  working: { steps: [{ pose: 'working', gaze: 'none' }], minHold: 0.6 },
  // guiño → feliz → reposo; cualquier estado nuevo lo interrumpe
  done: {
    steps: [
      { pose: 'wink', hold: 0.9, gaze: 'none' },
      { pose: 'rest', expression: 'happy', hold: 1.6, gaze: 'none' },
      { pose: 'rest', expression: 'attentive', gaze: 'follow' },
    ],
    still: 1,
  },
  approval: { steps: [{ pose: 'approval', gaze: 'follow' }] },
  error: { steps: [{ pose: 'rest', expression: 'worried', gaze: 'shake' }] },
  // sin conexión: decaído y quieto hasta que vuelva la red
  offline: { steps: [{ pose: 'rest', expression: 'sleepy', gaze: 'none' }] },
  // hablando: mira lo que escribe (BOT-UI le pasa la lista de mensajes) y asiente
  speaking: { steps: [{ pose: 'speak', expression: 'attentive', gaze: 'follow' }] },
  sleep: { steps: [{ pose: 'sleep', gaze: 'none' }] },
  // alerta: «!» breve, sorpresa y vuelta a la atención
  alert: {
    steps: [
      { pose: 'exclaim', hold: 1.4, gaze: 'none' },
      { pose: 'rest', expression: 'surprised', hold: 1.1, gaze: 'none' },
      { pose: 'rest', expression: 'attentive', gaze: 'follow' },
    ],
    minHold: 0.8,
  },
  // celebración: chispas y risa, luego contento, luego reposo
  celebrate: {
    steps: [
      { pose: 'burst', hold: 1.3, gaze: 'none' },
      { pose: 'rest', expression: 'happy', hold: 1.4, gaze: 'none' },
      { pose: 'rest', expression: 'attentive', gaze: 'follow' },
    ],
    minHold: 0.9,
  },
  orbit: { steps: [{ pose: 'orbit', gaze: 'none' }], minHold: 1 },
  // remolino: saludo o cambio de asistente, una vez
  swirl: {
    steps: [
      { pose: 'swirl', expression: 'attentive', hold: 1.3, gaze: 'none' },
      { pose: 'rest', expression: 'attentive', gaze: 'follow' },
    ],
    minHold: 1.2,
  },
}

/** Al despertar: un instante de sorpresa antes del estado pedido (si ése tiene cara). */
const WAKE_STEP: PlanStep = { pose: 'rest', expression: 'surprised', hold: 0.45, gaze: 'none' }
const FACELESS: ReadonlySet<PoseId> = new Set(['dots', 'exclaim'])

/** Suavizado de la negación: lo bastante corto para que se vea, sin saltos al entrar. */
const SHAKE_MORPH = 0.1
/** Un movimiento del puntero mayor que esto (en fracción de media pantalla) cuenta como actividad. */
const AIM_ACTIVITY = 0.02

export interface AvatarDirectorOptions {
  /** segundos de inactividad en reposo antes de dormirse (null = nunca) */
  sleepAfter?: number | null
  /** cara de reposo propia desde el montaje (ver setRestExpression) */
  restExpression?: ExpressionId | null
}

export class AvatarDirector {
  private requested: AvatarState
  private requestedAt: number
  private active: AvatarState
  private activeAt: number
  private stepIndex = -1
  private stepAt = 0
  private aiming = false
  private aimSince = 0
  private reduced = false
  private sleepAfter: number | null
  private lastActivity: number
  private dozing = false
  private prelude: PlanStep | null = null
  private lastAim: Aim | null = null
  /** cara de reposo propia (reemplaza a «attentive» en los pasos que la usan) */
  private restExpression: ExpressionId | null = null

  constructor(
    private readonly engine: AvatarEngine,
    initial: AvatarState = 'idle',
    now = 0,
    options: AvatarDirectorOptions = {},
  ) {
    this.requested = initial
    this.active = initial
    this.requestedAt = now
    this.activeAt = now
    this.lastActivity = now
    this.sleepAfter = options.sleepAfter ?? null
    this.restExpression = options.restExpression ?? null
    this.reduced = engine.reducedMotion
    // al montar, el avatar ya está en su estado: sin fundido desde el reposo
    const first = PLANS[initial].steps[0]
    engine.reset(first.pose, first.expression === 'attentive' && this.restExpression ? this.restExpression : first.expression, now)
    this.stepIndex = 0
    this.stepAt = now
    this.syncFidgets()
  }

  /** Estado que se ve ahora (puede ir atrasado respecto del pedido por delay/minHold, o dormido). */
  get state(): AvatarState {
    return this.active
  }

  get requestedState(): AvatarState {
    return this.requested
  }

  /** true si se durmió solo por inactividad (no porque se lo pidieran). */
  get isDozing(): boolean {
    return this.dozing
  }

  private steps(): PlanStep[] {
    const plan = PLANS[this.active].steps
    return this.prelude ? [this.prelude, ...plan] : plan
  }

  /** Paso visible del plan activo. */
  get step(): PlanStep {
    const steps = this.steps()
    return steps[Math.min(Math.max(0, this.stepIndex), steps.length - 1)]
  }

  /** true si el paso visible quiere un objetivo para mirar (así no se mide el DOM en vano). */
  get wantsAim(): boolean {
    // dormido igual mide: un movimiento del puntero lo despierta
    if (this.dozing) return !this.reduced
    return !this.reduced && this.step.gaze === 'follow'
  }

  setReducedMotion(on: boolean, now: number): void {
    this.reduced = on
    this.engine.setReducedMotion(on)
    if (on) this.release(now, 0)
    this.syncFidgets()
  }

  /** Se duerme tras `seconds` de reposo sin actividad (null = nunca). */
  setSleepAfter(seconds: number | null, now: number): void {
    this.sleepAfter = seconds != null && Number.isFinite(seconds) && seconds > 0 ? seconds : null
    this.lastActivity = now
  }

  /** Actividad de la persona (teclear, abrir el panel): despierta y reinicia la cuenta. */
  poke(now: number): void {
    this.lastActivity = now
    if (this.dozing) this.wake(now)
  }

  /**
   * Cara de reposo propia (p. ej. «happy» junto a un mensaje de éxito, o la que se prueba en el
   * diseñador). Reemplaza a «attentive»; null vuelve a la normal.
   */
  setRestExpression(id: ExpressionId | null, now: number): void {
    if (id === this.restExpression) return
    this.restExpression = id
    const step = this.step
    if (step.expression === 'attentive') this.engine.setExpression(id ?? 'attentive', now)
  }

  /** Pide un estado. Se aplica en el próximo `advance` que lo permita. */
  request(state: AvatarState, now: number): void {
    this.lastActivity = now
    if (this.dozing && state !== 'sleep') {
      this.dozing = false
      this.requested = 'sleep'
    }
    if (state === this.requested) return
    this.requested = state
    this.requestedAt = now
  }

  private wake(now: number): void {
    this.dozing = false
    this.requested = 'idle'
    this.requestedAt = now
  }

  /** Avanza la máquina hasta `now` y orienta la mirada (`aim` = objetivo o null). */
  advance(now: number, aim: Aim | null = null): void {
    this.trackActivity(now, aim)

    // dormirse solo: reposo pedido, sin actividad durante `sleepAfter`
    if (
      !this.dozing &&
      this.sleepAfter != null &&
      this.requested === 'idle' &&
      this.active === 'idle' &&
      now - this.lastActivity >= this.sleepAfter
    ) {
      this.dozing = true
      this.requested = 'sleep'
      this.requestedAt = now
    }

    if (this.requested !== this.active) {
      const due = Math.max(
        this.requestedAt + (PLANS[this.requested].delay ?? 0),
        this.activeAt + (PLANS[this.active].minHold ?? 0),
      )
      if (now >= due) {
        const from = this.active
        this.active = this.requested
        this.activeAt = due
        this.stepIndex = -1
        const first = PLANS[this.active].steps[0]
        this.prelude = from === 'sleep' && !FACELESS.has(first.pose) && !this.reduced ? WAKE_STEP : null
      }
    }

    const steps = this.steps()
    let index = 0
    let start = this.activeAt
    while (index < steps.length - 1) {
      const hold = steps[index].hold ?? Infinity
      if (now < start + hold) break
      start += hold
      index++
    }
    if (index !== this.stepIndex) this.applyStep(index, start)

    this.steer(steps[index].gaze, now, aim)
  }

  private trackActivity(now: number, aim: Aim | null): void {
    const last = this.lastAim
    if (aim && last && aim.kind === last.kind) {
      if (Math.abs(aim.nx - last.nx) > AIM_ACTIVITY || Math.abs(aim.ny - last.ny) > AIM_ACTIVITY) this.poke(now)
    } else if (aim && !last && aim.kind === 'pointer') {
      // el puntero entra en la ventana
      this.poke(now)
    }
    if (aim) this.lastAim = aim
    else if (!this.dozing) this.lastAim = null
  }

  private applyStep(index: number, at: number): void {
    const step = this.steps()[index]
    // primero la expresión: si setPose congela la pose, ya la ve en su punto de partida
    const expression = step.expression === 'attentive' && this.restExpression ? this.restExpression : step.expression
    if (expression) this.engine.setExpression(expression, at)
    this.engine.setPose(step.pose, at)
    this.stepIndex = index
    this.stepAt = at
    this.syncFidgets()
  }

  /** Gestos espontáneos solo en reposo de verdad (no escuchando, no hablando, no despertando). */
  private syncFidgets(): void {
    const step = this.step
    this.engine.setFidgets(!this.reduced && this.active === 'idle' && step.pose === 'rest' && step.gaze === 'follow')
  }

  private steer(mode: GazeMode, now: number, aim: Aim | null): void {
    if (this.reduced) {
      this.release(now, 0)
      return
    }
    if (mode === 'follow' && aim) {
      if (!this.aiming) {
        this.aiming = true
        this.aimSince = now
      }
      const engage = easings.easeOutQuint(clamp((now - this.aimSince) / ENGAGE_TIME))
      this.engine.setLook(aimLook(aim, engage), now)
      return
    }
    if (mode === 'shake') {
      const t = now - this.stepAt
      if (t < SHAKE_TIME) {
        const look = shakeLook(t)
        this.engine.setLook({ ...look, spin: look.spin * this.engine.motionProfile.shake }, now, SHAKE_MORPH)
        this.aiming = true
        this.aimSince = now
        return
      }
    }
    this.release(now, RELEASE_MORPH)
  }

  private release(now: number, morph: number): void {
    if (!this.aiming) return
    this.engine.setLook(null, now, morph)
    this.aiming = false
  }
}

/** Nombre heredado (v4). */
export { AvatarDirector as MarcoDirector }

/** Paso con el que se dibuja un estado en una miniatura estática. */
export function stillStep(state: AvatarState): PlanStep {
  const plan = PLANS[state] ?? PLANS.idle
  return plan.steps[plan.still ?? 0]
}
