import { useId, type KeyboardEvent, type ReactNode } from 'react'
import type { Catalog, Layout, LayoutDimension, Rect, WindowDesign } from '@dekopen/engine'
import type { Locale } from '@dekopen/shared'
import { EnvironmentImage, environmentIdFor, patternIdFor, TexturePattern, useBuiltinTextures, usesTexture, useDrawingDefs, useTextureSources, withLoadedHref, type DrawingDefsData } from '../textures/defs'
import { environmentFor } from '../textures/environment'
import { appearanceForColorId, builtinIdsOf, type TextureSources } from '../textures/resolve'
import {
  DIMENSION_COLOR,
  DIMENSION_FONT,
  DIMENSION_TEXT_COLOR,
  DRAWING_CSS,
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
  defaultHandle,
  dimensionBottom,
  flipSide,
  insetRect,
  mapRect,
  mapX,
  miterLines,
  placeDimensions,
  round,
  shapeOutlines,
  visibleDimensions,
  type DimensionMode,
  type DrawingView,
  type Viewport,
} from './geometry'
import { assemblyProjection, facetShade, jointNodes, pendingNodes, planNodes, projectionExtent, unitBadges } from './assembly'
import { drawingFormat, drawingText } from './i18n'
import { realisticLayers, visibleTile } from './realistic'
import type { DetailLevel } from './sections'
import { slidingPlane, slidingPullSide, slidingVisibleRect } from './sliding'
import { openingSymbols, type SymbolStyle } from './symbols'
import { MISSING_COLOR } from './assembly'

/** Realista (perfiles, foliados, vidrio, herrajes) o técnico (línea limpia para taller y láser). */
export type DrawingRender = 'realistic' | 'technical'

/** Detalle del dibujo realista. `auto` lo decide por píxeles por milímetro. */
export type DrawingDetail = 'auto' | 'micro' | 'low' | 'medium' | 'high'

/** Fondo del dibujo realista. */
export type DrawingContext = 'none' | 'wall'

const DETAIL_LEVEL: Record<Exclude<DrawingDetail, 'auto'>, DetailLevel> = { micro: 0, low: 1, medium: 2, high: 3 }

/** Nivel de detalle para una escala dada (px por mm). */
export function detailLevel(scale: number, tiny: boolean, detail: DrawingDetail = 'auto'): DetailLevel {
  if (detail !== 'auto') return DETAIL_LEVEL[detail]
  if (tiny) return 0
  if (scale < 0.07) return 1
  if (scale < 0.3) return 2
  return 3
}

export interface WindowDrawingProps {
  layout: Layout
  design: WindowDesign
  catalog: Catalog
  /** Vista interior por defecto (color interior `colorInId ?? colorId`); la exterior es el espejo y usa `colorId`. */
  view?: DrawingView
  /** Realista por defecto (editor, cotizaciones, portal, catálogo); técnico para documentos de taller. */
  render?: DrawingRender
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
  /** Símbolos de apertura (convención DEKOPEN, ver `DrawingLegend`). Sí por defecto. */
  symbols?: boolean
  className?: string
  /** Texto accesible (por defecto «Ventana 1.200 × 1.500 mm, vista interior»). */
  title?: string
  /** Idioma de los textos accesibles, rótulos y cifras de cota (español por defecto). */
  locale?: Locale
  /** Texturas subidas (data URL). Sin esto se usan las de `TextureProvider`. */
  textures?: TextureSources
  /** Patrones compartidos del documento (`createDrawingDefs`). Sin esto se usan los de `DrawingDefsProvider`. */
  defs?: DrawingDefsData
  /** Detalle del dibujo realista (`auto` por defecto). En un PDF conviene subirlo: se puede ampliar. */
  detail?: DrawingDetail
  /** Dónde va la ventana: sobre el papel (por defecto) o instalada en un muro (portadas, vistas grandes). */
  context?: DrawingContext
  /**
   * Conjunto quebrado (esquina, bay, bow): `perspective` lo muestra en volumen y `developed` con todas
   * las unidades en un plano, con sus cotas. Por defecto, perspectiva en el dibujo realista sin
   * interacción y desarrollo en el resto (taller, editor).
   */
  assemblyView?: 'perspective' | 'developed'
  /** Planta bajo el dibujo de un conjunto quebrado. Sí por defecto, salvo en miniaturas. */
  plan?: boolean
  /** Unidades de un conjunto que están sin precio: se marcan a la vista. */
  pendingUnits?: readonly string[]
}

