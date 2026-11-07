import { assemblyUnits, matchTypology, type Catalog, type CutPiece, type Glass, type Item, type ItemLine, type WorkshopWindow } from '@dekopen/engine'
import { typologyName } from '@dekopen/shared'
import { sideTokens, workshopI18n, type WorkshopI18n } from './locale'
import type { CutPartKind } from './parts'
import type { WorkshopDocumentData } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo
// ─────────────────────────────────────────────────────────────────────────────

export function colorInfo(catalog: Catalog | undefined, colorId: string | undefined): { name: string; hex?: string } | undefined {
  if (!colorId) return undefined
  const color = catalog?.colors.find((c) => c.id === colorId)
  if (color) return { name: color.name, hex: color.hex }
  return { name: colorId.charAt(0).toUpperCase() + colorId.slice(1) }
}

export function glassInfo(catalog: Catalog | undefined, glassId: string): Glass | undefined {
  return catalog?.glass.find((g) => g.id === glassId)
}

export function itemByCode(catalog: Catalog | undefined, code: string): Item | undefined {
  return catalog?.items.find((i) => i.code === code)
}

// ─────────────────────────────────────────────────────────────────────────────
// Lados y etiquetas
// ─────────────────────────────────────────────────────────────────────────────

export { sideTokens }

/** «arr · aba» → «arriba · abajo» (o en el idioma pedido). Deja intacto lo que no reconoce. */
export function sideWords(label: string, w: WorkshopI18n = workshopI18n()): string {
  return w.side(label)
}

/**
 * Etiqueta corta de una pieza en una barra: «V3 · arr» (agrega la ref si falta). Con `w`, el lado
 * va en palabras del idioma del documento («V3 · top») salvo en español, que conserva la forma corta.
 */
