import type {
  DesignNode,
  Layout,
  LayoutCell,
  LayoutDimension,
  LayoutMullion,
  LayoutPane,
  LayoutSash,
  LayoutSlidingPanel,
  Rect,
  WindowDesign,
} from '@dekopen/engine'
import { defaultHandle, shapeOutlines } from '../../drawing/geometry'

/**
 * Geometría aproximada para muestras y pruebas (no es el motor: no calcula cortes
 * ni pautas reales). Produce un Layout con el contrato del motor para dibujar.
 */

export interface FixtureLayoutOptions {
  frameFace?: number
  sashFace?: number
  doorSashFace?: number
  mullion?: number
  slidingFace?: number
}

interface Region {
  x0: number
  x1: number
  y0: number
  y1: number
  edge: { l: boolean; r: boolean; t: boolean; b: boolean } // true = borde de marco
}

export function fixtureLayout(design: WindowDesign, opts: FixtureLayoutOptions = {}): Layout {
  const F = opts.frameFace ?? 58
  const S = opts.sashFace ?? 72
  const SD = opts.doorSashFace ?? 104
  const M = opts.mullion ?? 64
  const SF = opts.slidingFace ?? 64
  const W = design.width
  const H = design.height

  const mullions: LayoutMullion[] = []
  const sashes: LayoutSash[] = []
  const panes: LayoutPane[] = []
  const sliding: LayoutSlidingPanel[] = []
  const dimensions: LayoutDimension[] = [
    { axis: 'x', from: 0, to: W, value: W, level: 0, target: { kind: 'width' } },
    { axis: 'y', from: 0, to: H, value: H, level: 0, target: { kind: 'height' } },
  ]
  const cells: LayoutCell[] = []

  const light = (r: Region): Rect => {
    const x = r.x0 + (r.edge.l ? F : M / 2)
    const y = r.y0 + (r.edge.t ? F : M / 2)
    const x2 = r.x1 - (r.edge.r ? F : M / 2)
    const y2 = r.y1 - (r.edge.b ? F : M / 2)
    return { x, y, w: Math.max(1, x2 - x), h: Math.max(1, y2 - y) }
  }
  const inset = (r: Rect, d: number): Rect => ({ x: r.x + d, y: r.y + d, w: Math.max(1, r.w - 2 * d), h: Math.max(1, r.h - 2 * d) })

  const walk = (node: DesignNode, region: Region, path: string[], french: { l: boolean; r: boolean }) => {
    const here = [...path, node.id]
    if (node.type === 'split') {
      const vertical = node.dir === 'vertical'
      const start = vertical ? region.x0 : region.y0
      const end = vertical ? region.x1 : region.y1
      const total = end - start
      const fixedSum = node.sizes.reduce<number>((acc, s) => acc + (s ?? 0), 0)
      const free = node.sizes.filter((s) => s === null || s === undefined).length
      const share = free ? Math.max(0, total - fixedSum) / free : 0
      const sizes = node.children.map((_, i) => node.sizes[i] ?? share)
      let cursor = start
      node.children.forEach((child, i) => {
        const a = cursor
        const b = i === node.children.length - 1 ? end : cursor + sizes[i]
        cursor = b
        const sub: Region = vertical
          ? { x0: a, x1: b, y0: region.y0, y1: region.y1, edge: { ...region.edge, l: i === 0 ? region.edge.l : false, r: i === node.children.length - 1 ? region.edge.r : false } }
          : { x0: region.x0, x1: region.x1, y0: a, y1: b, edge: { ...region.edge, t: i === 0 ? region.edge.t : false, b: i === node.children.length - 1 ? region.edge.b : false } }
        dimensions.push({ axis: vertical ? 'x' : 'y', from: a, to: b, value: Math.round((b - a) * 10) / 10, level: 1, target: { nodeId: node.id, index: i } })
        if (i < node.children.length - 1) {
          const lr = light(region)
          const isFrench = node.joint === 'french'
          const width = isFrench ? M * 0.5 : M
          const rect = vertical ? { x: b - width / 2, y: lr.y, w: width, h: lr.h } : { x: lr.x, y: b - width / 2, w: lr.w, h: width }
          mullions.push({ nodeId: node.id, index: i, dir: node.dir, rect, kind: isFrench ? 'french' : 'mullion', axis: b, min: a + 200, max: start + total - 200 })
        }
        const childFrench = node.joint === 'french' && vertical ? { l: i > 0, r: i < node.children.length - 1 } : french
        walk(child, sub, here, childFrench)
      })
      return
    }
    if (node.type === 'sliding') {
      const lr = light(region)
      const n = node.panels.length
      const overlap = 36
      const pw = (lr.w + overlap * (n - 1)) / n
      node.panels.forEach((p, i) => {
        const rect = { x: lr.x + i * (pw - overlap), y: lr.y - 10, w: pw, h: lr.h + 20 }
        const rail = node.rails === 1 ? 0 : p.kind === 'fixed' ? 0 : node.rails === 3 ? Math.min(2, i) : (i % 2 === 0 ? 0 : 1)
        sliding.push({ panelId: p.id, index: i, kind: p.kind, direction: p.direction, rail, rect, face: SF, glassRect: inset(rect, SF) })
        panes.push({ nodeId: p.id, kind: 'sash', glassRect: inset(rect, SF), fill: 'glass', glassId: p.glassId ?? design.glassId })
        cells.push({ nodeId: p.id, rect: inset(rect, SF), path: [...here, p.id] })
      })
      return
    }
    const lr = light(region)
    cells.push({ nodeId: node.id, rect: lr, path: here })
    if (node.opening.kind === 'fixed') {
      panes.push({ nodeId: node.id, kind: 'fixed', glassRect: lr, fill: node.fill ?? 'glass', glassId: node.glassId ?? design.glassId })
      return
    }
    const face = node.opening.kind === 'door' ? SD : S
    const ov = 8
    const rect = {
      x: lr.x - (french.l ? M / 2 : ov),
      y: lr.y - ov,
      w: lr.w + (french.l ? M / 2 : ov) + (french.r ? M / 2 : ov),
      h: lr.h + 2 * ov,
    }
    const glassRect = inset(rect, face)
    const fill = node.fill ?? 'glass'
    sashes.push({ nodeId: node.id, opening: node.opening, rect, face, glassRect, fill, handle: defaultHandle(node.opening) })
    panes.push({ nodeId: node.id, kind: 'sash', glassRect, fill, glassId: node.glassId ?? design.glassId })
  }

  walk(design.root, { x0: 0, x1: W, y0: 0, y1: H, edge: { l: true, r: true, t: true, b: true } }, [], { l: false, r: false })

  const outlines = shapeOutlines(design.shape, W, H, F)
  return {
    width: W,
    height: H,
    frame: { rect: { x: 0, y: 0, w: W, h: H }, face: F, outline: outlines?.outer, innerOutline: outlines?.inner },
    mullions,
    sashes,
    panes,
    sliding,
    dimensions,
    cells,
    rails: design.root.type === 'sliding' ? design.root.rails : undefined,
  }
}
