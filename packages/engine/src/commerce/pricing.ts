import type {
  BrandSettings,
  Bom,
  Catalog,
  CostLine,
  CutPiece,
  CutSettings,
  GlassPiece,
  Id,
  ItemLine,
  ItemPrice,
  MaterialCost,
  PricingSettings,
  Warning,
  WindowDesign,
} from '../types'
import { DEFAULT_CUT, sanitizePricing } from './defaults'
import { formatArea, formatCLP, formatPct, roundHalfUp, roundUpTo } from './format'
import { catalogLookup, familyDiscount, profileBarPrice, type CatalogLookup } from './lookup'
import { fullBarFactors, pieceColorId, pieceKey, planCuts } from './plan'

export interface PriceItemOptions {
  /** Unidades de esta ventana (por defecto 1). */
  qty?: number
  /** Precio unitario neto manual: reemplaza al calculado (se avisa cuál sería). */
  manualUnitPrice?: number
  /** Reemplaza los ajustes guardados de SU marca (`brandId`), p. ej. para previsualizar «Mis precios». */
  brandSettings?: BrandSettings
  /**
   * Factor de barras completas por clave de corte (`cutKey`). Lo calcula `evaluateQuote` para
   * toda la obra cuando `chargeFullBars` está activo; si falta, se optimiza esta ventana sola.
   */
  fullBarFactors?: Record<string, number>
  /** Sierra para cobrar barras completas de una ventana sola (por defecto DEFAULT_CUT). */
  cut?: Partial<CutSettings>
}

/** Precio con el detalle que usan el inspector y `explainPrice` (compatible con ItemPrice). */
export interface ItemPriceDetail extends ItemPrice {
  /** m² de carpintería por unidad. */
  area: number
  /** Precio exacto antes de redondear (costo con margen o recargo). */
  exactUnitPrice: number
  /** Precio unitario calculado y redondeado (aunque haya precio manual). */
  calculatedUnitNet: number
  manual: boolean
  marginMode: PricingSettings['marginMode']
  /** Margen o recargo aplicado (ajustes + ajuste de la marca), en %. */
  targetMarginPct: number
  wastePct: number
  /** Perfiles y refuerzos cobrados en barras completas (su merma ya va en las barras). */
  chargeFullBars: boolean
  roundTo: number
  /** Lo que sumó el redondeo hacia arriba (0 con precio manual). */
  rounding: number
}

type Family = keyof MaterialCost

const FAMILY_ORDER: Family[] = ['profiles', 'reinforcement', 'glass', 'hardware', 'accessories']

/** Línea de costo en construcción (antes de redondear su total). */
interface Agg {
  family: Family
  code?: string
  name: string
  unit: string
  /** Cantidad mostrada en la unidad de la línea. */
  qty: number
  /** Costo neto por unidad mostrada. */
  unitCost: number
  /** Total exacto (sin redondear). */
  exact: number
}

interface Missing {
  label: string
  message: string
}

interface CostContext {
  lk: CatalogLookup
  design: WindowDesign
  lineBrandId?: Id
  missing: Missing[]
}

const round2 = (n: number) => roundHalfUp(n, 2)
const round3 = (n: number) => roundHalfUp(n, 3)
const round4 = (n: number) => roundHalfUp(n, 4)
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0
/** Precio neto tras el descuento; un precio faltante o ≤ 0 vale $0. */
const net = (price: number | undefined, discountPct: number) => (positive(price) ? price : 0) * (1 - discountPct / 100)

const ITEM_NOUN: Record<string, string> = {
  hardware: 'El herraje',
  accessory: 'El accesorio',
  consumable: 'El insumo',
  other: 'El artículo',
}

function missingWarnings(missing: Missing[]): Warning[] {
  if (missing.length === 0) return []
  if (missing.length <= 3) return missing.map((m) => ({ level: 'warn', code: 'price_missing', message: m.message }))
  const shown = missing.slice(0, 2).map((m) => m.label).join(', ')
  return [
    {
      level: 'warn',
      code: 'price_missing',
      message: `Hay ${missing.length} materiales sin precio (${shown} y ${missing.length - 2} más): se cotizan en $0, así que el costo queda corto. Complétalos en Catálogo › Mis precios.`,
    },
  ]
}

function windowArea(bom: Bom, design: WindowDesign): number {
  if (positive(bom?.area)) return bom.area
  if (positive(design?.width) && positive(design?.height)) return (design.width * design.height) / 1_000_000
  return 0
}

