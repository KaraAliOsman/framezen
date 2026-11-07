import type { Id, Opening, PaneFill, Pauta, Profile, ProfileRole, Rect, SlidingPanel } from '../types'
import type { PaneRef } from '../warnings'
import { sashProfileFor, sightline, type EngineContext } from './context'
import { luzInset, type Box, type EdgeKind, type TreeCell } from './geometry'
import { clamp, fmtMm, mm1 } from './format'
import { mergePauta, variantPauta, sashVariant, type SashVariant } from './pauta'
import { resolveSizes } from './sizes'

/**
 * Medidas de cada paño/hoja según la pauta (una sola fuente para dibujo y despiece):
 *   luz (por eje)        = región − frameDeduction (marco) / − mullionDeduction (travesaño, desde su eje)
 *   hoja nominal         = luz + 2·sashOverlap         · corte = nominal + 2·weld
 *   vidrio de hoja       = nominal − 2·(sashDeduction + glassGap)
 *   junquillo de hoja    = nominal − beadDeduction (def. 2·sashDeduction)
 *   vidrio de fijo       = luz − 2·glassGap            · junquillo de fijo = luz
 * Supuestos sin dato verificado: en unión francesa la luz llega al eje (descuento 0) y cada hoja
 * traslapa el inversor igual que al marco; el umbral descuenta como el marco; en un plegable cada
 * hoja termina a FOLD_GAP_MM/2 del eje del encuentro (sin perfil entre hojas).
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
  fill: PaneFill
}

export interface FixedSpec extends BaseSpec {
  type: 'fixed'
  glass: Size
  bead: Size
}

/** Hoja con zócalo: las dos zonas y el travesaño de hoja. */
export interface ZocaloSpec {
  height: number
  glass: Size
  panel: Size
  bead: Size
  panelBead: Size
  barLength: number
  glassRect: Rect
  panelRect: Rect
  barRect: Rect
}

export interface SashSpec extends BaseSpec {
  type: 'sash'
  zocalo?: ZocaloSpec
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
  /** El mismo paño como dato (para los parámetros de los avisos y su traducción). */
  ref: PaneRef
}

const rect = (x: number, y: number, w: number, h: number): Rect => ({ x: mm1(x), y: mm1(y), w: mm1(w), h: mm1(h) })
export const grow = (r: Rect, d: number): Rect => rect(r.x - d, r.y - d, r.w + 2 * d, r.h + 2 * d)
export const shrink = (r: Rect, d: number): Rect =>
  rect(r.x + d, r.y + d, Math.max(0, r.w - 2 * d), Math.max(0, r.h - 2 * d))

function visibleInset(ctx: EngineContext, kind: EdgeKind): number {
  if (kind === 'mullion') return ctx.mullionFace / 2
  if (kind === 'french' || kind === 'fold') return 0
  if (kind === 'threshold') return ctx.thresholdFace
  return ctx.frameFace
}

function insetBox(box: Box, l: number, r: number, t: number, b: number, clampZero: boolean): Rect {
  const w = box.x1 - box.x0 - l - r
  const h = box.y1 - box.y0 - t - b
  return rect(box.x0 + l, box.y0 + t, clampZero ? Math.max(0, w) : w, clampZero ? Math.max(0, h) : h)
}

/** Posición del eje de un pivotante (0–1, por defecto centrado). */
export function pivotRatio(opening: Opening): number {
  return typeof opening.pivot === 'number' && Number.isFinite(opening.pivot) ? clamp(opening.pivot, 0.05, 0.95) : 0.5
}

