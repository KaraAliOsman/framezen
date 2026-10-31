/**
 * Framezen · contrato de dominio del motor.
 *
 * Unidades: medidas en milímetros (number, resolución 0,1 mm), dinero en pesos
 * chilenos CLP (number entero salvo cálculos intermedios), porcentajes 0–100.
 * El motor es puro: sin I/O, sin fechas, sin aleatoriedad. Nunca lanza por datos
 * incompletos: devuelve resultados parciales + avisos (Warning) y sigue.
 */

export type Id = string

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo
// ─────────────────────────────────────────────────────────────────────────────

export type Material = 'pvc' | 'aluminum'

/** Practicable (abatir, oscilobatiente, proyectante, puertas, fijos) o corredera. */
export type LineKind = 'casement' | 'sliding'

export interface Color {
  id: Id
  name: string // "Blanco", "Nogal", "Antracita", "Roble dorado", "Winchester"…
  hex: string // color de dibujo
  /** Código corto que usan los proveedores en el SKU (BL, NO, AN…), si existe. */
  code?: string
}

export interface Brand {
  id: Id
  name: string // "Proline"
  /** Marca de perfiles, de vidrios, de herrajes o mixta. */
  kind: 'profiles' | 'glass' | 'hardware' | 'mixed'
  country?: string
  website?: string
  /** Iniciales/color para el avatar; nunca usamos logos de terceros. */
  monogram?: string
  accent?: string
}

/**
 * Pauta de corte de una línea (o de una tipología concreta). Todos los valores
 * en mm. Reproduce al 0,1 mm la OT 385 (Proline PRO6004 / PROSLD70) y la
 * plantilla del fabricante:
 *
 *   marco (corte)          = cota + 2·weld                         a 45°
 *   luz (por eje)          = cota − 2·frameDeduction
 *   junquillo de fijo      = luz del paño
 *   vidrio de fijo         = luz del paño − 2·glassGap
 *   hoja nominal           = luz del paño + 2·sashOverlap
 *   hoja (corte)           = hoja nominal + 2·weld                 a 45°
 *   vidrio de hoja         = hoja nominal − 2·(sashDeduction + glassGap)
 *   junquillo de hoja      = hoja nominal − beadDeduction (def. 2·sashDeduction)
 *   travesaño (corte)      = cota completa del marco               a 90°
 *   luz junto a travesaño  = se descuenta mullionDeduction por lado desde su eje
 *   corredera n hojas      = ancho nominal (luz + 2·sashOverlap + (n−1)·sashWidth) / n
 */
export interface Pauta {
  /** Sobremedida de soldadura por extremo (3 en taller, 2,5 fabricante). */
  weld: number
  /** "Descuento de marco" por lado: de la cota a la luz de vidrio. PRO6004 = 44. */
  frameDeduction: number
  /** "Ancho de hoja" (cara vista de la hoja). Ventana 80, puerta 102/110. */
  sashWidth: number
  /** "Descuento de hoja" por lado. Ventana 60, puerta 82/90. */
  sashDeduction: number
  /** Traslapo de la hoja sobre la luz, por lado. PRO6004 = 8 (luz + 16). */
  sashOverlap: number
  /** Holgura del vidrio por lado. 5. */
  glassGap: number
  /** Descuento por lado desde el eje de un travesaño/mainel. PRO6004 = 20. */
  mullionDeduction: number
  /** Descuento total del junquillo de hoja respecto de la hoja nominal. Por defecto 2·sashDeduction. */
  beadDeduction?: number
  /** Descuentos de refuerzo (acero) respecto del largo de corte de cada pieza. */
  reinforcement?: {
    frame?: number // PRO6004: corte − 114 (= cota − 108)
    sash?: number // PRO521: corte − 146
    mullion?: number // PRO03: largo − 20
  }
  /** Corredera: suplemento de alto de hoja respecto de la luz (por defecto 2·sashOverlap). */
  slidingHeightAdd?: number
}

