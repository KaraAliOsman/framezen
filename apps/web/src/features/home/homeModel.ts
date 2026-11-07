/**
 * Lógica pura de Inicio: saludo, cifras del mes y la cola de lo que toca hacer.
 * Sin React ni red: se prueba en homeModel.test.ts. Los textos salen del espacio `features/home`
 * en el idioma de la interfaz (o en el que se pida, p. ej. el de los documentos para el WhatsApp).
 */
import { catalogReadiness } from '@dekopen/catalog'
import type { Catalog } from '@dekopen/engine'
import { intlTag, type Locale, type QuoteFollowUp, type QuoteStats, type QuoteStatus, type QuoteSummary } from '@dekopen/shared'
import { getFormatter, getLocale, translate } from '../../lib/i18n'
import es from './i18n/es'

export const CHILE_TZ = 'America/Santiago'

// ── Saludo ───────────────────────────────────────────────────────────────────

export type GreetingKey = keyof Omit<typeof es.greeting, 'withName'>

/** Hora (0–23) en Chile, sin depender de la zona del navegador. */
export function hourIn(now: Date, timeZone = CHILE_TZ): number {
  const text = new Intl.DateTimeFormat('es-CL', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now)
  const hour = Number(text.replace(/\D/g, ''))
  return Number.isFinite(hour) ? hour % 24 : now.getHours()
}

/** Momento del día: mañana (5–11), tarde (12–19) o noche (20–4). */
export function greetingKey(now: Date = new Date(), timeZone = CHILE_TZ): GreetingKey {
  const hour = hourIn(now, timeZone)
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 20) return 'afternoon'
  return 'evening'
}

/** «Buenos días» (5–11), «Buenas tardes» (12–19), «Buenas noches» (20–4), en el idioma pedido. */
export function greeting(now: Date = new Date(), timeZone = CHILE_TZ, locale: Locale = getLocale()): string {
  return translate(es, `greeting.${greetingKey(now, timeZone)}`, undefined, locale)
}

/** «sábado, 31 de octubre» (para la línea sobre el saludo), en el idioma pedido. */
export function todayLabel(now: Date = new Date(), timeZone = CHILE_TZ, locale: Locale = getLocale()): string {
  return new Intl.DateTimeFormat(intlTag(locale), { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(now)
}

// ── Cifras ───────────────────────────────────────────────────────────────────

export type { QuoteStats }

/** Enlace a la lista de cotizaciones filtrada por estado (contrato con la zona de cotizaciones). */
export function quotesListLink(status: QuoteStatus): string {
  return `/cotizaciones?estado=${status}`
}

/** Cuenta sin ninguna cotización (ni siquiera rechazadas o cerradas): mostramos la bienvenida. */
export function isEmptyAccount(stats: Pick<QuoteStats, 'byStatus'> | null | undefined): boolean {
  if (!stats?.byStatus) return false
  return Object.values(stats.byStatus).every((s) => !s || Number(s.count) === 0)
}

/** «2026-10» en hora de Chile. */
export function monthKey(date: Date, timeZone = CHILE_TZ): string {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', timeZone }).formatToParts(date)
  const year = parts.find((p) => p.type === 'year')?.value ?? '0000'
  const month = parts.find((p) => p.type === 'month')?.value ?? '00'
  return `${year}-${month}`
}

/** Mes anterior a una clave «aaaa-mm». */
export function previousMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 2, 15))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/** Nombre del mes: «septiembre» (en el idioma pedido). */
export function monthName(key: string, locale: Locale = getLocale()): string {
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat(intlTag(locale), { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 15)))
}

/** Variación porcentual frente al mes anterior; undefined si el mes anterior fue $0. */
export function salesDelta(stats: Pick<QuoteStats, 'soldThisMonth' | 'soldLastMonth'>): number | undefined {
  const last = stats.soldLastMonth?.total ?? 0
  return last > 0 ? ((stats.soldThisMonth.total - last) / last) * 100 : undefined
}

/**
 * Lo vendido del mes se reparte en lo que sigue en «Aceptadas» y lo que ya pasó a taller. Una venta
 * no deja de serlo al pasar a taller, pero sí sale del estado «aceptada»: sin este reparto, Inicio
 * decía «1 aceptada» mientras la lista de Aceptadas estaba vacía. Por eso el enlace lleva a donde
 * están: si todas pasaron a taller, a Taller; si no, a Aceptadas.
 */
