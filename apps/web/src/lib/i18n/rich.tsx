/**
 * Texto enriquecido: etiquetas en el mensaje (`Desde <b>{price}</b> + IVA al mes`) que se convierten
 * en elementos React, sin partir la frase (el orden de las palabras cambia entre idiomas).
 *
 * - `<tag>…</tag>` y `<tag/>`: el valor con ese nombre es un elemento (se clona con los hijos) o una
 *   función `(hijos) => nodo`.
 * - `{nombre}`: el valor puede ser texto, número o un nodo React (p. ej. `<AnimatedNumber/>`).
 * - Los valores nunca se interpretan como etiquetas: un cliente llamado «A<b>» se muestra tal cual.
 */
import { cloneElement, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react'
import { compileMessage, formatNumber, MessageSyntaxError, reportI18nIssue, renderNodes, type Locale } from '@dekopen/shared'

export type RichValue = ReactNode | ((chunks: ReactNode) => ReactNode)
export type RichValues = Readonly<Record<string, RichValue>>

const OPEN = ''
const CLOSE = ''
const TOKEN = /(\d+)/g
const TAG = /<(\/?)([A-Za-z][\w-]*)\s*(\/?)>/g

type Node = string | { tag: string; children: Node[] }

function isPrimitive(value: unknown): value is string | number | boolean | null | undefined {
  return value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

/** Evalúa el ICU dejando cada parámetro como una marca privada (para no confundirlo con etiquetas). */
function evaluate(message: string, values: RichValues, locale: Locale, slots: RichValue[], key?: string): string {
  const slot = (value: RichValue) => {
    slots.push(value)
    return `${OPEN}${slots.length - 1}${CLOSE}`
  }
  try {
    return renderNodes(compileMessage(message), {
      locale,
      arg: (name) => {
        if (!(name in values)) reportI18nIssue({ kind: 'param', key, locale, param: name })
        return slot(values[name])
      },
      num: (name) => {
        const v = values[name]
        return typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN
      },
      raw: (name) => {
        const v = values[name]
        return isPrimitive(v) ? String(v ?? '') : ''
      },
      pound: (value) => formatNumber(value, { locale, maxDecimals: 2 }),
    })
  } catch (error) {
    if (!(error instanceof MessageSyntaxError)) throw error
    reportI18nIssue({ kind: 'syntax', key, locale, message, error: error.message })
    return message
  }
}

/** Árbol de etiquetas. Una etiqueta sin cierre o un cierre sin apertura quedan como texto. */
function parseTags(text: string): Node[] {
  const root: { tag: string; children: Node[]; raw: string }[] = [{ tag: '', children: [], raw: '' }]
  let last = 0
  for (const match of text.matchAll(TAG)) {
    const [raw, closing, name, selfClosing] = match
    const top = root[root.length - 1]
    if (match.index > last) top.children.push(text.slice(last, match.index))
    last = match.index + raw.length
    if (selfClosing) top.children.push({ tag: name, children: [] })
    else if (!closing) root.push({ tag: name, children: [], raw })
    else if (root.length > 1 && top.tag === name) {
      root.pop()
      root[root.length - 1].children.push({ tag: top.tag, children: top.children })
    } else top.children.push(raw)
  }
  if (last < text.length) root[root.length - 1].children.push(text.slice(last))
  // Etiquetas abiertas sin cerrar: su texto vuelve como literal.
  while (root.length > 1) {
    const open = root.pop()!
    root[root.length - 1].children.push(open.raw, ...open.children)
  }
  return root[0].children
}

function renderText(text: string, slots: RichValue[], keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let i = 0
  for (const match of text.matchAll(TOKEN)) {
    if (match.index > last) out.push(text.slice(last, match.index))
    const value = slots[Number(match[1])]
    if (typeof value === 'function') out.push(null)
    else if (isValidElement(value)) out.push(cloneElement(value as ReactElement, { key: `${keyPrefix}v${i++}` }))
    else if (isPrimitive(value)) out.push(value === null || value === undefined || typeof value === 'boolean' ? '' : String(value))
    else out.push(<Fragment key={`${keyPrefix}v${i++}`}>{value}</Fragment>)
    last = match.index + match[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function renderTree(nodes: Node[], values: RichValues, slots: RichValue[], prefix: string, warn: (tag: string) => void): ReactNode[] {
  const out: ReactNode[] = []
  nodes.forEach((node, index) => {
    const key = `${prefix}${index}`
    if (typeof node === 'string') {
      out.push(...renderText(node, slots, `${key}t`))
      return
    }
    const children = renderTree(node.children, values, slots, `${key}.`, warn)
    const content = children.length === 0 ? undefined : children.length === 1 ? children[0] : children
    const renderer = values[node.tag]
    if (typeof renderer === 'function') out.push(<Fragment key={key}>{renderer(content ?? null)}</Fragment>)
    else if (isValidElement(renderer)) out.push(content === undefined ? cloneElement(renderer as ReactElement, { key }) : cloneElement(renderer as ReactElement, { key }, content))
    else {
      warn(node.tag)
      out.push(<Fragment key={key}>{content}</Fragment>)
    }
  })
  return out
}

/** Convierte un mensaje con etiquetas y parámetros en nodos React. Sin etiquetas ni nodos, devuelve texto. */
export function renderRich(message: string, values: RichValues = {}, locale: Locale = 'es', key?: string): ReactNode {
  const slots: RichValue[] = []
  const text = evaluate(message, values, locale, slots, key)
  const onlyText = !text.includes('<') && slots.every((v) => isPrimitive(v))
  if (onlyText) return text.replace(TOKEN, (_, i: string) => {
    const v = slots[Number(i)]
    return v === null || v === undefined || typeof v === 'boolean' ? '' : String(v)
  })
  const warn = (tag: string) => {
    if (import.meta.env.DEV) console.warn(`[i18n] «${key ?? message}» usa <${tag}> pero no se pasó cómo dibujarla.`)
  }
  const nodes = renderTree(parseTags(text), values, slots, 'r', warn)
  return nodes.length === 1 ? nodes[0] : <>{nodes}</>
}
