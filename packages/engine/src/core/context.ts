import type {
  Catalog,
  Color,
  Glass,
  Id,
  InsectScreen,
  Item,
  Line,
  Pauta,
  Profile,
  ProfileRole,
  RollerShutter,
  Warning,
  WindowDesign,
} from '../types'
import type { TypedWarning } from '../warnings'
import { INSECT_SCREEN_TYPES, ROLLER_SHUTTER_OPERATIONS, ROLLER_SHUTTER_TYPES } from '../types'
import { convertRoot } from './convert'
import { BENDING_GRIP_MM, DEFAULT_PAUTA, REBATE_MM, ROLLER_SHUTTER_BOX_MM, SIGHTLINE_MM } from './defaults'
import { fmtMm } from './format'
import { cellLuz, layoutTree, type TreeLayout } from './geometry'
import { isFloorLeaf, missingPautaLabels, sanitizePauta, type SashVariant } from './pauta'
import { rectInsideRing, shapeGeometry, type ShapeGeometry } from './shapes'
import { mapNode } from './tree'
import { verticalSashProfile } from './typologies'

/** Colector de avisos sin duplicados. Exige los parámetros exactos de cada código (`WarningParamsMap`). */
export class WarningSink {
  readonly list: Warning[] = []
  private readonly keys = new Set<string>()
  add(w: TypedWarning, key = `${w.code}|${w.nodeId ?? ''}|${w.message}`): void {
    if (this.keys.has(key)) return
    this.keys.add(key)
    this.list.push(w)
  }
}

/** Nombre de taller de cada rol de perfil. */
export const ROLE_NAMES: Record<ProfileRole, string> = {
  frame: 'marco',
  sash: 'hoja',
  door_sash: 'hoja de puerta',
  mullion: 'travesaño',
  bead: 'junquillo',
  french_mullion: 'inversor',
  threshold: 'umbral',
  sliding_frame: 'marco de corredera',
  sliding_sash: 'hoja de corredera',
  interlock: 'traslapo',
  guide: 'guía',
  coupler: 'perfil de unión',
  reinforcement: 'refuerzo',
  other: 'perfil',
}

/** Roles de nombre femenino («la hoja», «la guía»), para concordar los avisos. */
const FEMININE_ROLES = new Set<ProfileRole>(['sash', 'door_sash', 'sliding_sash', 'guide'])

/** «El junquillo», «La hoja de puerta». Es como nombran los avisos al perfil de un rol. */
export function roleSubject(role: ProfileRole): string {
  const name = ROLE_NAMES[role] ?? 'perfil'
  return `${FEMININE_ROLES.has(role) ? 'La' : 'El'} ${name}`
}

const ROLE_FALLBACKS: Partial<Record<ProfileRole, ProfileRole[]>> = {
  frame: ['frame', 'sliding_frame'],
  sliding_frame: ['sliding_frame', 'frame'],
  sash: ['sash', 'sliding_sash'],
  sliding_sash: ['sliding_sash', 'sash'],
  door_sash: ['door_sash', 'sash', 'sliding_sash'],
}

/** Extras normalizados (v4 `screen: true` → mosquitero fijo; tipos desconocidos se ignoran). */
export interface NormalizedExtras {
  insectScreen?: InsectScreen
  rollerShutter?: RollerShutter & { boxHeight: number }
  sill: boolean
  threshold: boolean
}

export function normalizeExtras(design: WindowDesign): NormalizedExtras {
  const raw = (typeof design?.extras === 'object' && design.extras !== null ? design.extras : {}) as NonNullable<WindowDesign['extras']>
  const out: NormalizedExtras = { sill: raw.sill === true, threshold: raw.threshold === true }
  const screenType = raw.insectScreen?.type
  if (screenType && (INSECT_SCREEN_TYPES as readonly string[]).includes(screenType)) out.insectScreen = { type: screenType }
  else if (raw.screen === true) out.insectScreen = { type: 'fixed' }
  const shutter = raw.rollerShutter
  if (shutter && (ROLLER_SHUTTER_TYPES as readonly string[]).includes(shutter.type)) {
    const operation = (ROLLER_SHUTTER_OPERATIONS as readonly string[]).includes(shutter.operation) ? shutter.operation : 'strap'
    const box =
      typeof shutter.boxHeight === 'number' && Number.isFinite(shutter.boxHeight) && shutter.boxHeight > 0 ? shutter.boxHeight : ROLLER_SHUTTER_BOX_MM[shutter.type]
    out.rollerShutter = { type: shutter.type, operation, boxHeight: box }
  }
  return out
}

