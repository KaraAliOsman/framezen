/*
 * Avatar animado de los asistentes de DEKOPEN. Diseño propio de DEKOPEN; el motor de
 * animación está adaptado de bloub (Copyright (c) 2026 Jérémy Perret, MIT — ver
 * THIRD_PARTY_NOTICES.md).
 *
 * Un avatar = un `AvatarSpec` (forma, paleta o colores propios, ojos, accesorio, movimiento)
 * + un estado (`AvatarState`). Un motor y un director por instancia; todas las instancias
 * comparten un solo requestAnimationFrame y un solo listener del puntero (runtime.ts).
 */
import { normalizeAvatarSpec, type AvatarSpec } from '@dekopen/shared'
import { clsx } from 'clsx'
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type RefObject,
} from 'react'
import { AccessoryPartArt, WindowSill } from './AccessoryArt'
import { resolveAvatarColors } from './colors'
import { accessoryDef } from './engine/accessories'
import { RING_TONES, RINGS, ringGradient } from './engine/decor'
import { AvatarDirector, type AvatarState } from './engine/director'
import { AvatarEngine, HALF_VIEWBOX, RADIUS, type AvatarDesign, type AvatarFrame } from './engine/engine'
import type { ExpressionId } from './engine/expressions'
import { normalizeAim, type Aim, type AimKind } from './engine/gaze'
import { WINDOW_GEOMETRY } from './engine/shapes'
import { stillFrame } from './engine/still'
import { onBotReaction, type Reaction } from './reactions'
import { ARC_POOL, DOT_POOL, PART_POOL, collectNodes, paintFrame, type AvatarNodes } from './paint'
import { currentPointer, prefersReducedMotion, subscribeFrame, subscribeReducedMotion, trackPointer } from './runtime'

export interface AvatarPoint {
  /** coordenadas de cliente (como las de un PointerEvent) */
  x: number
  y: number
}

/**
 * Hacia dónde mira el avatar cuando su estado lo permite (reposo, escuchando, hablando,
 * aprobación):
 * - `'pointer'` (por defecto): sigue al cursor (nunca al dedo en pantallas táctiles).
 * - un elemento o ref (el campo de texto, la tarjeta de aprobación): mira su centro.
 * - un punto `{ x, y }` en coordenadas de cliente (p. ej. el cursor de texto).
 * - `'none'`: solo su propia deriva.
 */
export type AvatarLookAt = 'pointer' | 'none' | AvatarPoint | Element | RefObject<Element | null>

export interface AssistantAvatarProps {
  /** aspecto guardado del asistente; datos viejos o raros se reparan (nunca falla) */
  spec?: Partial<AvatarSpec> | null
  state?: AvatarState
  /** lado en px; nítido de 16 a 240 (por defecto 40) */
  size?: number
  /** cara de reposo distinta (p. ej. 'happy' junto a un mensaje de éxito) */
  expression?: ExpressionId
  lookAt?: AvatarLookAt
  /** false = un frame quieto y representativo, sin bucle (miniaturas, listas) */
  animated?: boolean
  /** fuerza el modo de movimiento reducido; por defecto sigue la preferencia del sistema */
  reducedMotion?: boolean
  /** segundos de reposo sin actividad antes de dormirse (false = nunca; por defecto nunca) */
  sleepAfter?: number | false
  /** recibe las reacciones del asistente activo (teclas, mensajes, herramientas) */
  reactive?: boolean
  /** al tocarlo, saluda */
  pokeable?: boolean
  /** etiqueta accesible; sin ella el avatar es decorativo (aria-hidden) */
  title?: string
  className?: string
  /** color CSS del cuerpo que reemplaza al de la paleta (compatibilidad con MarcoAvatar) */
  color?: string
  /** color CSS de los ojos que reemplaza al de la paleta (compatibilidad con MarcoAvatar) */
  eyeColor?: string
}

/** Delta máximo por frame: una pestaña oculta no salta hacia adelante al volver. */
const MAX_DT = 0.064
const VB = HALF_VIEWBOX
const range = (n: number) => Array.from({ length: n }, (_, i) => i)

