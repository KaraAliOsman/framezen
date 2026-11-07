/**
 * Operaciones de píxeles del pipeline de texturas, en TypeScript puro (sin sharp), para poder
 * probarlas con imágenes sintéticas:
 *
 * - Conversión sRGB ↔ lineal (los promedios y fundidos se hacen en luz lineal).
 * - Orientación de la veta con el tensor de estructura por bloques (investigación 21, F3): la
 *   dirección de MENOR gradiente es la veta; ángulos en grados, sentido horario (y hacia abajo).
 * - Corrección suave de iluminación: ajuste polinómico de 2.º orden de la luminancia y ganancia
 *   acotada (±12 %) que conserva la media; nunca normaliza el histograma (roble claro ≠ nogal).
 * - Paleta: promedio lineal, base (ventana de la mediana de luminancia), claro/oscuro (colas del
 *   10 %), sin inventar colores que no están en la foto.
 * - Costura: fundido de bordes opuestos en luz lineal (F5) o espejo 2×2; puntaje de costura.
 * - Acabado probable (liso, veta, texturizado, metálico) a partir de energía, saturación y
 *   coherencia.
 */
import type { TextureFinish, TexturePalette } from '@dekopen/shared'

/** Imagen RGB de 8 bits, 3 canales intercalados. */
export interface RgbImage {
  width: number
  height: number
  data: Uint8Array
}

/** Imagen RGB lineal (0–1), 3 canales intercalados. */
export interface LinearImage {
  width: number
  height: number
  data: Float32Array
}

// ── Color ───────────────────────────────────────────────────────────────────

const SRGB_TO_LINEAR = new Float32Array(256)
for (let i = 0; i < 256; i++) {
  const v = i / 255
  SRGB_TO_LINEAR[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

export function srgbToLinear(byte: number): number {
  return SRGB_TO_LINEAR[Math.max(0, Math.min(255, Math.round(byte)))]!
}

export function linearToSrgbByte(v: number): number {
  const c = v <= 0 ? 0 : v >= 1 ? 1 : v
  const s = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return Math.round(s * 255)
}

export function toLinear(img: RgbImage): LinearImage {
  const out = new Float32Array(img.width * img.height * 3)
  for (let i = 0; i < out.length; i++) out[i] = SRGB_TO_LINEAR[img.data[i]!]!
  return { width: img.width, height: img.height, data: out }
}

export function toSrgb(img: LinearImage): RgbImage {
  const out = new Uint8Array(img.data.length)
  // Tabla inversa de 4096 pasos: suficiente para 8 bits y 20× más rápida que pow por píxel.
  for (let i = 0; i < out.length; i++) out[i] = linearToSrgbFast(img.data[i]!)
  return { width: img.width, height: img.height, data: out }
}

const LINEAR_STEPS = 4096
const LINEAR_TO_SRGB = new Uint8Array(LINEAR_STEPS + 1)
for (let i = 0; i <= LINEAR_STEPS; i++) LINEAR_TO_SRGB[i] = linearToSrgbByte(i / LINEAR_STEPS)

function linearToSrgbFast(v: number): number {
  if (!(v > 0)) return 0
  if (v >= 1) return 255
  // Cerca del negro la curva es empinada: ahí se calcula exacto.
  if (v < 0.01) return linearToSrgbByte(v)
  return LINEAR_TO_SRGB[Math.round(v * LINEAR_STEPS)]!
}

export function hexOf(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase()
}

export function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!m) return [0, 0, 0]
  return [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)]
}

/** Luminancia lineal (Rec. 709) por píxel. */
export function luminance(img: LinearImage): Float32Array {
  const n = img.width * img.height
  const out = new Float32Array(n)
  const d = img.data
  for (let i = 0, j = 0; i < n; i++, j += 3) out[i] = 0.2126 * d[j]! + 0.7152 * d[j + 1]! + 0.0722 * d[j + 2]!
  return out
}

// ── Desenfoque de caja (imagen integral) ─────────────────────────────────────

