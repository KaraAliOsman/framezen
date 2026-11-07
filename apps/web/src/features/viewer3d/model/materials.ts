import { hardwareTone, patternSize, resolveColorAppearance, type ColorAppearance, type TextureSources } from '@dekopen/documents'
import type { Catalog, Color as CatalogColor, Glass, WindowDesign } from '@dekopen/engine'
import { CanvasTexture, Color, type Material, type Mesh, MeshPhysicalMaterial, MeshStandardMaterial, NoColorSpace, type Object3D, RepeatWrapping, SRGBColorSpace, Texture, Vector2 } from 'three'
import { normalMapFromImage } from './grainMaps'

export type Finish = 'white' | 'wood' | 'dark' | 'solid'

const WOOD_NAME = /(nogal|roble|winchester|madera|caoba|cerezo|teca|pino|sapelli|mogno|oak|walnut|wood|cherry|mahogany)/i
const FALLBACK_WHITE = '#F6F5F1'

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  let value = match[1]
  if (value.length === 3) value = value.split('').map((c) => c + c).join('')
  const r = parseInt(value.slice(0, 2), 16) / 255
  const g = parseInt(value.slice(2, 4), 16) / 255
  const b = parseInt(value.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return { h: h * 60, s, l }
}

/** Acabado visual de un color del catálogo: blanco satinado, foliado madera, oscuro mate o liso. */
export function classifyFinish(color: Pick<CatalogColor, 'name' | 'hex'> | undefined): Finish {
  if (!color) return 'white'
  if (WOOD_NAME.test(color.name)) return 'wood'
  const hsl = hexToHsl(color.hex)
  if (!hsl) return 'solid'
  if (hsl.l >= 0.86 && hsl.s <= 0.35) return 'white'
  if (hsl.h >= 12 && hsl.h <= 48 && hsl.s >= 0.3 && hsl.l >= 0.12 && hsl.l <= 0.6) return 'wood'
  if (hsl.l <= 0.32) return 'dark'
  return 'solid'
}

