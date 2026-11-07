import { AssemblyChecklistDocument } from './assembly'
import { CostDocument } from './costs'
import { CutOrderDocument } from './cut-order'
import { GlassListDocument } from './glass'
import { GlassPlanDocument } from './glass-plan'
import { LabelsDocument } from './labels'
import { MaterialsDocument } from './materials'
import { CutOptimizationDocument } from './optimization'
import { CouplersDocument, HardwarePlanDocument, ReinforcementDocument, ScreensDocument } from './plans'
import { PurchaseOrderDocument } from './purchase-order'
import { CoverDocument, InstallationDocument, SurveyDocument } from './site'
import type { CutPartKind } from './parts'
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
  | 'cover'
  | 'survey'
  | 'cut-order'
  | 'glass-plan'
  | 'hardware'
  | 'reinforcement'
  | 'screens'
  | 'couplers'
  | 'installation'

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
  { kind: 'glass', title: 'Pedido de vidrios', description: 'Para el proveedor: medidas de corte, cantidades y m² por tipo.', fileName: 'Vidrios' },
  { kind: 'materials', title: 'Lista de materiales', description: 'Barras por perfil y color, herrajes y accesorios para bodega.', fileName: 'Materiales' },
  { kind: 'materials-costs', title: 'Materiales con costos', description: 'La misma lista con precios y totales.', fileName: 'Materiales-costos', internal: true },
  { kind: 'assembly', title: 'Listado de montaje', description: 'Casillas por ventana y unidad, con firmas.', fileName: 'Montaje' },
  { kind: 'costs', title: 'Costos internos', description: 'Costo por familia y por ventana, precio y margen.', fileName: 'Costos', internal: true },
  { kind: 'labels', title: 'Etiquetas de piezas', description: 'Etiquetas de 100 × 50 mm con QR para cada pieza.', fileName: 'Etiquetas' },
  { kind: 'purchase', title: 'Órdenes de compra', description: 'Una orden por proveedor, lista para enviar.', fileName: 'Compras', feature: 'purchasing' },
  { kind: 'cover', title: 'Portada de obra', description: 'Obra, cliente, lista de ventanas e índice de la carpeta.', fileName: 'Portada' },
  { kind: 'survey', title: 'Levantamiento en obra', description: 'Ficha por ventana para medir el vano antes de fabricar.', fileName: 'Levantamiento' },
  { kind: 'cut-order', title: 'Orden de corte', description: 'La secuencia para la sierra, pieza por pieza.', fileName: 'Orden-corte' },
  { kind: 'glass-plan', title: 'Plano de vidrios', description: 'Qué vidrio va en cada paño y plantillas a escala.', fileName: 'Plano-vidrios' },
  { kind: 'hardware', title: 'Plan de herrajes', description: 'Herrajes por ventana y por hoja, con el total para bodega.', fileName: 'Herrajes' },
  { kind: 'reinforcement', title: 'Refuerzos', description: 'Qué acero va en cada pieza, a qué largo y con qué descuento.', fileName: 'Refuerzos' },
  { kind: 'screens', title: 'Mosquiteros', description: 'Tipo por ventana y medida a tomar.', fileName: 'Mosquiteros' },
  { kind: 'couplers', title: 'Acoples y uniones', description: 'Cada acople o poste como pieza propia, con la suma de los módulos.', fileName: 'Acoples' },
  { kind: 'installation', title: 'Instalación y acta', description: 'Controles por ventana en obra y acta de recepción.', fileName: 'Instalacion' },
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
  /** Cortes y orden de corte: solo estos tipos de pieza. */
  parts?: readonly CutPartKind[]
}

/**
 * Renderiza cualquier documento de taller por su tipo (útil para PDF y vistas previas).
 * Recibe las mismas opciones que las pestañas de la OT, así el PDF es lo que se ve en pantalla.
 */
export function WorkshopDocument({ kind, data, paper, labelFormat, includeGlass, brandId, showPrices, ivaPct, parts }: WorkshopDocumentSwitchProps) {
  switch (kind) {
    case 'work-order':
      return <WorkOrderDocument data={data} paper={paper} />
    case 'cuts':
      return <CutOptimizationDocument data={data} paper={paper} parts={parts} />
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
    case 'cover':
      return <CoverDocument data={data} paper={paper} />
    case 'survey':
      return <SurveyDocument data={data} paper={paper} />
    case 'cut-order':
      return <CutOrderDocument data={data} paper={paper} parts={parts} />
    case 'glass-plan':
      return <GlassPlanDocument data={data} paper={paper} />
    case 'hardware':
      return <HardwarePlanDocument data={data} paper={paper} />
    case 'reinforcement':
      return <ReinforcementDocument data={data} paper={paper} />
    case 'screens':
      return <ScreensDocument data={data} paper={paper} />
    case 'couplers':
      return <CouplersDocument data={data} paper={paper} />
    case 'installation':
      return <InstallationDocument data={data} paper={paper} />
  }
}
