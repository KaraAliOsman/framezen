import type {
  Catalog,
  CutSettings,
  GlassLine,
  Id,
  ItemLine,
  MaterialCost,
  MaterialLine,
  PricingSettings,
  PurchaseOrderDraft,
  WorkshopData,
  WorkshopWindow,
} from '../types'
import { includedLineIds } from './choices'
import { sanitizeCut } from './defaults'
import {
  evaluateQuoteWithBoms,
  safeBom,
  safeDescribe,
  safeLayout,
  type DesignCore,
  type QuoteInput,
} from './evaluate'
import { roundHalfUp } from './format'
import { catalogLookup, familyDiscount, profileBarPrice, type CatalogLookup } from './lookup'
import type { CutPlan, Offcut } from './optimizer'
import { planCuts, type CutGroupMeta, type PlanEntry } from './plan'

/** Línea de materiales con el consumo real además de la cantidad a comprar. */
export interface MaterialLineDetail extends MaterialLine {
  /** Lo que realmente se usa (p. ej. 136 u aunque se compre 1 caja de 200). */
  consumption?: number
  consumptionUnit?: string
}

export interface WorkshopOptions {
  /** Retazos en bodega para usar antes que barras nuevas. */
  offcuts?: readonly Offcut[]
}

/** Datos de taller con el plan de corte completo (incluye avisos del optimizador). */
export interface WorkshopDataDetail extends WorkshopData {
  optimization: CutPlan
  materials: MaterialLineDetail[]
}

const round1 = (n: number) => roundHalfUp(n, 1)
const round2 = (n: number) => roundHalfUp(n, 2)
const round3 = (n: number) => roundHalfUp(n, 3)
const round4 = (n: number) => roundHalfUp(n, 4)
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0
const net = (price: number | undefined, discountPct: number) => (positive(price) ? price : 0) * (1 - discountPct / 100)

const GROUP_ORDER: MaterialLine['group'][] = ['profile', 'reinforcement', 'hardware', 'accessory', 'glass']

function refLabel(ref: string, label: string): string {
  if (!ref) return label
  return label ? `${ref} · ${label}` : ref
}

function withNames(line: MaterialLineDetail, lk: CatalogLookup, colorId?: Id, brandId?: Id): MaterialLineDetail {
  if (colorId) {
    line.colorId = colorId
    line.colorName = lk.color(colorId)?.name ?? colorId
  }
  if (brandId) {
    line.brandId = brandId
    line.brandName = lk.brand(brandId)?.name ?? brandId
  }
  return line
}

/** Vidrios agrupando medidas idénticas, con las referencias de cada pieza. */
export function glassListFrom(entries: readonly PlanEntry[], catalog: Catalog, lookup?: CatalogLookup): GlassLine[] {
  const lk = lookup ?? catalogLookup(catalog)
  const lines = new Map<string, GlassLine>()
  const glassOrder = new Map<string, number>()
  for (const entry of entries) {
    if (!(entry.qty > 0)) continue
    for (const piece of entry.bom.glass ?? []) {
      if (!piece || !(piece.qty > 0)) continue
      const width = round1(piece.width)
      const height = round1(piece.height)
      const key = `${piece.glassId}|${width}|${height}|${piece.shape ?? 'rect'}`
      if (!glassOrder.has(piece.glassId)) glassOrder.set(piece.glassId, glassOrder.size)
      let line = lines.get(key)
      if (!line) {
        line = {
          glassId: piece.glassId,
          name: lk.glass(piece.glassId)?.name ?? piece.name,
          width,
          height,
          qty: 0,
          area: positive(piece.area) ? round4(piece.area) : round4((width * height) / 1_000_000),
          refs: [],
        }
        if (piece.shape) line.shape = piece.shape
        lines.set(key, line)
      }
      line.qty += piece.qty * entry.qty
      const ref = refLabel(entry.ref, piece.label)
      if (ref && !line.refs.includes(ref)) line.refs.push(ref)
    }
  }
  return [...lines.values()].sort(
    (a, b) => (glassOrder.get(a.glassId) ?? 0) - (glassOrder.get(b.glassId) ?? 0) || b.width - a.width || b.height - a.height,
  )
}

/**
 * Materiales a comprar: barras por perfil y color según la optimización, refuerzos,
 * herrajes y accesorios redondeados a envase, vidrio en m², con costos netos de descuentos.
 */
