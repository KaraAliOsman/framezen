/**
 * Modelo de render de una cotización con plantilla: plantilla elegida ⊕ capa de organización ⊕
 * ajustes de la cotización (v1 o v2), idioma del documento, moneda, textos efectivos, validez,
 * marcadores y geometría de página. Puro: lo usan la vista previa, el PDF y las pruebas.
 */
import type { PdfPaymentDetails } from '@dekopen/shared'
import { includedLineIds } from '@dekopen/engine'
import {
  DEFAULT_QUOTE_PRESET_ID,
  getDocPreset,
  isDocPresetId,
  resolveDocTemplateRef,
  resolveQuoteDocument,
  validateDocTemplate,
  type DocIssue,
  type DocTemplate,
  type DocTexts,
  type DocTheme,
  type DocumentPrefs,
  type Locale,
  type PlaceholderKey,
  type ResolvedCustomField,
  type ResolvedDocSettings,
} from '@dekopen/shared'
import { addDays, revisionLetter } from '../base/format'
import type { QuoteDocData, QuoteDocField } from '../sales/types'
import { docLocaleKit, type DocLocaleKit } from '../i18n'
import { quoteDocGroups, type QuoteDocDataV5, type QuoteDocGroup, type QuoteDocItemV5 } from '../data/quote'
import { createDrawingDefs, type DrawingDefsData, type TextureSources } from '../textures'
import { pageGeometry, type PageGeometry } from './page'
import { totalGuard, type TotalGuard } from './total-guard'
import { resolveThemeTokens, type ResolvedThemeTokens } from './theme'

/** Texto de sección editable en pantalla (editor de plantillas). */
export type SectionTextSlot = 'title' | 'subtitle' | 'content'

export interface QuoteRenderOptions {
  /** Plantilla a usar: objeto (editor), id de diseño o id v4. Sin dato: la de los datos/ajustes. */
  template?: string | DocTemplate | null
  /** Fuerza el idioma del documento (vista previa en otro idioma). */
  locale?: Locale
  editable?: boolean
  onEdit?: (field: QuoteDocField, value: string) => void
  /** Edición en el lugar de títulos y textos libres de una sección (editor de plantillas). */
  onSectionEdit?: (sectionId: string, slot: SectionTextSlot, value: string) => void
  /** Sección elegida en el lienzo: lo opcional que aún no existe (un título) se ofrece solo ahí. */
  selectedSectionId?: string
  /** Avisos de lo que falta escribir (por defecto, si se editan secciones). Una cotización real no los lleva. */
  guides?: boolean
  /** Campos que se pueden escribir aquí (sin dato: todos). En una plantilla no hay obra ni nota. */
  editableFields?: readonly QuoteDocField[]
  /** Edición en el lugar del nombre y la nota de una ventana (solo en una cotización real). */
  onItemEdit?: (itemId: string, field: 'name' | 'note', value: string) => void
}

export interface QuoteTexts {
  intro: string
  conditions: string
  paymentTerms: string
  warranty: string
  leadTimeText: string
  signatureName: string
  footer: string
  clientNote: string
  includes: string
  excludes: string
}

/** Logo de marca listo para imprimir. Una marca sin logo no tiene `BrandMark`: nunca se escribe en texto. */
export interface BrandMark {
  key: string
  kind: 'profile' | 'hardware'
  name: string
  src: string
}

/** Unidades que se fabrican de un ítem: su cantidad y, si es un conjunto, por cada unidad que lo forma. */
export function itemUnits(item: Pick<QuoteDocItemV5, 'qty' | 'assembly'>): number {
  return item.qty * Math.max(1, item.assembly?.units.length ?? 1)
}

export function countUnits(items: readonly Pick<QuoteDocItemV5, 'qty' | 'assembly'>[]): number {
  return items.reduce((sum, item) => sum + itemUnits(item), 0)
}

/** «4 ventanas», o «3 ítems» cuando alguno es un conjunto de varias ventanas: ahí «ventana» no sería cierto. */
export function itemsLabel(m: Pick<QuoteModel, 'kit'>, items: readonly Pick<QuoteDocItemV5, 'assembly' | 'typologyId'>[]): string {
  const { t } = m.kit
  if (items.some((i) => i.assembly)) return t('summary.itemsCount', { count: items.length })
  const doors = items.filter((i) => i.typologyId?.includes('door')).length
  const windows = items.length - doors
  if (!doors) return t('summary.windowsCount', { count: windows })
  if (!windows) return t('summary.doorsCount', { count: doors })
  return t('summary.windowsAndDoors', { windows: t('summary.windowsCount', { count: windows }), doors: t('summary.doorsCount', { count: doors }) })
}