export interface EngineContext {
  design: WindowDesign
  catalog: Catalog
  line?: Line
  lineName: string
  /** Pauta de la línea, completa (con valores típicos donde faltaban). */
  base: Pauta
  W: number
  H: number
  isSliding: boolean
  /** Corredera elevadora (HST). */
  isLiftSlide: boolean
  /** Guillotina (corredera vertical). */
  isVerticalSlide: boolean
  tree: TreeLayout
  shape?: ShapeGeometry
  /**
   * Con forma y varios paños (o una hoja): por cada celda del árbol, 'rect' si su luz cabe entera
   * en el contorno (se calcula como paño rectangular) o 'clip' si lo cruza (fijo recortado; una
   * hoja así avisa `shape_not_fixed`). Vacío con un solo paño fijo (camino exacto de la forma).
   */
  shapeFit: ('rect' | 'clip')[]
  extras: NormalizedExtras
  warnings: WarningSink
  profiles: Map<Id, Profile>
  items: Map<Id, Item>
  glasses: Map<Id, Glass>
  colors: Map<Id, Color>
  frameFace: number
  mullionFace: number
  thresholdFace: number
  /** Perfil de umbral cuando una puerta llega abajo y la línea lo tiene. */
  threshold?: Profile
}

const byId = <T extends { id: Id }>(list: T[] | undefined): Map<Id, T> => new Map((list ?? []).map((x) => [x.id, x]))

export function createContext(design: WindowDesign, catalog: Catalog): EngineContext {
  const warnings = new WarningSink()
  const cat: Catalog = {
    colors: catalog?.colors ?? [],
    brands: catalog?.brands ?? [],
    lines: catalog?.lines ?? [],
    profiles: catalog?.profiles ?? [],
    items: catalog?.items ?? [],
    glass: catalog?.glass ?? [],
    brandSettings: catalog?.brandSettings ?? [],
  }
  const line = cat.lines.find((l) => l.id === design.lineId)
  const W = Number.isFinite(design.width) ? design.width : 0
  const H = Number.isFinite(design.height) ? design.height : 0

  if (!line) {
    warnings.add({
      level: 'warn',
      code: 'line_missing',
      message: 'No encontramos la línea de esta ventana: calculamos con una pauta típica de PVC. Elige una línea para tener cortes exactos.',
      params: { source: 'design' },
    })
  }
  const { pauta: base, missing } = line ? sanitizePauta(line.pauta) : { pauta: { ...DEFAULT_PAUTA }, missing: [] }
  if (line && missing.length > 0) {
    warnings.add({
      level: 'warn',
      code: 'pauta_incomplete',
      message: `A la pauta de ${line.name} le falta ${listJoin(missingPautaLabels(missing))}: usamos valores típicos de PVC. Revísala en el catálogo.`,
      params: { line: line.name, fields: missing.join(',') },
    })
  }
  if (!(W > 0) || !(H > 0)) {
    warnings.add({
      level: 'error',
      code: 'size_invalid',
      message: 'La ventana necesita ancho y alto mayores que cero.',
    })
  }

  const isSliding = design.root?.type === 'sliding'
  const profilesById = byId(cat.profiles)
  // Tramos curvos: deben caber en la barra del marco menos el agarre de la curvadora.
  const frameBar = line?.profiles?.[isSliding ? 'sliding_frame' : 'frame']
  const barLength = (frameBar ? profilesById.get(frameBar)?.barLength : undefined) ?? 0
  const ctx: EngineContext = {
    design,
    catalog: cat,
    line,
    lineName: line?.name ?? 'la línea',
    base,
    W: Math.max(0, W),
    H: Math.max(0, H),
    isSliding,
    isLiftSlide: design.root?.type === 'sliding' && design.root.system === 'lift_slide',
    isVerticalSlide: design.root?.type === 'sliding' && design.root.system === 'vertical',
    tree: layoutTree(design),
    shape: shapeGeometry(design.shape, Math.max(0, W), Math.max(0, H), barLength > 0 ? { maxArc: barLength - BENDING_GRIP_MM - 2 * base.weld } : undefined),
    shapeFit: [],
    extras: normalizeExtras(design),
    warnings,
    profiles: profilesById,
    items: byId(cat.items),
    glasses: byId(cat.glass),
    colors: byId(cat.colors),
    frameFace: 0,
    mullionFace: 0,
    thresholdFace: 0,
  }

  const frameProfile = profileForRole(ctx, ctx.isSliding ? 'sliding_frame' : 'frame')
  // Una corredera no apoya vidrio en el marco: su cara es el cuerpo del perfil, tal como se publica.
  ctx.frameFace = isSliding && frameProfile?.face ? frameProfile.face : sightline(frameProfile?.face, base.frameDeduction)
  const mullion = profileForRole(ctx, 'mullion')
  ctx.mullionFace = 2 * sightline(mullion?.face ? mullion.face / 2 : undefined, base.mullionDeduction)

  // Umbral (opcional, extras.threshold): si una puerta (o un plegable, osciloparalela o corredera
  // paralela) llega al piso y la línea tiene perfil de umbral, todo el borde inferior lo lleva. Sin
  // pedirlo, marco completo como en la OT 385. La elevadora (HST) siempre corre sobre su umbral.
  const wantsThreshold = ctx.extras.threshold || ctx.isLiftSlide
  const threshold = wantsThreshold ? profileForRole(ctx, 'threshold') : undefined
  const doorAtBottom = ctx.isLiftSlide || ctx.tree.cells.some((c) => isFloorLeaf(c.node.opening) && c.edges.bottom === 'frame')
  if (wantsThreshold && !threshold && doorAtBottom) {
    warnings.add({
      level: 'info',
      code: 'threshold_missing',
      message: ctx.isLiftSlide
        ? `${line?.name ?? 'La línea'} no tiene perfil de umbral: la elevadora se calculó con marco completo.`
        : `${line?.name ?? 'La línea'} no tiene perfil de umbral: la puerta se calculó con marco completo.`,
      params: { kind: ctx.isLiftSlide ? 'lift_slide' : 'door', ...(line ? { line: line.name } : {}) },
    })
  }
  if (threshold && doorAtBottom && !ctx.shape) {
    ctx.threshold = threshold
    for (const c of ctx.tree.cells) if (c.edges.bottom === 'frame') c.edges = { ...c.edges, bottom: 'threshold' }
  }
  ctx.thresholdFace = ctx.threshold?.face && ctx.threshold.face > 0 ? ctx.threshold.face : ctx.frameFace

  // Forma con varios paños o con una hoja: qué celdas caben enteras en el contorno de la luz.
  const singleFixed = ctx.tree.cells.length === 1 && (ctx.tree.cells[0].node.opening?.kind ?? 'fixed') === 'fixed'
  if (ctx.shape && !isSliding && !singleFixed) {
    const ring = ctx.shape.ring(base.frameDeduction)
    ctx.shapeFit = ctx.tree.cells.map((cell) => (rectInsideRing(ring, cellLuz(base, cell), 1) ? 'rect' : 'clip'))
  }

  checkDesign(ctx)
  return ctx
}

