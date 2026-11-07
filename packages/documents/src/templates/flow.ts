/**
 * Paginación de una plantilla: cada sección entrega bloques con su alto (estimado o medido) y aquí se
 * reparten en hojas físicas. El mismo algoritmo corre en tres lugares:
 *
 * - en React con altos estimados (respaldo determinista: pruebas, servidor sin navegador);
 * - en React con altos medidos en el DOM (vista previa de la web: `MeasuredTemplateDocument`);
 * - sobre el HTML estático en Chromium antes de imprimir (`flowDocumentPages`, en `flow-dom.ts`).
 *
 * Reglas: un bloque no se parte; si no cabe pasa a la hoja siguiente; un título (`keepWithNext`) viaja
 * con el bloque que lo sigue; `breakBefore` abre hoja; `page: 'own'` ocupa una hoja completa; la
 * portada es una hoja fija; una tabla que sigue en otra hoja repite su encabezado. Un bloque más alto
 * que la hoja queda solo en su hoja y se informa como desborde (nunca se recorta en silencio).
 *
 * Cierre: si la última hoja queda casi vacía (una línea suelta y la firma), las condiciones del final
 * de la hoja anterior bajan a acompañarla. Ver `balanceClosing`; `flow-dom.ts` repite la misma regla.
 */
import type { ReactNode } from 'react'
import type { SectionTone } from '@dekopen/shared'

export interface FlowBlock {
  /** Clave única en el documento (estable entre renders: la usa la medición). */
  key: string
  sectionId: string
  sectionType: string
  node: ReactNode
  /** Alto del contenido en px (sin el aire previo). */
  height: number
  /** Aire antes del bloque cuando no es el primero de la hoja. */
  space: number
  keepWithNext?: boolean
  breakBefore?: boolean
  /**
   * El salto viene de la sección (`pageBreak: 'before'`), no de un salto de página explícito: si la
   * hoja actual quedó casi vacía (menos de un cuarto), no se abre otra para no dejar una hoja con dos
   * líneas.
   */
  softBreak?: boolean
  /** El salto se cancela si este bloque y lo que viaja con él caben en lo que queda de la hoja. */
  breakUnlessFits?: boolean
  /** `cover`: portada (hoja fija); `own`: ocupa una hoja entera (un ítem por página). */
  page?: 'cover' | 'own'
  /** Portada a sangre (sin márgenes). */
  bleed?: boolean
  /** Tabla a la que pertenece (para repetir el encabezado al pasar de hoja). */
  group?: string
  /** Encabezado repetible de `group`. */
  thead?: boolean
  tone?: SectionTone
  /** Posición dentro de la sección (para unir fondos de bandas). */
  edge?: 'first' | 'last' | 'only' | 'middle'
  /** En secciones con fondo: separación interna (relleno) que reemplaza al margen para no cortar el fondo. */
  innerSpace?: number
}

export interface PlacedBlock {
  block: FlowBlock
  /** Copia del encabezado de tabla agregada al comenzar la hoja. */
  clone?: boolean
  overflow?: boolean
}

export interface FlowPage {
  kind: 'cover' | 'flow'
  /** Primera hoja sin portada: lleva la identidad en el cuerpo, sin cabecera corrida. */
  lead: boolean
  blocks: PlacedBlock[]
  bleed?: boolean
}

export interface FlowBudgets {
  /** Alto útil de la hoja inicial (sin portada). */
  lead: number
  /** Alto útil de las demás hojas. */
  rest: number
  /** Alto útil de la portada. */
  cover: number
}

export interface FlowResult {
  pages: FlowPage[]
  /** Bloques más altos que una hoja (se imprimen solos en su hoja). */
  overflow: string[]
}

/** Alto efectivo de un bloque: el medido si existe, si no el estimado. */
export type HeightOf = (block: FlowBlock) => number

/** Secciones de texto que pueden bajar a la última hoja. Totales, pago y ventanas nunca se mueven. */
const CLOSING_TYPES = new Set(['terms', 'warranty', 'custom_text'])
/** La última hoja se rellena si usa menos que esto del alto útil… */
const CLOSING_SPARSE = 0.55
/** …sin pasarse de esto… */
const CLOSING_MAX = 0.92
/** …ni dejar la hoja anterior por debajo de esto. */
const CLOSING_MIN_PREV = 0.4

function balanceClosing(pages: FlowPage[], budgetOf: (page: FlowPage) => number, heightOf: HeightOf): void {
  const last = pages[pages.length - 1]
  const prev = pages[pages.length - 2]
  if (!last || !prev || last.kind !== 'flow' || prev.kind !== 'flow' || last.blocks.length === 0) return
  const sum = (list: readonly PlacedBlock[]) => list.reduce((a, p, i) => a + Math.max(0, heightOf(p.block)) + (i ? p.block.space : 0), 0)
  const budget = budgetOf(last)
  let lastUsed = sum(last.blocks)
  if (lastUsed >= budget * CLOSING_SPARSE) return
  let prevUsed = sum(prev.blocks)
  let cut = prev.blocks.length
  // Se baja la sección entera: unas condiciones partidas pierden su título en la hoja siguiente.
  for (let i = prev.blocks.length - 1; i > 0; i--) {
    const placed = prev.blocks[i]
    if (placed.clone || placed.block.group || !CLOSING_TYPES.has(placed.block.sectionType)) break
    const h = Math.max(0, heightOf(placed.block)) + placed.block.space
    lastUsed += h
    prevUsed -= h
    if (lastUsed > budget * CLOSING_MAX || prevUsed < budget * CLOSING_MIN_PREV) break
    if (prev.blocks[i - 1].block.sectionId !== placed.block.sectionId) cut = i
  }
  if (cut < prev.blocks.length) last.blocks.unshift(...prev.blocks.splice(cut))
}

