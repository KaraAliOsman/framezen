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
import { assemblyLayout, isAssembly } from './assembly'
import { createContext, profileForRole, type EngineContext } from './context'
import { FOLD_GAP_MM, ROLLER_SHUTTER_GUIDE_MM, SILL_DRAWING_MM } from './defaults'
import { mm1 } from './format'
import { chordAlong, clipRing, regularChamfer } from './shapes'
import { cellSpecs, slidingSpec } from './specs'

/**
 * Geometría para dibujar en mm (vista interior, origen arriba a la izquierda, y hacia abajo).
 * Puro y barato: se recalcula en cada cambio del editor.
 */
export function computeLayout(design: WindowDesign, catalog: Catalog): Layout {
  if (isAssembly(design)) return assemblyLayout(design, catalog, computeLayout)
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
  attachments(ctx, layout)
  return layout
}

function treeLayout(ctx: EngineContext, layout: Layout): void {
  const specs = cellSpecs(ctx)
  const french = profileForRole(ctx, 'french_mullion')
  const innerRing = ctx.shape ? ctx.shape.ring(ctx.frameFace) : undefined

  for (const d of ctx.tree.dividers) {
    const vertical = d.dir === 'vertical'
    const face = d.kind === 'french' ? (french?.face ?? 2 * ctx.base.sashOverlap) : d.kind === 'fold' ? FOLD_GAP_MM : ctx.mullionFace
    // Tramo visible: entre caras vistas del marco o de los travesaños que lo limitan.
    const startEdge = vertical ? d.box.y0 : d.box.x0
    const endEdge = vertical ? d.box.y1 : d.box.x1
    const limit = vertical ? ctx.H : ctx.W
    let start = startEdge <= 0.05 ? ctx.frameFace : startEdge + ctx.mullionFace / 2
    const endFace = vertical && endEdge >= limit - 0.05 && ctx.threshold ? ctx.thresholdFace : ctx.frameFace
    let end = endEdge >= limit - 0.05 ? limit - endFace : endEdge - ctx.mullionFace / 2
    if (innerRing) {
      // En una forma, el travesaño visible llega al contorno interior del marco.
      const chord = chordAlong(innerRing, d.dir, d.axis)
      if (chord) {
        start = Math.max(start, chord.from)
        end = Math.min(end, chord.to)
      }
    }
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
  for (const [index, spec] of specs.entries()) {
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
      else if (innerRing && ctx.shapeFit[index] === 'clip') {
        // Paño fijo recortado por la forma (sobreluz en arco, cabeza del frontón…).
        const region = clipRing(innerRing, spec.visible)
        if (region) pane.outline = region.path
      }
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
    if (spec.passive) sash.passive = true
    if (spec.zocalo) sash.zocalo = { panel: spec.zocalo.panelRect, bar: spec.zocalo.barRect }
    layout.sashes.push(sash)
    layout.panes.push({
      nodeId: spec.nodeId,
      kind: 'sash',
      glassRect: spec.glassRect,
      fill: spec.fill,
      glassId: spec.glassId,
    })
    // El zócalo es un segundo paño de la misma hoja (el vidrio queda primero).
    if (spec.zocalo) layout.panes.push({ nodeId: spec.nodeId, kind: 'sash', glassRect: spec.zocalo.panelRect, fill: 'panel', glassId: spec.glassId })
  }
}

function slidingLayout(ctx: EngineContext, layout: Layout): void {
  const spec = slidingSpec(ctx)
  const node = ctx.tree.sliding
  if (!spec || !node) return
  layout.rails = spec.rails
  if (ctx.isLiftSlide) layout.slidingSystem = 'lift_slide'
  else if (ctx.isVerticalSlide) layout.slidingSystem = 'vertical'
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
  } else if (shape.kind === 'gable' && Number.isFinite(shape.shoulderHeight) && shape.shoulderHeight > 0 && shape.shoulderHeight < H - 0.05) {
    // Alto de los hombros (lados verticales), como cota informativa.
    layout.dimensions.push({ axis: 'y', from: mm1(H - shape.shoulderHeight), to: mm1(H), value: mm1(shape.shoulderHeight), level: 1 })
  } else if (shape.kind === 'octagon') {
    const c = typeof shape.chamfer === 'number' && Number.isFinite(shape.chamfer) && shape.chamfer > 0 ? shape.chamfer : regularChamfer(ctx.W, H)
    layout.dimensions.push({ axis: 'x', from: 0, to: mm1(c), value: mm1(c), level: 1 })
  }
}

/** Persiana, mosquitero y alféizar para el dibujo (medidas de dibujo, ver defaults). */
function attachments(ctx: EngineContext, layout: Layout): void {
  const { W, H, extras } = ctx
  const out: NonNullable<Layout['attachments']> = {}
  if (extras.rollerShutter) {
    const box = extras.rollerShutter.boxHeight
    const g = Math.min(ROLLER_SHUTTER_GUIDE_MM, W / 4)
    out.rollerShutter = {
      type: extras.rollerShutter.type,
      operation: extras.rollerShutter.operation,
      box: { x: 0, y: mm1(-box), w: mm1(W), h: mm1(box) },
      guides: [
        { x: 0, y: 0, w: mm1(g), h: mm1(H) },
        { x: mm1(W - g), y: 0, w: mm1(g), h: mm1(H) },
      ],
    }
  }
  if (extras.insectScreen) out.insectScreen = { type: extras.insectScreen.type }
  // El vierteaguas de la línea se ve igual que un alféizar.
  if (extras.sill || ctx.design.extras?.frameAddons?.some((a) => a.kind === 'sill_profile')) {
    const { overhang, height } = SILL_DRAWING_MM
    out.sill = { rect: { x: -overhang, y: mm1(H), w: mm1(W + 2 * overhang), h: height } }
  }
  if (Object.keys(out).length > 0) layout.attachments = out
}
