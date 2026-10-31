/*
 * Director de estados de Marco (Framezen). Diseño propio; maneja el motor adaptado de
 * bloub (MIT, ver THIRD_PARTY_NOTICES.md).
 *
 * TS puro y sin setTimeout: todo avanza con el reloj de escena que recibe `step`, así
 * que es determinista y se prueba igual que el motor.
 */
import type { MarcoEngine } from './engine'
import type { ExpressionId } from './expressions'
import { ENGAGE_TIME, RELEASE_MORPH, SHAKE_TIME, aimLook, shakeLook, type Aim } from './gaze'
import { clamp, easings } from './math'
import type { PoseId } from './poses'

export type MarcoState = 'idle' | 'listening' | 'thinking' | 'working' | 'done' | 'approval' | 'error'

export const MARCO_STATES: readonly MarcoState[] = [
  'idle',
  'listening',
  'thinking',
  'working',
  'done',
  'approval',
  'error',
]

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

export const PLANS: Record<MarcoState, Plan> = {
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
}

/** Suavizado de la negación: lo bastante corto para que se vea, sin saltos al entrar. */
const SHAKE_MORPH = 0.1

export class MarcoDirector {
  private requested: MarcoState
  private requestedAt: number
  private active: MarcoState
  private activeAt: number
  private stepIndex = -1
  private stepAt = 0
  private aiming = false
  private aimSince = 0
  private reduced = false

  constructor(
    private readonly engine: MarcoEngine,
    initial: MarcoState = 'idle',
    now = 0,
  ) {
    this.requested = initial
    this.active = initial
    this.requestedAt = now
    this.activeAt = now
    this.reduced = engine.reducedMotion
    // al montar, Marco ya está en su estado: sin fundido desde el reposo
    const first = PLANS[initial].steps[0]
    engine.reset(first.pose, first.expression, now)
    this.stepIndex = 0
    this.stepAt = now
  }

  /** Estado que se ve ahora (puede ir atrasado respecto del pedido por delay/minHold). */
  get state(): MarcoState {
    return this.active
  }

  get requestedState(): MarcoState {
    return this.requested
  }

  /** Paso visible del plan activo. */
  get step(): PlanStep {
    return PLANS[this.active].steps[Math.max(0, this.stepIndex)]
  }

  /** true si el paso visible quiere un objetivo para mirar (así no se mide el DOM en vano). */
  get wantsAim(): boolean {
    return !this.reduced && this.step.gaze === 'follow'
  }

  setReducedMotion(on: boolean, now: number): void {
    this.reduced = on
    this.engine.setReducedMotion(on)
    if (on) this.release(now, 0)
  }

  /** Pide un estado. Se aplica en el próximo `advance` que lo permita. */
  request(state: MarcoState, now: number): void {
    if (state === this.requested) return
    this.requested = state
    this.requestedAt = now
  }

  /** Avanza la máquina hasta `now` y orienta la mirada (`aim` = objetivo o null). */
  advance(now: number, aim: Aim | null = null): void {
    if (this.requested !== this.active) {
      const due = Math.max(
        this.requestedAt + (PLANS[this.requested].delay ?? 0),
        this.activeAt + (PLANS[this.active].minHold ?? 0),
      )
      if (now >= due) {
        this.active = this.requested
        this.activeAt = due
        this.stepIndex = -1
      }
    }

    const plan = PLANS[this.active]
    let index = 0
    let start = this.activeAt
    while (index < plan.steps.length - 1) {
      const hold = plan.steps[index].hold ?? Infinity
      if (now < start + hold) break
      start += hold
      index++
    }
    if (index !== this.stepIndex) this.applyStep(index, start)

    this.steer(plan.steps[index].gaze, now, aim)
  }

  private applyStep(index: number, at: number): void {
    const step = PLANS[this.active].steps[index]
    // primero la expresión: si setPose congela la pose, ya la ve en su punto de partida
    if (step.expression) this.engine.setExpression(step.expression, at)
    this.engine.setPose(step.pose, at)
    this.stepIndex = index
    this.stepAt = at
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
        this.engine.setLook(shakeLook(t), now, SHAKE_MORPH)
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

/** Paso con el que se dibuja un estado en una miniatura estática. */
export function stillStep(state: MarcoState): PlanStep {
  const plan = PLANS[state]
  return plan.steps[plan.still ?? 0]
}
