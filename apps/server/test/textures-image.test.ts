import { describe, expect, it } from 'vitest'
import type { Catalog, Color, Line, Profile } from '@dekopen/engine'
import {
  estimateGrain,
  extractPalette,
  featherSeams,
  findPeriodicWindow,
  flattenIllumination,
  guessFinish,
  mirrorTile,
  periodicTile,
  rotationForGrain,
  seamScore,
  surfaceStats,
  toLinear,
  toSrgb,
  validRotatedSquare,
  type RgbImage,
} from '../src/services/textures/image'
import { applyCustomColors, colorsUsingTexture, newCustomColorId, slugify } from '../src/services/textures/custom-colors'
import { cleanSuggestedName } from '../src/services/textures/ai'
import { defaultTextureName, similarBuiltinTextures } from '../src/services/textures/names'
import { smoothRampImage, softWoodImage, woodImage } from './texture-fixtures'

function noiseImage(w: number, h: number, base: number, spread: number, seed = 5): RgbImage {
  const data = new Uint8Array(w * h * 3)
  let s = seed
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  for (let i = 0; i < data.length; i += 3) {
    const v = base + (rnd() - 0.5) * spread
    data[i] = v
    data[i + 1] = v + 4
    data[i + 2] = v + 8
  }
  return { width: w, height: h, data }
}

function solid(w: number, h: number, rgb: [number, number, number]): RgbImage {
  const data = new Uint8Array(w * h * 3)
  for (let i = 0; i < data.length; i += 3) data.set(rgb, i)
  return { width: w, height: h, data }
}

const angleDiff = (a: number, b: number) => {
  let d = Math.abs(a - b) % 180
  if (d > 90) d = 180 - d
  return d
}

describe('veta: tensor de estructura', () => {
  it.each([0, 18, 35, -40, 62, 90])('encuentra la veta a %s° con buena coherencia', (angle) => {
    const g = estimateGrain(toLinear(woodImage(320, 320, angle)))
    expect(angleDiff(g.angleDeg, angle)).toBeLessThan(2.5)
    expect(g.coherence).toBeGreaterThan(0.6)
  })

  it('una textura sin dirección (arenado) no tiene veta confiable', () => {
    const g = estimateGrain(toLinear(noiseImage(256, 256, 70, 40)))
    expect(g.coherence).toBeLessThan(0.2)
  })

  it('un color liso no tiene dirección y no revienta', () => {
    expect(estimateGrain(toLinear(solid(128, 128, [240, 240, 236]))).coherence).toBe(0)
    expect(estimateGrain(toLinear(solid(8, 8, [10, 10, 10])))).toMatchObject({ coherence: 0 })
  })

  it('giro para dejar la veta horizontal: ignora ángulos mínimos y fija 90° exactos', () => {
    expect(rotationForGrain(0.8)).toBe(0)
    expect(rotationForGrain(25)).toBe(-25)
    expect(rotationForGrain(-12.5)).toBe(12.5)
    expect(rotationForGrain(89.2)).toBe(-90)
    expect(rotationForGrain(-89.6)).toBe(90)
  })

  it('el cuadrado válido tras girar no deja esquinas vacías', () => {
    expect(validRotatedSquare(1000, 0)).toBe(1000)
    expect(validRotatedSquare(1000, 45)).toBe(707)
    expect(validRotatedSquare(1000, 90)).toBe(1000)
    expect(validRotatedSquare(1000, -20)).toBe(Math.floor(1000 / (Math.cos(0.349066) + Math.sin(0.349066))))
  })
})