/** Promedio en una ventana cuadrada de radio r (bordes recortados), O(n). */
export function boxBlur(values: Float32Array, width: number, height: number, r: number): Float32Array {
  const w1 = width + 1
  const integral = new Float64Array(w1 * (height + 1))
  for (let y = 0; y < height; y++) {
    let row = 0
    for (let x = 0; x < width; x++) {
      row += values[y * width + x]!
      integral[(y + 1) * w1 + x + 1] = integral[y * w1 + x + 1]! + row
    }
  }
  const out = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r)
    const y1 = Math.min(height, y + r + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r)
      const x1 = Math.min(width, x + r + 1)
      const sum = integral[y1 * w1 + x1]! - integral[y0 * w1 + x1]! - integral[y1 * w1 + x0]! + integral[y0 * w1 + x0]!
      out[y * width + x] = sum / ((x1 - x0) * (y1 - y0))
    }
  }
  return out
}

// ── Veta: tensor de estructura ───────────────────────────────────────────────

export interface GrainEstimate {
  /** Ángulo de la veta (grados, sentido horario con y hacia abajo), en (−90, 90]. */
  angleDeg: number
  /** 0 = sin dirección; 1 = líneas perfectamente paralelas. */
  coherence: number
  /** Energía media de gradiente (luminancia lineal, sin la iluminación de fondo). */
  energy: number
  /** Bloques con dirección clara / bloques analizados. */
  blockAgreement: number
}

/**
 * Dirección dominante de la veta. Pasos: luminancia lineal → suavizado leve → quitar la
 * iluminación de fondo (paso alto) → gradientes centrales → tensor por bloques de 32–64 px,
 * descartando reflejos saturados y limitando los gradientes al percentil 95 → suma de los
 * tensores de los bloques coherentes (promedio circular de ángulo doble).
 */
export function estimateGrain(img: LinearImage): GrainEstimate {
  const { width: w, height: h } = img
  if (w < 16 || h < 16) return { angleDeg: 0, coherence: 0, energy: 0, blockAgreement: 0 }
  const lum = luminance(img)
  const smooth = boxBlur(lum, w, h, 1)
  const background = boxBlur(smooth, w, h, Math.max(4, Math.round(Math.min(w, h) / 24)))
  const hp = new Float32Array(w * h)
  for (let i = 0; i < hp.length; i++) hp[i] = smooth[i]! - background[i]!

  const gx = new Float32Array(w * h)
  const gy = new Float32Array(w * h)
  const valid = new Uint8Array(w * h)
  const energies: number[] = []
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x
      if (lum[i]! > 0.94) continue // reflejo quemado: su borde no es veta
      const ax = (hp[i + 1]! - hp[i - 1]!) / 2
      const ay = (hp[i + w]! - hp[i - w]!) / 2
      gx[i] = ax
      gy[i] = ay
      valid[i] = 1
      if ((x + y) % 3 === 0) energies.push(ax * ax + ay * ay)
    }
  }
  if (!energies.length) return { angleDeg: 0, coherence: 0, energy: 0, blockAgreement: 0 }
  energies.sort((a, b) => a - b)
  const cap = Math.max(1e-12, energies[Math.floor(energies.length * 0.95)] ?? energies[energies.length - 1]!)

  const block = Math.max(32, Math.min(64, Math.round(Math.min(w, h) / 8)))
  let sxx = 0
  let sxy = 0
  let syy = 0
  let total = 0
  let blocks = 0
  let coherent = 0
  let energySum = 0
  let energyCount = 0
  for (let by = 2; by < h - 2; by += block) {
    for (let bx = 2; bx < w - 2; bx += block) {
      let xx = 0
      let xy = 0
      let yy = 0
      let count = 0
      const yEnd = Math.min(h - 2, by + block)
      const xEnd = Math.min(w - 2, bx + block)
      for (let y = by; y < yEnd; y++) {
        for (let x = bx; x < xEnd; x++) {
          const i = y * w + x
          if (!valid[i]) continue
          const ax = gx[i]!
          const ay = gy[i]!
          const e = ax * ax + ay * ay
          const weight = e > cap ? cap / e : 1
          xx += weight * ax * ax
          xy += weight * ax * ay
          yy += weight * ay * ay
          count++
        }
      }
      if (count < (block * block) / 4) continue
      blocks++
      const e = xx + yy
      energySum += e
      energyCount += count
      if (e < 1e-12) continue
      const c = Math.hypot(xx - yy, 2 * xy) / e
      if (c < 0.2) continue
      coherent++
      // Cada bloque coherente pesa por su coherencia (no por su energía: un nudo no manda).
      const k = c / e
      sxx += k * xx
      sxy += k * xy
      syy += k * yy
      total += c
    }
  }
  const energy = energyCount ? energySum / energyCount : 0
  if (!coherent || total <= 0) return { angleDeg: 0, coherence: 0, energy, blockAgreement: blocks ? coherent / blocks : 0 }
  const e = sxx + syy
  const coherenceRaw = e > 0 ? Math.hypot(sxx - syy, 2 * sxy) / e : 0
  const normal = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  let tangent = normal + Math.PI / 2
  while (tangent > Math.PI / 2) tangent -= Math.PI
  while (tangent <= -Math.PI / 2) tangent += Math.PI
  const agreement = coherent / blocks
  // Una foto donde solo unos pocos bloques tienen dirección no es una veta confiable.
  const coherence = coherenceRaw * Math.min(1, agreement / 0.6)
  return { angleDeg: round(tangent * (180 / Math.PI), 2), coherence: round(coherence, 3), energy, blockAgreement: round(agreement, 3) }
}

