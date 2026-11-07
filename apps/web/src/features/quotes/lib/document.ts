/**
 * Documento para el cliente desde el estado del editor: mismos datos que el PDF del servidor
 * (buildQuoteDocData), con la geometría de cada ventana recordada por diseño.
 *
 * Es el único punto de contacto del editor con el renderizador de documentos (@dekopen/documents):
 * vista previa, impresión de respaldo y descarga del PDF del servidor. Las fuentes son las de la
 * lista cerrada de plantillas (latin + latin-ext, para que el turco, el alemán o el francés salgan
 * bien impresos), servidas por Vite desde `features/documents/fonts.ts`.
 */
import { createElement, type ComponentType, type ReactElement } from 'react'
import { computeLayout, safeLayout, type Catalog, type Layout, type QuoteEvaluation, type WindowDesign } from '@dekopen/engine'
import {
  buildQuoteDocData,
  DocumentStyles,
  PAPER_SIZE,
  QUOTE_TEMPLATES,
  QuoteDocument,
  renderDocumentHtml,
  themeFromPrefs,
  type QuoteDocData,
  type QuoteDocSettings,
} from '@dekopen/documents'
import {
  DOC_PRESET_TRAITS,
  getDocPreset,
  isDocPresetId,
  LEGACY_TEMPLATE_PRESETS,
  type Client,
  type DocTemplate,
  type Locale,
  type Org,
  type Quote,
} from '@dekopen/shared'
import { documentTemplateFontCss } from '../../documents/fonts'

const layouts = new WeakMap<WindowDesign, Layout>()

/** Geometría de una ventana (recordada: los diseños son inmutables). */
export function cachedLayout(design: WindowDesign, catalog: Catalog): Layout {
  let layout = layouts.get(design)
  if (!layout) {
    layout = safeLayout({ computeLayout }, design, catalog)
    layouts.set(design, layout)
  }
  return layout
}

export function buildEditorDocData(input: {
  quote: Quote
  org: Org
  catalog: Catalog
  settings: QuoteDocSettings
  client?: Client
  evaluation: QuoteEvaluation
  portalUrl?: string
}): QuoteDocData {
  return buildQuoteDocData({
    quote: input.quote,
    org: input.org,
    catalog: input.catalog,
    settings: input.settings,
    client: input.client ?? null,
    evaluation: input.evaluation,
    portalUrl: input.portalUrl,
    layout: cachedLayout,
  })
}

/** @font-face de las 14 familias de documento (se descarga solo la que el documento usa). */
export function DOCUMENT_FONT_CSS(): string {
  return documentTemplateFontCss()
}

/** Plantilla elegida: id de diseño, id de plantilla propia o la plantilla completa. */
export type TemplateChoice = string | DocTemplate

/** Diseños que conoce el renderizador instalado (los de v5, o los cuatro de v4). */
const RENDERER_IDS = new Set<string>(QUOTE_TEMPLATES.map((t) => t.id))
const RENDERER_V5 = [...RENDERER_IDS].some((id) => isDocPresetId(id))

/**
 * Plantilla para el renderizador: con el de v5 se pasa tal cual (diseño, plantilla propia o la
 * plantilla completa); con el de cuatro diseños se usa el diseño v4 de estructura equivalente,
 * nunca un documento roto.
 */
function rendererTemplate(choice: TemplateChoice): string | DocTemplate {
  if (RENDERER_V5) return choice
  const id = typeof choice === 'string' ? choice : choice.id
  if (RENDERER_IDS.has(id)) return id
  const presetId = typeof choice === 'string' ? (isDocPresetId(id) ? id : undefined) : (choice.presetId ?? undefined)
  const back = Object.entries(LEGACY_TEMPLATE_PRESETS).find(([legacy, preset]) => preset === presetId && RENDERER_IDS.has(legacy))
  if (back) return back[0]
  const style = presetId && isDocPresetId(presetId) ? DOC_PRESET_TRAITS[presetId]?.style : undefined
  if (style === 'technical') return 'compacta'
  if (style === 'visual') return 'galeria'
  return 'esencial'
}

