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
  ItemPriceUnit,
  MaterialCost,
  PendingPrice,
  PricingSettings,
  Warning,
  WindowDesign,
} from '../types'
import { ROLE_NAMES } from '../core/context'
import { warning, type WarningParams } from '../warnings'
import { sanitizePricing } from './defaults'
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
  /** Sierra del taller: largo de barra si el perfil no lo trae, y barras completas de una ventana sola. */
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
  /** Descuento de la línea en % (`unitNet` queda como precio de lista). Solo si tiene. */
  lineDiscountPct?: number
  /** Monto que resta el descuento de la línea, ya descontado de `totalNet`. */
  lineDiscount?: number
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

/** Un material sin precio (o que ya no está en el catálogo), con su aviso individual. */
interface Missing {
  /** Cómo se nombra en el aviso agrupado en español («PRO01 en Blanco»). */
  label: string
  /** Lo mismo sin palabras de un idioma («PRO01 (Blanco)»): es lo que viaja en `params.shown`. */
  neutral: string
  message: string
  /** Datos del aviso individual; faltan si el material no tiene nombre que decir. */
  params?: Extract<WarningParams<'price_missing'>, { variant: 'one' }>
}

interface CostContext {
  lk: CatalogLookup
  design: WindowDesign
  lineBrandId?: Id
  missing: Missing[]
  /** Largo de barra de Ajustes › Taller: manda solo si el perfil no trae el suyo. */
  settingsBarLength?: number
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
  if (missing.length <= 3) {
    // Sin `params` (material sin nombre) el aviso sale con la versión genérica en otros idiomas.
    return missing.map((m): Warning => ({ level: 'warn', code: 'price_missing', message: m.message, ...(m.params ? { params: m.params } : {}) }))
  }
  const shown = missing.slice(0, 2).map((m) => m.label).join(', ')
  return [
    warning({
      level: 'warn',
      code: 'price_missing',
      message: `Hay ${missing.length} materiales sin precio (${shown} y ${missing.length - 2} más): la ventana queda fuera del total hasta tenerlos. Complétalos en Catálogo › Mis precios.`,
      params: { variant: 'many', count: missing.length, shown: missing.slice(0, 2).map((m) => m.neutral).join(', '), rest: missing.length - 2 },
    }),
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
        if (known) {
          ctx.missing.push({
            label: known,
            neutral: known,
            message: `${what} ${known} no está en tu catálogo: queda fuera del total.`,
            params: { variant: 'one', kind: family === 'reinforcement' ? 'reinforcement' : 'profile', issue: 'not_in_catalog', ref: known },
          })
        }
      } else if (!positive(list)) {
        const colorLabel = family === 'profiles' && colorName ? colorName : ''
        const inColor = colorLabel ? ` en ${colorLabel}` : ''
        ctx.missing.push({
          label: `${profile.code}${inColor}`,
          neutral: colorLabel ? `${profile.code} (${colorLabel})` : profile.code,
          message: `${what} ${profile.code} · ${profile.name} no tiene precio${inColor}: queda fuera del total.`,
          params: {
            variant: 'one',
            kind: family === 'reinforcement' ? 'reinforcement' : 'profile',
            issue: colorLabel ? 'no_price_color' : 'no_price',
            ref: `${profile.code} · ${profile.name}`,
            ...(colorLabel ? { color: colorLabel } : {}),
          },
        })
      }
      // Del perfil, luego de Ajustes. Sin ninguno no hay cómo pasar de precio por barra a metros.
      const barLength = positive(cut.barLength) ? cut.barLength : positive(profile?.barLength) ? profile.barLength : positive(ctx.settingsBarLength) ? ctx.settingsBarLength : 0
      if (profile && positive(list) && barLength === 0) {
        ctx.missing.push({ label: profile.code, neutral: profile.code, message: `${what} ${profile.code} · ${profile.name} no tiene largo de barra ni en el catálogo ni en Ajustes › Taller: queda fuera del total.` })
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
        barLength,
        barRate: net(list, familyDiscount(ctx.lk.brandSettings(ctx.lk.profileBrandId(profile, ctx.lineBrandId)), family)),
        factor: factors?.[key] ?? 1,
      }
      groups.set(key, group)
    }
    group.mm += cut.length * cut.qty
  }
  return [...groups.values()].map(({ agg, mm, barLength, barRate, factor }) => {
    const bars = barLength > 0 ? (mm / barLength) * factor : 0
    return factors
      ? { ...agg, qty: round3(bars), unitCost: round2(barRate), exact: bars * barRate }
      : { ...agg, qty: round3(mm / 1000), unitCost: barLength > 0 ? round2(barRate / (barLength / 1000)) : 0, exact: bars * barRate }
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
        ctx.missing.push({
          label: piece.name || 'Vidrio',
          neutral: piece.name || 'Vidrio',
          message: `El vidrio ${piece.name || 'de esta ventana'} no está en tu catálogo: queda fuera del total.`,
          ...(piece.name ? { params: { variant: 'one' as const, kind: 'glass' as const, issue: 'not_in_catalog' as const, ref: piece.name } } : {}),
        })
      } else if (!positive(glass.pricePerM2)) {
        ctx.missing.push({
          label: glass.name,
          neutral: glass.name,
          message: `El vidrio ${glass.name} no tiene precio por m²: queda fuera del total.`,
          params: { variant: 'one', kind: 'glass', issue: 'no_price_m2', ref: glass.name },
        })
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
      const itemKind = kind === 'hardware' || kind === 'accessory' || kind === 'consumable' ? kind : 'other'
      if (!item) {
        const ref = `${il.code ? `${il.code} · ` : ''}${label}`
        ctx.missing.push({
          label,
          neutral: label,
          message: `${noun} ${ref} no está en tu catálogo: queda fuera del total.`,
          params: { variant: 'one', kind: itemKind, issue: 'not_in_catalog', ref },
        })
      } else if (!positive(item.price)) {
        ctx.missing.push({
          label,
          neutral: label,
          message: `${noun} ${label} no tiene precio: queda fuera del total.`,
          params: { variant: 'one', kind: itemKind, issue: 'no_price', ref: label },
        })
      }
      const rate = net(item?.price, familyDiscount(ctx.lk.brandSettings(item?.brandId ?? ctx.lineBrandId), family)) / pack
      const unit = item?.unit ?? il.unit ?? 'u'
      group = {
        agg: { family, code: item?.code ?? il.code, name: label, unit: pack > 1 ? (unit === 'm' || unit === 'm2' ? unit : 'u') : unit, qty: 0, unitCost: round2(rate), exact: 0 },
        rate,
        units: 0,
      }
      groups.set(key, group)
    }
    group.units += il.qty
  }
  return [...groups.values()].map(({ agg, rate, units }) => ({ ...agg, qty: round3(units), exact: units * rate }))
}