/** Lado del mayor cuadrado centrado sin esquinas vacías tras girar un recorte cuadrado de lado `side`. */
export function validRotatedSquare(side: number, angleDeg: number): number {
  const a = (angleDeg * Math.PI) / 180
  return Math.floor(side / (Math.abs(Math.cos(a)) + Math.abs(Math.sin(a))))
}

/**
 * Giro (horario) para dejar la veta horizontal. Ángulos pequeños no se tocan (remuestrear empeora
 * la foto sin ganar nada visible); casi verticales se giran exacto 90°.
 */
export function rotationForGrain(angleDeg: number): number {
  if (Math.abs(angleDeg) < 1.5) return 0
  if (Math.abs(Math.abs(angleDeg) - 90) < 1.5) return angleDeg > 0 ? -90 : 90
  return round(-angleDeg, 2)
}

// ── Iluminación ──────────────────────────────────────────────────────────────

/**
 * Corrige un degradado de luz amplio (foto con lámpara de un lado, viñeta). Ajusta un polinomio de
 * 2.º grado a la luminancia en una grilla gruesa y divide con ganancia acotada, conservando la
 * media. Las bandas de una catedral de roble son más finas que el polinomio y sobreviven.
 */
export function flattenIllumination(img: LinearImage, maxGain = 0.12): { image: LinearImage; corrected: boolean; variation: number } {
  const { width: w, height: h } = img
  const lum = luminance(img)
  const grid = 24
  const samples: { x: number; y: number; v: number }[] = []
  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      const x0 = Math.floor((gx * w) / grid)
      const x1 = Math.floor(((gx + 1) * w) / grid)
      const y0 = Math.floor((gy * h) / grid)
      const y1 = Math.floor(((gy + 1) * h) / grid)
      let sum = 0
      let n = 0
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) (sum += lum[y * w + x]!), n++
      if (n) samples.push({ x: (x0 + x1) / 2 / w - 0.5, y: (y0 + y1) / 2 / h - 0.5, v: sum / n })
    }
  }
  const coef = fitQuadratic(samples)
  const mean = samples.reduce((s, p) => s + p.v, 0) / Math.max(1, samples.length)
  if (!coef || mean <= 1e-4) return { image: img, corrected: false, variation: 0 }
  let min = Infinity
  let max = -Infinity
  for (const p of samples) {
    const f = evalQuadratic(coef, p.x, p.y)
    min = Math.min(min, f)
    max = Math.max(max, f)
  }
  const variation = min > 0 ? max / min - 1 : 0
  // Menos de un 5 % de diferencia entre lados no se nota al repetir: no se toca.
  if (!(variation > 0.05)) return { image: img, corrected: false, variation: round(variation, 3) }
  const out = new Float32Array(img.data.length)
  for (let y = 0; y < h; y++) {
    const ny = (y + 0.5) / h - 0.5
    for (let x = 0; x < w; x++) {
      const f = evalQuadratic(coef, (x + 0.5) / w - 0.5, ny)
      const gain = f > 1e-5 ? Math.min(1 + maxGain, Math.max(1 - maxGain, mean / f)) : 1
      const j = (y * w + x) * 3
      out[j] = img.data[j]! * gain
      out[j + 1] = img.data[j + 1]! * gain
      out[j + 2] = img.data[j + 2]! * gain
    }
  }
  return { image: { width: w, height: h, data: out }, corrected: true, variation: round(variation, 3) }
}

