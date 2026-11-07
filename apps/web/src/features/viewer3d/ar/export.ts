import { appearanceForColorId, builtinIdsOf, loadBuiltinTextures, type TextureSources } from '@dekopen/documents'
import type { Catalog, Layout, WindowDesign } from '@dekopen/engine'
import { Box3, type BufferGeometry, Color, Group, type Material, Matrix3, Mesh, MeshStandardMaterial, type Object3D, type Texture, Vector3 } from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { buildSceneModel, designsOf, reduceCatalog } from '../model/assembly'

/**
 * Exporta la ventana real a escala (metros) para verla en el espacio del cliente. El modelo es el mismo
 * del visor en calidad `ar`: se fusiona por material, las repeticiones de foliado quedan horneadas en
 * los UV (Scene Viewer y Quick Look no tratan igual las transformaciones de textura) y el vidrio pasa
 * a un material transparente estándar, que es lo único que ambos formatos comparten.
 */

export type ArFormat = 'glb' | 'usdz'
export type ArPlacement = 'floor' | 'wall'

export interface ArSource {
  layout: Layout
  design: WindowDesign
  catalog: Catalog
  textures?: TextureSources
}

export interface ArOptions {
  /** Hojas abiertas en el modelo exportado (0–1). */
  openAmount?: number
  placement?: ArPlacement
}

export interface ArAsset {
  format: ArFormat
  blob: Blob
  triangles: number
  materials: number
  /** Metros. */
  size: { width: number; height: number; depth: number }
}

export interface ArScene {
  root: Group
  triangles: number
  materials: number
  size: ArAsset['size']
  dispose(): void
}

const MAX_TEXTURE = 768
const TEXTURE_TIMEOUT_MS = 8000
const WELD_TOLERANCE = 1e-5

/** Devuelve el control al navegador entre pasos largos: la interfaz no se congela. */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function bakedTexture(source: Texture, owned: Texture[]): Texture {
  const baked = source.clone()
  baked.repeat.set(1, 1)
  baked.offset.set(0, 0)
  baked.rotation = 0
  baked.center.set(0, 0)
  // JPEG: una tesela de veta pesa la décima parte que en PNG y no necesita alfa.
  baked.userData = { ...baked.userData, mimeType: 'image/jpeg' }
  baked.needsUpdate = true
  owned.push(baked)
  return baked
}

function arMaterial(source: Material, owned: { materials: Material[]; textures: Texture[] }, keepAo: boolean): MeshStandardMaterial {
  const from = source as MeshStandardMaterial
  if (source.userData.screen) {
    const screen = new MeshStandardMaterial({ color: new Color('#3A3F42'), roughness: 0.9, metalness: 0, transparent: true, opacity: 0.3, name: 'mosquitero' })
    screen.depthWrite = false
    owned.materials.push(screen)
    return screen
  }
  if (source.userData.glass) {
    const glass = new MeshStandardMaterial({ color: new Color('#B7CDC8'), roughness: 0.06, metalness: 0, transparent: true, opacity: 0.24, name: 'vidrio' })
    glass.depthWrite = false
    owned.materials.push(glass)
    return glass
  }
  const material = new MeshStandardMaterial({
    color: from.color.clone(),
    roughness: from.roughness,
    metalness: from.metalness,
    vertexColors: keepAo && from.vertexColors,
    name: from.map ? 'foliado' : 'perfil',
  })
  if (from.map?.image) material.map = bakedTexture(from.map, owned.textures)
  if (from.normalMap?.image) {
    material.normalMap = bakedTexture(from.normalMap, owned.textures)
    material.normalScale.copy(from.normalScale)
  }
  owned.materials.push(material)
  return material
}

/** Geometría del modelo con la transformación del mundo y el foliado horneados. */
function flatGeometry(mesh: Mesh, keepAo: boolean): BufferGeometry {
  const flat = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
  flat.applyMatrix4(mesh.matrixWorld)
  flat.normalizeNormals()
  flat.clearGroups()
  const material = mesh.material as MeshStandardMaterial
  const map = material.map ?? material.normalMap
  const uv = flat.getAttribute('uv')
  if (map && uv) {
    map.updateMatrix()
    const matrix = new Matrix3().copy(map.matrix)
    const point = new Vector3()
    for (let i = 0; i < uv.count; i++) {
      point.set(uv.getX(i), uv.getY(i), 1).applyMatrix3(matrix)
      uv.setXY(i, point.x, point.y)
    }
  }
  if (!keepAo || !material.vertexColors) flat.deleteAttribute('color')
  return flat
}

/**
 * Colapsa un modelo a una malla por material, en metros. Entrega piezas que ya no se mueven y comparten
 * lo mínimo con el visor: se puede liberar sin tocar el original.
 */
