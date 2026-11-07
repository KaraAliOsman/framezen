import { appearanceForColorId, builtinIdsOf, useBuiltinTextures, useTextureSources } from '@dekopen/documents'
import { Canvas, type RootState } from '@react-three/fiber'
import clsx from 'clsx'
import { PanelTopOpen, Rotate3d } from 'lucide-react'
import { Component, type CSSProperties, type ErrorInfo, type ReactNode, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NeutralToneMapping } from 'three'
import { useFormat, useT } from '../../lib/i18n'
import es from './i18n/es'
import type { Window3DProps } from './types'
import { useReducedMotion } from './useReducedMotion'
import { Viewer3DUnavailable } from './Viewer3DMessage'
import { isWebGLAvailable } from './webgl'
import { designsOf } from './model/assembly'
import { backdropCss, luminanceOfHex, studioLook } from './studio/look'
import { detectViewerTier } from './tier'
import { Window3DScene } from './Window3DScene'

const GL_PROPS = {
  antialias: true,
  // Lienzo transparente: el fondo de estudio es CSS, y sombra y vidrio se componen sobre él sin más pases.
  alpha: true,
  powerPreference: 'high-performance',
  toneMapping: NeutralToneMapping,
  toneMappingExposure: 1,
} as const

const CAMERA = { fov: 30, near: 0.05, far: 60, position: [0, 1, 4] as [number, number, number] }
const HINT_MS = 4500

/** ¿El tema vigente es oscuro? Sale de `--dk-canvas` y se vuelve a leer al cambiar claro/oscuro. */
function useDarkTheme(ref: RefObject<HTMLElement | null>): boolean {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const read = () => {
      const element = ref.current
      if (!element) return
      const value = getComputedStyle(element).getPropertyValue('--dk-canvas').trim()
      setDark(/^#[0-9a-f]{6}/i.test(value) && luminanceOfHex(value) < 0.1)
    }
    read()
    if (typeof MutationObserver === 'undefined') return
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'], subtree: false })
    return () => observer.disconnect()
  }, [ref])
  return dark
}

class Viewer3DErrorBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.warn('[viewer3d] No se pudo dibujar la vista 3D.', error, info.componentStack)
    this.props.onError()
  }

  override render() {
    return this.state.failed ? null : this.props.children
  }
}

/** true mientras el elemento está (aunque sea en parte) en pantalla. */
function useInView(ref: RefObject<HTMLElement | null>): boolean {
  const [inView, setInView] = useState(true)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? true), { threshold: 0.01 })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return inView
}

/**
 * Ventana en 3D: la misma geometría del dibujo, con su color, vidrio y apertura animada.
 * Pensado para cargarse con React.lazy (ver `lazy.tsx`). Si el navegador no puede dibujar
 * en 3D, muestra un mensaje tranquilo y nada se rompe.
 */