export function barLabel(label: string, ref?: string, w?: WorkshopI18n): string {
  const local = (text: string) => (w && w.locale !== 'es' ? w.side(text) : text)
  if (!ref) return local(label)
  if (label.startsWith(ref)) {
    const rest = label.slice(ref.length).replace(/^\s*·\s*/, '')
    return rest ? `${ref} · ${local(rest)}` : ref
  }
  return `${ref} · ${local(label)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Códigos de pieza: V2-M03 (ventana-miembro). Refuerzo de una pieza: V2-M03-R.
// Iguales en OT, etiquetas y pantalla. Dos unidades de la misma ventana comparten
// código (son intercambiables); la etiqueta indica «unidad 2 de 3».
// ─────────────────────────────────────────────────────────────────────────────

const KIND_RANK: Record<CutPiece['kind'], number> = { profile: 0, bead: 1, reinforcement: 2 }

/** Cortes en orden de taller: perfiles, junquillos y refuerzos (estable). */
export function orderedCuts(cuts: CutPiece[]): { piece: CutPiece; index: number }[] {
  return cuts
    .map((piece, index) => ({ piece, index }))
    .sort((a, b) => KIND_RANK[a.piece.kind] - KIND_RANK[b.piece.kind] || a.index - b.index)
}

export interface WorkshopPieceUnit {
  /** Código completo: «V2-M03» o «V2-M03-R». */
  code: string
  /** Parte del miembro: «M03» o «M03-R». */
  member: string
  ref: string
  piece: CutPiece
  /** Índice de la pieza en `bom.cuts`. */
  cutIndex: number
  /** Lado de esta pieza física («arr»), si se puede saber; si no, la etiqueta completa. */
  side: string
}

function memberCode(n: number): string {
  return `M${String(n).padStart(2, '0')}`
}

/** Piezas físicas de UNA unidad de la ventana, con su código. */
export function workshopPieceCodes(window: WorkshopWindow): WorkshopPieceUnit[] {
  const units: WorkshopPieceUnit[] = []
  const byCut = new Map<number, WorkshopPieceUnit[]>()
  const matched = new Set<number>()
  let next = 1

  const push = (piece: CutPiece, cutIndex: number, members: string[]) => {
    // En un conjunto la etiqueta trae la unidad: «A · arr/aba» → «A · arr» y «A · aba».
    const unit = /^([A-Z]+) · (.+)$/.exec(piece.label)
    const tokens = sideTokens(unit?.[2] ?? piece.label)
    const list = members.map((member, i) => ({
      code: `${window.ref}-${member}`,
      member,
      ref: window.ref,
      piece,
      cutIndex,
      side: tokens.length === members.length ? `${unit ? `${unit[1]} · ` : ''}${tokens[i] ?? piece.label}` : piece.label,
    }))
    byCut.set(cutIndex, list)
    units.push(...list)
  }

  for (const { piece, index } of orderedCuts(window.bom.cuts)) {
    const qty = Math.max(0, Math.round(piece.qty))
    if (piece.kind === 'reinforcement') {
      // Refuerzo: hereda el código de la pieza que refuerza (mismo nodo, lado y cantidad).
      const parent = window.bom.cuts.findIndex(
        (p, i) =>
          p.kind === 'profile' && !matched.has(i) && p.nodeId === piece.nodeId && p.label === piece.label && Math.round(p.qty) === qty,
      )
      const parentUnits = parent >= 0 ? byCut.get(parent) : undefined
      if (parentUnits && parentUnits.length === qty) {
        matched.add(parent)
        push(
          piece,
          index,
          parentUnits.map((u) => `${u.member}-R`),
        )
        continue
      }
    }
    const members = Array.from({ length: qty }, () => memberCode(next++))
    push(piece, index, members)
  }
  return units
}

/** Agrupa los códigos por índice de corte (para la tabla de la OT). */
export function codesByCut(units: WorkshopPieceUnit[]): Map<number, string[]> {
  const map = new Map<number, string[]>()
  for (const u of units) {
    const list = map.get(u.cutIndex) ?? []
    list.push(u.member)
    map.set(u.cutIndex, list)
  }
  return map
}

/** [M01, M02, M03] → «M01–M03»; [M01-R, M02-R] → «M01-R · M02-R». */
export function formatCodeRange(codes: string[]): string {
  if (codes.length === 0) return ''
  if (codes.length === 1) return codes[0] ?? ''
  const plain = codes.every((c) => /^M\d+$/.test(c))
  if (plain) {
    const nums = codes.map((c) => Number(c.slice(1)))
    const consecutive = nums.every((n, i) => i === 0 || n === (nums[i - 1] ?? 0) + 1)
    if (consecutive && codes.length > 2) return `${codes[0]}–${codes[codes.length - 1]}`
  }
  return codes.join(' · ')
}

// ─────────────────────────────────────────────────────────────────────────────
// Ventanas
// ─────────────────────────────────────────────────────────────────────────────

/** Tintes suaves por ventana: se distinguen en color y siguen legibles en B/N. */
export const WINDOW_TINTS = ['#DCE3FA', '#DCEFE2', '#FBEBD2', '#F2DDEB', '#D7ECEF', '#ECE3D3', '#F7DCD6', '#E4DFF5', '#E9F0D5', '#F3E6C8']

export function windowTint(data: WorkshopDocumentData, ref: string | undefined): string {
  if (!ref) return '#EEEAE3'
  const i = data.windows.findIndex((w) => w.ref === ref)
  return WINDOW_TINTS[(i < 0 ? 0 : i) % WINDOW_TINTS.length] ?? '#EEEAE3'
}

/**
 * Título y subtítulo humanos de una ventana. La descripción del motor empieza con el nombre de la
 * tipología en español; en otro idioma se cambia por el del glosario (el resto son nombres del
 * catálogo: línea, color, vidrio).
 */
export function windowTitle(window: WorkshopWindow, w?: WorkshopI18n): { title: string; subtitle: string } {
  const parts = window.description.split(' · ').filter(Boolean)
  if (w && w.locale !== 'es' && parts.length) {
    const id = safeMatch(window)
    if (id) parts[0] = typologyName(id, w.locale, parts[0])
  }
  const head = parts[0] ?? window.ref
  if (window.name) {
    return { title: window.name, subtitle: [window.location, parts.join(' · ')].filter(Boolean).join(' · ') }
  }
  return { title: head, subtitle: [window.location, ...parts.slice(1)].filter(Boolean).join(' · ') }
}

function safeMatch(window: WorkshopWindow): string | undefined {
  try {
    return matchTypology(window.design)
  } catch {
    return undefined
  }
}

/** ¿Tiene hojas que abren (practicables o correderas móviles)? */
export function windowOperable(window: WorkshopWindow): boolean {
  return window.layout.sashes.length > 0 || window.layout.sliding.some((p) => p.kind === 'moving')
}

export function windowIsSliding(window: WorkshopWindow): boolean {
  return window.design.root.type === 'sliding' || window.layout.sliding.length > 0
}

/** Ángulo de corte distinto de 45°/90° (requiere escuadra especial). */
export function isOddAngle(angle: number): boolean {
  return Math.abs(angle - 45) > 0.05 && Math.abs(angle - 90) > 0.05
}

/** Línea de referencia del documento: «Cotización N° 412 · Casa Pérez». */
/** Sin nombre de obra, el título es el número de la cotización: se escribe en el idioma del documento. */
export function quoteTitle(data: WorkshopDocumentData, w: WorkshopI18n = workshopI18n()): string {
  const unnamed = data.quote.title === `Cotización N° ${data.quote.number}`
  return unnamed ? w.t('common.quoteLabel', { number: data.quote.number }) : data.quote.title
}

export function quoteLine(data: WorkshopDocumentData, w: WorkshopI18n = workshopI18n()): string {
  const title = quoteTitle(data, w)
  const label = w.t('common.quoteLabel', { number: data.quote.number })
  return title === label ? label : w.t('common.quoteLine', { number: data.quote.number, title })
}

/** Pie sin tramos repetidos: «Cotización N° 1 · Cortes · Cotización N° 1» dice lo mismo dos veces. */
export function uniqueFooter(footer: string): string {
  return footer
    .split(' · ')
    .filter((part, i, all) => all.indexOf(part) === i)
    .join(' · ')
}

export function otLabel(data: WorkshopDocumentData, w: WorkshopI18n = workshopI18n()): string {
  if (data.workOrder.fromQuote) return w.t('common.quoteLabel', { number: data.quote.number })
  return w.t('common.otLabel', { number: data.workOrder.number })
}

/** Rótulo de un documento filtrado por tipo de pieza: «Optimización de cortes · Hojas, Junquillos». */
export function partsKicker(kicker: string, parts: readonly CutPartKind[] | undefined, w: WorkshopI18n): string {
  if (!parts?.length) return kicker
  return `${kicker} · ${parts.map((part) => w.t(`common.parts.${part}`)).join(', ')}`
}

/** Une líneas repetidas del mismo artículo (el competidor imprime «12» y «24» por separado). */
export function consolidateItems(items: ItemLine[]): ItemLine[] {
  const map = new Map<string, ItemLine>()
  for (const item of items) {
    const key = `${item.itemId}|${item.unit}`
    const prev = map.get(key)
    if (prev) map.set(key, { ...prev, qty: prev.qty + item.qty, nodeId: undefined })
    else map.set(key, { ...item })
  }
  return [...map.values()]
}

/** Herrajes de una ventana por hoja o paño (los mismos artículos de una hoja se suman). Sin hoja conocida, rótulo vacío. */
export function itemsByPane(window: WorkshopWindow, kind: ItemLine['kind'] = 'hardware'): { label: string; items: ItemLine[] }[] {
  const labels = new Map(window.bom.glass.map((g) => [g.nodeId, g.label]))
  const panes = new Map<string, ItemLine[]>()
  for (const item of window.bom.items) {
    if (item.kind !== kind) continue
    const label = (item.nodeId && labels.get(item.nodeId)) || ''
    panes.set(label, [...(panes.get(label) ?? []), item])
  }
  return [...panes.entries()].map(([label, items]) => ({ label, items: consolidateItems(items) }))
}

/** Mosquiteros de una ventana (en un conjunto, los de cada unidad). */
export function windowScreens(window: WorkshopWindow): { type: string; unit?: string }[] {
  const of = (extras: WorkshopWindow['design']['extras'], unit?: string) => {
    const type = extras?.insectScreen?.type ?? (extras?.screen ? 'fixed' : undefined)
    return type ? [{ type, ...(unit ? { unit } : {}) }] : []
  }
  const units = assemblyUnits(window.design)
  return units.length > 0 ? units.flatMap((u) => of(u.design.extras, u.id)) : of(window.design.extras)
}

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/**
 * Código que se imprime para un material. Los vidrios no tienen código de catálogo (el motor usa
 * su id interno), así que se muestra un guion en vez de un código que nadie reconoce.
 */
export function materialCode(line: { group: string; code: string }): string {
  return line.group === 'glass' ? '—' : line.code
}
