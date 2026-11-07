/**
 * Datos de una ventana para el cliente, en el idioma del documento: título, subtítulo, filas de
 * especificación (según las opciones de la sección) y precio. Las cifras son las del motor.
 */
import type { ReactNode } from 'react'
import { withTax } from '@dekopen/engine'
import { colorDisplayName, type ItemsOptions } from '@dekopen/shared'
import { GlassGlyph } from '../../base/primitives'
import type { QuoteDocColor, QuoteDocGlass, QuoteDocItemV5 } from '../../data/quote'
import { accessoriesIn, describeOpeningIn, typologyLabel } from '../../i18n'
import { itemUnits, type QuoteModel } from '../model'
import { Swatch } from '../parts'

export function itemTypology(m: QuoteModel, item: QuoteDocItemV5): string {
  if (item.assembly) return m.kit.t(`assembly.${item.assembly.kind}`, { count: item.assembly.units.length })
  return typologyLabel(item.typologyId, item.description || item.ref, m.kit.locale)
}

export function itemTitle(m: QuoteModel, item: QuoteDocItemV5): string {
  return item.name?.trim() || itemTypology(m, item) || item.ref
}

/** Recinto de la ventana, salvo que ya lo diga el título del grupo donde va. */
export function itemPlace(item: QuoteDocItemV5, groupLabel?: string): string {
  const place = item.location?.trim() ?? ''
  return place && place === groupLabel?.trim() ? '' : place
}

/** Tipología (si hay nombre propio) y recinto. */
export function itemSubtitle(m: QuoteModel, item: QuoteDocItemV5, groupLabel?: string, showPlace = true): string {
  return [item.name?.trim() ? itemTypology(m, item) : undefined, showPlace ? itemPlace(item, groupLabel) : undefined].filter(Boolean).join(' · ')
}

/** La ventana no suma al total: opcional sin marcar, alternativa no elegida o sin precio. */
export function isOff(item: Pick<QuoteDocItemV5, 'included' | 'pending'>): boolean {
  return item.included === false || item.pending === 'all'
}

/** Qué le falta a una ventana con precio pendiente, dicho sin rodeos. */
function pendingText(m: QuoteModel, item: Pick<QuoteDocItemV5, 'pending' | 'pendingParts'>): string {
  const { t } = m.kit
  if (item.pending === 'partial' && item.pendingParts?.length) {
    const parts = item.pendingParts.map((p) => (p.kind === 'joint' ? t('pending.joint', { label: p.label }) : p.label))
    return t('pending.partial', { list: parts.join(', ') })
  }
  if (item.pending === 'partial') return t('pending.partialUnknown')
  return item.pending ? t('pending.tag') : ''
}

/** «Opcional · No incluido en el total», «Precio por confirmar · No incluido en el total». */
export function itemTag(m: QuoteModel, item: Pick<QuoteDocItemV5, 'role' | 'altGroup' | 'included' | 'pending' | 'pendingParts'>): string {
  const { t } = m.kit
  const pending = pendingText(m, item)
  if (!item.role || item.role === 'base') return pending
  const kind = item.role === 'optional' ? t('choices.optional') : item.altGroup ? t('choices.alternativeOf', { group: item.altGroup }) : t('choices.alternative')
  return [kind, pending || (item.included === false ? t('choices.notIncluded') : t('choices.included'))].join(' · ')
}

export function itemColors(m: QuoteModel, item: QuoteDocItemV5): { out?: QuoteDocColor; in?: QuoteDocColor } {
  // Nombres conocidos en el idioma del documento («Nogal» → «Walnut»); los propios, tal cual.
  const named = (c: QuoteDocColor): QuoteDocColor => {
    const name = colorDisplayName(c, m.kit.locale)
    return name === c.name ? c : { ...c, name }
  }
  if (item.colorOut) return { out: named(item.colorOut), in: named(item.colorIn ?? item.colorOut) }
  const find = (id?: string): QuoteDocColor | undefined => {
    const c = id ? m.data.catalog.colors?.find((x) => x.id === id) : undefined
    return c ? named({ id: c.id, name: c.name, hex: c.hex, ...(c.texture ? { texture: c.texture } : {}) }) : undefined
  }
  const out = find(item.design?.colorId)
  const inside = item.design?.colorInId ? find(item.design.colorInId) : out
  return { ...(out ? { out } : {}), ...(inside ? { in: inside } : {}) }
}

