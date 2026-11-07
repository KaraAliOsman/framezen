/**
 * Reglas del lienzo de documentos, sin React: qué operación apaga un elemento de la hoja, adónde se
 * puede mover una sección y qué se puede hacer con ella. Todo termina en `DocOp`, las mismas que usan
 * el servidor y el agente: el lienzo no guarda ningún estado propio del documento.
 */
import {
  ITEM_DISPLAY_KEYS,
  SECTION_META,
  applyTermsPlacement,
  closingOrderViolation,
  resolveDocSettings,
  withClosingLast,
  type DocOp,
  type DocSection,
  type DocTemplate,
  type TermsPlacement,
} from '@dekopen/shared'

/** Dónde se edita: una plantilla, o una sola cotización sobre su plantilla. */
export type CanvasScope = 'template' | 'quote'

/** Partes de la hoja que no son secciones. */
export const IDENTITY_ID = 'identity'
export const PAGE_CHROME_ID = 'page'

/** Atributos con que cada documento marca sus bloques: cotización y catálogo. */
export const SECTION_ATTRS = ['data-dk-section', 'data-section'] as const
export const SECTION_SELECTOR = SECTION_ATTRS.map((a) => `[${a}]`).join(',')
export const sectionNodesSelector = (id: string) => SECTION_ATTRS.map((a) => `[${a}="${id}"]`).join(',')

export function sectionIdOf(el: Element | null): string | null {
  const node = el?.closest(SECTION_SELECTOR)
  if (!node) return null
  for (const attr of SECTION_ATTRS) {
    const value = node.getAttribute(attr)
    if (value) return value
  }
  return null
}

/** Cadena de elementos bajo el puntero, del más chico al más grande (máximo tres). */
export function elementChain(target: Element | null, stop: Element | null): string[] {
  const out: string[] = []
  let node = target?.closest('[data-dk-el]') ?? null
  while (node && out.length < 3 && node !== stop) {
    const key = node.getAttribute('data-dk-el')
    if (key && !out.includes(key)) out.push(key)
    node = node.parentElement?.closest('[data-dk-el]') ?? null
  }
  return out
}

const isItemKey = (key: string) => (ITEM_DISPLAY_KEYS as readonly string[]).includes(key)

/**
 * Operaciones que apagan un elemento de la hoja. Las ventanas usan `setItemDisplay`, que es lo que
 * mandan los ajustes de la cotización y el panel; lo demás, la opción de su sección. Nada = no se apaga.
 */
export function hideElementOps(section: DocSection | null, key: string): DocOp[] | null {
  if (!section) return key === 'showLogo' ? [{ op: 'setDocSettings', patch: { showLogo: false } } as DocOp] : null
  const options = section.options as Record<string, unknown>
  if (section.type === 'items') {
    if (key === 'drawing') return [{ op: 'setItemDisplay', patch: { drawingSize: 'none' } } as DocOp]
    if (key === 'finishes') return [{ op: 'setItemDisplay', patch: { finishes: 'none' } } as DocOp]
    return isItemKey(key) ? [{ op: 'setItemDisplay', patch: { [key]: false } } as DocOp] : null
  }
  if (key.startsWith('field:') || key.startsWith('block:')) {
    const [kind, value] = key.split(':')
    const list = options[kind === 'field' ? 'fields' : 'blocks']
    if (!Array.isArray(list) || !list.includes(value)) return null
    const next = list.filter((x) => x !== value)
    // La última no se puede quitar de la lista: quitarla es ocultar la sección.
    if (next.length === 0) return [{ op: 'toggleSection', sectionId: section.id, enabled: false }]
    return [{ op: 'updateSectionOptions', sectionId: section.id, options: { [kind === 'field' ? 'fields' : 'blocks']: next } }]
  }
  return typeof options[key] === 'boolean' ? [{ op: 'updateSectionOptions', sectionId: section.id, options: { [key]: false } }] : null
}

/** Orden en que se imprimen las secciones visibles (el mismo cálculo del documento). */
export function printedOrder(sections: readonly DocSection[], placement: TermsPlacement): DocSection[] {
  return applyTermsPlacement(withClosingLast(sections.filter((s) => s.enabled)), placement)
}

