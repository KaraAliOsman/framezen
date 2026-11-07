/**
 * Borrador de la primera cotización de la puesta a punto: cliente y ventana que la persona escribe.
 * Vive en el navegador hasta crear la cotización (recargar no borra nada). Las cifras salen siempre
 * del motor con el catálogo y los precios del taller; si faltan precios se dice, nunca se inventan.
 */
import { computeBom, computeLayout, createDesign, getTypology, priceItem, type Catalog, type CutSettings, type ItemPriceDetail, type Layout, type Line, type PricingSettings, type TypologyId, type WindowDesign } from '@dekopen/engine'
import type { Defaults, QuoteItem } from '@dekopen/shared'
import { defaultGlassId, findLine, lineSupports, pickColor } from '../designer/lib/catalog'
import { defaultLineFor } from '../designer/lib/typologies'

const STORAGE_KEY = 'dk-primera-cotizacion'

export interface ClientDraft {
  name: string
  phone: string
  city: string
}

export interface WindowDraft {
  typologyId: TypologyId
  width: number | null
  height: number | null
  qty: number
  lineId?: string
  colorId?: string
  /** Lo que la persona eligió en el selector completo (conserva su vidrio). */
  glassId?: string
}

export interface FirstQuoteDraft {
  client: ClientDraft
  window: WindowDraft
}

/** Las ventanas que más se cotizan: se ofrecen a la vista, el resto queda en «Ver todos los tipos». */
export const COMMON_TYPOLOGIES: readonly TypologyId[] = ['sliding_2', 'tilt_turn', 'casement', 'fixed', 'door', 'fixed_casement']

export const EMPTY_DRAFT: FirstQuoteDraft = {
  client: { name: '', phone: '', city: '' },
  window: { typologyId: 'sliding_2', width: 1500, height: 1200, qty: 1 },
}

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function loadDraft(): FirstQuoteDraft {
  try {
    const raw = storage()?.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_DRAFT
    const saved = JSON.parse(raw) as Partial<FirstQuoteDraft>
    return { client: { ...EMPTY_DRAFT.client, ...saved.client }, window: { ...EMPTY_DRAFT.window, ...saved.window } }
  } catch {
    return EMPTY_DRAFT
  }
}

export function saveDraft(draft: FirstQuoteDraft): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(draft))
  } catch {
    // Sin almacenamiento el borrador dura lo que dura la pantalla: no bloquea.
  }
}

export function clearDraft(): void {
  try {
    storage()?.removeItem(STORAGE_KEY)
  } catch {
    // Nada que limpiar.
  }
}

export interface ResolvedWindow {
  design: WindowDesign
  layout: Layout
  line: Line | undefined
  price: ItemPriceDetail
  /** Faltan precios en el catálogo: el monto queda corto hasta completarlos. */
  missingPrices: boolean
}

/** La ventana del borrador, con la línea, el color y el vidrio resueltos y el precio del motor. */
export function resolveWindow(
  catalog: Catalog | undefined,
  pricing: PricingSettings,
  win: WindowDraft,
  options: { defaults?: Defaults; cut?: Partial<CutSettings> } = {},
): ResolvedWindow | null {
  if (!catalog?.lines?.length || !win.width || !win.height) return null
  const chosen = findLine(catalog, win.lineId)
  const lineId = chosen && lineSupports(chosen, win.typologyId) ? chosen.id : defaultLineFor(catalog, win.typologyId, options.defaults?.lineId ?? undefined)
  const colorId = pickColor(catalog, lineId, win.colorId ?? options.defaults?.colorId ?? undefined)
  const glassId = win.glassId ?? defaultGlassId(catalog, options.defaults?.glassId ?? undefined)
  try {
    const design = createDesign(win.typologyId, { lineId, width: win.width, height: win.height, colorId, glassId })
    const bom = computeBom(design, catalog)
    const price = priceItem(bom, design, catalog, pricing, { qty: Math.max(1, win.qty), cut: options.cut })
    return {
      design,
      layout: computeLayout(design, catalog),
      line: findLine(catalog, lineId),
      price,
      missingPrices: !(price.materials.profiles > 0) || price.warnings.some((w) => w.code === 'price_missing'),
    }
  } catch {
    return null
  }
}

/** Ítem listo para guardar en la cotización. */
export function quoteItemFrom(design: WindowDesign, qty: number): QuoteItem {
  return { id: `i${Date.now().toString(36)}`, ref: 'V1', qty: Math.max(1, qty), design }
}

/** Medida inicial de una tipología cuando se elige en la grilla. */
export function typologySize(id: TypologyId): { width: number; height: number } {
  const size = getTypology(id)?.defaultSize
  return { width: size?.width ?? 1200, height: size?.height ?? 1200 }
}
