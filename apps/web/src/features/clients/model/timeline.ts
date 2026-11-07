/**
 * Historial de un cliente armado con sus propios datos (fechas guardadas de la ficha y de sus
 * cotizaciones): sin pedir nada extra al servidor y en cualquier idioma, porque devuelve claves y
 * parámetros, no frases. Solo afirma lo que consta: creada, enviada y aceptada tienen fecha propia;
 * los estados posteriores (taller, instalada, rechazada, cerrada) se muestran como «estado actual»
 * con la fecha de la última novedad, nunca como si se supiera el momento exacto del cambio.
 */
import type { Client, QuoteStatus, QuoteSummary } from '@dekopen/shared'

export type TimelineKind = 'client_created' | 'quote_created' | 'quote_sent' | 'quote_accepted' | 'quote_status'

export interface TimelineEvent {
  /** Clave estable para React. */
  id: string
  kind: TimelineKind
  at: string
  quoteId?: string
  quoteNumber?: number
  quoteTitle?: string
  /** Solo en `quote_status`: el estado actual. */
  status?: QuoteStatus
}

/** Estados que no tienen fecha propia guardada: se muestran como estado actual. */
const CURRENT_ONLY: ReadonlySet<QuoteStatus> = new Set(['workshop', 'installed', 'rejected', 'closed'])

const time = (iso: string | undefined) => {
  const t = iso ? Date.parse(iso) : Number.NaN
  return Number.isFinite(t) ? t : null
}

export function buildClientTimeline(
  client: Pick<Client, 'id' | 'createdAt'>,
  quotes: readonly Pick<QuoteSummary, 'id' | 'number' | 'title' | 'status' | 'createdAt' | 'updatedAt' | 'sentAt' | 'acceptedAt'>[],
): TimelineEvent[] {
  const events: TimelineEvent[] = []
  if (time(client.createdAt) !== null) events.push({ id: `client:${client.id}`, kind: 'client_created', at: client.createdAt })
  for (const q of quotes) {
    const base = { quoteId: q.id, quoteNumber: q.number, quoteTitle: q.title || undefined }
    if (time(q.createdAt) !== null) events.push({ id: `${q.id}:created`, kind: 'quote_created', at: q.createdAt, ...base })
    if (q.sentAt && time(q.sentAt) !== null) events.push({ id: `${q.id}:sent`, kind: 'quote_sent', at: q.sentAt, ...base })
    if (q.acceptedAt && time(q.acceptedAt) !== null) events.push({ id: `${q.id}:accepted`, kind: 'quote_accepted', at: q.acceptedAt, ...base })
    if (CURRENT_ONLY.has(q.status) && time(q.updatedAt) !== null) {
      events.push({ id: `${q.id}:status`, kind: 'quote_status', at: q.updatedAt, status: q.status, ...base })
    }
  }
  // Lo más nuevo arriba; a igual hora, el paso posterior primero (aceptada antes que enviada).
  const rank: Record<TimelineKind, number> = { quote_status: 0, quote_accepted: 1, quote_sent: 2, quote_created: 3, client_created: 4 }
  return events.sort((a, b) => (time(b.at) ?? 0) - (time(a.at) ?? 0) || rank[a.kind] - rank[b.kind])
}

/** Totales de la ficha: lo aceptado lo trae el servidor; «en curso» = borradores y enviadas. */
export function inPlayTotal(quotes: readonly Pick<QuoteSummary, 'status' | 'total'>[]): number {
  return quotes.reduce((sum, q) => (q.status === 'draft' || q.status === 'sent' ? sum + Math.max(0, Number(q.total) || 0) : sum), 0)
}
