import type { BrandSettings, Bom, Catalog, CutPiece, CutSettings, Id, OptimizationGroup, WindowDesign } from '../types'
import { sanitizeCut } from './defaults'
import { catalogLookup, type CatalogLookup } from './lookup'
import { optimizeCuts, reusableOffcuts, summarizePlan, type CutPieceInput, type CutPlan, type Offcut } from './optimizer'

/** Una ventana lista para producir: su BOM (por unidad) y cuántas unidades lleva. */
export interface PlanEntry {
  ref: string
  design: WindowDesign
  bom: Bom
  qty: number
}

/** Qué hay detrás de cada clave del optimizador (para precios y listas de materiales). */
export interface CutGroupMeta {
  key: string
  kind: 'profile' | 'reinforcement'
  profileId?: Id
  code: string
  name: string
  colorId?: Id
  brandId?: Id
  barLength: number
}

/** Clave de corte: perfil (o código) + color. Los refuerzos no llevan color. */
export function cutKey(profileIdOrCode: string, colorId?: Id): string {
  return `${profileIdOrCode}|${colorId ?? ''}`
}

/** Color con que se compra la barra de una pieza: el de la pieza o el del diseño; refuerzos sin color. */
export function pieceColorId(cut: CutPiece, design: WindowDesign): Id | undefined {
  if (cut.kind === 'reinforcement') return undefined
  return cut.colorId ?? design.colorId
}

/** Clave de corte de una pieza del BOM. */
export function pieceKey(cut: CutPiece, design: WindowDesign): string {
  return cutKey(cut.profileId ?? cut.code, pieceColorId(cut, design))
}

/** Ajustes de corte efectivos para una marca: se usa el mayor entre taller y marca (nunca falta material). */
export function cutForBrand(cut: CutSettings, brand?: BrandSettings): CutSettings {
  if (!brand) return cut
  const kerf = Number.isFinite(brand.kerf) ? Math.max(0, brand.kerf) : 0
  const trim = Number.isFinite(brand.trim) ? Math.max(0, brand.trim) : 0
  return { ...cut, kerf: Math.max(cut.kerf, kerf), trimStart: Math.max(cut.trimStart, trim) }
}

function cutLabel(ref: string, label: string): string {
  if (!ref) return label
  return label ? `${ref} · ${label}` : ref
}

export interface PlanCutsOptions {
  offcuts?: readonly Offcut[]
  /** Reemplazo de ajustes de una marca (previsualización). */
  brandSettings?: BrandSettings
  lookup?: CatalogLookup
}

/**
 * Optimiza todas las piezas (perfiles, junquillos y refuerzos) de un conjunto de ventanas.
 * Agrupa por perfil + color y respeta el largo de barra de cada perfil y el disco y despunte
 * de cada marca.
 */
export function planCuts(
  entries: readonly PlanEntry[],
  catalog: Catalog,
  cutSettings: Partial<CutSettings>,
  options: PlanCutsOptions = {},
): { plan: CutPlan; meta: Map<string, CutGroupMeta> } {
  const cut = sanitizeCut(cutSettings)
  const lk = options.lookup ?? catalogLookup(catalog, options.brandSettings)
  const meta = new Map<string, CutGroupMeta>()
  const order = new Map<string, number>()
  // Piezas por ajuste de corte efectivo (marcas con disco o despunte distinto se optimizan aparte).
  const partitions = new Map<string, { cut: CutSettings; pieces: CutPieceInput[] }>()
  const keyPartition = new Map<string, string>()

  for (const entry of entries) {
    const qty = Number.isFinite(entry.qty) ? entry.qty : 1
    if (qty <= 0) continue
    const lineBrandId = lk.line(entry.design.lineId)?.brandId
    for (const piece of entry.bom.cuts ?? []) {
      if (!piece || !(piece.qty > 0)) continue
      const key = pieceKey(piece, entry.design)
      let info = meta.get(key)
      if (!info) {
        // Primera pieza de la clave: datos del grupo y partición según la marca del perfil.
        const profile = lk.profile(piece.profileId)
        const brandId = lk.profileBrandId(profile, lineBrandId)
        const colorId = pieceColorId(piece, entry.design)
        info = {
          key,
          kind: piece.kind === 'reinforcement' || profile?.role === 'reinforcement' ? 'reinforcement' : 'profile',
          code: piece.code || profile?.code || key,
          name: profile?.name ?? piece.name ?? piece.code,
          barLength: piece.barLength > 0 ? piece.barLength : profile?.barLength && profile.barLength > 0 ? profile.barLength : cut.barLength,
        }
        const profileId = piece.profileId ?? profile?.id
        if (profileId !== undefined) info.profileId = profileId
        if (colorId !== undefined) info.colorId = colorId
        if (brandId !== undefined) info.brandId = brandId
        meta.set(key, info)
        order.set(key, order.size)
        const effective = cutForBrand(cut, lk.explicitBrandSettings(brandId))
        const signature = `${effective.kerf}/${effective.trimStart}/${effective.trimEnd}`
        keyPartition.set(key, signature)
        if (!partitions.has(signature)) partitions.set(signature, { cut: effective, pieces: [] })
      }
      const input: CutPieceInput = {
        key,
        length: piece.length,
        qty: piece.qty * qty,
        label: cutLabel(entry.ref, piece.label),
        code: info.code,
        name: info.name,
        barLength: info.barLength,
      }
      if (entry.ref) input.ref = entry.ref
      if (info.colorId !== undefined) input.colorId = info.colorId
      if (piece.angleStart !== undefined) input.angleStart = piece.angleStart
      if (piece.angleEnd !== undefined) input.angleEnd = piece.angleEnd
      partitions.get(keyPartition.get(key)!)!.pieces.push(input)
    }
  }

  const groups: OptimizationGroup[] = []
  const warnings: CutPlan['warnings'] = []
  for (const partition of partitions.values()) {
    const result = optimizeCuts(partition.pieces, partition.cut, options.offcuts ?? [])
    groups.push(...result.groups)
    warnings.push(...result.warnings)
  }
  groups.sort((a, b) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0))
  return { plan: summarizePlan(groups, reusableOffcuts(groups, cut.minReusable), warnings), meta }
}

/**
 * Factor de barras completas por clave: largo de barras compradas ÷ largo de piezas.
 * Multiplicado por el costo proporcional reparte el costo real de las barras entre las piezas.
 */
export function fullBarFactors(plan: { groups: OptimizationGroup[] }): Record<string, number> {
  const factors: Record<string, number> = {}
  for (const group of plan.groups) {
    let bought = 0
    let used = 0
    for (const bar of group.bars) {
      if (!bar.fromOffcut) bought += bar.barLength
      used += bar.used
    }
    factors[group.key] = used > 0 ? bought / used : 1
  }
  return factors
}
