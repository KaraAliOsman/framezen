import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { TYPOLOGIES, computeLayout, createDesign, type Catalog, type WindowDesign } from '@dekopen/engine'
import {
  BUILTIN_TEXTURE_IDS,
  BUILTIN_TEXTURE_LIBRARY,
  DrawingDefsSvg,
  WindowDrawing,
  appearanceForColorId,
  builtinTextureName,
  classifyColorName,
  createDrawingDefs,
  loadBuiltinTextures,
  needsPattern,
  profilePieces,
  resolveColorAppearance,
  ringPieces,
  windowGeometry,
} from '../../src/drawing'

const cat = SAMPLE_CATALOG as unknown as Catalog
const COLORS = ['blanco', 'roble-dorado', 'antracita'] as const
const LOCALES = ['es', 'en', 'pt', 'fr', 'de', 'it', 'tr'] as const

function designFor(id: string, colorId: string, colorInId?: string, extras?: WindowDesign['extras']): WindowDesign {
  const t = TYPOLOGIES.find((x) => x.id === id)!
  const line = cat.lines.find((l) => l.typologyIds.includes(id as never)) ?? cat.lines.find((l) => l.kind === t.kind)!
  return { ...createDesign(t.id, { lineId: line.id, colorId, glassId: cat.glass[0].id }), colorInId: colorInId ?? colorId, ...(extras ? { extras } : {}) }
}

beforeAll(async () => {
  await loadBuiltinTextures()
})

describe('profilePieces: despiece con ingletes reales', () => {
  it('un anillo rectangular son 4 piezas trapezoidales con ingletes a 45° y costuras en cada esquina', () => {
    const ring = ringPieces({ x: 0, y: 0, w: 1000, h: 800 }, 60, { role: 'frame', owner: 'frame' })
    expect(ring.pieces.map((p) => p.side)).toEqual(['top', 'right', 'bottom', 'left'])
    expect(ring.seams).toHaveLength(4)
    for (const piece of ring.pieces) {
      expect(piece.polygon).toHaveLength(4)
      expect(piece.joints).toEqual(['mitre', 'mitre'])
    }
    // Veta: travesaños horizontales, montantes verticales.
    expect(ring.pieces.map((p) => p.grain)).toEqual([0, 90, 0, 90])
    // La luz libre queda a una cara de cada lado.
    expect(ring.inner).toEqual({ x: 60, y: 60, w: 880, h: 680 })
  })

  it('un umbral deja las jambas a tope contra la pieza inferior', () => {
    const ring = ringPieces({ x: 0, y: 0, w: 1000, h: 800 }, 60, { role: 'frame', owner: 'frame', buttBottom: true })
    const bottom = ring.pieces.find((p) => p.side === 'bottom')!
    expect(bottom.role).toBe('threshold')
    expect(bottom.joints).toEqual(['butt', 'butt'])
    expect(ring.pieces.find((p) => p.side === 'left')!.joints[0]).toBe('butt')
  })

  it('las piezas de un mismo dibujo tienen ids únicos y semillas estables', () => {
    const design = designFor('casement_fixed_casement', 'roble-dorado')
    const layout = computeLayout(design, cat)
    const a = profilePieces(layout, design)
    const b = profilePieces(layout, design)
    expect(a).toEqual(b)
    expect(windowGeometry(layout, design)).toBe(windowGeometry(layout, design)) // geometría memorizada por layout
    expect(new Set(a.map((p) => p.id)).size).toBe(a.length)
    expect(a.every((p) => Number.isFinite(p.seed))).toBe(true)
  })

  it('hojas con junquillo: marco, hoja y junquillo a inglete; el travesaño central llega a tope', () => {
    const design = designFor('casement_fixed_casement', 'blanco')
    const layout = computeLayout(design, cat)
    const pieces = profilePieces(layout, design)
    const roles = (r: string) => pieces.filter((p) => p.role === r)
    expect(roles('frame')).toHaveLength(4)
    expect(roles('sash')).toHaveLength(8) // 2 hojas × 4 lados
    expect(roles('bead').length).toBeGreaterThanOrEqual(12) // 3 vidrios × 4 lados
    expect(roles('mullion').length).toBeGreaterThanOrEqual(2)
    for (const m of roles('mullion')) expect(m.joints).toEqual(['butt', 'butt'])
    for (const p of [...roles('frame'), ...roles('sash'), ...roles('bead')]) expect(p.joints).toEqual(['mitre', 'mitre'])
  })

  it('el inversor de una doble hoja francesa no sobresale de las hojas que une', () => {
    const design = designFor('french_casement', 'blanco')
    const layout = computeLayout(design, cat)
    const geometry = windowGeometry(layout, design)
    expect(geometry.french).toHaveLength(1)
    const bar = geometry.french[0]
    const ys = bar.polygon.map((p) => p[1])
    const top = Math.min(...layout.sashes.map((s) => s.rect.y))
    const bottom = Math.max(...layout.sashes.map((s) => s.rect.y + s.rect.h))
    expect(Math.min(...ys)).toBeCloseTo(top, 0)
    expect(Math.max(...ys)).toBeCloseTo(bottom, 0)
  })

  it('un arco se corta en dovelas que siguen la curva y un círculo en muchas más', () => {
    const arch = designFor('arch', 'blanco')
    const archPieces = profilePieces(computeLayout(arch, cat), arch).filter((p) => p.role === 'frame')
    expect(archPieces.some((p) => p.side === 'arc')).toBe(true)
    expect(archPieces.filter((p) => p.side === 'arc').length).toBeGreaterThan(8)
    for (const p of archPieces) expect(p.polygon.every((pt) => Number.isFinite(pt[0]) && Number.isFinite(pt[1]))).toBe(true)
  })

  it.each(TYPOLOGIES.map((t) => t.id))('%s: el despiece no está vacío y toda pieza es un polígono finito', (id) => {
    const design = designFor(id, 'blanco')
    const layout = computeLayout(design, cat)
    const pieces = profilePieces(layout, design)
    expect(pieces.length).toBeGreaterThanOrEqual(3)
    for (const piece of pieces) {
      expect(piece.polygon.length).toBeGreaterThanOrEqual(4)
      expect(piece.polygon.every((pt) => Number.isFinite(pt[0]) && Number.isFinite(pt[1]))).toBe(true)
    }
  })
})