const NON_SCALING = 'non-scaling-stroke' as const

/** Alto de la franja de la planta: nunca más de un tercio del cuadro, el dibujo es lo principal. */
const planStrip = (height: number): number => Math.round(Math.min(190, height * 0.33))
/** Bajo este alto la planta va compacta: forma, anchos y ángulos, sin rótulos de interior y exterior. */
const PLAN_COMPACT_BELOW = 120

function drawingFingerprint(layout: Layout, design: WindowDesign, view: DrawingView, render: DrawingRender): string {
  const text = [layout.width, layout.height, layout.frame.outline ?? '', layout.sashes.length, layout.sliding.length, layout.panes.length, layout.mullions.length, design.colorId, design.colorInId ?? '', view, render].join('|')
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

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

/** Reflejo del vidrio técnico: dos líneas finas blancas en diagonal (sin degradados). */
function Reflection({ g, tiny }: { g: Rect; tiny: boolean }) {
  const s = Math.min(g.w, g.h)
  if (s < 16 || tiny) return null
  const x = g.x
  const y = g.y
  const a = `M${round(x + s * 0.12)} ${round(y + s * 0.4)}L${round(x + s * 0.4)} ${round(y + s * 0.12)}`
  const b = `M${round(x + s * 0.12)} ${round(y + s * 0.56)}L${round(x + s * 0.3)} ${round(y + s * 0.38)}`
  return <path d={a + b} stroke="#FFFFFF" strokeOpacity={0.95} strokeWidth={1.25} strokeLinecap="round" fill="none" vectorEffect={NON_SCALING} />
}

/** Lamas de una celosía en el dibujo técnico (paso de dibujo, 60 mm). */
function louverLines(g: Rect, scale: number): string {
  const pitch = Math.max(4, 60 * scale)
  const n = Math.max(2, Math.floor(g.h / pitch))
  return Array.from({ length: n - 1 }, (_, i) => `M${round(g.x)} ${round(g.y + ((i + 1) * g.h) / n)}H${round(g.x + g.w)}`).join('')
}

/** Manilla técnica en el lado de cierre: roseta + palanca. */
function Handle({ sash, stile, side, pal, vp, door }: { sash: Rect; stile: number; side: 'left' | 'right' | 'top' | 'bottom'; pal: MaterialPalette; vp: Viewport; door: boolean }) {
  const band = Math.max(2, stile)
  const rw = Math.max(2.4, Math.min(7, 30 * vp.scale, band * 0.8))
  const rh = rw * 2.5
  let cx: number
  let cy: number
  if (side === 'left' || side === 'right') {
    cx = side === 'left' ? sash.x + band / 2 : sash.x + sash.w - band / 2
    cy = door ? Math.max(sash.y + sash.h * 0.45, sash.y + sash.h - 1050 * vp.scale) : sash.y + sash.h / 2
  } else {
    cx = sash.x + sash.w / 2
    cy = side === 'top' ? sash.y + band / 2 : sash.y + sash.h - band / 2
  }
  const vertical = side === 'left' || side === 'right'
  const lever = rh * 1.5
  const lw = Math.max(1.4, rw * 0.55)
  const rosette = vertical ? { x: cx - rw / 2, y: cy - rh / 2, w: rw, h: rh } : { x: cx - rh / 2, y: cy - rw / 2, w: rh, h: rw }
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

interface TechnicalInput {
  layout: Layout
  design: WindowDesign
  catalog: Catalog
  vp: Viewport
  view: DrawingView
  uid: string
  tiny: boolean
  colorId: string | undefined
}

/** Dibujo técnico: bandas planas del color del perfil, ingletes como trazos (documentos de taller). */
function technicalLayers({ layout, design, catalog, vp, view, uid, tiny, colorId }: TechnicalInput): ReactNode[] {
  const LW = layout.width
  const R = (r: Rect) => mapRect(vp, LW, r)
  const mirror = vp.mirror
  const outlineW = tiny ? 0.75 : 1
  const pal = materialPalette(colorHex(colorId, catalog))
  const facePx = (layout.frame.face || 0) * vp.scale
  const showMiters = !tiny && facePx >= 4
  const mmTransform = `translate(${round(mirror ? vp.ox + LW * vp.scale : vp.ox, 3)} ${round(vp.oy, 3)}) scale(${round(mirror ? -vp.scale : vp.scale, 6)} ${round(vp.scale, 6)})`
  const shape = layout.frame.outline && layout.frame.innerOutline ? { outer: layout.frame.outline, inner: layout.frame.innerOutline } : shapeOutlines(design.shape, layout.width, layout.height, layout.frame.face)
  const clip = shape ? `url(#${uid}-clip)` : undefined
  const frameRect = R(layout.frame.rect)
  const lightRect = insetRect(frameRect, facePx)
  const slidingIds = new Set(layout.sliding.map((p) => p.panelId))
  const sashIds = new Set(layout.sashes.map((s) => s.nodeId))
  const fixedPanes = layout.panes.filter((p) => p.kind === 'fixed' && !slidingIds.has(p.nodeId) && !sashIds.has(p.nodeId))
  const sashPane = (nodeId: string) => layout.panes.find((p) => p.nodeId === nodeId)
  const sliding = [...layout.sliding].sort((a, b) => (mirror ? slidingPlane(b) - slidingPlane(a) : slidingPlane(a) - slidingPlane(b)) || a.index - b.index)
  const band = { fill: pal.fill, stroke: pal.stroke, strokeWidth: outlineW, fillRule: 'evenodd' as const, vectorEffect: NON_SCALING, strokeLinejoin: 'miter' as const }
  const miter = { stroke: pal.stroke, strokeWidth: Math.min(outlineW, 0.75), fill: 'none', vectorEffect: NON_SCALING, strokeOpacity: 0.8 }
  const layers: ReactNode[] = []

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
    } else if (pane.fill === 'louver') {
      layers.push(<path key={`pl-${pane.nodeId}`} d={louverLines(g, vp.scale)} stroke={pal.stroke} strokeWidth={0.75} fill="none" vectorEffect={NON_SCALING} />)
    } else if (!pane.outline && !shape) {
      layers.push(<Reflection key={`pr-${pane.nodeId}`} g={g} tiny={tiny} />)
    }
  })

  const mullionRect = (m: Layout['mullions'][number]) => {
    const r = R(m.rect)
    if (m.kind === 'fold') return <rect key={`m-${m.nodeId}-${m.index}`} x={round(r.x)} y={round(r.y)} width={round(Math.max(r.w, 0.6))} height={round(r.h)} fill={pal.stroke} />
    return <rect key={`m-${m.nodeId}-${m.index}`} x={round(r.x)} y={round(r.y)} width={round(r.w)} height={round(r.h)} fill={pal.fill} stroke={pal.stroke} strokeWidth={outlineW} vectorEffect={NON_SCALING} clipPath={clip} />
  }
  layout.mullions.filter((m) => m.kind === 'mullion').forEach((m) => layers.push(mullionRect(m)))

  if (shape) {
    layers.push(<path key="frame" d={shape.outer + shape.inner} transform={mmTransform} {...band} />)
  } else {
    layers.push(<path key="frame" d={bandPath(frameRect, lightRect)} {...band} />)
    if (showMiters) layers.push(<path key="frame-miter" d={miterLines(frameRect, lightRect)} {...miter} />)
  }

  layout.sashes.forEach((sash) => {
    const outer = R(sash.rect)
    const pane = sashPane(sash.nodeId)
    const inner = R(pane && !pane.outline ? pane.glassRect : sash.glassRect)
    const glassInner = sameRect(inner, outer) ? insetRect(outer, Math.max(1, sash.face * vp.scale)) : inner
    const fill = pane?.fill ?? sash.fill
    layers.push(<path key={`s-${sash.nodeId}`} d={bandPath(outer, glassInner)} {...band} clipPath={clip} />)
    if (showMiters && sash.face * vp.scale >= 4) layers.push(<path key={`sm-${sash.nodeId}`} d={miterLines(outer, glassInner)} {...miter} />)
    if (sash.zocalo) {
      const panel = R(sash.zocalo.panel)
      const bar = R(sash.zocalo.bar)
      layers.push(
        <g key={`sz-${sash.nodeId}`} data-zocalo={sash.nodeId}>
          <rect x={round(panel.x)} y={round(panel.y)} width={round(panel.w)} height={round(panel.h)} fill={pal.panel} stroke={pal.stroke} strokeWidth={outlineW} vectorEffect={NON_SCALING} />
          <rect x={round(bar.x)} y={round(bar.y)} width={round(bar.w)} height={round(bar.h)} fill={pal.fill} stroke={pal.stroke} strokeWidth={outlineW} vectorEffect={NON_SCALING} />
        </g>,
      )
    }
    if (fill === 'louver') {
      layers.push(<path key={`sl-${sash.nodeId}`} d={louverLines(glassInner, vp.scale)} stroke={pal.stroke} strokeWidth={0.75} fill="none" vectorEffect={NON_SCALING} />)
    } else if (fill === 'panel') {
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

  layout.mullions.filter((m) => m.kind === 'french' || m.kind === 'fold').forEach((m) => layers.push(mullionRect(m)))

  sliding.forEach((panel) => {
    const outer = R(slidingVisibleRect(layout, panel))
    const inner = R(panel.glassRect)
    layers.push(<path key={`sl-${panel.panelId}`} d={bandPath(outer, inner)} {...band} />)
    if (showMiters && panel.face * vp.scale >= 4) layers.push(<path key={`slm-${panel.panelId}`} d={miterLines(outer, inner)} {...miter} />)
    layers.push(<Reflection key={`slr-${panel.panelId}`} g={inner} tiny={tiny} />)
  })

  // Accesorios en línea fina (alféizar y cajón de persiana).
  const att = layout.attachments
  if (att?.sill) {
    const r = R(att.sill.rect)
    layers.push(<rect key="sill" x={round(r.x)} y={round(r.y)} width={round(r.w)} height={round(r.h)} fill={pal.panel} stroke={pal.stroke} strokeWidth={outlineW} vectorEffect={NON_SCALING} />)
  }
  if (att?.rollerShutter && att.rollerShutter.type !== 'integrated') {
    const r = R(att.rollerShutter.box)
    layers.push(<rect key="box" x={round(r.x)} y={round(r.y)} width={round(r.w)} height={round(r.h)} fill={pal.fill} stroke={pal.stroke} strokeWidth={outlineW} vectorEffect={NON_SCALING} />)
  }

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
          layers.push(<rect key={`h-${sash.nodeId}-${i}`} x={round(x)} y={round(y - hh / 2)} width={round(hw)} height={round(hh)} rx={Math.min(hw, hh) / 3} fill={pal.hardware} stroke={pal.stroke} strokeWidth={0.75} vectorEffect={NON_SCALING} />)
        })
      }
      if (sash.opening.kind === 'fixed' || sash.passive) return
      if (view === 'exterior' && !isDoor) return
      const side = sash.handle ?? defaultHandle(sash.opening)
      if (!side) return
      layers.push(<Handle key={`hd-${sash.nodeId}`} sash={outer} stile={sash.face * vp.scale} side={flipSide(side, mirror)} pal={pal} vp={vp} door={isDoor} />)
    })
    if (view === 'interior') {
      sliding.forEach((panel) => {
        const pull = slidingPullSide(layout, panel)
        if (!pull) return
        const outer = R(slidingVisibleRect(layout, panel))
        const inner = R(panel.glassRect)
        const across = pull === 'top' || pull === 'bottom'
        // El mismo tirador, acostado en el travesaño de una guillotina.
        const stile = pull === 'left' ? inner.x - outer.x : pull === 'right' ? outer.x + outer.w - inner.x - inner.w : pull === 'top' ? inner.y - outer.y : outer.y + outer.h - inner.y - inner.h
        const w = Math.max(2, Math.min(Math.max(3, stile) * 0.32, 5))
        const h = Math.max(10, Math.min((across ? outer.w : outer.h) * 0.22, 190 * vp.scale))
        const cx = pull === 'left' ? outer.x + stile / 2 : pull === 'right' ? outer.x + outer.w - stile / 2 : outer.x + outer.w / 2
        const cy = pull === 'top' ? outer.y + stile / 2 : pull === 'bottom' ? outer.y + outer.h - stile / 2 : outer.y + outer.h / 2
        const bw = across ? h : w
        const bh = across ? w : h
        layers.push(<rect key={`cr-${panel.panelId}`} x={round(cx - bw / 2)} y={round(cy - bh / 2)} width={round(bw)} height={round(bh)} rx={w / 2} fill={pal.hardware} stroke={pal.stroke} strokeWidth={0.75} vectorEffect={NON_SCALING} />)
      })
    }
  }
  return layers
}

