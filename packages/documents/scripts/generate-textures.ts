/**
 * Generador determinista de la biblioteca de foliados integrados (DRAW, v5).
 *
 * Produce, para cada id de `BUILTIN_TEXTURE_IDS`, una tesela continua (sin costuras) de 640 × 768 px:
 *   - packages/documents/src/textures/builtin/<id>.webp  (≤ 80 KB)
 *   - packages/documents/src/textures/builtin/<id>.ts    (la misma imagen como data URL, para PDF y web)
 *
 * Todo el ruido es periódico en la tesela (gradiente de Perlin sobre un toro), así que la repetición no
 * tiene costuras. La tesela representa `scaleMm` a lo largo de la veta (eje x) por `scaleMm × aspect`
 * a lo ancho (eje y): las maderas usan una tesela anisótropa (900 × 300 mm) para tener poros finos.
 *
 * La madera de un foliado es sobre todo fibra: hebras largas casi rectas, poros cortos y bandas anchas de
 * tono. Las catedrales aparecen pocas veces y con poco contraste; dibujar anillos es lo que la hace falsa.
 *
 * Uso: npx tsx packages/documents/scripts/generate-textures.ts [--preview <carpeta>]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { BUILTIN_TEXTURES, BUILTIN_TEXTURE_IDS, type BuiltinTextureId } from '../../shared/src/textures'

const TW = 640
const TH = 768
const BUDGET = 80 * 1024
const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '../src/textures/builtin')

// ── Ruido periódico ──────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

class Noise {
  private readonly perm = new Uint16Array(512)
  private readonly gx = new Float32Array(256)
  private readonly gy = new Float32Array(256)

  constructor(seed: number) {
    const rnd = mulberry32(seed)
    const p = Array.from({ length: 256 }, (_, i) => i)
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      ;[p[i], p[j]] = [p[j], p[i]]
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255]
    for (let i = 0; i < 256; i++) {
      const a = rnd() * Math.PI * 2
      this.gx[i] = Math.cos(a)
      this.gy[i] = Math.sin(a)
    }
  }

  private grad(ix: number, iy: number, x: number, y: number): number {
    const h = this.perm[(this.perm[ix & 255] + (iy & 255)) & 511]
    return this.gx[h] * x + this.gy[h] * y
  }

  /** Perlin 2D periódico: período `px` en x y `py` en y (enteros ≤ 256). Valor ≈ [-0.7, 0.7]. */
  periodic(x: number, y: number, px: number, py: number): number {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi
    const x0 = ((xi % px) + px) % px
    const y0 = ((yi % py) + py) % py
    const x1 = (x0 + 1) % px
    const y1 = (y0 + 1) % py
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10)
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10)
    const a = this.grad(x0, y0, xf, yf)
    const b = this.grad(x1, y0, xf - 1, yf)
    const c = this.grad(x0, y1, xf, yf - 1)
    const d = this.grad(x1, y1, xf - 1, yf - 1)
    return a + u * (b - a) + v * (c - a + u * (a - b - c + d))
  }

  /** fBm periódico sobre la tesela: u, v ∈ [0, 1). */
  fbm(u: number, v: number, px: number, py: number, octaves: number, gain = 0.5): number {
    let sum = 0
    let amp = 1
    let norm = 0
    let fx = px
    let fy = py
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.periodic(u * fx, v * fy, fx, fy)
      norm += amp
      amp *= gain
      fx *= 2
      fy *= 2
    }
    return sum / norm
  }
}

/**
 * Hebras: cada fila es un ruido 1D independiente a lo largo de la veta. Un ruido 2D estirado produce
 * guiones inclinados (parece tela o ladrillo); filas independientes dan hebras paralelas, como la fibra.
 */
class Strands {
  private readonly table: Float32Array
  private readonly shifts: Float32Array

  constructor(
    seed: number,
    private readonly rows: number,
    private readonly cells: number,
  ) {
    const rnd = mulberry32(seed)
    this.table = new Float32Array(rows * cells)
    for (let i = 0; i < this.table.length; i++) this.table[i] = rnd()
    this.shifts = new Float32Array(rows)
    for (let i = 0; i < rows; i++) this.shifts[i] = rnd()
  }