/** «4 ventanas», y las unidades solo si dicen algo más: «4 ventanas, 7 unidades». */
export function itemsAndUnits(m: Pick<QuoteModel, 'kit'>, items: readonly Pick<QuoteDocItemV5, 'assembly' | 'typologyId' | 'qty'>[], label = itemsLabel(m, items)): string {
  const units = countUnits(items)
  return units === items.length ? label : m.kit.t('summary.windowsAndUnits', { windows: label, units: m.kit.t('summary.unitsCount', { count: units }) })
}

export interface QuoteModel {
  data: QuoteDocDataV5
  items: QuoteDocItemV5[]
  /** Ventanas que cuentan en el total (sin opcionales apagados ni alternativas no elegidas). */
  counted: QuoteDocItemV5[]
  /** Ids de ventanas y partidas que cuentan en el total. */
  included: Set<string>
  /** Unidades físicas de `counted`: un conjunto cuenta por las unidades que lo forman. */
  units: number
  template: DocTemplate
  settings: ResolvedDocSettings
  customFields: ResolvedCustomField[]
  /** «Cotización», «Presupuesto», «Oferta técnica»… */
  /** Datos de pago que el taller eligió imprimir, o null. */
  paymentDetails: PdfPaymentDetails | null
  docTitle: string
  /** «N° 412» o «COT-000412». */
  docNumber: string
  /** Número y revisión, sin el título. */
  numberLabel: string
  /** Logos de marca que corresponde mostrar. */
  brands: { profile: BrandMark[]; hardware: BrandMark[] }
  /** Marcas de perfil usadas en la cotización que no tienen logo (para avisar, nunca para imprimir). */
  brandsWithoutLogo: string[]
  theme: DocTheme
  page: PageGeometry
  tokens: ResolvedThemeTokens
  kit: DocLocaleKit
  texts: QuoteTexts
  /** Días de vigencia; 0 = el taller no definió. */
  validityDays: number
  /** Fecha ISO de vencimiento (o vacío). */
  validUntil: string
  /** Quita de un texto libre la cifra del total (ver `total-guard.ts`). */
  guardTotal: TotalGuard
  /** Tasa del impuesto en % para el rótulo. */
  taxPct: number
  itemNotes: Record<string, string>
  groups: QuoteDocGroup[]
  placeholders: Partial<Record<PlaceholderKey, string>>
  /** «Cotización N° 412 · Rev. B». */
  reference: string
  /** Título de la obra (o el nombre del cliente si no hay título). */
  title: string
  /** Ventana más grande (portadas). */
  hero?: QuoteDocItemV5
  drawingStyle: DocTheme['drawingStyle']
  assets: Record<string, string>
  textures: Record<string, string>
  /** Texturas subidas listas para los dibujos (los foliados integrados se cargan aparte). */
  textureSources: TextureSources | undefined
  /** Patrones de foliados compartidos por todos los dibujos del documento (una sola vez en el HTML). */
  drawingDefs: DrawingDefsData
  editable: boolean
  /** Editor de plantillas: lo vacío se ve como guía (nunca llega al PDF). */
  ghost: boolean
  onEdit?: QuoteRenderOptions['onEdit']
  onSectionEdit?: QuoteRenderOptions['onSectionEdit']
  onItemEdit?: QuoteRenderOptions['onItemEdit']
  selectedSectionId?: string
  /** ¿Este campo se escribe en el lugar? */
  canEdit: (field: QuoteDocField) => boolean
  issues: DocIssue[]
}

/** Plantilla base para una referencia (objeto, id de diseño, id v4 o id de plantilla propia). */
export function baseQuoteTemplate(data: QuoteDocData, choice: QuoteRenderOptions['template']): { template: DocTemplate; issues: DocIssue[] } {
  const doc = (data as QuoteDocDataV5).document
  if (choice && typeof choice === 'object') {
    const valid = validateDocTemplate(choice, { kind: 'quote' })
    if (valid.ok) return { template: valid.template, issues: valid.issues }
    const fallback = choice.presetId && isDocPresetId(choice.presetId) ? choice.presetId : DEFAULT_QUOTE_PRESET_ID
    return { template: getDocPreset(resolveDocTemplateRef(fallback, 'quote').id as typeof DEFAULT_QUOTE_PRESET_ID), issues: valid.issues }
  }
  const wanted = typeof choice === 'string' && choice ? choice : undefined
  if (!wanted && doc?.template) return baseQuoteTemplate(data, doc.template)
  const ref = resolveDocTemplateRef(wanted ?? data.prefs?.quoteTemplate, 'quote')
  if (ref.source === 'org') {
    if (doc?.template && doc.template.id === ref.id) return baseQuoteTemplate(data, doc.template)
    return { template: getDocPreset(ref.fallbackPresetId), issues: [] }
  }
  return { template: getDocPreset(ref.id as typeof DEFAULT_QUOTE_PRESET_ID), issues: [] }
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/** Títulos y textos libres de las secciones sin la cifra del total. */
function guardedTemplate(template: DocTemplate, total: number, replacement: string): DocTemplate {
  const guard = totalGuard(total, replacement)
  const deep = <T,>(value: T): T => {
    if (typeof value === 'string') return guard(value) as T
    if (Array.isArray(value)) return value.map(deep) as T
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deep(v)])) as T
    return value
  }
  return {
    ...template,
    sections: template.sections.map((s) => {
      const o = s.options as Record<string, unknown>
      const options = { ...o }
      for (const key of ['title', 'subtitle', 'content'] as const) if (key in o) options[key] = deep(o[key])
      return { ...s, ...(s.title ? { title: guard(s.title) } : {}), options } as typeof s
    }),
  }
}

