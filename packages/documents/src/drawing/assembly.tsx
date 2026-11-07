import type { ReactNode } from 'react'
import type { Catalog, Layout, LayoutAssembly, LayoutAssemblyJoint, LayoutAssemblyPlan, LayoutAssemblyUnit, Rect } from '@dekopen/engine'
import type { Locale } from '@dekopen/shared'
import { DIMENSION_COLOR, DIMENSION_FONT, DIMENSION_TEXT_COLOR, DRAWING_CSS, colorHex, materialPalette } from './colors'
import { round, type DrawingView, type Viewport } from './geometry'
import { drawingFormat, drawingText } from './i18n'

/**
 * Dibujo de conjuntos: la unión entre unidades, la vista en perspectiva de un conjunto quebrado y su
 * planta. El dibujo de cada unidad es el de siempre; aquí solo se ubica.
 */

/** Color de lo que falta en el catálogo: una unión sin pieza se ve aunque el dibujo esté en gris. */
/** Rojo en el editor y en el taller; en el documento del cliente la falta de pieza no se pinta como error. */
export const MISSING_COLOR = 'var(--dk-missing, #B3261E)'

/** Cuánto sube un punto por cada mm que se aleja: una vista desde arriba, suave. */
const DEPTH_RISE = 0.34

const rad = (deg: number): number => (deg * Math.PI) / 180

/** Transformación de una unidad en la perspectiva: mm de la unidad → mm de la vista. */
export interface UnitProjection {
  unitId: string
  /** Matriz afín [a b c d e f] (e, f en mm desde la esquina de la vista). */
  a: number
  b: number
  e: number
  f: number
  /** Cuánto gira el paño: se usa para sombrearlo. */
  heading: number
  width: number
  height: number
}

export interface AssemblyProjection {
  width: number
  height: number
  units: UnitProjection[]
  /** Postes como polígonos en mm de la vista. */
  posts: { jointId: string; points: [number, number][]; status: LayoutAssemblyJoint['status'] }[]
}

/**
 * Proyección paralela (axonométrica) de un conjunto quebrado: cada paño es un paralelogramo fiel a sus
 * medidas verticales y a su rumbo en planta. Es correcta y se puede cotar; no finge una foto. Desde el
 * interior lo que sale del muro se aleja (sube); desde el exterior viene hacia quien mira (baja).
 */
export function assemblyProjection(asm: LayoutAssembly, view: DrawingView): AssemblyProjection | null {
  const plan = asm.plan
  if (!plan?.facets.length) return null
  const exterior = view === 'exterior'
  // La vista se encuadra de frente al conjunto: una esquina se ve con sus dos paños, no de canto.
  const turn = (plan.facets[0].heading + plan.facets[plan.facets.length - 1].heading) / 2
  const c = Math.cos(rad(-turn))
  const si = Math.sin(rad(-turn))
  const rot = (p: { x: number; y: number }) => ({ x: p.x * c - p.y * si, y: p.x * si + p.y * c })
  const sx = (x: number) => (exterior ? -x : x)
  const sy = (depth: number) => (exterior ? 1 : -1) * depth * DEPTH_RISE
  const units: UnitProjection[] = []
  const corners: [number, number][] = []
  for (const u of asm.units) {
    const facet = plan.facets[u.facet]
    if (!facet) continue
    const heading = facet.heading - turn
    const h = rad(heading)
    const dir = { x: Math.cos(h), y: Math.sin(h) }
    // Distancia desde el comienzo del paño hasta el borde de la unidad, en el desarrollo.
    const first = Math.min(...asm.units.filter((v) => v.facet === u.facet).map((v) => v.rect.x))
    const start = u.rect.x - first + (exterior ? u.rect.w : 0)
    const from = rot(facet.from)
    const x0 = from.x + start * dir.x
    const y0 = from.y + start * dir.y
    const a = dir.x
    const b = -DEPTH_RISE * dir.y
    const e = sx(x0)
    const f = u.rect.y + sy(y0)
    units.push({ unitId: u.unitId, a, b, e, f, heading, width: u.rect.w, height: u.rect.h })
    corners.push([e, f], [e + a * u.rect.w, f + b * u.rect.w], [e, f + u.rect.h], [e + a * u.rect.w, f + b * u.rect.w + u.rect.h])
  }
  if (!corners.length) return null
  const minX = Math.min(...corners.map((p) => p[0]))
  const minY = Math.min(...corners.map((p) => p[1]))
  const maxX = Math.max(...corners.map((p) => p[0]))
  const maxY = Math.max(...corners.map((p) => p[1]))
  for (const u of units) {
    u.e -= minX
    u.f -= minY
  }
  const posts: AssemblyProjection['posts'] = []
  // Cada poste va entre el paño i y el siguiente, en orden.
  plan.posts.forEach((post, i) => {
    const prev = plan.facets[i]
    const next = plan.facets[i + 1]
    if (!prev || !next) return
    const near = asm.units.filter((u) => u.facet === i || u.facet === i + 1)
    const top = Math.min(...near.map((u) => u.rect.y))
    const bottom = Math.max(...near.map((u) => u.rect.y + u.rect.h))
    const at = (p: { x: number; y: number }, v: number): [number, number] => {
      const r = rot(p)
      return [sx(r.x) - minX, v + sy(r.y) - minY]
    }
    posts.push({ jointId: post.jointId, points: [at(prev.to, top), at(next.from, top), at(next.from, bottom), at(prev.to, bottom)], status: post.status })
  })
  return { width: maxX - minX, height: maxY - minY, units, posts }
}

