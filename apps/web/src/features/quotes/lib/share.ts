/**
 * Textos y enlaces para mandar la cotización (WhatsApp, correo) sin campos obligatorios. Van en el
 * **idioma del documento** (el de la cotización), no en el de la interfaz: es lo que lee el cliente.
 * Para otro idioma que el actual, la web debe tenerlo descargado (`loadLocale`) antes de llamar.
 */
import { SEND_VARIABLES, type Locale, type SendChannel, type SendTemplates, type SendVariable } from '@dekopen/shared'
import { getLocale, translate } from '../../../lib/i18n'
import { firstName } from '../../../lib/format'
import es from '../i18n/es'

export interface ShareContext {
  number: number
  title: string
  url: string
  orgName: string
  /** Quien envía: el mensaje va firmado por una persona. */
  sellerName?: string
  clientName?: string
  /** RUT del cliente: los de empresa (≥ 50.000.000) no se saludan por el nombre. */
  clientRut?: string
  revisionLetter?: string
  /** Idioma del documento (por defecto, el actual). */
  locale?: Locale
  /** Plantillas propias del taller. */
  templates?: SendTemplates
}

const COMPANY_SUFFIX = /(^|[\s,])(s\.?\s?p\.?\s?a\.?|s\.?\s?a\.?|ltda\.?|limitada|e\.?\s?i\.?\s?r\.?\s?l\.?|cía\.?|compañía)\s*$/i
const COMPANY_WORD = /(^|\s)(spa|ltda\.?|limitada|eirl|sociedad an[oó]nima)(\s|$)/i
const COMPANY_START =
  /^(constructora|inmobiliaria|comercial|sociedad|empresa|empresas|inversiones|ingenier[ií]a|servicios|distribuidora|importadora|corporaci[oó]n|fundaci[oó]n|municipalidad|ilustre|colegio|club|hotel|condominio|comunidad|edificio|arquitectura|transportes|agr[ií]cola|grupo)(?=[\s,.]|$)/i

/** Cuerpo numérico del RUT («76.543.210-3» → 76543210), o null si no se entiende. */
function rutBody(rut: string | undefined): number | null {
  const clean = (rut ?? '').replace(/[^0-9kK]/g, '')
  if (clean.length < 2) return null
  const body = Number(clean.slice(0, -1))
  return Number.isFinite(body) && body > 0 ? body : null
}

/** ¿El cliente es una empresa? (razón social, giro al inicio o RUT de persona jurídica). */
export function isCompanyClient(name: string | undefined, rut?: string): boolean {
  const n = (name ?? '').trim()
  const body = rutBody(rut)
  if (body !== null && body >= 50_000_000) return true
  if (!n) return false
  return COMPANY_SUFFIX.test(n) || COMPANY_WORD.test(n) || COMPANY_START.test(n)
}

/** «Hola Carolina» para personas; «Hola» a secas para empresas o sin cliente. */
export function greeting(name: string | undefined, rut?: string, locale: Locale = getLocale()): string {
  if (!name?.trim() || isCompanyClient(name, rut)) return translate(es, 'share.hello', undefined, locale)
  const first = firstName(name)
  return first ? translate(es, 'share.helloName', { name: first }, locale) : translate(es, 'share.hello', undefined, locale)
}

// ── Mensaje de envío ─────────────────────────────────────────────────────────
/** Cada variable se devuelve a sí misma: el texto traducido queda como plantilla. */
const VARIABLE_MARKS = Object.fromEntries(SEND_VARIABLES.map((name) => [name, `{${name}}`]))

/** La plantilla que trae DEKOPEN, en el idioma del documento. */
export function defaultSendTemplate(channel: SendChannel, locale: Locale = getLocale()): string {
  return translate(es, channel === 'whatsapp' ? 'share.templateWhatsapp' : 'share.templateEmail', VARIABLE_MARKS, locale)
}

/** La plantilla del taller para ese canal e idioma o, si no escribió una, la que trae DEKOPEN. */
export function sendTemplate(templates: SendTemplates | undefined, channel: SendChannel, locale: Locale = getLocale()): string {
  return templates?.[channel]?.[locale]?.trim() ? templates[channel]![locale]! : defaultSendTemplate(channel, locale)
}

export type SendVariables = Record<SendVariable, string>