function checkDesign(ctx: EngineContext): void {
  const { design, line, warnings } = ctx
  if (line && line.colorIds?.length && design.colorId && !line.colorIds.includes(design.colorId)) {
    const color = ctx.colors.get(design.colorId)
    const fallback = line.colorIds[0]
    const fallbackName = ctx.colors.get(fallback)?.name
    warnings.add({
      level: 'warn',
      code: 'color_not_in_line',
      message: `${line.name} no se fabrica en ${color?.name ?? 'ese color'}: revisa el color o la línea.`,
      params: { line: line.name, ...(color ? { color: color.name } : {}) },
      fix: fallbackName
        ? { label: `Usar ${fallbackName}`, key: 'use', params: { name: fallbackName }, patch: { colorId: fallback } }
        : { label: 'Usar su primer color', key: 'use_first_color', patch: { colorId: fallback } },
    })
  }
  if (design.colorId && !ctx.colors.has(design.colorId) && ctx.catalog.colors.length > 0) {
    warnings.add({
      level: 'info',
      code: 'color_missing',
      message: 'El color de la ventana no está en el catálogo: los perfiles se cotizan sin precio de color.',
    })
  }
  if (line && design.root) {
    const wantsSliding = line.kind === 'sliding'
    if (wantsSliding !== ctx.isSliding) {
      const { root, dropShape } = convertRoot(design, line.kind)
      warnings.add({
        level: 'warn',
        code: 'line_kind_mismatch',
        message: wantsSliding
          ? `${line.name} es una línea de corredera y esta ventana es practicable: los cortes pueden no corresponder.`
          : `${line.name} es una línea practicable y esta ventana es corredera: los cortes pueden no corresponder.`,
        params: { target: wantsSliding ? 'sliding' : 'casement', line: line.name },
        fix: {
          label: wantsSliding ? 'Convertir en corredera' : 'Convertir en practicable',
          key: wantsSliding ? 'to_sliding' : 'to_casement',
          patch: dropShape ? { root, shape: { kind: 'rect' } } : { root },
        },
      })
    }
  }
  for (const s of ctx.tree.misplacedSliding) {
    warnings.add({
      level: 'error',
      code: 'sliding_nested',
      nodeId: s.id,
      message: 'Una corredera solo puede ser la ventana completa: ese paño no se calculó.',
    })
  }
  for (const d of ctx.tree.dividers) {
    if (d.frenchFallback) {
      warnings.add({
        level: 'warn',
        code: 'french_needs_sashes',
        nodeId: d.node.id,
        message:
          d.dir === 'vertical'
            ? 'La unión francesa necesita dos hojas que abran a cada lado: la calculamos con travesaño.'
            : 'La unión francesa solo se hace entre hojas lado a lado: la calculamos con travesaño.',
        params: { dir: d.dir },
        fix: {
          label: 'Usar travesaño',
          key: 'use_mullion',
          patch: { root: mapNode(design.root, d.node.id, (n) => (n.type === 'split' ? { ...n, joint: 'mullion' } : n)) },
        },
      })
    }
  }
  for (const d of ctx.tree.dividers) {
    if (d.foldFallback) {
      warnings.add({
        level: 'warn',
        code: 'fold_needs_folding_leaves',
        nodeId: d.node.id,
        message:
          d.dir === 'vertical'
            ? 'La unión plegable necesita hojas plegables a cada lado: la calculamos con travesaño.'
            : 'Un plegable solo se arma con hojas lado a lado: la calculamos con travesaño.',
        params: { dir: d.dir },
        fix: {
          label: 'Usar travesaño',
          key: 'use_mullion',
          patch: { root: mapNode(design.root, d.node.id, (n) => (n.type === 'split' ? { ...n, joint: 'mullion' } : n)) },
        },
      })
    }
  }
  for (const c of ctx.tree.cells) {
    if (c.node.opening?.kind === 'folding' && c.pair !== 'fold') {
      warnings.add({
        level: 'warn',
        code: 'folding_needs_chain',
        nodeId: c.node.id,
        message: 'Una hoja plegable va unida a otras hojas plegables: se calculó como una hoja suelta. Usa una tipología plegable.',
      })
    }
  }
  for (const split of ctx.tree.splits) {
    if (split.node.joint !== 'fold') continue
    const hinges = split.node.children.map((child) =>
      child?.type === 'leaf' && child.opening?.kind === 'folding' ? (child.opening.hinge ?? 'left') : undefined,
    )
    const firstRight = hinges.indexOf('right')
    if (firstRight >= 0 && hinges.slice(firstRight).includes('left')) {
      warnings.add({
        level: 'warn',
        code: 'folding_groups',
        nodeId: split.node.id,
        message:
          'Las hojas que se pliegan a la izquierda deben quedar juntas a la izquierda y las de la derecha a la derecha: revisa hacia dónde se pliega cada hoja.',
      })
    }
  }
  if (ctx.shape && ctx.W > 0) {
    const leaves = ctx.tree.cells
    const crossing = ctx.shapeFit.some((fit, i) => fit === 'clip' && (leaves[i].node.opening?.kind ?? 'fixed') !== 'fixed')
    if (crossing || ctx.isSliding) {
      warnings.add({
        level: 'warn',
        code: 'shape_not_fixed',
        message:
          'En una forma especial las hojas van en su parte rectangular (bajo el arco, los hombros o el lado más bajo): las que la cruzan se calcularon sobre el rectángulo que las contiene.',
        fix: {
          label: 'Dejar como paño fijo',
          key: 'make_fixed',
          patch: { root: { id: design.root?.id ?? 'n1', type: 'leaf', opening: { kind: 'fixed' } } },
        },
      })
    }
    if (ctx.shape.kind === 'arch' && ctx.shape.radius) {
      warnings.add({
        level: 'info',
        code: 'arch_bending',
        message: `El marco en arco se encarga curvado (radio exterior ${fmtMm(ctx.shape.radius)}): confírmalo con tu proveedor.`,
        params: { radius: ctx.shape.radius },
      })
    } else if (ctx.shape.curved && ctx.shape.radius) {
      warnings.add({
        level: 'info',
        code: 'shape_bending',
        message: `El marco ${ctx.shape.kind === 'round' ? 'redondo' : 'ovalado'} se encarga curvado (radio mínimo ${fmtMm(ctx.shape.radius)}): confírmalo con tu proveedor.`,
        params: { shape: ctx.shape.kind === 'round' ? 'round' : 'oval', radius: ctx.shape.radius },
      })
    }
    if (design.shape?.kind === 'round' && Math.abs(ctx.W - ctx.H) > 0.5) {
      warnings.add({
        level: 'info',
        code: 'round_not_square',
        message: `Una ventana redonda tiene el mismo ancho y alto: con ${fmtMm(ctx.W)} × ${fmtMm(ctx.H)} se calculó como óvalo.`,
        params: { width: ctx.W, height: ctx.H },
        fix: { label: `Dejar en ${fmtMm(ctx.W)} × ${fmtMm(ctx.W)}`, key: 'square', params: { width: ctx.W, height: ctx.W }, patch: { height: ctx.W } },
      })
    }
  }
}

