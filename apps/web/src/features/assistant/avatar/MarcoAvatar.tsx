/*
 * Marco, la cara del asistente de Framezen. Diseño propio de Framezen; el motor de
 * animación está adaptado de bloub (Copyright (c) 2026 Jérémy Perret, MIT — ver
 * THIRD_PARTY_NOTICES.md).
 */
import { clsx } from 'clsx'
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react'
import { MARCO_RINGS, ringGradient } from './engine/decor'
import { MarcoDirector, type MarcoState } from './engine/director'
import { HALF_VIEWBOX, MarcoEngine, RADIUS, type MarcoFrame } from './engine/engine'
import { normalizeAim, type Aim, type AimKind } from './engine/gaze'
import { stillFrame } from './engine/still'
import { ARC_POOL, DOT_POOL, collectNodes, paintFrame, type MarcoNodes } from './paint'
import {
  currentPointer,
  prefersReducedMotion,
  subscribeFrame,
  subscribeReducedMotion,
  trackPointer,
} from './runtime'

export interface MarcoPoint {
  /** coordenadas de cliente (como las de un PointerEvent) */
  x: number
  y: number
}

/**
 * Hacia dónde mira Marco cuando su estado lo permite (reposo, escuchando, aprobación):
 * - `'pointer'` (por defecto): sigue al cursor (nunca al dedo en pantallas táctiles).
 * - un elemento o ref (el input, la tarjeta de aprobación): mira su centro.
 * - un punto `{ x, y }` en coordenadas de cliente (p. ej. el caret del input).
 * - `'none'`: solo su propia deriva.
 */
export type MarcoLookAt = 'pointer' | 'none' | MarcoPoint | Element | RefObject<Element | null>

export interface MarcoAvatarProps {
  state: MarcoState
  /** lado en px; nítido de 20 a 240 (por defecto 40) */
  size?: number
  /** color CSS del cuerpo; por defecto la tinta de la marca (`--ink-600`) */
  color?: string
  lookAt?: MarcoLookAt
  className?: string
  /** etiqueta accesible; sin ella el avatar es decorativo (aria-hidden) */
  title?: string
  /** false = un frame quieto y representativo, sin bucle (miniaturas, listas) */
  animated?: boolean
  /** fuerza el modo de movimiento reducido; por defecto sigue la preferencia del sistema */
  reducedMotion?: boolean
}

/** Variables CSS que el consumidor puede ajustar. */
const DEFAULT_BODY = 'var(--marco-body, var(--ink-600))'
const DEFAULT_EYE = 'var(--marco-eye, #fff)'
/** Delta máximo por frame: una pestaña oculta no salta hacia adelante al volver. */
const MAX_DT = 0.064
/**
 * Tonos de cada anillo (3 paradas a lo largo de su eje mayor): % del color del cuerpo
 * mezclado con blanco. Los extremos quedan fuera del cuerpo y van plenos (se leen sobre
 * el fondo); el centro cruza por delante del cuerpo y va claro (se lee sobre la tinta).
 */
const RING_TONES: readonly (readonly number[])[] = [
  [100, 40, 90],
  [85, 35, 100],
  [100, 50, 80],
]

const VB = HALF_VIEWBOX
const range = (n: number) => Array.from({ length: n }, (_, i) => i)

function tone(color: string, percent: number): string {
  return percent >= 100 ? color : `color-mix(in oklab, ${color} ${percent}%, white)`
}

/** Ojos algo más grandes en tamaños chicos para que se lean. */
export function eyeScaleFor(size: number): number {
  if (size <= 24) return 1.2
  if (size <= 36) return 1.1
  return 1
}

/** Desfase de vida estable por instancia (0–60 s): Marcos vecinos no parpadean a la vez. */
function lifeOffsetFor(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 6000) / 100
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, () => false)
}

