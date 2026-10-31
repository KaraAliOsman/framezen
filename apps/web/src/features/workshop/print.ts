/**
 * Imprimir un documento de taller desde el navegador (respaldo del PDF del servidor, o a
 * pedido). El documento se monta aparte, fuera de la app, y solo él sale en la hoja: cada
 * documento trae su propio @page (Carta, A4 o rollo de etiquetas).
 */
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'

const ROOT_ID = 'fz-print-root'
const STYLE_ID = 'fz-print-style'

const PRINT_CSS = `
@media screen { #${ROOT_ID} { position: fixed; left: -100000px; top: 0; width: 1px; height: 1px; overflow: hidden; } }
@media print {
  html, body { background: #fff !important; height: auto !important; min-height: 0 !important; overflow: visible !important; }
  body > *:not(#${ROOT_ID}) { display: none !important; }
  #${ROOT_ID} { display: block !important; position: static !important; }
}`

let active: (() => void) | null = null

function waitForImages(host: HTMLElement, timeoutMs = 3000): Promise<void> {
  const images = [...host.querySelectorAll('img')].filter((img) => !img.complete)
  if (images.length === 0) return Promise.resolve()
  return Promise.race([
    Promise.all(images.map((img) => new Promise<void>((resolve) => img.addEventListener('load', () => resolve(), { once: true })))).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ])
}

/**
 * Abre el diálogo de impresión con `element` como único contenido. `title` sugiere el
 * nombre del archivo al elegir «Guardar como PDF».
 */
export async function printElement(element: ReactElement, title?: string): Promise<void> {
  active?.()
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = PRINT_CSS
  const host = document.createElement('div')
  host.id = ROOT_ID
  document.head.appendChild(style)
  document.body.appendChild(host)
  const root = createRoot(host)
  flushSync(() => root.render(element))

  const previousTitle = document.title
  let done = false
  const cleanup = () => {
    if (done) return
    done = true
    active = null
    window.removeEventListener('afterprint', onAfter)
    document.title = previousTitle
    root.unmount()
    host.remove()
    style.remove()
  }
  const onAfter = () => setTimeout(cleanup, 0)
  active = cleanup

  try {
    await Promise.race([document.fonts?.ready ?? Promise.resolve(), new Promise((r) => setTimeout(r, 1500))])
  } catch {
    // sin API de fuentes: seguimos
  }
  await waitForImages(host)
  if (title) document.title = title
  window.addEventListener('afterprint', onAfter)
  window.print()
  // Algunos navegadores móviles no avisan «afterprint»: limpiamos igual más tarde.
  setTimeout(cleanup, 120_000)
}
