import { describe, expect, it } from 'vitest'
import { DOT_POOL } from './paint'
import { MarcoEngine } from './engine/engine'
import { eyeTransform } from './engine/engine'
import { EXPRESSIONS } from './engine/expressions'
import {
  BLINKS,
  BLINK_SPAN,
  REFERENCE_EYE_H,
  REFERENCE_EYE_W,
  REFERENCE_GAZE,
  REFERENCE_SPLIT,
  blinkLid,
  eyePoses,
} from './engine/face'
import { aimLook, normalizeAim, shakeLook } from './engine/gaze'
import { capsulePath } from './engine/shape'
import { stillFrame } from './engine/still'
import { MARCO_STATES } from './engine/director'

/** Puntos de anclaje de un path de closedPath (ignora los de control). */
function anchors(d: string): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const head = /^M(-?[\d.]+) (-?[\d.]+)/.exec(d)
  if (head) out.push([+head[1], +head[2]])
  for (const seg of d.matchAll(/C[-\d. ]+? (-?[\d.]+) (-?[\d.]+)(?=C|Z)/g)) out.push([+seg[1], +seg[2]])
  return out
}

function extent(d: string) {
  const pts = anchors(d)
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

describe('port fiel del modelo de ojos de bloub', () => {
  it('reproduce la cápsula del favicon de bloub', () => {
    expect(capsulePath(REFERENCE_EYE_W * 100, REFERENCE_EYE_H * 100)).toBe(
      'M-9.3 -11.3A9.3 9.3 0 0 1 0 -20.6L0 -20.6A9.3 9.3 0 0 1 9.3 -11.3L9.3 11.3A9.3 9.3 0 0 1 0 20.6L0 20.6A9.3 9.3 0 0 1 -9.3 11.3Z',
    )
  })

  it('reproduce las matrices de reposo de bloub (sin vida)', () => {
    const cfg = { w: REFERENCE_EYE_W, h: REFERENCE_EYE_H, open: 1 }
    const [inner, outer] = eyePoses(REFERENCE_GAZE, 100, REFERENCE_SPLIT)
    expect(eyeTransform(inner, cfg, 1, inner.x, inner.y)).toBe('matrix(0.89,-0.32,0.42,0.86,18.9,-40.9)')
    expect(eyeTransform(outer, cfg, 1, outer.x, outer.y)).toBe('matrix(0.66,-0.06,0.42,0.86,61.82,-51.43)')
  })

  it('la expresión atenta de Marco coincide con la referencia «attentif»', () => {
    const { gaze, split, eyes } = EXPRESSIONS.attentive
    const [a, b] = eyePoses(gaze, 100, split)
    expect(eyeTransform(a, eyes[0], 1, a.x, a.y)).toBe('matrix(0.98,-0.09,0.08,0.99,-20.74,-6.46)')
    expect(eyeTransform(b, eyes[1], 1, b.x, b.y)).toBe('matrix(0.94,-0.04,0.08,0.99,34.1,-10.29)')
  })

  it('comprime el ojo por el factor de profundidad de la esfera', () => {
    for (const e of eyePoses(REFERENCE_GAZE, 1, REFERENCE_SPLIT)) {
      expect(e.a * e.d - e.b * e.c).toBeCloseTo(e.depth, 6)
    }
  })
})

describe('parpadeo determinista', () => {
  it('sigue el calendario sorteado con la semilla 0x5eed', () => {
    expect(BLINKS.full[0]).toBeCloseTo(1.4, 6)
    expect(BLINKS.full[1]).toBeCloseTo(5.217, 2)
    expect(BLINKS.full[2]).toBeCloseTo(9.687, 2)
    expect(BLINKS.full[3]).toBeCloseTo(9.927, 2)
  })

  it('cierra rápido y abre más lento', () => {
    expect(blinkLid(1.0)).toBe(1)
    expect(blinkLid(1.4 + 0.081)).toBeLessThan(0.01)
    expect(blinkLid(1.4 + 0.04)).toBeGreaterThan(0.4)
    expect(blinkLid(1.4 + 0.2)).toBe(1)
  })

  it('sigue parpadeando después de 15 minutos', () => {
    expect(blinkLid(BLINK_SPAN + 1.4 + 0.081)).toBeLessThan(0.01)
    expect(blinkLid(BLINK_SPAN * 3 + 1.4 + 0.081)).toBeLessThan(0.01)
  })

  it('el modo mínimo parpadea mucho menos', () => {
    expect(BLINKS.minimal.length).toBeLessThan(BLINKS.full.length / 2.5)
    expect(blinkLid(5.217 + 0.081, 'minimal')).toBe(1)
    expect(blinkLid(9.687, 'off')).toBe(1)
  })
})

describe('MarcoEngine.sample(t)', () => {
  it('es una función pura del tiempo', () => {
    const a = new MarcoEngine({ pose: 'working' })
    const b = new MarcoEngine({ pose: 'working' })
    expect(a.sample(1.3)).toEqual(b.sample(1.3))
    const first = a.sample(0.7)
    a.sample(4.2)
    expect(a.sample(0.7)).toEqual(first)
  })

  it('se puede releer durante un fundido entre poses', () => {
    const e = new MarcoEngine()
    e.setPose('dots', 1)
    const during = e.sample(1.15)
    e.sample(3)
    expect(e.sample(1.15)).toEqual(during)
    // antes del cambio se ve la pose saliente
    const fresh = new MarcoEngine()
    expect(e.sample(0.5).body).toBe(fresh.sample(0.5).body)
  })

  it('en reposo es un círculo con dos ojos y mira casi de frente', () => {
    const f = new MarcoEngine().sample(1)
    const { w, h } = extent(f.body)
    expect(Math.abs(w - h)).toBeLessThan(3)
    expect(w).toBeGreaterThan(195)
    expect(f.eyes).toHaveLength(2)
    expect(f.dots).toHaveLength(0)
    expect(f.pill).toBeNull()
  })

  it('pensando: la bola se vuelve tres puntos y no tiene ojos', () => {
    const f = new MarcoEngine({ pose: 'dots' }).sample(1)
    expect(f.eyes).toHaveLength(0)
    expect(f.dots).toHaveLength(2)
    expect(extent(f.body).w).toBeLessThan(50)
    // los puntos laterales quedan a ambos lados del central
    expect(f.dots[0].x).toBeLessThan(-40)
    expect(f.dots[1].x).toBeGreaterThan(40)
  })

  it('trabajando: anillos lentos dentro de la caja', () => {
    const e = new MarcoEngine({ pose: 'working' })
    const f = e.sample(1)
    expect(f.arcs).toHaveLength(3)
    expect(f.eyes).toHaveLength(2)
    for (const t of [0.5, 1, 2, 3.3]) {
      for (const arc of e.sample(t).arcs) {
        for (const m of `${arc.front}${arc.back}`.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)) {
          expect(Math.abs(+m[1])).toBeLessThan(112)
          expect(Math.abs(+m[2])).toBeLessThan(112)
        }
      }
    }
  })

  it('aprobación: pastilla ámbar con muesca', () => {
    const f = new MarcoEngine({ pose: 'approval' }).sample(1)
    expect(f.pill?.color).toBe('#F0B429')
    expect(f.notch).not.toBeNull()
    expect(f.notch!.r).toBeGreaterThan(f.pill!.r)
    expect(f.pill!.x).toBeGreaterThan(0)
    expect(f.pill!.y).toBeLessThan(0)
  })

  it('rechaza una mirada no finita sin romperse', () => {
    const e = new MarcoEngine()
    const before = e.sample(2)
    e.setLook({ yaw: Number.NaN, pitch: 0, mix: 1, spin: 0, wander: 0 }, 1)
    expect(e.sample(2)).toEqual(before)
  })

  it('una mirada externa mueve los ojos hacia el objetivo', () => {
    const e = new MarcoEngine({ lifeOffset: 0 })
    const rest = e.sample(3).eyes[0].transform
    e.setLook(aimLook({ nx: 1, ny: 0, kind: 'pointer' }), 2)
    const looking = e.sample(3).eyes[0].transform
    const x = (t: string) => Number(t.slice(7, -1).split(',')[4])
    expect(x(looking)).toBeGreaterThan(x(rest) + 10)
  })

  it('con movimiento reducido queda quieto (salvo el parpadeo)', () => {
    const e = new MarcoEngine({ pose: 'working', reducedMotion: true })
    expect(e.sample(2.0)).toEqual(e.sample(3.0))
    const r = new MarcoEngine({ reducedMotion: true })
    expect(r.sample(2.0)).toEqual(r.sample(3.0))
  })

  it('los fundidos encadenados no desbordan el pool de puntos', () => {
    const e = new MarcoEngine()
    e.setPose('dots', 0)
    e.setPose('rest', 0.1)
    e.setPose('dots', 0.2)
    expect(e.sample(0.25).dots.length).toBeLessThanOrEqual(DOT_POOL)
  })
})