/**
 * Lado de la manilla (vista interior). Abatibles y puertas: opuesto a las bisagras. Oscilante:
 * arriba; proyectante: abajo. Pivotante vertical: en el montante más lejano del eje; horizontal:
 * arriba. Osciloparalela y corredera paralela: en el montante de la jamba, opuesto al lado hacia
 * donde se desliza (supuesto de dibujo; el herraje real admite ambos). Plegable: en la hoja activa,
 * del lado libre (opuesto a la jamba donde se apila su grupo). Las hojas pasivas no llevan.
 */
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
    case 'pivot_v':
      return pivotRatio(opening) <= 0.5 ? 'right' : 'left'
    case 'pivot_h':
      return 'top'
    case 'tilt_slide':
    case 'parallel_slide':
      return opening.slide === 'right' ? 'left' : 'right'
    case 'folding':
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
      luzInset(ctx.base, edges.left),
      luzInset(ctx.base, edges.right),
      luzInset(ctx.base, edges.top),
      luzInset(ctx.base, edges.bottom),
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
      fill: node.fill === 'panel' || node.fill === 'louver' ? node.fill : ('glass' as const),
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
    const pauta = variantPauta(ctx.base, ctx.line, variant, opening.kind)
    const { profile, role } = sashProfileFor(ctx, variant)
    const r = sashRect(ctx, cell, luz, pauta)
    const nominal = { w: r.w, h: r.h }
    const face = sightline(profile?.face || pauta.sashWidth, pauta.sashDeduction)
    const glassDed = 2 * (pauta.sashDeduction + pauta.glassGap)
    const beadDed = pauta.beadDeduction ?? 2 * pauta.sashDeduction
    const glassSize = { w: mm1(nominal.w - glassDed), h: mm1(nominal.h - glassDed) }
    const beadSize = { w: mm1(nominal.w - beadDed), h: mm1(nominal.h - beadDed) }
    const zocalo = zocaloSpec(ctx, node.zocalo?.height, pauta, r, face, nominal, glassSize, beadSize)
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
      glass: zocalo ? zocalo.glass : glassSize,
      bead: zocalo ? zocalo.bead : beadSize,
      face,
      glassRect: zocalo ? zocalo.glassRect : shrink(r, face),
      handle: handleSide(opening, cell.passive),
      passive: cell.passive,
      ...(zocalo ? { zocalo } : {}),
    }
  })
}

/**
 * Hoja terminada: la luz más el traslapo. Dos bordes dependen de la pauta y no del traslapo: en una
 * doble hoja la hoja termina a `frenchGap / 2` del eje (plantilla PRO6004: separación 10) y sobre
 * una solera a `thresholdGap` de la cota inferior (13 en PRO6004, 35 con elevación).
 */
function sashRect(ctx: EngineContext, cell: TreeCell, luz: Rect, pauta: Pauta): Rect {
  const r = grow(luz, pauta.sashOverlap)
  let { x, y, w, h } = r
  const gap = pauta.frenchGap
  if (cell.edges.left === 'french' || cell.edges.right === 'french') {
    if (gap === undefined) {
      ctx.warnings.add(
        {
          level: 'info',
          code: 'french_gap_missing',
          message: `La pauta de ${ctx.lineName} no trae la separación entre las hojas: se calcularon hasta el eje. Contrasta el corte con la plantilla de tu proveedor.`,
          params: { line: ctx.lineName },
        },
        'french_gap_missing',
      )
    } else {
      if (cell.edges.left === 'french') {
        const edge = cell.box.x0 + gap / 2
        w += x - edge
        x = edge
      }
      if (cell.edges.right === 'french') w = cell.box.x1 - gap / 2 - x
    }
  }
  if (cell.edges.bottom === 'threshold' && pauta.thresholdGap !== undefined) h = ctx.H - pauta.thresholdGap - y
  return rect(x, y, w, h)
}

/** Alto mínimo de la zona de vidrio sobre un zócalo, para no dejar una tira imposible de vidriar. */
const ZOCALO_MIN_GLASS_MM = 200

/**
 * Zócalo de una hoja: el travesaño de hoja (perfil de travesaño de la línea) tiene su eje a `height`
 * del borde inferior y cada zona descuenta como un paño: desde el travesaño `mullionDeduction`, desde
 * la hoja lo de siempre. Supuesto sin dato de pauta: el travesaño corta al largo nominal de la hoja,
 * igual que un travesaño de marco a su cota.
 */
function zocaloSpec(ctx: EngineContext, height: number | undefined, pauta: Pauta, r: Rect, face: number, nominal: Size, glass: Size, bead: Size): ZocaloSpec | undefined {
  if (height === undefined) return undefined
  const fromBar = pauta.mullionDeduction + pauta.glassGap
  const fromSash = pauta.sashDeduction + pauta.glassGap
  const lowerGlass = mm1(height - fromBar - fromSash)
  const upperGlass = mm1(nominal.h - height - fromBar - fromSash)
  if (!(height > 0) || lowerGlass <= 0 || upperGlass < ZOCALO_MIN_GLASS_MM) {
    const max = mm1(nominal.h - ZOCALO_MIN_GLASS_MM - fromBar - fromSash)
    ctx.warnings.add({
      level: 'warn',
      code: 'zocalo_invalid',
      message: `El zócalo de ${fmtMm(height)} no cabe en esta hoja (máximo ${fmtMm(max)}): se calculó sin zócalo.`,
      params: { height, max },
    })
    return undefined
  }
  const barFace = ctx.mullionFace
  const axis = r.y + r.h - height
  const inner = shrink(r, face)
  const barTop = axis - barFace / 2
  return {
    height,
    glass: { w: glass.w, h: upperGlass },
    panel: { w: glass.w, h: lowerGlass },
    bead: { w: bead.w, h: mm1(upperGlass + 2 * pauta.glassGap) },
    panelBead: { w: bead.w, h: mm1(lowerGlass + 2 * pauta.glassGap) },
    barLength: nominal.w,
    glassRect: rect(inner.x, inner.y, inner.w, Math.max(0, barTop - inner.y)),
    panelRect: rect(inner.x, axis + barFace / 2, inner.w, Math.max(0, inner.y + inner.h - axis - barFace / 2)),
    barRect: rect(inner.x, barTop, inner.w, barFace),
  }
}

