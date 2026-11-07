/**
 * Lista de OT: fechas comprometidas, filtros, búsqueda, orden y resumen del taller.
 * Funciones puras (fáciles de probar); la página solo las conecta con los datos.
 */
import { intlTag, type Locale, type WorkOrder } from '@dekopen/shared'
import { normalizeSearch } from '../../../lib/format'
import { getLocale, translate } from '../../../lib/i18n'
import es from '../i18n/es'
import { orderProgress, stationIndex, stationOf } from './stations'

const TIME_ZONE = 'America/Santiago'
const DAY = 86_400_000
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']

/** Fecha calendario de hoy en Chile («2026-10-31»). */
export function todayIn(now: Date = new Date(), timeZone = TIME_ZONE): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    const text = `${get('year')}-${get('month')}-${get('day')}`
    if (ISO_DATE.test(text)) return text
  } catch {
    // sigue abajo
  }
  return now.toISOString().slice(0, 10)
}

function toUtcDay(iso: string): number | null {
  const m = ISO_DATE.exec(iso)
  if (!m) return null
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** Días entre hoy y la fecha (negativo = ya pasó). */
export function daysUntil(dueDate: string, now: Date = new Date()): number | null {
  const due = toUtcDay(dueDate)
  const today = toUtcDay(todayIn(now))
  if (due === null || today === null) return null
  return Math.round((due - today) / DAY)
}

/** «15-11-2026». */
export function shortDate(iso: string): string {
  const m = ISO_DATE.exec(iso)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso
}

/**
 * «15 nov» (o «15 nov 2027» si no es este año). En español, el formato corto de siempre; en los
 * demás idiomas, el del idioma («Nov 15», «15. Nov.», «15 Kas»).
 */
export function friendlyDate(iso: string, now: Date = new Date(), locale: Locale = getLocale()): string {
  const m = ISO_DATE.exec(iso)
  if (!m) return iso
  const sameYear = todayIn(now).slice(0, 4) === m[1]
  if (locale === 'es') {
    const month = MONTHS[Number(m[2]) - 1] ?? m[2]
    return `${Number(m[3])} ${month}${sameYear ? '' : ` ${m[1]}`}`
  }
  try {
    const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
    return new Intl.DateTimeFormat(intlTag(locale), { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), timeZone: 'UTC' }).format(date)
  } catch {
    return shortDate(iso)
  }
}

export type DueTone = 'none' | 'calm' | 'soon' | 'late' | 'done'

export interface DueInfo {
  tone: DueTone
  /** «Atrasada 2 días», «Vence hoy», «Mañana», «En 5 días», «Por definir». */
  label: string
  /** «15 nov». */
  date: string | null
  days: number | null
  /** Idioma de los textos. */
  locale: Locale
}

/** Días que se marcan como «pronto» (ámbar). */
export const DUE_SOON_DAYS = 2

/** Cómo va la fecha comprometida. Una OT lista no se marca atrasada. */
export function dueInfo(dueDate: string | undefined | null, opts: { now?: Date; done?: boolean; locale?: Locale } = {}): DueInfo {
  const now = opts.now ?? new Date()
  const locale = opts.locale ?? getLocale()
  const t = (key: 'due.none' | 'due.late' | 'due.today' | 'due.tomorrow' | 'due.inDays', count?: number) =>
    translate(es, key, count === undefined ? undefined : { count }, locale)
  if (!dueDate || !ISO_DATE.test(dueDate)) return { tone: 'none', label: t('due.none'), date: null, days: null, locale }
  const days = daysUntil(dueDate, now)
  const date = friendlyDate(dueDate, now, locale)
  if (days === null) return { tone: 'none', label: t('due.none'), date: null, days: null, locale }
  if (opts.done) return { tone: 'done', label: date, date, days, locale }
  if (days < 0) return { tone: 'late', label: t('due.late', Math.abs(days)), date, days, locale }
  if (days === 0) return { tone: 'soon', label: t('due.today'), date, days, locale }
  if (days === 1) return { tone: 'soon', label: t('due.tomorrow'), date, days, locale }
  return { tone: days <= DUE_SOON_DAYS ? 'soon' : 'calm', label: t('due.inDays', days), date, days, locale }
}

/**
 * La entrega en una frase que se entiende sola, para la tarjeta del teléfono (no tiene la
 * columna «Entrega»): «Entrega en 5 días», «Entrega hoy», «Atrasada 2 días», «Entrega por definir».
 */
