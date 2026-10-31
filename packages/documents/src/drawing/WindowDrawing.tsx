import { useId, type KeyboardEvent, type ReactNode } from 'react'
import type { Catalog, Layout, LayoutDimension, Rect, WindowDesign } from '@framezen/engine'
import { formatMeasure, formatMm } from '../base/format'
import {
  DIMENSION_COLOR,
  GLASS_FILL,
  GLASS_OPACITY,
  HOVER_COLOR,
  SELECTION_COLOR,
  SELECTION_FILL,
  SYMBOL_COLOR,
  colorHex,
  materialPalette,
  type MaterialPalette,
} from './colors'
import {
  bandPath,
  computeViewport,
  defaultDirection,
  defaultHandle,
  flipSide,
  insetRect,
  mapRect,
  mapX,
  miterLines,
  openingSymbolPaths,
  placeDimensions,
  round,
  shapeOutlines,
  slidingArrowPath,
  visibleDimensions,
  type DimensionMode,
  type DrawingView,
  type Viewport,
} from './geometry'

export interface WindowDrawingProps {
  layout: Layout
  design: WindowDesign
  catalog: Catalog
  /** Vista interior por defecto; la exterior es el espejo horizontal. */
  view?: DrawingView
  /** Cotas: ninguna, solo totales o totales + parciales por paño. */
  dimensions?: DimensionMode
  /** Tamaño en px (si falta uno se deduce de la proporción; sin ambos, 320 de ancho). */
  width?: number
  height?: number
  selectedNodeId?: string
  hoverNodeId?: string
  onNodeClick?: (nodeId: string) => void
  onDimensionClick?: (dim: LayoutDimension) => void
  /** Rótulo «Vista interior/exterior» bajo el dibujo. */
  showLabels?: boolean
  className?: string
  /** Texto accesible (por defecto «Ventana 1.200 × 1.500 mm, vista interior»). */
  title?: string
}

const NON_SCALING = 'non-scaling-stroke' as const

function activate(handler: () => void) {
  return (event: KeyboardEvent<SVGElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handler()
    }
  }
}

function sameRect(a: Rect, b: Rect): boolean {
  return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.w - b.w) < 0.01 && Math.abs(a.h - b.h) < 0.01
}

/** Reflejo del vidrio: dos líneas finas blancas en diagonal (sin degradados). */
function Reflection({ g, tiny }: { g: Rect; tiny: boolean }) {
  const s = Math.min(g.w, g.h)
  if (s < 16 || tiny) return null
  const x = g.x
  const y = g.y
  const a = `M${round(x + s * 0.12)} ${round(y + s * 0.4)}L${round(x + s * 0.4)} ${round(y + s * 0.12)}`
  const b = `M${round(x + s * 0.12)} ${round(y + s * 0.56)}L${round(x + s * 0.3)} ${round(y + s * 0.38)}`
  return <path d={a + b} stroke="#FFFFFF" strokeOpacity={0.95} strokeWidth={1.25} strokeLinecap="round" fill="none" vectorEffect={NON_SCALING} />
}