// ─── Etiquetas humanas de paños ─────────────────────────────────────────────

type HPos = 'left' | 'right' | 'center'
type VPos = 'top' | 'bottom' | 'middle'

const SHORT_H: Record<HPos, string> = { left: 'izq.', right: 'der.', center: 'centro' }
const SHORT_V: Record<VPos, string> = { top: 'sup.', bottom: 'inf.', middle: 'medio' }
const LONG_V: Record<VPos, string> = { top: 'superior', bottom: 'inferior', middle: 'del medio' }
const longH = (h: HPos, feminine: boolean): string =>
  h === 'center' ? 'central' : h === 'left' ? (feminine ? 'izquierda' : 'izquierdo') : feminine ? 'derecha' : 'derecho'

function baseName(cell: TreeCell): { short: string; long: string; feminine: boolean; kind: PaneRef['kind'] } {
  const opening = cell.node.opening
  const kind = opening?.kind ?? 'fixed'
  if (kind === 'door' || opening?.use === 'balcony' || opening?.use === 'entrance') return { short: 'Puerta', long: 'la puerta', feminine: true, kind: 'door' }
  if (kind === 'fixed') return { short: 'Paño fijo', long: 'el paño fijo', feminine: false, kind: 'fixed' }
  return { short: 'Hoja', long: 'la hoja', feminine: true, kind: 'sash' }
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
    const ref: PaneRef = { kind: name.kind }
    if (v) ref.v = v
    if (h) ref.h = h
    return { short: shortParts.join(' '), long: longParts.join(' '), ref }
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
    return { short: `${l.short} ${n}`, long: `${l.long} ${n}`, ref: { ...l.ref, n } }
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
  /** Pauta aplicada (la de elevadora si corresponde). */
  pauta?: Pauta
}

/**
 * Riel de cada panel (0 = exterior). Un panel con `rail` válido manda; si no: 1 riel → todos al 0;
 * 3 rieles → i % 3; 2 rieles → fijos al exterior y móviles al interior (o alternados si no hay fijos).
 */
export function railsFor(panels: SlidingPanel[], rails: number): number[] {
  const explicit = (p: SlidingPanel): number | undefined =>
    typeof p?.rail === 'number' && Number.isInteger(p.rail) && p.rail >= 0 && p.rail < Math.max(1, rails) ? p.rail : undefined
  if (rails <= 1) return panels.map(() => 0)
  if (rails >= 3) return panels.map((p, i) => explicit(p) ?? i % 3)
  const anyFixed = panels.some((p) => p.kind === 'fixed')
  return panels.map((p, i) => explicit(p) ?? (p.kind === 'fixed' ? 0 : anyFixed ? 1 : i % 2))
}

/**
 * Pauta de una corredera según su sistema: la elevadora (HST) usa `line.liftSlidePauta` si la línea
 * la trae; sin dato, la pauta de la línea (línea dedicada de elevadora).
 */
export function slidingPauta(ctx: EngineContext): Pauta {
  return ctx.isLiftSlide ? mergePauta(ctx.base, ctx.line?.liftSlidePauta) : ctx.base
}

/**
 * Corredera de n hojas (OT 385, PROSLD70 2 hojas 1475 × 1135):
 *   suma de anchos nominales T = luz + 2·sashOverlap + (n − 1)·sashWidth
 *   ancho nominal de cada hoja = T / n                 → (1371 + 16 + 80) / 2 = 733,5
 *   alto nominal  = luz + slidingHeightAdd (def. 2·sashOverlap)     → 1031 + 16 = 1047
 * Con `sizes` (fijo central doble, p. ej.) cada hoja toma de T la fracción de su módulo sobre el
 * ancho total; sin `sizes` todas son iguales y el resultado es el de la OT.
 */
