import { Children, Fragment, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { documentCss } from './base/css'
import { DEFAULT_THEME, type DocTheme } from './base/theme'

export interface RenderDocumentOptions {
  /** Título del HTML (nombre sugerido del PDF). */
  title: string
  theme?: DocTheme
  /** @font-face ya resueltos (documentFontFaces con data URLs en el servidor). */
  fontCss?: string
  /** CSS adicional (p. ej. el de documentos de taller). */
  extraCss?: string
  lang?: string
  /**
   * JavaScript en línea al final del body (p. ej. `WORKSHOP_FIT_SCRIPT`, que compacta las hojas
   * de taller que se pasarían a otra página por pocas filas). Chromium lo ejecuta antes de imprimir.
   */
  script?: string
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Evita que un texto cierre la etiqueta <style> antes de tiempo. */
function safeCss(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style')
}

function documentHtml(body: string, options: RenderDocumentOptions): string {
  const theme = options.theme ?? DEFAULT_THEME
  const css = [options.fontCss ?? '', documentCss(theme, options.extraCss ?? '')].join('\n')
  return [
    '<!doctype html>',
    `<html lang="${escapeHtml(options.lang ?? 'es-CL')}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(options.title)}</title>`,
    `<style>${safeCss(css)}\nhtml, body { margin: 0; background: #fff; }\n@media screen { body { background: #F4F1EC; padding: 28px 0; } }</style>`,
    '</head>',
    `<body>${body}${options.script ? `<script>${options.script.replace(/<\/script/gi, '<\\/script')}</script>` : ''}</body>`,
    '</html>',
  ].join('\n')
}

/**
 * HTML completo y autónomo de un documento (para Chromium/playwright o para
 * descargar). Sin dependencias de Node: sirve también en el navegador.
 *
 * Es síncrono: con documentos grandes (miles de etiquetas) ocupa el hilo varios segundos. En el
 * servidor y al imprimir usa `renderDocumentHtmlAsync`, que da el mismo documento por tramos.
 */
export function renderDocumentHtml(element: ReactElement, options: RenderDocumentOptions): string {
  return documentHtml(renderToStaticMarkup(element), options)
}

// ── Render por tramos ─────────────────────────────────────────────────────────

export interface RenderSliceOptions {
  /** Trabajo seguido máximo antes de ceder el hilo (ms). Por defecto 12. */
  sliceMs?: number
  /** Cómo ceder el hilo (por defecto setImmediate en Node; MessageChannel o setTimeout en el navegador). */
  yieldToHost?: () => Promise<void>
  /** Reloj en ms (pruebas). */
  now?: () => number
}

/**
 * Marca un componente con hooks cuyos `children` se dibujan tal cual dentro de su marcado (p. ej. la
 * raíz de los documentos de taller). El render por tramos dibuja el contenedor con un marcador en el
 * lugar de los hijos y luego cada hijo por separado. Los componentes sin hooks no necesitan marca.
 */
export const RENDER_SLOT: unique symbol = Symbol.for('framezen.documents.renderSlot')

/** Contenedores HTML que se pueden partir sin cambiar el resultado (nunca style, script, select, textarea…). */
const SPLIT_TAGS = new Set(['div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'nav', 'ul', 'ol', 'table', 'thead', 'tbody', 'tfoot', 'figure'])
const MAX_DEPTH = 32

interface SliceState {
  sliceMs: number
  yieldToHost: () => Promise<void>
  now: () => number
  lastYield: number
  /** Tiempo total dibujando (ms), sin contar las pausas. */
  work: number
  /** Prefijo de useId por llamada: los ids de tramos distintos nunca chocan. */
  seq: number
  /** Tipos de elemento ya medidos: true = chico (se dibuja entero), false = grande (se parte). */
  small: Map<unknown, boolean>
  sentinel: string
}

function defaultYield(): Promise<void> {
  const g = globalThis as { setImmediate?: (fn: () => void) => unknown; MessageChannel?: typeof MessageChannel }
  if (typeof g.setImmediate === 'function') return new Promise((resolve) => g.setImmediate!(resolve))
  if (typeof g.MessageChannel === 'function') {
    return new Promise((resolve) => {
      const channel = new g.MessageChannel!()
      channel.port1.onmessage = () => {
        channel.port1.close()
        resolve()
      }
      channel.port2.postMessage(null)
    })
  }
  return new Promise((resolve) => setTimeout(resolve, 0))
}

function renderPiece(node: ReactNode, state: SliceState): string {
  const t0 = state.now()
  // Cada llamada con su prefijo: useId (dibujos, tramas) no repite ids entre tramos.
  const html = renderToStaticMarkup(node as ReactElement, { identifierPrefix: `f${++state.seq}z` })
  state.work += state.now() - t0
  return html
}

async function maybeYield(state: SliceState): Promise<void> {
  if (state.now() - state.lastYield < state.sliceMs) return
  await state.yieldToHost()
  state.lastYield = state.now()
}

type Expanded = { leaf: ReactNode } | { before: string; after: string; children: ReactNode[] }

/** Clave de «tipo» para recordar si un elemento es chico: el componente o la etiqueta con su clase. */
function typeKey(node: ReactNode): unknown {
  if (!isValidElement(node)) return undefined
  const type = node.type
  if (typeof type === 'string') return SPLIT_TAGS.has(type) ? `${type}.${String((node.props as { className?: unknown }).className ?? '')}` : undefined
  if (type === Fragment) return Fragment
  return typeof type === 'function' ? type : undefined
}

const hookUsers = new WeakMap<object, boolean>()

/**
 * ¿El componente llama hooks? Llamarlo fuera de React lanzaría (y en desarrollo React lo anota
 * en consola), así que esos se dibujan enteros con React. Se mira el código una vez por tipo; si
 * no se detecta (código minificado), el try/catch de `expand` hace lo mismo.
 */
function usesHooks(type: object): boolean {
  let known = hookUsers.get(type)
  if (known === undefined) {
    known = /\buse[A-Z]\w*\b|\buse\s*\(/.test(Function.prototype.toString.call(type))
    hookUsers.set(type, known)
  }
  return known
}

/** Dibuja el contenedor con un marcador en lugar de los hijos y separa lo de antes y lo de después. */
function shellOf(element: ReactElement, children: ReactNode, state: SliceState): Expanded {
  const list = Children.toArray(children)
  // Sin elementos hijos (solo texto) no hay nada que ganar partiendo.
  if (!list.some((child) => isValidElement(child))) return { leaf: element }
  const html = renderPiece(cloneElement(element, undefined, state.sentinel), state)
  const at = html.indexOf(state.sentinel)
  if (at < 0 || html.indexOf(state.sentinel, at + 1) >= 0) return { leaf: element }
  return { before: html.slice(0, at), after: html.slice(at + state.sentinel.length), children: list }
}

/**
 * Abre el nodo hasta encontrar un contenedor que se pueda partir. Los componentes sin hooks se
 * llaman como funciones (React haría lo mismo); los que usan hooks (o lanzan) se dibujan enteros.
 */
function expand(node: ReactNode, state: SliceState): Expanded {
  let current: ReactNode = node
  for (let i = 0; i < 16; i++) {
    if (Array.isArray(current)) return { before: '', after: '', children: Children.toArray(current) }
    if (!isValidElement(current)) return { leaf: current }
    const element = current as ReactElement<Record<string, unknown>>
    const { type, props } = element
    if (type === Fragment) return { before: '', after: '', children: Children.toArray(props.children as ReactNode) }
    if (typeof type === 'string') {
      if (!SPLIT_TAGS.has(type) || props.dangerouslySetInnerHTML != null) return { leaf: element }
      return shellOf(element, props.children as ReactNode, state)
    }
    if (typeof type !== 'function') return { leaf: element }
    if ((type as { prototype?: { isReactComponent?: unknown } }).prototype?.isReactComponent) return { leaf: element }
    if ((type as unknown as Record<symbol, unknown>)[RENDER_SLOT]) return shellOf(element, props.children as ReactNode, state)
    if (usesHooks(type)) return { leaf: element }
    let next: unknown
    try {
      next = (type as (p: unknown) => unknown)(props)
    } catch {
      return { leaf: element }
    }
    if (next && typeof (next as { then?: unknown }).then === 'function') return { leaf: element }
    current = next as ReactNode
  }
  return { leaf: current }
}

async function renderSliced(node: ReactNode, state: SliceState, depth: number): Promise<string> {
  const expanded = depth < MAX_DEPTH ? expand(node, state) : { leaf: node }
  if ('leaf' in expanded) {
    const html = renderPiece(expanded.leaf, state)
    await maybeYield(state)
    return html
  }
  const out: string[] = [expanded.before]
  let pending: ReactNode[] = []
  let pendingKeys: unknown[] = []
  // Hijos chicos seguidos por llamada: propio de este contenedor (sus hijos suelen ser parecidos:
  // hojas, etiquetas, barras), crece si la llamada fue corta y baja si pasó del tramo.
  let batch = 1
  const flush = async () => {
    if (pending.length === 0) return
    const before = state.work
    out.push(renderPiece(pending.length === 1 ? pending[0] : pending, state))
    const spent = state.work - before
    // Un solo hijo «chico» que resultó grande: los siguientes de su tipo se parten.
    if (pending.length === 1 && pendingKeys[0] !== undefined && spent >= state.sliceMs) state.small.set(pendingKeys[0], false)
    if (spent < state.sliceMs / 3) batch = Math.min(256, batch * 2)
    else if (spent > state.sliceMs) batch = Math.max(1, Math.floor(batch / 2))
    pending = []
    pendingKeys = []
    await maybeYield(state)
  }
  for (const child of expanded.children) {
    const key = typeKey(child)
    if (key === undefined || state.small.get(key) === true) {
      pending.push(child)
      pendingKeys.push(key)
      if (pending.length >= batch) await flush()
      continue
    }
    await flush()
    const before = state.work
    out.push(await renderSliced(child, state, depth + 1))
    // La primera vez se mide abriéndolo; si salió chico, los siguientes de su tipo van enteros.
    // «Chico» = cabe holgado en un tramo (menos de la mitad).
    if (!state.small.has(key)) state.small.set(key, state.work - before < state.sliceMs / 2)
  }
  await flush()
  out.push(expanded.after)
  return out.join('')
}

/**
 * Mismo marcado que `renderToStaticMarkup(element)`, pero por tramos: dibuja hoja por hoja (y, si
 * una hoja es grande, sus partes) y cede el hilo cada `sliceMs`. Así un documento de miles de
 * etiquetas no congela el servidor (ni la pestaña): las demás peticiones se atienden entre tramos.
 * Los ids de useId llevan un prefijo por tramo (únicos en todo el documento).
 */
export async function renderStaticMarkupInSlices(element: ReactNode, options: RenderSliceOptions = {}): Promise<string> {
  const now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()))
  const state: SliceState = {
    sliceMs: Math.max(0, options.sliceMs ?? 12),
    yieldToHost: options.yieldToHost ?? defaultYield,
    now,
    lastYield: now(),
    work: 0,
    seq: 0,
    small: new Map(),
    sentinel: `fzslot${Math.random().toString(36).slice(2, 10)}q`,
  }
  return renderSliced(element, state, 0)
}

/** Igual que `renderDocumentHtml`, por tramos (ver `renderStaticMarkupInSlices`). */
export async function renderDocumentHtmlAsync(element: ReactElement, options: RenderDocumentOptions & RenderSliceOptions): Promise<string> {
  const body = await renderStaticMarkupInSlices(element, options)
  return documentHtml(body, options)
}
