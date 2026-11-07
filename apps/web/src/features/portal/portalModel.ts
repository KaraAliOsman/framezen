/**
 * Lógica pura del portal del cliente: ventanas con su dibujo y precio, extras visibles,
 * contacto, vigencia, idioma del documento y colores de la marca del taller. Sin textos fijos:
 * devuelve datos y claves; la página los traduce en el idioma del documento. Se prueba en
 * portalModel.test.ts.
 */
import {
  altGroupOf,
  assemblyUnits,
  computeLayout,
  designName,
  formatSize,
  includedLineIds,
  isAssembly,
  lineRole,
  matchTypology,
  selectionTotals,
  type Catalog,
  type Layout,
  type QuoteExtra,
  type QuoteLineRole,
  type QuoteSelection,
  type QuoteTotals,
  type TypologyId,
  type WindowDesign,
} from '@dekopen/engine'
import { accessoriesIn, assemblyTitleIn, contrast, DEFAULT_ACCENT, ensureContrast, isHex, parseHex, quoteDocLineOf, readableOn, toHex } from '@dekopen/documents'
import { colorDisplayName, DEFAULT_CURRENCY, DEFAULT_LOCALE, isLocale, type Locale, type PublicQuoteResponse, type QuoteItem, type QuoteStatus } from '@dekopen/shared'
import { whatsappNumber } from '../home/homeModel'

/**
 * Lo que devuelve GET /api/public/quotes/:token. Además del contrato v4, el portal lee (si llegan)
 * el idioma del documento, la moneda y el nombre del impuesto de la empresa: campos aditivos que
 * el servidor puede sumar sin romper nada (ver `documentLocale`, `portalCurrency`, `portalTaxLabel`).
 */
export type PortalData = Omit<PublicQuoteResponse, 'prices' | 'revisionLabel'> & {
  prices?: PublicQuoteResponse['prices']
  revisionLabel?: string
  /** Idioma del documento (resuelto por el servidor: cotización → empresa → es). */
  locale?: string
  /** Moneda ISO 4217 de la empresa (CLP por defecto). */
  currency?: string
  /** Nombre del impuesto en el documento («IVA», «VAT», «MwSt.»…). */
  taxLabel?: string
}

export interface PortalItem {
  id: string
  /** `optional` o `alternative`: el cliente decide si cuenta. */
  role: QuoteLineRole
  /** Grupo de alternativas (clave estable, sirve también de nombre si el taller lo escribió). */
  altKey?: string
  altLabel?: string
  included?: boolean
  ref: string
  /** Nombre del motor (español): respaldo cuando la tipología no se reconoce. */
  title: string
  /** Tipología reconocida (para nombrarla en el idioma del documento con el glosario). */
  typologyId?: TypologyId
  name?: string
  location?: string
  qty: number
  design: WindowDesign
  layout: Layout | null
  size: string
  width: number
  height: number
  /** m² por unidad. */
  area: number
  lineName?: string
  brandId?: string
  /** Persiana, mosquitero, alféizar… con el mismo texto del documento. */
  accessories: string[]
  colorName?: string
  colorHex?: string
  colorInName?: string
  colorInHex?: string
  glassName?: string
  notes?: string
  unitNet: number
  totalNet: number
  /** Le falta precio: se rotula y no se muestra ninguna cifra. */
  pending: boolean
}

function safeLayout(design: WindowDesign, catalog: Catalog): Layout | null {
  try {
    return computeLayout(design, catalog)
  } catch {
    return null
  }
}

/** Al decir línea va solo la línea, igual que el documento: ni material ni marca. */
function safeLine(design: WindowDesign, catalog: Catalog): string | undefined {
  try {
    const line = quoteDocLineOf(design, catalog)
    return line?.series || line?.name || undefined
  } catch {
    return undefined
  }
}

function safeAccessories(design: WindowDesign, locale: Locale): string[] {
  try {
    return accessoriesIn(design.extras, locale)
  } catch {
    return []
  }
}

function safeName(design: WindowDesign): string {
  try {
    return designName(design)
  } catch {
    return 'Ventana'
  }
}

function safeTypology(design: WindowDesign): TypologyId | undefined {
  try {
    return matchTypology(design)
  } catch {
    return undefined
  }
}

/** m² de una ventana. En un conjunto, la suma de sus unidades: la caja que las envuelve no es superficie. */
function designArea(design: WindowDesign): number {
  const sized = isAssembly(design) ? assemblyUnits(design).map((unit) => unit.design) : [design]
  return sized.reduce((sum, d) => sum + (d.width * d.height) / 1_000_000, 0)
}

/** Cantidad que cuenta para el cliente: la misma regla que buildQuoteDocData (no finita = 0). */
function itemQty(item: QuoteItem): number {
  return Number.isFinite(item.qty) ? item.qty : 0
}