export function materialListFrom(
  entries: readonly PlanEntry[],
  plan: CutPlan,
  meta: Map<string, CutGroupMeta>,
  catalog: Catalog,
  cut: CutSettings,
  lookup?: CatalogLookup,
): MaterialLineDetail[] {
  const lk = lookup ?? catalogLookup(catalog)
  const out: MaterialLineDetail[] = []

  // Perfiles y refuerzos: barras nuevas del plan (los retazos no se compran).
  for (const group of plan.groups) {
    const info = meta.get(group.key)
    const kind = info?.kind ?? 'profile'
    const family = kind === 'reinforcement' ? 'reinforcement' : 'profiles'
    const profile = lk.profile(info?.profileId)
    const barNet = net(profile ? profileBarPrice(profile, info?.colorId) : undefined, familyDiscount(lk.brandSettings(info?.brandId), family))
    const standard = positive(info?.barLength) ? info.barLength : cut.barLength
    let exact = 0
    let mm = 0
    for (const bar of group.bars) {
      if (!bar.fromOffcut && positive(standard)) exact += barNet * (bar.barLength / standard)
      for (const c of bar.cuts) mm += c.length
    }
    const line: MaterialLineDetail = {
      group: kind,
      code: group.code,
      name: info?.name ?? group.name,
      qty: group.barsNeeded,
      unit: 'barra',
      bars: group.barsNeeded,
      meters: round2(mm / 1000),
      unitCost: round2(barNet),
      total: roundHalfUp(exact),
      consumption: round2(mm / 1000),
      consumptionUnit: 'm',
    }
    out.push(withNames(line, lk, info?.colorId ?? group.colorId, info?.brandId))
  }

  // Herrajes y accesorios: consumo total y compra redondeada al envase.
  const items = new Map<string, { units: number; sample: ItemLine; fallbackBrand?: Id }>()
  // Vidrio: m² cobrables (con mínimo por pieza).
  const glass = new Map<string, { m2: number; name: string; fallbackBrand?: Id }>()
  for (const entry of entries) {
    if (!(entry.qty > 0)) continue
    const lineBrand = lk.line(entry.design.lineId)?.brandId
    for (const il of entry.bom.items ?? []) {
      if (!il || !(il.qty > 0)) continue
      const key = il.itemId || il.code
      const acc = items.get(key) ?? { units: 0, sample: il, fallbackBrand: lineBrand }
      acc.units += il.qty * entry.qty
      items.set(key, acc)
    }
    for (const piece of entry.bom.glass ?? []) {
      if (!piece || !(piece.qty > 0)) continue
      const g = lk.glass(piece.glassId)
      const base = positive(piece.width) && positive(piece.height) ? (piece.width * piece.height) / 1_000_000 : positive(piece.area) ? piece.area : 0
      const billable = Math.max(base, positive(g?.minArea) ? g.minArea : 0)
      const acc = glass.get(piece.glassId) ?? { m2: 0, name: g?.name ?? piece.name, fallbackBrand: lineBrand }
      acc.m2 += billable * piece.qty * entry.qty
      glass.set(piece.glassId, acc)
    }
  }

  for (const [, acc] of items) {
    const item = lk.item(acc.sample.itemId)
    const kind = item?.kind ?? acc.sample.kind ?? 'other'
    const family = kind === 'hardware' ? 'hardware' : 'accessories'
    const pack = positive(item?.packSize) ? item.packSize : 1
    const unit = item?.unit ?? acc.sample.unit ?? 'u'
    let qty: number
    if (pack > 1) qty = Math.ceil(acc.units / pack - 1e-9)
    else if (unit === 'm' || unit === 'm2') qty = Math.ceil(acc.units * 100 - 1e-6) / 100
    else qty = Math.ceil(acc.units - 1e-9)
    const brandId = item?.brandId ?? acc.fallbackBrand
    const unitNet = net(item?.price, familyDiscount(lk.brandSettings(brandId), family))
    const line: MaterialLineDetail = {
      group: kind === 'hardware' ? 'hardware' : 'accessory',
      code: item?.code ?? acc.sample.code,
      name: item?.name ?? acc.sample.name,
      qty,
      unit,
      unitCost: round2(unitNet),
      total: roundHalfUp(qty * unitNet),
      consumption: round3(acc.units),
      consumptionUnit: pack > 1 ? (unit === 'm' || unit === 'm2' ? unit : 'u') : unit,
    }
    out.push(withNames(line, lk, undefined, brandId))
  }

  for (const [glassId, acc] of glass) {
    const g = lk.glass(glassId)
    const brandId = g?.brandId ?? acc.fallbackBrand
    const unitNet = net(g?.pricePerM2, familyDiscount(lk.brandSettings(brandId), 'glass'))
    const line: MaterialLineDetail = {
      group: 'glass',
      code: glassId,
      name: acc.name,
      // Se muestran 2 decimales, pero el total sale de los m² exactos (como el precio de la cotización).
      qty: round2(acc.m2),
      unit: 'm²',
      unitCost: round2(unitNet),
      total: roundHalfUp(acc.m2 * unitNet),
      consumption: round4(acc.m2),
      consumptionUnit: 'm²',
    }
    out.push(withNames(line, lk, undefined, brandId))
  }

  return out
    .map((line, i) => ({ line, i }))
    .sort((a, b) => GROUP_ORDER.indexOf(a.line.group) - GROUP_ORDER.indexOf(b.line.group) || a.i - b.i)
    .map(({ line }) => line)
}