const JOINT_MISSING: PendingPrice['code'] = 'joint_missing'

/** Nombre de lo que falta según el aviso del despiece. */
const EXTRA_REF: Record<string, string> = { rollerShutter: 'persiana', insectScreen: 'mosquitero', sill: 'alféizar', threshold: 'umbral' }

/**
 * Lo que le falta a un despiece para tener precio. Avisos del despiece (pieza que la línea no trae,
 * herraje que no existe para esa hoja, extra sin regla) más los materiales sin precio. Un faltante
 * repetido se cuenta una vez.
 */
function pendingFrom(bom: Bom, missing: Missing[], lineMissing: boolean): PendingPrice[] {
  const out: PendingPrice[] = []
  const add = (code: PendingPrice['code'], ref: string) => {
    if (!out.some((p) => p.code === code && p.ref === ref)) out.push({ code, ref })
  }
  if (lineMissing) add('line_missing', 'línea')
  for (const w of bom?.warnings ?? []) {
    const params = w.params ?? {}
    switch (w.code) {
      case 'profile_missing':
        add('profile_missing', ROLE_NAMES[params.role as keyof typeof ROLE_NAMES] ?? 'perfil')
        break
      case 'vertical_slide_unsupported':
        add('profile_missing', 'hoja de guillotina')
        break
      case 'hardware_missing':
      case 'hardware_out_of_range':
        add('hardware_missing', 'herraje')
        break
      case 'extra_rules_missing':
        add('extra_missing', EXTRA_REF[String(params.extra)] ?? 'extra')
        break
      case 'panel_rules_missing':
        add('extra_missing', 'panel ciego')
        break
      case 'louver_rules_missing':
        add('extra_missing', 'celosía')
        break
      case 'bom_failed':
        add('no_materials', 'materiales')
        break
    }
  }
  for (const m of missing) add('price_missing', m.neutral)
  const empty = !bom?.cuts?.length && !bom?.glass?.length && !bom?.items?.length
  if (empty && !out.length) add('no_materials', 'materiales')
  return out
}

