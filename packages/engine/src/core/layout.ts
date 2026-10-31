import type {
  Catalog,
  Layout,
  LayoutCell,
  LayoutDimension,
  LayoutMullion,
  LayoutPane,
  LayoutSash,
  LayoutSlidingPanel,
  WindowDesign,
} from '../types'
import { createContext, profileForRole, type EngineContext } from './context'
import { mm1 } from './format'
import { cellSpecs, slidingSpec } from './specs'

/**
 * Geometría para dibujar en mm (vista interior, origen arriba a la izquierda, y hacia abajo).
 * Puro y barato: se recalcula en cada cambio del editor.
 */
export function computeLayout(design: WindowDesign, catalog: Catalog): Layout {
  const ctx = createContext(design, catalog)
  const { W, H } = ctx
  const layout: Layout = {
    width: mm1(W),
    height: mm1(H),
    frame: { rect: { x: 0, y: 0, w: mm1(W), h: mm1(H) }, face: mm1(ctx.frameFace) },
    mullions: [],
    sashes: [],
    panes: [],
    sliding: [],
    dimensions: [],
    cells: [],
  }
  if (!(W > 0) || !(H > 0)) return layout

  if (ctx.shape) {
    layout.frame.outline = ctx.shape.outer.path
    layout.frame.innerOutline = ctx.shape.inset(ctx.frameFace).path
  }

  layout.dimensions.push(
    { axis: 'x', from: 0, to: mm1(W), value: mm1(W), level: 0, target: { kind: 'width' } },
    { axis: 'y', from: 0, to: mm1(H), value: mm1(H), level: 0, target: { kind: 'height' } },
  )

  if (ctx.tree.sliding) slidingLayout(ctx, layout)
  else treeLayout(ctx, layout)
  shapeDimensions(ctx, layout)
  return layout
}

function treeLayout(ctx: EngineContext, layout: Layout): void {
  const specs = cellSpecs(ctx)
  const french = profileForRole(ctx, 'french_mullion')

  for (const d of ctx.tree.dividers) {
    const vertical = d.dir === 'vertical'
    const face = d.kind === 'french' ? (french?.face ?? 2 * ctx.base.sashOverlap) : ctx.mullionFace
    // Tramo visible: entre caras vistas del marco o de los travesaños que lo limitan.
    const startEdge = vertical ? d.box.y0 : d.box.x0
    const endEdge = vertical ? d.box.y1 : d.box.x1
    const limit = vertical ? ctx.H : ctx.W
    const start = startEdge <= 0.05 ? ctx.frameFace : startEdge + ctx.mullionFace / 2
    const endFace = vertical && endEdge >= limit - 0.05 && ctx.threshold ? ctx.thresholdFace : ctx.frameFace
    const end = endEdge >= limit - 0.05 ? limit - endFace : endEdge - ctx.mullionFace / 2
    const length = Math.max(0, end - start)
    const m: LayoutMullion = {
      nodeId: d.node.id,
      index: d.index,
      dir: d.dir,
      rect: vertical
        ? { x: mm1(d.axis - face / 2), y: mm1(start), w: mm1(face), h: mm1(length) }
        : { x: mm1(start), y: mm1(d.axis - face / 2), w: mm1(length), h: mm1(face) },
      kind: d.kind,
      axis: mm1(d.axis),
      min: d.min,
      max: Math.max(d.min, d.max),
    }
    layout.mullions.push(m)
  }

  // Cotas parciales a ejes (editables).
  for (const s of ctx.tree.splits) {
    if (s.node.children.length < 2) continue
    s.sizes.forEach((size, index) => {
      const dim: LayoutDimension = {
        axis: s.node.dir === 'vertical' ? 'x' : 'y',
        from: mm1(s.positions[index]),
        to: mm1(s.positions[index + 1]),
        value: mm1(size),
        level: 1,
        target: { nodeId: s.node.id, index },
      }
      layout.dimensions.push(dim)
    })
  }

  const singleShapePane = !!ctx.shape && specs.length === 1 && specs[0].type === 'fixed'
  for (const spec of specs) {
    layout.cells.push({ nodeId: spec.nodeId, rect: spec.visible, path: spec.cell.path })
    if (spec.type === 'fixed') {
      const pane: LayoutPane = {
        nodeId: spec.nodeId,
        kind: 'fixed',
        glassRect: spec.visible,
        fill: spec.fill,
        glassId: spec.glassId,
      }
      if (singleShapePane && ctx.shape) pane.outline = ctx.shape.inset(ctx.frameFace).path
      layout.panes.push(pane)
      continue
    }
    const sash: LayoutSash = {
      nodeId: spec.nodeId,
      opening: spec.opening,
      rect: spec.rect,
      face: mm1(spec.face),
      glassRect: spec.glassRect,
      fill: spec.fill,
    }
    if (spec.handle) sash.handle = spec.handle
    layout.sashes.push(sash)
    layout.panes.push({
      nodeId: spec.nodeId,
      kind: 'sash',
      glassRect: spec.glassRect,
      fill: spec.fill,
      glassId: spec.glassId,
    })
  }
}

function slidingLayout(ctx: EngineContext, layout: Layout): void {
  const spec = slidingSpec(ctx)
  const node = ctx.tree.sliding
  if (!spec || !node) return
  layout.rails = spec.rails
  for (const p of spec.panels) {
    const panel: LayoutSlidingPanel = {
      panelId: p.panel.id,
      index: p.index,
      kind: p.panel.kind === 'fixed' ? 'fixed' : 'moving',
      rail: p.rail,
      rect: p.rect,
      face: mm1(p.face),
      glassRect: p.glassRect,
    }
    if (p.panel.direction) panel.direction = p.panel.direction
    layout.sliding.push(panel)
    layout.panes.push({ nodeId: p.panel.id, kind: 'sash', glassRect: p.glassRect, fill: 'glass', glassId: p.glassId })
    const cell: LayoutCell = { nodeId: p.panel.id, rect: p.glassRect, path: [node.id, p.panel.id] }
    layout.cells.push(cell)
  }
}

function shapeDimensions(ctx: EngineContext, layout: Layout): void {
  const shape = ctx.design.shape
  if (!shape || !ctx.shape) return
  const { H } = ctx
  if (shape.kind === 'trapezoid') {
    // Lado(s) más bajo(s) del trapecio, como cota informativa.
    for (const h of [shape.leftHeight, shape.rightHeight]) {
      if (Number.isFinite(h) && h > 0 && h < H - 0.05) {
        layout.dimensions.push({ axis: 'y', from: mm1(H - h), to: mm1(H), value: mm1(h), level: 1 })
      }
    }
  } else if (shape.kind === 'arch' && Number.isFinite(shape.rise) && shape.rise > 0) {
    const rise = Math.min(shape.rise, H)
    layout.dimensions.push({ axis: 'y', from: 0, to: mm1(rise), value: mm1(rise), level: 1 })
  }
}
