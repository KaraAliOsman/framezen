import { AssemblyChecklistDocument } from './assembly'
import { CostDocument } from './costs'
import { GlassListDocument } from './glass'
import { LabelsDocument } from './labels'
import { MaterialsDocument } from './materials'
import { CutOptimizationDocument } from './optimization'
import { PurchaseOrderDocument } from './purchase-order'
import type { WorkshopDocumentProps } from './types'
import { WorkOrderDocument } from './work-order'

export type WorkshopDocumentKind =
  | 'work-order'
  | 'cuts'
  | 'glass'
  | 'materials'
  | 'materials-costs'
  | 'assembly'
  | 'costs'
  | 'labels'
  | 'purchase'

export interface WorkshopDocumentInfo {
  kind: WorkshopDocumentKind
  title: string
  description: string
  /** Nombre base del archivo PDF (sin número ni extensión). */
  fileName: string
  /** Sólo para la oficina (costos y precios). */
  internal?: boolean
  /** Función del plan que lo incluye (los demás vienen en todos los planes). */
  feature?: 'purchasing'
}

/** Catálogo de documentos de taller, en el orden de las pestañas de la OT. */
export const WORKSHOP_DOCUMENTS: WorkshopDocumentInfo[] = [
  { kind: 'work-order', title: 'Orden de trabajo', description: 'Una hoja por ventana: dibujo, cortes, refuerzos, herrajes y vidrio.', fileName: 'OT' },
  { kind: 'cuts', title: 'Optimización de cortes', description: 'Barras dibujadas a escala con cada pieza y su ventana.', fileName: 'Cortes' },
  { kind: 'glass', title: 'Pedido de vidrios', description: 'Para el proveedor: medidas exactas, cantidades y m² por tipo.', fileName: 'Vidrios' },
  { kind: 'materials', title: 'Lista de materiales', description: 'Barras por perfil y color, herrajes y accesorios para bodega.', fileName: 'Materiales' },
  { kind: 'materials-costs', title: 'Materiales con costos', description: 'La misma lista con precios y totales.', fileName: 'Materiales-costos', internal: true },
  { kind: 'assembly', title: 'Listado de montaje', description: 'Casillas por ventana y unidad, con firmas.', fileName: 'Montaje' },
  { kind: 'costs', title: 'Costos internos', description: 'Costo por familia y por ventana, precio y margen.', fileName: 'Costos', internal: true },
  { kind: 'labels', title: 'Etiquetas de piezas', description: 'Etiquetas de 100 × 50 mm con QR para cada pieza.', fileName: 'Etiquetas' },
  { kind: 'purchase', title: 'Órdenes de compra', description: 'Una orden por proveedor, lista para enviar.', fileName: 'Compras', feature: 'purchasing' },
]

export interface WorkshopDocumentSwitchProps extends WorkshopDocumentProps {
  kind: WorkshopDocumentKind
  /** Etiquetas: hoja Carta/A4 o rollo de 100 × 50 mm. */
  labelFormat?: 'sheet' | 'roll'
  /** Etiquetas: incluir las de vidrio (por defecto sí). */
  includeGlass?: boolean
  /** Orden de compra de un solo proveedor. */
  brandId?: string
  /** Orden de compra: mostrar precios y totales (por defecto sí). */
  showPrices?: boolean
  /** Orden de compra: IVA en %. Por defecto el de la organización (`data.ivaPct`) o 19. */
  ivaPct?: number
}

/**
 * Renderiza cualquier documento de taller por su tipo (útil para PDF y vistas previas).
 * Recibe las mismas opciones que las pestañas de la OT, así el PDF es lo que se ve en pantalla.
 */
export function WorkshopDocument({ kind, data, paper, labelFormat, includeGlass, brandId, showPrices, ivaPct }: WorkshopDocumentSwitchProps) {
  switch (kind) {
    case 'work-order':
      return <WorkOrderDocument data={data} paper={paper} />
    case 'cuts':
      return <CutOptimizationDocument data={data} paper={paper} />
    case 'glass':
      return <GlassListDocument data={data} paper={paper} />
    case 'materials':
      return <MaterialsDocument data={data} paper={paper} />
    case 'materials-costs':
      return <MaterialsDocument data={data} paper={paper} showCosts />
    case 'assembly':
      return <AssemblyChecklistDocument data={data} paper={paper} />
    case 'costs':
      return <CostDocument data={data} paper={paper} />
    case 'labels':
      return <LabelsDocument data={data} paper={paper} format={labelFormat} includeGlass={includeGlass} />
    case 'purchase':
      return <PurchaseOrderDocument data={data} paper={paper} brandId={brandId} showPrices={showPrices} ivaPct={ivaPct} />
  }
}
