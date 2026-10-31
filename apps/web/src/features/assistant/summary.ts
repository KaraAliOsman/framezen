/**
 * Contexto de pantalla para Marco: un resumen breve de la cotización abierta (con cifras del motor)
 * y del catálogo, para que la IA use nombres reales y nunca invente números.
 */
import { describeDesign, evaluateQuote, formatCLP, formatSize, resolvePricing, type Catalog, type CutSettings, type PricingSettings } from '@framezen/engine'
import type { AssistantContext, Defaults, LocalCommandContext } from '@framezen/shared'
import type { QuoteEditorBridge } from './bridge'

export interface SummaryOptions {
  defaults?: Defaults
  pricing?: Partial<PricingSettings>
  cut?: Partial<CutSettings>
}

const MAX_ITEMS = 40

function catalogLines(catalog: Catalog, defaults?: Defaults): string[] {
  const names = (list: { name: string }[], max: number) => {
    const shown = list.slice(0, max).map((x) => x.name)
    return list.length > max ? `${shown.join(', ')} y ${list.length - max} más` : shown.join(', ')
  }
  const line = catalog.lines.find((l) => l.id === defaults?.lineId)
  const color = catalog.colors.find((c) => c.id === defaults?.colorId)
  const glass = catalog.glass.find((g) => g.id === defaults?.glassId)
  const out = [
    `Por defecto del taller: ${[line?.name, color?.name, glass?.name].filter(Boolean).join(' · ') || 'sin definir'}.`,
    `Líneas activas: ${names(catalog.lines.map((l) => ({ name: `${l.name} (${l.kind === 'sliding' ? 'corredera' : 'practicable'})` })), 14)}.`,
    `Colores: ${names(catalog.colors, 16)}.`,
  ]
  const pricedGlass = catalog.glass.filter((g) => g.pricePerM2 > 0)
  out.push(`Vidrios con precio: ${names(pricedGlass.length ? pricedGlass : catalog.glass, 14)}.`)
  return out
}

export function buildQuoteSummary(bridge: QuoteEditorBridge, options: SummaryOptions = {}): string {
  const quote = bridge.getQuote()
  const catalog = bridge.getCatalog()
  const head = [`Cotización N° ${quote.number}${quote.title ? ` «${quote.title}»` : ' (sin título)'}`]
  head.push(quote.client?.name ? `cliente ${quote.client.name}` : 'sin cliente')
  if (quote.discountPct) head.push(`descuento ${String(quote.discountPct).replace('.', ',')} %`)
  const lines = [`${head.join(' · ')}.`]
  if (!quote.items.length) lines.push('Todavía no tiene ventanas.')
  else {
    lines.push(`Ventanas (${quote.items.length}):`)
    for (const item of quote.items.slice(0, MAX_ITEMS)) {
      const extra = [item.qty > 1 ? `${item.qty} u` : '', item.location ?? ''].filter(Boolean).join(' · ')
      lines.push(`- ${item.ref || '?'}: ${describeDesign(item.design, catalog)} · ${formatSize(item.design.width, item.design.height)}${extra ? ` · ${extra}` : ''}`)
    }
    if (quote.items.length > MAX_ITEMS) lines.push(`… y ${quote.items.length - MAX_ITEMS} más.`)
    try {
      const totals = evaluateQuote(quote, catalog, resolvePricing(options.pricing, quote.pricing), { cut: options.cut }).totals
      lines.push(`Total del motor: ${formatCLP(totals.net)} + IVA (${formatCLP(totals.total)} con IVA), ${totals.units} unidades.`)
    } catch {
      // sin totales: la IA puede pedirlos con explain_price
    }
  }
  lines.push(...catalogLines(catalog, options.defaults))
  return lines.join('\n').slice(0, 7800)
}

/** Contexto que viaja con cada mensaje. */
export function buildAssistantContext(route: string, bridge: QuoteEditorBridge | null, options: SummaryOptions = {}): AssistantContext {
  if (!bridge) return { route }
  const quote = bridge.getQuote()
  const selected = bridge.selectedItemId()
  const selectedRef = quote.items.find((i) => i.id === selected)?.ref
  return {
    route,
    quoteId: bridge.quoteId,
    ...(selected ? { itemId: selected } : {}),
    ...(selectedRef ? { selectedRef } : {}),
    refs: quote.items.map((i) => i.ref),
    summary: buildQuoteSummary(bridge, options),
  }
}

/** Contexto del intérprete local en el navegador (sin conexión). */
export function buildLocalContext(route: string, bridge: QuoteEditorBridge | null): LocalCommandContext {
  if (!bridge) return { route, quoteOpen: false }
  const quote = bridge.getQuote()
  const catalog = bridge.getCatalog()
  const selected = bridge.selectedItemId()
  return {
    route,
    quoteOpen: true,
    selectedRef: quote.items.find((i) => i.id === selected)?.ref,
    refs: quote.items.map((i) => i.ref),
    colors: catalog.colors.map((c) => c.name),
    lines: catalog.lines.map((l) => l.name),
  }
}