/** Una layout mínima con la extensión de la vista, para reutilizar `computeViewport`. */
export function projectionExtent(p: AssemblyProjection): Layout {
  return { width: p.width, height: p.height, frame: { rect: { x: 0, y: 0, w: p.width, h: p.height }, face: 0 }, mullions: [], sashes: [], panes: [], sliding: [], dimensions: [], cells: [] }
}

/** Sombra de un paño según cuánto gira respecto del muro: separa los paños sin dibujar luces falsas. */
export function facetShade(heading: number): number {
  return round(Math.min(0.2, Math.abs(Math.sin(rad(heading))) * 0.2), 3)
}

/** Unión en el desarrollo: banda del color del perfil, línea si es oculta, trazo rojo si falta la pieza. */
export function jointNodes(asm: LayoutAssembly, vp: Viewport, layoutWidth: number, catalog: Catalog, colorId: string | undefined, tiny: boolean): ReactNode[] {
  const pal = materialPalette(colorHex(colorId, catalog))
  const out: ReactNode[] = []
  asm.joints.forEach((j) => {
    const r = j.rect
    const x = vp.ox + (vp.mirror ? layoutWidth - (r.x + r.w) : r.x) * vp.scale
    const y = vp.oy + r.y * vp.scale
    const w = r.w * vp.scale
    const h = r.h * vp.scale
    const vertical = j.dir === 'vertical'
    if (j.status === 'missing') {
      const d = vertical ? `M${round(x + w / 2)} ${round(y)}V${round(y + h)}` : `M${round(x)} ${round(y + h / 2)}H${round(x + w)}`
      out.push(<path key={`jm-${j.id}`} data-joint={j.id} data-status="missing" d={d} stroke={MISSING_COLOR} strokeWidth={tiny ? 1 : 2} strokeDasharray="5 3" fill="none" />)
      if (!tiny) {
        const cx = x + w / 2
        const cy = y + h / 2
        out.push(
          <g key={`jw-${j.id}`} data-joint-warning={j.id}>
            <circle cx={round(cx)} cy={round(cy)} r={8} fill={MISSING_COLOR} />
            <text x={round(cx)} y={round(cy + 3.6)} fontSize={11} fontWeight={700} textAnchor="middle" fill="#FFFFFF" style={{ fontFamily: DIMENSION_FONT }}>
              !
            </text>
          </g>,
        )
      }
      return
    }
    if (w <= 0.5 || h <= 0.5) {
      // Acople oculto o sin cara vista: las unidades se tocan; una línea marca el encuentro.
      const d = vertical ? `M${round(x)} ${round(y)}V${round(y + h)}` : `M${round(x)} ${round(y)}H${round(x + w)}`
      out.push(<path key={`jl-${j.id}`} data-joint={j.id} d={d} stroke={pal.stroke} strokeWidth={tiny ? 0.75 : 1} fill="none" />)
      return
    }
    out.push(<rect key={`jb-${j.id}`} data-joint={j.id} x={round(x)} y={round(y)} width={round(w)} height={round(h)} fill={pal.fill} stroke={pal.stroke} strokeWidth={tiny ? 0.75 : 1} />)
  })
  return out
}

