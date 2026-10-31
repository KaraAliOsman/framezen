import type { Brand, Catalog, Layout, Line, QuoteExtra, QuoteTotals, TypologyId, WindowDesign } from '@framezen/engine'
import type { CatalogTemplateId, DocumentPrefs, QuoteTemplateId } from '@framezen/shared'
import type { DocClient, DocOrg } from '../base/types'

export type { QuoteTemplateId, CatalogTemplateId }

/** Una ventana/puerta tal como la ve el cliente. Cifras siempre calculadas por el motor. */
export interface QuoteDocItem {
  /** Id del ítem de la cotización (para cruzar con precios fijados al enviar). */
  id?: string
  ref: string // "V1"
  name?: string // "Ventanal living"
  location?: string // "Living"
  qty: number
  /** Nombre comercial de la tipología: «Corredera 2 hojas». */
  description: string
  lineName: string
  colorName: string
  glassName: string
  /** Cota exterior en mm. */
  width: number
  height: number
  /** m² por unidad. */
  area: number
  unitPrice: number
  total: number
  layout: Layout
  design: WindowDesign
  /** Precio unitario fijado a mano por el taller. */
  manual?: boolean
  /** Nota visible para el cliente. */
  notes?: string
}

export interface QuoteDocData {
  org: DocOrg
  client?: DocClient
  quote: {
    number: number
    title: string
    /** 0 = borrador, 1 = primera enviada (A), 2 = B… */
    revision: number
    /** Fecha de emisión (ISO). */
    date: string
    validUntil?: string
    /** Notas para el cliente. */
    notes?: string
    /** Aceptación en línea registrada en el portal. */
    acceptedBy?: { name: string; rut?: string; at: string }
    /** Enlace al portal (para el QR o el texto «Revisa y acepta en línea»). */
    portalUrl?: string
  }
  items: QuoteDocItem[]
  totals: QuoteTotals
  extras: QuoteExtra[]
  /** Preferencias ya combinadas con los textos propios de esta cotización. */
  prefs: DocumentPrefs
  catalog: Catalog
}

/** Campos editables en el documento (contentEditable en la vista previa). */
export type QuoteDocField =
  | 'intro'
  | 'conditions'
  | 'paymentTerms'
  | 'warranty'
  | 'leadTimeText'
  | 'validityDays'
  | 'signatureName'
  | 'footer'
  | 'title'
  | 'notes'

export interface QuoteDocumentProps {
  data: QuoteDocData
  template: QuoteTemplateId
  editable?: boolean
  onEdit?: (field: QuoteDocField, value: string) => void
  /** Incluye el <style> del documento (vista previa aislada). */
  withStyles?: boolean
  className?: string
}

export interface CatalogDocTypology {
  typologyId: TypologyId
  name: string
  layout: Layout
  design: WindowDesign
  fromPricePerM2?: number
}

export interface CatalogDocEntry {
  line: Line
  brand: Brand
  typologies: CatalogDocTypology[]
  /** Vidrios de la línea para la ficha: el primero es con el que se calculó «desde». */
  glassIds?: string[]
}

export interface CatalogDocData {
  org: DocOrg
  prefs: DocumentPrefs
  catalog: Catalog
  entries: CatalogDocEntry[]
  /** Título de portada (por defecto «Catálogo de ventanas y puertas»). */
  title?: string
  /** Fecha de emisión (ISO) para el pie. */
  date?: string
}

export interface CatalogDocumentProps {
  template: CatalogTemplateId
  data: CatalogDocData
  withStyles?: boolean
  className?: string
}