export function soldBreakdown(sold: QuoteStats['soldThisMonth']): { waiting: number; inProduction: number; to: string } {
  const inProduction = Math.min(sold.count, Math.max(0, sold.inProduction ?? 0))
  const waiting = sold.count - inProduction
  return { waiting, inProduction, to: inProduction > 0 && waiting === 0 ? '/taller' : quotesListLink('accepted') }
}

// ── Cola de seguimiento ──────────────────────────────────────────────────────

const DAY = 86_400_000

export type QueueReason = 'changes' | 'accepted' | 'viewed' | 'unopened' | 'sentPdf'

/** El orden de la cola: lo que el cliente ya movió va antes que lo que hay que ir a buscar. */
export const QUEUE_ORDER: readonly QueueReason[] = ['changes', 'accepted', 'viewed', 'unopened', 'sentPdf']

/** Por qué una cotización está en la cola. */
export function queueReason(q: Pick<QuoteFollowUp, 'notices' | 'viewedAt' | 'sentFormat'>): QueueReason {
  if (q.notices?.some((n) => n.kind === 'changes')) return 'changes'
  if (q.notices?.some((n) => n.kind === 'accepted')) return 'accepted'
  if (q.viewedAt) return 'viewed'
  // Un PDF no avisa si lo abrieron: «sin abrir» sería afirmar algo que no se sabe.
  return q.sentFormat === 'pdf' ? 'sentPdf' : 'unopened'
}

/** La cola en orden; dentro de cada motivo se respeta lo que mandó el servidor (lo más antiguo arriba). */
export function buildQueue<T extends Pick<QuoteFollowUp, 'notices' | 'viewedAt'>>(followUps: readonly T[]): T[] {
  const rank = (q: T) => QUEUE_ORDER.indexOf(queueReason(q))
  return followUps.map((q, i) => ({ q, i })).sort((a, b) => rank(a.q) - rank(b.q) || a.i - b.i).map(({ q }) => q)
}

/** Quién respondió: el nombre que escribió en el portal o el cliente de la cotización. */
export function whoAnswered(q: Pick<QuoteFollowUp, 'notices' | 'clientName'>): string {
  return q.notices?.[0]?.who?.trim() || q.clientName?.trim() || ''
}

/** Mensajes del cliente sin atender, enteros, el más nuevo primero. */
export function clientMessages(q: Pick<QuoteFollowUp, 'notices'>): string[] {
  return (q.notices ?? []).flatMap((n) => (n.kind === 'changes' && n.message ? [n.message] : []))
}

/** Días a elegir en «Recordarme en…». */
export const REMINDER_DAYS = ['1', '3', '7'] as const
export type ReminderDays = (typeof REMINDER_DAYS)[number]

/** Opción de «Recordarme en…» más cercana a la fecha guardada; vacío si no se sabe la fecha. */
export function reminderChoice(followUpAt: string | undefined, now: Date = new Date()): ReminderDays | '' {
  if (!followUpAt) return ''
  const days = (new Date(followUpAt).getTime() - now.getTime()) / DAY
  if (Number.isNaN(days)) return ''
  return REMINDER_DAYS.reduce((best, d) => (Math.abs(Number(d) - days) < Math.abs(Number(best) - days) ? d : best))
}

// ── Catálogo ─────────────────────────────────────────────────────────────────

export interface LineToReview {
  lineName: string
  quoteId: string
  quoteLabel: string
}

/**
 * Líneas sin todos sus precios que afectan a una cotización en curso. Un catálogo nuevo trae muchas
 * líneas incompletas que nadie está usando: avisarlas todas no le sirve a nadie, así que solo
 * cuentan las de borradores y enviadas, y se dice cuál cotización está afectada.
 */
export function linesToReview(
  catalog: Pick<Catalog, 'profiles' | 'items' | 'lines' | 'colors'> | null | undefined,
  quotes: readonly Pick<QuoteSummary, 'id' | 'number' | 'title' | 'status' | 'firstItem'>[],
): LineToReview[] {
  if (!catalog?.lines?.length) return []
  let readiness: ReturnType<typeof catalogReadiness>
  try {
    readiness = catalogReadiness(catalog)
  } catch {
    return []
  }
  const seen = new Set<string>()
  const out: LineToReview[] = []
  for (const q of quotes) {
    const lineId = q.firstItem?.design.lineId
    if (!lineId || seen.has(lineId) || (q.status !== 'draft' && q.status !== 'sent')) continue
    const state = readiness.get(lineId)?.state
    if (!state || state === 'ready') continue
    seen.add(lineId)
    out.push({ lineName: catalog.lines.find((l) => l.id === lineId)?.name ?? lineId, quoteId: q.id, quoteLabel: q.title })
  }
  return out
}

