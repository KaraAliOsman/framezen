/**
 * Salida de documentos desde el navegador: fuentes de los documentos (Fraunces, Inter Tight y
 * JetBrains Mono además de Instrument Sans, las mismas que incrusta el PDF), impresión en un marco oculto y descarga del PDF del servidor con
 * respaldo a imprimir si el servidor no lo genera.
 */
import type { ReactElement } from 'react'
import { documentFontFaces, renderDocumentHtmlAsync, type DocTheme } from '@framezen/documents'
import instrumentUrl from '@fontsource-variable/instrument-sans/files/instrument-sans-latin-wdth-normal.woff2?url'
import frauncesUrl from '@fontsource-variable/fraunces/files/fraunces-latin-opsz-normal.woff2?url'
import interTightUrl from '@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2?url'
import monoUrl from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url'
import monoMediumUrl from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2?url'

function absolute(url: string): string {
  try {
    return new URL(url, window.location.href).href
  } catch {
    return url
  }
}

/** @font-face de los documentos (para la vista previa y para imprimir). */
export function documentFontCss(): string {
  return documentFontFaces({
    instrument: absolute(instrumentUrl),
    fraunces: absolute(frauncesUrl),
    interTight: absolute(interTightUrl),
    mono: absolute(monoUrl),
    monoMedium: absolute(monoMediumUrl),
  })
}

/**
 * Imprime un documento React en un marco oculto (no lo bloquean los bloqueadores de ventanas).
 * El HTML se arma por tramos: un documento grande no congela la pestaña mientras se prepara.
 */
export async function printDocument(element: ReactElement, options: { title: string; theme?: DocTheme }): Promise<void> {
  const html = await renderDocumentHtmlAsync(element, { title: options.title, theme: options.theme, fontCss: documentFontCss(), lang: 'es-CL' })
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none'
  document.body.appendChild(frame)
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve()
    frame.srcdoc = html
  })
  const win = frame.contentWindow
  if (!win) {
    frame.remove()
    throw new Error('print_unavailable')
  }
  // Espera a que carguen las fuentes para que el papel salga igual que la pantalla.
  try {
    await Promise.race([win.document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))])
  } catch {
    /* sin API de fuentes: imprimimos igual */
  }
  const cleanup = () => setTimeout(() => frame.remove(), 1000)
  win.addEventListener('afterprint', cleanup, { once: true })
  win.focus()
  win.print()
  // Respaldo si el navegador no emite afterprint.
  setTimeout(() => frame.isConnected && frame.remove(), 60_000)
}

/** Descarga un PDF de la API. Devuelve false si el servidor no lo pudo generar (para imprimir como respaldo). */
export async function downloadPdf(url: string, fileName: string): Promise<boolean> {
  try {
    const res = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/pdf' } })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !type.includes('pdf')) return false
    const blob = await res.blob()
    const href = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = href
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(href), 10_000)
    return true
  } catch {
    return false
  }
}

/** Nombre de archivo legible: «catalogo-ventanas-del-sur.pdf». */
export function fileSlug(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'documento'
  )
}
