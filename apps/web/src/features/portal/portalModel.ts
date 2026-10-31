/**
 * Lógica pura del portal del cliente: ventanas con su dibujo y precio, extras visibles,
 * contacto, vigencia y colores de la marca del taller. Se prueba en portalModel.test.ts.
 */
import {
  computeLayout,
  designName,
  formatSize,
  type Catalog,
  type Layout,
  type QuoteExtra,
  type WindowDesign,
} from '@framezen/engine'
import { contrast, ensureContrast, isHex, parseHex, quoteDocLine, readableOn, toHex } from '@framezen/documents'
import type { PublicQuote, QuoteItem, QuoteStatus } from '@framezen/shared'
import { whatsappNumber } from '../home/homeModel'

/** Lo que devuelve GET /api/public/quotes/:token (contrato + precios por ítem y letra de versión). */
export type PortalData = PublicQuote & {
  prices?: Record<string, { unitNet: number; totalNet: number }>
  revisionLabel?: string
}

export interface PortalItem {
  id: string
  ref: string
  title: string
  name?: string
  location?: string
  qty: number
  design: WindowDesign
  layout: Layout | null
  size: string
  /** m² por unidad. */
  area: number
  lineName?: string
  colorName?: string
  colorHex?: string
  colorInName?: string
  glassName?: string
  notes?: string
  unitNet: number
  totalNet: number
}

function safeLayout(design: WindowDesign, catalog: Catalog): Layout | null {
  try {
    return computeLayout(design, catalog)
  } catch {
    return null
  }
}

function safeLine(design: WindowDesign, catalog: Catalog): string | undefined {
  try {
    return quoteDocLine(design, catalog) || undefined
  } catch {
    return undefined
  }
}

function safeName(design: WindowDesign): string {
  try {
    return designName(design)
  } catch {
    return 'Ventana'
  }
}

/** Cantidad que cuenta para el cliente: la misma regla que buildQuoteDocData (no finita = 0). */
function itemQty(item: QuoteItem): number {
  return Number.isFinite(item.qty) ? item.qty : 0
}

/**
 * Ventanas del portal con todo lo que el cliente necesita ver (sin costos internos).
 * Igual que el PDF, las ventanas con cantidad 0 («en pausa») no se muestran ni se cuentan.
 */
export function portalItems(data: Pick<PortalData, 'quote' | 'catalog' | 'prices'>): PortalItem[] {
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
    return {
      id: item.id,
      ref: item.ref,
      title: safeName(d),
      name: item.name,
      location: item.location,
      qty,
      design: d,
      layout: safeLayout(d, catalog),
      size: formatSize(d.width, d.height),
      area: Math.round(((d.width * d.height) / 1_000_000) * 100) / 100,
      // Igual que el PDF: «PVC Proline PROSLD70».
      lineName: safeLine(d, catalog),
      colorName: color?.name,
      colorHex: color?.hex,
      colorInName: colorIn?.name,
      glassName: glass?.name,
      notes: item.notes,
      unitNet: unit,
      totalNet: price?.totalNet ?? unit * qty,
    }
  })
}

/** Extras visibles uno a uno; los ocultos se suman en «Servicios adicionales». */
export function visibleExtras(extras: readonly QuoteExtra[] | undefined): { label: string; amount: number }[] {
  const list = extras ?? []
  const shown = list.filter((e) => !e.hidden && e.amount !== 0).map((e) => ({ label: e.label || 'Adicional', amount: e.amount }))
  const hidden = list.filter((e) => e.hidden).reduce((acc, e) => acc + e.amount, 0)
  if (hidden !== 0) shown.push({ label: 'Servicios adicionales', amount: hidden })
  return shown
}

export const ACCEPTED_STATUSES: QuoteStatus[] = ['accepted', 'workshop', 'installed', 'closed']

export function isAccepted(status: QuoteStatus): boolean {
  return ACCEPTED_STATUSES.includes(status)
}

/** Fecha hasta la que vale la cotización (la guardada o envío + días de vigencia). */
export function validUntil(quote: Pick<PortalData['quote'], 'validUntil' | 'sentAt' | 'createdAt'>, validityDays: number): Date | null {
  if (quote.validUntil) {
    const d = new Date(quote.validUntil)
    if (!Number.isNaN(d.getTime())) return d
  }
  const base = quote.sentAt ?? quote.createdAt
  if (!base || !(validityDays > 0)) return null
  const d = new Date(base)
  if (Number.isNaN(d.getTime())) return null
  d.setDate(d.getDate() + validityDays)
  return d
}

export interface ContactLink {
  kind: 'whatsapp' | 'phone' | 'email' | 'web'
  label: string
  href: string
}

/** Formas de contactar al taller (WhatsApp primero: es lo que más se usa en Chile). */
export function contactLinks(org: PortalData['org'], quoteNumber?: number): ContactLink[] {
  const out: ContactLink[] = []
  const wa = whatsappNumber(org.phone)
  if (wa) {
    const text = quoteNumber ? `Hola, te escribo por la cotización N° ${quoteNumber}.` : 'Hola'
    out.push({ kind: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/${wa}?text=${encodeURIComponent(text)}` })
  }
  if (org.phone) out.push({ kind: 'phone', label: org.phone, href: `tel:${org.phone.replace(/[^\d+]/g, '')}` })
  if (org.email) out.push({ kind: 'email', label: org.email, href: `mailto:${org.email}${quoteNumber ? `?subject=${encodeURIComponent(`Cotización N° ${quoteNumber}`)}` : ''}` })
  if (org.website) {
    const url = /^https?:\/\//i.test(org.website) ? org.website : `https://${org.website}`
    out.push({ kind: 'web', label: org.website.replace(/^https?:\/\//i, '').replace(/\/$/, ''), href: url })
  }
  return out
}

export const DEFAULT_PORTAL_ACCENT = '#2747C2'

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
    soft: `color-mix(in srgb, ${base} 9%, white)`,
  }
}

/** Validación del formulario de aceptación: el nombre es lo único que pide el servidor. */
export function acceptNameError(name: string): string | null {
  const n = name.trim()
  if (n.length >= 2) return null
  return n.length === 0 ? 'Escribe tu nombre para dejar registrada la aceptación.' : 'Escribe tu nombre completo.'
}

/** Condiciones escritas por el taller («- » al inicio = viñeta). */
export function conditionLines(text: string | undefined): { bullet: boolean; text: string }[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/^[-•*]\s+/.test(l) ? { bullet: true, text: l.replace(/^[-•*]\s+/, '') } : { bullet: false, text: l }))
}

/** Nombre del archivo PDF: «Cotizacion-412-B.pdf». */
export function pdfFileName(number: number, revisionLabel?: string): string {
  return `Cotizacion-${number}${revisionLabel ? `-${revisionLabel}` : ''}.pdf`
}