describe('WindowDrawing realista en todas las tipologías', () => {
  const cases = TYPOLOGIES.flatMap((t) => COLORS.map((color) => [t.id, color] as const))
  it.each(cases)('%s · %s: ambas vistas y ambos modos sin NaN', (id, color) => {
    const design = designFor(id, color, color === 'blanco' ? 'antracita' : color)
    const layout = computeLayout(design, cat)
    const common = { layout, design, catalog: cat, width: 280, height: 260 } as const
    for (const view of ['interior', 'exterior'] as const) {
      for (const render of ['realistic', 'technical'] as const) {
        const out = renderToStaticMarkup(<WindowDrawing {...common} view={view} render={render} dimensions="all" showLabels />)
        expect(out, `${id} ${view} ${render}`).not.toContain('NaN')
        expect(out).not.toContain('undefined')
        expect(out).toContain(`data-render="${render}"`)
        expect(out).toContain(`data-view="${view}"`)
      }
    }
  })

  it('el dibujo realista usa el color interior en la vista interior y el exterior en la exterior', () => {
    const design = designFor('casement', 'roble-dorado', 'blanco')
    const layout = computeLayout(design, cat)
    const inside = renderToStaticMarkup(<WindowDrawing layout={layout} design={design} catalog={cat} />)
    const outside = renderToStaticMarkup(<WindowDrawing layout={layout} design={design} catalog={cat} view="exterior" />)
    expect(inside).toContain('b-white_9016')
    expect(inside).not.toContain('data-texture="b-golden_oak')
    expect(outside).toContain('data-texture="b-golden_oak')
  })

  it('el foliado de madera recorta una tesela WebP compartida; un liso es su color, sin imagen', () => {
    const wood = designFor('casement', 'roble-dorado')
    const flat = designFor('casement', 'blanco')
    const woodOut = renderToStaticMarkup(<WindowDrawing layout={computeLayout(wood, cat)} design={wood} catalog={cat} />)
    const flatOut = renderToStaticMarkup(<WindowDrawing layout={computeLayout(flat, cat)} design={flat} catalog={cat} />)
    expect(woodOut).toContain('data-texture="b-golden_oak')
    expect(woodOut).toContain('data:image/webp;base64,')
    expect(flatOut).not.toContain('data:image/webp')
    expect(woodOut.length).toBeGreaterThan(flatOut.length)
  })

  it('la veta sigue cada pieza: travesaños y montantes llevan transformaciones distintas', () => {
    const design = designFor('casement', 'roble-dorado')
    const out = renderToStaticMarkup(<WindowDrawing layout={computeLayout(design, cat)} design={design} catalog={cat} />)
    expect(out).toContain('rotate(90)')
  })

  it('accesorios: alféizar, cajón de persiana y mosquitero se dibujan sin romper las cotas', () => {
    const design = designFor('casement_double', 'antracita', 'blanco', { sill: true, rollerShutter: { type: 'monoblock', operation: 'strap' }, insectScreen: { type: 'roller' } })
    const layout = computeLayout(design, cat)
    expect(layout.attachments?.sill).toBeTruthy()
    const inside = renderToStaticMarkup(<WindowDrawing layout={layout} design={design} catalog={cat} dimensions="all" />)
    const outside = renderToStaticMarkup(<WindowDrawing layout={layout} design={design} catalog={cat} view="exterior" />)
    expect(inside).toContain('data-part="sill"')
    expect(inside).toContain('data-part="shutter-box"')
    expect(outside).toContain('data-part="shutter-box"')
    expect(inside + outside).not.toContain('NaN')
  })
})