export type ProfileRole =
  | 'frame'
  | 'sash'
  | 'door_sash'
  | 'mullion'
  | 'bead'
  | 'french_mullion' // inversor de doble hoja sin travesaño
  | 'threshold'
  | 'sliding_frame'
  | 'sliding_sash'
  | 'interlock' // traslapo central de corredera
  | 'guide' // guía/riel
  | 'coupler' // perfil de unión entre ventanas
  | 'reinforcement'
  | 'other'

export interface Profile {
  id: Id
  lineId: Id
  code: string // "PRO01"
  name: string // "Marco fijo 60/64"
  role: ProfileRole
  /** Cara vista en mm (para dibujo a escala). */
  face?: number
  barLength: number // 5800 por defecto
  /** Precio de lista por barra completa, por color (CLP). */
  priceByColor: Record<Id, number>
  /** Refuerzo que lleva esta pieza (id de Profile con role 'reinforcement'). */
  reinforcementId?: Id
  weightKgM?: number
}

export type HardwareUnit = 'u' | 'kit' | 'm' | 'caja' | 'cartucho' | 'par'

/** Herraje, accesorio o insumo con precio de lista. */
export interface Item {
  id: Id
  brandId: Id
  kind: 'hardware' | 'accessory' | 'consumable' | 'other'
  code: string
  name: string
  unit: HardwareUnit
  /** Unidades por envase (caja de 1000 tornillos → 1000). */
  packSize?: number
  price: number // CLP de lista por unidad de compra
}

export type GlassKind = 'mono' | 'dvh' | 'laminated' | 'tempered' | 'other'

export interface Glass {
  id: Id
  brandId?: Id
  name: string // "DVH 4+12+4"
  kind: GlassKind
  /** Espesor total en mm (DVH 4+12+4 = 20). */
  thickness: number
  composition?: string // "4 incoloro + 12 cámara + 4 incoloro"
  pricePerM2: number // CLP de lista
  /** Área mínima cobrable en m² por pieza (p. ej. 0,25). */
  minArea?: number
  weightKgM2?: number
}

/**
 * Variante de un herraje o accesorio según el color de la ventana (bisagra 3D marrón, tapa de
 * desagüe negra, silicona toffee…). Sin `byColor` la regla usa siempre `itemId`.
 */
export interface ColorVariants {
  /**
   * Ítem por color: id del color → id del ítem. Un color sin entrada (o cuyo ítem ya no está en
   * el catálogo) usa `itemId`, que suele ser la versión blanca.
   */
  byColor?: Record<Id, Id>
  /**
   * Qué color manda en una ventana bicolor: 'interior' (`colorInId`, o `colorId` si es de un
   * color) o 'exterior' (`colorId`). Por defecto, los herrajes miran el interior (manillas,
   * bisagras) y los accesorios el exterior (tapas de desagüe, silicona).
   */
  colorSide?: 'exterior' | 'interior'
}

/** Regla de herraje: qué lleva cada hoja según apertura y tamaño. */
export interface HardwareRule extends ColorVariants {
  id: Id
  openings: OpeningKind[] // aplica a estas aperturas
  itemId: Id
  /** Cantidad fija o por tamaño. */
  qty: number
  /** Rango de la hoja terminada en mm (inclusivo); vacío = siempre. */
  minWidth?: number
  maxWidth?: number
  minHeight?: number
  maxHeight?: number
  /** Cantidad adicional cada `stepMm` de alto sobre minHeight (bisagras, cerraderos). */
  perStep?: { stepMm: number; qty: number }
}

/**
 * Accesorio por ventana/paño/metro (tornillos, tacos, burlete, silicona…). `per`:
 * 'window' por ventana · 'sash' por hoja o panel de corredera · 'mullion' por travesaño fijo
 * (conectores metálicos; la unión francesa no cuenta) · 'glass_m' por metro de perímetro de
 * vidrio · 'frame_m' por metro de marco y travesaños · 'reinforcement_m' por metro de acero
 * (redondeado por pieza) · 'perimeter_m' por metro de perímetro exterior.
 */
export interface AccessoryRule extends ColorVariants {
  id: Id
  itemId: Id
  per: 'window' | 'sash' | 'mullion' | 'glass_m' | 'frame_m' | 'reinforcement_m' | 'perimeter_m'
  qty: number
}

