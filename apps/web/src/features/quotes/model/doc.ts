/**
 * El «documento» editable de una cotización: lo que el usuario cambia y lo que viaja en el
 * autoguardado. Todo es inmutable (cada cambio crea objetos nuevos y comparte el resto), así el
 * historial de deshacer guarda documentos completos sin costo y el motor reutiliza cálculos.
 */
import type { Id, PricingSettings, QuoteExtra, QuoteTotals, WindowDesign } from '@framezen/engine'
import type { QuoteDocOverrides } from '@framezen/documents'
import type { Client, Quote, QuoteItem, QuoteSaveBody, QuoteStatus } from '@framezen/shared'

export interface QuoteDoc {
  title: string
  clientId?: Id
  items: QuoteItem[]
  extras: QuoteExtra[]
  discountPct: number
  pricing?: Partial<PricingSettings>
  /** Notas internas (nunca llegan al cliente). */
  notes?: string
  documentOverrides?: QuoteDocOverrides
  validUntil?: string
}

/** Datos de la cotización que no se editan aquí (cambian por envío, estado o guardado). */
export interface QuoteMeta {
  id: Id
  number: number
  status: QuoteStatus
  revision: number
  version: number
  shareToken?: string
  createdAt: string
  updatedAt: string
  sentAt?: string
  acceptedAt?: string
  acceptedBy?: Quote['acceptedBy']
  deletedAt?: string
  /**
   * Totales que calculó el servidor en el último guardado o envío. Si nada se guardó después de
   * enviarla, son los que ve el cliente: sirven para notar que tus precios cambiaron desde entonces.
   */
  totals?: QuoteTotals
}

// ── Igualdad profunda (las claves con undefined cuentan como ausentes) ─────────

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const bb = b as unknown[]
    if (a.length !== bb.length) return false
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], bb[i])) return false
    return true
  }
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)])
  for (const key of keys) {
    if (ra[key] === undefined && rb[key] === undefined) continue
    if (!deepEqual(ra[key], rb[key])) return false
  }
  return true
}

// ── Normalización (igual a lo que guarda el servidor) ─────────────────────────

/**
 * Topes que valida el servidor al guardar (apps/server/src/routes/quotes.ts). Un texto o una cifra
 * fuera de rango haría fallar cada PUT (el documento viaja completo), así que el editor recorta
 * antes de enviar y los campos usan los mismos topes como `maxLength`.
 */
export const QUOTE_LIMITS = {
  title: 200,
  ref: 20,
  itemName: 200,
  itemLocation: 200,
  itemNotes: 4000,
  extraLabel: 200,
  notes: 20_000,
  validUntil: 40,
  qty: 100_000,
  money: 10_000_000_000,
  /** marginPct del ajuste por cotización (margen o recargo). */
  marginPct: 95,
} as const

/** Recorta a `max` unidades UTF-16 (lo que cuenta el servidor) sin partir un emoji por la mitad. */
export function clipText(value: string, max: number): string {
  if (value.length <= max) return value
  let out = value.slice(0, max)
  const last = out.charCodeAt(out.length - 1)
  if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1)
  return out
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const text = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  return value.trim() ? value : undefined
}

const isEmptyObject = (value: unknown): boolean =>
  !value || (typeof value === 'object' && Object.values(value as object).every((v) => v === undefined))

export function normalizeItem(item: QuoteItem, index = 0): QuoteItem {
  const out: QuoteItem = {
    id: item.id,
    ref: clipText((item.ref ?? '').trim(), QUOTE_LIMITS.ref).trim() || `V${index + 1}`,
    qty: Number.isFinite(item.qty) ? clamp(Math.round(item.qty), 0, QUOTE_LIMITS.qty) : 0,
    design: item.design,
  }
  const name = text(item.name)
  if (name) out.name = clipText(name.trim(), QUOTE_LIMITS.itemName)
  const location = text(item.location)
  if (location) out.location = clipText(location.trim(), QUOTE_LIMITS.itemLocation)
  const notes = text(item.notes)
  if (notes) out.notes = clipText(notes, QUOTE_LIMITS.itemNotes)
  if (typeof item.manualUnitPrice === 'number' && Number.isFinite(item.manualUnitPrice) && item.manualUnitPrice >= 0) {
    out.manualUnitPrice = Math.min(item.manualUnitPrice, QUOTE_LIMITS.money)
  }
  return out
}

