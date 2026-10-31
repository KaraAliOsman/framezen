import type { Catalog, Color as CatalogColor, Glass, WindowDesign } from '@framezen/engine'
import {
  CanvasTexture,
  Color,
  type Material,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three'

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

/** Pseudoazar determinista: la veta se ve igual en cada carga. */
function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
}

/** Veta de madera en escala de grises (se multiplica por el color del foliado). */
function createGrainTexture(): Texture | null {
  if (typeof document === 'undefined') return null
  let ctx: CanvasRenderingContext2D | null = null
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 512
  try {
    ctx = canvas.getContext('2d')
  } catch {
    ctx = null
  }
  if (!ctx) return null
  const random = seeded(7)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  // Vetas largas y onduladas que corren a lo largo (eje vertical de la textura).
  for (let i = 0; i < 90; i++) {
    const x = random() * canvas.width
    const width = 0.6 + random() * 2.4
    const alpha = 0.035 + random() * 0.11
    const amplitude = 2 + random() * 6
    const frequency = 0.004 + random() * 0.01
    const phase = random() * Math.PI * 2
    ctx.strokeStyle = `rgba(40, 24, 10, ${alpha.toFixed(3)})`
    ctx.lineWidth = width
    ctx.beginPath()
    for (let y = -8; y <= canvas.height + 8; y += 8) {
      const dx = Math.sin(y * frequency + phase) * amplitude
      if (y === -8) ctx.moveTo(x + dx, y)
      else ctx.lineTo(x + dx, y)
    }
    ctx.stroke()
  }
  // Poros cortos.
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(30, 18, 8, ${(0.03 + random() * 0.06).toFixed(3)})`
    ctx.fillRect(random() * canvas.width, random() * canvas.height, 0.8, 3 + random() * 9)
  }
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export interface MaterialPalette {
  /** Cara exterior de los perfiles. */
  exterior: Material
  /** Cara interior (igual a la exterior si no es bicolor). */
  interior: Material
  bicolor: boolean
  gasket: Material
  handle: Material
  glass(glassId: string | undefined): Material
  dispose(): void
}

function profileMaterial(color: CatalogColor | undefined, grain: () => Texture | null): MeshStandardMaterial {
  const finish = classifyFinish(color)
  const base = safeColor(color?.hex)
  switch (finish) {
    case 'wood':
      return new MeshStandardMaterial({ color: base, roughness: 0.66, metalness: 0, map: grain(), envMapIntensity: 0.7 })
    case 'dark':
      return new MeshStandardMaterial({ color: base, roughness: 0.5, metalness: 0.04, envMapIntensity: 0.9 })
    case 'white':
      return new MeshStandardMaterial({ color: base, roughness: 0.4, metalness: 0, envMapIntensity: 0.85 })
    default:
      return new MeshStandardMaterial({ color: base, roughness: 0.45, metalness: 0, envMapIntensity: 0.85 })
  }
}

function handleMaterial(color: CatalogColor | undefined): MeshStandardMaterial {
  switch (classifyFinish(color)) {
    case 'white':
      return new MeshStandardMaterial({ color: safeColor('#F3F2EE'), roughness: 0.28, metalness: 0 })
    case 'wood':
      return new MeshStandardMaterial({ color: safeColor('#4A3727'), roughness: 0.34, metalness: 0.35 })
    case 'dark':
      return new MeshStandardMaterial({ color: safeColor('#26292C'), roughness: 0.36, metalness: 0.25 })
    default:
      return new MeshStandardMaterial({ color: safeColor('#C9C8C2'), roughness: 0.3, metalness: 0.65 })
  }
}

function glassMaterial(glass: Glass | undefined): MeshPhysicalMaterial {
  // Vidrio físico: transmisión moderada, reflejo sutil del estudio y un tinte verdoso muy leve.
  const laminated = glass?.kind === 'laminated'
  return new MeshPhysicalMaterial({
    color: safeColor(laminated ? '#F4F8F7' : '#F9FCFB'),
    metalness: 0,
    roughness: 0.02,
    transmission: laminated ? 0.9 : 0.95,
    ior: 1.5,
    thickness: 6,
    attenuationColor: safeColor('#D3E8E5'),
    attenuationDistance: 0.09,
    specularIntensity: 1,
    envMapIntensity: 1.2,
    transparent: false,
  })
}

/** Materiales de una ventana. Todo lo creado aquí se libera con `dispose()`. */
export function createMaterialPalette(design: WindowDesign, catalog: Catalog): MaterialPalette {
  const colorById = (id: string | undefined) => (id ? catalog.colors.find((color) => color.id === id) : undefined)
  const exteriorColor = colorById(design.colorId)
  const interiorColor = colorById(design.colorInId) ?? exteriorColor
  const bicolor = Boolean(design.colorInId && design.colorInId !== design.colorId && interiorColor)

  let grainTexture: Texture | null | undefined
  const grain = () => {
    if (grainTexture === undefined) grainTexture = createGrainTexture()
    return grainTexture
  }

  const exterior = profileMaterial(exteriorColor, grain)
  const interior = bicolor ? profileMaterial(interiorColor, grain) : exterior
  const gasket = new MeshStandardMaterial({ color: safeColor('#1E2022'), roughness: 0.82, metalness: 0 })
  const handle = handleMaterial(interiorColor)
  const glassCache = new Map<string, Material>()

  return {
    exterior,
    interior,
    bicolor,
    gasket,
    handle,
    glass(glassId) {
      const id = glassId ?? design.glassId ?? ''
      const glass = catalog.glass.find((item) => item.id === id)
      const key = glass?.kind === 'laminated' ? 'laminated' : 'clear'
      let material = glassCache.get(key)
      if (!material) {
        material = glassMaterial(glass)
        glassCache.set(key, material)
      }
      return material
    },
    dispose() {
      exterior.dispose()
      if (interior !== exterior) interior.dispose()
      gasket.dispose()
      handle.dispose()
      for (const material of glassCache.values()) material.dispose()
      glassCache.clear()
      grainTexture?.dispose()
    },
  }
}
