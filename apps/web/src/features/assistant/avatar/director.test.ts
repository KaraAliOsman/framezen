import { describe, expect, it } from 'vitest'
import { MarcoDirector, PLANS, stillStep, type MarcoState } from './engine/director'
import { MarcoEngine } from './engine/engine'
import type { Aim } from './engine/gaze'

function rig(initial: MarcoState = 'idle') {
  const engine = new MarcoEngine()
  const director = new MarcoDirector(engine, initial, 0)
  return { engine, director }
}

const pointer: Aim = { nx: 0.8, ny: -0.2, kind: 'pointer' }

/** Simula frames a 60 fps entre `from` y `to`. */
function frames(director: MarcoDirector, from: number, to: number, aim: Aim | null = null) {
  for (let t = from; t <= to + 1e-9; t += 1 / 60) director.advance(t, aim)
}

describe('máquina de estados de Marco', () => {
  it('monta directo en el estado inicial, sin fundirse desde el reposo', () => {
    const { engine, director } = rig('thinking')
    expect(director.state).toBe('thinking')
    expect(engine.pose).toBe('dots')
    expect(engine.sample(0).eyes).toHaveLength(0)
  })

  it('reposo y escuchando comparten pose y cambian de expresión', () => {
    const { engine, director } = rig()
    expect(engine.expression).toBe('attentive')
    director.request('listening', 1)
    director.advance(1)
    expect(director.state).toBe('listening')
    expect(engine.pose).toBe('rest')
    expect(engine.expression).toBe('listening')
  })

  it('«pensando» espera 250 ms antes de aparecer', () => {
    const { engine, director } = rig()
    director.request('thinking', 1)
    director.advance(1.1)
    expect(engine.pose).toBe('rest')
    director.advance(1.26)
    expect(director.state).toBe('thinking')
    expect(engine.pose).toBe('dots')
  })

  it('una respuesta rápida nunca muestra «pensando»', () => {
    const { engine, director } = rig()
    director.request('thinking', 1)
    director.advance(1.1)
    director.request('idle', 1.15)
    director.advance(1.3)
    director.advance(2)
    expect(director.state).toBe('idle')
    expect(engine.pose).toBe('rest')
  })

  it('«pensando» se mantiene al menos 600 ms una vez visible', () => {
    const { engine, director } = rig()
    director.request('thinking', 0)
    director.advance(0.25) // visible desde 0,25
    director.request('idle', 0.4)
    director.advance(0.6)
    expect(engine.pose).toBe('dots')
    director.advance(0.86)
    expect(director.state).toBe('idle')
    expect(engine.pose).toBe('rest')
  })

  it('«listo» encadena guiño → feliz → reposo', () => {
    const { engine, director } = rig()
    director.request('done', 1)
    director.advance(1)
    expect(engine.pose).toBe('wink')
    director.advance(1.85)
    expect(engine.pose).toBe('wink')
    director.advance(1.95)
    expect(engine.pose).toBe('rest')
    expect(engine.expression).toBe('happy')
    director.advance(3.55)
    expect(engine.expression).toBe('attentive')
    expect(director.state).toBe('done')
    expect(director.wantsAim).toBe(true)
  })

  it('un estado nuevo interrumpe la secuencia de «listo»', () => {
    const { engine, director } = rig()
    director.request('done', 0)
    director.advance(0.2)
    director.request('listening', 0.3)
    director.advance(0.3)
    expect(engine.pose).toBe('rest')
    expect(engine.expression).toBe('listening')
  })

  it('aprobación muestra la pastilla y error niega con la cabeza', () => {
    const { engine, director } = rig()
    director.request('approval', 0)
    director.advance(0)
    expect(engine.pose).toBe('approval')
    expect(engine.sample(1).pill).not.toBeNull()

    director.request('error', 2)
    director.advance(2)
    expect(engine.pose).toBe('rest')
    expect(engine.expression).toBe('worried')
    let peak = 0
    for (let t = 2; t < 2.5; t += 1 / 60) {
      director.advance(t)
      peak = Math.max(peak, Math.abs(engine.lookAtTime(t + 1 / 120).spin))
    }
    expect(peak).toBeGreaterThan(4)
    frames(director, 2.5, 4)
    expect(engine.lookAtTime(4).spin).toBeCloseTo(0, 3)
    expect(engine.lookAtTime(4).mix).toBe(0)
  })

  it('solo sigue el cursor en los estados que lo permiten', () => {
    const { engine, director } = rig()
    frames(director, 1, 2, pointer)
    expect(engine.lookAtTime(2).mix).toBeGreaterThan(0.9)
    expect(engine.lookAtTime(2).yaw).toBeCloseTo(0.8 * 16, 1)

    director.request('working', 2)
    expect(director.wantsAim).toBe(true) // aún no avanza
    frames(director, 2.02, 3, pointer)
    expect(director.wantsAim).toBe(false)
    expect(engine.lookAtTime(3).mix).toBe(0)
  })

  it('con movimiento reducido no sigue ni niega, pero sí cambia de estado', () => {
    const { engine, director } = rig()
    director.setReducedMotion(true, 0)
    expect(director.wantsAim).toBe(false)
    director.advance(0.5, pointer)
    expect(engine.lookAtTime(1).mix).toBe(0)
    director.request('error', 1)
    director.advance(1.05)
    expect(engine.expression).toBe('worried')
    expect(engine.lookAtTime(1.05).spin).toBe(0)
  })

  it('cada estado tiene un paso representativo para miniaturas', () => {
    for (const state of Object.keys(PLANS) as Array<keyof typeof PLANS>) {
      expect(stillStep(state)).toBeDefined()
    }
    expect(stillStep('done').expression).toBe('happy')
  })
})