export function normalizeExtra(extra: QuoteExtra): QuoteExtra {
  const out: QuoteExtra = {
    id: extra.id,
    label: clipText((extra.label ?? '').trim(), QUOTE_LIMITS.extraLabel).trim(),
    amount: Number.isFinite(extra.amount) ? clamp(Math.round(extra.amount), -QUOTE_LIMITS.money, QUOTE_LIMITS.money) : 0,
  }
  if (extra.hidden) out.hidden = true
  return out
}

/** Ajuste de precio por cotización dentro de lo que acepta el servidor (margen 0–95 %). */
function normalizePricing(pricing: Partial<PricingSettings>): Partial<PricingSettings> {
  const pct = pricing.marginPct
  if (pct === undefined || !Number.isFinite(pct) || (pct >= 0 && pct <= QUOTE_LIMITS.marginPct)) return pricing
  return { ...pricing, marginPct: clamp(pct, 0, QUOTE_LIMITS.marginPct) }
}

/** Forma canónica del documento (la que se compara y se envía). */
export function normalizeDoc(doc: QuoteDoc): QuoteDoc {
  const out: QuoteDoc = {
    title: clipText((doc.title ?? '').trim(), QUOTE_LIMITS.title).trim(),
    items: (doc.items ?? []).map(normalizeItem),
    extras: (doc.extras ?? []).map(normalizeExtra),
    discountPct: Number.isFinite(doc.discountPct) ? Math.min(100, Math.max(0, doc.discountPct)) : 0,
  }
  if (doc.clientId) out.clientId = doc.clientId
  if (doc.pricing && !isEmptyObject(doc.pricing)) out.pricing = normalizePricing(doc.pricing)
  const notes = text(doc.notes)
  if (notes) out.notes = clipText(notes, QUOTE_LIMITS.notes)
  if (doc.documentOverrides && !isEmptyObject(doc.documentOverrides)) out.documentOverrides = doc.documentOverrides
  const validUntil = text(doc.validUntil)
  if (validUntil) out.validUntil = clipText(validUntil, QUOTE_LIMITS.validUntil)
  return out
}

export function docFromQuote(quote: Quote): QuoteDoc {
  return normalizeDoc({
    title: quote.title ?? '',
    clientId: quote.clientId,
    items: quote.items ?? [],
    extras: quote.extras ?? [],
    discountPct: quote.discountPct ?? 0,
    pricing: quote.pricing,
    notes: quote.notes,
    documentOverrides: quote.documentOverrides as QuoteDocOverrides | undefined,
    validUntil: quote.validUntil,
  })
}

export function metaFromQuote(quote: Quote & { deletedAt?: string }): QuoteMeta {
  return {
    id: quote.id,
    number: quote.number,
    status: quote.status,
    revision: quote.revision ?? 0,
    version: quote.version,
    shareToken: quote.shareToken,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
    sentAt: quote.sentAt,
    acceptedAt: quote.acceptedAt,
    acceptedBy: quote.acceptedBy,
    deletedAt: quote.deletedAt,
    totals: quote.totals,
  }
}

/**
 * Cuerpo del PUT. Los opcionales ausentes viajan como null: así el servidor los borra (un
 * undefined significaría «no lo toques»).
 */