function safeColor(hex: string | undefined, fallback = FALLBACK_WHITE): Color {
  const color = new Color()
  try {
    color.set(hex && /^#?[0-9a-f]{3,8}$/i.test(hex.trim()) ? (hex.startsWith('#') ? hex : `#${hex}`) : fallback)
  } catch {
    color.set(fallback)
  }
  return color
}

export interface MaterialPalette {
  /** Cara exterior de los perfiles. */
  exterior: Material
  /** Cara interior (igual a la exterior si no es bicolor). */
  interior: Material
  bicolor: boolean
  gasket: Material
  handle: Material
  /** Riel de aluminio de las correderas. */
  rail: Material
  /** Separador del doble vidriado. */
  spacer: Material
  /** Malla del mosquitero: oscurece un poco lo que hay detrás, como la tela real. */
  screen: Material
  glass(glassId: string | undefined): Material
  dispose(): void
}

export interface PaletteOptions {
  /** Texturas subidas (data URL) e integradas ya cargadas: las mismas que usa el dibujo 2D. */
  sources?: TextureSources
  /** Se llama cuando termina de llegar una imagen, para que el visor redibuje. */
  onTextureLoad?: () => void
}

/** Acabados donde la imagen aporta algo en 3D; los lisos usan solo el color (la micro-tesela no se ve). */
function wantsMap(a: ColorAppearance): boolean {
  return Boolean(a.href) && (a.finish === 'woodgrain' || a.finish === 'metallic' || a.finish === 'textured' || a.source?.kind === 'upload')
}

/** Cuánto relieve da cada acabado al normal map derivado de la tesela. */
function reliefOf(a: ColorAppearance): { strength: number; scale: number } {
  if (a.finish === 'woodgrain') return { strength: 1.7, scale: 0.55 }
  if (a.finish === 'textured') return { strength: 3, scale: 0.9 }
  if (a.finish === 'metallic') return { strength: 1.2, scale: 0.35 }
  return { strength: 1.6, scale: 0.5 }
}

function tiledTexture(texture: Texture, a: ColorAppearance): Texture {
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.anisotropy = 8
  // UV en metros, `u` a lo largo de la pieza: una repetición cubre `scaleMm` a lo largo y `scaleMm·aspect` a lo ancho.
  const { w, h } = patternSize(a)
  texture.repeat.set(1000 / w, 1000 / h)
  if (a.angleDeg) {
    texture.center.set(0.5, 0.5)
    texture.rotation = (a.angleDeg * Math.PI) / 180
  }
  return texture
}

/**
 * Material de un perfil: el mismo resolvedor del dibujo 2D decide foliado, tono y escala física; el visor
 * agrega el comportamiento del material (PVC liso rugosidad ≈ 0,42 y barniz ≈ 0,1; madera más mate). La
 * imagen se asigna al llegar (decodificación asíncrona), junto con su normal map, y avisa para redibujar.
 */
function profileMaterial(a: ColorAppearance, textures: Texture[], onLoad: (() => void) | undefined): MeshPhysicalMaterial {
  const base = safeColor(a.hex)
  const { material } = a
  const result = new MeshPhysicalMaterial({
    color: base,
    roughness: material.roughness,
    metalness: material.metalness,
    clearcoat: material.clearcoat,
    clearcoatRoughness: material.clearcoatRoughness,
    vertexColors: true,
  })
  if (wantsMap(a) && a.href && typeof Image !== 'undefined') {
    const texture = tiledTexture(new Texture(), a)
    texture.colorSpace = SRGBColorSpace
    textures.push(texture)
    const image = new Image()
    image.decoding = 'async'
    let settle: () => void = () => {}
    // Quien exporta espera a esto: un modelo sin su foliado no sirve para llevárselo.
    result.userData.ready = new Promise<void>((resolve) => {
      settle = resolve
    })
    image.onerror = () => settle()
    image.onload = () => {
      // El visor pudo liberar el material mientras la imagen decodificaba.
      if (!textures.includes(texture)) return settle()
      texture.image = image
      texture.needsUpdate = true
      result.map = texture
      // Si el color del catálogo difiere del foliado, se tiñe (multiplica) en la misma medida que el 2D.
      result.color = a.tint > 0 ? new Color('#FFFFFF').lerp(base, Math.min(1, a.tint * 1.15)) : new Color('#FFFFFF')
      const relief = reliefOf(a)
      const normals = normalMapFromImage(a.key, image, relief.strength)
      if (normals) {
        const normalMap = tiledTexture(new CanvasTexture(normals), a)
        normalMap.colorSpace = NoColorSpace
        textures.push(normalMap)
        result.normalMap = normalMap
        result.normalScale = new Vector2(relief.scale, relief.scale)
      }
      result.needsUpdate = true
      settle()
      onLoad?.()
    }
    image.src = a.href
  }
  return result
}

/** Herraje: los mismos tonos del dibujo 2D (`hardwareTone`), con el brillo de cada material. */
function handleMaterial(a: ColorAppearance): MeshStandardMaterial {
  const tone = hardwareTone(a)
  if (tone.id === 'white') return new MeshStandardMaterial({ color: safeColor(tone.base), roughness: 0.3, metalness: 0 })
  if (tone.id === 'dark') return new MeshStandardMaterial({ color: safeColor(tone.base), roughness: 0.36, metalness: 0.3 })
  return new MeshStandardMaterial({ color: safeColor(tone.base), roughness: 0.34, metalness: 0.72 })
}

export type GlassKind = 'clear' | 'laminated' | 'lowE'

export function glassKindOf(glass: Pick<Glass, 'id' | 'kind'> | undefined): GlassKind {
  if (glass?.kind === 'laminated') return 'laminated'
  return glass && /low.?e/i.test(glass.id) ? 'lowE' : 'clear'
}

const GLASS_TINT: Record<GlassKind, { color: string; density: number }> = {
  clear: { color: '#CBDBE0', density: 1 },
  lowE: { color: '#B7CCD6', density: 1.15 },
  laminated: { color: '#D3DAD8', density: 1.25 },
}

/** Cuánto oscurece cada hoja (por cada cara visible) y cuánto refleja, según el fondo. */
export interface GlassLook {
  opacity: number
  reflect: number
}

/**
 * Vidrio sin pase de transmisión (caro en un teléfono y casi invisible sobre un fondo liso): se compone
 * como en el dibujo 2D, un cielo pálido que aclara hacia arriba, y encima el reflejo del estudio, que se
 * suma entero en vez de atenuarse con la opacidad. La cara trasera no se dibuja: el índice sube a 1,72
 * para que cada cara visible refleje lo que reflejan las dos de una hoja real (F0 ≈ 7 % en vez de 4 %).
 * Opacidad y reflejo los ajusta la escena según el fondo (`applyGlassLook`).
 */
function glassMaterial(kind: GlassKind): MeshPhysicalMaterial {
  const tint = GLASS_TINT[kind]
  const material = new MeshPhysicalMaterial({
    color: safeColor(tint.color),
    metalness: 0,
    // Un poco de rugosidad difumina lo que refleja: da cielo y no el borde recortado de una luz.
    roughness: 0.09,
    ior: 1.72,
    specularIntensity: 1,
    transparent: true,
    opacity: 0.1 * tint.density,
    depthWrite: false,
  })
  const reflect = { value: 0.6 }
  const span = { value: 1.4 }
  material.premultipliedAlpha = true
  material.userData.glass = true
  material.userData.density = tint.density
  material.userData.reflect = reflect
  material.userData.span = span
  material.onBeforeCompile = (shader) => {
    shader.uniforms.glassReflect = reflect
    shader.uniforms.glassSpan = span
    shader.fragmentShader = `uniform float glassReflect;\nuniform float glassSpan;\n${shader.fragmentShader}`
      .replace(
        '#include <opaque_fragment>',
        `float glassRise = clamp( 0.5 - vViewPosition.y / glassSpan, 0.0, 1.0 );
        vec3 glassSky = diffuseColor.rgb * mix( 0.66, 0.96, glassRise * glassRise );
        gl_FragColor = vec4( glassSky * diffuseColor.a + ( outgoingLight - totalDiffuse ) * glassReflect, diffuseColor.a );`,
      )
      .replace('#include <premultiplied_alpha_fragment>', '')
  }
  material.customProgramCacheKey = () => 'dk-glass'
  return material
}

/** Aplica el tinte y el reflejo del estudio a todos los vidrios de un modelo. */
export function applyGlassLook(root: Object3D, look: GlassLook, span = 1.4): void {
  root.traverse((object) => {
    const material = (object as Mesh).material as Material | undefined
    if (!material?.userData.glass) return
    material.opacity = look.opacity * (material.userData.density as number)
    ;(material.userData.reflect as { value: number }).value = look.reflect
    ;(material.userData.span as { value: number }).value = Math.max(0.3, span)
  })
}

/** Materiales de una ventana. Todo lo creado aquí se libera con `dispose()`. */
export function createMaterialPalette(design: WindowDesign, catalog: Catalog, options: PaletteOptions = {}): MaterialPalette {
  const colorById = (id: string | undefined) => (id ? catalog.colors.find((color) => color.id === id) : undefined)
  const exteriorColor = colorById(design.colorId)
  const interiorColor = colorById(design.colorInId) ?? exteriorColor
  const bicolor = Boolean(design.colorInId && design.colorInId !== design.colorId && interiorColor)
  const textures: Texture[] = []

  const appearanceOf = (color: CatalogColor | undefined) => resolveColorAppearance(color, options.sources)
  const exterior = profileMaterial(appearanceOf(exteriorColor), textures, options.onTextureLoad)
  const interior = bicolor ? profileMaterial(appearanceOf(interiorColor), textures, options.onTextureLoad) : exterior
  const gasket = new MeshStandardMaterial({ color: safeColor('#17191B'), roughness: 0.78, metalness: 0 })
  const handle = handleMaterial(appearanceOf(interiorColor))
  const rail = new MeshStandardMaterial({ color: safeColor('#8E9496'), roughness: 0.5, metalness: 0.7 })
  const spacer = new MeshStandardMaterial({ color: safeColor('#8C9194'), roughness: 0.5, metalness: 0.7 })
  const screen = new MeshStandardMaterial({ color: safeColor('#3A3F42'), roughness: 0.9, metalness: 0, transparent: true, opacity: 0.3, depthWrite: false })
  screen.userData.screen = true
  const glassCache = new Map<GlassKind, Material>()

  return {
    exterior,
    interior,
    bicolor,
    gasket,
    handle,
    rail,
    spacer,
    screen,
    glass(glassId) {
      const id = glassId ?? design.glassId ?? ''
      const kind = glassKindOf(catalog.glass.find((item) => item.id === id))
      let material = glassCache.get(kind)
      if (!material) {
        material = glassMaterial(kind)
        glassCache.set(kind, material)
      }
      return material
    },
    dispose() {
      exterior.dispose()
      if (interior !== exterior) interior.dispose()
      gasket.dispose()
      handle.dispose()
      rail.dispose()
      spacer.dispose()
      screen.dispose()
      for (const material of glassCache.values()) material.dispose()
      glassCache.clear()
      for (const texture of textures) texture.dispose()
      textures.length = 0
    },
  }
}