type Quadratic = [number, number, number, number, number, number]

function evalQuadratic(c: Quadratic, x: number, y: number): number {
  return c[0] + c[1] * x + c[2] * y + c[3] * x * x + c[4] * x * y + c[5] * y * y
}

/** Mínimos cuadrados v ≈ a + bx + cy + dx² + exy + fy² (ecuaciones normales 6×6). */
function fitQuadratic(points: { x: number; y: number; v: number }[]): Quadratic | null {
  if (points.length < 12) return null
  const m = Array.from({ length: 6 }, () => new Float64Array(7))
  for (const p of points) {
    const f = [1, p.x, p.y, p.x * p.x, p.x * p.y, p.y * p.y]
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) m[i]![j]! += f[i]! * f[j]!
      m[i]![6]! += f[i]! * p.v
    }
  }
  // Gauss-Jordan con pivoteo parcial.
  for (let col = 0; col < 6; col++) {
    let pivot = col
    for (let r = col + 1; r < 6; r++) if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r
    if (Math.abs(m[pivot]![col]!) < 1e-12) return null
    ;[m[col], m[pivot]] = [m[pivot]!, m[col]!]
    const div = m[col]![col]!
    for (let j = col; j < 7; j++) m[col]![j]! /= div
    for (let r = 0; r < 6; r++) {
      if (r === col) continue
      const factor = m[r]![col]!
      if (!factor) continue
      for (let j = col; j < 7; j++) m[r]![j]! -= factor * m[col]![j]!
    }
  }
  return m.map((row) => row[6]!) as Quadratic
}

// ── Paleta ───────────────────────────────────────────────────────────────────

/**
 * Colores de la foto (recorte limpio, ANTES del fundido de bordes). Promedio en luz lineal; claro y
 * oscuro = promedio RGB de las colas del 10 % por luminancia (colores que existen en la foto); base
 * = promedio de la ventana 45–55 % (la «mediana» de la textura).
 */
export function extractPalette(img: LinearImage): TexturePalette {
  const n = img.width * img.height
  const d = img.data
  const lum = luminance(img)
  // Cuantiles por histograma (O(n), sin ordenar 262 mil píxeles).
  const BINS = 4096
  const hist = new Uint32Array(BINS)
  const binOf = (v: number) => Math.min(BINS - 1, Math.max(0, Math.floor(v * BINS)))
  let clipped = 0
  for (let i = 0; i < n; i++) {
    hist[binOf(lum[i]!)]!++
    if (lum[i]! > 0.92) clipped++
  }
  // Brillos quemados (casi blanco puro) no son el color del foliado: si son pocos, no cuentan.
  const ceiling = clipped > 0 && clipped < n * 0.15 ? binOf(0.92) : BINS
  let population = 0
  for (let b = 0; b < ceiling; b++) population += hist[b]!
  const binAt = (fraction: number) => {
    const target = fraction * population
    let acc = 0
    for (let b = 0; b < ceiling; b++) {
      acc += hist[b]!
      if (acc >= target) return b
    }
    return ceiling - 1
  }
  const meanIn = (fromBin: number, toBin: number) => {
    let r = 0
    let g = 0
    let b = 0
    let c = 0
    for (let i = 0, j = 0; i < n; i++, j += 3) {
      const k = binOf(lum[i]!)
      if (k < fromBin || k > toBin) continue
      r += d[j]!
      g += d[j + 1]!
      b += d[j + 2]!
      c++
    }
    if (!c) return null
    return hexOf(linearToSrgbByte(r / c), linearToSrgbByte(g / c), linearToSrgbByte(b / c))
  }
  let r = 0
  let g = 0
  let b = 0
  for (let j = 0; j < d.length; j += 3) (r += d[j]!), (g += d[j + 1]!), (b += d[j + 2]!)
  const average = hexOf(linearToSrgbByte(r / n), linearToSrgbByte(g / n), linearToSrgbByte(b / n))
  const top = Math.min(ceiling - 1, BINS - 1)
  return {
    average,
    base: meanIn(binAt(0.45), binAt(0.55)) ?? average,
    light: meanIn(binAt(0.9), top) ?? average,
    dark: meanIn(0, binAt(0.1)) ?? average,
  }
}

