import type { Id, Opening, Pauta, Profile, ProfileRole, Rect, SlidingPanel } from '../types'
import { sashProfileFor, type EngineContext } from './context'
import type { Box, EdgeKind, TreeCell } from './geometry'
import { mm1 } from './format'
import { variantPauta, sashVariant, type SashVariant } from './pauta'

/**
 * Medidas de cada paño/hoja según la pauta (una sola fuente para dibujo y despiece):
 *   luz (por eje)        = región − frameDeduction (marco) / − mullionDeduction (travesaño, desde su eje)
 *   hoja nominal         = luz + 2·sashOverlap         · corte = nominal + 2·weld
 *   vidrio de hoja       = nominal − 2·(sashDeduction + glassGap)
 *   junquillo de hoja    = nominal − beadDeduction (def. 2·sashDeduction)
 *   vidrio de fijo       = luz − 2·glassGap            · junquillo de fijo = luz
 * Supuestos sin dato verificado: en unión francesa la luz llega al eje (descuento 0) y cada hoja
 * traslapa el inversor igual que al marco; el umbral descuenta como el marco.
 */

export interface Size {
  w: number
  h: number
}

interface BaseSpec {
  cell: TreeCell
  nodeId: Id
  label: CellLabel
  /** Luz de pauta (para cortes). */
  luz: Rect
  /** Abertura visible entre caras vistas (para dibujo y selección). */
  visible: Rect
  glassId: Id
  fill: 'glass' | 'panel'
}

export interface FixedSpec extends BaseSpec {
  type: 'fixed'
  glass: Size
  bead: Size
}

export interface SashSpec extends BaseSpec {
  type: 'sash'
  opening: Opening
  variant: SashVariant
  pauta: Pauta
  profile?: Profile
  role: ProfileRole
  /** Contorno de la hoja nominal (terminada) en coordenadas del dibujo. */
  rect: Rect
  nominal: Size
  cut: Size
  glass: Size
  bead: Size
  face: number
  glassRect: Rect
  handle?: 'left' | 'right' | 'top' | 'bottom'
  passive: boolean
}

export type CellSpec = FixedSpec | SashSpec

export interface CellLabel {
  /** Etiqueta corta: «Hoja izq.», «Paño fijo sup.». */
  short: string
  /** Para frases: «la hoja izquierda», «el paño fijo superior». */
  long: string
}

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x: mm1(x), y: mm1(y), w: mm1(w), h: mm1(h) })
export const grow = (r: Rect, d: number): Rect => rect(r.x - d, r.y - d, r.w + 2 * d, r.h + 2 * d)
export const shrink = (r: Rect, d: number): Rect =>
  rect(r.x + d, r.y + d, Math.max(0, r.w - 2 * d), Math.max(0, r.h - 2 * d))

function luzInset(ctx: EngineContext, kind: EdgeKind): number {
  if (kind === 'mullion') return ctx.base.mullionDeduction
  if (kind === 'french') return 0
  return ctx.base.frameDeduction
}

function visibleInset(ctx: EngineContext, kind: EdgeKind): number {
  if (kind === 'mullion') return ctx.mullionFace / 2
  if (kind === 'french') return 0
  if (kind === 'threshold') return ctx.thresholdFace
  return ctx.frameFace
}

function insetBox(box: Box, l: number, r: number, t: number, b: number, clampZero: boolean): Rect {
  const w = box.x1 - box.x0 - l - r
  const h = box.y1 - box.y0 - t - b
  return rect(box.x0 + l, box.y0 + t, clampZero ? Math.max(0, w) : w, clampZero ? Math.max(0, h) : h)
}

export function handleSide(opening: Opening, passive: boolean): SashSpec['handle'] {
  if (passive) return undefined
  switch (opening.kind) {
    case 'tilt':
      return 'top'
    case 'awning':
      return 'bottom'
    case 'casement':
    case 'tilt_turn':
    case 'door':
      return opening.hinge === 'right' ? 'left' : 'right'
    default:
      return undefined
  }
}