/** Valores de las variables. No hay total: el mensaje nunca lo lleva. */
export function sendVariables(ctx: Omit<ShareContext, 'url' | 'templates'>, url: string): SendVariables {
  const locale = ctx.locale ?? getLocale()
  const title = ctx.title.trim()
  const version = ctx.revisionLetter && ctx.revisionLetter !== 'A' ? ctx.revisionLetter : ''
  const client = ctx.clientName?.trim() ?? ''
  return {
    saludo: greeting(ctx.clientName, ctx.clientRut, locale),
    cliente: client && !isCompanyClient(client, ctx.clientRut) ? (firstName(client) ?? client) : client,
    referencia: translate(es, 'share.reference', { number: ctx.number, hasTitle: title ? 'yes' : 'no', title, hasVersion: version ? 'yes' : 'no', letter: version }, locale),
    numero: String(ctx.number),
    obra: title,
    taller: ctx.orgName,
    vendedor: ctx.sellerName?.trim() ?? '',
    enlace: url,
  }
}

const isVariable = (name: string): name is SendVariable => (SEND_VARIABLES as readonly string[]).includes(name)

/** Variables escritas a mano que no existen: se enviarían tal cual. */
export function unknownSendVariables(text: string): string[] {
  return [...new Set([...text.matchAll(/\{([^{}\s]{1,30})\}/g)].flatMap((m) => (isVariable(m[1]!) ? [] : [m[0]])))]
}

/**
 * Llena la plantilla. Una variable sin dato no deja huecos: si está entre paréntesis se va el
 * paréntesis y, si no, la línea completa. Así un envío sin enlace no deja «Revísala aquí:» colgando.
 */
export function renderSendTemplate(template: string, vars: Partial<SendVariables>): string {
  const hasEmpty = (text: string) => [...text.matchAll(/\{([a-z]+)\}/g)].some((m) => isVariable(m[1]!) && !vars[m[1] as SendVariable]?.trim())
  return template
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]*\([^()\n]*\)/g, (group) => (hasEmpty(group) ? '' : group))
    .split('\n')
    .filter((line) => !hasEmpty(line))
    .join('\n')
    .replace(/\{([a-z]+)\}/g, (mark, name: string) => (isVariable(name) ? (vars[name] ?? '') : mark))
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Pone o saca la línea del enlace en un texto ya escrito, sin tocar lo demás. */
export function applyLink(text: string, withLink: boolean): string {
  if (withLink) return text.includes('{enlace}') ? text : `${text.trimEnd()}\n\n{enlace}`
  return text
    .split('\n')
    .filter((line) => !line.includes('{enlace}'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Mensaje listo para pegar, con el enlace puesto. */
export function shareMessage(ctx: ShareContext): string {
  return renderSendTemplate(sendTemplate(ctx.templates, 'whatsapp', ctx.locale ?? getLocale()), sendVariables(ctx, ctx.url))
}

/** Respuesta a un cliente que pidió cambios: le confirma que se leyó y que viene la versión nueva. */
export function replyMessage(ctx: Pick<ShareContext, 'number' | 'title' | 'orgName' | 'clientName' | 'clientRut' | 'locale'>): string {
  const locale = ctx.locale ?? getLocale()
  const title = ctx.title.trim()
  return [
    translate(es, 'share.reply', { hello: greeting(ctx.clientName, ctx.clientRut, locale), number: ctx.number, hasTitle: title ? 'yes' : 'no', title }, locale),
    '',
    translate(es, 'share.regards', undefined, locale),
    ctx.orgName,
  ].join('\n')
}

/** Asunto del correo: «Cotización N° 412 · Casa Pérez». */
export function shareSubject(number: number, title: string, locale: Locale = getLocale()): string {
  const clean = title.trim()
  return clean ? translate(es, 'share.subjectTitle', { number, title: clean }, locale) : translate(es, 'share.subject', { number }, locale)
}

/** Solo dígitos, con 56 delante si es un celular chileno escrito sin código de país. */
export function whatsappPhone(phone: string | undefined | null): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('56')) return digits
  if (digits.length === 9 && digits.startsWith('9')) return `56${digits}`
  if (digits.length === 8) return `569${digits}`
  return digits
}

export function whatsappUrl(message: string, phone?: string | null): string {
  const to = whatsappPhone(phone)
  return `https://wa.me/${to}?text=${encodeURIComponent(message)}`
}

export function mailtoUrl(opts: { to?: string | null; subject: string; body: string }): string {
  const to = opts.to?.trim() ? encodeURIComponent(opts.to.trim()).replace(/%40/g, '@') : ''
  return `mailto:${to}?subject=${encodeURIComponent(opts.subject)}&body=${encodeURIComponent(opts.body)}`
}

/** Enlace del portal a partir del token (si el servidor no lo devolvió). */
export function portalUrl(token: string | undefined, origin = typeof window !== 'undefined' ? window.location.origin : ''): string {
  return token ? `${origin}/c/${token}` : ''
}

/** Texto seguro para un nombre de archivo: sin tildes ni símbolos («Casa Pérez» → «Casa-Perez»). */
function fileSlug(text: string, max: number): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
}

