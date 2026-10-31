/**
 * Cambios a todas las ventanas de una cotización (color, vidrio). Puros: reciben el documento y
 * devuelven uno nuevo (o el mismo si nada cambia), con las referencias que cambiaron y las que
 * no pudieron (la línea no fabrica ese color). Nunca lanzan.
 */
import { setColor, setGlass, type Catalog, type WindowDesign } from '@framezen/engine'
import type { QuoteDoc } from './doc'

export interface BulkResult {
  doc: QuoteDoc
  changed: string[]
  skipped: string[]
}

/** ¿La línea de este diseño se fabrica en ese color? (sin lista de colores = todos). */
export function lineHasColor(catalog: Catalog, design: WindowDesign, colorId: string): boolean {
  const line = catalog.lines.find((l) => l.id === design.lineId)
  return !line || !line.colorIds?.length || line.colorIds.includes(colorId)
}

/** Mismo color (un solo color, o bicolor exterior/interior) en todas las ventanas que lo admiten. */
export function applyColorToAll(doc: QuoteDoc, catalog: Catalog, colorId: string, colorInId?: string): BulkResult {
  const changed: string[] = []
  const skipped: string[] = []
  const items = doc.items.map((item) => {
    if (!lineHasColor(catalog, item.design, colorId) || (colorInId && !lineHasColor(catalog, item.design, colorInId))) {
      if (item.design.colorId !== colorId || item.design.colorInId !== colorInId) skipped.push(item.ref)
      return item
    }
    const design = setColor(item.design, colorId, colorInId)
    if (design === item.design) return item
    changed.push(item.ref)
    return { ...item, design }
  })
  return { doc: changed.length ? { ...doc, items } : doc, changed, skipped }
}

/** Mismo vidrio en todas las ventanas (también quita los vidrios propios de cada paño). */
export function applyGlassToAll(doc: QuoteDoc, glassId: string): BulkResult {
  const changed: string[] = []
  const items = doc.items.map((item) => {
    const design = setGlass(item.design, null, glassId)
    if (design === item.design) return item
    changed.push(item.ref)
    return { ...item, design }
  })
  return { doc: changed.length ? { ...doc, items } : doc, changed, skipped: [] }
}

/** Valor común a todas las ventanas, o undefined si hay más de uno (o no hay ventanas). */
export function sharedValue<T>(doc: QuoteDoc, pick: (design: WindowDesign) => T): T | undefined {
  if (!doc.items.length) return undefined
  const first = pick(doc.items[0].design)
  return doc.items.every((item) => pick(item.design) === first) ? first : undefined
}

/** «V1, V2 y V3» */
export function refsText(refs: string[]): string {
  if (refs.length <= 1) return refs[0] ?? ''
  return `${refs.slice(0, -1).join(', ')} y ${refs[refs.length - 1]}`
}