function elementCenter(el: Element | null): MarcoPoint | null {
  if (!el) return null
  const box = el.getBoundingClientRect()
  if (!(box.width > 0 || box.height > 0)) return null
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

function resolveTarget(target: Exclude<MarcoLookAt, 'pointer' | 'none'>): MarcoPoint | null {
  if (typeof Element !== 'undefined' && target instanceof Element) return elementCenter(target)
  if ('current' in target) return elementCenter(target.current)
  if ('x' in target && Number.isFinite(target.x) && Number.isFinite(target.y)) return { x: target.x, y: target.y }
  return null
}

interface Rig {
  engine: MarcoEngine
  director: MarcoDirector
  /** reloj de escena en segundos; solo avanza mientras Marco está a la vista */
  clock: number
}

export const MarcoAvatar = memo(function MarcoAvatar({
  state,
  size = 40,
  color,
  lookAt = 'pointer',
  className,
  title,
  animated = true,
  reducedMotion,
}: MarcoAvatarProps) {
  // los ids de React traen caracteres que rompen url(#…)
  const uid = `marco-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const systemReduced = usePrefersReducedMotion()
  const reduced = reducedMotion ?? systemReduced
  const eyeScale = eyeScaleFor(size)

  // un motor y un director por instancia, creados una sola vez (también en StrictMode)
  const [rig] = useState<Rig>(() => {
    const engine = new MarcoEngine({ lifeOffset: lifeOffsetFor(uid), reducedMotion: reduced, eyeScale })
    return { engine, director: new MarcoDirector(engine, state, 0), clock: 0 }
  })

  const svgRef = useRef<SVGSVGElement>(null)
  const nodesRef = useRef<MarcoNodes | null>(null)
  const lookAtRef = useRef<MarcoLookAt>(lookAt)
  const sizeRef = useRef(size)

  useLayoutEffect(() => {
    lookAtRef.current = lookAt
    sizeRef.current = size
  })

  const paint = useCallback(
    (frame: MarcoFrame) => {
      const svg = svgRef.current
      if (!svg) return
      nodesRef.current ??= collectNodes(svg)
      if (nodesRef.current) paintFrame(nodesRef.current, frame, uid, sizeRef.current)
    },
    [uid],
  )

  // configuración del motor
  useEffect(() => rig.engine.setEyeScale(eyeScale), [rig, eyeScale])
  useEffect(() => rig.director.setReducedMotion(reduced, rig.clock), [rig, reduced])
  useLayoutEffect(() => rig.director.request(state, rig.clock), [rig, state])

  // miniatura quieta: se repinta solo cuando cambia algo que se ve
  useLayoutEffect(() => {
    if (!animated) paint(stillFrame(state, { eyeScale }))
  }, [animated, state, eyeScale, size, paint])

  // primer frame animado antes de que el navegador pinte (sin parpadeo vacío)
  useLayoutEffect(() => {
    if (!animated) return
    rig.director.advance(rig.clock, null)
    paint(rig.engine.sample(rig.clock))
  }, [animated, rig, paint])

  useEffect(() => {
    if (!animated) return
    const svg = svgRef.current
    if (!svg) return

    let last = 0
    let unsubscribe: (() => void) | null = null
    let inView = true
    let pageVisible = !document.hidden

    const readAim = (): Aim | null => {
      const target = lookAtRef.current
      if (target === 'none') return null
      const box = svg.getBoundingClientRect()
      if (!(box.width > 0 && box.height > 0)) return null
      const kind: AimKind = target === 'pointer' ? 'pointer' : 'target'
      const point = target === 'pointer' ? currentPointer() : resolveTarget(target)
      if (!point) return null
      const n = normalizeAim(
        point,
        { x: box.left + box.width / 2, y: box.top + box.height / 2 },
        { width: window.innerWidth, height: window.innerHeight },
      )
      return n ? { ...n, kind } : null
    }

    const tick = (ms: number) => {
      const dt = last ? Math.min((ms - last) / 1000, MAX_DT) : 0
      last = ms
      rig.clock += dt
      rig.director.advance(rig.clock, rig.director.wantsAim ? readAim() : null)
      paint(rig.engine.sample(rig.clock))
    }

    // pausa cuando no se ve: pestaña oculta o fuera de la pantalla
    const sync = () => {
      const run = inView && pageVisible
      if (run && !unsubscribe) {
        last = 0
        unsubscribe = subscribeFrame(tick)
      } else if (!run && unsubscribe) {
        unsubscribe()
        unsubscribe = null
      }
    }
    const onVisibility = () => {
      pageVisible = !document.hidden
      sync()
    }
    document.addEventListener('visibilitychange', onVisibility)

    let observer: IntersectionObserver | null = null
    if (typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) inView = entry.isIntersecting
        sync()
      })
      observer.observe(svg)
    }

    const releasePointer = trackPointer()
    sync()

    return () => {
      unsubscribe?.()
      unsubscribe = null
      observer?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      releasePointer()
    }
  }, [animated, rig, paint])

  const body = color ?? DEFAULT_BODY

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox={`${-VB} ${-VB} ${VB * 2} ${VB * 2}`}
      overflow="visible"
      className={clsx('shrink-0 select-none', 'dark:[--marco-body:#5b78e0]', className)}
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      data-marco-state={state}
    >
      <defs>
        <clipPath id={`${uid}-clip`}>
          <path data-marco="clip" />
        </clipPath>
        <mask id={`${uid}-notch`} maskUnits="userSpaceOnUse" x={-VB} y={-VB} width={VB * 2} height={VB * 2}>
          <rect x={-VB} y={-VB} width={VB * 2} height={VB * 2} fill="#fff" />
          <circle data-marco="notch" r="0" fill="#000" />
        </mask>
        {MARCO_RINGS.map((seed, i) => {
          const g = ringGradient(seed, RADIUS)
          return (
            <linearGradient
              key={i}
              id={`${uid}-ring-${i}`}
              gradientUnits="userSpaceOnUse"
              x1={g.x1}
              y1={g.y1}
              x2={g.x2}
              y2={g.y2}
            >
              {RING_TONES[i].map((percent, j) => (
                <stop key={j} offset={j / 2} style={{ stopColor: tone(body, percent) }} />
              ))}
            </linearGradient>
          )
        })}
      </defs>

      {/* mitad trasera de los anillos: va antes del cuerpo, que la tapa */}
      <g fill="none" strokeLinecap="round">
        {range(ARC_POOL).map((i) => (
          <path key={i} data-marco={`arc-back-${i}`} display="none" />
        ))}
      </g>

      <g data-marco="body-group">
        <path data-marco="body" style={{ fill: body }} />
        {/* ojos opacos recortados por la silueta: al acercarse al borde se cortan solos */}
        <g clipPath={`url(#${uid}-clip)`} style={{ fill: DEFAULT_EYE }}>
          <path data-marco="eye-0" display="none" />
          <path data-marco="eye-1" display="none" />
        </g>
      </g>

      <g style={{ fill: body }}>
        {range(DOT_POOL).map((i) => (
          <circle key={i} data-marco={`dot-${i}`} display="none" />
        ))}
      </g>

      <circle data-marco="pill" display="none" />

      {/* mitad delantera de los anillos */}
      <g fill="none" strokeLinecap="round">
        {range(ARC_POOL).map((i) => (
          <path key={i} data-marco={`arc-front-${i}`} display="none" />
        ))}
      </g>
    </svg>
  )
})