/** Perfiles, junquillos y refuerzos: largo/barra × precio de la barra del color (o barras completas). */
function profileCosts(cuts: readonly CutPiece[], ctx: CostContext, factors?: Record<string, number>): Agg[] {
  const groups = new Map<string, { agg: Agg; mm: number; barLength: number; barRate: number; factor: number }>()
  for (const cut of cuts) {
    if (!cut || !positive(cut.qty) || !positive(cut.length)) continue
    const key = pieceKey(cut, ctx.design)
    let group = groups.get(key)
    if (!group) {
      const profile = ctx.lk.profile(cut.profileId)
      const family: Family = cut.kind === 'reinforcement' || profile?.role === 'reinforcement' ? 'reinforcement' : 'profiles'
      const colorId = pieceColorId(cut, ctx.design)
      const colorName = colorId ? (ctx.lk.color(colorId)?.name ?? colorId) : undefined
      const code = cut.code || profile?.code || ''
      const baseName = profile?.name ?? cut.name ?? code
      const list = profile ? profileBarPrice(profile, colorId) : undefined
      const what = family === 'reinforcement' ? 'El refuerzo' : 'El perfil'
      if (!profile) {
        // Sin código («—»): la línea no tiene perfil para ese rol y el despiece ya lo avisó con
        // su nombre (profile_missing o line_missing). Aquí no se repite con un guion por código.
        const known = code && code !== '—' ? code : ''
        if (known) ctx.missing.push({ label: known, message: `${what} ${known} no está en tu catálogo: se cotiza en $0.` })
      } else if (!positive(list)) {
        const inColor = family === 'profiles' && colorName ? ` en ${colorName}` : ''
        ctx.missing.push({
          label: `${profile.code}${inColor}`,
          message: `${what} ${profile.code} · ${profile.name} no tiene precio${inColor}: se cotiza en $0.`,
        })
      }
      group = {
        agg: {
          family,
          code: code || undefined,
          name: family === 'profiles' && colorName ? `${baseName} · ${colorName}` : baseName,
          unit: factors ? 'barra' : 'm',
          qty: 0,
          unitCost: 0,
          exact: 0,
        },
        mm: 0,
        barLength: positive(cut.barLength) ? cut.barLength : positive(profile?.barLength) ? profile.barLength : DEFAULT_CUT.barLength,
        barRate: net(list, familyDiscount(ctx.lk.brandSettings(ctx.lk.profileBrandId(profile, ctx.lineBrandId)), family)),
        factor: factors?.[key] ?? 1,
      }
      groups.set(key, group)
    }
    group.mm += cut.length * cut.qty
  }
  return [...groups.values()].map(({ agg, mm, barLength, barRate, factor }) => {
    const bars = (mm / barLength) * factor
    return factors
      ? { ...agg, qty: round3(bars), unitCost: round2(barRate), exact: bars * barRate }
      : { ...agg, qty: round3(mm / 1000), unitCost: round2(barRate / (barLength / 1000)), exact: bars * barRate }
  })
}

/** Vidrios: máx(área, mínima) × $/m² por pieza; en formas especiales se cobra el rectángulo. */
function glassCosts(pieces: readonly GlassPiece[], ctx: CostContext): Agg[] {
  const groups = new Map<string, { agg: Agg; rate: number; m2: number }>()
  for (const piece of pieces) {
    if (!piece || !positive(piece.qty)) continue
    const glass = ctx.lk.glass(piece.glassId)
    let group = groups.get(piece.glassId)
    if (!group) {
      if (!glass) {
        ctx.missing.push({ label: piece.name || 'Vidrio', message: `El vidrio ${piece.name || 'de esta ventana'} no está en tu catálogo: se cotiza en $0.` })
      } else if (!positive(glass.pricePerM2)) {
        ctx.missing.push({ label: glass.name, message: `El vidrio ${glass.name} no tiene precio por m²: se cotiza en $0.` })
      }
      const rate = net(glass?.pricePerM2, familyDiscount(ctx.lk.brandSettings(glass?.brandId ?? ctx.lineBrandId), 'glass'))
      group = { agg: { family: 'glass', name: glass?.name ?? piece.name ?? 'Vidrio', unit: 'm²', qty: 0, unitCost: round2(rate), exact: 0 }, rate, m2: 0 }
      groups.set(piece.glassId, group)
    }
    const base = positive(piece.width) && positive(piece.height) ? (piece.width * piece.height) / 1_000_000 : positive(piece.area) ? piece.area : 0
    group.m2 += Math.max(base, positive(glass?.minArea) ? glass.minArea : 0) * piece.qty
  }
  return [...groups.values()].map(({ agg, rate, m2 }) => ({ ...agg, qty: round4(m2), exact: m2 * rate }))
}

