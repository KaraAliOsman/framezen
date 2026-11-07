/**
 * La cotización de ejemplo de la landing: las mismas ventanas para el dibujo del héroe, las páginas
 * de la cotización, el portal y los cortes del taller. Todo sale del motor y de los constructores
 * del PDF con el catálogo de muestra; aquí no se escribe ninguna cifra.
 */
import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { buildQuoteDocData, QUOTE_DOC_FALLBACK_PREFS, type QuoteDocData } from '@dekopen/documents'
import { computeBom, DEFAULT_CUT, DEFAULT_PRICING, planCuts, priceItem, type CutPlan, type PlanEntry, type QuoteExtra } from '@dekopen/engine'
import type { Quote, QuoteItem } from '@dekopen/shared'
import { sampleQuoteItems } from '../../documents/model/docData'

/** Color del taller de ejemplo: los documentos y el portal llevan el color de cada taller. */
export const SAMPLE_ACCENT = '#1F4E79'

const SAMPLE_DATE = '2026-11-02'

export interface SampleTexts {
  shop: string
  job: string
  client: string
  install: string
  rooms: readonly string[]
}

export interface SampleQuote {
  quote: Quote
  doc: QuoteDocData
  prices: Record<string, { unitNet: number; totalNet: number }>
  cuts: CutPlan
}

/** Arma la cotización de ejemplo en el idioma de la página. null si el motor no puede. */
export function buildSampleQuote(texts: SampleTexts): SampleQuote | null {
  try {
    const items: QuoteItem[] = sampleQuoteItems({ catalog: SAMPLE_CATALOG }).map((item, index) => ({ ...item, name: undefined, location: texts.rooms[index] ?? item.location }))
    if (!items.length) return null
    const extras: QuoteExtra[] = [{ id: 'instalacion', label: texts.install, amount: 0 }]
    const prices: SampleQuote['prices'] = {}
    const entries: PlanEntry[] = []
    let net = 0
    for (const item of items) {
      const bom = computeBom(item.design, SAMPLE_CATALOG)
      const price = priceItem(bom, item.design, SAMPLE_CATALOG, DEFAULT_PRICING)
      prices[item.id] = { unitNet: price.unitNet, totalNet: price.unitNet * item.qty }
      entries.push({ ref: item.ref, design: item.design, bom, qty: item.qty })
      net += price.unitNet * item.qty
    }
    // Instalación de ejemplo: una décima parte de las ventanas, redondeada a mil.
    extras[0]!.amount = Math.round(net / 10_000) * 1000
    const quote: Quote = {
      id: 'ejemplo',
      number: 412,
      title: texts.job,
      status: 'sent',
      client: { id: 'ejemplo', name: texts.client, createdAt: SAMPLE_DATE, updatedAt: SAMPLE_DATE },
      items,
      extras,
      discountPct: 0,
      revision: 1,
      version: 1,
      sentAt: SAMPLE_DATE,
      createdAt: SAMPLE_DATE,
      updatedAt: SAMPLE_DATE,
    }
    const doc = buildQuoteDocData({
      quote,
      org: { name: texts.shop, accent: SAMPLE_ACCENT },
      catalog: SAMPLE_CATALOG,
      client: { name: texts.client },
      date: SAMPLE_DATE,
      settings: { documents: QUOTE_DOC_FALLBACK_PREFS },
    })
    return { quote, doc, prices, cuts: planCuts(entries, SAMPLE_CATALOG, DEFAULT_CUT).plan }
  } catch (error) {
    if (import.meta.env.DEV) console.warn('[landing] No se pudo armar la cotización de ejemplo', error)
    return null
  }
}