/** Manilla en el lado de cierre: roseta + palanca. */
function Handle({ sash, stile, side, pal, vp, door }: { sash: Rect; stile: number; side: 'left' | 'right' | 'top' | 'bottom'; pal: MaterialPalette; vp: Viewport; door: boolean }) {
  const band = Math.max(2, stile)
  const rw = Math.max(2.4, Math.min(7, 30 * vp.scale, band * 0.8))
  const rh = rw * 2.5
  let cx: number
  let cy: number
  if (side === 'left' || side === 'right') {
    // Centrada en el perfil de la hoja del lado de cierre.
    cx = side === 'left' ? sash.x + band / 2 : sash.x + sash.w - band / 2
    // Puertas: manilla a ~1.050 mm del suelo; ventanas: al centro.
    cy = door ? Math.max(sash.y + sash.h * 0.45, sash.y + sash.h - 1050 * vp.scale) : sash.y + sash.h / 2
  } else {
    cx = sash.x + sash.w / 2
    cy = side === 'top' ? sash.y + band / 2 : sash.y + sash.h - band / 2
  }
  const vertical = side === 'left' || side === 'right'
  const lever = rh * 1.5
  const lw = Math.max(1.4, rw * 0.55)
  const rosette = vertical
    ? { x: cx - rw / 2, y: cy - rh / 2, w: rw, h: rh }
    : { x: cx - rh / 2, y: cy - rw / 2, w: rh, h: rw }
  let leverRect: Rect
  if (vertical && door) {
    const dir = side === 'left' ? 1 : -1
    leverRect = { x: dir > 0 ? cx : cx - lever, y: cy - rh * 0.3 - lw / 2, w: lever, h: lw }
  } else if (vertical) {
    leverRect = { x: cx - lw / 2, y: cy, w: lw, h: lever }
  } else {
    leverRect = { x: cx, y: cy - lw / 2, w: lever, h: lw }
  }
  return (
    <g>
      <rect x={rosette.x} y={rosette.y} width={rosette.w} height={rosette.h} rx={Math.min(rw, rh) / 2} fill={pal.hardware} stroke={pal.stroke} strokeWidth={0.75} vectorEffect={NON_SCALING} />
      <rect x={leverRect.x} y={leverRect.y} width={leverRect.w} height={leverRect.h} rx={lw / 2} fill={pal.hardware} stroke={pal.stroke} strokeWidth={0.75} vectorEffect={NON_SCALING} />
    </g>
  )
}

/**
 * Dibujo de una ventana a escala (SVG puro, sin estado). Coordenadas del motor en
 * mm con origen arriba a la izquierda en vista interior; la vista exterior espeja
 * la geometría una sola vez y conserva los textos legibles.
 */