/** Herrajes, accesorios e insumos: por unidad, con el precio del envase repartido. */
function itemCosts(lines: readonly ItemLine[], ctx: CostContext): Agg[] {
  const groups = new Map<string, { agg: Agg; rate: number; units: number }>()
  for (const il of lines) {
    if (!il || !positive(il.qty)) continue
    const key = il.itemId || il.code
    let group = groups.get(key)
    if (!group) {
      const item = ctx.lk.item(il.itemId)
      const kind = item?.kind ?? il.kind ?? 'other'
      const family: Family = kind === 'hardware' ? 'hardware' : 'accessories'
      const pack = positive(item?.packSize) ? item.packSize : 1
      const noun = ITEM_NOUN[kind] ?? 'El artículo'
      const label = item?.name ?? il.name ?? il.code
      if (!item) {
        ctx.missing.push({ label, message: `${noun} ${il.code ? `${il.code} · ` : ''}${label} no está en tu catálogo: se cotiza en $0.` })
      } else if (!positive(item.price)) {
        ctx.missing.push({ label, message: `${noun} ${label} no tiene precio: se cotiza en $0.` })
      }
      const rate = net(item?.price, familyDiscount(ctx.lk.brandSettings(item?.brandId ?? ctx.lineBrandId), family)) / pack
      const unit = item?.unit ?? il.unit ?? 'u'
      group = {
        agg: { family, code: item?.code ?? il.code, name: label, unit: pack > 1 ? (unit === 'm' ? 'm' : 'u') : unit, qty: 0, unitCost: round2(rate), exact: 0 },
        rate,
        units: 0,
      }
      groups.set(key, group)
    }
    group.units += il.qty
  }
  return [...groups.values()].map(({ agg, rate, units }) => ({ ...agg, qty: round3(units), exact: units * rate }))
}

/**
 * Precio de una ventana a partir de su BOM ya calculado (SPEC §3):
 *
 *   material = perfiles (largo/barra × precio barra del color) + refuerzos + vidrio
 *              (máx(área, mínima) × $/m²) + herrajes y accesorios (por unidad y envase),
 *              cada familia con el descuento de su marca
 *   costo    = material + merma + mano de obra/m² + instalación
 *   unitario = redondeo hacia arriba (costo / (1 − margen))  o  costo × (1 + recargo)
 *
 * Cada línea de costo se redondea a $1 y las familias suman exactamente esas líneas, así el
 * desglose siempre cuadra. Un precio $0 o faltante produce un aviso, nunca un error.
 */
