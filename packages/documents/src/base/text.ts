/** Texto de usuario → estructuras simples para imprimir (sin HTML crudo). */

export interface PaymentStep {
  pct: number
  label: string
  amount: number
}

/**
 * Lee la forma de pago escrita por el taller y calcula los montos de cada cuota.
 * «50% al aceptar, 50% contra entrega» → [{50, 'Al aceptar', …}, {50, 'Contra entrega', …}].
 * Devuelve null si los porcentajes no suman 100 (se imprime el texto tal cual).
 */
export function paymentSchedule(text: string | undefined, total: number): PaymentStep[] | null {
  if (!text || !(total > 0)) return null
  const re = /(\d{1,3}(?:[.,]\d+)?)\s*%/g
  const matches = [...text.matchAll(re)]
  if (matches.length < 2) return null
  const steps = matches.map((m, i) => {
    const start = (m.index ?? 0) + m[0].length
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length
    const raw = text
      .slice(start, end)
      .replace(/^[\s:–—-]+/, '')
      .replace(/(\s+(y|e)\s*|[\s,;/.+–—-]+)$/i, '')
      .replace(/\s+(y|e)$/i, '')
      .trim()
    const label = raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : `Cuota ${i + 1}`
    return { pct: Number(m[1].replace(',', '.')), label, amount: 0 }
  })
  const sum = steps.reduce((acc, s) => acc + s.pct, 0)
  if (Math.abs(sum - 100) > 0.5) return null
  let assigned = 0
  steps.forEach((step, i) => {
    step.amount = i === steps.length - 1 ? Math.round(total) - assigned : Math.round((total * step.pct) / 100)
    assigned += step.amount
  })
  return steps
}

export type RichBlock =
  | { type: 'p'; spans: RichSpan[] }
  | { type: 'ul'; items: RichSpan[][] }
  | { type: 'h'; spans: RichSpan[] }

export interface RichSpan {
  text: string
  strong?: boolean
}

function spans(line: string): RichSpan[] {
  const out: RichSpan[] = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  for (const m of line.matchAll(re)) {
    const idx = m.index ?? 0
    if (idx > last) out.push({ text: line.slice(last, idx) })
    out.push({ text: m[1], strong: true })
    last = idx + m[0].length
  }
  if (last < line.length) out.push({ text: line.slice(last) })
  return out.length ? out : [{ text: '' }]
}

/**
 * Markdown mínimo de las condiciones: párrafos, listas con «-», «•» o «*»,
 * títulos con «#» y **negrita**. Las líneas numeradas («1. …», «1- …») se
 * conservan como párrafos para no reinterpretar el texto del taller.
 */
export function parseRichText(text: string | undefined): RichBlock[] {
  if (!text) return []
  const blocks: RichBlock[] = []
  let list: RichSpan[][] | null = null
  let para: string[] = []
  const flushPara = () => {
    if (para.length) blocks.push({ type: 'p', spans: spans(para.join(' ')) })
    para = []
  }
  const flushList = () => {
    if (list) blocks.push({ type: 'ul', items: list })
    list = null
  }
  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      flushPara()
      flushList()
      continue
    }
    const bullet = /^[-•*·]\s+(.*)$/.exec(line)
    const heading = /^#{1,4}\s+(.*)$/.exec(line)
    if (bullet) {
      flushPara()
      list = list ?? []
      list.push(spans(bullet[1]))
    } else if (heading) {
      flushPara()
      flushList()
      blocks.push({ type: 'h', spans: spans(heading[1]) })
    } else {
      flushList()
      // Cada línea con numeración propia es su propio párrafo.
      if (/^\d+\s*[.)-]\s*/.test(line)) {
        flushPara()
        para.push(line)
        flushPara()
      } else {
        para.push(line)
      }
    }
  }
  flushPara()
  flushList()
  return blocks
}

/** Estimación de líneas de un texto en una columna de `charsPerLine` caracteres. */
export function estimateLines(text: string | undefined, charsPerLine: number): number {
  if (!text) return 0
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .reduce((acc, line) => acc + Math.max(line.trim() ? 1 : 0.5, Math.ceil(line.length / Math.max(10, charsPerLine))), 0)
}
