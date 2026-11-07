/**
 * Datos de entrada de los documentos de taller a partir de una OT.
 *
 * Los documentos de taller no guardan datos propios: se calculan al vuelo con el motor
 * (`buildWorkshopData`) desde la cotización, con los ajustes de precio y de corte del
 * taller. Lo usan la web (vista previa e impresión) y el servidor (PDF), así ambos
 * muestran exactamente las mismas cifras.
 */
import {
  buildWorkshopData,
  evaluateQuoteWithBoms,
  roundHalfUp,
  sanitizeCut,
  type Catalog,
  type CutPlan,
  type CutSettings,
  type MaterialCost,
  type MaterialLineDetail,
  type Offcut,
  type PricingSettings,
  type QuoteExtra,
  type QuoteInput,
  type QuoteItemInput,
} from '@dekopen/engine'
import type { Client, DocumentPrefs, Feature, Org, Quote, QuoteItem, Role, WorkOrder } from '@dekopen/shared'
import { WINDOW_TINTS, sideWords as workshopSideWords } from '../workshop/helpers'
import { WORKSHOP_DOCUMENTS, type WorkshopDocumentKind } from '../workshop/registry'
import type { WorkshopDocumentData, WorkshopPaper, WorkshopSale } from '../workshop/types'

/** Paleta de tintes por ventana (la misma de los documentos impresos, para la pantalla). */
export { WINDOW_TINTS }
/** Lado de una pieza en palabras, igual que en el papel: «arr/aba» → «arriba · abajo». */
export { workshopSideWords }

/** Tinte de la ventana en la posición `index` (V1 = 0). */
export function workshopTint(index: number): string {
  const n = WINDOW_TINTS.length
  return WINDOW_TINTS[((Math.trunc(index) % n) + n) % n] ?? '#EEEAE3'
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrada y salida
// ─────────────────────────────────────────────────────────────────────────────

/** La cotización completa de `@dekopen/shared` sirve tal cual; basta con estos campos. */
export type WorkshopQuoteInput = Pick<Quote, 'number' | 'title'> &
  Partial<Pick<Quote, 'client' | 'pricing'>> & {
    items: readonly (Pick<QuoteItem, 'id' | 'ref' | 'qty' | 'design' | 'name' | 'location' | 'notes' | 'manualUnitPrice'> & Partial<Pick<QuoteItem, 'role' | 'altGroup' | 'included' | 'discountPct'>>)[]
    extras?: readonly QuoteExtra[]
    discountPct?: number
  }

export interface WorkshopDocInputArgs {
  quote: WorkshopQuoteInput
  org: Pick<Org, 'name'> & Partial<Pick<Org, 'logo' | 'accent'>>
  catalog: Catalog
  /** Ajustes de la organización (`OrgSettings` sirve tal cual). */
  settings: {
    pricing?: Partial<PricingSettings>
    cut?: Partial<CutSettings>
    documents?: Partial<Pick<DocumentPrefs, 'paper' | 'accent'>>
  }
  workOrder: Pick<WorkOrder, 'number'> & Partial<Pick<WorkOrder, 'createdAt' | 'dueDate' | 'notes' | 'clientName'>> & { fromQuote?: boolean }
  client?: Pick<Client, 'name'> | null
  /**
   * Simulación de corte sin guardar («¿y si uso barras de 6 m o un disco de 3?»). Reemplaza
   * en parte los ajustes del taller y manda sobre el catálogo: `barLength` aplica a todos los
   * perfiles y `kerf`/`trimStart` también a las marcas (ver `simulationCatalog`).
   */
  cut?: Partial<CutSettings> | null
  /** Retazos en bodega para usar antes que barras nuevas. */
  offcuts?: readonly Offcut[]
  /** Papel; por defecto el de los ajustes de documentos (Carta si no hay). */
  paper?: WorkshopPaper
  /** Quita costos y precios de los datos (para quien no debe verlos). */
  redactCosts?: boolean
  /** Fecha de emisión si la OT no trae `createdAt` (ISO). Por defecto hoy. */
  now?: Date
  /** Zona horaria de la fecha de emisión. Por defecto la de Chile. */
  timeZone?: string
}

/** Datos de taller completos: incluyen los avisos del optimizador y el consumo real. */
export type WorkshopDocData = WorkshopDocumentData & { optimization: CutPlan; materials: MaterialLineDetail[] }

/** Props listas para cualquier documento de taller (`<WorkshopDocument {...input} kind="cuts" />`). */
export interface WorkshopDocInput {
  data: WorkshopDocData
  paper: WorkshopPaper
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────────

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/
const HEX = /^#[0-9a-fA-F]{6}$/
const CHILE_TZ = 'America/Santiago'

/** Fecha calendario (AAAA-MM-DD) de un instante en la zona indicada, sin depender del ICU del sistema si falla. */
export function calendarDate(input: string | Date | undefined, timeZone = CHILE_TZ, fallback: Date = new Date()): string {
  // Solo fecha (sin hora): se respeta tal cual, no se corre por zona horaria.
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.trim())) return input.trim()
  const date = input instanceof Date ? input : input ? new Date(input) : fallback
  const valid = Number.isNaN(date.getTime()) ? fallback : date
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(valid)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    const text = `${get('year')}-${get('month')}-${get('day')}`
    if (ISO_DATE.test(text)) return text
  } catch {
    // Zona desconocida: seguimos con UTC.
  }
  return valid.toISOString().slice(0, 10)
}

