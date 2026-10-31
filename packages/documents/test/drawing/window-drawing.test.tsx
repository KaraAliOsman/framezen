import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import type { LayoutDimension } from '@framezen/engine'
import {
  MATERIAL_COLORS,
  WindowDrawing,
  WindowThumbnail,
  colorHex,
  computeViewport,
  materialPalette,
  placeDimensions,
  shapeOutlines,
  visibleDimensions,
  openingSymbolPaths,
  slidingArrowPath,
} from '../../src/drawing'
import { CATALOG, casementDesign, casementLayout, doorDesign, doorLayout, slidingDesign, slidingLayout, transomDesign, transomLayout } from './fixtures'

const html = (el: ReactElement) => renderToStaticMarkup(el)

describe('WindowDrawing', () => {
  it('dibuja una abatible con título accesible, vidrio y cotas totales', () => {
    const out = html(<WindowDrawing layout={casementLayout} design={casementDesign} catalog={CATALOG} width={320} />)
    expect(out.startsWith('<svg')).toBe(true)
    expect(out).toContain('viewBox="0 0 320 ')
    expect(out).toContain('Ventana 1.000 × 1.200 mm, vista interior')
    expect(out).toContain('#D9EBEE')
    expect(out).toContain('data-layer="dimensions"')
    expect(out).toContain('>1.000<')
    expect(out).toContain('>1.200<')
  })

  it('la vista interior usa el color interior (bicolor) y la exterior el exterior', () => {
    const inside = html(<WindowDrawing layout={casementLayout} design={casementDesign} catalog={CATALOG} />)
    const outside = html(<WindowDrawing layout={casementLayout} design={casementDesign} catalog={CATALOG} view="exterior" />)
    expect(inside).toContain('fill="#F6F5F1"')
    expect(outside).toContain('fill="#5B3A22"')
    expect(outside).toContain('data-view="exterior"')
    expect(outside).toContain('vista exterior')
  })

  it('abre hacia quien mira = línea continua; vista exterior = discontinua 6 4', () => {
    const inside = html(<WindowDrawing layout={casementLayout} design={casementDesign} catalog={CATALOG} dimensions="none" />)
    const outside = html(<WindowDrawing layout={casementLayout} design={casementDesign} catalog={CATALOG} view="exterior" dimensions="none" />)
    expect(inside).not.toContain('stroke-dasharray="6 4"')
    expect(outside).toContain('stroke-dasharray="6 4"')
  })

  it('espeja la geometría una sola vez y conserva los textos legibles', () => {
    const vpIn = computeViewport(casementLayout, { width: 300, height: 360, dimensions: [], view: 'interior' })
    const vpOut = computeViewport(casementLayout, { width: 300, height: 360, dimensions: [], view: 'exterior' })
    expect(vpIn.mirror).toBe(false)
    expect(vpOut.mirror).toBe(true)
    const out = html(<WindowDrawing layout={casementLayout} design={casementDesign} catalog={CATALOG} view="exterior" />)
    // Los textos nunca van dentro de un grupo con scale(-1).
    expect(out).not.toMatch(/scale\(-[\d.]+ [\d.]+\)"[^>]*>\s*<text/)
  })

  it('sin cotas no deja capa de cotas y con «all» muestra las parciales', () => {
    const none = html(<WindowDrawing layout={transomLayout} design={transomDesign} catalog={CATALOG} dimensions="none" />)
    expect(none).not.toContain('data-layer="dimensions"')
    const all = html(<WindowDrawing layout={transomLayout} design={transomDesign} catalog={CATALOG} dimensions="all" width={300} height={400} />)
    expect(all).toContain('>400<')
    expect(all).toContain('>900<')
    expect(all).toContain('>1.300<')
    const total = html(<WindowDrawing layout={transomLayout} design={transomDesign} catalog={CATALOG} dimensions="total" />)
    expect(total).not.toContain('>400<')
  })

  it('proyectante: abre hacia afuera, discontinua en vista interior', () => {
    const out = html(<WindowDrawing layout={transomLayout} design={transomDesign} catalog={CATALOG} dimensions="none" />)
    expect(out).toContain('stroke-dasharray="6 4"')
  })

  it('corredera: flecha en la hoja móvil y «F» en la fija', () => {
    const out = html(<WindowDrawing layout={slidingLayout} design={slidingDesign} catalog={CATALOG} width={400} />)
    expect(out).toMatch(/>F<\/text>/)
    expect(out).toContain('data-layer="window"')
    // Color por palabra clave cuando el id no está en el catálogo («nogal-oscuro»).
    expect(out).toContain(`fill="${MATERIAL_COLORS.walnut}"`)
  })

  it('puerta: sintetiza cotas totales, panel ciego, bisagras y manilla', () => {
    const out = html(<WindowDrawing layout={doorLayout} design={doorDesign} catalog={CATALOG} width={240} height={480} />)
    expect(out).toContain('>900<')
    expect(out).toContain('>2.100<')
    const rects = out.match(/<rect /g) ?? []
    expect(rects.length).toBeGreaterThanOrEqual(7)
  })

  it('selección, hover y zonas de clic cuando hay interacción', () => {
    const dims: LayoutDimension[] = []
    const out = html(
      <WindowDrawing
        layout={transomLayout}
        design={transomDesign}
        catalog={CATALOG}
        selectedNodeId="bottom"
        hoverNodeId="top"
        onNodeClick={() => undefined}
        onDimensionClick={(d) => dims.push(d)}
        dimensions="all"
      />,
    )
    expect(out).toContain('data-layer="selection"')
    expect(out).toContain('stroke="#2747C2"')
    expect(out).toContain('stroke-dasharray="4 3"')
    expect(out).toContain('data-layer="hits"')
    expect(out).toContain('data-node-id="bottom"')
    expect(out).toContain('data-node-id="split1"')
    expect(out).toContain('Editar medida de 1.300 mm')
    // Con elementos clicables es un grupo (role="img" ocultaría los botones a lectores de pantalla).
    expect(out).toMatch(/<svg[^>]*role="group"/)
  })

  it('solo cotas clicables también es un grupo; sin interacción, una imagen', () => {
    const onlyDims = html(<WindowDrawing layout={casementLayout} design={casementDesign} catalog={CATALOG} onDimensionClick={() => undefined} />)
    expect(onlyDims).toMatch(/<svg[^>]*role="group"/)
    const still = html(<WindowDrawing layout={casementLayout} design={casementDesign} catalog={CATALOG} />)
    expect(still).toMatch(/<svg[^>]*role="img"/)
  })

  it('sin interacción no agrega elementos enfocables', () => {
    const out = html(<WindowDrawing layout={casementLayout} design={casementDesign} catalog={CATALOG} />)
    expect(out).not.toContain('tabindex')
    expect(out).not.toContain('data-layer="hits"')
  })

  it('miniaturas sin cotas, con rótulo opcional de vista', () => {
    const thumb = html(<WindowThumbnail layout={slidingLayout} design={slidingDesign} catalog={CATALOG} size={44} />)
    expect(thumb).toContain('width="44"')
    expect(thumb).not.toContain('data-layer="dimensions"')
    const labeled = html(<WindowDrawing layout={casementLayout} design={casementDesign} catalog={CATALOG} showLabels />)
    expect(labeled).toContain('Vista interior')
  })

  it('formas: arco, trapecio y triángulo con contorno propio', () => {
    for (const shape of [
      { kind: 'arch' as const, rise: 400 },
      { kind: 'trapezoid' as const, leftHeight: 600, rightHeight: 1000 },
      { kind: 'triangle' as const, apex: 'center' as const },
    ]) {
      const outlines = shapeOutlines(shape, 1000, 1000, 60)
      expect(outlines?.outer).toMatch(/^M/)
      expect(outlines?.inner).toMatch(/Z$/)
      const design = { ...casementDesign, colorInId: undefined, shape, root: { id: 'f', type: 'leaf' as const, opening: { kind: 'fixed' as const } } }
      const layout = { ...casementLayout, width: 1000, height: 1000, frame: { rect: { x: 0, y: 0, w: 1000, h: 1000 }, face: 60 }, sashes: [], panes: [], cells: [] }
      const out = html(<WindowDrawing layout={layout} design={design} catalog={CATALOG} />)
      expect(out).toContain('clipPath')
    }
  })
})

describe('geometría del dibujo', () => {
  it('sintetiza totales si el motor no los trae', () => {
    const dims = visibleDimensions(doorLayout, 'total')
    expect(dims).toHaveLength(2)
    expect(dims.map((d) => d.value)).toEqual([900, 2100])
    expect(visibleDimensions(doorLayout, 'none')).toEqual([])
  })

  it('reparte parciales en filas sin solaparse; el total va afuera', () => {
    const dims: LayoutDimension[] = [
      { axis: 'x', from: 0, to: 1000, value: 1000, level: 0 },
      { axis: 'x', from: 0, to: 500, value: 500, level: 1 },
      { axis: 'x', from: 500, to: 1000, value: 500, level: 1 },
      { axis: 'x', from: 0, to: 300, value: 300, level: 1 },
    ]
    const { placed, rows } = placeDimensions(dims, 'x')
    expect(rows).toBe(3)
    const total = placed.find((p) => p.dim.level === 0)
    expect(total?.row).toBe(2)
  })

  it('escala automática respeta el tamaño pedido y la proporción', () => {
    const vp = computeViewport(casementLayout, { width: 200, dimensions: visibleDimensions(casementLayout, 'total'), view: 'interior' })
    expect(vp.width).toBe(200)
    expect(vp.height).toBeGreaterThan(200)
    expect(vp.scale * 1000).toBeLessThanOrEqual(200)
  })

  it('símbolos: bisagra a la izquierda pone el vértice a la izquierda', () => {
    const [d] = openingSymbolPaths('casement', 'left', { x: 0, y: 0, w: 100, h: 200 })
    expect(d).toBe('M100 0L0 100L100 200')
    expect(openingSymbolPaths('tilt_turn', 'right', { x: 0, y: 0, w: 100, h: 200 })).toHaveLength(2)
    expect(openingSymbolPaths('fixed', 'left', { x: 0, y: 0, w: 100, h: 200 })).toEqual([])
    const arrow = slidingArrowPath({ x: 0, y: 0, w: 100, h: 50 }, 'right', 5)
    expect(arrow.line).toBe('M25 25L75 25')
  })

  it('colorHex: catálogo, palabra clave y PVC blanco por defecto', () => {
    expect(colorHex('custom', CATALOG)).toBe('#A1A5A8')
    expect(colorHex('antracita-mate', CATALOG)).toBe(MATERIAL_COLORS.anthracite)
    expect(colorHex('desconocido', CATALOG)).toBe(MATERIAL_COLORS.white)
    expect(colorHex(undefined, CATALOG)).toBe(MATERIAL_COLORS.white)
    expect(materialPalette(MATERIAL_COLORS.white).stroke).toBe('#B9B2A6')
    expect(materialPalette(MATERIAL_COLORS.anthracite).light).toBe(false)
  })
})