function placementAfter(sections: readonly DocSection[], moving: DocSection, placement: TermsPlacement): TermsPlacement {
  if (moving.type !== 'terms' && moving.type !== 'warranty') return placement
  const totals = sections.findIndex((s) => s.type === 'totals')
  const terms = sections.findIndex((s) => s.type === 'terms')
  if (totals < 0 || terms < 0) return placement
  return terms < totals ? 'before_total' : placement === 'before_total' ? 'after_total' : placement
}

/**
 * ¿Mover `movingId` junto a `targetId` cambia el documento sin romper sus reglas? La portada no se
 * mueve, nada va antes de ella, el total sigue en su cierre y un movimiento que el orden impreso
 * desharía (garantía y condiciones viajan juntas) no se ofrece.
 */
export function canMoveTo(template: Pick<DocTemplate, 'sections' | 'settings'>, movingId: string, targetId: string, after: boolean): boolean {
  if (movingId === targetId) return false
  const sections = template.sections
  const moving = sections.find((s) => s.id === movingId)
  const target = sections.find((s) => s.id === targetId)
  if (!moving || !target || moving.type === 'cover' || (target.type === 'cover' && !after)) return false
  const rest = sections.filter((s) => s.id !== movingId)
  rest.splice(rest.findIndex((s) => s.id === targetId) + (after ? 1 : 0), 0, moving)
  if (closingOrderViolation(rest) >= 0) return false
  const placement = resolveDocSettings(template.settings).termsPlacement
  const before = printedOrder(sections, placement).map((s) => s.id)
  const next = printedOrder(rest, placementAfter(rest, moving, placement)).map((s) => s.id)
  return next.some((id, i) => id !== before[i])
}

export function moveOp(movingId: string, targetId: string, after: boolean): DocOp {
  return after ? { op: 'moveSection', sectionId: movingId, afterId: targetId } : { op: 'moveSection', sectionId: movingId, beforeId: targetId }
}

/** Subir o bajar respecto de lo que se ve en la hoja; si el vecino no admite el cambio, nada. */
export function stepOp(template: Pick<DocTemplate, 'sections' | 'settings'>, sectionId: string, dir: -1 | 1): DocOp | null {
  const printed = printedOrder(template.sections, resolveDocSettings(template.settings).termsPlacement)
  const index = printed.findIndex((s) => s.id === sectionId)
  if (index < 0) return null
  const target = printed[index + dir]
  if (!target || !canMoveTo(template, sectionId, target.id, dir > 0)) return null
  return moveOp(sectionId, target.id, dir > 0)
}

/** Una cotización solo agrega texto libre y saltos de hoja; una plantilla, hasta el máximo del tipo. */
export function canDuplicate(scope: CanvasScope, template: Pick<DocTemplate, 'sections'>, section: DocSection): boolean {
  if (scope === 'quote' && section.type !== 'custom_text' && section.type !== 'page_break') return false
  return template.sections.filter((s) => s.type === section.type).length < SECTION_META[section.type].max
}

export function scrollParent(el: Element | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const style = getComputedStyle(node)
    if (/(auto|scroll)/.test(style.overflowY)) return node
  }
  return null
}

/** Un rectángulo por hoja: los bloques de una sección se unen dentro de su hoja. */
export function unionByPage(nodes: readonly Element[]): DOMRect[] {
  const pages = new Map<Element | null, { top: number; left: number; right: number; bottom: number }>()
  for (const node of nodes) {
    const r = node.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    const page = node.closest('[data-dk-page],.dkc-page')
    const box = pages.get(page)
    if (box) {
      box.top = Math.min(box.top, r.top)
      box.left = Math.min(box.left, r.left)
      box.right = Math.max(box.right, r.right)
      box.bottom = Math.max(box.bottom, r.bottom)
    } else pages.set(page, { top: r.top, left: r.left, right: r.right, bottom: r.bottom })
  }
  return [...pages.values()].map((b) => new DOMRect(b.left, b.top, b.right - b.left, b.bottom - b.top))
}