/** Perfil de un rol en la línea (con equivalencias corredera/practicable), sin avisar. */
/**
 * Cara vista de una pieza que sostiene vidrio: del canto de la pieza hasta donde empieza a verse el
 * vidrio. `face` es lo que publica el perfil; si no calza con el descuento, manda la pauta, porque de
 * ella sale el corte del vidrio y el vidrio visible nunca puede ser mayor que el vidrio cortado.
 */
export function sightline(face: number | undefined, deduction: number): number {
  if (face && face - deduction >= SIGHTLINE_MM.min && face - deduction <= SIGHTLINE_MM.max) return face
  return deduction + REBATE_MM
}

export function profileForRole(ctx: EngineContext, role: ProfileRole): Profile | undefined {
  const line = ctx.line
  if (!line?.profiles) return undefined
  for (const r of ROLE_FALLBACKS[role] ?? [role]) {
    const id = line.profiles[r]
    const p = id ? ctx.profiles.get(id) : undefined
    if (p) return p
  }
  return undefined
}

/** Perfil obligatorio: si falta, avisa una vez y devuelve undefined (el corte se lista igual). */
export function requireProfile(ctx: EngineContext, role: ProfileRole): Profile | undefined {
  const p = profileForRole(ctx, role)
  if (!p && ctx.line) {
    ctx.warnings.add(
      {
        level: 'warn',
        code: 'profile_missing',
        // Único aviso de este faltante: el precio no lo repite (el corte va sin código).
        message: `${roleSubject(role)} de ${ctx.line.name} no está en tu catálogo: la ventana queda fuera del total. ${FEMININE_ROLES.has(role) ? 'Agrégala' : 'Agrégalo'} en Catálogo.`,
        params: { role, line: ctx.line.name },
      },
      `profile_missing|${role}`,
    )
  }
  return p
}