  private row(j: number, u: number): number {
    const x = u * this.cells
    const i = Math.floor(x)
    const f = x - i
    const t = f * f * (3 - 2 * f)
    const base = ((j % this.rows) + this.rows) % this.rows
    const a = this.table[base * this.cells + (((i % this.cells) + this.cells) % this.cells)]
    const b = this.table[base * this.cells + (((i + 1) % this.cells + this.cells) % this.cells)]
    return a + (b - a) * t
  }

  /** Valor en [0, 1). `u` y `v` periódicos en [0, 1). */
  at(u: number, v: number): number {
    const y = v * this.rows
    const j = Math.floor(y)
    const f = y - j
    const t = f * f * (3 - 2 * f)
    // Cada fila arranca con su propio desfase (al azar: uno regular forma un retículo diagonal).
    const shift = (k: number) => this.shifts[((k % this.rows) + this.rows) % this.rows]
    const a = this.row(j, frac(u + shift(j)))
    const b = this.row(j + 1, frac(u + shift(j + 1)))
    return a + (b - a) * t
  }
}

// ── Color ───────────────────────────────────────────────────────────────────

type RGB = [number, number, number]

function hexRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const toLin = (c: number) => {
  const v = c / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}
const toSrgb = (v: number) => {
  const c = Math.max(0, Math.min(1, v))
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)
}
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const frac = (x: number) => x - Math.floor(x)
/** Distancia periódica en [-0.5, 0.5). */
const wrapd = (d: number) => d - Math.round(d)

/** Paleta de tres paradas en luz lineal: 0 = claro, 0.5 = base, 1 = oscuro. */
function palette(light: string, base: string, dark: string) {
  const L = hexRgb(light).map(toLin)
  const B = hexRgb(base).map(toLin)
  const D = hexRgb(dark).map(toLin)
  return (t: number, out: Float32Array, i: number) => {
    const x = clamp01(t)
    if (x < 0.5) {
      const k = x * 2
      out[i] = L[0] + (B[0] - L[0]) * k
      out[i + 1] = L[1] + (B[1] - L[1]) * k
      out[i + 2] = L[2] + (B[2] - L[2]) * k
    } else {
      const k = (x - 0.5) * 2
      out[i] = B[0] + (D[0] - B[0]) * k
      out[i + 1] = B[1] + (D[1] - B[1]) * k
      out[i + 2] = B[2] + (D[2] - B[2]) * k
    }
  }
}

// ── Recetas ─────────────────────────────────────────────────────────────────

interface WoodRecipe {
  type: 'wood'
  seed: number
  /** Ancho medio de un anillo (mm) en la cara de la tabla. */
  ringMm: number
  /**
   * Corte de la tabla: distancia a la médula (mm) mínima y máxima a lo largo de la tesela. Cuanto más
   * cerca de la médula, más catedrales; un corte lejano da veta recta.
   */
  depth: [number, number]
  /** Ciclos de profundidad a lo largo de la tesela (1 o 2 catedrales grandes). */
  cycles: number
  /** Posición de la médula a lo ancho (0–1) y fase a lo largo. */
  pith: number
  phase: number
  /** Ondulación orgánica de los anillos (en anillos). */
  warp: number
  /** Inclinación de los anillos a lo ancho (fracción de anillos por tesela): catedrales a un solo lado. */
  tilt: number
  /** Contraste de la madera tardía (0–1) y ancho de su franja (0–1). */
  contrast: number
  late: number
  /** Densidad y contraste de los poros. */
  pores: number
  poreContrast: number
  /** Poros más marcados en la madera temprana (roble). */
  earlyPores: boolean
  /** Fibra (hebras largas) y manchas de color amplias. */
  fiber: number
  mottle: number
  /** Serpenteo de las hebras a lo largo (fracción del ancho de la tesela). */
  wander?: number
  /** Relieve gofrado (resalte claro junto a cada poro): foliados de color con estructura. */
  emboss?: number
}

interface SolidRecipe {
  type: 'solid'
  seed: number
  /** Microtextura (fracción de luminancia). */
  grain: number
  mottle: number
}

interface SandRecipe {
  type: 'sand'
  seed: number
  grain: number
  speckle: number
}

interface BrushRecipe {
  type: 'brush'
  seed: number
  lines: number
  bands: number
}

type Recipe = WoodRecipe | SolidRecipe | SandRecipe | BrushRecipe