describe('iluminación y paleta', () => {
  it('corrige un degradado de luz amplio conservando la media', () => {
    const img = toLinear(woodImage(256, 256, 0, { gradient: 0.1 }))
    const before = extractPalette(img).average
    const out = flattenIllumination(img)
    expect(out.corrected).toBe(true)
    expect(out.variation).toBeGreaterThan(0.08)
    // La diferencia entre la mitad izquierda y la derecha baja claramente.
    const halves = (data: Float32Array) => {
      let l = 0
      let r = 0
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) (x < 128 ? (l += data[(y * 256 + x) * 3]!) : (r += data[(y * 256 + x) * 3]!))
      return Math.abs(r - l) / (r + l)
    }
    expect(halves(out.image.data)).toBeLessThan(halves(img.data) * 0.5)
    // El promedio casi no cambia (ganancia acotada que conserva la media).
    const after = extractPalette(out.image).average
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16)
    expect(Math.abs(lum(after) - lum(before))).toBeLessThan(18)
  })

  it('no toca una foto pareja', () => {
    const out = flattenIllumination(toLinear(woodImage(200, 200, 10)))
    expect(out.corrected).toBe(false)
  })

  it('claro y oscuro salen de colores que están en la foto; el promedio es lineal', () => {
    const img = solid(100, 100, [40, 30, 20])
    for (let i = 0; i < img.data.length / 2; i += 3) img.data.set([220, 180, 120], i)
    const p = extractPalette(toLinear(img))
    expect(p.dark).toBe('#281E14')
    expect(p.light).toBe('#DCB478')
    // Promedio en luz lineal: más claro que el promedio aritmético de los bytes (#82694C).
    expect(parseInt(p.average.slice(1, 3), 16)).toBeGreaterThan(0x82)
  })

  it('los brillos quemados no ensucian el color claro', () => {
    const img = solid(100, 100, [120, 80, 40])
    for (let i = 0; i < 300 * 3; i += 3) img.data.set([255, 255, 255], i)
    expect(extractPalette(toLinear(img)).light).toBe('#785028')
  })
})

describe('costura', () => {
  it('el fundido deja iguales los bordes opuestos y no toca el centro', () => {
    const lin = toLinear(woodImage(128, 128, 20))
    const out = featherSeams(lin, 16, 16)
    for (const y of [0, 40, 127]) for (let c = 0; c < 3; c++) expect(out.data[(y * 128) * 3 + c]).toBeCloseTo(out.data[(y * 128 + 127) * 3 + c]!, 6)
    const mid = (64 * 128 + 64) * 3
    expect(out.data[mid]).toBe(lin.data[mid])
  })

  it('la ventana periódica empalma la veta mucho mejor que un recorte cualquiera', () => {
    const lin = toLinear(woodImage(640, 640, 0, { period: 19 }))
    const raw = toSrgb(lin)
    const win = findPeriodicWindow(lin, 40)
    expect(win.x0).toBeGreaterThanOrEqual(40)
    expect(win.height).toBeGreaterThan(640 * 0.7)
    const tile = toSrgb(periodicTile(lin, win, 40))
    expect(tile.width).toBe(win.width)
    expect(tile.height).toBe(win.height)
    const crop: RgbImage = { width: 500, height: 500, data: new Uint8Array(500 * 500 * 3) }
    for (let y = 0; y < 500; y++) crop.data.set(raw.data.subarray((y * 640) * 3, (y * 640 + 500) * 3), y * 500 * 3)
    expect(seamScore(crop)).toBeGreaterThan(1.6)
    expect(seamScore(tile)).toBeLessThan(1.4)
  })

  it('el espejo 2×2 duplica el lado y es periódico por construcción', () => {
    const lin = toLinear(woodImage(64, 64, 30))
    const out = mirrorTile(lin)
    expect(out.width).toBe(128)
    expect(out.data[0]).toBe(out.data[127 * 3])
    expect(seamScore(toSrgb(out))).toBeLessThan(1.5)
  })
})

