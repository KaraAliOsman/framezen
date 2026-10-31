import type { Catalog, Layout, WindowDesign } from '@framezen/engine'
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { type ComponentRef, memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { MathUtils, type PerspectiveCamera, Spherical, Vector3 } from 'three'
import { buildWindowModel, type BuildWindowModelInput, type WindowModel } from './model/buildWindowModel'
import { clamp01 } from './model/kinematics'
import type { Viewer3DView } from './types'

export const PAPER = '#FAF8F5'

/** Ángulo de tres cuartos y límites de la cámara (radianes). */
const VIEW_YAW = 0.42
const VIEW_PITCH = 1.36
const AZIMUTH_LIMIT = 1.0
const SWAY_AMPLITUDE = 0.45
const SWAY_SPEED = 0.32
const SWAY_IDLE_MS = 2600
const TRANSITION_S = 0.65
const OPEN_RATE = 11

type ControlsImpl = ComponentRef<typeof OrbitControls>

export interface Window3DSceneProps {
  layout: Layout
  design: WindowDesign
  catalog: Catalog
  openAmount: number
  autoRotate: boolean
  view: Viewer3DView
  reducedMotion: boolean
  /** false cuando el visor está fuera de pantalla: se detiene el balanceo. */
  active?: boolean
  onReady?: () => void
}

/** Solo lo que el modelo usa del catálogo: así un catálogo grande no reconstruye la escena. */
function reduceInput(layout: Layout, design: WindowDesign, catalog: Catalog): BuildWindowModelInput {
  const colorIds = new Set([design.colorId, design.colorInId].filter(Boolean))
  const glassIds = new Set([design.glassId, ...layout.panes.map((pane) => pane.glassId)].filter(Boolean))
  return {
    layout,
    design,
    catalog: {
      colors: catalog.colors.filter((color) => colorIds.has(color.id)),
      lines: catalog.lines
        .filter((line) => line.id === design.lineId)
        .map((line) => ({ ...line, hardwareRules: [], accessoryRules: [], profiles: {}, typologyIds: [], colorIds: [] })),
      glass: catalog.glass.filter((glass) => glassIds.has(glass.id)),
      brands: [],
      profiles: [],
      items: [],
      brandSettings: [],
    },
  }
}

function modelKey(input: BuildWindowModelInput): string {
  const { layout, design, catalog } = input
  return JSON.stringify([
    layout,
    design.lineId,
    design.colorId,
    design.colorInId ?? null,
    design.glassId,
    catalog.colors.map((color) => [color.id, color.hex, color.name]),
    catalog.lines.map((line) => line.depth ?? null),
    catalog.glass.map((glass) => [glass.id, glass.kind, glass.thickness]),
  ])
}

export function Window3DScene({ layout, design, catalog, openAmount, autoRotate, view, reducedMotion, active = true, onReady }: Window3DSceneProps) {
  const input = useMemo(() => reduceInput(layout, design, catalog), [layout, design, catalog])
  const key = useMemo(() => modelKey(input), [input])
  // Se reconstruye solo si cambia el contenido (la clave), no la identidad de los objetos.
  const model = useMemo(() => buildWindowModel(input), [key])
  useEffect(() => () => model.dispose(), [model])

  return (
    <>
      <color attach="background" args={[PAPER]} />
      <StudioLighting />
      <primitive object={model.root} />
      <OpeningAnimator model={model} openAmount={openAmount} reducedMotion={reducedMotion} />
      <ContactShadows
        position={[0, -0.001, 0]}
        scale={[model.size.width * 1.7 + 1.4, model.size.width + 1.6]}
        far={Math.max(0.4, Math.min(model.size.height, 1.4))}
        blur={2.6}
        opacity={0.42}
        resolution={512}
        color="#3B342C"
      />
      <CameraRig size={model.size} reach={model.reach} view={view} autoRotate={autoRotate && active} reducedMotion={reducedMotion} />
      <FirstFrame onReady={onReady} />
    </>
  )
}

/** Estudio suave: entorno con paneles de luz (sin descargas) y una luz principal cálida. */
const StudioLighting = memo(function StudioLighting() {
  return (
    <>
      <hemisphereLight args={['#FFFFFF', '#EDEAE5', 0.45]} />
      <directionalLight position={[2.6, 4.2, 3.4]} intensity={1.1} color="#FFFDF9" />
      <directionalLight position={[-3, 2.4, -2.6]} intensity={0.4} color="#EEF1FA" />
      <Environment resolution={256} frames={1}>
        <color attach="background" args={['#E6E4E0']} />
        <Lightformer form="rect" intensity={2.4} position={[0, 6, 1.5]} scale={[10, 5, 1]} />
        <Lightformer form="rect" intensity={1.3} position={[-6, 2, 1.5]} scale={[5, 3.5, 1]} />
        <Lightformer form="rect" intensity={1.3} position={[6, 2, 1.5]} scale={[5, 3.5, 1]} />
        <Lightformer form="rect" intensity={0.9} position={[0, 2, 7]} scale={[9, 2.5, 1]} />
        <Lightformer form="rect" intensity={0.9} position={[0, 2, -7]} scale={[9, 2.5, 1]} />
        <Lightformer form="rect" intensity={0.45} color="#F2EEE8" position={[0, -3, 0]} scale={[12, 12, 1]} />
        {/* Franjas altas frente a la ventana: el reflejo diagonal sutil del vidrio. */}
        <Lightformer form="rect" intensity={2.6} position={[-2.6, 1.6, 4.5]} rotation={[0, -0.5, 0.22]} scale={[0.8, 8, 1]} />
        <Lightformer form="rect" intensity={1.8} position={[-1.5, 1.6, 4.9]} rotation={[0, -0.3, 0.22]} scale={[0.3, 8, 1]} />
        <Lightformer form="rect" intensity={2.6} position={[2.6, 1.6, -4.5]} rotation={[0, Math.PI - 0.5, -0.22]} scale={[0.8, 8, 1]} />
        <Lightformer form="rect" intensity={1.8} position={[1.5, 1.6, -4.9]} rotation={[0, Math.PI - 0.3, -0.22]} scale={[0.3, 8, 1]} />
      </Environment>
    </>
  )
})

/** Lleva la apertura hacia `openAmount` con un amortiguado suave (~250 ms). */
function OpeningAnimator({ model, openAmount, reducedMotion }: { model: WindowModel; openAmount: number; reducedMotion: boolean }) {
  const current = useRef(clamp01(openAmount))
  const invalidate = useThree((state) => state.invalidate)

  useLayoutEffect(() => {
    model.setOpenAmount(current.current)
    invalidate()
  }, [model, invalidate])

  useEffect(() => {
    invalidate()
  }, [openAmount, reducedMotion, invalidate])

  useFrame((_, delta) => {
    const target = clamp01(openAmount)
    let value = current.current
    if (value === target) return
    if (reducedMotion) {
      value = target
    } else {
      value += (target - value) * (1 - Math.exp(-Math.min(delta, 0.1) * OPEN_RATE))
      if (Math.abs(target - value) < 0.0008) value = target
    }
    current.current = value
    model.setOpenAmount(value)
    invalidate()
  })
  return null
}

/** Distancia para que la ventana (y sus hojas abiertas) quepan con aire alrededor. */
function fitDistance(size: WindowModel['size'], reach: number, fovDeg: number, aspect: number): number {
  const halfV = MathUtils.degToRad(fovDeg) / 2
  const halfH = Math.atan(Math.tan(halfV) * Math.max(0.2, aspect))
  const byHeight = size.height / 2 / Math.tan(halfV)
  const byWidth = (size.width * Math.cos(VIEW_YAW) + (size.depth + reach) * Math.sin(VIEW_YAW)) / 2 / Math.tan(halfH)
  return Math.max(byHeight * 1.26, byWidth * 1.42, 0.8) + size.depth / 2 + reach * 0.8
}

function wrapAngle(angle: number): number {
  let a = angle
  while (a > Math.PI) a -= 2 * Math.PI
  while (a <= -Math.PI) a += 2 * Math.PI
  return a
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

interface Transition {
  from: Spherical
  to: Spherical
  elapsed: number
}

/**
 * Cámara orbital limitada: tres cuartos al abrir, giro acotado alrededor del lado elegido,
 * transición suave entre interior y exterior y balanceo lento opcional.
 */
function CameraRig({
  size,
  reach,
  view,
  autoRotate,
  reducedMotion,
}: {
  size: WindowModel['size']
  reach: number
  view: Viewer3DView
  autoRotate: boolean
  reducedMotion: boolean
}) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera
  const aspect = useThree((state) => state.size.width / Math.max(1, state.size.height))
  const invalidate = useThree((state) => state.invalidate)
  const controls = useRef<ControlsImpl>(null)
  const transition = useRef<Transition | null>(null)
  const initialized = useRef(false)
  const interacting = useRef(false)
  const idleSince = useRef(0)
  const swayPhase = useRef<number | null>(null)
  const wakeTimer = useRef<number | null>(null)
  const scratch = useMemo(() => ({ offset: new Vector3(), spherical: new Spherical() }), [])

  const normal = view === 'exterior' ? Math.PI : 0
  const target = useMemo(() => new Vector3(0, size.height * 0.47, 0), [size.height])
  const distance = useMemo(() => fitDistance(size, reach, camera.fov ?? 30, aspect), [size, reach, camera, aspect])

  const applyLimits = (enabled: boolean) => {
    const c = controls.current
    if (!c) return
    c.minAzimuthAngle = enabled ? normal - AZIMUTH_LIMIT : -Infinity
    c.maxAzimuthAngle = enabled ? normal + AZIMUTH_LIMIT : Infinity
  }

  const placeCamera = (spherical: Spherical) => {
    scratch.offset.setFromSpherical(spherical)
    camera.position.copy(target).add(scratch.offset)
    camera.lookAt(target)
  }

  useLayoutEffect(() => {
    const c = controls.current
    camera.near = Math.max(0.01, distance / 80)
    camera.far = distance * 12
    camera.updateProjectionMatrix()
    if (c) c.target.copy(target)
    const to = new Spherical(distance, VIEW_PITCH, normal + VIEW_YAW)
    if (!initialized.current || reducedMotion) {
      initialized.current = true
      transition.current = null
      placeCamera(to)
      applyLimits(true)
      c?.update()
    } else {
      const from = scratch.spherical.setFromVector3(scratch.offset.copy(camera.position).sub(target)).clone()
      transition.current = { from, to, elapsed: 0 }
      applyLimits(false)
    }
    swayPhase.current = null
    invalidate()
    // Solo reencuadra al cambiar la vista, el tamaño o la preferencia de movimiento.
  }, [view, distance, target, reducedMotion])

  useEffect(() => {
    swayPhase.current = null
    invalidate()
  }, [autoRotate, invalidate])

  useEffect(
    () => () => {
      if (wakeTimer.current !== null) window.clearTimeout(wakeTimer.current)
    },
    [],
  )

  useFrame((_, rawDelta) => {
    const c = controls.current
    if (!c) return
    const delta = Math.min(rawDelta, 0.05)

    const move = transition.current
    if (move) {
      move.elapsed += Math.min(rawDelta, 0.1)
      const t = easeInOut(Math.min(1, move.elapsed / TRANSITION_S))
      const dTheta = wrapAngle(move.to.theta - move.from.theta)
      const sweep = Math.abs(Math.abs(dTheta) - Math.PI) < 0.01 ? Math.PI : dTheta
      placeCamera(
        new Spherical(
          MathUtils.lerp(move.from.radius, move.to.radius, t),
          MathUtils.lerp(move.from.phi, move.to.phi, t),
          move.from.theta + sweep * t,
        ),
      )
      c.update()
      if (t >= 1) {
        transition.current = null
        applyLimits(true)
      }
      invalidate()
      return
    }

    if (!autoRotate || reducedMotion || interacting.current) return
    const waited = performance.now() - idleSince.current
    if (waited < SWAY_IDLE_MS) {
      // Sin cuadros en espera: se agenda uno para cuando termine la pausa.
      if (wakeTimer.current === null) {
        wakeTimer.current = window.setTimeout(() => {
          wakeTimer.current = null
          invalidate()
        }, SWAY_IDLE_MS - waited + 40)
      }
      return
    }
    scratch.spherical.setFromVector3(scratch.offset.copy(camera.position).sub(c.target))
    const theta = scratch.spherical.theta
    if (swayPhase.current === null) {
      swayPhase.current = Math.asin(MathUtils.clamp(wrapAngle(theta - normal) / SWAY_AMPLITUDE, -1, 1))
    }
    swayPhase.current += delta * SWAY_SPEED
    const desired = normal + SWAY_AMPLITUDE * Math.sin(swayPhase.current)
    scratch.spherical.theta = theta + wrapAngle(desired - theta) * Math.min(1, delta * 2.5)
    scratch.offset.setFromSpherical(scratch.spherical)
    camera.position.copy(c.target).add(scratch.offset)
    c.update()
    invalidate()
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.09}
      rotateSpeed={0.55}
      zoomSpeed={0.6}
      minDistance={distance * 0.6}
      maxDistance={distance * 1.7}
      minPolarAngle={Math.PI * 0.28}
      maxPolarAngle={Math.PI * 0.53}
      onStart={() => {
        interacting.current = true
        swayPhase.current = null
        if (transition.current) {
          transition.current = null
          applyLimits(true)
        }
      }}
      onEnd={() => {
        interacting.current = false
        idleSince.current = performance.now()
        invalidate()
      }}
    />
  )
}

/** Avisa cuando se dibujó el primer cuadro (para el fundido de entrada). */
function FirstFrame({ onReady }: { onReady?: () => void }) {
  const done = useRef(false)
  useFrame(() => {
    if (done.current) return
    done.current = true
    if (onReady) requestAnimationFrame(() => onReady())
  })
  return null
}