/** Letra de cada unidad, para ubicarla en despieces y listas. */
export function unitBadges(units: readonly LayoutAssemblyUnit[], vp: Viewport, layoutWidth: number): ReactNode[] {
  return units.map((u) => {
    const r = u.rect
    const x = vp.ox + (vp.mirror ? layoutWidth - (r.x + r.w) : r.x) * vp.scale
    const y = vp.oy + r.y * vp.scale
    const size = Math.max(14, Math.min(20, r.w * vp.scale * 0.1))
    return (
      <g key={`ub-${u.unitId}`} data-unit-badge={u.unitId} pointerEvents="none">
        <rect x={round(x + 4)} y={round(y + 4)} width={round(size)} height={round(size)} rx={3} fill="#FFFFFF" fillOpacity={0.92} stroke={DIMENSION_COLOR} strokeWidth={0.75} />
        <text x={round(x + 4 + size / 2)} y={round(y + 4 + size * 0.72)} fontSize={round(size * 0.62)} fontWeight={600} textAnchor="middle" fill={DIMENSION_TEXT_COLOR} style={{ fontFamily: DIMENSION_FONT }}>
          {u.unitId}
        </text>
      </g>
    )
  })
}

/** Marca de una unidad sin precio: sigue dibujada, pero se ve que no entra al total. */
export function pendingNodes(rect: Rect, label: string, key: string): ReactNode {
  const tagW = Math.min(rect.w - 6, label.length * 6.2 + 12)
  return (
    <g key={key} data-pending="unit" pointerEvents="none">
      <rect x={round(rect.x)} y={round(rect.y)} width={round(rect.w)} height={round(rect.h)} fill="none" stroke={MISSING_COLOR} strokeWidth={1.5} strokeDasharray="6 4" />
      {tagW > 40 ? (
        <>
          <rect x={round(rect.x + (rect.w - tagW) / 2)} y={round(rect.y + rect.h - 26)} width={round(tagW)} height={18} rx={3} fill={MISSING_COLOR} />
          <text x={round(rect.x + rect.w / 2)} y={round(rect.y + rect.h - 13)} fontSize={10.5} fontWeight={600} textAnchor="middle" fill="#FFFFFF" style={{ fontFamily: DIMENSION_FONT }}>
            {label}
          </text>
        </>
      ) : null}
    </g>
  )
}

export interface PlanNodesInput {
  plan: LayoutAssemblyPlan
  /** Caja en px donde cabe la planta. */
  box: Rect
  locale?: Locale
  /** Sin cifras: solo la forma (miniaturas). */
  bare?: boolean
  /** Poco alto: márgenes mínimos, sin rótulos de interior y exterior. */
  compact?: boolean
}

interface Point {
  x: number
  y: number
}

/**
 * Planta del conjunto vista desde arriba, con el interior abajo: paños con su espesor, postes, muros
 * de llegada y cotas (ancho de cada paño, ángulo de cada poste, ancho total y vuelo).
 */
