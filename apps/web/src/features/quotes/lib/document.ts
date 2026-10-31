/**
 * Documento para el cliente desde el estado del editor: mismos datos que el PDF del servidor
 * (buildQuoteDocData), con la geometría de cada ventana recordada por diseño.
 */
import { createElement } from 'react'
import { computeLayout, safeLayout, type Catalog, type Layout, type QuoteEvaluation, type WindowDesign } from '@framezen/engine'
import {
  buildQuoteDocData,
  documentFontFaces,
  QuoteDocument,
  renderDocumentHtml,
  themeFromPrefs,
  type QuoteDocData,
  type QuoteDocSettings,
} from '@framezen/documents'
import type { Client, Org, Quote, QuoteTemplateId } from '@framezen/shared'
import instrumentUrl from '@fontsource-variable/instrument-sans/files/instrument-sans-latin-wdth-normal.woff2?url'
import frauncesUrl from '@fontsource-variable/fraunces/files/fraunces-latin-opsz-normal.woff2?url'
import interTightUrl from '@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2?url'

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

/** @font-face de los documentos (Instrument, Fraunces e Inter Tight servidas por Vite). */
export const DOCUMENT_FONT_CSS = documentFontFaces({ instrument: instrumentUrl, fraunces: frauncesUrl, interTight: interTightUrl })

function absolute(css: string): string {
  if (typeof window === 'undefined') return css
  return css.replace(/url\("(\/[^"]*)"\)/g, (_m, path: string) => `url("${window.location.origin}${path}")`)
}

/**
 * Respaldo del PDF: imprime el documento desde un iframe oculto (el navegador ofrece «Guardar
 * como PDF»). Nunca abre ventanas emergentes, así no lo bloquea el navegador.
 */
export function printQuoteDocument(data: QuoteDocData, template: QuoteTemplateId, title: string): Promise<void> {
  const html = renderDocumentHtml(createElement(QuoteDocument, { data, template }), {
    title,
    theme: themeFromPrefs(data.prefs, data.org.accent),
    fontCss: absolute(DOCUMENT_FONT_CSS),
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
 * Descarga el PDF del servidor. Devuelve false si el servidor no lo pudo generar (entonces se
 * usa el respaldo de impresión).
 */
export async function downloadServerPdf(quoteId: string, template: QuoteTemplateId, fileName: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/quotes/${encodeURIComponent(quoteId)}/pdf?template=${encodeURIComponent(template)}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/pdf' },
    })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !type.includes('pdf')) return false
    const blob = await res.blob()
    if (blob.size === 0) return false
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return true
  } catch {
    return false
  }
}