export function dueSentence(due: DueInfo): string {
  const t = (key: 'due.sentence.none' | 'due.sentence.date' | 'due.sentence.today' | 'due.sentence.tomorrow' | 'due.sentence.inDays', params?: Record<string, string | number>) =>
    translate(es, key, params, due.locale)
  if (due.tone === 'none' || due.days === null) return t('due.sentence.none')
  if (due.tone === 'late') return due.label
  if (due.tone === 'done') return t('due.sentence.date', { date: due.date ?? '' }).trim()
  if (due.days === 0) return t('due.sentence.today')
  if (due.days === 1) return t('due.sentence.tomorrow')
  return t('due.sentence.inDays', { count: due.days })
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtros y orden
// ─────────────────────────────────────────────────────────────────────────────

export type OrderFilter = 'open' | 'done' | 'all'

/** Filtros de la lista (el texto sale de `page.filter.<valor>`). */
export const ORDER_FILTERS: readonly OrderFilter[] = ['open', 'done', 'all']

export function matchesFilter(order: WorkOrder, filter: OrderFilter): boolean {
  if (filter === 'all') return true
  return filter === 'done' ? order.status === 'done' : order.status !== 'done'
}

/** Busca por número de OT o de cotización, obra o cliente (sin tildes). */
export function matchesQuery(order: WorkOrder, query: string): boolean {
  const q = normalizeSearch(query.replace(/^(ot|n°|nº|no\.?)\s*/i, ''))
  if (!q) return true
  const haystack = normalizeSearch(
    [`ot ${order.number}`, String(order.number), `cotizacion ${order.quoteNumber}`, order.title, order.clientName ?? ''].join(' · '),
  )
  return q.split(/\s+/).every((word) => haystack.includes(word))
}

/**
 * Orden de trabajo del taller: primero lo atrasado, luego por fecha comprometida (sin
 * fecha al final) y, a igual fecha, la OT más nueva. Las listas van por última novedad.
 */
export function sortOrders(orders: readonly WorkOrder[], now: Date = new Date()): WorkOrder[] {
  const rank = (o: WorkOrder) => {
    if (o.status === 'done') return { group: 2, key: -new Date(o.updatedAt).getTime() || 0 }
    const days = o.dueDate ? daysUntil(o.dueDate, now) : null
    return { group: days === null ? 1 : 0, key: days ?? 0 }
  }
  return [...orders].sort((a, b) => {
    const ra = rank(a)
    const rb = rank(b)
    return ra.group - rb.group || ra.key - rb.key || b.number - a.number
  })
}

export function filterOrders(orders: readonly WorkOrder[], filter: OrderFilter, query: string, now: Date = new Date()): WorkOrder[] {
  return sortOrders(
    orders.filter((o) => matchesFilter(o, filter) && matchesQuery(o, query)),
    now,
  )
}

export function filterCounts(orders: readonly WorkOrder[]): Record<OrderFilter, number> {
  return {
    open: orders.filter((o) => o.status !== 'done').length,
    done: orders.filter((o) => o.status === 'done').length,
    all: orders.length,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resumen del taller
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkshopOverview {
  /** OT en taller (no listas). */
  open: number
  /** Ventanas que aún no están listas, en todas las OT. */
  windowsInProcess: number
  /** OT con entrega en los próximos 7 días. */
  dueThisWeek: number
  /** OT atrasadas. */
  late: number
}

export function workshopOverview(orders: readonly WorkOrder[], now: Date = new Date()): WorkshopOverview {
  let open = 0
  let windowsInProcess = 0
  let dueThisWeek = 0
  let late = 0
  for (const o of orders) {
    if (o.status === 'done') continue
    open += 1
    const refs = Object.keys(o.progress ?? {})
    windowsInProcess += refs.filter((ref) => stationIndex(stationOf(o.progress, ref)) < stationIndex('ready')).length
    const days = o.dueDate ? daysUntil(o.dueDate, now) : null
    if (days !== null && days < 0) late += 1
    else if (days !== null && days <= 7) dueThisWeek += 1
  }
  return { open, windowsInProcess, dueThisWeek, late }
}

/** Avance de una OT de la lista (sin la cotización a mano: por las refs del avance). */
export function listProgress(order: WorkOrder) {
  return orderProgress(order.progress)
}

/** «1 ventana», «4 ventanas». */
export function windowsLabel(n: number, locale?: Locale): string {
  return translate(es, 'common.windows', { count: n }, locale)
}