/** «2026-11-15T00:00:00Z» → «2026-11-15»; vacío o ilegible → undefined. */
function dateOnly(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const m = ISO_DATE.exec(value.trim())
  return m ? `${m[1]}-${m[2]}-${m[3]}` : undefined
}

function cleanText(value: string | null | undefined): string | undefined {
  const text = value?.trim()
  return text ? text : undefined
}

/**
 * Referencias únicas y nunca vacías: los documentos y el avance de la OT se indexan por
 * ref. Una ref vacía pasa a «V<n>» y una repetida a «V1-2», «V1-3»…
 */
export function uniqueRefs(refs: readonly (string | null | undefined)[]): string[] {
  const used = new Set<string>()
  return refs.map((raw, i) => {
    const base = cleanText(raw ?? undefined) ?? `V${i + 1}`
    let ref = base
    let n = 2
    while (used.has(ref.toLowerCase())) ref = `${base}-${n++}`
    used.add(ref.toLowerCase())
    return ref
  })
}

/** Quita costos y precios de los datos de taller (vista de quien no debe verlos). */
export function redactWorkshopCosts<T extends WorkshopDocData>(data: T): T {
  const stripLine = <L extends { unitCost?: number; total?: number }>(line: L): L => {
    const { unitCost: _unitCost, total: _total, ...rest } = line
    return rest as L
  }
  const { sale: _sale, ...rest } = data
  void _sale
  return {
    ...(rest as T),
    materials: data.materials.map(stripLine),
    purchaseOrders: data.purchaseOrders.map((order) => ({ ...order, lines: order.lines.map(stripLine), total: 0 })),
    costs: {
      materials: { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 },
      total: 0,
      perWindow: data.costs.perWindow.map((w) => ({ ...w, unitCost: 0, unitPrice: 0 })),
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Constructor principal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Arma los props de los documentos de taller de una OT con el motor real.
 *
 * - Precio: ajustes del taller + los propios de la cotización (`quote.pricing`).
 * - Corte: ajustes del taller, reemplazados en parte por `cut` (vista previa sin guardar).
 * - Ítems con cantidad 0 no se fabrican y no entran; las refs vacías o repetidas se corrigen.
 * - Nunca lanza por datos incompletos: el motor devuelve resultados parciales y avisos.
 */
export function buildWorkshopDocInput(args: WorkshopDocInputArgs): WorkshopDocInput {
  const { quote, org, catalog, settings, workOrder } = args
  const fabricable = (quote.items ?? []).filter((item) => item && item.design && Number(item.qty) > 0)
  const refs = uniqueRefs(fabricable.map((item) => item.ref))

  const items: QuoteItemInput[] = fabricable.map((item, i) => {
    const input: QuoteItemInput = {
      id: item.id || `item-${i + 1}`,
      ref: refs[i] ?? `V${i + 1}`,
      qty: Math.max(1, Math.round(Number(item.qty) || 1)),
      design: item.design,
    }
    const name = cleanText(item.name)
    const location = cleanText(item.location)
    if (name) input.name = name
    if (location) input.location = location
    if (typeof item.manualUnitPrice === 'number' && Number.isFinite(item.manualUnitPrice)) input.manualUnitPrice = item.manualUnitPrice
    // El motor decide con esto qué se fabrica: un opcional sin marcar o una alternativa descartada no van a producción.
    if (item.role) input.role = item.role
    if (item.altGroup) input.altGroup = item.altGroup
    if (item.included !== undefined) input.included = item.included
    if (item.discountPct) input.discountPct = item.discountPct
    return input
  })

  const override = stripUndefined(args.cut ?? {})
  const cut = sanitizeCut({ ...(settings.cut ?? {}), ...override })
  const quoteInput: QuoteInput = { items, extras: quote.extras ?? [], discountPct: quote.discountPct ?? 0, pricing: quote.pricing }
  const effectiveCatalog = simulationCatalog(catalog, override, cut)
  const workshop = buildWorkshopData(quoteInput, effectiveCatalog, settings.pricing ?? {}, cut, args.offcuts ? { offcuts: args.offcuts } : {})
  // Mismo cálculo que el pie del editor (sin recalcular los BOM): venta tras el descuento,
  // costo prorrateado por familia e IVA de la organización.
  const { sale, ivaPct } = workshopSale(quoteInput, workshop.windows.map((w) => w.bom), effectiveCatalog, settings.pricing ?? {}, cut)

  const windowNotes: Record<string, string> = {}
  fabricable.forEach((item, i) => {
    const note = cleanText(item.notes)
    const ref = refs[i]
    if (note && ref) windowNotes[ref] = note
  })

  const accentCandidate = settings.documents?.accent ?? org.accent
  const clientName = cleanText(args.client?.name) ?? cleanText(quote.client?.name) ?? cleanText(workOrder.clientName)
  const dueDate = dateOnly(workOrder.dueDate)
  const notes = cleanText(workOrder.notes)

  const data: WorkshopDocData = {
    ...workshop,
    org: {
      name: cleanText(org.name) ?? 'Tu taller',
      ...(org.logo ? { logo: org.logo } : {}),
      ...(accentCandidate && HEX.test(accentCandidate) ? { accent: accentCandidate } : {}),
    },
    quote: {
      number: quote.number,
      title: cleanText(quote.title) ?? `Cotización N° ${quote.number}`,
      ...(clientName ? { clientName } : {}),
    },
    workOrder: {
      number: workOrder.number,
      date: calendarDate(workOrder.createdAt, args.timeZone ?? CHILE_TZ, args.now ?? new Date()),
      ...(dueDate ? { dueDate } : {}),
      ...(notes ? { notes } : {}),
      ...(workOrder.fromQuote ? { fromQuote: true } : {}),
    },
    catalog,
    ...(Object.keys(windowNotes).length ? { windowNotes } : {}),
    ivaPct,
    ...(sale ? { sale } : {}),
  }

  return {
    data: args.redactCosts ? redactWorkshopCosts(data) : data,
    paper: args.paper ?? (settings.documents?.paper === 'a4' ? 'a4' : 'letter'),
  }
}

/**
 * Venta y costo de la cotización como los ve el editor (`evaluateQuote`): materiales
 * prorrateados por familia, merma, mano de obra y margen tras el descuento. Nunca lanza: si
 * el motor falla, Costos internos se arma con lo que trae `costs.perWindow`.
 */
function workshopSale(
  quote: QuoteInput,
  boms: WorkshopDocData['windows'][number]['bom'][],
  catalog: Catalog,
  pricing: Partial<PricingSettings>,
  cut: CutSettings,
): { sale?: WorkshopSale; ivaPct: number } {
  try {
    const evaluation = evaluateQuoteWithBoms(quote, boms, catalog, pricing, { cut })
    const materials: MaterialCost = { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 }
    let waste = 0
    let labor = 0
    let install = 0
    for (const item of evaluation.items) {
      // Lo que quedó fuera del total tampoco suma aquí: `t.cost` ya no lo cuenta.
      if (item.price.pending?.length && !(item.price.totalNet > 0)) continue
      const qty = Math.max(0, Number(item.price.qty) || 0)
      for (const key of Object.keys(materials) as (keyof MaterialCost)[]) materials[key] += (item.price.materials[key] ?? 0) * qty
      waste += (item.price.waste ?? 0) * qty
      labor += (item.price.labor ?? 0) * qty
      install += (item.price.install ?? 0) * qty
    }
    for (const key of Object.keys(materials) as (keyof MaterialCost)[]) materials[key] = roundHalfUp(materials[key])
    const t = evaluation.totals
    return {
      ivaPct: evaluation.pricing.ivaPct,
      sale: {
        subtotal: t.subtotal,
        discountPct: t.discountPct,
        discount: t.discount,
        extras: t.extras,
        cost: t.cost,
        marginPct: t.marginPct,
        materials,
        waste: roundHalfUp(waste),
        labor: roundHalfUp(labor),
        install: roundHalfUp(install),
      },
    }
  } catch {
    const iva = Number(pricing.ivaPct)
    return { ivaPct: Number.isFinite(iva) && iva >= 0 ? iva : 19 }
  }
}

/**
 * Catálogo para simular ajustes de corte sin guardarlos: lo que escribes es lo que se usa.
 * - `barLength`: el motor usa el largo de barra de cada perfil del catálogo; la simulación
 *   lo reemplaza en todos los perfiles («¿y si compro barras de 6 m?»).
 * - `kerf` / `trimStart`: el motor toma el mayor entre el taller y la marca; la simulación
 *   iguala la marca a lo escrito para que un disco más fino se note.
 * Sin ajustes simulados devuelve el mismo catálogo.
 */
export function simulationCatalog(catalog: Catalog, override: Partial<CutSettings>, cut: CutSettings): Catalog {
  const bar = override.barLength !== undefined
  const kerf = override.kerf !== undefined
  const trim = override.trimStart !== undefined
  if (!bar && !kerf && !trim) return catalog
  return {
    ...catalog,
    profiles: bar ? catalog.profiles.map((p) => ({ ...p, barLength: cut.barLength })) : catalog.profiles,
    brandSettings:
      kerf || trim
        ? catalog.brandSettings.map((b) => ({ ...b, ...(kerf ? { kerf: cut.kerf } : {}), ...(trim ? { trim: cut.trimStart } : {}) }))
        : catalog.brandSettings,
  }
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [key, v] of Object.entries(value) as [keyof T, T[keyof T]][]) {
    if (v !== undefined && v !== null && !(typeof v === 'number' && !Number.isFinite(v))) out[key] = v
  }
  return out
}

/** ¿Los ajustes de corte `override` cambian algo respecto de `base`? */
export function cutDiffers(base: Partial<CutSettings> | undefined, override: Partial<CutSettings> | null | undefined): boolean {
  if (!override) return false
  const a = sanitizeCut(base ?? {})
  const b = sanitizeCut({ ...(base ?? {}), ...stripUndefined(override) })
  return (Object.keys(a) as (keyof CutSettings)[]).some((key) => a[key] !== b[key])
}

// ─────────────────────────────────────────────────────────────────────────────
// Acceso por plan y rol, y nombres de archivo
// ─────────────────────────────────────────────────────────────────────────────

const KINDS = new Set<string>(WORKSHOP_DOCUMENTS.map((d) => d.kind))

export function isWorkshopDocumentKind(value: unknown): value is WorkshopDocumentKind {
  return typeof value === 'string' && KINDS.has(value)
}

export interface WorkshopViewer {
  role: Role
  features: readonly Feature[]
}

export type WorkshopDocumentAccess =
  | { visible: true; locked?: undefined }
  /** Se ve con la explicación del plan (PlanGate), no se descarga. */
  | { visible: true; locked: Feature }
  /** No corresponde a este rol (costos o precios). */
  | { visible: false; reason: string }

/**
 * Qué documentos ve cada persona. Sin la función «roles» del plan, todos ven todo (una
 * persona o un equipo chico). Con roles: los costos internos (precio y margen) solo el
 * dueño; materiales con costo y compras, dueño y jefe de taller.
 */
export function workshopDocumentAccess(kind: WorkshopDocumentKind, viewer: WorkshopViewer): WorkshopDocumentAccess {
  const info = WORKSHOP_DOCUMENTS.find((d) => d.kind === kind)
  const rolesOn = viewer.features.includes('roles')
  if (rolesOn) {
    if (kind === 'costs' && viewer.role !== 'owner') {
      return { visible: false, reason: 'Los costos internos y el margen los ve solo el dueño de la cuenta.' }
    }
    if ((kind === 'materials-costs' || kind === 'purchase') && viewer.role !== 'owner' && viewer.role !== 'workshop') {
      return { visible: false, reason: 'Los costos de materiales los ven el dueño y el jefe de taller.' }
    }
  }
  if (info?.feature && !viewer.features.includes(info.feature)) return { visible: true, locked: info.feature }
  return { visible: true }
}

/** ¿Puede ver costos de materiales? (dueño y jefe de taller con roles; todos sin roles). */
export function canSeeWorkshopCosts(viewer: WorkshopViewer): boolean {
  return workshopDocumentAccess('materials-costs', viewer).visible
}

/** Nombre de archivo del PDF: «OT-38-Cortes.pdf». */
export function workshopDocumentFileName(kind: WorkshopDocumentKind, workOrderNumber: number | string, ext = 'pdf'): string {
  const base = WORKSHOP_DOCUMENTS.find((d) => d.kind === kind)?.fileName ?? 'Documento'
  const number = String(workOrderNumber).replace(/[^\w-]+/g, '')
  return `OT-${number}-${base}.${ext}`
}

/** Lo mismo para un documento de una cotización sin OT: «Cotizacion-412-Cortes.pdf». */
export function quoteWorkshopFileName(kind: WorkshopDocumentKind, quoteNumber: number | string, ext = 'pdf'): string {
  return workshopDocumentFileName(kind, quoteNumber, ext).replace(/^OT-/, 'Cotizacion-')
}