/**
 * Ventanas del portal con todo lo que el cliente necesita ver (sin costos internos).
 * Igual que el PDF, las ventanas con cantidad 0 («en pausa») no se muestran ni se cuentan.
 */
export function portalItems(data: Pick<PortalData, 'quote' | 'catalog' | 'prices'>, locale: Locale = 'es'): PortalItem[] {
  const catalog = data.catalog
  const prices = data.prices ?? {}
  const items = Array.isArray(data.quote.items) ? data.quote.items : []
  return items.filter((item) => itemQty(item) > 0).map((item: QuoteItem) => {
    const qty = itemQty(item)
    const d = item.design
    const color = catalog.colors?.find((c) => c.id === d.colorId)
    const colorIn = d.colorInId && d.colorInId !== d.colorId ? catalog.colors?.find((c) => c.id === d.colorInId) : undefined
    const glass = catalog.glass?.find((g) => g.id === d.glassId)
    const price = prices[item.id]
    const unit = price?.unitNet ?? item.manualUnitPrice ?? 0
    const role = lineRole(item)
    return {
      id: item.id,
      role,
      ...(role === 'alternative' ? { altKey: altGroupOf(item), altLabel: item.altGroup?.trim() || undefined } : {}),
      ...(item.included !== undefined ? { included: item.included } : {}),
      ref: item.ref,
      title: assemblyTitleIn(d, locale) ?? safeName(d),
      typologyId: isAssembly(d) ? undefined : safeTypology(d),
      name: item.name,
      location: item.location,
      qty,
      design: d,
      layout: safeLayout(d, catalog),
      size: formatSize(d.width, d.height),
      width: d.width,
      height: d.height,
      area: Math.round(designArea(d) * 100) / 100,
      lineName: safeLine(d, catalog),
      brandId: catalog.lines?.find((line) => line.id === d.lineId)?.brandId,
      accessories: safeAccessories(d, locale),
      // Nombres conocidos en el idioma del portal («Nogal» → «Walnut»); los propios, tal cual.
      colorName: color ? colorDisplayName(color, locale) : undefined,
      colorHex: color?.hex,
      colorInName: colorIn ? colorDisplayName(colorIn, locale) : undefined,
      colorInHex: colorIn?.hex,
      glassName: glass?.name,
      notes: item.notes,
      unitNet: unit,
      totalNet: price?.totalNet ?? unit * qty,
      pending: Boolean(price?.pending),
    }
  })
}

/** Extra que ve el cliente: con su nombre o con uno genérico (`unnamed`, `hidden`) que traduce la página. */
export interface VisibleExtra {
  label?: string
  generic?: 'unnamed' | 'hidden'
  amount: number
}

/** ¿Esta cotización tiene algo que el cliente pueda elegir? */
export function hasChoices(quote: Pick<PortalData['quote'], 'items' | 'extras'>): boolean {
  return [...(quote.items ?? []), ...(quote.extras ?? [])].some((line) => lineRole(line) !== 'base')
}

/** Ids de lo que cuenta con la elección de ahora (la misma regla del servidor). */
export function includedIds(quote: Pick<PortalData['quote'], 'items' | 'extras'>, selection: QuoteSelection): Set<string> {
  return includedLineIds([...(quote.items ?? []), ...(quote.extras ?? [])], selection)
}

/** Totales para la elección de ahora, con los precios de la revisión enviada. El servidor los repite al aceptar. */
export function portalTotals(data: Pick<PortalData, 'quote' | 'prices' | 'ivaPct'>, selection: QuoteSelection): QuoteTotals {
  const { quote } = data
  const prices = data.prices ?? {}
  return selectionTotals(
    {
      lines: (quote.items ?? []).map((item) => ({
        id: item.id,
        role: item.role,
        altGroup: item.altGroup,
        included: item.included,
        qty: itemQty(item),
        totalNet: prices[item.id]?.totalNet ?? 0,
        area: designArea(item.design),
        pending: prices[item.id]?.pending,
      })),
      extras: quote.extras ?? [],
      discountPct: quote.discountPct ?? 0,
      ivaPct: data.ivaPct ?? 19,
    },
    selection,
  )
}

/** Partidas que el cliente puede sumar o elegir (las ventanas se eligen en su propia ficha). */
export function choiceExtras(extras: readonly QuoteExtra[] | undefined): QuoteExtra[] {
  return (extras ?? []).filter((extra) => lineRole(extra) !== 'base' && !extra.hidden)
}

