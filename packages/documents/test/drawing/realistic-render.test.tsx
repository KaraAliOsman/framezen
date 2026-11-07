import { beforeAll, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { TYPOLOGIES, computeLayout, createDesign, type Catalog, type WindowDesign } from '@dekopen/engine'
import { DrawingDefsSvg, WindowDrawing, createDrawingDefs, detailLevel, environmentHref, loadBuiltinTextures, polyPath, ringPieces, shadeRing, tiledPolygon, tonesOf, usesTexture, VeilBatch, SECTIONS, resolveColorAppearance } from '../../src/drawing'

const cat = SAMPLE_CATALOG as unknown as Catalog

function designFor(id: string, colorId: string, extras?: WindowDesign['extras']): WindowDesign {
  const t = TYPOLOGIES.find((x) => x.id === id)!
  const line = cat.lines.find((l) => l.typologyIds.includes(id as never)) ?? cat.lines.find((l) => l.kind === t.kind)!
  return { ...createDesign(t.id, { lineId: line.id, colorId, glassId: cat.glass[0].id }), colorInId: colorId, ...(extras ? { extras } : {}) }
}

const draw = (id: string, colorId: string, props: Record<string, unknown> = {}, extras?: WindowDesign['extras']) => {
  const design = designFor(id, colorId, extras)
  return renderToStaticMarkup(<WindowDrawing layout={computeLayout(design, cat)} design={design} catalog={cat} width={800} height={800} dimensions="none" {...props} />)
}

beforeAll(async () => {
  await loadBuiltinTextures()
})

describe('nivel de detalle', () => {
  it('sale de los píxeles por milímetro y se puede forzar', () => {
    expect(detailLevel(0.5, true)).toBe(0)
    expect(detailLevel(0.05, false)).toBe(1)
    expect(detailLevel(0.15, false)).toBe(2)
    expect(detailLevel(0.5, false)).toBe(3)
    expect(detailLevel(0.05, false, 'high')).toBe(3)
    expect(detailLevel(0.5, false, 'micro')).toBe(0)
  })

  it('una miniatura pesa una fracción de un dibujo grande y no lleva imágenes', () => {
    const big = draw('casement_double', 'roble-dorado')
    const tiny = draw('casement_double', 'roble-dorado', { width: 64, height: 64 })
    expect(tiny.length).toBeLessThan(big.length / 20)
    expect(tiny).not.toContain('data:image')
  })

  it.each(TYPOLOGIES.map((t) => t.id))('%s: los cuatro niveles dibujan sin cifras rotas', (id) => {
    for (const detail of ['micro', 'low', 'medium', 'high'] as const) {
      const out = draw(id, 'roble-dorado', { detail })
      expect(out, `${id} ${detail}`).not.toMatch(/\bNaN\b/)
      expect(out).not.toContain('Infinity')
    }
  })
})

describe('marca del lienzo y tipografía', () => {
  const props = { selectedNodeId: undefined as string | undefined, dimensions: 'total' as const }

  it('la selección usa el azul del lienzo y las cotas no usan monoespaciada', () => {
    const design = designFor('casement', 'antracita')
    const layout = computeLayout(design, cat)
    const out = renderToStaticMarkup(<WindowDrawing layout={layout} design={design} catalog={cat} width={500} {...props} selectedNodeId={layout.sashes[0].nodeId} />)
    expect(out).toContain('var(--dk-select')
    expect(out).not.toContain('--dk-accent')
    expect(out).toContain('var(--dk-font-body')
    expect(out).toContain('tabular-nums')
    expect(out).not.toMatch(/Plex|monospace/)
  })
})

describe('física de la vista', () => {
  it('por dentro hay junquillo; por fuera el vidrio llega al burlete', () => {
    const inside = draw('tilt_turn', 'antracita', { view: 'interior' })
    const outside = draw('tilt_turn', 'antracita', { view: 'exterior' })
    expect(inside).not.toBe(outside)
    // El anillo por fuera es uno solo hasta el vidrio: menos franjas que con junquillo.
    expect((outside.match(/<path/g) ?? []).length).toBeLessThan((inside.match(/<path/g) ?? []).length)
  })

  it('la hoja que abre hacia quien mira va delante del marco; por fuera, detrás', () => {
    const order = (out: string) => out.indexOf('data-part="sash"') < out.indexOf('data-part="frame"')
    expect(order(draw('tilt_turn', 'blanco', { view: 'interior' }))).toBe(false)
    expect(order(draw('tilt_turn', 'blanco', { view: 'exterior' }))).toBe(true)
    // Abatible hacia afuera: al revés.
    expect(order(draw('casement_out', 'blanco', { view: 'interior' }))).toBe(true)
    expect(order(draw('casement_out', 'blanco', { view: 'exterior' }))).toBe(false)
  })

  it('las correderas corren dentro del marco y muestran su traslapo', () => {
    const out = draw('sliding_2', 'blanco')
    expect(out.indexOf('data-part="slider"')).toBeLessThan(out.indexOf('data-part="frame"'))
    expect(out).toContain('data-part="interlock"')
  })

  it('los drenajes solo se ven por fuera y no en un umbral', () => {
    expect(draw('tilt_turn', 'blanco', { view: 'interior' })).not.toContain('data-part="drains"')
    expect(draw('tilt_turn', 'blanco', { view: 'exterior' })).toContain('data-part="drains"')
    expect(draw('lift_slide_2', 'blanco', { view: 'exterior' })).not.toContain('data-part="drains"')
  })
})

describe('foliado apto para PDF', () => {
  it('con la tesela cargada no usa <pattern>: Chromium rasterizaría cada pieza y el PDF pesaría decenas de MB', () => {
    const out = draw('casement_double', 'roble-dorado', { view: 'exterior' })
    expect(out).not.toContain('<pattern')
    expect(out).not.toContain('url(#b-')
    expect(out).toContain('<clipPath')
  })

  it('una pieza recorta la tesela y la repite solo lo necesario', () => {
    const a = resolveColorAppearance({ id: 'r', name: 'Roble dorado', hex: '#A76B32', texture: { kind: 'builtin', id: 'golden_oak' } })
    const ctx = { uid: 'u', n: 0 }
    const short = renderToStaticMarkup(<>{tiledPolygon([[0, 0], [400, 0], [400, 60], [0, 60]], 0, 1234, a, 'tile', ctx, 'k')}</>)
    const long = renderToStaticMarkup(<>{tiledPolygon([[0, 0], [2400, 0], [2400, 60], [0, 60]], 0, 1234, a, 'tile', ctx, 'k')}</>)
    expect((short.match(/<use/g) ?? []).length).toBeLessThanOrEqual(2)
    expect((long.match(/<use/g) ?? []).length).toBeGreaterThanOrEqual(3)
    expect((long.match(/<use/g) ?? []).length).toBeLessThanOrEqual(6)
    expect(ctx.n).toBe(2)
  })

  it('un liso integrado es su color, sin tesela; una textura subida siempre se usa', () => {
    expect(usesTexture(resolveColorAppearance({ id: 'b', name: 'Blanco', hex: '#F6F5F1' }))).toBe(false)
    expect(usesTexture(resolveColorAppearance({ id: 'o', name: 'Roble dorado', hex: '#A76B32' }))).toBe(true)
    const upload = { id: 'u', name: 'x', hex: '#808080', texture: { kind: 'upload' as const, assetId: 'a', finish: 'smooth' as const } }
    expect(usesTexture(resolveColorAppearance(upload, { uploads: { a: { href: 'data:image/webp;base64,AAAA' } } }))).toBe(true)
  })

  it('el entorno del vidrio viaja una sola vez en un documento', () => {
    const designs = [designFor('casement', 'blanco'), designFor('sliding_2', 'roble-dorado')]
    const defs = createDrawingDefs({ designs, catalog: cat })
    const shared = renderToStaticMarkup(<DrawingDefsSvg defs={defs} />)
    const drawings = designs.map((design, i) => renderToStaticMarkup(<WindowDrawing layout={computeLayout(design, cat)} design={design} catalog={cat} defs={defs} width={500} />, { identifierPrefix: `e${i}-` }))
    expect(shared).toContain(environmentHref('outdoor'))
    for (const d of drawings) {
      expect(d).not.toContain('data:image')
      expect(d).toContain('#dkd-env-outdoor')
    }
  })

  it('los entornos pesan poco y son imágenes en línea', () => {
    for (const env of ['outdoor', 'reflection'] as const) {
      expect(environmentHref(env).startsWith('data:image/jpeg;base64,')).toBe(true)
      expect(environmentHref(env).length).toBeLessThan(8 * 1024)
    }
  })
})

describe('luz por sección', () => {
  it('un chaflán cambia de tono al doblar el inglete: arriba e izquierda no brillan igual que abajo y derecha', () => {
    const a = resolveColorAppearance({ id: 'a', name: 'Antracita', hex: '#383E42' })
    const batch = new VeilBatch(tonesOf(a))
    const ring = ringPieces({ x: 0, y: 0, w: 1000, h: 800 }, 60, { role: 'frame', owner: 'f' })
    shadeRing(batch, ring.outer, ring.inner, SECTIONS.frame[3], false)
    const fills: string[] = []
    batch.nodes('k', (key, _d, fill) => {
      fills.push(fill)
      return key
    })
    expect(fills).toContain('#FFFFFF')
    expect(fills.some((f) => f !== '#FFFFFF')).toBe(true)
  })

  it('polyPath usa H y V en los tramos rectos', () => {
    expect(polyPath([[0, 0], [10, 0], [10, 5], [0, 5]])).toBe('M0 0H10V5H0Z')
  })
})

describe('contexto de muro', () => {
  it('dibuja muro y ocupa todo el cuadro; por defecto no cambia nada', () => {
    const plain = draw('tilt_turn', 'roble-dorado')
    const walled = draw('tilt_turn', 'roble-dorado', { context: 'wall' })
    expect(plain).not.toContain('data-part="wall"')
    expect(plain).toContain('data-part="ground-shadow"')
    expect(walled).toContain('data-part="wall"')
    expect(walled).not.toContain('data-part="ground-shadow"')
    expect(draw('tilt_turn', 'roble-dorado', { context: 'wall', view: 'exterior' })).toContain('data-part="reveal-shadow"')
  })
})

describe('vidrio', () => {
  it('un vidrio mateado o tintado no se ve igual que uno claro', () => {
    const glassCatalog = { ...cat, glass: [...cat.glass, { id: 'sat', name: 'Satinado 6 mm', kind: 'other', thickness: 6, pricePerM2: 1 }, { id: 'bro', name: 'Bronce 6 mm', kind: 'mono', thickness: 6, pricePerM2: 1 }] } as Catalog
    const make = (glassId: string) => {
      const design = { ...designFor('fixed', 'blanco'), glassId }
      return renderToStaticMarkup(<WindowDrawing layout={computeLayout(design, glassCatalog)} design={design} catalog={glassCatalog} width={500} />)
    }
    const clear = make(cat.glass[0].id)
    expect(make('sat')).toContain('fill="#F3F6F5"')
    expect(make('bro')).toContain('fill="#3E4A4C"')
    expect(clear).not.toContain('fill="#F3F6F5"')
  })
})