/** Aviso único de un ítem fuera del total. */
function pendingWarning(pending: PendingPrice[], partial: boolean): Warning {
  const shown = pending[0].unitId ? `${pending[0].unitId}: ${pending[0].ref}` : pending[0].ref
  const rest = pending.length - 1
  const more = rest > 0 ? ` y ${rest} más` : ''
  return warning({
    level: 'warn',
    code: 'price_pending',
    message: partial
      ? `Parte de este conjunto queda fuera del total hasta tener precio: falta ${shown}${more}.`
      : `Esta ventana queda fuera del total hasta tener precio: falta ${shown}${more}.`,
    params: { scope: partial ? 'part' : 'item', shown, rest },
  })
}

/**
 * Precio de un conjunto: cada unidad se calcula con su línea, color, marca y margen, las uniones como
 * material y el redondeo se aplica una sola vez al final. Lo que no tiene pieza o precio sale del total
 * por unidad o por unión, y el resto conserva su precio. Un precio manual vale por el conjunto entero.
 */
function priceAssembly(bom: Bom, design: WindowDesign, catalog: Catalog, settings: Partial<PricingSettings>, opts: PriceItemOptions): ItemPriceDetail {
  const s = sanitizePricing(settings)
  const asm = bom.assembly!
  const lk = catalogLookup(catalog, opts.brandSettings)
  const qty = opts.qty !== undefined && Number.isFinite(opts.qty) && opts.qty >= 0 ? opts.qty : 1
  const fullBars = s.chargeFullBars
    ? (opts.fullBarFactors ?? fullBarFactors(planCuts([{ ref: '', design, bom, qty: Math.max(1, Math.round(qty)) }], catalog, opts.cut ?? {}, { lookup: lk }).plan))
    : undefined
  const inner: PricingSettings = { ...s, roundTo: 1 }
  const innerOpts: PriceItemOptions = { qty: 1, brandSettings: opts.brandSettings, fullBarFactors: fullBars, cut: opts.cut }

  const parts: { entry: ItemPriceUnit; price: ItemPriceDetail; pending: PendingPrice[] }[] = []
  for (const unit of asm.units) {
    const price = priceItem(unit.bom, unit.design, catalog, inner, innerOpts)
    const pending = (price.pending ?? []).map((p) => ({ ...p, unitId: unit.unitId }))
    parts.push({ entry: { id: unit.unitId, kind: 'unit', label: unit.unitId, net: pending.length ? 0 : price.exactUnitPrice, cost: pending.length ? 0 : price.cost, pending: pending.length > 0 }, price, pending })
  }
  // Cada unión por separado: una sin precio no arrastra a las demás. Los accesorios de las uniones
  // (por metro de acople) van con la primera.
  const jointIds = [...new Set(asm.joints.cuts.map((c) => c.nodeId))]
  const host = asm.units[0]?.design ?? design
  jointIds.forEach((id, i) => {
    const cuts = asm.joints.cuts.filter((c) => c.nodeId === id)
    const jointBom: Bom = { cuts, glass: [], items: i === 0 ? asm.joints.items : [], warnings: [], area: 0, perimeter: 0 }
    const price = priceItem(jointBom, { ...host, width: 0, height: 0 }, catalog, { ...inner, installMode: 'none', laborPerM2: 0 }, innerOpts)
    const label = cuts[0].label
    const pending = price.pending ?? []
    parts.push({ entry: { id, kind: 'joint', label, net: pending.length ? 0 : price.exactUnitPrice, cost: pending.length ? 0 : price.cost, pending: pending.length > 0 }, price, pending })
  })

  const materials: MaterialCost = { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 }
  const lines: CostLine[] = []
  let waste = 0
  let labor = 0
  let install = 0
  let cost = 0
  let exact = 0
  const warnings: Warning[] = []
  for (const part of parts) {
    for (const w of part.price.warnings) {
      if (w.code === 'price_pending') continue
      warnings.push(part.entry.kind === 'unit' ? { ...w, unitId: part.entry.id } : w)
    }
    if (part.pending.length) continue
    for (const family of FAMILY_ORDER) materials[family] += part.price.materials[family]
    waste += part.price.waste
    labor += part.price.labor
    install += part.price.install
    cost += part.price.cost
    exact += part.price.exactUnitPrice
    for (const line of part.price.lines) {
      const same = lines.find((l) => l.group === line.group && l.code === line.code && l.name === line.name && l.unit === line.unit && l.unitCost === line.unitCost)
      if (same) {
        same.qty = round4(same.qty + line.qty)
        same.total += line.total
      } else lines.push({ ...line })
    }
  }
  const pendingAll: PendingPrice[] = [
    ...parts.flatMap((p) => p.pending),
    ...asm.missingJoints.map((j): PendingPrice => ({ code: JOINT_MISSING, ref: `unión ${j.label}` })),
  ]
  const calculated = roundUpTo(exact, s.roundTo)
  const manualValid = typeof opts.manualUnitPrice === 'number' && Number.isFinite(opts.manualUnitPrice) && opts.manualUnitPrice >= 0
  const unitNet = manualValid ? roundHalfUp(opts.manualUnitPrice!) : calculated
  if (opts.manualUnitPrice !== undefined && opts.manualUnitPrice !== null && !manualValid) {
    warnings.push(warning({ level: 'warn', code: 'manual_price_invalid', message: 'El precio manual no es válido: se usa el calculado.' }))
  }
  if (manualValid) {
    warnings.push(warning({ level: 'info', code: 'manual_price', message: `Precio manual. El calculado sería ${formatCLP(calculated)}.`, params: { price: calculated } }))
    if (unitNet < cost) {
      warnings.push(warning({ level: 'warn', code: 'below_cost', message: `El precio manual (${formatCLP(unitNet)}) queda bajo el costo (${formatCLP(cost)}): pierdes ${formatCLP(cost - unitNet)} por unidad.`, params: { price: unitNet, cost, loss: cost - unitNet } }))
    }
  }
  const pending = manualValid ? [] : pendingAll
  if (pending.length) warnings.unshift(pendingWarning(pending, unitNet > 0))
  const area = windowArea(bom, design)
  const first = parts[0]?.price
  const out: ItemPriceDetail = {
    materials,
    materialsTotal: FAMILY_ORDER.reduce((sum, f) => sum + materials[f], 0),
    waste,
    labor,
    install,
    cost,
    unitNet,
    qty,
    totalNet: roundHalfUp(unitNet * qty),
    marginPct: unitNet > 0 ? roundHalfUp(((unitNet - cost) / unitNet) * 100, 1) : 0,
    lines,
    warnings,
    area: round4(area),
    exactUnitPrice: round2(exact),
    calculatedUnitNet: calculated,
    manual: manualValid,
    marginMode: s.marginMode,
    targetMarginPct: first?.targetMarginPct ?? s.marginPct,
    wastePct: s.wastePct,
    chargeFullBars: Boolean(fullBars),
    roundTo: s.roundTo,
    rounding: manualValid ? 0 : round2(calculated - exact),
    units: parts.map((p) => p.entry),
  }
  if (pending.length) out.pending = pending
  return out
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
 * desglose siempre cuadra. Regla de faltantes: si una pieza no existe en la línea o un material no
 * tiene precio, el ítem queda con `pending` y fuera del total (`unitNet` 0) hasta tenerlo o hasta poner
 * un precio manual; el costo parcial sigue a la vista para el inspector. Nunca lanza.
 */
export function priceItem(
  bom: Bom,
  design: WindowDesign,
  catalog: Catalog,
  settings: Partial<PricingSettings>,
  opts: PriceItemOptions = {},
): ItemPriceDetail {
  if (bom?.assembly) return priceAssembly(bom, design, catalog, settings, opts)
  const s = sanitizePricing(settings)
  const lk = catalogLookup(catalog, opts.brandSettings)
  const warnings: Warning[] = []
  const line = lk.line(design?.lineId)
  if (design?.lineId && !line) {
    warnings.push(
      warning({
        level: 'warn',
        code: 'line_missing',
        message: 'La línea de esta ventana ya no está en tu catálogo: se cotiza sin descuentos de marca.',
        params: { source: 'pricing' },
      }),
    )
  }

  let qty = 1
  if (opts.qty !== undefined) {
    if (Number.isFinite(opts.qty) && opts.qty >= 0) qty = opts.qty
    else warnings.push(warning({ level: 'warn', code: 'qty_invalid', message: 'La cantidad no es válida: se cotiza 1 unidad.' }))
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
        planCuts([{ ref: '', design, bom, qty: Math.max(1, Math.round(qty)) }], catalog, opts.cut ?? {}, { lookup: lk }).plan,
      )
  }

  // ── Materiales: cada línea redondeada a $1; las familias suman sus líneas ─────
  const ctx: CostContext = { lk, design, lineBrandId: line?.brandId, missing: [], ...(opts.cut?.barLength !== undefined ? { settingsBarLength: opts.cut.barLength } : {}) }
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
    warnings.push(
      warning({
        level: 'warn',
        code: 'margin_invalid',
        message: `El margen no puede ser negativo (${formatPct(target)}): se usó 0 %.`,
        params: { variant: 'low', pct: target },
      }),
    )
    target = 0
  }
  if (s.marginMode === 'margin' && target > 95) {
    warnings.push(
      warning({
        level: 'warn',
        code: 'margin_invalid',
        message: `Un margen de ${formatPct(target)} sobre la venta no es posible: se usó 95 %. Si quieres multiplicar el costo, usa recargo.`,
        params: { variant: 'high', pct: target },
      }),
    )
    target = 95
  }
  const exact = s.marginMode === 'margin' ? cost / (1 - target / 100) : cost * (1 + target / 100)
  const calculated = roundUpTo(exact, s.roundTo)

  const manualValid = typeof opts.manualUnitPrice === 'number' && Number.isFinite(opts.manualUnitPrice) && opts.manualUnitPrice >= 0
  // Faltantes: el costo parcial queda a la vista, pero el ítem no entra al total con un precio corto.
  const pending = manualValid ? [] : pendingFrom(bom, ctx.missing, Boolean(design?.lineId && !line))
  const unitNet = manualValid ? roundHalfUp(opts.manualUnitPrice!) : pending.length ? 0 : calculated
  if (pending.length) warnings.unshift(pendingWarning(pending, false))
  if (opts.manualUnitPrice !== undefined && opts.manualUnitPrice !== null && !manualValid) {
    warnings.push(warning({ level: 'warn', code: 'manual_price_invalid', message: 'El precio manual no es válido: se usa el calculado.' }))
  }
  if (manualValid) {
    warnings.push(warning({ level: 'info', code: 'manual_price', message: `Precio manual. El calculado sería ${formatCLP(calculated)}.`, params: { price: calculated } }))
    if (unitNet < cost) {
      warnings.push(
        warning({
          level: 'warn',
          code: 'below_cost',
          message: `El precio manual (${formatCLP(unitNet)}) queda bajo el costo (${formatCLP(cost)}): pierdes ${formatCLP(cost - unitNet)} por unidad.`,
          params: { price: unitNet, cost, loss: cost - unitNet },
        }),
      )
    }
  }

  if (cuts.length === 0 && glassPieces.length === 0 && itemLines.length === 0) {
    warnings.push(
      warning({
        level: 'info',
        code: 'no_materials',
        message: area > 0 ? 'Esta ventana todavía no tiene materiales calculados: el precio solo considera mano de obra e instalación.' : 'Esta ventana todavía no tiene materiales calculados.',
        params: { variant: area > 0 ? 'labor' : 'empty' },
      }),
    )
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
    rounding: manualValid || pending.length ? 0 : round2(calculated - exact),
    ...(pending.length ? { pending } : {}),
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
  // Sin precio: se muestra lo que se sabe y lo que falta, sin ganancia ni precio de mentira.
  if (price.pending?.length && !(price.unitNet > 0)) {
    out.push({ label: 'Costo conocido hasta ahora', amount: price.cost, kind: 'subtotal' })
    out.push({ label: 'Fuera del total hasta tener precio', amount: 0, kind: 'total' })
    return out
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