const oak = (seed: number, over: Partial<WoodRecipe> = {}): WoodRecipe => ({
  type: 'wood',
  seed,
  ringMm: 11,
  depth: [55, 210],
  cycles: 1,
  pith: 0.42,
  phase: 0.1,
  warp: 0.7,
  tilt: 0.75,
  contrast: 0.42,
  late: 0.4,
  pores: 0.12,
  poreContrast: 0.62,
  earlyPores: true,
  fiber: 0.5,
  mottle: 0.05,
  wander: 0.0024,
  ...over,
})

export const RECIPES: Record<BuiltinTextureId, Recipe> = {
  white_9016: { type: 'solid', seed: 11, grain: 0.009, mottle: 0.005 },
  cream_9001: { type: 'solid', seed: 12, grain: 0.007, mottle: 0.005 },
  grey_7035: { type: 'solid', seed: 13, grain: 0.008, mottle: 0.006 },
  quartz_grey_7039: { type: 'sand', seed: 14, grain: 0.06, speckle: 0.05 },
  anthracite_7016_smooth: { type: 'solid', seed: 15, grain: 0.014, mottle: 0.008 },
  anthracite_7016_woodgrain: oak(16, { contrast: 0.22, fiber: 0.3, pores: 0.11, poreContrast: 0.3, mottle: 0.015, emboss: 0.5 }),
  anthracite_7016_sand: { type: 'sand', seed: 17, grain: 0.07, speckle: 0.06 },
  black_9005: { type: 'solid', seed: 18, grain: 0.018, mottle: 0.01 },
  black_brown_8022: oak(19, { contrast: 0.24, fiber: 0.32, pores: 0.12, poreContrast: 0.36, mottle: 0.02, emboss: 0.55, pith: 0.6 }),
  chartwell_green: oak(20, { contrast: 0.16, fiber: 0.24, pores: 0.13, poreContrast: 0.34, mottle: 0.02, emboss: 0.6, pith: 0.3 }),
  golden_oak: oak(21),
  nut_tree: oak(22, { ringMm: 8, depth: [40, 170], pith: 0.55, phase: 0.62, warp: 1, contrast: 0.56, late: 0.46, pores: 0.1, poreContrast: 0.5, earlyPores: false, fiber: 0.6, mottle: 0.08 }),
  mahogany: oak(23, { ringMm: 7, depth: [170, 260], warp: 0.5, contrast: 0.36, late: 0.5, pores: 0.09, poreContrast: 0.44, earlyPores: false, fiber: 0.62, mottle: 0.04, wander: 0.0014 }),
  winchester: oak(24, { ringMm: 12, depth: [50, 200], pith: 0.36, phase: 0.35, warp: 0.9, contrast: 0.46, pores: 0.13, poreContrast: 0.6, fiber: 0.56, mottle: 0.06 }),
  sheffield_oak: oak(25, { ringMm: 13, depth: [80, 240], pith: 0.62, phase: 0.8, contrast: 0.34, late: 0.3, pores: 0.16, poreContrast: 0.74, fiber: 0.74, mottle: 0.04, wander: 0.0018 }),
  irish_oak: oak(26, { ringMm: 10, depth: [70, 220], pith: 0.5, phase: 0.55, contrast: 0.36, pores: 0.13, poreContrast: 0.52, fiber: 0.56 }),
  metbrush_silver: { type: 'brush', seed: 27, lines: 0.075, bands: 0.035 },
}

/** Proporción física de la tesela (alto/ancho): las maderas son tablas largas. */
export const ASPECT: Record<BuiltinTextureId, number> = Object.fromEntries(
  BUILTIN_TEXTURE_IDS.map((id) => [id, RECIPES[id].type === 'wood' ? 1 / 3 : RECIPES[id].type === 'brush' ? 1 / 4 : 1]),
) as Record<BuiltinTextureId, number>

// ── Síntesis ────────────────────────────────────────────────────────────────

