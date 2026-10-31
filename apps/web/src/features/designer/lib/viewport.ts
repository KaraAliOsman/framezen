/**
 * Encuadre del lienzo. El dibujo (WindowDrawing) se renderiza a tamaño real de pantalla
 * (`stage` = caja de encuadre × zoom) para que trazos y cotas se vean nítidos a cualquier zoom;
 * el paneo es solo una traslación. Las capas propias del lienzo usan el mismo `Viewport` del
 * paquete documents, así que calzan al píxel con el dibujo.
 */
import type { Layout, Rect } from '@framezen/engine'
import { computeViewport, mapRect, visibleDimensions, type DrawingView, type Viewport } from '@framezen/documents'

export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 8

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export interface Size {
  width: number
  height: number
}

export interface Pan {
  x: number
  y: number
}

/** Caja donde se encuadra el dibujo a zoom 1 (deja aire para los controles flotantes). */
export function fitBox(container: Size, insets: Insets): Rect {
  const w = Math.max(80, container.width - insets.left - insets.right)
  const h = Math.max(80, container.height - insets.top - insets.bottom)
  return { x: insets.left, y: insets.top, w, h }
}

export function stageSize(box: Rect, zoom: number): Size {
  return { width: Math.round(box.w * zoom), height: Math.round(box.h * zoom) }
}

/** Mismo cálculo que hace WindowDrawing con `dimensions="all"`. */
export function stageViewport(layout: Layout, stage: Size, view: DrawingView): Viewport {
  return computeViewport(layout, { width: stage.width, height: stage.height, dimensions: visibleDimensions(layout, 'all'), view })
}

/** Paneo que centra el escenario en la caja de encuadre. */
export function centeredPan(box: Rect, stage: Size): Pan {
  return { x: box.x + (box.w - stage.width) / 2, y: box.y + (box.h - stage.height) / 2 }
}

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

/**
 * Zoom centrado en un punto del contenedor (cursor): el milímetro bajo el cursor queda quieto.
 * Trabaja en el espacio local del dibujo (ya espejado si es vista exterior), que es lineal en mm.
 */
export function zoomAt(params: { layout: Layout; view: DrawingView; box: Rect; zoom: number; pan: Pan; nextZoom: number; point: Pan }): { zoom: number; pan: Pan } {
  const { layout, view, box, zoom, pan, point } = params
  const nextZoom = clampZoom(params.nextZoom)
  const vp = stageViewport(layout, stageSize(box, zoom), view)
  const next = stageViewport(layout, stageSize(box, nextZoom), view)
  const u = (point.x - pan.x - vp.ox) / vp.scale
  const v = (point.y - pan.y - vp.oy) / vp.scale
  return {
    zoom: nextZoom,
    pan: { x: point.x - next.ox - u * next.scale, y: point.y - next.oy - v * next.scale },
  }
}

/** Rectángulo en mm (vista interior) → px del escenario, espejando para la vista exterior. */
export function toStage(vp: Viewport, layout: Layout, r: Rect): Rect {
  return mapRect(vp, layout.width, r)
}

/** Punto del contenedor → mm (vista interior). */
export function pointToMm(vp: Viewport, layout: Layout, pan: Pan, point: Pan): { x: number; y: number } {
  const u = (point.x - pan.x - vp.ox) / vp.scale
  const y = (point.y - pan.y - vp.oy) / vp.scale
  return { x: vp.mirror ? layout.width - u : u, y }
}

export function unionRect(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const r of rects) {
    x0 = Math.min(x0, r.x)
    y0 = Math.min(y0, r.y)
    x1 = Math.max(x1, r.x + r.w)
    y1 = Math.max(y1, r.y + r.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function offsetRect(r: Rect, pan: Pan): Rect {
  return { x: r.x + pan.x, y: r.y + pan.y, w: r.w, h: r.h }
}

export function zoomLabel(zoom: number): string {
  return `${Math.round(zoom * 100)} %`
}