export function saveBody(doc: QuoteDoc, meta: Pick<QuoteMeta, 'status' | 'version'>): QuoteSaveBody {
  const n = normalizeDoc(doc)
  return {
    title: n.title,
    clientId: n.clientId ?? null,
    items: n.items,
    extras: n.extras,
    discountPct: n.discountPct,
    pricing: n.pricing ?? null,
    notes: n.notes ?? null,
    documentOverrides: n.documentOverrides ?? null,
    validUntil: n.validUntil ?? null,
    status: meta.status,
    version: meta.version,
  } as unknown as QuoteSaveBody
}

/** Cotización completa (para el asistente, el documento y el portal). */
export function composeQuote(meta: QuoteMeta, doc: QuoteDoc, extra: { client?: Client; totals?: Quote['totals'] } = {}): Quote {
  const quote: Quote = {
    id: meta.id,
    number: meta.number,
    title: doc.title,
    status: meta.status,
    items: doc.items,
    extras: doc.extras,
    discountPct: doc.discountPct,
    revision: meta.revision,
    version: meta.version,
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
  }
  if (doc.clientId) quote.clientId = doc.clientId
  if (extra.client && extra.client.id === doc.clientId) quote.client = extra.client
  if (doc.pricing) quote.pricing = doc.pricing
  if (doc.notes) quote.notes = doc.notes
  if (doc.documentOverrides) quote.documentOverrides = doc.documentOverrides
  if (doc.validUntil) quote.validUntil = doc.validUntil
  if (meta.shareToken) quote.shareToken = meta.shareToken
  if (meta.sentAt) quote.sentAt = meta.sentAt
  if (meta.acceptedAt) quote.acceptedAt = meta.acceptedAt
  if (meta.acceptedBy) quote.acceptedBy = meta.acceptedBy
  if (extra.totals) quote.totals = extra.totals
  return quote
}

// ── Referencias e ids ─────────────────────────────────────────────────────────

/** Id corto para ítems nuevos (el servidor lo conserva si es único). */
export function newItemId(): Id {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : Math.random().toString(36).slice(2, 12)
  return `i${random}`
}

export function newExtraId(): Id {
  return newItemId().replace(/^i/, 'x')
}

