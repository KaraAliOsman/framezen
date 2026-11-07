/**
 * Respuestas de estadísticas con los datos que entrega la pantalla (`ctx.stats`), sin servidor ni IA.
 *
 * Definiciones (investigación 24 §9): «vendí» = cotizaciones aceptadas o posteriores (taller,
 * instalada, cerrada) con fecha de aceptación en el período; los períodos son de calendario en la
 * zona horaria del negocio y semiabiertos («este mes» = del día 1 local al día 1 del mes siguiente,
 * no los últimos 30 días); las semanas empiezan el lunes.
 */
import { formatList } from '../i18n/format'
import type { Clause } from './clause'
import { capitalize, fmt, monthName, tr, type GEnv } from './env'
import type { NluStatsQuote } from './types'

export type PeriodKey = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'month' | 'all'

export interface Period {
  key: PeriodKey
  month?: number
  year?: number
}

const SOLD = new Set(['accepted', 'workshop', 'installed', 'closed'])
const DECIDED = new Set(['sent', 'accepted', 'rejected', 'workshop', 'installed', 'closed'])
const PERIOD_CONCEPTS: readonly [string, PeriodKey][] = [
  ['per.today', 'today'],
  ['per.yesterday', 'yesterday'],
  ['per.this_week', 'this_week'],
  ['per.last_week', 'last_week'],
  ['per.this_month', 'this_month'],
  ['per.last_month', 'last_month'],
  ['per.this_year', 'this_year'],
  ['per.last_year', 'last_year'],
  ['per.all', 'all'],
]

/** Período nombrado en la cláusula (marca sus átomos), o null. */
export function readPeriod(c: Clause): Period | null {
  for (const [concept, key] of PERIOD_CONCEPTS) {
    const i = c.find(concept)
    if (i >= 0) {
      c.use(i)
      return { key }
    }
  }
  for (let m = 1; m <= 12; m++) {
    const i = c.find(`per.m${m}`)
    if (i < 0) continue
    c.use(i)
    // «octubre de 2025», «octubre 2025»
    let year: number | undefined
    for (let k = i + 1; k < Math.min(c.to, i + 3); k++) {
      const v = c.num(k)
      if (v !== undefined && v >= 2000 && v <= 2100 && Number.isInteger(v)) {
        year = v
        c.use(k)
        break
      }
      if (!c.isFiller(k)) break
    }
    return { key: 'month', month: m, year }
  }
  return null
}

// ── Fechas de calendario en la zona del negocio ─────────────────────────────

const partsFormatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(timeZone)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' })
    } catch {
      f = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' })
    }
    partsFormatters.set(timeZone, f)
  }
  return f
}

interface Ymd {
  y: number
  m: number
  d: number
}

function localYmd(date: Date, timeZone: string): Ymd | null {
  if (Number.isNaN(date.getTime())) return null
  let y = 0
  let m = 0
  let d = 0
  for (const p of formatterFor(timeZone).formatToParts(date)) {
    if (p.type === 'year') y = Number(p.value)
    else if (p.type === 'month') m = Number(p.value)
    else if (p.type === 'day') d = Number(p.value)
  }
  return y ? { y, m, d } : null
}

const key = (v: Ymd) => v.y * 10000 + v.m * 100 + v.d

function shift(v: Ymd, days: number): Ymd {
  const t = new Date(Date.UTC(v.y, v.m - 1, v.d + days))
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }
}