/** Órdenes de compra por marca (proveedor), sin las líneas que no hay que comprar. */
export function purchaseOrdersFrom(materials: readonly MaterialLine[]): PurchaseOrderDraft[] {
  const orders = new Map<string, PurchaseOrderDraft>()
  for (const line of materials) {
    if (!(line.qty > 0)) continue
    const brandId = line.brandId ?? ''
    let order = orders.get(brandId)
    if (!order) {
      order = { brandId, brandName: line.brandName ?? 'Sin proveedor asignado', lines: [], total: 0 }
      orders.set(brandId, order)
    }
    order.lines.push(line)
    order.total += line.total ?? 0
  }
  return [...orders.values()]
}

/** Costo de compra por familia (suma de la lista de materiales). */
export function materialCostFrom(materials: readonly MaterialLine[]): MaterialCost {
  const cost: MaterialCost = { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 }
  const family: Record<MaterialLine['group'], keyof MaterialCost> = {
    profile: 'profiles',
    reinforcement: 'reinforcement',
    hardware: 'hardware',
    accessory: 'accessories',
    glass: 'glass',
  }
  for (const line of materials) cost[family[line.group]] += line.total ?? 0
  return cost
}

/**
 * Como `buildWorkshopData`, con el núcleo inyectado.
 *
 * `costs.materials` y `costs.total` son la compra real (barras completas y envases, con
 * descuentos); `costs.perWindow` usa el precio de cada ventana (costo directo y unitario).
 */
export function buildWorkshopDataWith(
  core: DesignCore,
  quote: QuoteInput,
  catalog: Catalog,
  pricing: Partial<PricingSettings>,
  cut: Partial<CutSettings>,
  opts: WorkshopOptions = {},
): WorkshopDataDetail {
  const cutSettings = sanitizeCut(cut)
  // A producción va lo que cuenta en el total: un opcional sin marcar no se fabrica.
  const counted = includedLineIds([...(quote?.items ?? []), ...(quote?.extras ?? [])], quote?.selection)
  const items = (quote?.items ?? []).filter((item) => counted.has(item.id))
  const lk = catalogLookup(catalog)
  const boms = items.map((item) => safeBom(core, item.design, catalog))
  const evaluation = evaluateQuoteWithBoms({ ...quote, items }, boms, catalog, pricing, { cut: cutSettings })

  const windows: WorkshopWindow[] = items.map((item, i) => {
    const w: WorkshopWindow = {
      ref: item.ref,
      qty: item.qty,
      design: item.design,
      layout: safeLayout(core, item.design, catalog),
      bom: boms[i],
      description: safeDescribe(core, item.design, catalog),
    }
    if (item.name) w.name = item.name
    if (item.location) w.location = item.location
    return w
  })

  const entries: PlanEntry[] = items.map((item, i) => ({ ref: item.ref, design: item.design, bom: boms[i], qty: item.qty }))
  const { plan, meta } = planCuts(entries, catalog, cutSettings, { offcuts: opts.offcuts, lookup: lk })
  const materials = materialListFrom(entries, plan, meta, catalog, cutSettings, lk)
  const materialCost = materialCostFrom(materials)

  return {
    windows,
    optimization: plan,
    glass: glassListFrom(entries, catalog, lk),
    materials,
    purchaseOrders: purchaseOrdersFrom(materials),
    costs: {
      materials: materialCost,
      total: Object.values(materialCost).reduce((a, b) => a + b, 0),
      perWindow: evaluation.items.map((e, i) => ({
        ref: e.ref,
        qty: items[i].qty,
        unitCost: e.price.cost,
        unitPrice: e.price.unitNet,
      })),
    },
    cut: cutSettings,
  }
}