export function itemGlasses(m: QuoteModel, item: QuoteDocItemV5): QuoteDocGlass[] {
  if (item.glasses?.length) return item.glasses
  const g = m.data.catalog.glass?.find((x) => x.id === item.design?.glassId)
  if (g) return [{ id: g.id, name: item.glassName || g.name, kind: g.kind, thickness: g.thickness, ...(g.composition ? { composition: g.composition } : {}) }]
  return item.glassName ? [{ id: 'glass', name: item.glassName, kind: 'dvh' }] : []
}

/** Solo la línea: la marca va con su logo, nunca escrita delante. */
export function itemLineName(item: QuoteDocItemV5): string {
  return item.line?.series || item.line?.name || item.lineName || ''
}

/** Datos del catálogo que acompañan a la línea en «detalle completo». Lo que falta no se muestra. */
function lineFacts(m: QuoteModel, item: QuoteDocItemV5): string {
  const { t, fmt } = m.kit
  const line = item.line
  if (!line) return ''
  if (line.description?.trim()) return line.description.trim()
  return [line.depth ? t('items.depth', { mm: fmt.number(line.depth) }) : '', line.chambers ? t('items.chambers', { count: line.chambers }) : ''].filter(Boolean).join(' · ')
}

/** Nota visible para el cliente: la de la cotización por ítem (ajustes v2) o la del ítem. */
export function itemNote(m: QuoteModel, item: QuoteDocItemV5): string {
  return (item.id ? m.itemNotes[item.id] : undefined)?.trim() || m.guardTotal(item.notes?.trim() ?? '')
}

export interface SpecRow {
  key: string
  label: string
  value: ReactNode
  /** Texto plano para estimar el alto. */
  text: string
}

export type SpecOptions = Pick<ItemsOptions, 'showSystem' | 'showGlass' | 'showArea' | 'finishes' | 'showSwatches' | 'showPerformance'> & {
  opening?: boolean
  size?: boolean
  accessories?: boolean
  hardware?: boolean
  glassBuildup?: boolean
  rough?: boolean
  /** Imagen del vidrio junto a su nombre (por defecto sí). */
  glassImage?: boolean
}

function ColorLine({ color, swatch, m }: { color: QuoteDocColor | undefined; swatch: boolean; m: QuoteModel }) {
  if (!color) return null
  return (
    <span className="dkd-inline">
      {swatch ? <Swatch color={color} m={m} el="showSwatches" /> : null}
      <span>{color.name}</span>
    </span>
  )
}

/** Un conjunto se describe por sus unidades y sus uniones, no por el paño de reserva de su diseño. */
function assemblyRows(m: QuoteModel, asm: NonNullable<QuoteDocItemV5['assembly']>): SpecRow[] {
  const { t, fmt } = m.kit
  const units = asm.units.map((u) => `${u.id}: ${typologyLabel(u.typologyId, describeOpeningIn(u.design, m.kit.locale), m.kit.locale)} ${fmt.size(u.width, u.height)}`).join(' · ')
  const rows: SpecRow[] = [{ key: 'units', label: t('assembly.units'), value: units, text: units }]
  if (asm.joints.length) {
    const joints = asm.joints.map((j) => `${t(`assembly.joint.${j.kind}`)} ${j.label}${j.angle !== 180 ? ` (${fmt.number(j.angle)}°)` : ''}`).join(' · ')
    rows.push({ key: 'joints', label: t('assembly.joints'), value: joints, text: joints })
  }
  return rows
}