/** Devuelve la tesela en luz lineal (RGB float) antes de ajustar la media. */
function synthesize(id: BuiltinTextureId, recipe: Recipe): Float32Array {
  const tex = BUILTIN_TEXTURES[id]
  const out = new Float32Array(TW * TH * 3)
  const pal = palette(tex.light, tex.hex, tex.dark)
  const n1 = new Noise(recipe.seed)
  const n2 = new Noise(recipe.seed * 7 + 3)
  const n3 = new Noise(recipe.seed * 13 + 5)
  const s1 = new Strands(recipe.seed * 3 + 1, 70, 3)
  const s2 = new Strands(recipe.seed * 5 + 2, 150, 5)
  const s3 = new Strands(recipe.seed * 7 + 3, 300, 6)
  const s4 = new Strands(recipe.seed * 11 + 4, 420, 11)
  const s5 = new Strands(recipe.seed * 17 + 5, 340, 90)

  for (let py = 0; py < TH; py++) {
    const v = (py + 0.5) / TH
    for (let px = 0; px < TW; px++) {
      const u = (px + 0.5) / TW
      const i = (py * TW + px) * 3
      let t: number
      let lift = 0
      switch (recipe.type) {
        case 'wood': {
          const r = recipe
          const widthMm = tex.scaleMm * ASPECT[id]
          // Las hebras son casi rectas: se desvían apenas y cada zona a su ritmo.
          const vw = frac(v + (r.wander ?? 0.0024) * n1.fbm(u, v, 3, 9, 2, 0.5) + 1)
          // Bandas de crecimiento anchas y suaves; las catedrales son raras porque el corte queda lejos
          // de la médula (ver `depth`). Una pendiente entera mantiene la tesela periódica.
          const y = (widthMm / Math.PI) * Math.sin(Math.PI * (v - r.pith))
          const wave = 0.5 - 0.5 * Math.cos(2 * Math.PI * (u * r.cycles + r.phase))
          const d = r.depth[0] + (r.depth[1] - r.depth[0]) * wave
          const organic = r.warp * n1.fbm(u, v, 3, 2, 3, 0.5)
          const slope = Math.max(1, Math.round(r.tilt * (widthMm / r.ringMm)))
          const ring = Math.sqrt(y * y + d * d) / r.ringMm + slope * v + organic
          const tr = frac(ring)
          const ringId = Math.floor(ring)
          const key = ((ringId % slope) + slope) % slope
          const jitter = frac(Math.sin(key * 12.9898 + r.seed * 78.233) * 43758.5453)
          const band = smooth(0.1, 0.62, tr) * (1 - smooth(0.82, 1, tr)) * (0.45 + 0.55 * jitter)
          // Fibra: hebras independientes de varios largos. Una zona tiene hebras marcadas y la vecina
          // no, que es lo que separa una veta de un peinado regular.
          const zone = 0.55 + 1.3 * Math.abs(n2.fbm(u, v, 2, 14, 2, 0.5))
          const sc = (x: number) => (x - 0.5) * 2
          const fiber = (sc(s1.at(u, vw)) * 0.28 + sc(s2.at(u, vw)) * 0.34 + sc(s3.at(u, vw)) * 0.42 + sc(s4.at(u, vw)) * 0.3) * r.fiber * zone
          // Hebras claras sueltas y poros: guiones cortos y oscuros.
          const pale = smooth(0.74, 0.92, s3.at(frac(u + 0.31), frac(vw + 0.17))) * 0.2 * r.fiber
          const poreStart = 0.72 - r.pores * 0.9
          const pore = smooth(poreStart, poreStart + 0.14, s5.at(u, vw)) * (r.earlyPores ? 0.5 + 0.5 * (1 - band) : 1)
          const mottle = n2.fbm(u, v, 2, 2, 2) * r.mottle * 4 + n1.fbm(u, v, 1, 6, 2) * r.mottle * 3
          t = 0.42 + r.contrast * 0.42 * band + fiber * 0.55 + mottle + pore * r.poreContrast * 0.42 - pale
          if (r.emboss) {
            // Gofrado: el borde superior de cada poro capta luz.
            const rim = smooth(poreStart, poreStart + 0.14, s5.at(u, frac(vw + 1 - 1.6 / TH))) - pore
            lift = Math.max(0, rim) * r.emboss * 0.16
          }
          break
        }
        case 'solid': {
          const s = recipe
          const g = n1.periodic(u * 192, v * 192, 192, 192) * 0.6 + n2.periodic(u * 96, v * 96, 96, 96) * 0.4
          const m = n3.fbm(u, v, 3, 3, 3)
          t = 0.5 + g * s.grain * 6 + m * s.mottle * 6
          break
        }
        case 'sand': {
          const s = recipe
          const g = n1.periodic(u * 256, v * 256, 256, 256) * 0.55 + n2.periodic(u * 128, v * 128, 128, 128) * 0.45
          const sp = n3.periodic(u * 256 + 0.5, v * 256 + 0.5, 256, 256)
          const speck = smooth(0.42, 0.55, sp) - smooth(0.42, 0.55, -sp)
          t = 0.5 + g * s.grain * 4.5 + speck * s.speckle
          break
        }
        case 'brush': {
          const b = recipe
          const line = n1.fbm(u, v, 2, 256, 2, 0.55) * 0.65 + n2.periodic(u * 4, v * 128, 4, 128) * 0.35
          const band = n3.fbm(u, v, 1, 6, 2)
          t = 0.5 + line * b.lines * 5 + band * b.bands * 4
          break
        }
      }
      pal(t, out, i)
      if (lift) {
        out[i] += lift
        out[i + 1] += lift
        out[i + 2] += lift
      }
    }
  }
  return out
}

