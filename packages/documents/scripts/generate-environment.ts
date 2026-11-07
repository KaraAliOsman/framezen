/**
 * Generador determinista de los entornos del vidrio (lo que se ve a través o reflejado en él).
 *
 * Son dos imágenes muy desenfocadas, propias y sin datos de terceros:
 *   - outdoor: vista interior, se mira hacia afuera (día claro, tonos altos, árboles lejanos).
 *   - reflection: vista exterior, el vidrio refleja cielo, arboleda y suelo (más denso y frío).
 *
 * Una imagen desenfocada pesa poco y no muestra píxeles a ninguna escala, así que el dibujo sigue siendo
 * nítido: el vidrio es lo único que no tiene bordes. Se generan como JPEG para no mezclarse con las
 * teselas WebP de los foliados y quedan como módulos TS (web y servidor las leen igual, sin `fs`).
 *
 * Uso: npx tsx packages/documents/scripts/generate-environment.ts
 */
import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const SIZE = 256
const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '../src/textures/builtin')

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

function valueNoise(seed: number) {
  const rnd = mulberry32(seed)
  const table = new Float32Array(65536)
  for (let i = 0; i < table.length; i++) table[i] = rnd()
  const at = (x: number, y: number) => table[((x & 255) << 8) | (y & 255)]
  const fade = (t: number) => t * t * (3 - 2 * t)
  const noise = (x: number, y: number) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const u = fade(x - xi)
    const v = fade(y - yi)
    const a = at(xi, yi)
    const b = at(xi + 1, yi)
    const c = at(xi, yi + 1)
    const d = at(xi + 1, yi + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
  return (x: number, y: number, octaves = 4) => {
    let sum = 0
    let amp = 0.5
    let norm = 0
    let f = 1
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise(x * f, y * f)
      norm += amp
      amp *= 0.5
      f *= 2
    }
    return sum / norm
  }
}

type RGB = [number, number, number]
const hex = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

interface Scene {
  seed: number
  skyTop: string
  skyLow: string
  cloud: string
  cloudAmount: number
  horizon: number
  farTrees: string
  nearTrees: string
  treeHeight: number
  groundNear: string
  groundFar: string
  blur: number
  /** Multiplicador final (la reflexión sobre un interior oscuro pierde luz). */
  gain: number
}

const SCENES: Record<'outdoor' | 'reflection', Scene> = {
  outdoor: {
    seed: 41,
    skyTop: '#C6DAE6',
    skyLow: '#F4F7F8',
    cloud: '#FFFFFF',
    cloudAmount: 0.6,
    horizon: 0.86,
    farTrees: '#CBD6D0',
    nearTrees: '#B4C4BB',
    treeHeight: 0.075,
    groundNear: '#D3DAD0',
    groundFar: '#E4E9E2',
    blur: 9,
    gain: 1,
  },
  reflection: {
    seed: 77,
    skyTop: '#4F7EA3',
    skyLow: '#C6D9E3',
    cloud: '#E6EDF0',
    cloudAmount: 0.42,
    horizon: 0.82,
    farTrees: '#7E9092',
    nearTrees: '#55686A',
    treeHeight: 0.1,
    groundNear: '#566260',
    groundFar: '#7E8C89',
    blur: 8,
    gain: 0.84,
  },
}

function paint(scene: Scene): Buffer {
  const n1 = valueNoise(scene.seed)
  const n2 = valueNoise(scene.seed * 3 + 1)
  const out = Buffer.alloc(SIZE * SIZE * 3)
  const skyTop = hex(scene.skyTop)
  const skyLow = hex(scene.skyLow)
  const cloud = hex(scene.cloud)
  const far = hex(scene.farTrees)
  const near = hex(scene.nearTrees)
  const gFar = hex(scene.groundFar)
  const gNear = hex(scene.groundNear)
  for (let py = 0; py < SIZE; py++) {
    const v = (py + 0.5) / SIZE
    for (let px = 0; px < SIZE; px++) {
      const u = (px + 0.5) / SIZE
      let c = mix(skyTop, skyLow, Math.pow(clamp01(v / scene.horizon), 1.5))
      // Nubes altas, estiradas en horizontal y más densas hacia el horizonte.
      const wisps = n1(u * 2.1 + 7, v * 11 + 3, 5)
      c = mix(c, cloud, smooth(0.4, 0.78, wisps) * scene.cloudAmount * (0.45 + 0.55 * smooth(0, scene.horizon, v)))
      const hz = scene.horizon + (n2(u * 2 + 11, 4) - 0.5) * 0.02
      const farTop = hz - scene.treeHeight * 0.55 * (0.6 + n1(u * 7, 9, 3))
      const nearTop = hz - scene.treeHeight * (0.25 + 1.1 * n2(u * 5.5 + 2, 17, 4))
      if (v > farTop) c = mix(c, far, smooth(farTop, farTop + 0.012, v) * 0.85)
      if (v > nearTop) c = mix(c, mix(near, far, n1(u * 16, v * 16, 3) * 0.5), smooth(nearTop, nearTop + 0.014, v))
      if (v > hz) {
        const t = smooth(hz, 1, v)
        c = mix(c, mix(gFar, gNear, t), smooth(hz, hz + 0.012, v))
      }
      const i = (py * SIZE + px) * 3
      out[i] = Math.min(255, c[0] * scene.gain)
      out[i + 1] = Math.min(255, c[1] * scene.gain)
      out[i + 2] = Math.min(255, c[2] * scene.gain)
    }
  }
  return out
}

async function main() {
  for (const [name, scene] of Object.entries(SCENES)) {
    const raw = paint(scene)
    let jpeg = Buffer.alloc(0)
    // «NaN» dentro del base64 dispararía las pruebas que buscan cifras rotas en el HTML.
    for (let quality = 92; quality > 70; quality--) {
      jpeg = await sharp(raw, { raw: { width: SIZE, height: SIZE, channels: 3 } })
        .blur(scene.blur)
        .jpeg({ quality, chromaSubsampling: '4:4:4', mozjpeg: true })
        .toBuffer()
      if (!jpeg.toString('base64').includes('NaN')) break
    }
    const url = `data:image/jpeg;base64,${jpeg.toString('base64')}`
    writeFileSync(join(OUT, `env_${name}.ts`), `// Generado por packages/documents/scripts/generate-environment.ts (no editar a mano).\n// Entorno del vidrio «${name}»: JPEG ${SIZE} × ${SIZE} px desenfocado, ${jpeg.length} bytes.\nconst env = '${url}'\nexport default env\n`)
    console.log(name.padEnd(12), (jpeg.length / 1024).toFixed(1) + ' KB')
  }
}

await main()