export function itemSpecRows(m: QuoteModel, item: QuoteDocItemV5, o: SpecOptions): SpecRow[] {
  const { t, fmt } = m.kit
  const rows: SpecRow[] = []
  if (o.size !== false) {
    const size = fmt.size(item.width, item.height)
    rows.push({ key: 'size', label: t('items.size'), value: <span className="dkd-dim">{size}</span>, text: size })
  }
  if (o.rough && item.rough?.width && item.rough.height) {
    const rough = fmt.size(item.rough.width, item.rough.height)
    rows.push({ key: 'rough', label: t('items.rough'), value: <span className="dkd-dim">{rough}</span>, text: rough })
  }
  if (item.assembly) {
    for (const row of assemblyRows(m, item.assembly)) rows.push(row)
  } else if (o.opening) {
    const text = describeOpeningIn(item.design, m.kit.locale)
    rows.push({ key: 'opening', label: t('items.opening'), value: text, text })
  }
  const series = itemLineName(item)
  const full = m.settings.lineDetail === 'full'
  const line = full ? [series, lineFacts(m, item)].filter(Boolean).join(' · ') : series
  if (o.showSystem && line) rows.push({ key: 'system', label: t('items.system'), value: line, text: line })
  const colors = itemColors(m, item)
  const oneColor = !colors.in || !colors.out || colors.in.id === colors.out.id
  if (o.finishes === 'inside_outside' && !oneColor) {
    if (colors.out) rows.push({ key: 'colorOut', label: t('items.colorOut'), value: <ColorLine color={colors.out} swatch={o.showSwatches} m={m} />, text: colors.out.name })
    if (colors.in) rows.push({ key: 'colorIn', label: t('items.colorIn'), value: <ColorLine color={colors.in} swatch={o.showSwatches} m={m} />, text: colors.in.name })
  } else if (o.finishes !== 'none' && (colors.out || item.colorName)) {
    const same = oneColor
    const text = colors.out ? (same ? colors.out.name : t('items.colorBoth', { out: colors.out.name, in: colors.in!.name })) : item.colorName
    rows.push({
      key: 'color',
      label: t('items.color'),
      value: (
        <span className="dkd-inline">
          {o.showSwatches && colors.out ? <Swatch color={colors.out} m={m} el="showSwatches" /> : null}
          {o.showSwatches && !same && colors.in ? <Swatch color={colors.in} m={m} el="showSwatches" /> : null}
          <span>{text}</span>
        </span>
      ),
      text,
    })
  }
  const glasses = itemGlasses(m, item)
  if (o.showGlass && glasses.length) {
    const text = glasses.map((g) => g.name).join(' + ')
    rows.push({
      key: 'glass',
      label: t('items.glass'),
      value: (
        <span className="dkd-inline dkd-inline--glass">
          {o.glassImage === false ? null : <span className="dkd-glyph" data-dk-el="showGlassImage"><GlassGlyph kind={glasses[0].kind} size={11} /></span>}
          <span>{text}</span>
        </span>
      ),
      text,
    })
  }
  if (o.showArea && item.area > 0) {
    const area = fmt.area(item.area)
    const text = item.qty > 1 ? t('items.areaEach', { area }) : area
    rows.push({ key: 'area', label: t('items.area'), value: <span className="dkd-num">{text}</span>, text })
  }
  const buildup = o.glassBuildup ? [...new Set(glasses.map((g) => g.composition?.trim()).filter(Boolean))].join(' · ') : ''
  if (buildup) rows.push({ key: 'buildup', label: t('specs.buildup'), value: buildup, text: buildup })
  const acc = o.accessories === false ? [] : accessoriesIn(item.extras ?? item.design?.extras, m.kit.locale)
  if (acc.length) {
    const text = acc.join(' · ')
    rows.push({ key: 'acc', label: t('items.accessories'), value: text, text })
  }
  if (o.hardware && item.hardware?.length) {
    const text = item.hardware.join(' · ')
    rows.push({ key: 'hardware', label: t('items.hardware'), value: text, text })
  }
  if (o.showPerformance && !full && item.line && (item.line.depth || item.line.chambers)) {
    const parts = [item.line.depth ? t('items.depth', { mm: fmt.number(item.line.depth) }) : '', item.line.chambers ? t('items.chambers', { count: item.line.chambers }) : ''].filter(Boolean)
    const text = parts.join(' · ')
    rows.push({ key: 'perf', label: t('items.performance'), value: text, text })
  }
  return rows
}