export function Window3D({ layout, design, catalog, openAmount, autoRotate = false, view = 'interior', className, height = 420, textures, overlay }: Window3DProps) {
  const t = useT(es)
  const fmt = useFormat()
  const [supported] = useState(() => isWebGLAvailable())
  const [failed, setFailed] = useState(false)
  const [lost, setLost] = useState(false)
  const [ready, setReady] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [hint, setHint] = useState(true)
  const reducedMotion = useReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)
  const visible = useInView(containerRef)
  const dark = useDarkTheme(containerRef)
  const [tier] = useState(detectViewerTier)
  const [movable, setMovable] = useState(false)
  const [openHere, setOpenHere] = useState(false)
  // Mismas texturas que el dibujo 2D: las subidas llegan por prop o por `TextureProvider`; las integradas se
  // cargan aquí (fuera del lienzo, que usa otro reconciliador) y la versión reconstruye el modelo al llegar.
  const contextTextures = useTextureSources()
  const sources = textures ?? contextTextures
  const designs = designsOf(layout, design)
  const texturesVersion = useBuiltinTextures(
    builtinIdsOf(designs.flatMap((item) => [appearanceForColorId(item.colorId, catalog.colors, sources), appearanceForColorId(item.colorInId ?? item.colorId, catalog.colors, sources)])),
  )
  // La escena se ajusta al color que se está mirando: el interior en la vista interior de una bicolor.
  const primary = designs[0] ?? design
  const seen = appearanceForColorId(view === 'interior' ? (primary.colorInId ?? primary.colorId) : primary.colorId, catalog.colors, sources)
  const look = useMemo(() => studioLook({ luminance: seen.luminance, finish: seen.finish, dark }), [seen.luminance, seen.finish, dark])
  const detachRef = useRef<(() => void) | null>(null)
  // Lienzo vigente: al desmontar, R3F fuerza la pérdida de contexto del lienzo viejo y ese aviso se ignora.
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const style: CSSProperties = { height: typeof height === 'number' ? `${height}px` : height, backgroundColor: look.backdrop.floor, backgroundImage: backdropCss(look.backdrop) }

  const onCreated = useCallback((state: RootState) => {
    detachRef.current?.()
    const canvas = state.gl.domElement
    canvasRef.current = canvas
    const onLost = (event: Event) => {
      if (canvasRef.current !== canvas) return
      event.preventDefault()
      setLost(true)
    }
    const onRestored = () => {
      if (canvasRef.current === canvas) setLost(false)
    }
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    detachRef.current = () => {
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
    }
  }, [])

  useEffect(
    () => () => {
      canvasRef.current = null
      detachRef.current?.()
    },
    [],
  )

  useEffect(() => {
    if (!ready || !hint) return
    const timer = window.setTimeout(() => setHint(false), HINT_MS)
    return () => window.clearTimeout(timer)
  }, [ready, hint])

  const onReady = useCallback(() => setReady(true), [])
  // Sin `openAmount` el visor se encarga de abrir y cerrar; con él, manda quien lo monta.
  const selfOpening = openAmount === undefined
  const amount = selfOpening ? (openHere ? 1 : 0) : openAmount

  const retry = () => {
    canvasRef.current = null
    detachRef.current?.()
    detachRef.current = null
    setLost(false)
    setReady(false)
    setAttempt((value) => value + 1)
  }

  if (!supported || failed) {
    return (
      <div className={clsx('relative isolate overflow-hidden', className)} style={style}>
        <Viewer3DUnavailable />
      </div>
    )
  }

  const label = t('label', { size: fmt.size(layout.width, layout.height), view: t(view === 'exterior' ? 'view.exterior' : 'view.interior') })

  return (
    <div ref={containerRef} className={clsx('relative isolate overflow-hidden', className)} style={style}>
      <div
        role="img"
        aria-label={label}
        className="absolute inset-0 touch-none transition-opacity duration-[240ms] ease-[cubic-bezier(.2,0,0,1)]"
        style={{ opacity: ready ? 1 : 0 }}
        onPointerDown={() => setHint(false)}
        onWheel={() => setHint(false)}
      >
        <Viewer3DErrorBoundary key={attempt} onError={() => setFailed(true)}>
          <Canvas shadows="percentage" frameloop="demand" dpr={tier.dpr} gl={GL_PROPS} camera={CAMERA} onCreated={onCreated}>
            <Window3DScene
              layout={layout}
              design={design}
              catalog={catalog}
              openAmount={amount}
              autoRotate={autoRotate}
              view={view}
              reducedMotion={reducedMotion}
              active={visible}
              look={look}
              tier={tier}
              textures={sources}
              texturesVersion={texturesVersion}
              onReady={onReady}
              onMovable={setMovable}
            />
          </Canvas>
        </Viewer3DErrorBoundary>
      </div>

      <div
        aria-hidden
        className={clsx(
          // Con botones abajo (AR, abrir) el aviso sube: en 390 px no caben en la misma fila.
          'pointer-events-none absolute inset-x-0 flex justify-center transition-opacity duration-[240ms] ease-[cubic-bezier(.2,0,0,1)]',
          overlay || (selfOpening && movable) ? 'bottom-16' : 'bottom-3',
          ready && hint && !lost ? 'opacity-100' : 'opacity-0',
        )}
      >
        <span className="inline-flex items-center gap-1.5 rounded-full border border-divider bg-surface px-2.5 py-1 text-meta text-fg-muted">
          <Rotate3d size={14} strokeWidth={1.75} aria-hidden />
          {t('hint')}
        </span>
      </div>

      {ready && !lost && (overlay || (selfOpening && movable)) ? (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex items-end justify-between gap-2">
          {selfOpening && movable ? (
            <button
              type="button"
              aria-pressed={openHere}
              onClick={() => setOpenHere((value) => !value)}
              className="pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-control border border-divider bg-surface px-3 text-table font-medium text-fg-strong transition-colors duration-[140ms] hover:bg-hover"
            >
              <PanelTopOpen size={15} strokeWidth={1.75} aria-hidden />
              {t(openHere ? 'close' : 'open')}
            </button>
          ) : (
            <span />
          )}
          {overlay ? <div className="pointer-events-auto">{overlay}</div> : null}
        </div>
      ) : null}

      {lost && (
        <div className="absolute inset-0 flex items-center justify-center bg-canvas/90 p-6" role="status">
          <div className="flex max-w-[300px] flex-col items-center gap-3 text-center">
            <p className="text-base font-medium text-fg-strong">{t('lost.title')}</p>
            <p className="text-table text-fg-muted">{t('lost.body')}</p>
            <button
              type="button"
              onClick={retry}
              className="h-10 rounded-control border border-control bg-surface px-3 text-base font-medium text-fg-strong transition-colors duration-[140ms] hover:bg-hover"
            >
              {t('lost.retry')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Window3D
