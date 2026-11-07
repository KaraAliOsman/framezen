/**
 * Intérprete local del panel con los datos reales de la persona (clientes, cotizaciones, catálogo,
 * plantillas, asistentes y la cotización abierta). Se rehace solo cuando cambian el idioma, la
 * pantalla o esos datos; el motor memoiza sus índices por versión de datos.
 */
import { useMemo, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router'
import type { Catalog } from '@dekopen/engine'
import {
  DOC_PRESET_IDS,
  presetKind,
  presetName,
  type AssistantProfile,
  type NluCatalog,
  type NluEntities,
  type NluStatsData,
  type QuoteSummary,
} from '@dekopen/shared'
import { api } from '../../../lib/api'
import { useClients, useQuotes } from '../../../lib/hooks'
import { useLocale, useOrgCurrency } from '../../../lib/i18n'
import { qk } from '../../../lib/queryClient'
import { useTemplates } from '../../documents/api'
import { getQuoteEditor, onQuoteEditorChange } from '../bridge'
import { suggestionsFor } from '../suggestions'
import type { LocalInterpreter } from './interpreter'
import { createNluInterpreter } from './nluInterpreter'

const toList = <T,>(data: T[] | { items: T[] } | undefined | null): T[] => (Array.isArray(data) ? data : (data?.items ?? []))

/** Más cotizaciones que esto: las estadísticas locales no son completas y la pregunta va a la IA. */
const STATS_LIMIT = 300

function toStats(quotes: readonly QuoteSummary[]): NluStatsData {
  return {
    complete: quotes.length < STATS_LIMIT,
    quotes: quotes.map((q) => ({
      id: q.id,
      number: q.number,
      title: q.title,
      ...(q.clientName ? { clientName: q.clientName } : {}),
      status: q.status,
      total: q.total,
      createdAt: q.createdAt,
      ...(q.sentAt ? { sentAt: q.sentAt } : {}),
      ...(q.acceptedAt ? { acceptedAt: q.acceptedAt } : {}),
    })),
  }
}

export function useLocalInterpreter(enabled: boolean, assistants: readonly AssistantProfile[] = []): LocalInterpreter {
  const { locale } = useLocale()
  const currency = useOrgCurrency()
  const { pathname } = useLocation()
  const bridge = useSyncExternalStore(onQuoteEditorChange, getQuoteEditor, () => null)
  const clients = useClients('', { enabled })
  const quotes = useQuotes({}, { enabled })
  const catalog = useQuery({ queryKey: qk.catalog, queryFn: api.catalog.get, enabled: enabled && !bridge, staleTime: 5 * 60_000 })
  const templates = useTemplates({ enabled })

  const catalogVersion = `${bridge?.quoteId ?? 'org'}:${catalog.dataUpdatedAt}`
  const nluCatalog = useMemo<NluCatalog>(() => {
    const cat: Catalog | undefined = bridge?.getCatalog() ?? catalog.data
    return {
      version: catalogVersion,
      lines: (cat?.lines ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        kind: l.kind,
        ...(l.typologyIds.length ? { typologyIds: l.typologyIds } : {}),
        ...(l.colorIds.length ? { colorIds: l.colorIds } : {}),
      })),
      colors: (cat?.colors ?? []).map((c) => ({ id: c.id, name: c.name, ...(c.code ? { code: c.code } : {}), ...(c.texture?.kind === 'builtin' ? { textureId: c.texture.id } : {}) })),
      glass: (cat?.glass ?? []).map((g) => ({ id: g.id, name: g.name, kind: g.kind, thickness: g.thickness, ...(g.composition ? { composition: g.composition } : {}) })),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge, catalog.data, catalogVersion])

  const quoteList = useMemo(() => toList(quotes.data), [quotes.data])
  const entitiesVersion = `${clients.dataUpdatedAt}:${quotes.dataUpdatedAt}:${templates.dataUpdatedAt}:${assistants.map((a) => `${a.id}${a.name}`).join(',')}:${locale}`
  const entities = useMemo<NluEntities>(() => {
    const own = templates.data?.templates ?? []
    const presets = DOC_PRESET_IDS.map((id) => ({ id, name: presetName(id, locale), kind: presetKind(id), preset: true }))
    return {
      version: entitiesVersion,
      clients: toList(clients.data).map((c) => ({
        id: c.id,
        name: c.name,
        ...(c.email ? { email: c.email } : {}),
        ...(c.phone ? { phone: c.phone } : {}),
        ...(c.rut ? { rut: c.rut } : {}),
        ...(c.city ? { city: c.city } : {}),
      })),
      quotes: quoteList.map((q) => ({
        id: q.id,
        number: q.number,
        title: q.title,
        ...(q.clientName ? { clientName: q.clientName } : {}),
        status: q.status,
        updatedAt: q.updatedAt,
      })),
      templates: [...own.map((t) => ({ id: t.id, name: t.name, kind: t.kind })), ...presets],
      assistants: assistants.map((a) => ({ id: a.id, name: a.name })),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entitiesVersion])

  const stats = useMemo(() => (quotes.data ? toStats(quoteList) : undefined), [quotes.data, quoteList])

  return useMemo(
    () => createNluInterpreter({ locale, route: pathname, bridge, catalog: nluCatalog, entities, ...(stats ? { stats } : {}), ...(currency ? { currency } : {}), ideas: suggestionsFor(pathname, bridge) }),
    [locale, pathname, bridge, nluCatalog, entities, stats, currency],
  )
}