/** Rango [desde, hasta) en claves AAAAMMDD locales; null = sin límites. */
export function periodRange(period: Period, now: Date, timeZone: string): [number, number] | null {
  const today = localYmd(now, timeZone) ?? { y: now.getUTCFullYear(), m: now.getUTCMonth() + 1, d: now.getUTCDate() }
  const weekday = (new Date(Date.UTC(today.y, today.m - 1, today.d)).getUTCDay() + 6) % 7 // lunes = 0
  switch (period.key) {
    case 'all':
      return null
    case 'today':
      return [key(today), key(shift(today, 1))]
    case 'yesterday':
      return [key(shift(today, -1)), key(today)]
    case 'this_week': {
      const start = shift(today, -weekday)
      return [key(start), key(shift(start, 7))]
    }
    case 'last_week': {
      const start = shift(today, -weekday - 7)
      return [key(start), key(shift(start, 7))]
    }
    case 'this_month':
      return [key({ y: today.y, m: today.m, d: 1 }), key(today.m === 12 ? { y: today.y + 1, m: 1, d: 1 } : { y: today.y, m: today.m + 1, d: 1 })]
    case 'last_month': {
      const start = today.m === 1 ? { y: today.y - 1, m: 12, d: 1 } : { y: today.y, m: today.m - 1, d: 1 }
      return [key(start), key({ y: today.y, m: today.m, d: 1 })]
    }
    case 'this_year':
      return [key({ y: today.y, m: 1, d: 1 }), key({ y: today.y + 1, m: 1, d: 1 })]
    case 'last_year':
      return [key({ y: today.y - 1, m: 1, d: 1 }), key({ y: today.y, m: 1, d: 1 })]
    case 'month': {
      const m = period.month ?? today.m
      const y = period.year ?? (m > today.m ? today.y - 1 : today.y)
      return [key({ y, m, d: 1 }), key(m === 12 ? { y: y + 1, m: 1, d: 1 } : { y, m: m + 1, d: 1 })]
    }
  }
}

function inRange(iso: string | undefined, range: [number, number] | null, timeZone: string): boolean {
  if (!range) return true
  if (!iso) return false
  const v = localYmd(new Date(iso), timeZone)
  if (!v) return false
  const k = key(v)
  return k >= range[0] && k < range[1]
}

export function periodLabel(g: GEnv, period: Period): string {
  if (period.key === 'month') {
    const name = monthName(g.locale, period.month ?? 1)
    const today = localYmd(g.now, g.timeZone)
    const text = period.year && period.year !== today?.y ? `${name} ${period.year}` : name
    return tr(g, 'period.month', { month: text })
  }
  return tr(g, `period.${period.key}`)
}

// ── Cálculos ────────────────────────────────────────────────────────────────

export type StatKind = 'sales' | 'count' | 'conversion' | 'pending' | 'top' | 'average'

export interface StatsQuery {
  kind: StatKind
  period: Period
  /** Estado pedido («aceptadas», «enviadas»). */
  status?: string
  /** Ranking de clientes en vez de tipologías. */
  clients?: boolean
  /** «más vendida» = solo aceptadas. */
  sold?: boolean
}

function soldDate(q: NluStatsQuote): string | undefined {
  return q.acceptedAt ?? q.sentAt ?? q.createdAt
}

function partialNote(g: GEnv): string {
  const s = g.ctx.stats
  return s && s.complete === false ? ` ${tr(g, 'reply.statsPartial', { count: s.quotes.length })}` : ''
}

function finish(g: GEnv, text: string): string {
  return capitalize(text, g.locale) + partialNote(g)
}

function list(g: GEnv, items: readonly string[], max = 3): string {
  if (items.length <= max) return formatList(items, { locale: g.locale })
  return `${items.slice(0, max).join(', ')} ${tr(g, 'reply.more', { count: items.length - max })}`
}