/** Logos que corresponde mostrar según los ajustes y lo que el taller subió. */
function brandMarks(settings: ResolvedDocSettings, prefs: Partial<DocumentPrefs> | null | undefined, assets: Record<string, string>, items: readonly QuoteDocItemV5[]): { brands: QuoteModel['brands']; missing: string[] } {
  const src = (id: string | undefined) => {
    const value = id ? assets[id] : undefined
    return value && /^data:image\//.test(value) ? value : undefined
  }
  const profile: BrandMark[] = []
  const missing: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    const id = item.line?.brandId
    if (!id || seen.has(id)) continue
    seen.add(id)
    const image = src(prefs?.brandLogos?.[id])
    if (image) profile.push({ key: id, kind: 'profile', name: item.line?.brand ?? id, src: image })
    else if (item.line?.brand) missing.push(item.line.brand)
  }
  const hardware = (prefs?.hardwareLogos ?? []).flatMap((h): BrandMark[] => {
    const image = src(h.assetId)
    return image ? [{ key: h.id, kind: 'hardware', name: h.name, src: image }] : []
  })
  return {
    brands: { profile: settings.brandProfile ? profile : [], hardware: settings.brandHardware ? hardware : [] },
    missing: settings.brandProfile ? missing : [],
  }
}

export function buildQuoteModel(input: QuoteDocData, options: QuoteRenderOptions = {}): QuoteModel {
  const raw = input as QuoteDocDataV5
  const doc = raw.document
  const base = baseQuoteTemplate(raw, options.template)
  const resolved = resolveQuoteDocument({
    template: base.template,
    orgPrefs: doc ? (doc.orgPrefs ?? null) : raw.prefs,
    overrides: doc ? doc.overrides : undefined,
    brandAccent: raw.org?.accent ?? null,
    orgLocale: doc?.locale ?? null,
  })
  const settings = resolved.settings
  // Un logo propio del documento reemplaza al de la empresa en todas partes (y si falta, vuelve el de ella).
  const ownLogo = settings.logoAssetId ? doc?.assets?.[settings.logoAssetId] : undefined
  const data: QuoteDocDataV5 = ownLogo ? { ...raw, org: { ...raw.org, logo: ownLogo } } : raw
  const locale = options.locale ?? doc?.locale ?? resolved.locale ?? 'es'
  const kit = docLocaleKit(locale, { currency: doc?.currency, taxLabel: doc?.taxLabel })
  const template = guardedTemplate(resolved.template, data.totals?.total ?? 0, kit.t('doc.amountAtClose'))
  const t: DocTexts = resolved.texts
  const guardTotal = totalGuard(data.totals?.total ?? 0, kit.t('doc.amountAtClose'))
  const written = (field: keyof DocTexts) => guardTotal(text(t[field]).trim())
  const texts: QuoteTexts = {
    intro: written('intro'),
    conditions: written('conditions'),
    paymentTerms: written('paymentTerms'),
    warranty: written('warranty'),
    leadTimeText: written('leadTimeText'),
    signatureName: text(t.signatureName).trim(),
    footer: written('footer'),
    clientNote: guardTotal(text(t.clientNote ?? data.quote.notes).trim()),
    includes: written('includes'),
    excludes: written('excludes'),
  }
  // Sin vigencia definida no se imprime ninguna: nunca se supone un plazo por el taller.
  const validityDays = resolved.validityDays ?? (data.prefs?.validityDays > 0 ? data.prefs.validityDays : 0)
  const validUntil = data.quote.validUntil ?? (validityDays > 0 && data.quote.date ? addDays(data.quote.date, validityDays) : '')
  const paymentDetails = data.paymentDetails ? { ...data.paymentDetails, instructions: guardTotal(data.paymentDetails.instructions) } : null
  const totals = data.totals
  const taxPct = doc?.taxRate ?? (totals.net > 0 && totals.iva > 0 ? Math.round((totals.iva / totals.net) * 1000) / 10 : 19)
  const items = (Array.isArray(data.items) ? data.items : []) as QuoteDocItemV5[]
  const extras = Array.isArray(data.extras) ? data.extras : []
  const included = includedLineIds([...items.map((i, n) => ({ ...i, id: i.id ?? `#${n}` })), ...extras])
  const counted = items.filter((i, n) => included.has(i.id ?? `#${n}`))
  const units = countUnits(counted)
  const groups = doc?.groups ?? quoteDocGroups(items)
  const fmt = kit.fmt
  const docTitle = settings.customTitle?.trim() || kit.t(`doc.titles.${settings.docTitle}`)
  const padded = settings.numberPad > 0 ? String(data.quote.number).padStart(settings.numberPad, '0') : ''
  const docNumber = settings.numberPrefix || padded ? `${settings.numberPrefix ?? ''}${padded || data.quote.number}` : fmt.docNumber(data.quote.number)
  const rev = settings.showRevision && data.quote.revision >= 2 ? kit.t('doc.revisionShort', { letter: revisionLetter(data.quote.revision) }) : ''
  const numberLabel = [docNumber, rev].filter(Boolean).join(' · ')
  const reference = [`${docTitle} ${docNumber}`, rev].filter(Boolean).join(' · ')
  const client = data.client
  const placeholders: Partial<Record<PlaceholderKey, string>> = {
    'client.name': client?.name ?? '',
    'client.taxId': client?.rut ?? '',
    'client.email': client?.email ?? '',
    'client.phone': client?.phone ?? '',
    'client.address': client?.address ?? '',
    'client.city': client?.city ?? '',
    'quote.number': String(data.quote.number),
    'quote.title': data.quote.title ?? '',
    'quote.revision': data.quote.revision >= 1 ? revisionLetter(data.quote.revision) : '',
    'quote.date': data.quote.date ? fmt.date(data.quote.date, 'long') : '',
    'quote.validUntil': validUntil ? fmt.date(validUntil, 'long') : '',
    'quote.validityDays': validityDays > 0 ? String(validityDays) : '',
    'quote.units': fmt.number(units),
    'org.name': data.org?.name ?? '',
    'org.legalName': data.org?.legalName ?? data.org?.name ?? '',
    'org.taxId': data.org?.rut ?? '',
    'org.phone': data.org?.phone ?? '',
    'org.email': data.org?.email ?? '',
    'org.website': (data.org?.website ?? '').replace(/^https?:\/\//, ''),
    'org.address': data.org?.address ?? '',
    'org.city': data.org?.city ?? '',
    'seller.name': texts.signatureName,
  }
  const hero = [...counted].sort((a, b) => b.width * b.height - a.width * a.height)[0]
  const assets = doc?.assets ?? {}
  const marks = brandMarks(settings, doc ? (doc.orgPrefs ?? data.prefs) : data.prefs, assets, counted)
  const uploads = Object.entries(doc?.textures ?? {}).filter(([, href]) => typeof href === 'string' && href.startsWith('data:image/'))
  const textureSources: TextureSources | undefined = uploads.length ? { uploads: Object.fromEntries(uploads.map(([id, href]) => [id, { href }])) } : undefined
  const drawingDefs = createDrawingDefs({ designs: items.map((i) => i.design).filter(Boolean), catalog: data.catalog, ...(textureSources ? { textures: textureSources } : {}) })
  return {
    data,
    items,
    counted,
    included,
    units,
    template,
    settings,
    customFields: resolved.customFields,
    paymentDetails,
    docTitle,
    docNumber,
    numberLabel,
    brands: marks.brands,
    brandsWithoutLogo: marks.missing,
    theme: template.theme,
    page: pageGeometry(template.page),
    tokens: resolveThemeTokens(template.theme),
    kit,
    texts,
    validityDays,
    validUntil,
    guardTotal,
    taxPct,
    itemNotes: Object.fromEntries(Object.entries(resolved.itemNotes).map(([k, v]) => [k, guardTotal(v)])),
    groups,
    placeholders,
    reference,
    title: guardTotal((data.quote.title ?? '').trim()) || client?.name || '',
    ...(hero ? { hero } : {}),
    drawingStyle: template.theme.drawingStyle,
    assets,
    textures: doc?.textures ?? {},
    textureSources,
    drawingDefs,
    editable: !!options.editable && !!options.onEdit,
    ghost: options.guides ?? !!options.onSectionEdit,
    canEdit: (field) => !!options.editable && !!options.onEdit && (options.editableFields?.includes(field) ?? true),
    ...(options.onEdit ? { onEdit: options.onEdit } : {}),
    ...(options.onSectionEdit ? { onSectionEdit: options.onSectionEdit } : {}),
    ...(options.onItemEdit ? { onItemEdit: options.onItemEdit } : {}),
    ...(options.selectedSectionId ? { selectedSectionId: options.selectedSectionId } : {}),
    issues: [...base.issues, ...resolved.issues],
  }
}
