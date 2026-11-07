import { DirectionalLight, Group, HemisphereLight, Matrix4, Mesh, MeshBasicMaterial, NeutralToneMapping, PerspectiveCamera, PMREMGenerator, Quaternion, RingGeometry, Scene, Vector3, WebGLRenderer } from 'three'
import { createStudioTexture } from '../studio/hdri'
import { type ArSource, buildArScene } from './export'

/**
 * Sesión WebXR en Android: la ventana se genera en el teléfono, sin servidor ni otra app. Pide un plano,
 * muestra un aro donde caería y se fija con un toque; en piso queda de pie mirando a la persona y en una
 * pared queda contra ella. La sesión se pide antes de llamar aquí, dentro del toque del usuario.
 */

export type ArPhase = 'loading' | 'scanning' | 'placed'

export interface ArSessionHandle {
  rotate(degrees: number): void
  end(): void
}

export interface Placement {
  surface: 'floor' | 'wall'
  position: { x: number; y: number; z: number }
  yaw: number
}

/**
 * Dónde queda la ventana según el punto tocado. `pose` es la matriz del plano (su eje Y es la normal),
 * `camera` la posición del teléfono y `height` el alto del modelo. Puro, para probarlo sin dispositivo.
 */
export function placementFromHit(pose: ArrayLike<number>, camera: { x: number; z: number }, height: number): Placement {
  const x = pose[12]
  const y = pose[13]
  const z = pose[14]
  const nx = pose[4]
  const ny = pose[5]
  const nz = pose[6]
  if (Math.abs(ny) > 0.7) return { surface: 'floor', position: { x, y, z }, yaw: Math.atan2(camera.x - x, camera.z - z) }
  // Pared: el interior de la ventana (+Z) mira hacia la sala y el centro queda donde se tocó.
  return { surface: 'wall', position: { x, y: y - height / 2, z }, yaw: Math.atan2(nx, nz) }
}

export async function runArSession(session: XRSession, source: ArSource, events: { onPhase(phase: ArPhase): void; onEnd(): void; onError(error: unknown): void }): Promise<ArSessionHandle> {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('webgl2', { xrCompatible: true, alpha: true, antialias: true }) as WebGL2RenderingContext | null
  if (!context) throw new Error('webgl2')
  const renderer = new WebGLRenderer({ canvas, context, alpha: true })
  renderer.toneMapping = NeutralToneMapping
  renderer.setPixelRatio(1)
  renderer.xr.enabled = true
  renderer.xr.setReferenceSpaceType('local')

  const scene = new Scene()
  const camera = new PerspectiveCamera()
  scene.add(new HemisphereLight('#FFFFFF', '#8A8F91', 1.1))
  const sun = new DirectionalLight('#FFF6EA', 1.4)
  sun.position.set(-1, 2.5, 1.5)
  scene.add(sun)

  const hdri = createStudioTexture(256)
  const generator = new PMREMGenerator(renderer)
  const environment = generator.fromEquirectangular(hdri)
  hdri.dispose()
  generator.dispose()
  scene.environment = environment.texture
  scene.environmentIntensity = 0.75

  const ringGeometry = new RingGeometry(0.11, 0.135, 40).rotateX(-Math.PI / 2)
  const ringMaterial = new MeshBasicMaterial({ color: '#FFFFFF', transparent: true, opacity: 0.9 })
  const reticle = new Mesh(ringGeometry, ringMaterial)
  reticle.matrixAutoUpdate = false
  reticle.visible = false
  scene.add(reticle)

  const holder = new Group()
  holder.visible = false
  scene.add(holder)

  let hitSource: XRHitTestSource | undefined
  let disposed = false
  let lastPose: Float32Array | null = null
  let height = 1
  let arDispose: (() => void) | null = null

  const cleanup = () => {
    if (disposed) return
    disposed = true
    renderer.setAnimationLoop(null)
    hitSource?.cancel()
    arDispose?.()
    ringGeometry.dispose()
    ringMaterial.dispose()
    environment.dispose()
    scene.clear()
    renderer.dispose()
    context.getExtension('WEBGL_lose_context')?.loseContext()
    events.onEnd()
  }
  session.addEventListener('end', cleanup)

  const onSelect = () => {
    if (!lastPose) return
    const xrCamera = renderer.xr.getCamera()
    const at = new Vector3().setFromMatrixPosition(xrCamera.matrixWorld)
    const place = placementFromHit(lastPose, at, height)
    holder.position.set(place.position.x, place.position.y, place.position.z)
    holder.rotation.set(0, place.yaw, 0)
    holder.visible = true
    reticle.visible = false
    events.onPhase('placed')
  }
  session.addEventListener('select', onSelect)

  renderer.xr.setSession(session).catch(events.onError)

  const viewer = await session.requestReferenceSpace('viewer')
  hitSource = await session.requestHitTestSource?.({ space: viewer })
  events.onPhase('loading')

  const scratchMatrix = new Matrix4()
  const scratchQuat = new Quaternion()
  renderer.setAnimationLoop((_time, frame) => {
    if (frame && hitSource) {
      const space = renderer.xr.getReferenceSpace()
      const hit = space ? frame.getHitTestResults(hitSource)[0]?.getPose(space) : undefined
      if (hit) {
        lastPose = hit.transform.matrix
        scratchMatrix.fromArray(lastPose)
        reticle.matrix.copy(scratchMatrix)
        reticle.visible = !holder.visible
        reticle.quaternion.copy(scratchQuat)
      } else {
        reticle.visible = false
      }
    }
    renderer.render(scene, camera)
  })

  // El modelo se arma con la sesión ya abierta: pedirla después perdería el gesto del usuario.
  buildArScene(source, { keepAo: true })
    .then((built) => {
      if (disposed) return built.dispose()
      arDispose = built.dispose
      height = built.size.height
      holder.add(built.root)
      events.onPhase(holder.visible ? 'placed' : 'scanning')
    })
    .catch(events.onError)

  return {
    rotate(degrees) {
      holder.rotation.y += (degrees * Math.PI) / 180
    },
    end() {
      session.end().catch(cleanup)
    },
  }
}