/** Respuesta localizada para una consulta de estadísticas (requiere `ctx.stats`). */
export function answerStats(g: GEnv, query: StatsQuery): string {
  const quotes = g.ctx.stats?.quotes ?? []
  const range = periodRange(query.period, g.now, g.timeZone)
  const period = periodLabel(g, query.period)
  const tz = g.timeZone
  switch (query.kind) {
    case 'sales': {
      const sold = quotes.filter((q) => SOLD.has(q.status) && inRange(soldDate(q), range, tz))
      if (!sold.length) return finish(g, tr(g, 'reply.statsSalesNone', { period }))
      const amount = sold.reduce((s, q) => s + (q.total ?? 0), 0)
      return finish(g, tr(g, 'reply.statsSales', { period, amount: fmt.money(g, amount), count: sold.length }))
    }
    case 'count': {
      const pool = quotes.filter((q) => inRange(q.createdAt, range, tz) && (!query.status || q.status === query.status || (query.status === 'accepted' && SOLD.has(q.status))))
      if (query.status) return finish(g, tr(g, 'reply.statsCountStatus', { period, count: pool.length, status: g.glossary.quoteStatusLabel(query.status, g.locale).toLocaleLowerCase() }))
      return finish(g, tr(g, 'reply.statsCount', { period, count: pool.length }))
    }
    case 'conversion': {
      const sent = quotes.filter((q) => DECIDED.has(q.status) && inRange(q.sentAt ?? q.createdAt, range, tz))
      if (!sent.length) return finish(g, tr(g, 'reply.statsConversionNone', { period }))
      const accepted = sent.filter((q) => SOLD.has(q.status)).length
      return finish(g, tr(g, 'reply.statsConversion', { period, rate: fmt.pct(g, Math.round((accepted / sent.length) * 1000) / 10), accepted, sent: sent.length }))
    }
    case 'pending': {
      const pending = quotes.filter((q) => q.status === 'sent' && inRange(q.sentAt ?? q.createdAt, range, tz)).sort((a, b) => String(a.sentAt ?? a.createdAt).localeCompare(String(b.sentAt ?? b.createdAt)))
      if (!pending.length) return finish(g, tr(g, 'reply.statsPendingNone'))
      const amount = pending.reduce((s, q) => s + (q.total ?? 0), 0)
      const names = pending.map((q) => [q.number !== undefined ? tr(g, 'sum.quoteRef', { number: q.number }) : '', q.clientName ?? q.title ?? ''].filter(Boolean).join(' · '))
      return finish(g, tr(g, 'reply.statsPending', { count: pending.length, amount: fmt.money(g, amount), list: list(g, names) }))
    }
    case 'top': {
      const sold = query.sold || query.clients
      const pool = quotes.filter((q) => (sold ? SOLD.has(q.status) && inRange(soldDate(q), range, tz) : inRange(q.createdAt, range, tz)))
      const counts = new Map<string, number>()
      if (query.clients) {
        for (const q of pool) if (q.clientName) counts.set(q.clientName, (counts.get(q.clientName) ?? 0) + (q.total ?? 0))
      } else {
        for (const q of pool) for (const it of q.items ?? []) if (it.typology) counts.set(it.typology, (counts.get(it.typology) ?? 0) + (it.qty ?? 1))
      }
      const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      if (!ranked.length) return finish(g, tr(g, 'reply.statsTopNone', { period }))
      if (query.clients) return finish(g, tr(g, 'reply.statsTopClients', { period, list: list(g, ranked.map(([name, total]) => `${name} (${fmt.money(g, total)})`)) }))
      const names = ranked.map(([id, n]) => `${g.glossary.typologyName(id, g.locale)} (${n})`)
      return finish(g, tr(g, query.sold ? 'reply.statsTopSold' : 'reply.statsTop', { period, list: list(g, names) }))
    }
    case 'average': {
      const sold = quotes.filter((q) => SOLD.has(q.status) && inRange(soldDate(q), range, tz) && q.total !== undefined)
      if (sold.length) return finish(g, tr(g, 'reply.statsAverage', { period, amount: fmt.money(g, sold.reduce((s, q) => s + q.total!, 0) / sold.length), count: sold.length }))
      const all = quotes.filter((q) => inRange(q.createdAt, range, tz) && q.total !== undefined)
      if (!all.length) return finish(g, tr(g, 'reply.statsAverageNone', { period }))
      return finish(g, tr(g, 'reply.statsAverageAll', { period, amount: fmt.money(g, all.reduce((s, q) => s + q.total!, 0) / all.length), count: all.length }))
    }
  }
}
