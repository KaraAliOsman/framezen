import type { Catalog, MaterialCost, WorkshopData } from '@dekopen/engine'
import type { DocLocale } from '@dekopen/shared'

/** Papel de impresión: Carta por defecto, A4 opcional. */
export type WorkshopPaper = 'letter' | 'a4'

/**
 * Venta y costo de la cotización tal como los calcula el motor para el precio (lo mismo que
 * el pie del editor): materiales prorrateados por largo, merma, mano de obra, descuento.
 * Lo usa «Costos internos» para no mezclar el costo del precio con la compra real.
 */
export interface WorkshopSale {
  /** Σ precio unitario × cantidad, antes del descuento (neto). */
  subtotal: number
  discountPct: number
  discount: number
  /** Extras de la cotización (instalación, transporte…), neto. No entran al margen. */
  extras: number
  /** Costo directo total (prorrateado, como en el precio). */
  cost: number
  /** Margen real sobre la venta tras el descuento, sin extras (= totals.marginPct). */
  marginPct: number
  /** Materiales prorrateados por familia (sin merma), toda la OT. */
  materials: MaterialCost
  /** Merma sobre los materiales, toda la OT. */
  waste: number
  /** Mano de obra, toda la OT. */
  labor: number
  /** Instalación incluida en el precio de las ventanas, toda la OT. */
  install: number
}

/** Datos de entrada de todos los documentos de taller. */
export interface WorkshopDocumentData extends WorkshopData {
  org: { name: string; logo?: string; accent?: string }
  quote: { number: number | string; title: string; clientName?: string }
  workOrder: {
    number: number | string
    /** Fecha de emisión ISO («2026-10-31»). */
    date: string
    /** Fecha comprometida de entrega (opcional). */
    dueDate?: string
    /** Notas generales de la OT (opcional). */
    notes?: string
    /** Sin OT todavía: los documentos se rotulan con la cotización y `number` es el de la cotización. */
    fromQuote?: boolean
  }
  /** Catálogo para nombres y colores de dibujo (opcional: sin él se muestran los ids). */
  catalog?: Catalog
  /** Notas por ventana, indexadas por ref («V3»). */
  windowNotes?: Record<string, string>
  /** IVA de la organización en % (órdenes de compra). Sin él, 19 %. */
  ivaPct?: number
  /** Venta y costo prorrateado de la cotización (Costos internos). Sin él, se estima con perWindow. */
  sale?: WorkshopSale
  /** Idioma de los documentos (el del taller o de quien imprime). Sin él, español. */
  locale?: DocLocale
  /** Moneda de los montos internos (por defecto CLP). */
  currency?: string
  /** Rótulo del impuesto de la organización (IVA, VAT…). Sin él, el del idioma. */
  taxLabel?: string
}

/** Props comunes a todos los documentos de taller. */
export interface WorkshopDocumentProps {
  data: WorkshopDocumentData
  paper?: WorkshopPaper
  /** Idioma del documento (manda sobre `data.locale`). */
  locale?: DocLocale
  /** Moneda (manda sobre `data.currency`). */
  currency?: string
  /** Rótulo del impuesto (manda sobre `data.taxLabel`). */
  taxLabel?: string
}