describe('foliados integrados', () => {
  it('hay un foliado por cada id, con nombre en los 7 idiomas, acabado y escala', () => {
    expect(BUILTIN_TEXTURE_IDS.length).toBeGreaterThanOrEqual(17)
    for (const id of BUILTIN_TEXTURE_IDS) {
      const look = BUILTIN_TEXTURE_LIBRARY[id]
      expect(look.scaleMm).toBeGreaterThan(20)
      expect(['smooth', 'woodgrain', 'textured', 'metallic']).toContain(look.finish)
      for (const locale of LOCALES) expect(builtinTextureName(id, locale).length).toBeGreaterThan(2)
      expect(look.material.roughness).toBeGreaterThan(0.3)
    }
    // La madera es direccional; el liso no.
    expect(BUILTIN_TEXTURE_LIBRARY.golden_oak.grain).toBe('x')
    expect(BUILTIN_TEXTURE_LIBRARY.white_9016.grain).toBe('none')
    // PVC liso: rugosidad ≈ 0,42 y barniz ≈ 0,1.
    expect(BUILTIN_TEXTURE_LIBRARY.white_9016.material.roughness).toBeCloseTo(0.42, 2)
    expect(BUILTIN_TEXTURE_LIBRARY.white_9016.material.clearcoat).toBeCloseTo(0.1, 2)
  })

  it('cada tesela WebP pesa ≤ 80 KB y todas cargan como data URL', async () => {
    const dir = join(__dirname, '../../src/textures/builtin')
    const files = readdirSync(dir).filter((f) => f.endsWith('.webp'))
    expect(files.length).toBe(BUILTIN_TEXTURE_IDS.length)
    for (const file of files) expect(statSync(join(dir, file)).size).toBeLessThanOrEqual(80 * 1024)
    const loaded = await loadBuiltinTextures()
    for (const id of BUILTIN_TEXTURE_IDS) expect(loaded[id]?.startsWith('data:image/webp;base64,')).toBe(true)
  })
})

describe('resolveColorAppearance: clasificación', () => {
  const table: [string, string, string][] = [
    ['Nogal', '#5B3A22', 'nut_tree'],
    ['Antracita', '#383E42', 'anthracite_7016_smooth'],
    ['Roble dorado', '#B5762E', 'golden_oak'],
    ['Antracita texturado', '#383E42', 'anthracite_7016_sand'],
    ['Antracita veta madera', '#383E42', 'anthracite_7016_woodgrain'],
    ['Blanco', '#F6F5F1', 'white_9016'],
    ['Crema', '#E8DDB5', 'cream_9001'],
    ['Negro', '#101113', 'black_9005'],
    ['Caoba', '#6B2E20', 'mahogany'],
    ['Roble irlandés', '#A67B4B', 'irish_oak'],
    ['Aluminio cepillado', '#B0B3B5', 'metbrush_silver'],
    ['Golden Oak', '#B5762E', 'golden_oak'],
    ['Nussbaum', '#5B3A22', 'nut_tree'],
    ['Anthrazit', '#383E42', 'anthracite_7016_smooth'],
  ]
  it.each(table)('«%s» → %s', (name, hex, expected) => {
    expect(classifyColorName(name, hex)).toBe(expected)
    const a = resolveColorAppearance({ id: name, name, hex })
    expect(a.source).toEqual({ kind: 'builtin', id: expected })
  })

  it('una textura explícita manda sobre el nombre y el hex sigue siendo el respaldo', () => {
    const a = resolveColorAppearance({ id: 'x', name: 'Nogal', hex: '#112233', texture: { kind: 'builtin', id: 'mahogany' } })
    expect(a.source).toEqual({ kind: 'builtin', id: 'mahogany' })
    expect(a.hex).toBe('#112233')
    expect(a.match).toBe('texture')
  })

  it('un liso desconocido se pinta plano con su hex, sin patrón', () => {
    const a = resolveColorAppearance({ id: 'rojo', name: 'Rojo teja', hex: '#A33B2C' })
    expect(a.source).toBeNull()
    expect(needsPattern(a)).toBe(false)
    expect(a.hex).toBe('#A33B2C')
  })

  it('una textura subida se resuelve solo con data URL (nunca una URL remota)', () => {
    const color = { id: 'u', name: 'Mi veta', hex: '#8A5A2B', texture: { kind: 'upload' as const, assetId: 'asset-1', scaleMm: 200 } }
    const ok = resolveColorAppearance(color, { uploads: { 'asset-1': { href: 'data:image/webp;base64,AAAA', finish: 'woodgrain' } } })
    expect(ok.href?.startsWith('data:image/webp')).toBe(true)
    expect(ok.scaleMm).toBe(200)
    expect(needsPattern(ok)).toBe(true)
    const bad = resolveColorAppearance({ ...color, id: 'u2' }, { uploads: { 'asset-1': { href: 'https://evil.example/x.webp' } } })
    expect(bad.href).toBeUndefined()
    const missing = resolveColorAppearance({ ...color, id: 'u3' }, {})
    expect(missing.href).toBeUndefined()
    expect(missing.hex).toBe('#8A5A2B')
  })

  it('el catálogo inicial resuelve a foliados integrados por nombre', () => {
    const wood = appearanceForColorId('roble-dorado', cat.colors)
    expect(wood.source).toEqual({ kind: 'builtin', id: 'golden_oak' })
    const anthracite = appearanceForColorId('antracita', cat.colors).source
    expect(anthracite?.kind === 'builtin' && anthracite.id.startsWith('anthracite_7016')).toBe(true)
    expect(appearanceForColorId('blanco', cat.colors).isLight).toBe(true)
  })
})