// ── Costura ──────────────────────────────────────────────────────────────────

export interface PeriodicWindow {
  x0: number
  width: number
  y0: number
  height: number
  /** Diferencia media (luminancia lineal) entre lo que se funde en cada borde: menor = mejor. */
  costX: number
  costY: number
}

/**
 * Busca, dentro de la imagen, la ventana cuyo final empalma mejor con lo que hay justo antes de
 * su inicio (por eje): así, al fundir el último tramo con el material previo al borde opuesto, se
 * mezclan dos trozos casi iguales (sin fantasmas ni bandas lavadas). Deja `band` px de margen
 * antes de x0/y0. Prefiere ventanas grandes (castiga levemente recortar de más).
 */
export function findPeriodicWindow(img: LinearImage, band: number, minFraction = 0.78): PeriodicWindow {
  const { width: w, height: h } = img
  const lum = luminance(img)
  /** `lines[along * across + i]`: luminancia submuestreada a lo ancho, contigua por posición. */
  const axis = (len: number, lines: Float32Array, across: number) => {
    const b = Math.max(2, Math.min(band, Math.floor(len / 8)))
    const minLen = Math.max(b * 2, Math.floor((len - b) * minFraction))
    const maxLen = len - b
    const cost = (start: number, size: number) => {
      let sum = 0
      for (let k = 0; k < b; k += 2) {
        const p = (start + size - b + k) * across
        const q = (start - b + k) * across
        for (let i = 0; i < across; i++) sum += Math.abs(lines[p + i]! - lines[q + i]!)
      }
      return (sum / (Math.ceil(b / 2) * across)) * (1 + 0.25 * (1 - size / maxLen))
    }
    let best = { start: b, size: maxLen, cost: Infinity }
    // Grueso (paso 4) y después fino (±4 alrededor del mejor).
    for (let size = maxLen; size >= minLen; size -= 4) {
      for (let start = b; start + size <= len; start += 4) {
        const c = cost(start, size)
        if (c < best.cost) best = { start, size, cost: c }
      }
    }
    const coarse = best
    for (let size = Math.min(maxLen, coarse.size + 4); size >= Math.max(minLen, coarse.size - 4); size--) {
      for (let start = Math.max(b, coarse.start - 4); start <= coarse.start + 4 && start + size <= len; start++) {
        const c = cost(start, size)
        if (c < best.cost) best = { start, size, cost: c }
      }
    }
    return { start: best.start, size: best.size, cost: Number.isFinite(best.cost) ? best.cost : 0 }
  }
  const sample = (count: number) => Math.max(1, Math.floor(count / 128))
  const sx = sample(h)
  const acrossX = Math.ceil(h / sx)
  const columns = new Float32Array(w * acrossX)
  for (let x = 0; x < w; x++) for (let i = 0; i < acrossX; i++) columns[x * acrossX + i] = lum[Math.min(h - 1, i * sx) * w + x]!
  const sy = sample(w)
  const acrossY = Math.ceil(w / sy)
  const rows = new Float32Array(h * acrossY)
  for (let y = 0; y < h; y++) for (let i = 0; i < acrossY; i++) rows[y * acrossY + i] = lum[y * w + Math.min(w - 1, i * sy)]!
  const x = axis(w, columns, acrossX)
  const y = axis(h, rows, acrossY)
  return { x0: x.start, width: x.size, y0: y.start, height: y.size, costX: round(x.cost, 5), costY: round(y.cost, 5) }
}