describe('acabado probable', () => {
  it('liso, veta, metálico y texturizado', () => {
    expect(guessFinish(surfaceStats(solid(64, 64, [245, 245, 240])), { coherence: 0 })).toBe('smooth')
    const wood = woodImage(256, 256, 0)
    expect(guessFinish(surfaceStats(wood), estimateGrain(toLinear(wood)))).toBe('woodgrain')
    const brushed = woodImage(256, 256, 0, { period: 5 })
    for (let i = 0; i < brushed.data.length; i += 3) {
      const g = Math.round((brushed.data[i]! + brushed.data[i + 1]! + brushed.data[i + 2]!) / 3) + 40
      brushed.data[i] = g
      brushed.data[i + 1] = g
      brushed.data[i + 2] = g + 2
    }
    expect(guessFinish(surfaceStats(brushed), estimateGrain(toLinear(brushed)))).toBe('metallic')
    const sand = noiseImage(256, 256, 70, 50)
    expect(guessFinish(surfaceStats(sand), estimateGrain(toLinear(sand)))).toBe('textured')
  })

  it('veta suave (poco detalle, dirección y estructura claras) es madera, no «Liso»; un degradé liso sigue liso', () => {
    for (const img of [softWoodImage(512, 512), softWoodImage(512, 512, { period: 60, contrast: 0.08 }), softWoodImage(512, 512, { base: [90, 60, 40], contrast: 0.1 })]) {
      const stats = surfaceStats(img)
      const grain = estimateGrain(toLinear(img))
      expect(stats.detail).toBeLessThan(0.0055)
      expect(grain.coherence).toBeGreaterThan(0.3)
      expect(guessFinish(stats, grain)).toBe('woodgrain')
    }
    const ramp = smoothRampImage(512, 512)
    expect(guessFinish(surfaceStats(ramp), estimateGrain(toLinear(ramp)))).toBe('smooth')
    expect(guessFinish(surfaceStats(solid(64, 64, [60, 64, 68])), { coherence: 0.9 })).toBe('smooth')
  })

  it('nombre descriptivo por acabado y tono, en el idioma pedido', () => {
    expect(defaultTextureName('woodgrain', { average: '#A76B32' }, 'es')).toBe('Madera media')
    expect(defaultTextureName('woodgrain', { average: '#3B2A1E' }, 'de')).toBe('Holz dunkel')
    expect(defaultTextureName('textured', { average: '#E8E1D2' }, 'tr')).toBe('Açık dokulu')
    expect(similarBuiltinTextures('woodgrain', { average: '#A86C33' })[0]).toBe('golden_oak')
    expect(similarBuiltinTextures('woodgrain', { average: '#00FF00' })).toEqual([])
  })

  it('el nombre sugerido por la IA se limpia (sin marcas, controles ni bidi)', () => {
    expect(cleanSuggestedName('  Roble <script>alert(1)</script> rústico‮  ')).toBe('Roble scriptalert(1)/script rústico')
    expect(cleanSuggestedName('Nogal "oscuro" {x}')).toBe('Nogal oscuro x')
    expect(cleanSuggestedName('a'.repeat(200))).toHaveLength(60)
  })
})

// ── Colores propios en el catálogo efectivo ──────────────────────────────────

const line = (id: string, colorIds: string[]): Line => ({ id, brandId: 'b', name: id, kind: 'casement', pauta: {}, profiles: {}, colorIds, typologyIds: [], hardwareRules: [], accessoryRules: [] }) as unknown as Line
const profile = (id: string, lineId: string, priceByColor: Record<string, number>, role: Profile['role'] = 'frame'): Profile => ({ id, lineId, code: id, name: id, role, barLength: 5800, priceByColor })
const color = (id: string, name: string, extra: Partial<Color> = {}): Color => ({ id, name, hex: '#FFFFFF', ...extra })

function catalog(): Catalog {
  return {
    colors: [color('blanco', 'Blanco'), color('nogal', 'Nogal', { hex: '#5B3A22' })],
    brands: [],
    lines: [line('l1', ['blanco', 'nogal']), line('l2', ['blanco'])],
    profiles: [profile('p1', 'l1', { blanco: 10000, nogal: 13000 }), profile('p2', 'l2', { blanco: 8000 }), profile('r1', 'l1', { '*': 2000 }, 'reinforcement')],
    items: [],
    glass: [],
    brandSettings: [],
  }
}