export function paginateFlow(blocks: readonly FlowBlock[], budgets: FlowBudgets, heightOf: HeightOf = (b) => b.height): FlowResult {
  const pages: FlowPage[] = []
  const overflow: string[] = []
  const hasCover = blocks.some((b) => b.page === 'cover')
  const theads = new Map<string, FlowBlock>()
  for (const b of blocks) if (b.group && b.thead) theads.set(b.group, b)

  let current: FlowPage | null = null
  let used = 0
  const budget = (page: FlowPage) => (page.kind === 'cover' ? budgets.cover : page.lead ? budgets.lead : budgets.rest)
  const open = (): FlowPage => {
    const page: FlowPage = { kind: 'flow', lead: !hasCover && !pages.some((p) => p.kind === 'flow'), blocks: [] }
    pages.push(page)
    current = page
    used = 0
    return page
  }
  const place = (page: FlowPage, block: FlowBlock, clone = false) => {
    const h = Math.max(0, heightOf(block))
    const s = page.blocks.length ? block.space : 0
    const over = page.blocks.length === 0 && h > budget(page) + 0.5
    if (over && !clone) overflow.push(block.key)
    page.blocks.push({ block, ...(clone ? { clone: true } : {}), ...(over ? { overflow: true } : {}) })
    used += s + h
  }
  /** Al abrir hoja con una fila de tabla, primero su encabezado. */
  const withHead = (page: FlowPage, block: FlowBlock) => {
    if (block.group && !block.thead && page.blocks.length === 0) {
      const head = theads.get(block.group)
      if (head) place(page, head, true)
    }
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]
    if (block.page === 'cover') {
      pages.push({ kind: 'cover', lead: false, blocks: [{ block }], ...(block.bleed ? { bleed: true } : {}) })
      current = null
      continue
    }
    let page: FlowPage = current ?? open()
    const h = Math.max(0, heightOf(block))
    // Cadena «viaja con el siguiente»: título → ventana → subtotal se mueven juntos, no de a pares.
    let chain = 0
    if (block.keepWithNext) {
      for (let j = i + 1; j < blocks.length; j++) {
        const nb = blocks[j]
        if (nb.breakBefore || nb.page === 'own' || nb.page === 'cover') break
        chain += nb.space + Math.max(0, heightOf(nb))
        if (!nb.keepWithNext) break
      }
    }
    const fits = !!block.breakUnlessFits && page.blocks.length > 0 && used + block.space + h + chain <= budget(page) + 0.5
    const wantsBreak = block.page === 'own' || (block.breakBefore && !fits && !(block.softBreak && page.kind === 'flow' && used < budget(page) * 0.25))
    if (wantsBreak && page.blocks.length > 0) page = open()
    const s = page.blocks.length ? block.space : 0
    if (page.blocks.length > 0 && used + s + h + chain > budget(page) + 0.5) {
      page = open()
    }
    withHead(page, block)
    place(page, block)
    if (block.page === 'own') current = null
  }
  // Una hoja que quedó solo con el encabezado repetido de una tabla no aporta nada.
  const cleaned = pages.filter((p) => p.blocks.some((b) => !b.clone))
  if (cleaned.length === 0) cleaned.push({ kind: 'flow', lead: !hasCover, blocks: [] })
  balanceClosing(cleaned, budget, heightOf)
  return { pages: cleaned, overflow }
}

/**
 * Marca la posición de cada bloque dentro de su sección. En secciones con fondo (suave, acento,
 * intenso) el fondo es continuo: el relleno de la banda se suma al alto del primer y último bloque, y
 * la separación entre bloques pasa a ser relleno interno (no margen) para no cortar el fondo.
 */
export function markEdges(blocks: FlowBlock[], pad = 16): FlowBlock[] {
  return blocks.map((b, i) => {
    const prev = blocks[i - 1]
    const next = blocks[i + 1]
    const first = !prev || prev.sectionId !== b.sectionId
    const last = !next || next.sectionId !== b.sectionId
    const edge: FlowBlock['edge'] = first && last ? 'only' : first ? 'first' : last ? 'last' : 'middle'
    if (!b.tone || b.tone === 'paper' || b.page === 'cover') return { ...b, edge }
    let height = b.height
    let space = b.space
    let innerSpace: number | undefined
    if (edge === 'first' || edge === 'only') height += pad
    if (edge === 'last' || edge === 'only') height += pad
    if (edge === 'middle' || edge === 'last') {
      innerSpace = b.space
      height += b.space
      space = 0
    }
    return { ...b, edge, height, space, ...(innerSpace ? { innerSpace } : {}) }
  })
}