/**
 * Tesela continua a partir de una ventana periódica: el último tramo de cada eje se funde (coseno)
 * con el material que está justo antes del borde opuesto, así el píxel final empalma con el
 * primero de la repetición siguiente. Primero x (sobre las filas de y0−banda…y0+alto), luego y.
 */
export function periodicTile(img: LinearImage, win: PeriodicWindow, band: number): LinearImage {
  const { width: w } = img
  const bx = Math.max(2, Math.min(band, win.x0, Math.floor(win.width / 3)))
  const by = Math.max(2, Math.min(band, win.y0, Math.floor(win.height / 3)))
  const ease = (k: number, b: number) => 0.5 - 0.5 * Math.cos((Math.PI * (k + 1)) / (b + 1))
  const W = win.width
  const rows = win.height + by
  const mid = new Float32Array(W * rows * 3)
  for (let r = 0; r < rows; r++) {
    const sy = win.y0 - by + r
    for (let x = 0; x < W; x++) {
      const s = (sy * w + win.x0 + x) * 3
      const t = (r * W + x) * 3
      const k = x - (W - bx)
      if (k >= 0) {
        const a = ease(k, bx)
        const p = (sy * w + win.x0 - bx + k) * 3
        for (let c = 0; c < 3; c++) mid[t + c] = img.data[s + c]! * (1 - a) + img.data[p + c]! * a
      } else {
        mid[t] = img.data[s]!
        mid[t + 1] = img.data[s + 1]!
        mid[t + 2] = img.data[s + 2]!
      }
    }
  }
  const H = win.height
  const out = new Float32Array(W * H * 3)
  for (let y = 0; y < H; y++) {
    const k = y - (H - by)
    for (let x = 0; x < W; x++) {
      const s = ((y + by) * W + x) * 3
      const t = (y * W + x) * 3
      if (k >= 0) {
        const a = ease(k, by)
        const p = (k * W + x) * 3 // filas previas al borde superior (margen)
        for (let c = 0; c < 3; c++) out[t + c] = mid[s + c]! * (1 - a) + mid[p + c]! * a
      } else {
        out[t] = mid[s]!
        out[t + 1] = mid[s + 1]!
        out[t + 2] = mid[s + 2]!
      }
    }
  }
  return { width: W, height: H, data: out }
}

/**
 * Fundido de bordes opuestos en luz lineal (investigación 21, F5): cada par de píxeles a la misma
 * distancia del borde se acerca a su promedio con peso coseno (1 en el borde, 0 al final de la
 * franja). Primero en x, luego en y, leyendo siempre una copia inmutable: los bordes opuestos
 * quedan iguales (también las esquinas) y el centro no se toca.
 */
export function featherSeams(img: LinearImage, bandX: number, bandY: number): LinearImage {
  const { width: w, height: h } = img
  const bx = Math.max(2, Math.min(Math.round(bandX), Math.floor(w / 3)))
  const by = Math.max(2, Math.min(Math.round(bandY), Math.floor(h / 3)))
  const weight = (k: number, b: number) => 0.5 * (1 + Math.cos((Math.PI * k) / (b - 1)))
  const out = new Float32Array(img.data)
  const passX = new Float32Array(out)
  for (let y = 0; y < h; y++) {
    for (let k = 0; k < bx; k++) {
      const alpha = weight(k, bx)
      const ia = (y * w + k) * 3
      const ib = (y * w + (w - 1 - k)) * 3
      for (let c = 0; c < 3; c++) {
        const a = passX[ia + c]!
        const z = passX[ib + c]!
        const mean = (a + z) / 2
        out[ia + c] = a + alpha * (mean - a)
        out[ib + c] = z + alpha * (mean - z)
      }
    }
  }
  const passY = new Float32Array(out)
  for (let x = 0; x < w; x++) {
    for (let k = 0; k < by; k++) {
      const alpha = weight(k, by)
      const ia = (k * w + x) * 3
      const ib = ((h - 1 - k) * w + x) * 3
      for (let c = 0; c < 3; c++) {
        const a = passY[ia + c]!
        const z = passY[ib + c]!
        const mean = (a + z) / 2
        out[ia + c] = a + alpha * (mean - a)
        out[ib + c] = z + alpha * (mean - z)
      }
    }
  }
  return { width: w, height: h, data: out }
}