export function slidingSpec(ctx: EngineContext): SlidingSpec | undefined {
  const node = ctx.tree.sliding
  if (!node) return undefined
  const p = slidingPauta(ctx)
  const panels = Array.isArray(node.panels) && node.panels.length > 0 ? node.panels : []
  const rails = node.rails === 1 || node.rails === 3 ? node.rails : 2
  const n = panels.length
  const luz = rect(p.frameDeduction, p.frameDeduction, ctx.W - 2 * p.frameDeduction, ctx.H - 2 * p.frameDeduction)
  const { profile } = sashProfileFor(ctx, 'window')
  if (n === 0) return { luz, rails, panels: [], profile }
  if (ctx.isVerticalSlide) return verticalSpec(ctx, p, luz, rails, panels, profile)
  const heightAdd = p.slidingHeightAdd ?? 2 * p.sashOverlap
  const total = luz.w + 2 * p.sashOverlap + (n - 1) * p.sashWidth
  const custom = Array.isArray(node.sizes) && node.sizes.length === n && node.sizes.some((v) => typeof v === 'number')
  const modules = custom ? resolveSizes(node.sizes as (number | null)[], ctx.W) : undefined
  const widths = panels.map((_, i) => mm1(modules && ctx.W > 0 ? (total * modules[i]) / ctx.W : total / n))
  const nomH = mm1(luz.h + heightAdd)
  const face = sightline(profile?.face || p.sashWidth, p.sashDeduction)
  const glassDed = 2 * (p.sashDeduction + p.glassGap)
  const beadDed = p.beadDeduction ?? 2 * p.sashDeduction
  const railOf = railsFor(panels, rails)
  const labels = slidingLabels(panels)
  let x = luz.x - p.sashOverlap
  return {
    luz,
    rails,
    profile,
    pauta: p,
    panels: panels.map((panel, i) => {
      const nomW = widths[i]
      const r = rect(x, luz.y - heightAdd / 2, nomW, nomH)
      x += nomW - p.sashWidth
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

/**
 * Guillotina: la misma cuenta de la corredera girada 90°. Las hojas se reparten el alto y se traslapan
 * en el riel de encuentro: suma de altos = luz + 2·sashOverlap + (n − 1)·sashWidth. El ancho nominal
 * es luz + suplemento (`slidingHeightAdd`, como el alto de una corredera). Supuesto sin plantilla de
 * fabricante: se contrasta con el proveedor, igual que el monorriel.
 */
function verticalSpec(ctx: EngineContext, p: Pauta, luz: Rect, rails: 1 | 2 | 3, panels: SlidingPanel[], profile: Profile | undefined): SlidingSpec {
  const n = panels.length
  const node = ctx.tree.sliding
  const widthAdd = p.slidingHeightAdd ?? 2 * p.sashOverlap
  const total = luz.h + 2 * p.sashOverlap + (n - 1) * p.sashWidth
  const custom = Array.isArray(node?.sizes) && node.sizes.length === n && node.sizes.some((v) => typeof v === 'number')
  const modules = custom ? resolveSizes(node!.sizes as (number | null)[], ctx.H) : undefined
  const heights = panels.map((_, i) => mm1(modules && ctx.H > 0 ? (total * modules[i]) / ctx.H : total / n))
  const nomW = mm1(luz.w + widthAdd)
  const face = sightline(profile?.face || p.sashWidth, p.sashDeduction)
  const glassDed = 2 * (p.sashDeduction + p.glassGap)
  const beadDed = p.beadDeduction ?? 2 * p.sashDeduction
  const railOf = railsFor(panels, rails)
  let y = luz.y - p.sashOverlap
  return {
    luz,
    rails,
    profile,
    pauta: p,
    panels: panels.map((panel, i) => {
      const nomH = heights[i]
      const r = rect(luz.x - widthAdd / 2, y, nomW, nomH)
      y += nomH - p.sashWidth
      const fixed = panel.kind === 'fixed'
      const pos = i === 0 ? 'top' : i === n - 1 ? 'bottom' : 'middle'
      const label: CellLabel = {
        short: `${fixed ? 'Paño fijo' : 'Hoja'} ${SHORT_V[pos]}`,
        long: `${fixed ? 'el paño fijo' : 'la hoja'} ${LONG_V[pos]}`,
        ref: { kind: fixed ? 'fixed' : 'sash', v: pos },
      }
      return {
        panel,
        index: i,
        rail: railOf[i],
        label,
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
    const kind: PaneRef['kind'] = fixed ? 'fixed' : 'sash'
    if (n === 1) return { short, long, ref: { kind } }
    let pos: HPos | undefined
    if (n === 2) pos = i === 0 ? 'left' : 'right'
    else if (n === 3) pos = i === 0 ? 'left' : i === 2 ? 'right' : 'center'
    if (!pos) return { short: `${short} ${i + 1}`, long: `${long} ${i + 1}`, ref: { kind, n: i + 1 } }
    return { short: `${short} ${SHORT_H[pos]}`, long: `${long} ${longH(pos, !fixed)}`, ref: { kind, h: pos } }
  })
}
