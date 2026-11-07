import type { TextureSources } from '@dekopen/documents'
import type { Catalog, Layout, WindowDesign } from '@dekopen/engine'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { type ComponentRef, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MathUtils, type PerspectiveCamera, PMREMGenerator, Spherical, Vector3 } from 'three'
import { buildSceneModel, reduceCatalog } from './model/assembly'
import type { BuildWindowModelInput, WindowModel } from './model/buildWindowModel'
import { clamp01 } from './model/kinematics'
import { applyGlassLook } from './model/materials'
import { createStudioTexture } from './studio/hdri'
import type { StudioLook } from './studio/look'
import type { ViewerTier } from './tier'
import type { Viewer3DView } from './types'

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
  /** Puesta en escena (exposición, luz y sombra) según el color y el tema. */
  look: StudioLook
  tier: ViewerTier
  /** Texturas subidas (data URL) y versión de la caché de teselas integradas (reconstruye al llegar). */
  textures?: TextureSources
  texturesVersion?: number
  onReady?: () => void
  /** Avisa si lo que se muestra se puede abrir. */
  onMovable?: (movable: boolean) => void
}

function modelKey(input: BuildWindowModelInput, texturesVersion: number): string {
  const { layout, design, catalog, textures } = input
  return JSON.stringify([
    texturesVersion,
    textures?.uploads ? Object.entries(textures.uploads).map(([id, source]) => [id, source.href.length, source.href.slice(-16), source.scaleMm ?? null]) : null,
    layout,
    design.lineId,
    design.colorId,
    design.colorInId ?? null,
    design.glassId,
    catalog.colors.map((color) => [color.id, color.hex, color.name, color.texture ?? null]),
    catalog.lines.map((line) => line.depth ?? null),
    catalog.glass.map((glass) => [glass.id, glass.kind, glass.thickness]),
  ])
}

export function Window3DScene({
  layout,
  design,
  catalog,
  openAmount,
  autoRotate,
  view,
  reducedMotion,
  active = true,
  look,
  tier,
  textures,
  texturesVersion = 0,
  onReady,
  onMovable,
}: Window3DSceneProps) {
  const invalidate = useThree((state) => state.invalidate)
  const input = useMemo(() => ({ layout, design, catalog: reduceCatalog(layout, design, catalog), textures, onTextureLoad: invalidate }), [layout, design, catalog, textures, invalidate])
  const key = useMemo(() => modelKey(input, texturesVersion), [input, texturesVersion])
  // Se reconstruye solo si cambia el contenido (la clave), no la identidad de los objetos.
  const model = useMemo(() => buildSceneModel(input), [key])
  useEffect(() => () => model.dispose(), [model])
  useEffect(() => onMovable?.(model.movable), [model, onMovable])
  useLayoutEffect(() => {
    applyGlassLook(model.root, look.glass, model.size.height)
    invalidate()
  }, [model, look.glass, invalidate])
  const [moving, setMoving] = useState(false)
  const environmentReady = useStudioEnvironment(look, tier)

  return (
    <>
      <StudioLighting size={model.size} view={view} look={look} tier={tier} />
      <primitive object={model.root} />
      <OpeningAnimator model={model} openAmount={openAmount} reducedMotion={reducedMotion} onMoving={setMoving} />
      <ContactShadows
        position={[0, -0.001, 0]}
        scale={[model.size.width * 1.7 + 1.2, model.size.depth + model.reach + 1.4]}
        far={Math.max(0.4, Math.min(model.size.height, 1.1))}
        blur={1.8}
        opacity={look.shadowOpacity}
        resolution={tier.contactShadow}
        color={look.shadowColor}
        // La sombra se recalcula solo si algo se mueve: orbitar no la cambia y en un teléfono cuesta.
        frames={moving ? Infinity : 1}
      />
      <CameraRig size={model.size} reach={model.reach} view={view} autoRotate={autoRotate && active} reducedMotion={reducedMotion} />
      <FirstFrame enabled={environmentReady} onReady={onReady} />
    </>
  )
}

/** Entorno HDR generado en el navegador: se prefiltra una vez por visor y se libera al desmontar. */
function useStudioEnvironment(look: StudioLook, tier: ViewerTier): boolean {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)
  const invalidate = useThree((state) => state.invalidate)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const hdri = createStudioTexture(tier.environment)
    const generator = new PMREMGenerator(gl)
    const target = generator.fromEquirectangular(hdri)
    hdri.dispose()
    generator.dispose()
    scene.environment = target.texture
    setReady(true)
    invalidate()
    return () => {
      scene.environment = null
      target.dispose()
    }
  }, [gl, scene, tier.environment, invalidate])

  useEffect(() => {
    scene.environmentIntensity = look.environment
    gl.toneMappingExposure = look.exposure
    invalidate()
  }, [gl, scene, look.environment, look.exposure, invalidate])

  return ready
}

/**
 * Luz de estudio: el entorno da el volumen y una luz principal desde arriba a la izquierda (la misma
 * dirección del dibujo 2D) proyecta sombra real: separa hoja, marco y junquillo. Sigue al lado que se mira.
 */
const StudioLighting = memo(function StudioLighting({ size, view, look, tier }: { size: WindowModel['size']; view: Viewer3DView; look: StudioLook; tier: ViewerTier }) {
  const span = Math.max(size.width, size.height) * 0.75 + 0.2
  const front = view === 'interior' ? 1 : -1
  return (
    <>
      {/* Una sola luz con sombra, del lado que se mira: dos mapas de sombra no aportan y cuestan memoria. */}
      <directionalLight
        position={[-1.6 * front, size.height + 1.9, 2.8 * front]}
        intensity={look.key}
        color="#FFF8EE"
        castShadow
        shadow-mapSize={[tier.shadowMap, tier.shadowMap]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.0016}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span + size.height / 2}
        shadow-camera-bottom={-span}
        shadow-camera-near={0.1}
        shadow-camera-far={14}
      />
      <directionalLight position={[1.8 * front, size.height * 0.6 + 0.4, 1.2 * front]} intensity={look.key * 0.22} color="#E9EFFA" />
    </>
  )
})

/** Lleva la apertura hacia `openAmount` con un amortiguado suave (~250 ms). */
function OpeningAnimator({ model, openAmount, reducedMotion, onMoving }: { model: WindowModel; openAmount: number; reducedMotion: boolean; onMoving: (moving: boolean) => void }) {
  const current = useRef(clamp01(openAmount))
  const moving = useRef(false)
  const invalidate = useThree((state) => state.invalidate)
  const setMoving = useCallback(
    (next: boolean) => {
      if (moving.current === next) return
      moving.current = next
      onMoving(next)
    },
    [onMoving],
  )

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
    if (value === target) {
      setMoving(false)
      return
    }
    setMoving(true)
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
function FirstFrame({ enabled, onReady }: { enabled: boolean; onReady?: () => void }) {
  const done = useRef(false)
  useFrame(() => {
    if (done.current || !enabled) return
    done.current = true
    if (onReady) requestAnimationFrame(() => onReady())
  })
  return null
}