export function planNodes({ plan, box, locale = 'es', bare = false, compact = false }: PlanNodesInput): ReactNode[] {
  const fmt = drawingFormat(locale)
  const fs = 10
  const padX = bare ? 4 : 30
  const padTop = bare ? 4 : compact ? 14 : 24
  // Un poste al ras de la base lleva su ángulo justo donde iría la cota del ancho: la cota baja.
  const lowPost = !bare && plan.posts.some((p) => p.y < 1)
  const padBottom = bare ? 4 : (compact ? 20 : 30) + (lowPost ? 18 : 0)
  const wallStub = Math.max(plan.span * 0.08, 120)
  const worldW = plan.span + 2 * wallStub
  const worldH = Math.max(plan.projection, 200)
  const scale = Math.min((box.w - 2 * padX) / worldW, (box.h - padTop - padBottom) / worldH)
  if (!(scale > 0)) return []
  const ox = box.x + (box.w - worldW * scale) / 2 + wallStub * scale
  const baseY = box.y + padTop + (box.h - padTop - padBottom + worldH * scale) / 2 - (worldH - plan.projection) * scale * 0.5
  const X = (x: number) => ox + x * scale
  const Y = (y: number) => baseY - y * scale
  const projectionX = X(plan.span) + wallStub * scale + 8
  const out: ReactNode[] = []
  const ink = { stroke: DIMENSION_TEXT_COLOR, style: { stroke: DRAWING_CSS.dimensionText } }
  const line = { stroke: DIMENSION_COLOR, strokeWidth: 0.75, fill: 'none', style: { stroke: DRAWING_CSS.dimension } }
  const text = { fontSize: fs, fill: DIMENSION_TEXT_COLOR, textAnchor: 'middle' as const, style: { fill: DRAWING_CSS.dimensionText, fontFamily: DIMENSION_FONT, fontVariantNumeric: 'tabular-nums' as const, fontWeight: 500 } }

  // Muros de llegada.
  const first = plan.facets[0]
  const last = plan.facets[plan.facets.length - 1]
  const wall = (x: number, y: number, dir: 1 | -1, key: string) => (
    <path key={key} d={`M${round(X(x))} ${round(Y(y))}H${round(X(x + dir * wallStub))}`} strokeWidth={Math.max(3, 2.2 * Math.max(first.depth, 80) * scale)} strokeLinecap="butt" fill="none" stroke="#C9CFD0" />
  )
  out.push(wall(first.from.x, first.from.y, -1, 'wl'), wall(last.to.x, last.to.y, 1, 'wr'))

  for (const f of plan.facets) {
    const dx = f.to.x - f.from.x
    const dy = f.to.y - f.from.y
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len
    const ny = dx / len
    const half = f.depth / 2
    const corner = (p: Point, s: number): string => `${round(X(p.x + nx * half * s))} ${round(Y(p.y + ny * half * s))}`
    out.push(
      <path key={`pf-${f.index}`} d={`M${corner(f.from, 1)}L${corner(f.to, 1)}L${corner(f.to, -1)}L${corner(f.from, -1)}Z`} fill="#F4F6F6" strokeWidth={1} {...ink} data-facet={f.index} />,
      <path key={`pg-${f.index}`} d={`M${round(X(f.from.x))} ${round(Y(f.from.y))}L${round(X(f.to.x))} ${round(Y(f.to.y))}`} stroke="#6FA8C9" strokeWidth={1.25} fill="none" />,
    )
    if (!bare) {
      const at = (side: 1 | -1) => ({
        x: X((f.from.x + f.to.x) / 2 + side * nx * (half + 14 / scale)),
        y: Y((f.from.y + f.to.y) / 2 + side * ny * (half + 14 / scale)),
      })
      // Junto a la cota del vuelo el rótulo pasa al otro lado del paño.
      const { x: tx, y: ty } = plan.projection > 1 && at(1).x > projectionX - 13 ? at(-1) : at(1)
      // Se lee sin girar la cabeza: nunca de arriba abajo ni patas arriba.
      let angle = -Math.atan2(dy, dx) * (180 / Math.PI)
      while (angle > 89.5) angle -= 180
      while (angle <= -90.5) angle += 180
      out.push(
        <text key={`pt-${f.index}`} x={round(tx)} y={round(ty + 3)} transform={`rotate(${round(angle)} ${round(tx)} ${round(ty)})`} {...text}>
          {`${f.unitIds.join('+')} · ${fmt.mm(f.width)}`}
        </text>,
      )
    }
  }

  for (const p of plan.posts) {
    const missing = p.status === 'missing'
    const size = Math.max(6, Math.max(p.face, 40) * scale)
    const cx = X(p.x)
    const cy = Y(p.y)
    out.push(
      <rect key={`pp-${p.jointId}`} x={round(cx - size / 2)} y={round(cy - size / 2)} width={round(size)} height={round(size)} transform={`rotate(${round(-p.heading)} ${round(cx)} ${round(cy)})`} fill={missing ? MISSING_COLOR : '#8A9396'} stroke={missing ? MISSING_COLOR : DIMENSION_TEXT_COLOR} strokeWidth={0.75} data-post={p.jointId} />,
    )
    if (!bare) {
      // El ángulo se lee del lado del interior.
      const h = rad(p.heading)
      const dist = 16
      const tx = cx + Math.sin(h) * dist
      const ty = cy + Math.cos(h) * dist + 3
      out.push(
        <text key={`pa-${p.jointId}`} x={round(tx)} y={round(ty)} {...text} fill={missing ? MISSING_COLOR : DIMENSION_TEXT_COLOR} style={{ ...text.style, fill: missing ? MISSING_COLOR : DRAWING_CSS.dimensionText }}>
          {`${fmt.angle(p.angle)}`}
        </text>,
      )
    }
  }

  if (!bare) {
    // Ancho total, bajo la planta.
    const y = baseY + (lowPost ? 36 : 18)
    const x0 = X(0)
    const x1 = X(plan.span)
    out.push(
      <path key="ds" d={`M${round(x0)} ${round(y)}H${round(x1)}M${round(x0)} ${round(y - 4)}V${round(y + 4)}M${round(x1)} ${round(y - 4)}V${round(y + 4)}`} {...line} />,
      <text key="dst" x={round((x0 + x1) / 2)} y={round(y - 3)} {...text}>
        {drawingText('assembly.span', { value: fmt.mm(plan.span) }, locale)}
      </text>,
    )
    // Vuelo, al costado.
    if (plan.projection > 1) {
      const vx = projectionX
      const y0 = Y(0)
      const y1 = Y(plan.projection)
      const my = (y0 + y1) / 2
      out.push(
        <path key="dp" d={`M${round(vx)} ${round(y0)}V${round(y1)}M${round(vx - 4)} ${round(y0)}H${round(vx + 4)}M${round(vx - 4)} ${round(y1)}H${round(vx + 4)}`} {...line} />,
        <text key="dpt" x={round(vx + 12)} y={round(my)} transform={`rotate(-90 ${round(vx + 12)} ${round(my)})`} {...text}>
          {drawingText('assembly.projection', { value: fmt.mm(plan.projection) }, locale)}
        </text>,
      )
    }
    if (!compact) out.push(
      <text key="in" x={round(box.x + 6)} y={round(box.y + box.h - 4)} {...text} textAnchor="start" fontSize={9} fillOpacity={0.75}>
        {drawingText('assembly.interior', undefined, locale)}
      </text>,
      <text key="ext" x={round(box.x + 6)} y={round(box.y + 11)} {...text} textAnchor="start" fontSize={9} fillOpacity={0.75}>
        {drawingText('assembly.exterior', undefined, locale)}
      </text>,
    )
  }
  return out
}

export interface AssemblyPlanProps {
  plan: LayoutAssemblyPlan
  width?: number
  height?: number
  locale?: Locale
  className?: string
  bare?: boolean
}

/** Planta suelta (panel del diseñador, documentos). */
export function AssemblyPlan({ plan, width = 360, height = 200, locale = 'es', className, bare }: AssemblyPlanProps) {
  const label = drawingText('assembly.planTitle', undefined, locale)
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} role="img" aria-label={label}>
      <title>{label}</title>
      {planNodes({ plan, box: { x: 0, y: 0, w: width, h: height }, locale, bare })}
    </svg>
  )
}
