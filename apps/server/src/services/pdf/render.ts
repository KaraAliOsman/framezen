/**
 * HTML autónomo de cada documento (el mismo que ve la web), listo para Chromium o para
 * «Imprimir» del navegador. Sin JSX: este archivo se ejecuta con tsx y esbuild tal cual.
 *
 * Las rutas usan las variantes `…Async`: arman el HTML por tramos y ceden el hilo entre hojas, así
 * un documento de miles de etiquetas no congela la API (autoguardado, salud, otros usuarios).
 */
import * as React from 'react'
import {
  CatalogDocument,
  QuoteDocument,
  TEMPLATE_FLOW_SCRIPT,
  WORKSHOP_DOCUMENTS,
  WORKSHOP_FIT_SCRIPT,
  WorkshopDocument,
  docFontFiles,
  loadBuiltinTextures,
  pickCatalogTemplateRef,
  prepareCatalogDocument,
  prepareQuoteDocument,
  preloadDocumentTextures,
  renderDocumentHtml,
  renderDocumentHtmlAsync,
  templateUsesItalic,
  themeFromPrefs,
  parseCutParts,
  workshopI18n,
  type CatalogDocData,
  type CutPartKind,
  type QuoteDocData,
  type RenderDocumentOptions,
  type WorkshopDocumentData,
  type WorkshopDocumentInfo,
  type WorkshopDocumentKind,
} from '@dekopen/documents'
import { DEFAULT_QUOTE_PRESET_ID, resolveDocTemplateRef, type DocTemplate } from '@dekopen/shared'
import { catalogFileName, quoteFileName, workshopFileName, type PdfFileName } from './filename'
import { documentFontCss, templateFontCss } from './fonts'

const { createElement } = React

/**
 * Las plantillas de @dekopen/documents son .tsx. Si el servidor corre con tsx desde la raíz
 * del monorepo (sin un tsconfig con "jsx": "react-jsx"), esbuild las compila con el JSX
 * clásico, que busca `React` global. Con esto funcionan igual con cualquier configuración.
 */
const globalScope = globalThis as { React?: typeof React }
globalScope.React ??= React

export interface RenderedDocument {
  html: string
  fileName: PdfFileName
  title: string
}

/** Qué se dibuja: el elemento, las opciones del HTML, el título y el nombre del archivo. */
interface DocumentJob {
  element: React.ReactElement
  options: RenderDocumentOptions
  fileName: PdfFileName
}

function renderJob(job: DocumentJob): RenderedDocument {
  return { html: renderDocumentHtml(job.element, job.options), title: job.options.title, fileName: job.fileName }
}

async function renderJobAsync(job: DocumentJob): Promise<RenderedDocument> {
  return { html: await renderDocumentHtmlAsync(job.element, job.options), title: job.options.title, fileName: job.fileName }
}

/**
 * Diseño de cotización a usar: el pedido (`?template=`) si es un diseño, un id v4 o una plantilla propia
 * conocidos; si no, el preferido del taller; si no, el diseño por defecto (nunca un error por esto).
 */
export function pickQuoteTemplate(requested: string | undefined, preferred: string | undefined): string {
  for (const candidate of [requested, preferred]) {
    if (candidate && resolveDocTemplateRef(candidate, 'quote').source !== 'default') return candidate
  }
  return DEFAULT_QUOTE_PRESET_ID
}

/** Diseño de catálogo a usar (pedido → preferido → por defecto). */
export function pickCatalogTemplate(requested: string | undefined, preferred: string | undefined): string {
  return pickCatalogTemplateRef(requested, preferred)
}

export function workshopInfo(kind: string | undefined): WorkshopDocumentInfo | undefined {
  return WORKSHOP_DOCUMENTS.find((d) => d.kind === kind)
}

// Las teselas de foliado se cargan en segundo plano al arrancar: el render sincrónico (pruebas, tareas
// internas) las usa si ya llegaron; las rutas esperan las que necesitan (variantes `…Async`).
void loadBuiltinTextures()

function quoteJob(data: QuoteDocData, template: string | DocTemplate): DocumentJob & { prepared: ReturnType<typeof prepareQuoteDocument> } {
  const prepared = prepareQuoteDocument({ data, template })
  const model = prepared.model
  const italic = templateUsesItalic(model.template, [model.texts.intro, model.texts.conditions, model.texts.warranty])
  return {
    prepared,
    element: createElement(QuoteDocument, { data, template, measure: false }),
    options: {
      title: prepared.title,
      lang: prepared.lang,
      fontCss: templateFontCss(docFontFiles(model.theme, { italic })),
      // Sin Chromium («Imprimir» del navegador) la cotización se reparte en hojas con los altos reales.
      script: TEMPLATE_FLOW_SCRIPT,
    },
    fileName: quoteFileName({ number: data.quote.number, title: data.quote.title, revision: data.quote.revision }),
  }
}

export function renderQuoteDocument(data: QuoteDocData, template: string | DocTemplate): RenderedDocument {
  return renderJob(quoteJob(data, template))
}

/** Igual que `renderQuoteDocument`, por tramos (no bloquea la API) y con todas las teselas cargadas. */
export async function renderQuoteDocumentAsync(data: QuoteDocData, template: string | DocTemplate): Promise<RenderedDocument> {
  const job = quoteJob(data, template)
  await preloadDocumentTextures(job.prepared.model.drawingDefs)
  return renderJobAsync(job)
}