export interface Line {
  id: Id
  brandId: Id
  name: string // "PRO6004"
  kind: LineKind
  material: Material
  description?: string // "Practicable 60 mm, 4 cámaras"
  depth?: number
  chambers?: number
  pauta: Pauta
  /** Pautas distintas para puertas (sashWidth 110 / sashDeduction 90…). */
  doorPauta?: Partial<Pauta>
  /** Perfil por defecto para cada rol. */
  profiles: Partial<Record<ProfileRole, Id>>
  /** Perfil de hoja para apertura interior cuando difiere (Proline: PRO02). */
  sashInProfileId?: Id
  /** Pauta de la hoja interior cuando difiere (PRO02: beadDeduction 107, refuerzo de hoja 64,8). */
  sashInPauta?: Partial<Pauta>
  colorIds: Id[]
  /** Tipologías (plantillas) que esta línea puede fabricar. */
  typologyIds: string[]
  hardwareRules: HardwareRule[]
  accessoryRules: AccessoryRule[]
  /** De dónde salen los datos: "OT 385 verificada", "pauta distribuidora", "plantilla genérica". */
  source?: string
  /** Si faltan datos se cotiza igual y se avisa. */
  completeness?: 'verified' | 'complete' | 'partial'
}

/** Configuración del taller por marca ("Mis precios" mejorado). */
export interface BrandSettings {
  brandId: Id
  enabled: boolean
  /** Despunte (mm) al inicio de cada barra. */
  trim: number
  /** Corte de sierra / disco (mm por corte). */
  kerf: number
  discounts: { profiles: number; reinforcement: number; hardware: number; glass: number; accessories: number }
  /** Recargo/margen específico de la marca sobre el general (puntos %, opcional). */
  marginAdjust?: number
}