export function cellSpecs(ctx: EngineContext): CellSpec[] {
  const labels = cellLabels(ctx)
  return ctx.tree.cells.map((cell, i) => {
    const { edges, box, node } = cell
    const luz = insetBox(
      box,
      luzInset(ctx, edges.left),
      luzInset(ctx, edges.right),
      luzInset(ctx, edges.top),
      luzInset(ctx, edges.bottom),
      false,
    )
    const visible = insetBox(
      box,
      visibleInset(ctx, edges.left),
      visibleInset(ctx, edges.right),
      visibleInset(ctx, edges.top),
      visibleInset(ctx, edges.bottom),
      true,
    )
    const base = {
      cell,
      nodeId: node.id,
      label: labels[i],
      luz,
      visible,
      glassId: node.glassId ?? ctx.design.glassId,
      fill: node.fill === 'panel' ? ('panel' as const) : ('glass' as const),
    }
    const opening: Opening = node.opening ?? { kind: 'fixed' }
    if (opening.kind === 'fixed') {
      const gap = ctx.base.glassGap
      return {
        ...base,
        type: 'fixed' as const,
        glass: { w: mm1(luz.w - 2 * gap), h: mm1(luz.h - 2 * gap) },
        bead: { w: luz.w, h: luz.h },
      }
    }
    const variant = sashVariant(opening, ctx.line)
    const pauta = variantPauta(ctx.base, ctx.line, variant)
    const { profile, role } = sashProfileFor(ctx, variant)
    const r = grow(luz, pauta.sashOverlap)
    const nominal = { w: r.w, h: r.h }
    const face = profile?.face && profile.face > 0 ? profile.face : pauta.sashWidth
    const glassDed = 2 * (pauta.sashDeduction + pauta.glassGap)
    const beadDed = pauta.beadDeduction ?? 2 * pauta.sashDeduction
    return {
      ...base,
      type: 'sash' as const,
      opening,
      variant,
      pauta,
      profile,
      role,
      rect: r,
      nominal,
      cut: { w: mm1(nominal.w + 2 * pauta.weld), h: mm1(nominal.h + 2 * pauta.weld) },
      glass: { w: mm1(nominal.w - glassDed), h: mm1(nominal.h - glassDed) },
      bead: { w: mm1(nominal.w - beadDed), h: mm1(nominal.h - beadDed) },
      face,
      glassRect: shrink(r, face),
      handle: handleSide(opening, cell.passive),
      passive: cell.passive,
    }
  })
}

// ─── Etiquetas humanas de paños ─────────────────────────────────────────────

type HPos = 'left' | 'right' | 'center'
type VPos = 'top' | 'bottom' | 'middle'

const SHORT_H: Record<HPos, string> = { left: 'izq.', right: 'der.', center: 'centro' }
const SHORT_V: Record<VPos, string> = { top: 'sup.', bottom: 'inf.', middle: 'medio' }
const LONG_V: Record<VPos, string> = { top: 'superior', bottom: 'inferior', middle: 'del medio' }
const longH = (h: HPos, feminine: boolean): string =>
  h === 'center' ? 'central' : h === 'left' ? (feminine ? 'izquierda' : 'izquierdo') : feminine ? 'derecha' : 'derecho'

function baseName(cell: TreeCell): { short: string; long: string; feminine: boolean } {
  const kind = cell.node.opening?.kind ?? 'fixed'
  if (kind === 'door') return { short: 'Puerta', long: 'la puerta', feminine: true }
  if (kind === 'fixed') return { short: 'Paño fijo', long: 'el paño fijo', feminine: false }
  return { short: 'Hoja', long: 'la hoja', feminine: true }
}

export function cellLabels(ctx: EngineContext): CellLabel[] {
  const { W, H } = ctx
  const eps = 0.05
  const labels = ctx.tree.cells.map((cell) => {
    const b = cell.box
    const atL = b.x0 <= eps
    const atR = b.x1 >= W - eps
    const atT = b.y0 <= eps
    const atB = b.y1 >= H - eps
    const h: HPos | undefined = atL && atR ? undefined : atL ? 'left' : atR ? 'right' : 'center'
    const v: VPos | undefined = atT && atB ? undefined : atT ? 'top' : atB ? 'bottom' : 'middle'
    const name = baseName(cell)
    const shortParts = [name.short, v && SHORT_V[v], h && SHORT_H[h]].filter(Boolean)
    const longParts = [name.long, v && LONG_V[v], h && longH(h, name.feminine)].filter(Boolean)
    return { short: shortParts.join(' '), long: longParts.join(' ') }
  })
  return numberDuplicates(labels)
}

function numberDuplicates(labels: CellLabel[]): CellLabel[] {
  const count = new Map<string, number>()
  for (const l of labels) count.set(l.short, (count.get(l.short) ?? 0) + 1)
  const seen = new Map<string, number>()
  return labels.map((l) => {
    if ((count.get(l.short) ?? 0) < 2) return l
    const n = (seen.get(l.short) ?? 0) + 1
    seen.set(l.short, n)
    return { short: `${l.short} ${n}`, long: `${l.long} ${n}` }
  })
}

