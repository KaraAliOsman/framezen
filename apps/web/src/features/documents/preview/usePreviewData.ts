/**
 * Datos con que se dibujan las vistas previas de plantillas: la última cotización del taller con
 * ventanas o, si no hay, una de ejemplo armada con sus propias líneas, colores y precios (marcada
 * como ejemplo). El catálogo usa las líneas activas. Todas las cifras salen del motor.
 */
import { useMemo } from 'react'
import { buildSampleQuoteDoc, type CatalogDocData, type QuoteDocData } from '@dekopen/documents'
import { computeLayout } from '@dekopen/engine'
import { useCatalog, useMe, useQuote, useQuotes, useSettings } from '../../../lib/hooks'
import { catalogDocFromCatalog, quoteDocFromQuote, sampleQuoteDoc, toDocOrg, type DocContext } from '../model/docData'
import { withDefaultPrefs } from '../model/prefs'

export type PreviewSource = { kind: 'quote'; id: string; number: number; title: string } | { kind: 'sample' }

export interface PreviewData {
  ready: boolean
  /** Cotización completa (vista previa grande). */
  quote: QuoteDocData | null
  /** Cotización corta (miniaturas: 3 ítems). */
  quoteThumb: QuoteDocData | null
  catalog: CatalogDocData | null
  catalogThumb: CatalogDocData | null
  source: PreviewSource
  currency: string
  taxLabel: string
  orgLocale: string
}

export function usePreviewData(options: { useLatest?: boolean; wantCatalog?: boolean } = {}): PreviewData {
  const useLatest = options.useLatest ?? true
  const me = useMe()
  const org = me.data?.org
  const settings = useSettings()
  const catalog = useCatalog()
  const quotes = useQuotes({}, { enabled: useLatest })
  const latestId = useLatest ? quotes.data?.find((q) => q.units > 0)?.id : undefined
  const latest = useQuote(latestId)

  const ctx = useMemo<DocContext | null>(() => {
    if (!catalog.data || !settings.data || !org) return null
    return {
      catalog: catalog.data,
      pricing: settings.data.pricing,
      cut: settings.data.cut,
      org: toDocOrg(org),
      defaults: settings.data.defaults,
      prefs: withDefaultPrefs(settings.data.documents),
    }
  }, [catalog.data, settings.data, org])

  const quote = useMemo(() => {
    if (!ctx) return null
    if (latest.data?.items.length) {
      try {
        return {
          source: { kind: 'quote' as const, id: latest.data.id, number: latest.data.number, title: latest.data.title },
          full: quoteDocFromQuote(latest.data, ctx),
          thumb: quoteDocFromQuote({ ...latest.data, items: latest.data.items.slice(0, 3) }, ctx),
        }
      } catch {
        /* una cotización con datos raros no rompe la vista previa: seguimos con el ejemplo */
      }
    }
    const sample = sampleQuoteDoc(ctx)
    if (sample) return { source: { kind: 'sample' as const }, full: sample, thumb: sampleQuoteDoc(ctx, { items: 3 }) ?? sample }
    const fallback = buildSampleQuoteDoc({ layout: computeLayout, org: ctx.org, prefs: ctx.prefs })
    return { source: { kind: 'sample' as const }, full: fallback, thumb: buildSampleQuoteDoc({ layout: computeLayout, org: ctx.org, prefs: ctx.prefs, items: 3 }) }
  }, [ctx, latest.data])

  const wantCatalog = options.wantCatalog ?? true
  const catalogDocs = useMemo(() => {
    if (!ctx || !wantCatalog) return null
    const lineIds = ctx.catalog.lines.filter((l) => l.completeness !== 'partial').map((l) => l.id)
    const ids = lineIds.length ? lineIds : ctx.catalog.lines.map((l) => l.id)
    return { full: catalogDocFromCatalog(ctx, { lineIds: ids }), thumb: catalogDocFromCatalog(ctx, { lineIds: ids.slice(0, 2), maxTypologies: 6 }) }
  }, [ctx, wantCatalog])

  return {
    ready: Boolean(ctx) && !(latestId && latest.isLoading),
    quote: quote?.full ?? null,
    quoteThumb: quote?.thumb ?? null,
    catalog: catalogDocs?.full ?? null,
    catalogThumb: catalogDocs?.thumb ?? null,
    source: quote?.source ?? { kind: 'sample' },
    currency: settings.data?.currency ?? org?.currency ?? 'CLP',
    taxLabel: settings.data?.taxLabel ?? 'IVA',
    orgLocale: settings.data?.locale ?? org?.locale ?? 'es',
  }
}
