import type {
  Catalog,
  Color,
  Glass,
  Id,
  Item,
  Line,
  Pauta,
  Profile,
  ProfileRole,
  Warning,
  WindowDesign,
} from '../types'
import { convertRoot } from './convert'
import { DEFAULT_PAUTA, REBATE_MM } from './defaults'
import { fmtMm } from './format'
import { layoutTree, type TreeLayout } from './geometry'
import { missingPautaLabels, sanitizePauta, type DesignExtrasOverrides, type SashVariant } from './pauta'
import { shapeGeometry, type ShapeGeometry } from './shapes'
import { mapNode } from './tree'

/** Colector de avisos sin duplicados. */
export class WarningSink {
  readonly list: Warning[] = []
  private readonly keys = new Set<string>()
  add(w: Warning, key = `${w.code}|${w.nodeId ?? ''}|${w.message}`): void {
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

/** «El junquillo», «La hoja de puerta». */
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
  tree: TreeLayout
  shape?: ShapeGeometry
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
    })
  }
  const { pauta: base, missing } = line ? sanitizePauta(line.pauta) : { pauta: { ...DEFAULT_PAUTA }, missing: [] }
  if (line && missing.length > 0) {
    warnings.add({
      level: 'warn',
      code: 'pauta_incomplete',
      message: `A la pauta de ${line.name} le falta ${listJoin(missingPautaLabels(missing))}: usamos valores típicos de PVC. Revísala en el catálogo.`,
    })
  }
  if (!(W > 0) || !(H > 0)) {
    warnings.add({
      level: 'error',
      code: 'size_invalid',
      message: 'La ventana necesita ancho y alto mayores que cero.',
    })
  }

  const ctx: EngineContext = {
    design,
    catalog: cat,
    line,
    lineName: line?.name ?? 'la línea',
    base,
    W: Math.max(0, W),
    H: Math.max(0, H),
    isSliding: design.root?.type === 'sliding',
    tree: layoutTree(design),
    shape: shapeGeometry(design.shape, Math.max(0, W), Math.max(0, H)),
    warnings,
    profiles: byId(cat.profiles),
    items: byId(cat.items),
    glasses: byId(cat.glass),
    colors: byId(cat.colors),
    frameFace: 0,
    mullionFace: 0,
    thresholdFace: 0,
  }

  const frameProfile = profileForRole(ctx, ctx.isSliding ? 'sliding_frame' : 'frame')
  ctx.frameFace = frameProfile?.face && frameProfile.face > 0 ? frameProfile.face : base.frameDeduction + REBATE_MM
  const mullion = profileForRole(ctx, 'mullion')
  ctx.mullionFace = mullion?.face && mullion.face > 0 ? mullion.face : 2 * (base.mullionDeduction + REBATE_MM)

  // Umbral (opcional, extras.threshold): si una puerta llega al piso y la línea tiene perfil de
  // umbral, todo el borde inferior lo lleva. Sin pedirlo, marco completo como en la OT 385.
  const wantsThreshold = (design.extras as DesignExtrasOverrides | undefined)?.threshold === true
  const threshold = wantsThreshold ? profileForRole(ctx, 'threshold') : undefined
  const doorAtBottom = ctx.tree.cells.some((c) => c.node.opening?.kind === 'door' && c.edges.bottom === 'frame')
  if (wantsThreshold && !threshold && doorAtBottom) {
    warnings.add({
      level: 'info',
      code: 'threshold_missing',
      message: `${line?.name ?? 'La línea'} no tiene perfil de umbral: la puerta se calculó con marco completo.`,
    })
  }
  if (threshold && doorAtBottom && !ctx.shape) {
    ctx.threshold = threshold
    for (const c of ctx.tree.cells) if (c.edges.bottom === 'frame') c.edges = { ...c.edges, bottom: 'threshold' }
  }
  ctx.thresholdFace = ctx.threshold?.face && ctx.threshold.face > 0 ? ctx.threshold.face : ctx.frameFace

  checkDesign(ctx)
  return ctx
}

function checkDesign(ctx: EngineContext): void {
  const { design, line, warnings } = ctx
  if (line && line.colorIds?.length && design.colorId && !line.colorIds.includes(design.colorId)) {
    const color = ctx.colors.get(design.colorId)
    const fallback = line.colorIds[0]
    const fallbackName = ctx.colors.get(fallback)?.name ?? 'su primer color'
    warnings.add({
      level: 'warn',
      code: 'color_not_in_line',
      message: `${line.name} no se fabrica en ${color?.name ?? 'ese color'}: revisa el color o la línea.`,
      fix: { label: `Usar ${fallbackName}`, patch: { colorId: fallback } },
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
        fix: {
          label: wantsSliding ? 'Convertir en corredera' : 'Convertir en practicable',
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
        fix: {
          label: 'Usar travesaño',
          patch: { root: mapNode(design.root, d.node.id, (n) => (n.type === 'split' ? { ...n, joint: 'mullion' } : n)) },
        },
      })
    }
  }
  if (ctx.shape && ctx.W > 0) {
    const leaves = ctx.tree.cells
    const opening = leaves.find((c) => c.node.opening?.kind !== 'fixed')
    if (opening || leaves.length > 1 || ctx.isSliding) {
      warnings.add({
        level: 'warn',
        code: 'shape_not_fixed',
        message: 'Las formas especiales se fabrican como un paño fijo: las hojas y divisiones se calcularon sobre el rectángulo que la contiene.',
        fix: {
          label: 'Dejar como paño fijo',
          patch: { root: { id: design.root?.id ?? 'n1', type: 'leaf', opening: { kind: 'fixed' } } },
        },
      })
    }
    if (ctx.shape.kind === 'arch' && ctx.shape.radius) {
      warnings.add({
        level: 'info',
        code: 'arch_bending',
        message: `El marco en arco se encarga curvado (radio exterior ${fmtMm(ctx.shape.radius)}): confírmalo con tu proveedor.`,
      })
    }
  }
}

/** Perfil de un rol en la línea (con equivalencias corredera/practicable), sin avisar. */
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
        // Único aviso de este faltante: el precio no lo repite (el corte va sin código, a $0).
        message: `${roleSubject(role)} de ${ctx.line.name} no está en tu catálogo: se cotiza en $0. ${FEMININE_ROLES.has(role) ? 'Agrégala' : 'Agrégalo'} en Catálogo.`,
      },
      `profile_missing|${role}`,
    )
  }
  return p
}

/** Perfil de hoja según la variante (interior PRO02, puerta, exterior). */
export function sashProfileFor(ctx: EngineContext, variant: SashVariant): { profile?: Profile; role: ProfileRole } {
  if (variant === 'window_in' && ctx.line?.sashInProfileId) {
    const p = ctx.profiles.get(ctx.line.sashInProfileId)
    if (p) return { profile: p, role: 'sash' }
  }
  if (variant === 'door') {
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