/**
 * Dibujo de una ventana a escala (SVG puro, sin estado). Coordenadas del motor en mm con origen arriba
 * a la izquierda en vista interior; la vista exterior espeja la geometría una sola vez y conserva los
 * textos legibles. El viewport (`computeViewport`) es el mismo que usa el diseñador para calzar al píxel.
 */
export function WindowDrawing({
  layout,
  design,
  catalog,
  view = 'interior',
  render = 'realistic',
  dimensions = 'total',
  width,
  height,
  selectedNodeId,
  hoverNodeId,
  onNodeClick,
  onDimensionClick,
  showLabels = false,
  symbols = true,
  className,
  title,
  locale = 'es',
  textures,
  defs,
  detail = 'auto',
  context = 'none',
  assemblyView,
  plan,
  pendingUnits,
}: WindowDrawingProps) {
  // useId + huella del contenido: dos dibujos renderizados por separado y pegados en un mismo HTML
  // (documentos armados a mano) no comparten ids de recortes ni degradados.
  const uid = `fzw${useId().replace(/[^a-zA-Z0-9]/g, '')}${drawingFingerprint(layout, design, view, render)}`
  const contextTextures = useTextureSources()
  const contextDefs = useDrawingDefs()
  const sources = textures ?? contextTextures
  const sharedDefs = defs ?? contextDefs
  const realistic = render === 'realistic'
  const colorId = view === 'interior' ? (design.colorInId ?? design.colorId) : design.colorId
  const interiorColor = (d: WindowDesign) => (view === 'interior' ? (d.colorInId ?? d.colorId) : d.colorId)
  const asm = layout.assembly
  // Cada unidad de un conjunto puede venir en su propio color.
  const appearances = realistic
    ? (asm ? asm.units.map((u) => u.design) : [design]).flatMap((d) => [appearanceForColorId(interiorColor(d), catalog.colors, sources), appearanceForColorId(d.colorId, catalog.colors, sources)])
    : []
  useBuiltinTextures(builtinIdsOf(appearances))

  const fmt = drawingFormat(locale)
  const interactive = !!(onNodeClick || onDimensionClick)
  const projection = asm?.plan && (assemblyView ?? (realistic && !interactive ? 'perspective' : 'developed')) === 'perspective' ? assemblyProjection(asm, view) : null
  const dims = projection ? [] : visibleDimensions(layout, dimensions)
  const inWall = realistic && context === 'wall' && !asm
  // En un muro la ventana necesita aire alrededor; el dibujo normal conserva su viewport exacto.
  const margin = inWall ? Math.round(Math.min(width ?? 320, height ?? width ?? 320) * 0.1) : 0
  const room = width ?? (height ? height * 1.4 : 320)
  const showPlan = !!asm?.plan && (plan ?? true) && room >= 200 && dimensions !== 'none'
  const strip = showPlan ? planStrip(height ?? room * 0.75) : 0
  const vpLayout = projection ? projectionExtent(projection) : layout
  const vp = computeViewport(vpLayout, { width, height: height !== undefined ? height - strip : undefined, dimensions: dims, view, caption: showLabels, margin })
  const LW = layout.width
  const R = (r: Rect) => mapRect(vp, LW, r)
  const mirror = vp.mirror
  const tiny = vp.width < 96 || Math.min(vpLayout.width, vpLayout.height) * vp.scale < 70

  const label = title ?? drawingText('title', { size: fmt.size(layout.width, layout.height), view: drawingText(`view.${view}`, undefined, locale) }, locale)
  // Con paños o cotas clicables el dibujo es un grupo: dentro de role="img" los botones
  // quedarían ocultos para los lectores de pantalla.

  // ── Capas ──────────────────────────────────────────────────────────────────
  /** Dibujo de una ventana (el diseño, o una unidad del conjunto) en su propio viewport. */
  const drawWindow = (L: Layout, D: WindowDesign, V: Viewport, idSuffix: string): ReactNode[] => {
    const layers: ReactNode[] = []
    const uidW = `${uid}${idSuffix}`
    const wColor = interiorColor(D)
    const appearance = realistic ? appearanceForColorId(wColor, catalog.colors, sources) : null
    const exterior = realistic ? appearanceForColorId(D.colorId, catalog.colors, sources) : null
    if (realistic && appearance && exterior) {
    const localDefs: ReactNode[] = []
    const level = detailLevel(V.scale, tiny, detail)
    const patternFor = (a: typeof appearance): string | null => {
      // La tesela solo viaja si se va a dibujar: una miniatura no la usa.
      if (!usesTexture(a) || !visibleTile(a, a.key, level)) return null
      if (sharedDefs?.appearances.has(a.key)) return patternIdFor(sharedDefs, a.key)
      const id = `${uidW}-t-${a.key}`
      if (!localDefs.some((d) => (d as { key?: string }).key === a.key)) localDefs.push(<TexturePattern key={a.key} id={id} appearance={withLoadedHref(a)} />)
      return id
    }
    const patternId = patternFor(appearance)
    const exteriorPatternId = exterior.key === appearance.key ? patternId : L.attachments?.rollerShutter || L.attachments?.sill ? patternFor(exterior) : null
    // El entorno del vidrio viaja una sola vez en un documento; suelto, cada dibujo lleva el suyo.
    const env = environmentFor(view)
    let environmentId: string | null = null
    if (level >= 2) {
      if (sharedDefs) environmentId = environmentIdFor(sharedDefs, env)
      else {
        environmentId = `${uidW}-env`
        localDefs.push(<EnvironmentImage key="env" id={environmentId} environment={env} />)
      }
    }
    const mmX = (px: number) => (mirror ? (V.ox + L.width * V.scale - px) / V.scale : (px - V.ox) / V.scale)
    const wall = inWall ? { x: Math.min(mmX(0), mmX(V.width)), y: -V.oy / V.scale, w: V.width / V.scale, h: V.height / V.scale } : undefined
    const out = realisticLayers({ uid: uidW, layout: L, design: D, catalog, view, mirror, scale: V.scale, appearance: withLoadedHref(appearance), patternId, exterior: withLoadedHref(exterior), exteriorPatternId, level, environmentId, wall })
    const mmTransform = `translate(${round(mirror ? V.ox + L.width * V.scale : V.ox, 3)} ${round(V.oy, 3)}) scale(${round(mirror ? -V.scale : V.scale, 6)} ${round(V.scale, 6)})`
    layers.push(
      <defs key="defs">
        {localDefs}
        {out.defs}
      </defs>,
      <g key="mm" transform={mmTransform}>
        {out.body}
      </g>,
    )
    } else {
      layers.push(...technicalLayers({ layout: L, design: D, catalog, vp: V, view, uid: uidW, tiny, colorId: wColor }))
    }
    if (symbols) {
      const style: SymbolStyle = realistic
        ? { stroke: '#1D2426', strokeOpacity: 0.6, strokeWidth: tiny ? 0.8 : 1.1, textColor: '#1D2426', textOpacity: 0.6 }
        : { stroke: SYMBOL_COLOR, strokeOpacity: 0.7, strokeWidth: tiny ? 0.8 : 1.25, textColor: SYMBOL_COLOR, textOpacity: 0.7 }
      layers.push(<g key="symbols" data-layer="symbols">{openingSymbols({ layout: L, vp: V, view, style, fixedMark: drawingText('fixedMark', undefined, locale) })}</g>)
    }
    return layers
  }

  const layers: ReactNode[] = []
  const noPrice = drawingText('assembly.noPrice', undefined, locale)
  if (asm && projection) {
    // Perspectiva: cada unidad con su matriz; los postes quedan entre paños.
    const pal = materialPalette(colorHex(colorId, catalog))
    const px = (x: number) => round(vp.ox + x * vp.scale)
    const py = (y: number) => round(vp.oy + y * vp.scale)
    projection.units.forEach((p) => {
      const u = asm.units.find((v) => v.unitId === p.unitId)
      if (!u) return
      const V: Viewport = { ...vp, ox: 0, oy: 0, width: p.width * vp.scale, height: p.height * vp.scale }
      const shade = facetShade(p.heading)
      layers.push(
        <g key={`u-${p.unitId}`} data-unit={p.unitId} transform={`matrix(${round(p.a, 5)} ${round(p.b, 5)} 0 1 ${px(p.e)} ${py(p.f)})`}>
          {drawWindow(u.layout, u.design, V, `-${p.unitId}`)}
          {shade > 0 ? <rect x={0} y={0} width={round(V.width)} height={round(V.height)} fill="#10181C" fillOpacity={shade} /> : null}
          {pendingUnits?.includes(p.unitId) ? pendingNodes({ x: 0, y: 0, w: V.width, h: V.height }, noPrice, `pn-${p.unitId}`) : null}
        </g>,
      )
    })
    projection.posts.forEach((post) =>
      layers.push(
        <path
          key={`post-${post.jointId}`}
          data-joint={post.jointId}
          data-status={post.status}
          d={`M${post.points.map(([x, y]) => `${px(x)} ${py(y)}`).join('L')}Z`}
          fill={post.status === 'missing' ? 'none' : pal.fill}
          stroke={post.status === 'missing' ? MISSING_COLOR : pal.stroke}
          strokeWidth={post.status === 'missing' ? 2 : 1}
          strokeDasharray={post.status === 'missing' ? '5 3' : undefined}
        />,
      ),
    )
  } else if (asm) {
    asm.units.forEach((u) => {
      const V: Viewport = { ...vp, ox: vp.ox + (mirror ? LW - u.rect.x - u.rect.w : u.rect.x) * vp.scale, oy: vp.oy + u.rect.y * vp.scale, width: u.rect.w * vp.scale, height: u.rect.h * vp.scale }
      layers.push(<g key={`u-${u.unitId}`} data-unit={u.unitId}>{drawWindow(u.layout, u.design, V, `-${u.unitId}`)}</g>)
    })
    layers.push(<g key="joints" data-layer="joints">{jointNodes(asm, vp, LW, catalog, asm.units[0]?.design.colorId, tiny)}</g>)
    if (!tiny) layers.push(<g key="badges" data-layer="units">{unitBadges(asm.units, vp, LW)}</g>)
    asm.units.forEach((u) => {
      if (pendingUnits?.includes(u.unitId)) layers.push(pendingNodes(R(u.rect), noPrice, `pn-${u.unitId}`))
    })
  } else {
    layers.push(...drawWindow(layout, design, vp, ''))
  }

  // ── Selección y foco ───────────────────────────────────────────────────────
  const highlightRects = (nodeId: string): Rect[] => {
    const rects: Rect[] = []
    layout.cells.forEach((c) => c.nodeId === nodeId && rects.push(R(c.rect)))
    if (rects.length === 0) layout.sashes.forEach((s) => s.nodeId === nodeId && rects.push(R(s.rect)))
    layout.sliding.forEach((p) => p.panelId === nodeId && rects.push(R(slidingVisibleRect(layout, p))))
    layout.mullions.forEach((m) => m.nodeId === nodeId && rects.push(R(m.rect)))
    if (rects.length === 0) layout.panes.forEach((p) => p.nodeId === nodeId && rects.push(R(p.glassRect)))
    return rects
  }
  const overlays: ReactNode[] = []
  if (hoverNodeId && hoverNodeId !== selectedNodeId) {
    highlightRects(hoverNodeId).forEach((r, i) =>
      overlays.push(
        <rect
          key={`hv-${i}`}
          x={round(r.x)}
          y={round(r.y)}
          width={round(r.w)}
          height={round(r.h)}
          fill={SELECTION_FILL}
          fillOpacity={0.22}
          stroke={HOVER_COLOR}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          vectorEffect={NON_SCALING}
          pointerEvents="none"
          style={{ stroke: DRAWING_CSS.accent }}
        />,
      ),
    )
  }
  if (selectedNodeId) {
    highlightRects(selectedNodeId).forEach((r, i) => {
      overlays.push(
        <rect key={`selh-${i}`} x={round(r.x)} y={round(r.y)} width={round(r.w)} height={round(r.h)} fill="none" stroke={SELECTION_COLOR} strokeOpacity={0.2} strokeWidth={6} vectorEffect={NON_SCALING} pointerEvents="none" style={{ stroke: DRAWING_CSS.focusRing, strokeOpacity: 1 }} />,
        <rect
          key={`sel-${i}`}
          x={round(r.x)}
          y={round(r.y)}
          width={round(r.w)}
          height={round(r.h)}
          fill={SELECTION_FILL}
          fillOpacity={0.28}
          stroke={SELECTION_COLOR}
          strokeWidth={2}
          vectorEffect={NON_SCALING}
          pointerEvents="none"
          style={{ stroke: DRAWING_CSS.accent }}
        />,
      )
    })
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
    layout.cells.forEach((c, i) => hits.push(hit(`hc-${c.nodeId}-${i}`, c.nodeId, R(c.rect), drawingText('select.pane', undefined, locale))))
    layout.sliding.forEach((p) => hits.push(hit(`hs-${p.panelId}`, p.panelId, R(slidingVisibleRect(layout, p)), drawingText(p.kind === 'moving' ? 'select.slidingSash' : 'select.slidingFixed', undefined, locale))))
    layout.mullions.forEach((m) => {
      const r = R(m.rect)
      const grow = m.dir === 'vertical' ? { x: r.x + r.w / 2 - Math.max(r.w, 8) / 2, y: r.y, w: Math.max(r.w, 8), h: r.h } : { x: r.x, y: r.y + r.h / 2 - Math.max(r.h, 8) / 2, w: r.w, h: Math.max(r.h, 8) }
      hits.push(hit(`hm-${m.nodeId}-${m.index}`, m.nodeId, grow, drawingText(m.dir === 'vertical' ? 'select.mullion' : 'select.transom', undefined, locale)))
    })
  }

  // ── Cotas (línea fina, remate oblicuo, cifras tabulares) ────────────────
  const dimsOut: ReactNode[] = []
  if (dims.length) {
    // Bajo el alféizar si lo hay (ver `dimensionBottom`, que debe usar quien replique la posición).
    const bottom = dimensionBottom(layout, vp)
    const top = vp.oy
    const left = vp.ox
    const fs = vp.font
    const tick = Math.max(2, fs * 0.24)
    const ext = { stroke: DIMENSION_COLOR, strokeOpacity: 0.45, strokeWidth: 0.6, vectorEffect: NON_SCALING, style: { stroke: DRAWING_CSS.dimension } }
    const line = { stroke: DIMENSION_COLOR, strokeWidth: 0.75, vectorEffect: NON_SCALING, fill: 'none', style: { stroke: DRAWING_CSS.dimension } }
    const textProps = { fontSize: fs, fill: DIMENSION_TEXT_COLOR, textAnchor: 'middle' as const, style: { fill: DRAWING_CSS.dimensionText, fontFamily: DIMENSION_FONT, fontVariantNumeric: 'tabular-nums', fontWeight: 500 } }
    const clickable = (dim: LayoutDimension, key: string, children: ReactNode, box: Rect) =>
      onDimensionClick ? (
        <g
          key={key}
          role="button"
          tabIndex={0}
          aria-label={drawingText('editDimension', { value: fmt.mm(dim.value) }, locale)}
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
      const text = fmt.mm(dim.value)
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
      const text = fmt.mm(dim.value)
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

  const svgHeight = vp.height + strip
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className ? `fzd-drawing ${className}` : 'fzd-drawing'}
      width={vp.width}
      height={svgHeight}
      viewBox={`0 0 ${vp.width} ${svgHeight}`}
      role={interactive ? 'group' : 'img'}
      aria-label={label}
      data-view={view}
      data-render={render}
      data-appearance={appearances[0]?.key}
      data-assembly={asm?.kind}
      style={realistic && !inWall ? { overflow: 'visible' } : undefined}
    >
      <title>{label}</title>
      <g data-layer="window">{layers}</g>
      {overlays.length ? <g data-layer="selection">{overlays}</g> : null}
      {hits.length ? <g data-layer="hits">{hits}</g> : null}
      {dimsOut.length ? <g data-layer="dimensions">{dimsOut}</g> : null}
      {showPlan && asm?.plan ? <g data-layer="plan">{planNodes({ plan: asm.plan, box: { x: 0, y: vp.height, w: vp.width, h: strip }, locale, compact: strip < PLAN_COMPACT_BELOW })}</g> : null}
      {showLabels ? (
        <text x={round(vp.width / 2)} y={round(vp.height - 4)} textAnchor="middle" fontSize={Math.max(8, vp.font - 1.5)} fill="#576366" style={{ fill: DRAWING_CSS.caption, fontFamily: DIMENSION_FONT, fontVariantNumeric: 'tabular-nums' }}>
          {drawingText(`caption.${view}`, undefined, locale)}
        </text>
      ) : null}
    </svg>
  )
}

/** Atajo para miniaturas: sin cotas ni interacción. */
export function WindowThumbnail(
  props: Pick<WindowDrawingProps, 'layout' | 'design' | 'catalog' | 'view' | 'className' | 'title' | 'render' | 'locale' | 'textures' | 'defs' | 'symbols' | 'detail' | 'context'> & { size?: number; width?: number; height?: number },
) {
  const { size = 48, width, height, ...rest } = props
  const w = width ?? (height ? undefined : size)
  const h = height ?? (width ? undefined : size)
  return <WindowDrawing {...rest} width={w} height={h} dimensions="none" />
}