/** Ojos algo más grandes en tamaños chicos para que se lean. */
export function eyeScaleFor(size: number): number {
  if (size <= 24) return 1.2
  if (size <= 36) return 1.1
  return 1
}

/** Desfase de vida estable por instancia (0–60 s): avatares vecinos no parpadean a la vez. */
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

function elementCenter(el: Element | null): AvatarPoint | null {
  if (!el) return null
  const box = el.getBoundingClientRect()
  if (!(box.width > 0 || box.height > 0)) return null
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

function resolveTarget(target: Exclude<AvatarLookAt, 'pointer' | 'none'>): AvatarPoint | null {
  if (typeof Element !== 'undefined' && target instanceof Element) return elementCenter(target)
  if ('current' in target) return elementCenter(target.current)
  if ('x' in target && Number.isFinite(target.x) && Number.isFinite(target.y)) return { x: target.x, y: target.y }
  return null
}

/** Caja del SVG: se agranda (cuadrada) si el accesorio sobresale, así nada se corta. */
export function avatarViewBox(accessory: string | undefined, shape?: string): { x: number; y: number; size: number } {
  const room = accessoryDef(accessory).room
  const top = room.top * RADIUS
  const bottom = room.bottom * RADIUS
  const side = room.side * RADIUS
  const size = Math.max(2 * VB + 2 * side, 2 * VB + top + bottom)
  // la ventana lleva alféizar: se centra el conjunto, no solo el cuerpo
  const cy = (bottom - top) / 2 + (shape === 'window' ? WINDOW_GEOMETRY.centerY * RADIUS : 0)
  return { x: -size / 2, y: cy - size / 2, size }
}

function tone(color: string, percent: number): string {
  return percent >= 100 ? color : `color-mix(in oklab, ${color} ${percent}%, white)`
}

interface Rig {
  engine: AvatarEngine
  director: AvatarDirector
  /** reloj de escena en segundos; solo avanza mientras el avatar está a la vista */
  clock: number
  /** instante en que termina un saludo y vuelve al estado pedido (0 = ninguno) */
  waveUntil: number
}

/** Lo que dura el saludo antes de volver al estado pedido. */
const WAVE_SECONDS = 1.6

function designOf(spec: AvatarSpec): AvatarDesign {
  return { shape: spec.shape, eyes: spec.eyes, motion: spec.motion, accessory: spec.accessory }
}

export const AssistantAvatar = memo(function AssistantAvatar({
  spec: rawSpec,
  state = 'idle',
  size = 40,
  expression,
  lookAt = 'pointer',
  animated = true,
  reducedMotion,
  sleepAfter = false,
  reactive = false,
  pokeable = false,
  title,
  className,
  color,
  eyeColor,
}: AssistantAvatarProps) {
  // los ids de React traen caracteres que rompen url(#…)
  const uid = `av-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const systemReduced = usePrefersReducedMotion()
  const reduced = reducedMotion ?? systemReduced
  const eyeScale = eyeScaleFor(size)

  // la forma guardada puede venir incompleta o vieja: se repara antes de usarla
  const specKey = JSON.stringify(rawSpec ?? null)
  // la clave serializada es la dependencia: un objeto nuevo con el mismo contenido no rehace nada
  const spec = useMemo(() => normalizeAvatarSpec(rawSpec ?? {}), [specKey])
  const design = useMemo(() => designOf(spec), [spec])
  const colors = useMemo(() => resolveAvatarColors(spec), [spec])
  const accessory = accessoryDef(spec.accessory)
  const box = avatarViewBox(spec.accessory, spec.shape)

  // un motor y un director por instancia, creados una sola vez (también en StrictMode)
  const [rig] = useState<Rig>(() => {
    const engine = new AvatarEngine({ lifeOffset: lifeOffsetFor(uid), reducedMotion: reduced, eyeScale, design })
    return {
      engine,
      director: new AvatarDirector(engine, state, 0, {
        sleepAfter: sleepAfter === false ? null : sleepAfter,
        restExpression: expression ?? null,
      }),
      clock: 0,
      waveUntil: 0,
    }
  })

  const svgRef = useRef<SVGSVGElement>(null)
  const nodesRef = useRef<AvatarNodes | null>(null)
  const lookAtRef = useRef<AvatarLookAt>(lookAt)
  const sizeRef = useRef(size)
  const stateRef = useRef(state)
  const reducedRef = useRef(reduced)

  useLayoutEffect(() => {
    lookAtRef.current = lookAt
    sizeRef.current = size
    stateRef.current = state
    reducedRef.current = reduced
  })

  /** Una reacción mantiene despierto al avatar; saludar o tocarlo se ve solo si está en reposo. */
  const react = useCallback(
    (kind: Reaction) => {
      rig.director.poke(rig.clock)
      if ((kind !== 'greet' && kind !== 'poke') || stateRef.current !== 'idle' || reducedRef.current) return
      rig.director.request('swirl', rig.clock)
      rig.waveUntil = rig.clock + WAVE_SECONDS
    },
    [rig],
  )

  useEffect(() => (reactive ? onBotReaction(react) : undefined), [reactive, react])

  // la estructura del SVG cambia con el accesorio, la forma o el tamaño: se vuelven a buscar los nodos
  useLayoutEffect(() => {
    nodesRef.current = null
  }, [spec.accessory, spec.shape, size])

  const paint = useCallback(
    (frame: AvatarFrame) => {
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
  useEffect(() => rig.director.setSleepAfter(sleepAfter === false ? null : sleepAfter, rig.clock), [rig, sleepAfter])
  useLayoutEffect(() => rig.engine.setDesign(design, rig.clock), [rig, design])
  useLayoutEffect(() => rig.director.setRestExpression(expression ?? null, rig.clock), [rig, expression])
  useLayoutEffect(() => {
    rig.waveUntil = 0
    rig.director.request(state, rig.clock)
  }, [rig, state])

  // miniatura quieta: se repinta solo cuando cambia algo que se ve
  useLayoutEffect(() => {
    if (!animated) paint(stillFrame(state, { eyeScale, design, expression }))
  }, [animated, state, eyeScale, size, design, expression, paint])

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
      const rect = svg.getBoundingClientRect()
      if (!(rect.width > 0 && rect.height > 0)) return null
      const kind: AimKind = target === 'pointer' ? 'pointer' : 'target'
      const point = target === 'pointer' ? currentPointer() : resolveTarget(target)
      if (!point) return null
      const n = normalizeAim(
        point,
        { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        { width: window.innerWidth, height: window.innerHeight },
      )
      return n ? { ...n, kind } : null
    }

    const tick = (ms: number) => {
      const dt = last ? Math.min((ms - last) / 1000, MAX_DT) : 0
      last = ms
      rig.clock += dt
      if (rig.waveUntil && rig.clock >= rig.waveUntil) {
        rig.waveUntil = 0
        rig.director.request(stateRef.current, rig.clock)
      }
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

  const style = {
    '--av-body': color ?? colors.body,
    '--av-body-dark': color ?? colors.bodyDark,
    '--av-eye': eyeColor ?? colors.eye,
    '--av-accent': colors.accent,
  } as CSSProperties
  const fill = 'var(--av-fill)'
  const faceMode = accessory.face
  const big = box.size * 2

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox={`${box.x} ${box.y} ${box.size} ${box.size}`}
      overflow="visible"
      className={clsx(
        'shrink-0 select-none',
        '[--av-fill:var(--av-body)] dark:[--av-fill:var(--av-body-dark)]',
        className,
      )}
      style={style}
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      data-avatar-state={state}
      onClick={pokeable ? () => react('poke') : undefined}
      data-avatar-shape={spec.shape}
    >
      <defs>
        <clipPath id={`${uid}-clip`}>
          <path data-av="clip" />
        </clipPath>
        <mask id={`${uid}-notch`} maskUnits="userSpaceOnUse" x={-big / 2} y={-big / 2} width={big} height={big}>
          <rect x={-big / 2} y={-big / 2} width={big} height={big} fill="#fff" />
          <circle data-av="notch" r="0" fill="#000" />
        </mask>
        {RINGS.map((seed, i) => {
          const g = ringGradient(seed, RADIUS)
          const t = RING_TONES[i]
          const base = t.tone === 'accent' ? 'var(--av-accent)' : fill
          return (
            <linearGradient key={i} id={`${uid}-ring-${i}`} gradientUnits="userSpaceOnUse" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>
              {t.stops.map((percent, j) => (
                <stop key={j} offset={j / 2} style={{ stopColor: tone(base, percent) }} />
              ))}
            </linearGradient>
          )
        })}
      </defs>

      {/* mitad trasera de los anillos: va antes del cuerpo, que la tapa */}
      <g fill="none" strokeLinecap="round">
        {range(ARC_POOL).map((i) => (
          <path key={i} data-av={`arc-back-${i}`} display="none" />
        ))}
      </g>

      {/* piezas de accesorio que van detrás (vincha, lápiz) */}
      {range(PART_POOL).map((i) =>
        accessory.parts[i]?.layer === 'back' ? (
          <g key={i} data-av={`part-${i}`} display="none">
            {size >= accessory.parts[i].minSize ? <AccessoryPartArt id={spec.accessory} index={i} /> : null}
          </g>
        ) : null,
      )}

      <g data-av="body-group">
        {/* ventana: el alféizar sigue al cuerpo y se va cuando la pose no muestra la silueta */}
        {spec.shape === 'window' ? (
          <g data-av="local" display="none">
            <WindowSill stroke={colors.outline ?? undefined} />
          </g>
        ) : null}
        <path
          data-av="body"
          style={{ fill, stroke: colors.outline ?? 'none', strokeWidth: colors.outline ? 1 : 0 }}
          vectorEffect="non-scaling-stroke"
        />
        {/* ojos opacos recortados por la silueta: al acercarse al borde se cortan solos */}
        <g clipPath={`url(#${uid}-clip)`} style={{ fill: 'var(--av-eye)' }}>
          <path data-av="eye-0" display="none" />
          <path data-av="eye-1" display="none" />
        </g>
        {/* lentes: siguen a los ojos sobre la esfera y también se recortan con el cuerpo */}
        <g clipPath={`url(#${uid}-clip)`} data-av="face" data-mode={faceMode ?? 'none'} display="none">
          {faceMode === 'visor' ? (
            <>
              <path
                data-av="face-lines"
                fill="none"
                strokeLinecap="round"
                style={{ stroke: 'color-mix(in oklab, var(--av-accent) 60%, black)', strokeWidth: 5 }}
              />
              <path data-av="visor" style={{ fill: 'var(--av-accent)', fillOpacity: 0.34, stroke: 'var(--av-accent)', strokeWidth: 3.5 }} strokeLinejoin="round" />
            </>
          ) : (
            <>
              <path data-av="face-lines" fill="none" strokeLinecap="round" style={{ stroke: 'var(--av-eye)', strokeWidth: 4.2, strokeOpacity: 0.92 }} />
              <circle data-av="rim-0" style={{ fill: 'var(--av-eye)', fillOpacity: 0.1, stroke: 'var(--av-eye)', strokeWidth: 4.6, strokeOpacity: 0.92 }} />
              <circle data-av="rim-1" style={{ fill: 'var(--av-eye)', fillOpacity: 0.1, stroke: 'var(--av-eye)', strokeWidth: 4.6, strokeOpacity: 0.92 }} />
            </>
          )}
        </g>
      </g>

      <g>
        {range(DOT_POOL).map((i) => (
          <circle key={i} data-av={`dot-${i}`} display="none" style={{ fill }} />
        ))}
      </g>

      <circle data-av="pill" display="none" />

      {/* piezas de accesorio que van delante (casco, gorro, corbatín, huincha) */}
      {range(PART_POOL).map((i) =>
        accessory.parts[i] && accessory.parts[i].layer !== 'back' ? (
          <g key={i} data-av={`part-${i}`} display="none">
            {size >= accessory.parts[i].minSize ? <AccessoryPartArt id={spec.accessory} index={i} /> : null}
          </g>
        ) : null,
      )}

      {/* mitad delantera de los anillos */}
      <g fill="none" strokeLinecap="round">
        {range(ARC_POOL).map((i) => (
          <path key={i} data-av={`arc-front-${i}`} display="none" />
        ))}
      </g>
    </svg>
  )
})