/** Siguiente «V» libre: si hay V1, V2 y V7, la siguiente es V8. */
export function nextRef(items: readonly Pick<QuoteItem, 'ref'>[]): string {
  let max = 0
  for (const item of items) {
    const match = /^v\s*(\d+)$/i.exec(item.ref?.trim() ?? '')
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `V${Math.max(max, items.length) + 1}`
}

/** ¿Las referencias siguen la numeración automática V1, V2…? (entonces se mantiene al mover o borrar). */
export function isAutoSequence(items: readonly Pick<QuoteItem, 'ref'>[]): boolean {
  return items.every((item, i) => item.ref?.trim().toUpperCase() === `V${i + 1}`)
}

export function renumber(items: QuoteItem[]): QuoteItem[] {
  return items.map((item, i) => (item.ref === `V${i + 1}` ? item : { ...item, ref: `V${i + 1}` }))
}

// ── Operaciones puras ─────────────────────────────────────────────────────────

export function itemIndex(doc: QuoteDoc, id: Id): number {
  return doc.items.findIndex((item) => item.id === id)
}

export function findItem(doc: QuoteDoc, id: Id | null | undefined): QuoteItem | undefined {
  return id ? doc.items.find((item) => item.id === id) : undefined
}

export function addItemOp(
  doc: QuoteDoc,
  input: { id: Id; design: WindowDesign; qty?: number; location?: string; ref?: string; name?: string; notes?: string; manualUnitPrice?: number },
  index = doc.items.length,
): QuoteDoc {
  const item: QuoteItem = {
    id: input.id,
    ref: input.ref?.trim() || nextRef(doc.items),
    qty: input.qty !== undefined && Number.isFinite(input.qty) ? Math.max(0, Math.round(input.qty)) : 1,
    design: input.design,
  }
  if (input.name?.trim()) item.name = input.name.trim()
  if (input.location?.trim()) item.location = input.location.trim()
  if (input.notes?.trim()) item.notes = input.notes
  if (input.manualUnitPrice !== undefined) item.manualUnitPrice = input.manualUnitPrice
  const items = [...doc.items]
  items.splice(Math.max(0, Math.min(index, items.length)), 0, item)
  return { ...doc, items }
}

export function duplicateItemOp(doc: QuoteDoc, id: Id, newId: Id): QuoteDoc {
  const index = itemIndex(doc, id)
  if (index < 0) return doc
  const source = doc.items[index]
  const auto = isAutoSequence(doc.items)
  const copy: QuoteItem = { ...source, id: newId, ref: nextRef(doc.items) }
  const items = [...doc.items]
  items.splice(index + 1, 0, copy)
  return { ...doc, items: auto ? renumber(items) : items }
}

export function removeItemOp(doc: QuoteDoc, id: Id): QuoteDoc {
  const index = itemIndex(doc, id)
  if (index < 0) return doc
  const auto = isAutoSequence(doc.items)
  const items = doc.items.filter((item) => item.id !== id)
  return { ...doc, items: auto ? renumber(items) : items }
}

export function moveItemOp(doc: QuoteDoc, from: number, to: number): QuoteDoc {
  if (from === to || from < 0 || from >= doc.items.length) return doc
  const target = Math.max(0, Math.min(to, doc.items.length - 1))
  const auto = isAutoSequence(doc.items)
  const items = [...doc.items]
  const [moved] = items.splice(from, 1)
  items.splice(target, 0, moved)
  return { ...doc, items: auto ? renumber(items) : items }
}

/** Reordena según una lista de ids (arrastrar y soltar). Ids desconocidos se ignoran. */
export function reorderItemsOp(doc: QuoteDoc, ids: readonly Id[]): QuoteDoc {
  const byId = new Map(doc.items.map((item) => [item.id, item]))
  const ordered = ids.map((id) => byId.get(id)).filter((item): item is QuoteItem => !!item)
  const rest = doc.items.filter((item) => !ids.includes(item.id))
  const items = [...ordered, ...rest]
  if (items.every((item, i) => item === doc.items[i])) return doc
  return { ...doc, items: isAutoSequence(doc.items) ? renumber(items) : items }
}

export function updateItemOp(doc: QuoteDoc, id: Id, patch: Partial<Omit<QuoteItem, 'id' | 'design'>>): QuoteDoc {
  const index = itemIndex(doc, id)
  if (index < 0) return doc
  const current = doc.items[index]
  const next: QuoteItem = { ...current }
  for (const [key, value] of Object.entries(patch) as [keyof QuoteItem, unknown][]) {
    if (value === undefined || value === null || value === '') delete (next as unknown as Record<string, unknown>)[key]
    else (next as unknown as Record<string, unknown>)[key] = value
  }
  if (next.qty === undefined) next.qty = current.qty
  if (!next.ref) next.ref = current.ref
  if (deepEqual(next, current)) return doc
  const items = [...doc.items]
  items[index] = next
  return { ...doc, items }
}

export function updateDesignOp(doc: QuoteDoc, id: Id, fn: (design: WindowDesign) => WindowDesign): QuoteDoc {
  const index = itemIndex(doc, id)
  if (index < 0) return doc
  const current = doc.items[index]
  const design = fn(current.design)
  if (!design || design === current.design) return doc
  const items = [...doc.items]
  items[index] = { ...current, design }
  return { ...doc, items }
}

export function setDocumentOverrideOp(doc: QuoteDoc, patch: QuoteDocOverrides): QuoteDoc {
  const next: Record<string, unknown> = { ...(doc.documentOverrides ?? {}) }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) delete next[key]
    else next[key] = value
  }
  const overrides = Object.keys(next).length ? (next as QuoteDocOverrides) : undefined
  if (deepEqual(overrides, doc.documentOverrides)) return doc
  return { ...doc, documentOverrides: overrides }
}

