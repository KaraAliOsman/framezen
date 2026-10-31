/**
 * HTML autónomo de cada documento (el mismo que ve la web), listo para Chromium o para
 * «Imprimir» del navegador. Sin JSX: este archivo se ejecuta con tsx y esbuild tal cual.
 *
 * Las rutas usan las variantes `…Async`: arman el HTML por tramos y ceden el hilo entre hojas, así
 * un documento de miles de etiquetas no congela la API (autoguardado, salud, otros usuarios).
 */
import * as React from 'react'
import {
  CATALOG_TEMPLATES,
  CatalogDocument,
  QUOTE_TEMPLATES,
  QuoteDocument,
  WORKSHOP_DOCUMENTS,
  WORKSHOP_FIT_SCRIPT,
  WorkshopDocument,
  renderDocumentHtml,
  renderDocumentHtmlAsync,
  themeFromPrefs,
  type CatalogDocData,
  type QuoteDocData,
  type RenderDocumentOptions,
  type WorkshopDocumentData,
  type WorkshopDocumentInfo,
  type WorkshopDocumentKind,
} from '@framezen/documents'
import type { CatalogTemplateId, QuoteTemplateId } from '@framezen/shared'
import { catalogFileName, quoteFileName, workshopFileName, type PdfFileName } from './filename'
import { documentFontCss } from './fonts'

const { createElement } = React

/**
 * Las plantillas de @framezen/documents son .tsx. Si el servidor corre con tsx desde la raíz
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

const QUOTE_IDS = new Set<string>(QUOTE_TEMPLATES.map((t) => t.id))
const CATALOG_IDS = new Set<string>(CATALOG_TEMPLATES.map((t) => t.id))

/** Plantilla pedida si existe; si no, la preferida del taller (nunca un error por esto). */
export function pickQuoteTemplate(requested: string | undefined, preferred: QuoteTemplateId): QuoteTemplateId {
  return requested && QUOTE_IDS.has(requested) ? (requested as QuoteTemplateId) : QUOTE_IDS.has(preferred) ? preferred : 'esencial'
}

export function pickCatalogTemplate(requested: string | undefined, preferred: CatalogTemplateId): CatalogTemplateId {
  return requested && CATALOG_IDS.has(requested) ? (requested as CatalogTemplateId) : CATALOG_IDS.has(preferred) ? preferred : 'vitrina'
}

export function workshopInfo(kind: string | undefined): WorkshopDocumentInfo | undefined {
  return WORKSHOP_DOCUMENTS.find((d) => d.kind === kind)
}

function revisionLabel(revision: number): string {
  if (revision < 2) return ''
  return ` ${String.fromCharCode(64 + Math.min(revision, 26))}`
}

function quoteJob(data: QuoteDocData, template: QuoteTemplateId): DocumentJob {
  const title = `Cotización N° ${data.quote.number}${revisionLabel(data.quote.revision)} · ${data.quote.title || data.org.name}`
  return {
    element: createElement(QuoteDocument, { data, template }),
    options: { title, theme: themeFromPrefs(data.prefs, data.org.accent), fontCss: documentFontCss() },
    fileName: quoteFileName({ number: data.quote.number, title: data.quote.title, revision: data.quote.revision }),
  }
}

export function renderQuoteDocument(data: QuoteDocData, template: QuoteTemplateId): RenderedDocument {
  return renderJob(quoteJob(data, template))
}

/** Igual que `renderQuoteDocument`, por tramos (no bloquea la API). */
export function renderQuoteDocumentAsync(data: QuoteDocData, template: QuoteTemplateId): Promise<RenderedDocument> {
  return renderJobAsync(quoteJob(data, template))
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
  return out
}

function workshopJob(data: WorkshopDocumentData, options: WorkshopRenderOptions): DocumentJob {
  const info = workshopInfo(options.kind) ?? WORKSHOP_DOCUMENTS[0]
  const title = [info.title, `OT N° ${data.workOrder.number}`, data.quote.title].filter(Boolean).join(' · ')
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
    }),
    options: {
      title,
      theme: themeFromPrefs({ font: 'instrument', paper: options.paper ?? 'letter' }, data.org.accent),
      fontCss: documentFontCss(),
      // Compacta las hojas que se pasarían a otra página por unas pocas filas (mide en Chromium).
      script: WORKSHOP_FIT_SCRIPT,
    },
    fileName: workshopFileName(info.fileName, { number: data.workOrder.number, title: data.quote.title }),
  }
}

export function renderWorkshopDocument(data: WorkshopDocumentData, options: WorkshopRenderOptions): RenderedDocument {
  return renderJob(workshopJob(data, options))
}

/** Igual que `renderWorkshopDocument`, por tramos: las etiquetas de una OT grande no congelan la API. */
export function renderWorkshopDocumentAsync(data: WorkshopDocumentData, options: WorkshopRenderOptions): Promise<RenderedDocument> {
  return renderJobAsync(workshopJob(data, options))
}

function catalogJob(data: CatalogDocData, template: CatalogTemplateId): DocumentJob {
  const title = `${data.title ?? 'Catálogo de ventanas y puertas'} · ${data.org.name}`
  return {
    element: createElement(CatalogDocument, { data, template }),
    options: { title, theme: themeFromPrefs(data.prefs, data.org.accent), fontCss: documentFontCss() },
    fileName: catalogFileName(data.org.name),
  }
}

export function renderCatalogDocument(data: CatalogDocData, template: CatalogTemplateId): RenderedDocument {
  return renderJob(catalogJob(data, template))
}

/** Igual que `renderCatalogDocument`, por tramos. */
export function renderCatalogDocumentAsync(data: CatalogDocData, template: CatalogTemplateId): Promise<RenderedDocument> {
  return renderJobAsync(catalogJob(data, template))
}
