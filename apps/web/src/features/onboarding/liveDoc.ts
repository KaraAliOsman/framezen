/**
 * La cotización que se va armando en la puesta a punto: los datos que la persona escribió, la
 * ventana elegida y el precio del motor. Es lo mismo que recibirá su cliente, sin nada de relleno.
 */
import { quoteTotals, type Catalog, type PricingSettings } from '@dekopen/engine'
import type { DocOrg, QuoteDocData, QuoteDocItem } from '@dekopen/documents'
import type { DocumentPrefs } from '@dekopen/shared'
import type { ClientDraft, ResolvedWindow } from './draft'

export interface LiveDocInput {
  org: DocOrg
  client: ClientDraft
  title: string
  win: ResolvedWindow | null
  qty: number
  windowName: string
  catalog: Catalog
  pricing: PricingSettings
  prefs: DocumentPrefs
  number?: number
  today?: Date
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function buildLiveDoc(input: LiveDocInput): QuoteDocData {
  const today = input.today ?? new Date()
  const { win, catalog, client } = input
  const items: QuoteDocItem[] = win
    ? [
        {
          ref: 'V1',
          name: input.windowName,
          qty: Math.max(1, input.qty),
          description: input.windowName,
          lineName: win.line?.name ?? '',
          colorName: catalog.colors.find((c) => c.id === win.design.colorId)?.name ?? '',
          glassName: catalog.glass.find((g) => g.id === win.design.glassId)?.name ?? '',
          width: win.design.width,
          height: win.design.height,
          area: Math.round(((win.design.width * win.design.height) / 1_000_000) * 100) / 100,
          unitPrice: win.price.unitNet,
          total: win.price.totalNet,
          layout: win.layout,
          design: win.design,
        },
      ]
    : []
  // La vigencia la decide el taller: sin definir no se imprime ni se inventa.
  const validity = new Date(today)
  validity.setDate(validity.getDate() + (input.prefs.validityDays ?? 0))
  return {
    org: input.org,
    client: client.name.trim()
      ? { name: client.name.trim(), ...(client.phone.trim() ? { phone: client.phone.trim() } : {}), ...(client.city.trim() ? { city: client.city.trim() } : {}) }
      : undefined,
    quote: { number: Math.max(1, input.number ?? 1), title: input.title, revision: 1, date: isoDate(today), ...(input.prefs.validityDays ? { validUntil: isoDate(validity) } : {}) },
    items,
    totals: quoteTotals(win ? [{ price: win.price, area: win.price.area }] : [], { discountPct: 0, extras: [], ivaPct: input.pricing.ivaPct }),
    extras: [],
    prefs: input.prefs,
    catalog,
  }
}