// ── Fusión de cambios ante un conflicto de versión (409) ──────────────────────

const SCALAR_KEYS = ['title', 'clientId', 'discountPct', 'pricing', 'notes', 'documentOverrides', 'validUntil', 'extras'] as const

export interface MergeResult {
  doc: QuoteDoc
  /** false = los mismos datos cambiaron de forma distinta en ambos lados. */
  clean: boolean
  /** Hubo cambios del otro lado que se sumaron. */
  remoteChanged: boolean
}

/**
 * Fusión a tres bandas: `base` es lo último que sabemos que guardó el servidor, `local` lo que
 * hay en pantalla y `remote` la versión nueva del servidor. Toma cada campo y cada ventana del
 * lado que lo cambió; si ambos cambiaron lo mismo de forma distinta, la fusión no es limpia.
 */
export function mergeDocs(baseIn: QuoteDoc, localIn: QuoteDoc, remoteIn: QuoteDoc): MergeResult {
  const base = normalizeDoc(baseIn)
  const local = normalizeDoc(localIn)
  const remote = normalizeDoc(remoteIn)
  let clean = true
  let remoteChanged = false
  const out: QuoteDoc = { ...remote }

  for (const key of SCALAR_KEYS) {
    const lc = !deepEqual(base[key], local[key])
    const rc = !deepEqual(base[key], remote[key])
    if (rc) remoteChanged = true
    if (lc && rc && !deepEqual(local[key], remote[key])) clean = false
    ;(out as unknown as Record<string, unknown>)[key] = lc ? local[key] : remote[key]
  }

  const baseById = new Map(base.items.map((i) => [i.id, i]))
  const localById = new Map(local.items.map((i) => [i.id, i]))
  const remoteById = new Map(remote.items.map((i) => [i.id, i]))
  const ids = new Set([...baseById.keys(), ...localById.keys(), ...remoteById.keys()])
  const chosen = new Map<Id, QuoteItem>()
  for (const id of ids) {
    const b = baseById.get(id)
    const l = localById.get(id)
    const r = remoteById.get(id)
    const lc = !deepEqual(b, l)
    const rc = !deepEqual(b, r)
    if (rc) remoteChanged = true
    if (lc && rc && !deepEqual(l, r)) clean = false
    const pick = lc ? l : r
    if (pick) chosen.set(id, pick)
  }

  // Orden: si cambió aquí, manda el local (lo nuevo del otro lado va al final); si no, el remoto.
  const order = (doc: QuoteDoc) => doc.items.map((i) => i.id).filter((id) => baseById.has(id))
  const localReordered = !deepEqual(order(local), order(base))
  const remoteReordered = !deepEqual(order(remote), order(base))
  if (remoteReordered) remoteChanged = true
  if (localReordered && remoteReordered && !deepEqual(order(local), order(remote))) clean = false
  const primary = localReordered ? local : remote
  const secondary = localReordered ? remote : local
  const sequence: Id[] = []
  for (const item of primary.items) if (chosen.has(item.id) && !sequence.includes(item.id)) sequence.push(item.id)
  for (const item of secondary.items) if (chosen.has(item.id) && !sequence.includes(item.id)) sequence.push(item.id)
  let items = sequence.map((id) => chosen.get(id) as QuoteItem)

  // Ventanas nuevas en ambos lados con la misma referencia: la local toma la siguiente libre.
  const seen = new Set<string>()
  let free = items.reduce((max, item) => Math.max(max, Number(/^v\s*(\d+)$/i.exec(item.ref.trim())?.[1] ?? 0)), 0) + 1
  items = items.map((item) => {
    const key = item.ref.toUpperCase()
    if (!seen.has(key)) {
      seen.add(key)
      return item
    }
    const ref = `V${free++}`
    seen.add(ref.toUpperCase())
    return { ...item, ref }
  })
  out.items = items
  return { doc: normalizeDoc(out), clean, remoteChanged }
}
