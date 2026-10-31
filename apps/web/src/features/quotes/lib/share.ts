/**
 * Textos y enlaces para mandar la cotización (WhatsApp, correo) sin campos obligatorios.
 */
import { formatCLP } from '@framezen/engine'
import { firstName } from '../../../lib/format'

export interface ShareContext {
  number: number
  title: string
  total: number
  url: string
  orgName: string
  clientName?: string
  /** RUT del cliente: los de empresa (≥ 50.000.000) no se saludan por el nombre. */
  clientRut?: string
  revisionLetter?: string
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
export function greeting(name: string | undefined, rut?: string): string {
  if (!name?.trim() || isCompanyClient(name, rut)) return 'Hola'
  const first = firstName(name)
  return first ? `Hola ${first}` : 'Hola'
}

/** Mensaje cálido y corto, listo para pegar. */
export function shareMessage(ctx: ShareContext): string {
  const hello = greeting(ctx.clientName, ctx.clientRut)
  const title = ctx.title.trim() ? ` (${ctx.title.trim()})` : ''
  const version = ctx.revisionLetter && ctx.revisionLetter !== 'A' ? `, versión ${ctx.revisionLetter},` : ''
  return [
    `${hello}, te envío la cotización N° ${ctx.number}${title}${version} por ${formatCLP(ctx.total)} IVA incluido.`,
    `Puedes revisar cada ventana y aceptarla aquí: ${ctx.url}`,
    '',
    `Saludos,`,
    ctx.orgName,
  ].join('\n')
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

/** Nombre de archivo sin tildes ni símbolos: «Cotizacion-412-Casa-Perez.pdf». */
export function pdfFileName(number: number, title: string, revisionLetter = ''): string {
  const slug = title
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return ['Cotizacion', String(number), revisionLetter && revisionLetter !== 'A' ? revisionLetter : '', slug].filter(Boolean).join('-') + '.pdf'
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