/** Perfil de hoja según la variante (interior PRO02, puerta, exterior). */
export function sashProfileFor(ctx: EngineContext, variant: SashVariant): { profile?: Profile; role: ProfileRole } {
  if (ctx.isVerticalSlide) {
    const vertical = ctx.line ? verticalSashProfile(ctx.line.id, ctx.catalog.profiles) : undefined
    if (!vertical && ctx.line) {
      ctx.warnings.add(
        {
          level: 'error',
          code: 'vertical_slide_unsupported',
          message: `${ctx.line.name} no tiene hoja de guillotina en el catálogo: esta ventana queda sin precio. Elige una línea que la fabrique.`,
          params: { line: ctx.line.name },
        },
        'vertical_slide_unsupported',
      )
    }
    return { profile: vertical, role: 'sliding_sash' }
  }
  if (variant === 'window_in' && ctx.line?.sashInProfileId) {
    const p = ctx.profiles.get(ctx.line.sashInProfileId)
    if (p) return { profile: p, role: 'sash' }
  }
  if (variant === 'door_out' && ctx.line?.doorOutProfileId) {
    const p = ctx.profiles.get(ctx.line.doorOutProfileId)
    if (p) return { profile: p, role: 'door_sash' }
  }
  if (variant === 'door' || variant === 'door_out') {
    const p = profileForRole(ctx, 'door_sash')
    if (!p) requireProfile(ctx, 'door_sash')
    return { profile: p, role: 'door_sash' }
  }
  return { profile: requireProfile(ctx, ctx.isSliding ? 'sliding_sash' : 'sash'), role: ctx.isSliding ? 'sliding_sash' : 'sash' }
}

export function listJoin(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return parts.slice(0, -1).join(', ') + ' y ' + parts[parts.length - 1]
}