describe('colores propios en el catálogo efectivo', () => {
  const now = '2026-10-31T12:00:00.000Z'
  const custom = {
    colors: [color('custom-roble', 'Roble rústico', { hex: '#9A6A3A', texture: { kind: 'upload' as const, assetId: 'a1', scaleMm: 800 } }), color('custom-gris', 'Gris propio')],
    colorSettings: {
      'custom-roble': { lineIds: ['l1', 'l2'], priceFactor: 1.15, createdAt: now, updatedAt: now },
      'custom-gris': { lineIds: ['l1'], priceFactor: 1.2, priceBaseColorId: 'nogal', archivedAt: now, createdAt: now, updatedAt: now },
    },
    colorTextures: { nogal: { kind: 'builtin' as const, id: 'nut_tree' as const } },
  }

  it('agrega el color a sus líneas, precia por factor y respeta archivados y precios propios', () => {
    const base = catalog()
    const merged = applyCustomColors({ ...base, colors: [...base.colors, ...custom.colors] }, custom)
    expect(merged.lines.find((l) => l.id === 'l1')!.colorIds).toEqual(['blanco', 'nogal', 'custom-roble'])
    expect(merged.lines.find((l) => l.id === 'l2')!.colorIds).toEqual(['blanco', 'custom-roble'])
    const p1 = merged.profiles.find((p) => p.id === 'p1')!
    expect(p1.priceByColor['custom-roble']).toBe(11500)
    // Archivado: no se ofrece, pero sigue cotizando (sobre su color de referencia).
    expect(merged.lines.find((l) => l.id === 'l1')!.colorIds).not.toContain('custom-gris')
    expect(p1.priceByColor['custom-gris']).toBe(15600)
    expect(merged.profiles.find((p) => p.id === 'p2')!.priceByColor['custom-roble']).toBe(9200)
    // El refuerzo no lleva color.
    expect(merged.profiles.find((p) => p.id === 'r1')!.priceByColor).toEqual({ '*': 2000 })
    // Textura propia sobre un color base.
    expect(merged.colors.find((c) => c.id === 'nogal')!.texture).toEqual({ kind: 'builtin', id: 'nut_tree' })
  })

  it('«Mismo precio» hereda los precios del color base (también en perfiles que la línea toma de otra) y no suma faltantes', () => {
    const base = catalog()
    // l2 usa como travesaño un perfil de l1 (perfil compartido de la marca).
    base.lines[1] = { ...base.lines[1]!, profiles: { frame: 'p2', mullion: 'p1' } } as Line
    const same = {
      colors: [color('custom-crema', 'Crema propio')],
      colorSettings: { 'custom-crema': { lineIds: ['l2'], priceFactor: 1, priceBaseColorId: 'blanco', createdAt: now, updatedAt: now } },
    }
    const merged = applyCustomColors({ ...base, colors: [...base.colors, ...same.colors] }, same)
    expect(merged.profiles.find((p) => p.id === 'p2')!.priceByColor['custom-crema']).toBe(8000)
    expect(merged.profiles.find((p) => p.id === 'p1')!.priceByColor['custom-crema']).toBe(10000)
    expect(merged.colors.find((c) => c.id === 'custom-crema')!.priceFrom).toEqual({ factor: 1, colorId: 'blanco' })
    // Un color base nunca queda marcado como heredado.
    expect(merged.colors.find((c) => c.id === 'blanco')!.priceFrom).toBeUndefined()
  })

  it('un precio propio cargado para el color propio manda sobre el factor', () => {
    const base = catalog()
    base.profiles[0]!.priceByColor['custom-roble'] = 12345
    const merged = applyCustomColors({ ...base, colors: [...base.colors, ...custom.colors] }, custom)
    expect(merged.profiles[0]!.priceByColor['custom-roble']).toBe(12345)
  })

  it('un color propio nunca tapa a uno base ni se repite', () => {
    const base = catalog()
    const evil = { colors: [color('blanco', 'Blanco falso', { hex: '#FF0000' })], colorSettings: { blanco: { lineIds: ['l1'], createdAt: now, updatedAt: now } } }
    const merged = applyCustomColors({ ...base, colors: [...base.colors, ...evil.colors] }, evil)
    expect(merged.colors.filter((c) => c.id === 'blanco')).toHaveLength(1)
    expect(merged.colors.find((c) => c.id === 'blanco')!.hex).toBe('#FFFFFF')
  })

  it('sin colores propios devuelve el mismo catálogo', () => {
    const base = catalog()
    expect(applyCustomColors(base, {})).toBe(base)
  })

  it('ids custom-… únicos, sin tildes y sin chocar con nada existente', () => {
    expect(slugify('Roble Rústico N°2')).toBe('roble-rustico-n-2')
    expect(slugify('Çam Ağacı')).toBe('cam-agaci')
    expect(slugify('***')).toBe('color')
    const taken = new Set(['custom-roble', 'custom-roble-2', 'blanco'])
    expect(newCustomColorId('Roble', taken)).toBe('custom-roble-3')
    expect(newCustomColorId('Gris', taken)).toBe('custom-gris')
  })

  it('encuentra los colores que usan una textura subida', () => {
    expect(colorsUsingTexture({ ...custom, colorTextures: { nogal: { kind: 'upload', assetId: 'a1' } } } as never, 'a1')).toEqual(['custom-roble', 'nogal'])
  })
})