export function priceItem(
  bom: Bom,
  design: WindowDesign,
  catalog: Catalog,
  settings: Partial<PricingSettings>,
  opts: PriceItemOptions = {},
): ItemPriceDetail {
  const s = sanitizePricing(settings)
  const lk = catalogLookup(catalog, opts.brandSettings)
  const warnings: Warning[] = []
  const line = lk.line(design?.lineId)
  if (design?.lineId && !line) {
    warnings.push({
      level: 'warn',
      code: 'line_missing',
      message: 'La línea de esta ventana ya no está en tu catálogo: se cotiza sin descuentos de marca.',
    })
  }

  let qty = 1
  if (opts.qty !== undefined) {
    if (Number.isFinite(opts.qty) && opts.qty >= 0) qty = opts.qty
    else warnings.push({ level: 'warn', code: 'qty_invalid', message: 'La cantidad no es válida: se cotiza 1 unidad.' })
  }

  const cuts = Array.isArray(bom?.cuts) ? bom.cuts : []
  const glassPieces = Array.isArray(bom?.glass) ? bom.glass : []
  const itemLines = Array.isArray(bom?.items) ? bom.items : []

  // Barras completas: factor por clave (de la obra entera o de esta ventana sola).
  let factors: Record<string, number> | undefined
  if (s.chargeFullBars) {
    factors =
      opts.fullBarFactors ??
      fullBarFactors(
        planCuts([{ ref: '', design, bom, qty: Math.max(1, Math.round(qty)) }], catalog, opts.cut ?? DEFAULT_CUT, { lookup: lk }).plan,
      )
  }

  // ── Materiales: cada línea redondeada a $1; las familias suman sus líneas ─────
  const ctx: CostContext = { lk, design, lineBrandId: line?.brandId, missing: [] }
  const aggs = [...profileCosts(cuts, ctx, factors), ...glassCosts(glassPieces, ctx), ...itemCosts(itemLines, ctx)]
  const materials: MaterialCost = { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 }
  const lines: CostLine[] = []
  for (const family of FAMILY_ORDER) {
    for (const agg of aggs) {
      if (agg.family !== family) continue
      const total = roundHalfUp(agg.exact)
      const costLine: CostLine = { group: family, name: agg.name, qty: agg.qty, unit: agg.unit, unitCost: agg.unitCost, total }
      if (agg.code) costLine.code = agg.code
      lines.push(costLine)
      materials[family] += total
    }
  }
  const materialsTotal = FAMILY_ORDER.reduce((sum, f) => sum + materials[f], 0)

  // Con barras completas la merma de perfiles ya está en las barras: no se cobra dos veces.
  const wasteBase = factors ? materialsTotal - materials.profiles - materials.reinforcement : materialsTotal
  const waste = roundHalfUp((wasteBase * s.wastePct) / 100)

  const area = windowArea(bom, design)
  const labor = roundHalfUp(area * s.laborPerM2)
  if (labor > 0) {
    lines.push({ group: 'labor', name: 'Mano de obra', qty: round4(area), unit: 'm²', unitCost: s.laborPerM2, total: labor })
  }
  let install = 0
  if (s.installMode === 'per_m2') {
    install = roundHalfUp(area * s.installValue)
    if (install > 0) lines.push({ group: 'install', name: 'Instalación', qty: round4(area), unit: 'm²', unitCost: s.installValue, total: install })
  } else if (s.installMode === 'per_unit') {
    install = roundHalfUp(s.installValue)
    if (install > 0) lines.push({ group: 'install', name: 'Instalación', qty: 1, unit: 'u', unitCost: s.installValue, total: install })
  }

  const cost = materialsTotal + waste + labor + install

  // ── Margen o recargo ─────────────────────────────────────────────────────────
  const brandAdjust = line ? lk.brandSettings(line.brandId).marginAdjust : undefined
  let target = s.marginPct + (typeof brandAdjust === 'number' && Number.isFinite(brandAdjust) ? brandAdjust : 0)
  if (target < 0) {
    warnings.push({ level: 'warn', code: 'margin_invalid', message: `El margen no puede ser negativo (${formatPct(target)}): se usó 0 %.` })
    target = 0
  }
  if (s.marginMode === 'margin' && target > 95) {
    warnings.push({
      level: 'warn',
      code: 'margin_invalid',
      message: `Un margen de ${formatPct(target)} sobre la venta no es posible: se usó 95 %. Si quieres multiplicar el costo, usa recargo.`,
    })
    target = 95
  }
  const exact = s.marginMode === 'margin' ? cost / (1 - target / 100) : cost * (1 + target / 100)
  const calculated = roundUpTo(exact, s.roundTo)

  const manualValid = typeof opts.manualUnitPrice === 'number' && Number.isFinite(opts.manualUnitPrice) && opts.manualUnitPrice >= 0
  const unitNet = manualValid ? roundHalfUp(opts.manualUnitPrice!) : calculated
  if (opts.manualUnitPrice !== undefined && opts.manualUnitPrice !== null && !manualValid) {
    warnings.push({ level: 'warn', code: 'manual_price_invalid', message: 'El precio manual no es válido: se usa el calculado.' })
  }
  if (manualValid) {
    warnings.push({ level: 'info', code: 'manual_price', message: `Precio manual. El calculado sería ${formatCLP(calculated)}.` })
    if (unitNet < cost) {
      warnings.push({
        level: 'warn',
        code: 'below_cost',
        message: `El precio manual (${formatCLP(unitNet)}) queda bajo el costo (${formatCLP(cost)}): pierdes ${formatCLP(cost - unitNet)} por unidad.`,
      })
    }
  }

  if (cuts.length === 0 && glassPieces.length === 0 && itemLines.length === 0) {
    warnings.push({
      level: 'info',
      code: 'no_materials',
      message: area > 0 ? 'Esta ventana todavía no tiene materiales calculados: el precio solo considera mano de obra e instalación.' : 'Esta ventana todavía no tiene materiales calculados.',
    })
  }

  return {
    materials,
    materialsTotal,
    waste,
    labor,
    install,
    cost,
    unitNet,
    qty,
    totalNet: roundHalfUp(unitNet * qty),
    marginPct: unitNet > 0 ? roundHalfUp(((unitNet - cost) / unitNet) * 100, 1) : 0,
    lines,
    warnings: [...missingWarnings(ctx.missing), ...warnings],
    area: round4(area),
    exactUnitPrice: round2(exact),
    calculatedUnitNet: calculated,
    manual: manualValid,
    marginMode: s.marginMode,
    targetMarginPct: target,
    wastePct: s.wastePct,
    chargeFullBars: Boolean(factors),
    roundTo: s.roundTo,
    rounding: manualValid ? 0 : round2(calculated - exact),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ¿De dónde sale el precio?
// ─────────────────────────────────────────────────────────────────────────────

export interface PriceExplanationLine {
  label: string
  amount: number
  /** 'part' = sumando, 'subtotal' = costo directo, 'total' = precio. */
  kind: 'part' | 'subtotal' | 'total'
}

const FAMILY_LABEL: Record<Family, string> = {
  profiles: 'Perfiles',
  reinforcement: 'Refuerzos de acero',
  glass: 'Vidrios',
  hardware: 'Herrajes',
  accessories: 'Accesorios e insumos',
}

function unitsLabel(qty: number): string {
  const n = roundHalfUp(qty, 2)
  return n === 1 ? '1 unidad' : `${String(n).replace('.', ',')} unidades`
}

/**
 * Desglose del precio en lenguaje humano para el inspector («¿De dónde sale el precio?»).
 * Los sumandos ('part') suman el costo directo; costo + ganancia (+ redondeo) = precio.
 */
export function explainPrice(price: ItemPrice & Partial<ItemPriceDetail>): PriceExplanationLine[] {
  const out: PriceExplanationLine[] = []
  for (const family of FAMILY_ORDER) {
    const amount = price.materials?.[family] ?? 0
    if (amount !== 0) out.push({ label: FAMILY_LABEL[family], amount, kind: 'part' })
  }
  if (price.waste !== 0) {
    const pct = typeof price.wastePct === 'number' && price.wastePct > 0 ? ` (${formatPct(price.wastePct)})` : ''
    const what = price.chargeFullBars ? 'Merma de vidrios, herrajes y accesorios' : 'Merma de material'
    out.push({ label: `${what}${pct}`, amount: price.waste, kind: 'part' })
  }
  if (price.labor !== 0) {
    const labor = price.lines?.find((l) => l.group === 'labor')
    const detail = labor ? ` (${formatArea(labor.qty)} × ${formatCLP(labor.unitCost)})` : ''
    out.push({ label: `Mano de obra${detail}`, amount: price.labor, kind: 'part' })
  }
  if (price.install !== 0) {
    const install = price.lines?.find((l) => l.group === 'install')
    const detail = install && install.unit === 'm²' ? ` (${formatArea(install.qty)} × ${formatCLP(install.unitCost)})` : ''
    out.push({ label: `Instalación${detail}`, amount: price.install, kind: 'part' })
  }
  out.push({ label: 'Costo directo', amount: price.cost, kind: 'subtotal' })

  const manual = price.manual ?? price.warnings?.some((w) => w.code === 'manual_price') ?? false
  const rounding = !manual && typeof price.rounding === 'number' ? roundHalfUp(price.rounding) : 0
  const profit = price.unitNet - price.cost - rounding
  if (profit >= 0) {
    // Con el detalle a mano se nombra el margen pedido (el redondeo va aparte); si no, el real.
    const target = !manual && typeof price.targetMarginPct === 'number' ? price.targetMarginPct : undefined
    const how =
      target === undefined
        ? `margen ${formatPct(price.marginPct)}`
        : price.marginMode === 'markup'
          ? `recargo ${formatPct(target)} sobre el costo`
          : `margen ${formatPct(target)}`
    out.push({ label: `Tu ganancia (${how})`, amount: profit, kind: 'part' })
  } else {
    out.push({ label: 'Pérdida: el precio queda bajo el costo', amount: profit, kind: 'part' })
  }
  if (rounding > 0) {
    const step = typeof price.roundTo === 'number' && price.roundTo > 1 ? ` a ${formatCLP(price.roundTo)}` : ''
    out.push({ label: `Redondeo${step}`, amount: rounding, kind: 'part' })
  }
  out.push({ label: manual ? 'Precio manual por unidad (neto)' : 'Precio por unidad (neto)', amount: price.unitNet, kind: 'total' })
  if (price.qty !== 1) {
    out.push({ label: `Total por ${unitsLabel(price.qty)} (neto)`, amount: price.totalNet, kind: 'total' })
  }
  return out
}