/** Ajusta la media (luz lineal) al hex de respaldo: el color plano y la textura coinciden de lejos. */
function matchMean(data: Float32Array, hex: string): void {
  const target = hexRgb(hex).map(toLin)
  const sum = [0, 0, 0]
  const n = data.length / 3
  for (let i = 0; i < data.length; i += 3) {
    sum[0] += data[i]
    sum[1] += data[i + 1]
    sum[2] += data[i + 2]
  }
  const k = sum.map((s, c) => (s > 0 ? target[c] / (s / n) : 1))
  for (let i = 0; i < data.length; i += 3) {
    data[i] *= k[0]
    data[i + 1] *= k[1]
    data[i + 2] *= k[2]
  }
}

function toBytes(data: Float32Array): Buffer {
  const bytes = Buffer.alloc(data.length)
  for (let i = 0; i < data.length; i++) bytes[i] = Math.round(toSrgb(data[i]))
  return bytes
}

async function encode(raw: Buffer): Promise<{ webp: Buffer; quality: number }> {
  for (let quality = 90; quality >= 30; quality -= 1) {
    const webp = await sharp(raw, { raw: { width: TW, height: TH, channels: 3 } })
      .webp({ quality, effort: 6, smartSubsample: true })
      .toBuffer()
    // «NaN» dentro del base64 dispararía las pruebas que buscan cifras rotas en el HTML.
    if (webp.length <= BUDGET && !webp.toString('base64').includes('NaN')) return { webp, quality }
  }
  throw new Error('No cabe en el presupuesto de 80 KB')
}

async function main() {
  const previewIdx = process.argv.indexOf('--preview')
  const previewDir = previewIdx > 0 ? resolve(process.argv[previewIdx + 1] ?? '.scratch/draw/textures') : undefined
  mkdirSync(OUT, { recursive: true })
  if (previewDir) mkdirSync(previewDir, { recursive: true })
  const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7).split(',')
  const report: string[] = []
  for (const id of BUILTIN_TEXTURE_IDS) {
    if (only && !only.includes(id)) continue
    const recipe = RECIPES[id]
    const data = synthesize(id, recipe)
    matchMean(data, BUILTIN_TEXTURES[id].hex)
    const raw = toBytes(data)
    const { webp, quality } = await encode(raw)
    writeFileSync(join(OUT, `${id}.webp`), webp)
    const dataUrl = `data:image/webp;base64,${webp.toString('base64')}`
    writeFileSync(
      join(OUT, `${id}.ts`),
      `// Generado por packages/documents/scripts/generate-textures.ts (no editar a mano).\n// Foliado integrado «${BUILTIN_TEXTURES[id].names.es}»: tesela WebP ${TW} × ${TH} px, ${webp.length} bytes.\nconst tile = '${dataUrl}'\nexport default tile\n`,
    )
    report.push(`${id.padEnd(28)} q${quality} ${(webp.length / 1024).toFixed(1)} KB`)
    if (previewDir) {
      // Vista 2 × 2 para revisar costuras.
      const tw = Math.round(TH / ASPECT[id] / 2)
      const th = TH / 2
      const tile = await sharp(raw, { raw: { width: TW, height: TH, channels: 3 } }).resize(tw, th, { fit: 'fill' }).png().toBuffer()
      await sharp({ create: { width: tw * 2, height: th * 2, channels: 3, background: '#000' } })
        .composite([
          { input: tile, left: 0, top: 0 },
          { input: tile, left: tw, top: 0 },
          { input: tile, left: 0, top: th },
          { input: tile, left: tw, top: th },
        ])
        .png()
        .toFile(join(previewDir, `${id}.png`))
    }
  }
  console.log(report.join('\n'))
}

await main()