describe('mirada', () => {
  it('usa los máximos del original para el cursor', () => {
    expect(aimLook({ nx: 1, ny: -1, kind: 'pointer' })).toMatchObject({ yaw: 16, pitch: 23, mix: 1, wander: 0 })
  })

  it('no normaliza contra una ventana sin tamaño', () => {
    expect(normalizeAim({ x: 10, y: 10 }, { x: 0, y: 0 }, { width: 0, height: 0 })).toBeNull()
    expect(normalizeAim({ x: 2000, y: 0 }, { x: 0, y: 0 }, { width: 1000, height: 800 })).toEqual({ nx: 1, ny: 0 })
  })

  it('la negación termina sin dejar giro', () => {
    expect(Math.abs(shakeLook(0.08).spin)).toBeGreaterThan(5)
    expect(shakeLook(2).spin).toBe(0)
    expect(shakeLook(2).mix).toBe(0)
  })
})

describe('miniaturas quietas', () => {
  it('son deterministas para todos los estados', () => {
    for (const state of MARCO_STATES) expect(stillFrame(state)).toEqual(stillFrame(state))
  })

  it('«listo» se muestra feliz y «pensando» como tres puntos', () => {
    expect(stillFrame('done').eyes).toHaveLength(2)
    expect(stillFrame('thinking').dots).toHaveLength(2)
    expect(stillFrame('approval').pill).not.toBeNull()
  })
})
