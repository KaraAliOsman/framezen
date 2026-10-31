import { Canvas, type RootState } from '@react-three/fiber'
import clsx from 'clsx'
import { Rotate3d } from 'lucide-react'
import { Component, type CSSProperties, type ErrorInfo, type ReactNode, type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { NeutralToneMapping } from 'three'
import type { Window3DProps } from './types'
import { useReducedMotion } from './useReducedMotion'
import { Viewer3DUnavailable } from './Viewer3DMessage'
import { isWebGLAvailable } from './webgl'
import { PAPER, Window3DScene } from './Window3DScene'

const GL_PROPS = {
  antialias: true,
  // Con alpha la sombra de contacto se limpia en transparente; el fondo papel lo pone la escena.
  alpha: true,
  powerPreference: 'high-performance',
  toneMapping: NeutralToneMapping,
  toneMappingExposure: 1,
} as const

const CAMERA = { fov: 30, near: 0.05, far: 60, position: [0, 1, 4] as [number, number, number] }
const DPR: [number, number] = [1, 2]
const HINT_MS = 4500

const mm = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 })

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
export function Window3D({ layout, design, catalog, openAmount = 0, autoRotate = false, view = 'interior', className, height = 420 }: Window3DProps) {
  const [supported] = useState(() => isWebGLAvailable())
  const [failed, setFailed] = useState(false)
  const [lost, setLost] = useState(false)
  const [ready, setReady] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [hint, setHint] = useState(true)
  const reducedMotion = useReducedMotion()
  const containerRef = useRef<HTMLDivElement>(null)
  const visible = useInView(containerRef)
  const detachRef = useRef<(() => void) | null>(null)
  // Lienzo vigente: al desmontar, R3F fuerza la pérdida de contexto del lienzo viejo y ese aviso se ignora.
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const style: CSSProperties = { height: typeof height === 'number' ? `${height}px` : height, backgroundColor: PAPER }

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

  const label = `Ventana en 3D de ${mm.format(layout.width)} × ${mm.format(layout.height)} mm, vista ${view === 'exterior' ? 'exterior' : 'interior'}. Arrastra para girarla.`

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
          <Canvas frameloop="demand" dpr={DPR} gl={GL_PROPS} camera={CAMERA} onCreated={onCreated}>
            <Window3DScene
              layout={layout}
              design={design}
              catalog={catalog}
              openAmount={openAmount}
              autoRotate={autoRotate}
              view={view}
              reducedMotion={reducedMotion}
              active={visible}
              onReady={onReady}
            />
          </Canvas>
        </Viewer3DErrorBoundary>
      </div>

      <div
        aria-hidden
        className={clsx(
          'pointer-events-none absolute inset-x-0 bottom-3 flex justify-center transition-opacity duration-[240ms] ease-[cubic-bezier(.2,0,0,1)]',
          ready && hint && !lost ? 'opacity-100' : 'opacity-0',
        )}
      >
        <span className="inline-flex items-center gap-1.5 rounded-full border border-paper-200 bg-paper-0 px-2.5 py-1 text-[12px] leading-4 text-paper-600">
          <Rotate3d size={14} strokeWidth={1.75} aria-hidden />
          Arrastra para girar
        </span>
      </div>

      {lost && (
        <div className="absolute inset-0 flex items-center justify-center bg-paper-50/90 p-6" role="status">
          <div className="flex max-w-[300px] flex-col items-center gap-3 text-center">
            <p className="text-[14px] font-medium leading-5 text-paper-900">La vista 3D se pausó</p>
            <p className="text-[13px] leading-[18px] text-paper-600">El navegador liberó memoria gráfica. Tu ventana está intacta.</p>
            <button
              type="button"
              onClick={retry}
              className="h-9 rounded-[6px] border border-paper-350 bg-paper-0 px-3 text-[14px] font-medium text-paper-900 transition-colors duration-[120ms] hover:bg-paper-100"
            >
              Volver a mostrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default Window3D