export interface PriceTexts {
  unit?: string
  total?: string
  qty: string
  /** Con una sola unidad, «c/u» repetiría el neto: no se imprime junto a él. */
  repeatsTotal?: boolean
  /** Rótulo del monto: neto o con impuesto. */
  label: string
  /** «−10 %» si la línea tiene descuento. */
  discount?: string
  /** Sin precio: va este texto en lugar de la cifra (nunca $0). */
  pending?: string
}

type PriceOptions = Pick<ItemsOptions, 'showUnitPrices' | 'showLineTotals'> & Partial<Pick<ItemsOptions, 'priceTax'>>

/** Monto de una línea en la modalidad elegida (neto o con impuesto). */
export function lineAmount(m: QuoteModel, net: number, o: Pick<PriceOptions, 'priceTax'>): number {
  return o.priceTax === 'gross' ? withTax(net, m.taxPct) : net
}

export function itemPrice(m: QuoteModel, item: QuoteDocItemV5, o: PriceOptions): PriceTexts {
  const { t, fmt } = m.kit
  const qty = t('summary.unitsCount', { count: itemUnits(item) })
  const label = o.priceTax === 'gross' ? t('items.withTax', { tax: m.kit.taxLabel }) : t('totals.net')
  if (item.pending === 'all') return { qty, label, pending: t('pending.value') }
  // Una sola línea sin impuesto ni adicionales valdría lo mismo que el total: ahí no se imprime.
  if (Math.round(item.total) === Math.round(m.data.totals.total) && item.included !== false) return { qty, label }
  const unit = fmt.money(lineAmount(m, item.unitPrice, o))
  return {
    qty,
    label,
    repeatsTotal: item.qty <= 1 && o.showLineTotals && !item.lineDiscountPct,
    ...(o.showUnitPrices ? { unit: item.qty > 1 ? t('items.qtyTimes', { qty: fmt.number(item.qty), price: unit }) : t('items.each', { price: unit }) } : {}),
    ...(o.showLineTotals ? { total: fmt.money(lineAmount(m, item.total, o)) } : {}),
    ...(item.lineDiscountPct && o.showLineTotals ? { discount: `−${fmt.pct(item.lineDiscountPct)}` } : {}),
  }
}

export function PriceBlock({ price, align = 'end', size = 'md' }: { price: PriceTexts; align?: 'end' | 'start'; size?: 'md' | 'lg' }) {
  if (!price.total && !price.unit) return <div className={`dkd-price dkd-price--${align}`}><span className="dkd-price__unit">{price.qty}</span></div>
  return (
    <div className={`dkd-price dkd-price--${align} dkd-price--${size}`}>
      {price.total ? <span className="dkd-price__total dkd-num">{price.total}</span> : null}
      {price.unit ? <span className="dkd-price__unit dkd-num">{price.unit}</span> : <span className="dkd-price__unit">{price.qty}</span>}
    </div>
  )
}

/** Qué opción de la sección controla cada fila (el lienzo la apaga con un clic). */
const SPEC_OPTION: Readonly<Record<string, string>> = {
  size: 'showSize',
  rough: 'showRoughOpening',
  opening: 'showOpening',
  system: 'showSystem',
  colorOut: 'finishes',
  colorIn: 'finishes',
  color: 'finishes',
  glass: 'showGlass',
  area: 'showArea',
  buildup: 'showGlassBuildup',
  acc: 'showAccessories',
  hardware: 'showHardware',
  perf: 'showPerformance',
}

export function Specs({ rows, columns = 2 }: { rows: SpecRow[]; columns?: 1 | 2 | 3 }) {
  if (rows.length === 0) return null
  return (
    <dl className={`dkd-specs dkd-specs--c${columns}`} data-dk-el="showSpecs">
      {rows.map((r) => (
        <div key={r.key} className="dkd-spec" data-dk-el={SPEC_OPTION[r.key]}>
          <dt className="dkd-label">{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  )
}