/** Espejo 2×2: una tesela del doble de lado, periódica por construcción (veta simétrica). */
export function mirrorTile(img: LinearImage): LinearImage {
  const { width: w, height: h } = img
  const W = w * 2
  const H = h * 2
  const out = new Float32Array(W * H * 3)
  for (let y = 0; y < H; y++) {
    const sy = y < h ? y : 2 * h - 1 - y
    for (let x = 0; x < W; x++) {
      const sx = x < w ? x : 2 * w - 1 - x
      const s = (sy * w + sx) * 3
      const t = (y * W + x) * 3
      out[t] = img.data[s]!
      out[t + 1] = img.data[s + 1]!
      out[t + 2] = img.data[s + 2]!
    }
  }
  return { width: W, height: H, data: out }
}

/**
 * Qué tanto se nota la costura al repetir. Al poner la tesela junto a sí misma, el borde derecho
 * toca al izquierdo: se mide el salto de valor y el quiebre de pendiente (segunda diferencia) a
 * través de ese borde, y se compara con lo mismo entre vecinos interiores. ≈ 1 = como cualquier
 * otro punto de la textura; > 2 = se ve una línea o un pliegue.
 */
export function seamScore(img: RgbImage): number {
  const { width: w, height: h, data: d } = img
  if (w < 6 || h < 6) return 0
  const lum = (x: number, y: number) => {
    const j = (((y + h) % h) * w + ((x + w) % w)) * 3
    return 0.299 * d[j]! + 0.587 * d[j + 1]! + 0.114 * d[j + 2]!
  }
  // Segunda diferencia horizontal centrada entre x y x+1 (4 muestras: x−1, x, x+1, x+2).
  const crossX = (x: number, y: number) => Math.abs(lum(x + 2, y) - lum(x + 1, y) - (lum(x, y) - lum(x - 1, y))) + Math.abs(lum(x + 1, y) - lum(x, y))
  const crossY = (x: number, y: number) => Math.abs(lum(x, y + 2) - lum(x, y + 1) - (lum(x, y) - lum(x, y - 1))) + Math.abs(lum(x, y + 1) - lum(x, y))
  let wrap = 0
  let wrapN = 0
  for (let y = 0; y < h; y++) (wrap += crossX(w - 1, y)), wrapN++
  for (let x = 0; x < w; x++) (wrap += crossY(x, h - 1)), wrapN++
  let inner = 0
  let innerN = 0
  const step = Math.max(1, Math.floor(Math.min(w, h) / 64))
  for (let y = 2; y < h - 3; y += step) {
    for (let x = 2; x < w - 3; x += step) {
      inner += crossX(x, y) + crossY(x, y)
      innerN += 2
    }
  }
  const a = wrap / Math.max(1, wrapN)
  const b = inner / Math.max(1, innerN)
  return round(a / Math.max(0.25, b), 2)
}

// ── Acabado probable ─────────────────────────────────────────────────────────

export interface SurfaceStats {
  /** Desviación del paso alto en luminancia perceptual (0–1): cuánto «dibujo» tiene. */
  detail: number
  /** Saturación media (0–1). */
  saturation: number
  /** Luminancia perceptual media (0–1). */
  lightness: number
  /** Matiz medio en grados (0–360) ponderado por saturación, o −1 si es gris. */
  hue: number
  /**
   * Amplitud del dibujo de frecuencia media (desviación de banda entre un suavizado leve y uno
   * amplio, sin bordes): la veta suave de una foto de madera tiene poco «detail» de alta
   * frecuencia pero mucha estructura; un liso con degradé o bandas de 8 bits casi nada.
   */
  structure: number
}