/** Ancho de la hoja en px CSS (96 dpi) para calzar la vista previa en el panel. */
export function previewPageWidth(data: QuoteDocData, choice: TemplateChoice): number {
  const template = typeof choice === 'string' ? (isDocPresetId(choice) ? getDocPreset(choice) : undefined) : choice
  const size = template?.page?.size
  if (size === 'A4') return PAPER_SIZE.a4.width
  if (size === 'Letter') return PAPER_SIZE.letter.width
  const paper = data.prefs?.paper === 'a4' ? 'a4' : 'letter'
  return PAPER_SIZE[paper].width
}

interface PreviewProps {
  data: QuoteDocData
  template: TemplateChoice
  locale?: Locale
  editable?: boolean
  onEdit?: (field: string, value: string) => void
  /** Títulos y textos libres de las secciones, escritos en la hoja. */
  onSectionEdit?: (sectionId: string, slot: 'title' | 'subtitle' | 'content', value: string) => void
  /** Nombre y nota de una ventana, escritos en la hoja. */
  onItemEdit?: (itemId: string, field: 'name' | 'note', value: string) => void
  /** Sección que muestra sus textos opcionales aún vacíos. */
  selectedSectionId?: string
}

// El renderizador recibe la plantilla y el idioma como opciones (ver @dekopen/documents › QuoteRenderOptions).
const Renderer = QuoteDocument as unknown as ComponentType<Record<string, unknown>>

/** Vista previa del documento (con sus estilos) tal como la imprime el servidor. */
export function QuotePreview({ data, template, locale, editable, onEdit, onSectionEdit, onItemEdit, selectedSectionId }: PreviewProps): ReactElement {
  const theme = themeFromPrefs(data.prefs, data.org.accent)
  return createElement(
    'div',
    { 'data-quote-document': '' },
    createElement(DocumentStyles, { theme }),
    createElement(Renderer, { data, template: rendererTemplate(template), locale, editable, onEdit, onSectionEdit, onItemEdit, selectedSectionId, guides: false }),
  )
}

function absolute(css: string): string {
  if (typeof window === 'undefined') return css
  return css.replace(/url\("(\/[^"]*)"\)/g, (_m, path: string) => `url("${window.location.origin}${path}")`)
}

/**
 * Respaldo del PDF: imprime el documento desde un iframe oculto (el navegador ofrece «Guardar
 * como PDF»). Nunca abre ventanas emergentes, así no lo bloquea el navegador.
 */
export function printQuoteDocument(data: QuoteDocData, template: TemplateChoice, title: string, locale?: Locale): Promise<void> {
  const html = renderDocumentHtml(createElement(Renderer, { data, template: rendererTemplate(template), locale }), {
    title,
    theme: themeFromPrefs(data.prefs, data.org.accent),
    fontCss: absolute(DOCUMENT_FONT_CSS()),
    lang: locale,
  })
  return new Promise((resolve) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.tabIndex = -1
    Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0', opacity: '0' })
    const cleanup = () => {
      setTimeout(() => frame.remove(), 1000)
      resolve()
    }
    frame.onload = () => {
      const win = frame.contentWindow
      if (!win) return cleanup()
      const go = () => {
        try {
          win.focus()
          win.print()
        } finally {
          cleanup()
        }
      }
      // Espera las fuentes para que el PDF salga con la tipografía correcta.
      const fonts = (win.document as Document & { fonts?: FontFaceSet }).fonts
      if (fonts?.ready) void fonts.ready.then(go, go)
      else setTimeout(go, 300)
    }
    frame.srcdoc = html
    document.body.appendChild(frame)
  })
}

/**
 * Descarga el PDF del servidor (con lo guardado: plantilla, idioma y textos de la cotización).
 * Devuelve false si el servidor no lo pudo generar (entonces se usa el respaldo de impresión).
 */
export async function fetchServerPdf(quoteId: string, template: string): Promise<Blob | null> {
  try {
    const res = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/pdf?template=${encodeURIComponent(template)}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/pdf' },
    })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !type.includes('pdf')) return null
    const blob = await res.blob()
    return blob.size === 0 ? null : blob
  } catch {
    return null
  }
}

/** Baja un archivo ya en memoria con su nombre. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export async function downloadServerPdf(quoteId: string, template: string, fileName: string): Promise<boolean> {
  const blob = await fetchServerPdf(quoteId, template)
  if (!blob) return false
  saveBlob(blob, fileName)
  return true
}