/** Extras visibles uno a uno; los ocultos se suman en «Servicios adicionales». */
export function visibleExtras(extras: readonly QuoteExtra[] | undefined, included?: ReadonlySet<string>): VisibleExtra[] {
  // Los que el cliente puede elegir se muestran con su interruptor, una sola vez.
  const list = (extras ?? []).filter((extra) => !included || lineRole(extra) === 'base' || included.has(extra.id))
  const shown: VisibleExtra[] = list
    .filter((e) => !e.hidden && e.amount !== 0)
    .map((e) => (e.label?.trim() ? { label: e.label, amount: e.amount } : { generic: 'unnamed' as const, amount: e.amount }))
  const hidden = list.filter((e) => e.hidden).reduce((acc, e) => acc + e.amount, 0)
  if (hidden !== 0) shown.push({ generic: 'hidden', amount: hidden })
  return shown
}

export const ACCEPTED_STATUSES: QuoteStatus[] = ['accepted', 'workshop', 'installed', 'closed']

export function isAccepted(status: QuoteStatus): boolean {
  return ACCEPTED_STATUSES.includes(status)
}

/** Fecha hasta la que vale la cotización (la guardada o envío + días de vigencia). */
export function validUntil(quote: Pick<PortalData['quote'], 'validUntil' | 'sentAt' | 'createdAt'>, validityDays: number): Date | null {
  if (quote.validUntil) {
    // «2026-11-15» es un día del calendario, no una hora en UTC (en Chile sería el día 14).
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(quote.validUntil)
    const d = day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 12) : new Date(quote.validUntil)
    if (!Number.isNaN(d.getTime())) return d
  }
  const base = quote.sentAt ?? quote.createdAt
  if (!base || !(validityDays > 0)) return null
  const d = new Date(base)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + validityDays)
  return d
}

/** La vigencia dura todo su último día. */
export function isExpired(until: Date, now = new Date()): boolean {
  const end = new Date(until)
  end.setHours(23, 59, 59, 999)
  return end.getTime() < now.getTime()
}

/** Estado que entiende el cliente (no el interno del taller). */
export type CustomerStatus = 'awaiting' | 'accepted' | 'expired' | null

export function customerStatus(status: QuoteStatus, accepted: boolean, expired: boolean): CustomerStatus {
  if (accepted) return 'accepted'
  if (expired) return 'expired'
  return status === 'sent' ? 'awaiting' : null
}

export interface ContactLink {
  kind: 'whatsapp' | 'phone' | 'email' | 'web'
  /** Texto visible (teléfono, correo, dominio); WhatsApp lo nombra la página. */
  label: string
  href: string
}

export interface ContactTexts {
  /** Saludo prellenado de WhatsApp (en el idioma del documento). */
  whatsappText?: string
  /** Asunto del correo. */
  emailSubject?: string
}

