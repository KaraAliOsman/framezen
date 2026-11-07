import type { Layout, Rect } from '@dekopen/engine'
import { BoxGeometry, type BufferGeometry, type Material } from 'three'
import { extrudePolygon, type ModelSpace, rectBand, toModel } from './geometry'
import type { MaterialPalette } from './materials'

/**
 * Persiana, mosquitero y alféizar en 3D, con las mismas medidas de dibujo que el 2D (`layout.attachments`).
 * Van del lado exterior (z negativo). Son piezas fijas: no se abren con la ventana.
 */

/** Cuánto sale del plano del marco cada pieza hacia afuera (mm). Medidas de dibujo, no de fabricación. */
const SILL_PROJECTION = 60
const BOX_PROJECTION = 34
const GUIDE_PROJECTION = 24
const GUIDE_LIP = 3
const SLAT_PITCH = 40
const SLAT_THICKNESS = 9
const SCREEN_RAIL = 22
const SCREEN_RAIL_DEPTH = 10
/** Cuánta cortina se ve bajada: la misma proporción del dibujo. */
const CURTAIN_SHARE = 0.16
const CURTAIN_MAX = 340

export interface AttachmentSink {
  add(material: Material, geometry: BufferGeometry | null | undefined): void
}

type Shutter = NonNullable<NonNullable<Layout['attachments']>['rollerShutter']>

/** Lo que el accesorio agrega por fuera del marco, para encuadrar y apoyar el modelo. */
export function attachmentExtent(layout: Pick<Layout, 'attachments'>): { above: number; below: number } {
  const shutter = layout.attachments?.rollerShutter
  return {
    above: shutter && shutter.type !== 'integrated' ? shutter.box.h : 0,
    below: layout.attachments?.sill?.rect.h ?? 0,
  }
}

function band(space: ModelSpace, rect: Rect, z0: number, z1: number, bevel = 0): BufferGeometry | null {
  const b = rectBand(space, rect)
  return extrudePolygon(b.points, z0, z1, { alongX: b.alongX, bevel })
}

function addSill(sink: AttachmentSink, space: ModelSpace, palette: MaterialPalette, rect: Rect) {
  const inner = space.depth / 2
  sink.add(palette.exterior, band(space, rect, -inner - SILL_PROJECTION, inner, 2.5))
}

function addShutter(sink: AttachmentSink, space: ModelSpace, palette: MaterialPalette, shutter: Shutter, light: Rect) {
  const outer = -space.depth / 2
  if (shutter.type !== 'integrated') sink.add(palette.exterior, band(space, shutter.box, outer - BOX_PROJECTION, space.depth / 2, 3))
  const guideWidth = shutter.guides[0]?.w ?? 0
  for (const guide of shutter.guides) sink.add(palette.exterior, band(space, guide, outer - GUIDE_PROJECTION, outer + GUIDE_LIP, 1.5))

  // Cortina recogida casi entera: se ven unas pocas lamas y queda claro que existe.
  const height = Math.min(light.h * CURTAIN_SHARE, CURTAIN_MAX)
  const width = Math.max(10, shutter.box.w - 2 * guideWidth)
  const z = outer - GUIDE_PROJECTION / 2
  const count = Math.max(2, Math.round(height / SLAT_PITCH))
  for (let i = 0; i < count; i++) {
    const center = toModel(space, shutter.box.x + shutter.box.w / 2, i * SLAT_PITCH + SLAT_PITCH / 2)
    const slat = new BoxGeometry(width, SLAT_PITCH - 2, SLAT_THICKNESS)
    slat.translate(center.x, center.y, z)
    sink.add(palette.exterior, slat)
  }
}

function addScreen(sink: AttachmentSink, space: ModelSpace, palette: MaterialPalette, light: Rect) {
  const z1 = -space.depth / 2 - 1
  const z0 = z1 - SCREEN_RAIL_DEPTH
  const { x, y, w, h } = light
  const rails: Rect[] = [
    { x, y, w, h: SCREEN_RAIL },
    { x, y: y + h - SCREEN_RAIL, w, h: SCREEN_RAIL },
    { x, y: y + SCREEN_RAIL, w: SCREEN_RAIL, h: h - 2 * SCREEN_RAIL },
    { x: x + w - SCREEN_RAIL, y: y + SCREEN_RAIL, w: SCREEN_RAIL, h: h - 2 * SCREEN_RAIL },
  ]
  for (const rail of rails) sink.add(palette.exterior, band(space, rail, z0, z1))
  const mesh = rectBand(space, { x: x + SCREEN_RAIL, y: y + SCREEN_RAIL, w: w - 2 * SCREEN_RAIL, h: h - 2 * SCREEN_RAIL })
  sink.add(palette.screen, extrudePolygon(mesh.points, (z0 + z1) / 2 - 0.5, (z0 + z1) / 2 + 0.5))
}

/** La luz que cubren cortina y mosquitero: lo que deja libre el marco. */
export function lightRect(layout: Pick<Layout, 'width' | 'height' | 'frame'>, face: number): Rect {
  const outer = layout.frame?.rect ?? { x: 0, y: 0, w: layout.width, h: layout.height }
  return { x: outer.x + face, y: outer.y + face, w: Math.max(40, outer.w - 2 * face), h: Math.max(40, outer.h - 2 * face) }
}

export function addAttachments(sink: AttachmentSink, space: ModelSpace, palette: MaterialPalette, layout: Layout, face: number): void {
  const attachments = layout.attachments
  if (!attachments) return
  const light = lightRect(layout, face)
  if (attachments.sill) addSill(sink, space, palette, attachments.sill.rect)
  if (attachments.rollerShutter) addShutter(sink, space, palette, attachments.rollerShutter, light)
  if (attachments.insectScreen) addScreen(sink, space, palette, light)
}