/** Nombre de archivo sin tildes ni símbolos: «Cotizacion-412-Casa-Perez.pdf» (prefijo en el idioma del documento). */
export function pdfFileName(number: number, title: string, revisionLetter = '', locale: Locale = getLocale()): string {
  const prefix = fileSlug(translate(es, 'share.file', undefined, locale), 24) || 'Quote'
  return [prefix, String(number), revisionLetter && revisionLetter !== 'A' ? revisionLetter : '', fileSlug(title, 48)].filter(Boolean).join('-') + '.pdf'
}

/** Lo que el editor sabe del último envío (meta de la cotización). */
export interface SentMeta {
  revision: number
  sentAt?: string
  updatedAt: string
  /** Totales que guardó el servidor en el último guardado o envío. */
  totals?: { total: number }
}

/** ¿Se guardó algo después de enviarla? (con 1,5 s de margen para el propio envío). */
function savedAfterSent(meta: SentMeta): boolean {
  if (!meta.sentAt) return true
  return new Date(meta.updatedAt).getTime() - new Date(meta.sentAt).getTime() > 1500
}

/**
 * ¿Cambió el precio desde la última vez que el servidor la calculó (al enviarla o al guardarla)?
 * El servidor no recalcula una cotización guardada cuando cambias tus precios (margen, mano de
 * obra, catálogo…), así que si el total vivo es otro hay que mandarle al cliente una versión nueva.
 * `exact` indica que nada se guardó después del envío: entonces `sent` es lo que ve el cliente.
 */
export function sentPriceDrift(meta: SentMeta, liveTotal: number): { sent: number; now: number; exact: boolean } | null {
  if (meta.revision <= 0 || !meta.sentAt || !meta.totals) return null
  const sent = Math.round(meta.totals.total)
  const now = Math.round(liveTotal)
  if (!Number.isFinite(sent) || !Number.isFinite(now) || Math.abs(sent - now) < 1) return null
  return { sent, now, exact: !savedAfterSent(meta) }
}

/**
 * ¿Cambió el documento desde el último envío (o nunca se envió)? No cuenta los cambios de precio
 * que vienen de tus ajustes o del catálogo: con esos, el enlace vigente sigue mostrando lo mismo.
 */
export function docChangedSinceSent(meta: SentMeta, dirty: boolean): boolean {
  if (meta.revision <= 0 || !meta.sentAt) return true
  return dirty || savedAfterSent(meta)
}

/**
 * ¿Hay cambios desde el último envío? (entonces reenviar crea la revisión siguiente). Cuenta los
 * cambios del documento y también los de precio: si el total vivo ya no es el que se guardó.
 */
export function editedSinceSent(meta: SentMeta, dirty: boolean, liveTotal?: number): boolean {
  if (docChangedSinceSent(meta, dirty)) return true
  return liveTotal !== undefined && sentPriceDrift(meta, liveTotal) !== null
}

/** Lo que hace falta para saber si hay un enlace vigente. */
export interface LinkMeta extends SentMeta {
  status: string
  shareToken?: string
}

/**
 * ¿Se puede copiar el enlace que ya tiene el cliente? Sí si existe y el documento no cambió desde
 * el envío, aunque tus precios hayan cambiado: copiar nunca crea una versión nueva (eso es «Enviar»).
 */
export function canCopyCurrentLink(meta: LinkMeta, dirty: boolean): boolean {
  return !!meta.shareToken && meta.status !== 'draft' && !docChangedSinceSent(meta, dirty)
}