/** Formas de contactar al taller (WhatsApp primero: es lo que más se usa en Chile). */
export function contactLinks(org: PortalData['org'], texts: ContactTexts = {}): ContactLink[] {
  const out: ContactLink[] = []
  const wa = whatsappNumber(org.phone)
  if (wa) {
    const query = texts.whatsappText ? `?text=${encodeURIComponent(texts.whatsappText)}` : ''
    out.push({ kind: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/${wa}${query}` })
  }
  if (org.phone) out.push({ kind: 'phone', label: org.phone, href: `tel:${org.phone.replace(/[^\d+]/g, '')}` })
  if (org.email) out.push({ kind: 'email', label: org.email, href: `mailto:${org.email}${texts.emailSubject ? `?subject=${encodeURIComponent(texts.emailSubject)}` : ''}` })
  if (org.website) {
    const url = /^https?:\/\//i.test(org.website) ? org.website : `https://${org.website}`
    out.push({ kind: 'web', label: org.website.replace(/^https?:\/\//i, '').replace(/\/$/, ''), href: url })
  }
  return out
}

/** Acento por defecto: el mismo de los documentos (si el taller no eligió color, el PDF y el portal calzan). */
export const DEFAULT_PORTAL_ACCENT = DEFAULT_ACCENT

/**
 * Colores de la marca del taller para el portal: el acento tal cual para fondos de botones,
 * el texto que se lee encima, y una versión con contraste AA para textos sobre papel.
 */
export function brandColors(accent: string | undefined | null): { accent: string; onAccent: string; ink: string; soft: string } {
  const base = accent && isHex(accent) ? toHex(parseHex(accent)) : DEFAULT_PORTAL_ACCENT
  // Si el acento es demasiado claro para un botón, lo oscurecemos hasta que se lea el texto.
  const button = contrast(base, '#FFFFFF') >= 3 || contrast(base, '#1F1C18') >= 4.5 ? base : ensureContrast(base, '#FFFFFF', 3)
  return {
    accent: button,
    onAccent: readableOn(button),
    ink: ensureContrast(base, '#FFFFFF', 4.5),
    soft: `color-mix(in srgb, ${base} 8%, white)`,
  }
}

/** Copia al portapapeles. En navegadores viejos o sin https, con la vía antigua. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    area.setSelectionRange(0, text.length)
    let ok = false
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    area.remove()
    return ok
  }
}

/** Datos de la cuenta en líneas, listos para pegar en la app del banco. */
export function accountCopyText(rows: { label: string; value: string }[]): string {
  return rows.map((row) => `${row.label}: ${row.value}`).join('\n')
}

/** Lo que dice el regreso desde Flow. Es solo un aviso: lo pagado lo decide el servidor. */
export function payReturnNotice(search: string): 'ok' | 'pending' | 'rejected' | null {
  const value = new URLSearchParams(search).get('pago')
  if (value === 'ok') return 'ok'
  if (value === 'pendiente' || value === 'revisando') return 'pending'
  return value === 'rechazado' ? 'rejected' : null
}

/** Validación del formulario de aceptación: el nombre es lo único que pide el servidor. */
export function acceptNameError(name: string): 'empty' | 'short' | null {
  const n = name.trim()
  if (n.length >= 2) return null
  return n.length === 0 ? 'empty' : 'short'
}

/** Condiciones escritas por el taller («- » al inicio = viñeta). */
export function conditionLines(text: string | undefined): { bullet: boolean; text: string }[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/^[-•*]\s+/.test(l) ? { bullet: true, text: l.replace(/^[-•*]\s+/, '') } : { bullet: false, text: l }))
}

/**
 * Nombre del archivo PDF: «Cotizacion-412-B.pdf». `base` es la palabra traducida y ya sin
 * caracteres raros («Quote-412», «Angebot-412»).
 */
export function pdfFileName(number: number, revisionLabel?: string, base = `Cotizacion-${number}`): string {
  const safe = base.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return `${safe || `Cotizacion-${number}`}${revisionLabel ? `-${revisionLabel}` : ''}.pdf`
}

/**
 * Idioma en que se muestra el portal: el del documento. Orden: lo que resuelve el servidor
 * (`data.locale`), el idioma guardado en la cotización (ajustes del documento v2), el de la empresa
 * y, si nada viene, español.
 */
export function documentLocale(data: Pick<PortalData, 'locale' | 'quote' | 'org'>): Locale {
  const fromQuote = (data.quote?.documentOverrides as { locale?: unknown } | undefined)?.locale
  const fromOrg = (data.org as { locale?: unknown } | undefined)?.locale
  for (const candidate of [data.locale, fromQuote, fromOrg]) {
    if (isLocale(candidate)) return candidate
  }
  return DEFAULT_LOCALE
}

/** Moneda de la cotización (la de la empresa; CLP si el servidor no la envía). */
export function portalCurrency(data: Pick<PortalData, 'currency' | 'org'>): string {
  const value = data.currency ?? (data.org as { currency?: unknown } | undefined)?.currency
  return typeof value === 'string' && /^[A-Za-z]{3}$/.test(value) ? value.toUpperCase() : DEFAULT_CURRENCY
}

/** Nombre del impuesto que puso el taller, si lo envía el servidor (si no, el del glosario). */
/**
 * Nombre del impuesto dentro de una frase («CLP 1.961.358, tax included», «Total com impostos»):
 * una palabra común va en minúscula; las siglas y abreviaturas («IVA», «VAT», «MwSt.», «KDV») y los
 * sustantivos alemanes se dejan como vienen.
 */
export function taxInSentence(tax: string, locale: Locale): string {
  const value = tax.trim()
  if (locale === 'de' || !value || value.includes('.')) return value
  const first = value.split(/\s+/)[0]!
  // Sigla: dos o más letras y todas en mayúscula.
  if (first.length >= 2 && first === first.toLocaleUpperCase(locale)) return value
  return value.charAt(0).toLocaleLowerCase(locale) + value.slice(1)
}

export function portalTaxLabel(data: Pick<PortalData, 'taxLabel'>): string | undefined {
  const value = data.taxLabel?.trim()
  return value && value.length <= 24 ? value : undefined
}

/**
 * Mensaje de «Pedir cambios»: el texto general y, debajo, una línea por ventana con nota.
 * Se recorta al máximo que acepta el servidor (nunca se pierde lo general).
 */
export function composeChangesMessage(general: string, perItem: { label: string; text: string }[], max = 4000): string {
  const lines = perItem.map((p) => ({ label: p.label.trim(), text: p.text.trim() })).filter((p) => p.text)
  const parts = [general.trim(), ...lines.map((p) => `${p.label}: ${p.text}`)].filter(Boolean)
  const message = parts.join('\n')
  return message.length > max ? `${message.slice(0, max - 1)}…` : message
}