export function surfaceStats(img: RgbImage): SurfaceStats {
  const { width: w, height: h, data: d } = img
  const n = w * h
  const y = new Float32Array(n)
  let sat = 0
  let light = 0
  let hx = 0
  let hy = 0
  for (let i = 0, j = 0; i < n; i++, j += 3) {
    const r = d[j]! / 255
    const g = d[j + 1]! / 255
    const b = d[j + 2]! / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = 0.299 * r + 0.587 * g + 0.114 * b
    y[i] = l
    light += l
    const s = max > 0 ? (max - min) / max : 0
    sat += s
    if (max - min > 1e-3) {
      let hue: number
      if (max === r) hue = ((g - b) / (max - min)) % 6
      else if (max === g) hue = (b - r) / (max - min) + 2
      else hue = (r - g) / (max - min) + 4
      const a = (hue * 60 * Math.PI) / 180
      hx += s * Math.cos(a)
      hy += s * Math.sin(a)
    }
  }
  const blurred = boxBlur(y, w, h, 3)
  let varSum = 0
  for (let i = 0; i < n; i++) {
    const v = y[i]! - blurred[i]!
    varSum += v * v
  }
  const hueDeg = Math.hypot(hx, hy) / n < 0.02 ? -1 : (((Math.atan2(hy, hx) * 180) / Math.PI) + 360) % 360
  // Banda media: suavizado r=2 menos suavizado amplio (lado/16), solo en el interior (sin bordes).
  const wide = Math.max(4, Math.round(Math.min(w, h) / 16))
  const fine = boxBlur(y, w, h, 2)
  const coarse = boxBlur(y, w, h, wide)
  let bandSum = 0
  let bandN = 0
  for (let yy = wide; yy < h - wide; yy++) {
    for (let xx = wide; xx < w - wide; xx++) {
      const v = fine[yy * w + xx]! - coarse[yy * w + xx]!
      bandSum += v * v
      bandN++
    }
  }
  const structure = bandN ? Math.sqrt(bandSum / bandN) : 0
  return { detail: round(Math.sqrt(varSum / n), 4), saturation: round(sat / n, 3), lightness: round(light / n, 3), hue: round(hueDeg, 1), structure: round(structure, 4) }
}

/** Estructura de frecuencia media desde la que una dirección clara es veta aunque haya poco detalle. */
export const GRAIN_STRUCTURE_MIN = 0.006

/**
 * Acabado probable sin IA. Con dirección clara (anisotropía del tensor de estructura) y dibujo
 * visible —de alta frecuencia o de veta suave de frecuencia media—: metálico si es gris
 * (cepillado), veta si no. Liso: casi sin detalle ni estructura dirigida. Sin dirección:
 * texturizado (arenado, mineral).
 */
export function guessFinish(stats: Pick<SurfaceStats, 'detail' | 'saturation' | 'lightness'> & Partial<Pick<SurfaceStats, 'structure'>>, grain: Pick<GrainEstimate, 'coherence'>): TextureFinish {
  const directional = (): TextureFinish => (stats.saturation < 0.09 && stats.lightness > 0.35 ? 'metallic' : 'woodgrain')
  // Veta suave (foto de madera desenfocada o de poro fino): poco detalle, pero dirección y estructura.
  if (stats.detail < 0.0055) return grain.coherence >= 0.3 && (stats.structure ?? 0) >= GRAIN_STRUCTURE_MIN ? directional() : 'smooth'
  if (grain.coherence >= 0.3) return directional()
  return stats.saturation > 0.18 && grain.coherence >= 0.18 ? 'woodgrain' : 'textured'
}

/** Escala por defecto (mm por repetición) según el acabado: la de la biblioteca integrada. */
export const DEFAULT_SCALE_MM: Record<TextureFinish, number> = { smooth: 300, woodgrain: 900, textured: 120, metallic: 400 }

/** Distancia perceptual simple (CIE76 en Lab) entre dos colores hex. */
export function colorDistance(a: string, b: string): number {
  const [l1, a1, b1] = toLab(parseHex(a))
  const [l2, a2, b2] = toLab(parseHex(b))
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

function toLab([r, g, b]: [number, number, number]): [number, number, number] {
  const R = srgbToLinear(r)
  const G = srgbToLinear(g)
  const B = srgbToLinear(b)
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

function round(value: number, digits: number): number {
  const p = 10 ** digits
  return Math.round(value * p) / p
}