export function flattenModel(source: Object3D, keepAo: boolean): { root: Group; triangles: number; materials: Material[]; textures: Texture[]; geometries: BufferGeometry[] } {
  source.updateMatrixWorld(true)
  const buckets = new Map<Material, BufferGeometry[]>()
  source.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const material = object.material as Material
    const list = buckets.get(material) ?? []
    list.push(flatGeometry(object, keepAo))
    buckets.set(material, list)
  })
  const root = new Group()
  root.name = 'ventana'
  const owned = { materials: [] as Material[], textures: [] as Texture[] }
  const geometries: BufferGeometry[] = []
  let triangles = 0
  for (const [material, list] of buckets) {
    const merged = list.length > 1 ? mergeGeometries(list, false) : list[0]
    if (!merged) continue
    const welded = mergeVertices(merged, WELD_TOLERANCE)
    if (merged !== welded) merged.dispose()
    for (const geometry of list) if (geometry !== merged) geometry.dispose()
    welded.computeBoundingBox()
    geometries.push(welded)
    triangles += (welded.index?.count ?? welded.getAttribute('position').count) / 3
    const mesh = new Mesh(welded, arMaterial(material, owned, keepAo))
    mesh.name = material.userData.glass ? 'vidrio' : 'perfil'
    root.add(mesh)
  }
  return { root, triangles, materials: owned.materials, textures: owned.textures, geometries }
}

async function waitForTextures(root: Object3D): Promise<void> {
  const pending = new Set<Promise<void>>()
  root.traverse((object) => {
    if (object instanceof Mesh) {
      const ready = (object.material as Material).userData.ready as Promise<void> | undefined
      if (ready) pending.add(ready)
    }
  })
  if (pending.size === 0) return
  await Promise.race([Promise.all(pending), new Promise((resolve) => setTimeout(resolve, TEXTURE_TIMEOUT_MS))])
}

/** Modelo aplanado, con sus texturas ya cargadas: lo usan los exportadores y la sesión WebXR. */
export async function buildArScene({ layout, design, catalog, textures }: ArSource, options: { openAmount?: number; keepAo: boolean }): Promise<ArScene> {
  const colors = catalog.colors
  await loadBuiltinTextures(builtinIdsOf(designsOf(layout, design).flatMap((item) => [appearanceForColorId(item.colorId, colors, textures), appearanceForColorId(item.colorInId ?? item.colorId, colors, textures)])))
  await yieldToBrowser()
  const model = buildSceneModel({ layout, design, catalog: reduceCatalog(layout, design, catalog), textures, quality: 'ar' })
  try {
    await waitForTextures(model.root)
    model.setOpenAmount(options.openAmount ?? 0)
    await yieldToBrowser()
    const flat = flattenModel(model.root, options.keepAo)
    await yieldToBrowser()
    const box = new Box3().setFromObject(flat.root).getSize(new Vector3())
    return {
      root: flat.root,
      triangles: flat.triangles,
      materials: flat.materials.length,
      size: { width: box.x, height: box.y, depth: box.z },
      dispose() {
        for (const geometry of flat.geometries) geometry.dispose()
        for (const material of flat.materials) material.dispose()
        for (const texture of flat.textures) texture.dispose()
        flat.root.clear()
      },
    }
  } finally {
    model.dispose()
  }
}

async function toGlb(root: Object3D): Promise<Blob> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
  const result = await new GLTFExporter().parseAsync(root, { binary: true, maxTextureSize: MAX_TEXTURE, onlyVisible: true })
  return new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' })
}

async function toUsdz(root: Object3D, placement: ArPlacement): Promise<Blob> {
  const { USDZExporter } = await import('three/examples/jsm/exporters/USDZExporter.js')
  const bytes = await new USDZExporter().parseAsync(root, {
    ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: placement === 'wall' ? 'vertical' : 'horizontal' } },
    includeAnchoringProperties: true,
    quickLookCompatible: true,
    maxTextureSize: MAX_TEXTURE,
  })
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'model/vnd.usdz+zip' })
}

/** Archivo real a escala, listo para abrir o subir. Lo que crea por el camino se libera aquí. */
export async function exportForAR(source: ArSource, format: ArFormat, options: ArOptions = {}): Promise<ArAsset> {
  // Quick Look no usa colores de vértice y en USD cada vértice es texto: se quitan.
  const scene = await buildArScene(source, { openAmount: options.openAmount, keepAo: format === 'glb' })
  try {
    await yieldToBrowser()
    const blob = format === 'glb' ? await toGlb(scene.root) : await toUsdz(scene.root, options.placement ?? 'floor')
    return { format, blob, triangles: scene.triangles, materials: scene.materials, size: scene.size }
  } finally {
    scene.dispose()
  }
}