describe('presupuesto de tamaño en documentos (PDF)', () => {
  const colors = ['blanco', 'roble-dorado', 'antracita', 'nogal'] as const
  const designs: WindowDesign[] = Array.from({ length: 40 }, (_, i) => designFor(TYPOLOGIES[i % TYPOLOGIES.length].id, colors[i % colors.length], colors[(i + 1) % colors.length]))

  it('con patrones compartidos, cada tesela viaja una sola vez en 40 dibujos', () => {
    const defs = createDrawingDefs({ designs, catalog: cat })
    const drawings = designs.map((design, i) => renderToStaticMarkup(<WindowDrawing key={i} layout={computeLayout(design, cat)} design={design} catalog={cat} defs={defs} width={300} dimensions="total" />, { identifierPrefix: `d${i}-` }))
    const shared = renderToStaticMarkup(<DrawingDefsSvg defs={defs} />)
    const html = shared + drawings.join('')
    const tiles = [...html.matchAll(/data:image\/webp;base64,/g)].length
    // Una tesela por apariencia distinta, nunca una por dibujo ni por pieza.
    expect(tiles).toBe(defs.appearances.size)
    expect(tiles).toBeLessThanOrEqual(8)
    expect(html).not.toContain('NaN')
    // Presupuesto: 40 dibujos realistas ≤ 6 MB de HTML con todas las teselas.
    expect(html.length).toBeLessThan(6 * 1024 * 1024)
    // Los dibujos referencian las teselas compartidas, no definen las suyas.
    const woodDrawing = drawings.find((d) => d.includes('#dkd-b-'))
    expect(woodDrawing).toBeTruthy()
    expect(woodDrawing).not.toContain('<pattern')
  })

  it('sin patrones compartidos cada dibujo lleva su tesela (por eso los documentos usan defs)', () => {
    const design = designFor('casement', 'roble-dorado')
    const layout = computeLayout(design, cat)
    const one = renderToStaticMarkup(<WindowDrawing layout={layout} design={design} catalog={cat} />)
    expect([...one.matchAll(/data:image\/webp;base64,/g)]).toHaveLength(1)
  })

  it('40 dibujos realistas se generan rápido (geometría memorizada)', () => {
    const defs = createDrawingDefs({ designs, catalog: cat })
    const layouts = designs.map((d) => computeLayout(d, cat))
    const t0 = performance.now()
    designs.forEach((design, i) => renderToStaticMarkup(<WindowDrawing layout={layouts[i]} design={design} catalog={cat} defs={defs} width={300} dimensions="total" />))
    const first = performance.now() - t0
    const t1 = performance.now()
    designs.forEach((design, i) => renderToStaticMarkup(<WindowDrawing layout={layouts[i]} design={design} catalog={cat} defs={defs} width={300} dimensions="total" />))
    const second = performance.now() - t1
    expect(first).toBeLessThan(8000)
    expect(second).toBeLessThan(8000)
  })
})