// ─── Corredera ──────────────────────────────────────────────────────────────

export interface PanelSpec {
  panel: SlidingPanel
  index: number
  rail: number
  label: CellLabel
  rect: Rect
  nominal: Size
  cut: Size
  glass: Size
  bead: Size
  face: number
  glassRect: Rect
  glassId: Id
  /** Encuentros con hojas vecinas (cada uno lleva un traslapo). */
  meetings: number
}

export interface SlidingSpec {
  luz: Rect
  rails: number
  panels: PanelSpec[]
  profile?: Profile
}

/** Riel de cada panel (0 = exterior). Fijos al exterior; móviles alternan o van al interior. */
export function railsFor(panels: SlidingPanel[], rails: number): number[] {
  if (rails <= 1) return panels.map(() => 0)
  if (rails >= 3) return panels.map((_, i) => i % 3)
  const anyFixed = panels.some((p) => p.kind === 'fixed')
  return panels.map((p, i) => (p.kind === 'fixed' ? 0 : anyFixed ? 1 : i % 2))
}

/**
 * Corredera de n hojas (OT 385, PROSLD70 2 hojas 1475 × 1135):
 *   ancho nominal = (luz + 2·sashOverlap + (n − 1)·sashWidth) / n  → (1371 + 16 + 80) / 2 = 733,5
 *   alto nominal  = luz + slidingHeightAdd (def. 2·sashOverlap)     → 1031 + 16 = 1047
 */
export function slidingSpec(ctx: EngineContext): SlidingSpec | undefined {
  const node = ctx.tree.sliding
  if (!node) return undefined
  const p = ctx.base
  const panels = (node.panels ?? []).length > 0 ? node.panels : []
  const rails = node.rails === 1 || node.rails === 3 ? node.rails : 2
  const n = panels.length
  const luz = rect(p.frameDeduction, p.frameDeduction, ctx.W - 2 * p.frameDeduction, ctx.H - 2 * p.frameDeduction)
  const { profile } = sashProfileFor(ctx, 'window')
  if (n === 0) return { luz, rails, panels: [], profile }
  const heightAdd = p.slidingHeightAdd ?? 2 * p.sashOverlap
  const nomW = mm1((luz.w + 2 * p.sashOverlap + (n - 1) * p.sashWidth) / n)
  const nomH = mm1(luz.h + heightAdd)
  const face = profile?.face && profile.face > 0 ? profile.face : p.sashWidth
  const glassDed = 2 * (p.sashDeduction + p.glassGap)
  const beadDed = p.beadDeduction ?? 2 * p.sashDeduction
  const railOf = railsFor(panels, rails)
  const labels = slidingLabels(panels)
  return {
    luz,
    rails,
    profile,
    panels: panels.map((panel, i) => {
      const r = rect(luz.x - p.sashOverlap + i * (nomW - p.sashWidth), luz.y - heightAdd / 2, nomW, nomH)
      return {
        panel,
        index: i,
        rail: railOf[i],
        label: labels[i],
        rect: r,
        nominal: { w: nomW, h: nomH },
        cut: { w: mm1(nomW + 2 * p.weld), h: mm1(nomH + 2 * p.weld) },
        glass: { w: mm1(nomW - glassDed), h: mm1(nomH - glassDed) },
        bead: { w: mm1(nomW - beadDed), h: mm1(nomH - beadDed) },
        face,
        glassRect: shrink(r, face),
        glassId: panel.glassId ?? ctx.design.glassId,
        meetings: n === 1 ? 0 : i === 0 || i === n - 1 ? 1 : 2,
      }
    }),
  }
}

function slidingLabels(panels: SlidingPanel[]): CellLabel[] {
  const n = panels.length
  return panels.map((panel, i) => {
    const fixed = panel.kind === 'fixed'
    const short = fixed ? 'Paño fijo' : 'Hoja'
    const long = fixed ? 'el paño fijo' : 'la hoja'
    if (n === 1) return { short, long }
    let pos: HPos | undefined
    if (n === 2) pos = i === 0 ? 'left' : 'right'
    else if (n === 3) pos = i === 0 ? 'left' : i === 2 ? 'right' : 'center'
    if (!pos) return { short: `${short} ${i + 1}`, long: `${long} ${i + 1}` }
    return { short: `${short} ${SHORT_H[pos]}`, long: `${long} ${longH(pos, !fixed)}` }
  })
}