export interface WorkshopRenderOptions {
  kind: WorkshopDocumentKind
  paper?: 'letter' | 'a4'
  /** Etiquetas: hoja de 10 o rollo (`?labels=` o `?format=sheet|roll`). */
  labelFormat?: 'sheet' | 'roll'
  /** Etiquetas: incluir las de vidrio (`?glass=0` las quita). Por defecto sí. */
  includeGlass?: boolean
  /** Orden de compra de un solo proveedor. */
  brandId?: string
  /** Orden de compra con precios y totales (`?prices=0` los quita). Por defecto sí. */
  showPrices?: boolean
  /** IVA en % para la orden de compra. Por defecto el de la organización (data.ivaPct). */
  ivaPct?: number
  /** Cortes y orden de corte: solo estos tipos de pieza (`?parts=sash,bead`). */
  parts?: readonly CutPartKind[]
}

/** Opción sí/no de la URL: «0», «false», «no» u «off» = no; «1», «true», «si» u «on» = sí; otra cosa = sin opinión. */
export function queryFlag(value: string | undefined | null): boolean | undefined {
  const v = value?.trim().toLowerCase()
  if (!v) return undefined
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false
  if (v === '1' || v === 'true' || v === 'si' || v === 'sí' || v === 'on') return true
  return undefined
}

/**
 * Opciones de un documento de taller desde la URL que pide la web
 * (`?labels=roll` o `?format=roll`, `?glass=0`, `?brandId=`, `?prices=0`). Ignora lo que no entiende.
 */
export function workshopRenderOptionsFromQuery(query: (name: string) => string | undefined): Omit<WorkshopRenderOptions, 'kind' | 'paper'> {
  const out: Omit<WorkshopRenderOptions, 'kind' | 'paper'> = {}
  const labels = query('labels') ?? query('format')
  if (labels === 'sheet' || labels === 'roll') out.labelFormat = labels
  const glass = queryFlag(query('glass'))
  if (glass !== undefined) out.includeGlass = glass
  const brandId = query('brandId')?.trim()
  if (brandId) out.brandId = brandId
  const prices = queryFlag(query('prices'))
  if (prices !== undefined) out.showPrices = prices
  const parts = parseCutParts(query('parts'))
  if (parts.length) out.parts = parts
  return out
}

/** «Cortes» → «Cortes-Hojas-Junquillos», para que el archivo diga qué trae. */
function partsFileName(base: string, parts: readonly CutPartKind[] | undefined): string {
  if (!parts?.length || !(base === 'Cortes' || base === 'Orden-corte')) return base
  const { t } = workshopI18n({ locale: 'es' })
  return [base, ...parts.map((part) => t(`common.parts.${part}`))].join('-')
}

function workshopJob(data: WorkshopDocumentData, options: WorkshopRenderOptions): DocumentJob {
  const info = workshopInfo(options.kind) ?? WORKSHOP_DOCUMENTS[0]
  const number = data.workOrder.fromQuote ? `Cotización N° ${data.quote.number}` : `OT N° ${data.workOrder.number}`
  const title = [...new Set([info.title, number, data.quote.title])].filter(Boolean).join(' · ')
  return {
    element: createElement(WorkshopDocument, {
      kind: info.kind,
      data,
      ...(options.paper ? { paper: options.paper } : {}),
      ...(options.labelFormat ? { labelFormat: options.labelFormat } : {}),
      ...(options.includeGlass !== undefined ? { includeGlass: options.includeGlass } : {}),
      ...(options.brandId ? { brandId: options.brandId } : {}),
      ...(options.showPrices !== undefined ? { showPrices: options.showPrices } : {}),
      ...(options.ivaPct !== undefined && Number.isFinite(options.ivaPct) ? { ivaPct: options.ivaPct } : {}),
      ...(options.parts?.length ? { parts: options.parts } : {}),
    }),
    options: {
      title,
      theme: themeFromPrefs({ font: 'instrument', paper: options.paper ?? 'letter' }, data.org.accent),
      fontCss: documentFontCss(),
      // Compacta las hojas que se pasarían a otra página por unas pocas filas (mide en Chromium).
      script: WORKSHOP_FIT_SCRIPT,
    },
    fileName: workshopFileName(partsFileName(info.fileName, options.parts), { number: data.workOrder.number, title: data.quote.title, ...(data.workOrder.fromQuote ? { fromQuote: true } : {}) }),
  }
}

export function renderWorkshopDocument(data: WorkshopDocumentData, options: WorkshopRenderOptions): RenderedDocument {
  return renderJob(workshopJob(data, options))
}

/** Igual que `renderWorkshopDocument`, por tramos: las etiquetas de una OT grande no congelan la API. */
export function renderWorkshopDocumentAsync(data: WorkshopDocumentData, options: WorkshopRenderOptions): Promise<RenderedDocument> {
  return renderJobAsync(workshopJob(data, options))
}

function catalogJob(data: CatalogDocData, template: string): DocumentJob {
  const prepared = prepareCatalogDocument({ data, template })
  return {
    element: createElement(CatalogDocument, { data, template }),
    options: {
      title: prepared.title,
      lang: prepared.lang,
      fontCss: templateFontCss(docFontFiles(prepared.template.theme)),
    },
    fileName: catalogFileName(data.org.name),
  }
}

export function renderCatalogDocument(data: CatalogDocData, template: string): RenderedDocument {
  return renderJob(catalogJob(data, template))
}

/** Igual que `renderCatalogDocument`, por tramos y con los foliados integrados ya cargados (muestras y dibujos). */
export async function renderCatalogDocumentAsync(data: CatalogDocData, template: string): Promise<RenderedDocument> {
  await loadBuiltinTextures()
  return renderJobAsync(catalogJob(data, template))
}