// ── Mensajes ─────────────────────────────────────────────────────────────────

/** Días completos desde una fecha (0 si es hoy o futura). */
export function daysSince(iso: string | undefined | null, now: Date = new Date()): number {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 0
  return Math.max(0, Math.floor((now.getTime() - t) / DAY))
}

const COMPANY_WORDS =
  /(^|\s)(spa|s\.?\s?a\.?|ltda\.?|limitada|e\.?i\.?r\.?l\.?|cia\.?|compania|constructora|inmobiliaria|comercial|comercializadora|sociedad|empresas?|ingenieria|servicios|inversiones|grupo|corporacion|fundacion|municipalidad|colegio|hotel|club|condominio|edificio)(?=\s|$|,)/i

/** Nombre de empresa («Constructora Los Aromos SpA», «Inversiones Soto Ltda.»): no se parte. */
export function looksLikeCompany(name: string | undefined | null): boolean {
  const plain = (name ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  return COMPANY_WORDS.test(plain)
}

/**
 * Cómo llamar al cliente en un saludo: el nombre de pila de una persona («Pedro»); vacío si es
 * una empresa (no decimos «Hola Constructora»).
 */
export function callName(name: string | undefined | null): string {
  if (looksLikeCompany(name)) return ''
  return (name ?? '').trim().split(/\s+/)[0] ?? ''
}

/** A quién escribirle: «Pedro» o el nombre completo de la empresa. */
export function addressee(name: string | undefined | null): string {
  return callName(name) || (name ?? '').trim()
}

/**
 * Mensaje de WhatsApp para retomar la conversación (cálido, corto, con el enlace si existe). Va al
 * cliente: pásale el idioma de los documentos (el de la cotización o el de la empresa).
 */
export function followUpMessage(opts: { clientName?: string; number: number; orgName?: string; link?: string; locale?: Locale }): string {
  const locale = opts.locale ?? getLocale()
  const who = callName(opts.clientName)
  return translate(
    es,
    'followUp.message',
    {
      hasName: who ? 'yes' : 'no',
      name: who,
      hasOrg: opts.orgName ? 'yes' : 'no',
      org: opts.orgName ?? '',
      doc: getFormatter({ locale }).docNumber(opts.number),
      hasLink: opts.link ? 'yes' : 'no',
      link: opts.link ?? '',
    },
    locale,
  )
}

/** WhatsApp para contestar a quien pidió cambios (idioma de los documentos). */
export function changesReplyMessage(opts: { clientName?: string; number: number; locale?: Locale }): string {
  const locale = opts.locale ?? getLocale()
  const who = callName(opts.clientName)
  return translate(es, 'followUp.changesMessage', { hasName: who ? 'yes' : 'no', name: who, doc: getFormatter({ locale }).docNumber(opts.number) }, locale)
}

/**
 * Número para wa.me a partir de lo que el taller anotó. Entiende los formatos chilenos:
 * «+56 9 1234 5678», «9 1234 5678», «912345678», «12345678» (móvil sin el 9) y fijos «22 123 4567».
 * Devuelve solo dígitos con código de país, o null si no parece un teléfono.
 */
export function whatsappNumber(phone: string | undefined | null): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.startsWith('56')) return digits.length >= 10 && digits.length <= 11 ? digits : null
  if (digits.length === 9) return `56${digits}`
  if (digits.length === 8) return `569${digits}`
  // Otro país con su código (10 a 15 dígitos).
  if (digits.length >= 10 && digits.length <= 15) return digits
  return null
}

/** Enlace de WhatsApp: al número si lo tenemos; si no, WhatsApp pide elegir el contacto. */
export function whatsappUrl(phone: string | undefined | null, text: string): string {
  const number = whatsappNumber(phone)
  const query = `text=${encodeURIComponent(text)}`
  return number ? `https://wa.me/${number}?${query}` : `https://wa.me/?${query}`
}

/** Enlace público de una cotización enviada. */
export function portalLink(origin: string, shareToken: string | undefined | null): string | undefined {
  return shareToken ? `${origin.replace(/\/$/, '')}/c/${shareToken}` : undefined
}