export interface Catalog {
  colors: Color[]
  brands: Brand[]
  lines: Line[]
  profiles: Profile[]
  items: Item[]
  glass: Glass[]
  brandSettings: BrandSettings[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Diseño de una ventana
// ─────────────────────────────────────────────────────────────────────────────

export type OpeningKind =
  | 'fixed' // paño fijo
  | 'casement' // abatir (lateral)
  | 'tilt_turn' // oscilobatiente
  | 'tilt' // oscilante (bisagra abajo, abre hacia dentro arriba)
  | 'awning' // proyectante (bisagra arriba, abre hacia fuera abajo)
  | 'door' // puerta de abatir

export interface Opening {
  kind: OpeningKind
  /** Lado de las bisagras visto desde el interior. */
  hinge?: 'left' | 'right'
  /** Hacia dónde abre la hoja. */
  direction?: 'in' | 'out'
}

export interface LeafNode {
  id: Id
  type: 'leaf'
  opening: Opening
  /** Vidrio específico del paño (si no, el del diseño). */
  glassId?: Id
  /** Panel ciego en vez de vidrio (puertas). */
  fill?: 'glass' | 'panel'
}

/**
 * División del espacio. `dir: 'vertical'` = travesaños verticales, hijos lado a
 * lado (izquierda → derecha). `'horizontal'` = hijos de arriba hacia abajo.
 * `sizes[i]` es la medida a eje en mm del hijo i; null = reparte el resto en partes iguales.
 * `joint: 'french'` = doble hoja sin travesaño fijo (inversor en la hoja pasiva).
 */
export interface SplitNode {
  id: Id
  type: 'split'
  dir: 'vertical' | 'horizontal'
  children: DesignNode[]
  sizes: (number | null)[]
  joint?: 'mullion' | 'french'
}

export interface SlidingPanel {
  id: Id
  kind: 'moving' | 'fixed'
  /** Hacia dónde se desliza la hoja móvil al abrir. */
  direction?: 'left' | 'right'
  glassId?: Id
}

/** Sólo como raíz en líneas de corredera. */
export interface SlidingNode {
  id: Id
  type: 'sliding'
  rails: 1 | 2 | 3
  panels: SlidingPanel[]
}

export type DesignNode = LeafNode | SplitNode | SlidingNode

export type Shape =
  | { kind: 'rect' }
  | { kind: 'arch'; rise: number } // medio punto/arco rebajado (fijo)
  | { kind: 'trapezoid'; leftHeight: number; rightHeight: number } // irregular (fijo)
  | { kind: 'triangle'; apex: 'left' | 'center' | 'right' } // fijo

export interface WindowDesign {
  version: 1
  lineId: Id
  width: number // cota exterior en mm
  height: number
  colorId: Id // color exterior
  colorInId?: Id // bicolor: interior
  glassId: Id // vidrio por defecto
  shape?: Shape
  root: DesignNode
  /** Mosquitero, tapajuntas, etc. */
  extras?: { screen?: boolean; sill?: boolean; /** Umbral bajo en puertas (si no, marco completo). */ threshold?: boolean }
}

/** Plantillas de tipología (galería). El catálogo mapea sus productos a estos ids. */
export type TypologyId =
  // practicables
  | 'fixed' // paño fijo
  | 'casement' // abatir interior 1 hoja
  | 'casement_out' // abatir exterior 1 hoja
  | 'tilt_turn' // oscilobatiente
  | 'tilt' // oscilante
  | 'awning' // proyectante
  | 'casement_double' // abatir 2 hojas (unión francesa)
  | 'fixed_casement' // fijo + abatir lado a lado
  | 'fixed_tilt_turn' // fijo + oscilobatiente
  | 'casement_transom' // abatir con sobreluz fija arriba
  | 'fixed_awning_bottom' // fijo arriba + proyectante abajo
  | 'fixed_3' // tres paños fijos
  | 'casement_fixed_casement' // abatir + fijo + abatir
  | 'door' // puerta 1 hoja
  | 'door_double' // puerta 2 hojas
  | 'door_sidelight' // puerta + fijo lateral
  | 'door_transom' // puerta con sobreluz
  | 'arch' // medio punto (fijo)
  | 'trapezoid' // fijo irregular
  | 'triangle' // fijo triángulo
  // correderas
  | 'sliding_2' // 2 hojas móviles
  | 'sliding_2_fixed' // 1 móvil + 1 fija
  | 'sliding_3' // 3 hojas doble riel
  | 'sliding_3_rail' // 3 hojas triple riel
  | 'sliding_4' // 4 hojas (2 centrales móviles)
  | 'sliding_mono' // monorriel

export interface Typology {
  id: TypologyId
  name: string // "Corredera 2 hojas"
  kind: LineKind
  /** Crea el árbol del diseño para un ancho × alto dados. */
  build: (width: number, height: number) => { root: DesignNode; shape?: Shape }
  defaultSize: { width: number; height: number }
  tags: string[] // para búsqueda: ["ventana", "corredera", "2 hojas"]
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometría para dibujo (salida de computeLayout). Coordenadas en mm, origen en la
// esquina superior izquierda exterior del marco, eje y hacia abajo, VISTA INTERIOR.
// El dibujo exterior se obtiene espejando en x una sola vez.
// ─────────────────────────────────────────────────────────────────────────────

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface LayoutFrame {
  rect: Rect // contorno exterior (cota)
  face: number // cara vista del marco
  /** Contorno exterior para formas no rectangulares (path SVG en mm). */
  outline?: string
  /** Contorno interior (borde de la luz) para formas no rectangulares. */
  innerOutline?: string
}

export interface LayoutMullion {
  nodeId: Id
  index: number // separador entre hijo index e index+1
  dir: 'vertical' | 'horizontal'
  rect: Rect
  kind: 'mullion' | 'french'
  /** Posición del eje en mm (x para verticales, y para horizontales), para arrastrar. */
  axis: number
  /** Límites del eje al arrastrar (paño mínimo). */
  min: number
  max: number
}

export interface LayoutSash {
  nodeId: Id
  opening: Opening
  rect: Rect // contorno visible de la hoja
  face: number
  glassRect: Rect
  fill: 'glass' | 'panel'
  /** Dónde va la manilla (lado de cierre). */
  handle?: 'left' | 'right' | 'top' | 'bottom'
}

export interface LayoutPane {
  nodeId: Id
  /** 'fixed' = vidrio directo en marco; 'sash' = dentro de una hoja. */
  kind: 'fixed' | 'sash'
  glassRect: Rect
  fill: 'glass' | 'panel'
  glassId: Id
  /** Contorno del vidrio para formas no rectangulares (path SVG en mm). */
  outline?: string
}

export interface LayoutSlidingPanel {
  panelId: Id
  index: number
  kind: 'moving' | 'fixed'
  direction?: 'left' | 'right'
  rail: number // 0 = exterior
  rect: Rect
  face: number
  glassRect: Rect
}

export interface LayoutDimension {
  axis: 'x' | 'y'
  from: number
  to: number
  value: number // mm mostrados
  level: 0 | 1 // 0 = total exterior, 1 = parcial por paño (a ejes)
  /** Si es editable: qué nodo y qué índice de `sizes` modifica. */
  target?: { nodeId: Id; index: number } | { kind: 'width' | 'height' }
}

export interface LayoutCell {
  nodeId: Id
  rect: Rect // área de la luz del paño (para seleccionar en el editor)
  path: Id[] // ids desde la raíz
}

export interface Layout {
  width: number
  height: number
  frame: LayoutFrame
  mullions: LayoutMullion[]
  sashes: LayoutSash[]
  panes: LayoutPane[]
  sliding: LayoutSlidingPanel[]
  dimensions: LayoutDimension[]
  cells: LayoutCell[]
  /** Rieles de corredera (para la planta). */
  rails?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Resultados
// ─────────────────────────────────────────────────────────────────────────────

export type Side = 'top' | 'bottom' | 'left' | 'right' | 'mullion' | 'transom' | 'interlock' | 'guide' | 'other'

export interface CutPiece {
  kind: 'profile' | 'reinforcement' | 'bead'
  profileId?: Id
  code: string
  name: string
  role: ProfileRole
  colorId?: Id // los refuerzos no tienen color
  length: number // mm de corte (0,1)
  qty: number
  angleStart: 45 | 90 | number
  angleEnd: 45 | 90 | number
  side: Side
  /** Etiqueta corta para taller: "arr", "aba", "izq", "der", "trav". */
  label: string
  /** Nodo del diseño al que pertenece (marco = 'frame'). */
  nodeId: Id
  barLength: number
}

export interface GlassPiece {
  glassId: Id
  name: string
  width: number
  height: number
  qty: number
  area: number // m² por pieza (4 decimales)
  nodeId: Id
  label: string // "Paño 1", "Hoja izq."
  shape?: Shape['kind']
}

export interface ItemLine {
  itemId: Id
  code: string
  name: string
  /** Unidad de consumo: con envase (caja de 1.000, rollo de 100 m) es 'u' o 'm', nunca 'caja'. */
  unit: HardwareUnit
  /** Cantidad de consumo (tornillos sueltos, metros), no envases. */
  qty: number
  kind: Item['kind']
  nodeId?: Id
}

export type WarningLevel = 'info' | 'warn' | 'error'

/** Aviso en lenguaje de taller. Nunca bloquea: "error" = no fabricable tal cual. */
export interface Warning {
  level: WarningLevel
  code: string
  message: string // "La hoja izquierda mide 1.450 mm de alto: la cremona más larga del kit llega a 1.400."
  nodeId?: Id
  /** Corrección en un clic, si existe. */
  fix?: { label: string; patch: Partial<WindowDesign> }
}

export interface Bom {
  cuts: CutPiece[]
  glass: GlassPiece[]
  items: ItemLine[]
  warnings: Warning[]
  /** m² de carpintería (cota). */
  area: number
  perimeter: number // m
  weightKg?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Precio
// ─────────────────────────────────────────────────────────────────────────────

export interface PricingSettings {
  /** Margen sobre venta (precio = costo / (1 − m)) o recargo sobre costo (precio = costo · (1 + m)). */
  marginMode: 'margin' | 'markup'
  marginPct: number
  laborPerM2: number // mano de obra CLP/m²
  installMode: 'none' | 'per_m2' | 'per_unit'
  installValue: number
  wastePct: number // merma de material
  /** Redondeo del precio unitario neto hacia arriba a este múltiplo. */
  roundTo: 1 | 10 | 100 | 1000
  ivaPct: number // 19
  /** Cobrar barras completas según optimización en vez de largo proporcional. */
  chargeFullBars: boolean
}

export interface MaterialCost {
  profiles: number
  reinforcement: number
  hardware: number
  glass: number
  accessories: number
}

export interface CostLine {
  group: keyof MaterialCost | 'labor' | 'install'
  code?: string
  name: string
  qty: number
  unit: string
  unitCost: number
  total: number
}

export interface ItemPrice {
  materials: MaterialCost
  materialsTotal: number
  waste: number
  labor: number
  install: number
  cost: number // costo directo unitario
  unitNet: number // precio unitario neto redondeado
  qty: number
  totalNet: number
  marginPct: number // margen real resultante sobre venta
  lines: CostLine[]
  warnings: Warning[]
}

export interface QuoteExtra {
  id: Id
  label: string // "Instalación", "Transporte", "Retiro de ventanas antiguas"
  amount: number // neto CLP
  hidden?: boolean // no se muestra desglosado en el documento
}

export interface QuoteTotals {
  subtotal: number // suma de ítems neto
  discountPct: number
  discount: number
  extras: number
  net: number
  iva: number
  total: number
  area: number // m² totales
  units: number
  cost: number // costo directo total (interno)
  marginPct: number // margen real total (interno)
}

// ─────────────────────────────────────────────────────────────────────────────
// Optimización de cortes 1D
// ─────────────────────────────────────────────────────────────────────────────

export interface CutSettings {
  barLength: number // 5800
  kerf: number // 4
  trimStart: number // despunte inicio
  trimEnd: number // despunte final
  /** Retazos ≥ a esto se guardan como reutilizables. */
  minReusable: number
}

export interface OptimizerPiece {
  key: string // agrupa: perfil + color
  length: number
  qty: number
  label: string // "V1 · arr"
  ref?: string // referencia de ventana
  angleStart?: number
  angleEnd?: number
}

export interface BarCut {
  length: number
  label: string
  ref?: string
  offset: number // posición desde el inicio de la barra
  angleStart?: number
  angleEnd?: number
}

export interface Bar {
  key: string
  barLength: number
  fromOffcut: boolean
  cuts: BarCut[]
  used: number // suma de piezas
  kerfLoss: number
  remainder: number // sobrante al final
  yieldPct: number
}

export interface OptimizationGroup {
  key: string
  code: string
  name: string
  colorId?: Id
  bars: Bar[]
  pieces: number
  yieldPct: number
  barsNeeded: number
}

export interface OptimizationResult {
  groups: OptimizationGroup[]
  totalBars: number
  totalPieces: number
  yieldPct: number
  offcuts: { key: string; length: number }[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Datos de taller (salida de buildWorkshopData; entrada de los documentos de taller)
// ─────────────────────────────────────────────────────────────────────────────

export interface WorkshopWindow {
  ref: string // "V1"
  name?: string
  location?: string
  qty: number
  design: WindowDesign
  layout: Layout
  bom: Bom
  description: string // "Corredera 2 hojas · PROSLD70 · Blanco · DVH 4+12+4"
}

export interface MaterialLine {
  group: 'profile' | 'reinforcement' | 'hardware' | 'accessory' | 'glass'
  code: string
  name: string
  colorId?: Id
  colorName?: string
  brandId?: Id
  brandName?: string
  qty: number // en la unidad de compra
  unit: string // "barra", "u", "caja", "m²"
  bars?: number
  meters?: number
  unitCost?: number
  total?: number
}

export interface GlassLine {
  glassId: Id
  name: string
  width: number
  height: number
  qty: number
  area: number // m² por pieza
  refs: string[] // ["V1 · Paño izq.", "V3 · Hoja"]
  shape?: Shape['kind']
}

export interface PurchaseOrderDraft {
  brandId: Id
  brandName: string
  lines: MaterialLine[]
  total: number
}

export interface WorkshopData {
  windows: WorkshopWindow[]
  optimization: OptimizationResult
  glass: GlassLine[]
  materials: MaterialLine[]
  purchaseOrders: PurchaseOrderDraft[]
  costs: {
    materials: MaterialCost
    total: number
    perWindow: { ref: string; qty: number; unitCost: number; unitPrice: number }[]
  }
  cut: CutSettings
}