export function WindowDrawing({
  layout,
  design,
  catalog,
  view = 'interior',
  dimensions = 'total',
  width,
  height,
  selectedNodeId,
  hoverNodeId,
  onNodeClick,
  onDimensionClick,
  showLabels = false,
  className,
  title,
}: WindowDrawingProps) {
  const uid = `fzw${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const dims = visibleDimensions(layout, dimensions)
  const vp = computeViewport(layout, { width, height, dimensions: dims, view, caption: showLabels })
  const LW = layout.width
  const R = (r: Rect) => mapRect(vp, LW, r)
  const mirror = vp.mirror
  const tiny = vp.width < 96 || Math.min(LW, layout.height) * vp.scale < 70
  const outlineW = tiny ? 0.75 : 1
  const symbolW = tiny ? 0.8 : 1.25
  const colorId = view === 'interior' ? (design.colorInId ?? design.colorId) : design.colorId
  const pal = materialPalette(colorHex(colorId, catalog))
  const facePx = (layout.frame.face || 0) * vp.scale
  const showMiters = !tiny && facePx >= 4
  const mmTransform = `translate(${round(mirror ? vp.ox + LW * vp.scale : vp.ox, 3)} ${round(vp.oy, 3)}) scale(${round(mirror ? -vp.scale : vp.scale, 6)} ${round(vp.scale, 6)})`
  const shape =
    layout.frame.outline && layout.frame.innerOutline
      ? { outer: layout.frame.outline, inner: layout.frame.innerOutline }
      : shapeOutlines(design.shape, layout.width, layout.height, layout.frame.face)
  const clip = shape ? `url(#${uid}-clip)` : undefined

  const frameRect = R(layout.frame.rect)
  const lightRect = insetRect(frameRect, facePx)
  const slidingIds = new Set(layout.sliding.map((p) => p.panelId))
  const sashIds = new Set(layout.sashes.map((s) => s.nodeId))
  const fixedPanes = layout.panes.filter((p) => p.kind === 'fixed' && !slidingIds.has(p.nodeId) && !sashIds.has(p.nodeId))
  const sashPane = (nodeId: string) => layout.panes.find((p) => p.nodeId === nodeId)
  const sliding = [...layout.sliding].sort((a, b) => (mirror ? b.rail - a.rail : a.rail - b.rail) || a.index - b.index)
  const band = { fill: pal.fill, stroke: pal.stroke, strokeWidth: outlineW, fillRule: 'evenodd' as const, vectorEffect: NON_SCALING, strokeLinejoin: 'miter' as const }
  const miter = { stroke: pal.stroke, strokeWidth: Math.min(outlineW, 0.75), fill: 'none', vectorEffect: NON_SCALING, strokeOpacity: 0.8 }
  const symbol = { stroke: SYMBOL_COLOR, strokeOpacity: 0.7, strokeWidth: symbolW, fill: 'none', vectorEffect: NON_SCALING, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const }
  const towardViewer = (direction: 'in' | 'out') => (direction === 'in') === (view === 'interior')

  const label = title ?? `Ventana ${formatMeasure(layout.width, layout.height)}, vista ${view === 'interior' ? 'interior' : 'exterior'}`
  // Con paños o cotas clicables el dibujo es un grupo: dentro de role="img" los botones
  // quedarían ocultos para los lectores de pantalla.
  const interactive = !!(onNodeClick || onDimensionClick)

  // ── Capas ──────────────────────────────────────────────────────────────────
  const layers: ReactNode[] = []

  // Vidrio base en toda la luz (las bandas de marco y hojas se dibujan encima).
  if (shape) {
    layers.push(
      <defs key="defs">
        <clipPath id={`${uid}-clip`}>
          <path d={shape.inner} transform={mmTransform} />
        </clipPath>
      </defs>,
      <path key="glass" d={shape.inner} transform={mmTransform} fill={GLASS_FILL} fillOpacity={GLASS_OPACITY} />,
    )
  } else {
    layers.push(<rect key="glass" x={round(lightRect.x)} y={round(lightRect.y)} width={round(lightRect.w)} height={round(lightRect.h)} fill={GLASS_FILL} fillOpacity={GLASS_OPACITY} />)
  }

  // Paños fijos: paneles ciegos y reflejos.
  fixedPanes.forEach((pane) => {
    const g = R(pane.glassRect)
    if (pane.fill === 'panel') {
      layers.push(
        pane.outline ? (
          <path key={`pp-${pane.nodeId}`} d={pane.outline} transform={mmTransform} fill={pal.panel} stroke={pal.stroke} strokeWidth={outlineW} vectorEffect={NON_SCALING} />
        ) : (
          <rect key={`pp-${pane.nodeId}`} x={round(g.x)} y={round(g.y)} width={round(g.w)} height={round(g.h)} fill={pal.panel} stroke={pal.stroke} strokeWidth={outlineW} vectorEffect={NON_SCALING} />
        ),
      )
    } else if (!pane.outline && !shape) {
      layers.push(<Reflection key={`pr-${pane.nodeId}`} g={g} tiny={tiny} />)
    }
  })

  // Montantes y travesaños (los inversores de unión francesa van sobre las hojas).
  const mullionRect = (m: Layout['mullions'][number]) => {
    const r = R(m.rect)
    return (
      <rect
        key={`m-${m.nodeId}-${m.index}`}
        x={round(r.x)}
        y={round(r.y)}
        width={round(r.w)}
        height={round(r.h)}
        fill={pal.fill}
        stroke={pal.stroke}
        strokeWidth={outlineW}
        vectorEffect={NON_SCALING}
        clipPath={clip}
      />
    )
  }
  layout.mullions.filter((m) => m.kind !== 'french').forEach((m) => layers.push(mullionRect(m)))

  // Marco (encima del vidrio y de los extremos de los travesaños).
  if (shape) {
    layers.push(<path key="frame" d={shape.outer + shape.inner} transform={mmTransform} {...band} />)
  } else {
    layers.push(<path key="frame" d={bandPath(frameRect, lightRect)} {...band} />)
    if (showMiters) layers.push(<path key="frame-miter" d={miterLines(frameRect, lightRect)} {...miter} />)
  }

  // Hojas practicables.
  layout.sashes.forEach((sash) => {
    const outer = R(sash.rect)
    const pane = sashPane(sash.nodeId)
    const inner = R(pane && !pane.outline ? pane.glassRect : sash.glassRect)
    const glassInner = sameRect(inner, outer) ? insetRect(outer, Math.max(1, sash.face * vp.scale)) : inner
    const fill = pane?.fill ?? sash.fill
    layers.push(<path key={`s-${sash.nodeId}`} d={bandPath(outer, glassInner)} {...band} clipPath={clip} />)
    if (showMiters && sash.face * vp.scale >= 4) layers.push(<path key={`sm-${sash.nodeId}`} d={miterLines(outer, glassInner)} {...miter} />)
    if (fill === 'panel') {
      const bevel = insetRect(glassInner, Math.max(2, Math.min(glassInner.w, glassInner.h) * 0.08))
      layers.push(
        <g key={`sp-${sash.nodeId}`}>
          <rect x={round(glassInner.x)} y={round(glassInner.y)} width={round(glassInner.w)} height={round(glassInner.h)} fill={pal.panel} stroke={pal.stroke} strokeWidth={outlineW} vectorEffect={NON_SCALING} />
          {!tiny ? <rect x={round(bevel.x)} y={round(bevel.y)} width={round(bevel.w)} height={round(bevel.h)} fill="none" stroke={pal.stroke} strokeOpacity={0.55} strokeWidth={0.75} vectorEffect={NON_SCALING} /> : null}
        </g>,
      )
    } else {
      layers.push(<Reflection key={`sr-${sash.nodeId}`} g={glassInner} tiny={tiny} />)
    }
  })

  layout.mullions.filter((m) => m.kind === 'french').forEach((m) => layers.push(mullionRect(m)))

  // Correderas: riel exterior primero (en vista exterior, al revés).
  sliding.forEach((panel) => {
    const outer = R(panel.rect)
    const inner = R(panel.glassRect)
    layers.push(<path key={`sl-${panel.panelId}`} d={bandPath(outer, inner)} {...band} />)
    if (showMiters && panel.face * vp.scale >= 4) layers.push(<path key={`slm-${panel.panelId}`} d={miterLines(outer, inner)} {...miter} />)
    layers.push(<Reflection key={`slr-${panel.panelId}`} g={inner} tiny={tiny} />)
  })

  // Símbolos de apertura.
  layout.sashes.forEach((sash) => {
    const pane = sashPane(sash.nodeId)
    const g = R(pane && !pane.outline ? pane.glassRect : sash.glassRect)
    const kind = sash.opening.kind
    if (kind === 'fixed') return
    const hinge = flipSide(sash.opening.hinge ?? 'left', mirror)
    const direction = sash.opening.direction ?? defaultDirection(kind)
    const dash = towardViewer(direction) ? undefined : '6 4'
    openingSymbolPaths(kind, hinge, g).forEach((d, i) => {
      layers.push(<path key={`sym-${sash.nodeId}-${i}`} d={d} {...symbol} strokeDasharray={dash} />)
    })
  })
  sliding.forEach((panel) => {
    const g = R(panel.glassRect)
    if (panel.kind === 'moving') {
      const fallback = panel.index === 0 ? 'right' : 'left'
      const dir = flipSide(panel.direction ?? fallback, mirror)
      const head = Math.max(3, Math.min(7, g.w * 0.06))
      const arrow = slidingArrowPath(g, dir, head)
      layers.push(<path key={`arr-${panel.panelId}`} d={arrow.line + arrow.head} {...symbol} />)
    } else {
      const fs = Math.max(7, Math.min(14, Math.min(g.w, g.h) * 0.14))
      layers.push(
        <text
          key={`f-${panel.panelId}`}
          x={round(g.x + g.w / 2)}
          y={round(g.y + g.h / 2 + fs * 0.36)}
          textAnchor="middle"
          fontSize={round(fs)}
          fontWeight={600}
          fill={SYMBOL_COLOR}
          fillOpacity={0.7}
        >
          F
        </text>,
      )
    }
  })

  // Herrajes visibles: bisagras de puerta y manillas.
  if (!tiny) {
    layout.sashes.forEach((sash) => {
      const outer = R(sash.rect)
      const isDoor = sash.opening.kind === 'door'
      if (isDoor) {
        const hinge = flipSide(sash.opening.hinge ?? 'left', mirror)
        const hw = Math.max(2.5, 16 * vp.scale)
        const hh = Math.max(7, 110 * vp.scale)
        const x = hinge === 'left' ? outer.x - hw / 2 : outer.x + outer.w - hw / 2
        const ys = [outer.y + Math.max(hh, 250 * vp.scale), outer.y + outer.h / 2, outer.y + outer.h - Math.max(hh, 250 * vp.scale)]
        ys.forEach((y, i) => {
          layers.push(
            <rect key={`h-${sash.nodeId}-${i}`} x={round(x)} y={round(y - hh / 2)} width={round(hw)} height={round(hh)} rx={Math.min(hw, hh) / 3} fill={pal.hardware} stroke={pal.stroke} strokeWidth={0.75} vectorEffect={NON_SCALING} />,
          )
        })
      }
      if (sash.opening.kind === 'fixed') return
      if (view === 'exterior' && !isDoor) return
      const side = sash.handle ?? defaultHandle(sash.opening)
      if (!side) return
      layers.push(<Handle key={`hd-${sash.nodeId}`} sash={outer} stile={sash.face * vp.scale} side={flipSide(side, mirror)} pal={pal} vp={vp} door={isDoor} />)
    })
    if (view === 'interior') {
      sliding.forEach((panel) => {
        if (panel.kind !== 'moving') return
        const outer = R(panel.rect)
        const opens = panel.direction ?? (panel.index === 0 ? 'right' : 'left')
        const side = opens === 'right' ? 'left' : 'right'
        const stile = Math.max(3, panel.face * vp.scale)
        const w = Math.max(2, Math.min(stile * 0.32, 5))
        const h = Math.max(10, Math.min(outer.h * 0.22, 190 * vp.scale))
        const x = side === 'left' ? outer.x + stile / 2 - w / 2 : outer.x + outer.w - stile / 2 - w / 2
        layers.push(
          <rect key={`cr-${panel.panelId}`} x={round(x)} y={round(outer.y + outer.h / 2 - h / 2)} width={round(w)} height={round(h)} rx={w / 2} fill={pal.hardware} stroke={pal.stroke} strokeWidth={0.75} vectorEffect={NON_SCALING} />,
        )
      })
    }
  }

  // ── Selección y foco ───────────────────────────────────────────────────────
  const highlightRects = (nodeId: string): Rect[] => {
    const rects: Rect[] = []
    layout.cells.forEach((c) => c.nodeId === nodeId && rects.push(R(c.rect)))
    if (rects.length === 0) layout.sashes.forEach((s) => s.nodeId === nodeId && rects.push(R(s.rect)))
    layout.sliding.forEach((p) => p.panelId === nodeId && rects.push(R(p.rect)))
    layout.mullions.forEach((m) => m.nodeId === nodeId && rects.push(R(m.rect)))
    if (rects.length === 0) layout.panes.forEach((p) => p.nodeId === nodeId && rects.push(R(p.glassRect)))
    return rects
  }
  const overlays: ReactNode[] = []
  if (hoverNodeId && hoverNodeId !== selectedNodeId) {
    highlightRects(hoverNodeId).forEach((r, i) =>
      overlays.push(
        <rect key={`hv-${i}`} x={round(r.x)} y={round(r.y)} width={round(r.w)} height={round(r.h)} fill={SELECTION_FILL} fillOpacity={0.35} stroke={HOVER_COLOR} strokeWidth={1.5} strokeDasharray="4 3" vectorEffect={NON_SCALING} pointerEvents="none" />,
      ),
    )
  }
  if (selectedNodeId) {
    highlightRects(selectedNodeId).forEach((r, i) =>
      overlays.push(
        <rect key={`sel-${i}`} x={round(r.x)} y={round(r.y)} width={round(r.w)} height={round(r.h)} fill={SELECTION_FILL} fillOpacity={0.5} stroke={SELECTION_COLOR} strokeWidth={2} vectorEffect={NON_SCALING} pointerEvents="none" />,
      ),
    )
  }

  const hits: ReactNode[] = []
  if (onNodeClick) {
    const hit = (key: string, nodeId: string, r: Rect, name: string) => (
      <rect
        key={key}
        x={round(r.x)}
        y={round(r.y)}
        width={round(Math.max(r.w, 1))}
        height={round(Math.max(r.h, 1))}
        fill="transparent"
        style={{ cursor: 'pointer', outline: 'none' }}
        role="button"
        tabIndex={0}
        aria-label={name}
        data-node-id={nodeId}
        onClick={() => onNodeClick(nodeId)}
        onKeyDown={activate(() => onNodeClick(nodeId))}
      />
    )
    layout.cells.forEach((c, i) => hits.push(hit(`hc-${c.nodeId}-${i}`, c.nodeId, R(c.rect), 'Seleccionar paño')))
    layout.sliding.forEach((p) => hits.push(hit(`hs-${p.panelId}`, p.panelId, R(p.rect), p.kind === 'moving' ? 'Seleccionar hoja corredera' : 'Seleccionar paño fijo')))
    layout.mullions.forEach((m) => {
      const r = R(m.rect)
      const grow = m.dir === 'vertical' ? { x: r.x + r.w / 2 - Math.max(r.w, 8) / 2, y: r.y, w: Math.max(r.w, 8), h: r.h } : { x: r.x, y: r.y + r.h / 2 - Math.max(r.h, 8) / 2, w: r.w, h: Math.max(r.h, 8) }
      hits.push(hit(`hm-${m.nodeId}-${m.index}`, m.nodeId, grow, m.dir === 'vertical' ? 'Seleccionar montante' : 'Seleccionar travesaño'))
    })
  }

  // ── Cotas ──────────────────────────────────────────────────────────────────
  const dimsOut: ReactNode[] = []
  if (dims.length) {
    const bottom = vp.oy + layout.height * vp.scale
    const top = vp.oy
    const left = vp.ox
    const fs = vp.font
    const tick = Math.max(2, fs * 0.24)
    const ext = { stroke: DIMENSION_COLOR, strokeOpacity: 0.45, strokeWidth: 0.6, vectorEffect: NON_SCALING }
    const line = { stroke: DIMENSION_COLOR, strokeWidth: 0.75, vectorEffect: NON_SCALING, fill: 'none' }
    const textProps = { fontSize: fs, fill: DIMENSION_COLOR, textAnchor: 'middle' as const, style: { fontVariantNumeric: 'tabular-nums', fontStretch: '87.5%', fontWeight: 500 } }
    const clickable = (dim: LayoutDimension, key: string, children: ReactNode, box: Rect) =>
      onDimensionClick ? (
        <g
          key={key}
          role="button"
          tabIndex={0}
          aria-label={`Editar medida de ${formatMm(dim.value)} mm`}
          style={{ cursor: 'pointer', outline: 'none' }}
          onClick={() => onDimensionClick(dim)}
          onKeyDown={activate(() => onDimensionClick(dim))}
        >
          <rect x={round(box.x)} y={round(box.y)} width={round(box.w)} height={round(box.h)} fill="transparent" />
          {children}
        </g>
      ) : (
        <g key={key}>{children}</g>
      )

    placeDimensions(dims, 'x').placed.forEach(({ dim, row }, i) => {
      const a = mapX(vp, LW, dim.from)
      const b = mapX(vp, LW, dim.to)
      const x1 = Math.min(a, b)
      const x2 = Math.max(a, b)
      const y = bottom + 6 + row * vp.rowGap + vp.rowGap - 3
      const text = formatMm(dim.value)
      const tw = text.length * fs * 0.55 + 6
      dimsOut.push(
        clickable(
          dim,
          `dx-${i}`,
          <>
            <path d={`M${round(x1)} ${round(bottom + 3)}V${round(y + tick + 1)}M${round(x2)} ${round(bottom + 3)}V${round(y + tick + 1)}`} {...ext} />
            <path d={`M${round(x1)} ${round(y)}H${round(x2)}M${round(x1 - tick)} ${round(y + tick)}L${round(x1 + tick)} ${round(y - tick)}M${round(x2 - tick)} ${round(y + tick)}L${round(x2 + tick)} ${round(y - tick)}`} {...line} />
            <text x={round((x1 + x2) / 2)} y={round(y - 3)} {...textProps}>
              {text}
            </text>
          </>,
          { x: (x1 + x2) / 2 - tw / 2, y: y - fs - 2, w: tw, h: fs + 5 },
        ),
      )
    })

    placeDimensions(dims, 'y').placed.forEach(({ dim, row }, i) => {
      const y1 = top + dim.from * vp.scale
      const y2 = top + dim.to * vp.scale
      const x = left - 6 - row * vp.rowGap - vp.rowGap + 3
      const text = formatMm(dim.value)
      const tw = text.length * fs * 0.55 + 6
      const cx = x - 3
      const cy = (y1 + y2) / 2
      dimsOut.push(
        clickable(
          dim,
          `dy-${i}`,
          <>
            <path d={`M${round(left - 3)} ${round(y1)}H${round(x - tick - 1)}M${round(left - 3)} ${round(y2)}H${round(x - tick - 1)}`} {...ext} />
            <path d={`M${round(x)} ${round(y1)}V${round(y2)}M${round(x - tick)} ${round(y1 + tick)}L${round(x + tick)} ${round(y1 - tick)}M${round(x - tick)} ${round(y2 + tick)}L${round(x + tick)} ${round(y2 - tick)}`} {...line} />
            <text x={round(cx)} y={round(cy)} transform={`rotate(-90 ${round(cx)} ${round(cy)})`} {...textProps}>
              {text}
            </text>
          </>,
          { x: x - fs - 2, y: cy - tw / 2, w: fs + 5, h: tw },
        ),
      )
    })
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className ? `fzd-drawing ${className}` : 'fzd-drawing'}
      width={vp.width}
      height={vp.height}
      viewBox={`0 0 ${vp.width} ${vp.height}`}
      role={interactive ? 'group' : 'img'}
      aria-label={label}
      data-view={view}
    >
      <title>{label}</title>
      <g data-layer="window">{layers}</g>
      {overlays.length ? <g data-layer="selection">{overlays}</g> : null}
      {hits.length ? <g data-layer="hits">{hits}</g> : null}
      {dimsOut.length ? <g data-layer="dimensions">{dimsOut}</g> : null}
      {showLabels ? (
        <text x={round(vp.width / 2)} y={round(vp.height - 4)} textAnchor="middle" fontSize={Math.max(8, vp.font - 1.5)} fill="#6F685E">
          {view === 'interior' ? 'Vista interior' : 'Vista exterior'}
        </text>
      ) : null}
    </svg>
  )
}

/** Atajo para miniaturas: sin cotas ni interacción. */
export function WindowThumbnail(props: Pick<WindowDrawingProps, 'layout' | 'design' | 'catalog' | 'view' | 'className' | 'title'> & { size?: number; width?: number; height?: number }) {
  const { size = 48, width, height, ...rest } = props
  const w = width ?? (height ? undefined : size)
  const h = height ?? (width ? undefined : size)
  return <WindowDrawing {...rest} width={w} height={h} dimensions="none" />
}
