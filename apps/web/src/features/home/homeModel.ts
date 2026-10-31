/**
 * Lógica pura de Inicio: saludo, embudo, vendido del mes y seguimientos sugeridos.
 * Sin React ni red: se prueba en homeModel.test.ts.
 */
import type { QuoteStatus, QuoteSummary } from '@framezen/shared'

export const CHILE_TZ = 'America/Santiago'

// ── Saludo ───────────────────────────────────────────────────────────────────

/** Hora (0–23) en Chile, sin depender de la zona del navegador. */
export function hourIn(now: Date, timeZone = CHILE_TZ): number {
  const text = new Intl.DateTimeFormat('es-CL', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now)
  const hour = Number(text.replace(/\D/g, ''))
  return Number.isFinite(hour) ? hour % 24 : now.getHours()
}

/** «Buenos días» (5–11), «Buenas tardes» (12–19), «Buenas noches» (20–4). */
export function greeting(now: Date = new Date(), timeZone = CHILE_TZ): string {
  const hour = hourIn(now, timeZone)
  if (hour >= 5 && hour < 12) return 'Buenos días'
  if (hour >= 12 && hour < 20) return 'Buenas tardes'
  return 'Buenas noches'
}

/** «sábado 31 de octubre» (para la línea bajo el saludo). */
export function todayLabel(now: Date = new Date(), timeZone = CHILE_TZ): string {
  return new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(now)
}

// ── Embudo ───────────────────────────────────────────────────────────────────

export interface QuoteStats {
  byStatus: Record<QuoteStatus, { count: number; total: number }>
  soldThisMonth: { count: number; total: number }
  followUps: QuoteSummary[]
}

export interface FunnelStage {
  status: QuoteStatus
  label: string
  /** Frase corta bajo la cifra. */
  hint: string
  count: number
  total: number
  /** Lista de cotizaciones filtrada por este estado. */
  to: string
}

export const FUNNEL: { status: QuoteStatus; label: string; hint: string }[] = [
  { status: 'draft', label: 'Borradores', hint: 'por enviar' },
  { status: 'sent', label: 'Enviadas', hint: 'esperando respuesta' },
  { status: 'accepted', label: 'Aceptadas', hint: 'listas para taller' },
  { status: 'workshop', label: 'En taller', hint: 'en fabricación' },
]

/** Enlace a la lista de cotizaciones filtrada por estado (contrato con la zona de cotizaciones). */
export function quotesListLink(status: QuoteStatus): string {
  return `/cotizaciones?estado=${status}`
}

export function buildFunnel(stats: Pick<QuoteStats, 'byStatus'> | null | undefined): FunnelStage[] {
  return FUNNEL.map((stage) => {
    const entry = stats?.byStatus?.[stage.status]
    return {
      ...stage,
      count: Math.max(0, Number(entry?.count ?? 0)),
      total: Math.max(0, Number(entry?.total ?? 0)),
      to: quotesListLink(stage.status),
    }
  })
}

/** Cuenta sin ninguna cotización (ni siquiera rechazadas o cerradas): mostramos la bienvenida. */
export function isEmptyAccount(stats: Pick<QuoteStats, 'byStatus'> | null | undefined): boolean {
  if (!stats?.byStatus) return false
  return Object.values(stats.byStatus).every((s) => !s || Number(s.count) === 0)
}

// ── Vendido del mes ──────────────────────────────────────────────────────────

/** Estados que cuentan como venta cerrada (igual que el servidor). */
export const WON_STATUSES: QuoteStatus[] = ['accepted', 'workshop', 'installed', 'closed']

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

/** Nombre del mes: «septiembre». */
export function monthName(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('es-CL', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 15)))
}

export interface MonthSales {
  thisMonth: { count: number; total: number; key: string }
  lastMonth: { count: number; total: number; key: string }
  /** Variación porcentual frente al mes anterior; null si el mes anterior fue $0. */
  delta: number | null
}

/**
 * Vendido este mes y el anterior a partir de las cotizaciones ganadas (por fecha de aceptación).
 * Si el servidor ya trae el mes en curso (`soldThisMonth`), manda esa cifra.
 */
export function monthSales(
  won: readonly Pick<QuoteSummary, 'status' | 'acceptedAt' | 'total'>[],
  now: Date = new Date(),
  soldThisMonth?: { count: number; total: number } | null,
): MonthSales {
  const current = monthKey(now)
  const previous = previousMonthKey(current)
  const acc = { [current]: { count: 0, total: 0 }, [previous]: { count: 0, total: 0 } } as Record<string, { count: number; total: number }>
  for (const q of won) {
    if (!q.acceptedAt || !WON_STATUSES.includes(q.status)) continue
    const at = new Date(q.acceptedAt)
    if (Number.isNaN(at.getTime())) continue
    const key = monthKey(at)
    if (!acc[key]) continue
    acc[key].count += 1
    acc[key].total += Math.max(0, Number(q.total) || 0)
  }
  const thisMonth = soldThisMonth ? { count: soldThisMonth.count, total: soldThisMonth.total } : acc[current]
  const last = acc[previous]
  const delta = last.total > 0 ? ((thisMonth.total - last.total) / last.total) * 100 : null
  return { thisMonth: { ...thisMonth, key: current }, lastMonth: { ...last, key: previous }, delta }
}

// ── Seguimientos ─────────────────────────────────────────────────────────────

const DAY = 86_400_000

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
function addressee(name: string | undefined | null): string {
  return callName(name) || (name ?? '').trim()
}

function daysText(days: number): string {
  return days === 1 ? '1 día' : `${days} días`
}

/** «La N° 412 lleva 6 días enviada sin respuesta: escríbele a Pedro». */
export function followUpText(q: Pick<QuoteSummary, 'number' | 'sentAt' | 'clientName'>, now: Date = new Date()): string {
  const days = daysSince(q.sentAt, now)
  const who = addressee(q.clientName)
  return `La N° ${q.number} lleva ${daysText(days)} enviada sin respuesta: escríbele a ${who || 'tu cliente'}`
}

/** Mensaje de WhatsApp para retomar la conversación (cálido, corto, con el enlace si existe). */
export function followUpMessage(opts: { clientName?: string; number: number; orgName?: string; link?: string }): string {
  const who = callName(opts.clientName)
  const hello = who ? `Hola ${who}` : 'Hola'
  const from = opts.orgName ? `, te escribo de ${opts.orgName}` : ''
  const link = opts.link ? ` Aquí la tienes de nuevo: ${opts.link}` : ''
  return `${hello}${from} por la cotización N° ${opts.number}. ¿Pudiste revisarla?${link} Si quieres ajustar algo, me cuentas y lo vemos.`
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

// ── Actividad ────────────────────────────────────────────────────────────────

export type ActivityTone = 'ok' | 'ink' | 'warn' | 'neutral'

/** Color del punto de cada evento según su tipo (aceptada verde, pidió cambios ámbar…). */
export function activityTone(kind: string): ActivityTone {
  if (kind === 'quote.accepted' || kind === 'workorder.done' || kind === 'quote.installed') return 'ok'
  if (kind === 'quote.changes_requested') return 'warn'
  if (kind === 'quote.sent' || kind === 'quote.viewed') return 'ink'
  return 'neutral'
}
