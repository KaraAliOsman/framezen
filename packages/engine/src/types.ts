/**
 * DEKOPEN · contrato de dominio del motor.
 *
 * Unidades: medidas en milímetros (number, resolución 0,1 mm), dinero en pesos
 * chilenos CLP (number entero salvo cálculos intermedios), porcentajes 0–100.
 * El motor es puro: sin I/O, sin fechas, sin aleatoriedad. Nunca lanza por datos
 * incompletos: devuelve resultados parciales + avisos (Warning) y sigue.
 */

export type Id = string

// ─────────────────────────────────────────────────────────────────────────────
// Listas canónicas (única fuente de verdad: catálogo, shared, servidor y web derivan de aquí)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aperturas de una hoja. `awning` = proyectante (bisagra arriba, abre hacia fuera abajo);
 * `tilt` = oscilante (bisagra abajo, abre hacia dentro arriba). Las correderas y elevadoras no son
 * aperturas de hoja: son nodos `sliding` (ver `SlidingNode.system`).
 */
export const OPENING_KINDS = [
  'fixed', // paño fijo
  'casement', // abatir (lateral)
  'tilt_turn', // oscilobatiente
  'tilt', // oscilante (bisagra abajo, abre hacia dentro arriba)
  'awning', // proyectante (bisagra arriba, abre hacia fuera abajo)
  'door', // puerta de abatir
  'pivot_v', // pivotante de eje vertical
  'pivot_h', // pivotante de eje horizontal (basculante)
  'tilt_slide', // osciloparalela (PSK)
  'parallel_slide', // corredera paralela (PS)
  'folding', // hoja de un plegable (cadena con unión 'fold')
] as const

/** Formas del marco. `rect` nunca se guarda (el diseño sin `shape` es rectangular). */
export const SHAPE_KINDS = ['rect', 'arch', 'trapezoid', 'triangle', 'round', 'oval', 'pentagon', 'octagon', 'gable'] as const

/** Plantillas de tipología (galería). El catálogo mapea sus productos a estos ids. */
export const TYPOLOGY_IDS = [
  // practicables (v4)
  'fixed', // paño fijo
  'casement', // abatir interior 1 hoja
  'casement_out', // abatir exterior 1 hoja
  'tilt_turn', // oscilobatiente
  'tilt', // oscilante
  'awning', // proyectante
  'casement_double', // abatir 2 hojas (unión francesa, hoja pasiva por defecto)
  'fixed_casement', // fijo + abatir lado a lado
  'fixed_tilt_turn', // fijo + oscilobatiente
  'casement_transom', // abatir con sobreluz fija arriba
  'fixed_awning_bottom', // fijo arriba + proyectante abajo
  'fixed_3', // tres paños fijos
  'casement_fixed_casement', // abatir + fijo + abatir
  'door', // puerta 1 hoja
  'door_double', // puerta 2 hojas
  'door_sidelight', // puerta + fijo lateral
  'door_transom', // puerta con sobreluz
  'arch', // medio punto (fijo)
  'trapezoid', // fijo irregular
  'triangle', // fijo triángulo
  // correderas (v4)
  'sliding_2', // 2 hojas móviles
  'sliding_2_fixed', // 1 móvil + 1 fija
  'sliding_3', // 3 hojas doble riel
  'sliding_3_rail', // 3 hojas triple riel
  'sliding_4', // 4 hojas (2 centrales móviles)
  'sliding_mono', // monorriel
  // v5: correderas y sistemas especiales
  'sliding_6', // 6 hojas, 3 rieles, abre al centro
  'sliding_3_center_fixed', // móvil + fijo central + móvil
  'sliding_4_center_fixed', // móvil + 2 fijos centrales + móvil
  'lift_slide_2', // elevadora (HST) fijo + móvil
  'lift_slide_3', // elevadora fijo + 2 móviles (3 rieles)
  'lift_slide_4', // elevadora fijo + 2 móviles centrales + fijo
  'tilt_slide', // osciloparalela (PSK): fijo + hoja
  'tilt_slide_2', // osciloparalela: fijo + 2 hojas centrales + fijo
  'parallel_slide', // corredera paralela: fijo + hoja
  'folding_3', // plegable 3 hojas
  'folding_4',
  'folding_5',
  'folding_6',
  'folding_7',
  'pivot_v', // pivotante vertical
  'pivot_h', // pivotante horizontal
  // v5: doble hoja, puertas y compuestas
  'french_casement', // abatible francesa con hoja pasiva declarada
  'french_tilt_turn', // francesa: activa oscilobatiente + pasiva abatible
  'balcony_door', // puerta balconera
  'balcony_door_double', // puerta balconera doble (francesa)
  'entrance_door', // puerta de acceso
  'entrance_door_sidelights', // puerta de acceso con fijos a ambos lados
  'door_double_sidelights', // puerta doble con fijos a ambos lados
  'fixed_tilt_turn_fixed', // fijo + oscilobatiente + fijo
  'tilt_turn_double_transom', // 2 oscilobatientes con sobreluz fija
  // v5: formas
  'round', // redonda (ojo de buey)
  'oval', // ovalada
  'pentagon', // pentagonal
  'octagon', // octogonal
  'gable', // frontón (forma de casa)
  'arch_segmental', // arco rebajado
  'arch_casement', // medio punto fijo sobre abatible
  // v7: combinaciones de taller (mismas aperturas; las fabrica toda línea que tenga sus partes)
  'casement_bottom_fixed', // abatible con paño fijo inferior
  'tilt_turn_bottom_fixed', // oscilobatiente con paño fijo inferior
  'casement_double_bottom_fixed', // dos hojas con paño fijo inferior
  'tilt_turn_transom', // oscilobatiente con sobreluz fija
  'awning_transom', // proyectante arriba + fijo abajo
  'fixed_tilt', // fijo abajo + oscilante arriba
  'fixed_awning_side', // fijo + proyectante lado a lado
  'casement_double_mullion', // dos abatibles con parante fijo
  'tilt_turn_fixed_tilt_turn', // oscilobatiente + fijo + oscilobatiente
  // v7: puertas con relleno
  'door_panel', // puerta ciega
  'door_zocalo', // puerta con zócalo (panel inferior en la hoja)
  'door_double_zocalo', // puerta 2 hojas con zócalo
  'door_out', // puerta que abre hacia afuera
  // v7: guillotina (corredera vertical)
  'vertical_sliding', // guillotina simple: hoja inferior sube, superior fija
  'vertical_sliding_double', // guillotina doble: ambas hojas se mueven
  // v7: celosía
  'louver_fixed', // celosía fija de ventilación
] as const

/** Tipologías agregadas en v7 (combinaciones de taller, puertas con relleno, guillotina, celosía). */
export const V7_TYPOLOGY_IDS = TYPOLOGY_IDS.slice(TYPOLOGY_IDS.indexOf('casement_bottom_fixed'))

/**
 * Sistemas de corredera: estándar, elevadora (HST, la manilla levanta la hoja antes de deslizar) o
 * guillotina (`vertical`: paneles uno sobre otro, primero el de arriba).
 */
export const SLIDING_SYSTEMS = ['standard', 'lift_slide', 'vertical'] as const

/** Qué es un conjunto de ventanas: plano (acopladas), esquina, bay window o bow window. */
export const ASSEMBLY_KINDS = ['flat', 'corner', 'bay', 'bow'] as const
/** Cómo une un perfil de acople: en un plano, oculto, en esquina a ángulo fijo o con ángulo variable. */
export const COUPLING_KINDS = ['flat', 'hidden', 'corner', 'variable'] as const
/** Piezas que se agregan al contorno de la ventana (solo si la línea las trae). */
export const FRAME_ADDON_KINDS = ['subframe', 'extension', 'sill_profile'] as const

/** Uso de una hoja que llega al piso: puerta balconera o puerta de acceso. */
export const LEAF_USES = ['balcony', 'entrance'] as const

export const ROLLER_SHUTTER_TYPES = ['monoblock', 'exterior', 'integrated'] as const
export const ROLLER_SHUTTER_OPERATIONS = ['strap', 'crank', 'motor'] as const
export const INSECT_SCREEN_TYPES = ['fixed', 'hinged', 'sliding', 'roller', 'pleated'] as const
/** Extras de una ventana que se cotizan con reglas de accesorios del catálogo. */
export const EXTRA_KINDS = ['rollerShutter', 'insectScreen', 'sill', 'threshold'] as const
/** Cómo se cuenta un accesorio (ver `AccessoryRule`). */
export const ACCESSORY_PER = ['window', 'sash', 'mullion', 'glass_m', 'frame_m', 'reinforcement_m', 'perimeter_m', 'width_m', 'height_m', 'area_m2', 'coupler_m'] as const
export const COLOR_FINISHES = ['smooth', 'woodgrain', 'textured', 'metallic'] as const

export type OpeningKind = (typeof OPENING_KINDS)[number]
export type ShapeKind = (typeof SHAPE_KINDS)[number]
export type TypologyId = (typeof TYPOLOGY_IDS)[number]
export type SlidingSystem = (typeof SLIDING_SYSTEMS)[number]
export type AssemblyKind = (typeof ASSEMBLY_KINDS)[number]
export type CouplingKind = (typeof COUPLING_KINDS)[number]
export type FrameAddonKind = (typeof FRAME_ADDON_KINDS)[number]
export type LeafUse = (typeof LEAF_USES)[number]
export type RollerShutterType = (typeof ROLLER_SHUTTER_TYPES)[number]
export type RollerShutterOperation = (typeof ROLLER_SHUTTER_OPERATIONS)[number]
export type InsectScreenType = (typeof INSECT_SCREEN_TYPES)[number]
export type ExtraKind = (typeof EXTRA_KINDS)[number]
export type AccessoryPer = (typeof ACCESSORY_PER)[number]
export type ColorFinish = (typeof COLOR_FINISHES)[number]

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo
// ─────────────────────────────────────────────────────────────────────────────

export type Material = 'pvc' | 'aluminum'

/** Practicable (abatir, oscilobatiente, proyectante, puertas, fijos) o corredera. */
export type LineKind = 'casement' | 'sliding'

/**
 * Textura de un color foliado (veta de madera, texturizado, metalizado). `builtin` apunta a la
 * biblioteca de texturas del dibujo; `upload` a un archivo subido por el taller (id del asset del
 * servidor, nunca una URL ni un data URL). El motor nunca la lee: solo la deja pasar.
 * `BuiltinId` estrecha los ids de la biblioteca: `@dekopen/shared` lo usa para `TextureRef`, de modo
 * que ambos tipos no puedan separarse.
 */
export type ColorTexture<BuiltinId extends string = string> = ({ kind: 'builtin'; id: BuiltinId } | { kind: 'upload'; assetId: string }) & {
  /** Largo físico de una repetición del mosaico, en mm (escala de la veta). */
  scaleMm?: number
  /** Giro de la veta respecto del largo de la pieza, en grados (0 = veta a lo largo). */
  angleDeg?: number
  /** Terminación de la superficie (para el dibujo realista y los filtros). */
  finish?: ColorFinish
}

export interface Color {
  id: Id
  name: string // "Blanco", "Nogal", "Antracita", "Roble dorado", "Winchester"…
  /** Color de dibujo; obligatorio aunque haya textura (tono medio y respaldo de todo dibujo). */
  hex: string
  /** Código corto que usan los proveedores en el SKU (BL, NO, AN…), si existe. */
  code?: string
  /** Foliado: textura para el dibujo realista. Opcional; `hex` sigue siendo el respaldo. */
  texture?: ColorTexture
  /**
   * Color propio que se precia como otro color × factor («Mismo precio» = 1). Hereda los precios
   * del color de referencia (o del primero con precio en la línea): un precio que falta es el del
   * color de referencia, no un faltante aparte. Lo pone el servidor en el catálogo efectivo.
   */
  priceFrom?: { colorId?: Id; factor: number }
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
  /**
   * Doble hoja con batiente: separación entre las dos hojas. Con el dato, cada hoja terminada mide
   * `(luz + 2·sashOverlap − frenchGap) / 2` (PRO6004: 10; Kompen: 6). Sin él, la hoja llega al eje y se avisa.
   */
  frenchGap?: number
  /** Batiente: `alto de hoja terminada − frenchMullionDeduction` (PRO6004: 56). Sin dato, el alto de la hoja. */
  frenchMullionDeduction?: number
  /**
   * Puerta con solera: holgura entre la hoja y la cota inferior. Hoja terminada = H − (frameDeduction −
   * sashOverlap) − thresholdGap (PRO6004: 13; con elevación de 35 mm: 35). Sin dato, descuenta como marco.
   */
  thresholdGap?: number
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
  /** Refuerzos adicionales de la misma pieza (Winsa DJ60: 12070 + 13048): mismo largo. */
  extraReinforcementIds?: Id[]
  weightKgM?: number
  /**
   * Perfil de acople (`role: 'coupler'`): qué une y a qué ángulo. Sin dato, el motor lo lee del
   * nombre del catálogo (`couplingOf`) y solo admite lo que el nombre diga de forma explícita.
   */
  coupling?: Coupling
}

/** Capacidad de un perfil de acople. `angle` = ángulo entre paños por el lado del interior (180 = plano). */
export interface Coupling {
  kind: CouplingKind
  /** Esquina a ángulo fijo. Sin dato = esquinero sin ángulo declarado (solo 90°, con aviso). */
  angle?: number
  /** Ángulo variable: límites publicados por el fabricante, si existen. */
  minAngle?: number
  maxAngle?: number
}

/** Unidad de compra. 'm2' = por metro cuadrado (cortinas de persiana, mallas). */
export type HardwareUnit = 'u' | 'kit' | 'm' | 'm2' | 'caja' | 'cartucho' | 'par'

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

/**
 * Regla de herraje: qué lleva cada hoja según apertura y tamaño.
 *
 * `openings`: en practicables, las aperturas a las que aplica (vacío = toda hoja que abre); en
 * correderas, vacío = hojas móviles y `['fixed']` = paños fijos (ver `ruleApplies`).
 */
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
  /**
   * Solo hojas activas o pasivas: en una doble hoja francesa la pasiva lleva pasadores en vez de
   * manilla y cremona; en un plegable la hoja que lleva la manilla es la activa. Sin dato = toda hoja.
   */
  leaf?: 'active' | 'passive'
  /** Oscilobatiente: solo para hojas con esta secuencia (`turn_first` incluye las sin dato). */
  sequence?: 'turn_first' | 'tilt_first'
  /** Correderas: sistemas a los que aplica. Sin dato = corredera estándar (nunca a una elevadora). */
  systems?: SlidingSystem[]
}

/**
 * Accesorio por ventana/paño/metro (tornillos, tacos, burlete, silicona, persianas…). `per`:
 * 'window' por ventana · 'sash' por hoja o panel de corredera · 'mullion' por travesaño fijo
 * (conectores metálicos; la unión francesa no cuenta) · 'glass_m' por metro de perímetro de
 * vidrio · 'frame_m' por metro de marco y travesaños · 'reinforcement_m' por metro de acero
 * (redondeado por pieza) · 'perimeter_m' por metro de perímetro exterior · 'width_m' por metro de
 * ancho · 'height_m' por metro de alto · 'area_m2' por m² de la ventana (ancho × alto) · 'coupler_m'
 * por metro de acople o poste de un conjunto (tornillos de unión, sellador). Vale 0 fuera de un conjunto.
 *
 * Con `extra`, la regla solo aplica si el diseño trae ese extra (persiana, mosquitero, alféizar o
 * umbral) y, si hay `variants`, solo para esos tipos o accionamientos (`'monoblock'`, `'motor'`,
 * `'pleated'`…). Sin `extra`, aplica a toda ventana de la línea.
 *
 * Con `scope: 'panels'`, la regla cuenta solo los paneles ciegos (`LeafNode.fill: 'panel'`) y vale
 * 0 en una ventana sin paneles: `area_m2` = suma de m² de paneles (el artículo suele ser «Panel
 * ciego» en m²), `window` y `sash` = por panel, `width_m` / `height_m` = suma de anchos / altos de
 * panel, `perimeter_m` y `glass_m` = perímetro de los paneles. Las demás medidas no aplican a paneles.
 */
export interface AccessoryRule extends ColorVariants {
  id: Id
  itemId: Id
  per: AccessoryPer
  qty: number
  extra?: ExtraKind
  variants?: string[]
  /**
   * Solo cuenta los paneles ciegos (`panels`, ver arriba) o las celosías (`louvers`) del diseño. Sin
   * dato, la regla mide la ventana entera.
   */
  scope?: 'panels' | 'louvers'
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
  /**
   * Pauta de la corredera elevadora (HST) cuando la línea la fabrica con otros descuentos. Sin dato,
   * la elevadora usa la pauta de la línea (línea dedicada de elevadora).
   */
  liftSlidePauta?: Partial<Pauta>
  /**
   * Ajustes de pauta por apertura (osciloparalela, plegable, pivotante…), sobre la pauta de la
   * variante de hoja. Sin dato, esas hojas usan la pauta de hoja de la línea.
   */
  openingPautas?: Partial<Record<OpeningKind, Partial<Pauta>>>
  /** Perfil por defecto para cada rol. */
  profiles: Partial<Record<ProfileRole, Id>>
  /** Perfil de hoja para apertura interior cuando difiere (Proline: PRO02). */
  sashInProfileId?: Id
  /** Pauta de la hoja interior cuando difiere (PRO02: beadDeduction 107, refuerzo de hoja 64,8). */
  sashInPauta?: Partial<Pauta>
  /** Perfil de hoja de la puerta que abre hacia afuera (Proline: PRO10). Sin dato, la de puerta. */
  doorOutProfileId?: Id
  /** Pauta de esa hoja, sobre `doorPauta` (PRO10: 102/82, refuerzo 190 desde el corte). */
  doorOutPauta?: Partial<Pauta>
  colorIds: Id[]
  /** Tipologías (plantillas) que esta línea puede fabricar. */
  typologyIds: string[]
  hardwareRules: HardwareRule[]
  accessoryRules: AccessoryRule[]
  /** De dónde salen los datos: "OT 385 verificada", "pauta distribuidora", "plantilla genérica". */
  source?: string
  /** Si faltan datos se cotiza igual y se avisa. */
  completeness?: 'verified' | 'complete' | 'partial'
  /** Respaldo de los datos de la línea (lo llena el catálogo; el motor lee vidrio, junquillos y límites). */
  provenance?: LineProvenanceData
}

/** Junquillo que corresponde a un rango de espesor de vidrio (mm). */
export interface BeadRange {
  code: string
  min: number
  max: number
  source?: string
}

/** Límite de hoja publicado por el fabricante, por apertura. */
export interface SizeLimit {
  opening: string
  width: [number, number]
  height: [number, number]
  /** Espesor de refuerzo recomendado (mm). */
  steel?: number
  maxKg?: number
  source?: string
}

/** Lo que el motor lee del respaldo de una línea; el catálogo agrega el resto de los campos. */
export interface LineProvenanceData {
  glazing?: { min: number; max: number; source?: string }
  beads?: BeadRange[]
  limits?: SizeLimit[]
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

export interface Opening {
  kind: OpeningKind
  /**
   * Lado de las bisagras visto desde el interior. En una hoja plegable, el lado hacia donde se
   * pliega su grupo (la jamba donde se apila).
   */
  hinge?: 'left' | 'right'
  /** Hacia dónde abre la hoja. */
  direction?: 'in' | 'out'
  /** Oscilobatiente: orden de la manilla. `tilt_first` = oscila primero (seguridad). Sin dato = gira primero. */
  sequence?: 'turn_first' | 'tilt_first'
  /** Osciloparalela y corredera paralela: hacia dónde se desliza la hoja al abrir (vista interior). */
  slide?: 'left' | 'right'
  /**
   * Pivotante: posición del eje como fracción (0–1) del ancho de la hoja desde la izquierda
   * (pivot_v) o de su alto desde arriba (pivot_h). Sin dato = centrado (0,5).
   */
  pivot?: number
  /** Hoja que llega al piso: puerta balconera o de acceso (hoja de puerta, umbral, nombre). */
  use?: LeafUse
}

/** Relleno de un paño. */
export type PaneFill = 'glass' | 'panel' | 'louver'

export interface LeafNode {
  id: Id
  type: 'leaf'
  opening: Opening
  /** Vidrio específico del paño (si no, el del diseño). */
  glassId?: Id
  /** Panel ciego (puertas) o celosía de lamas fijas en vez de vidrio. */
  fill?: PaneFill
  /**
   * Zócalo: hoja con una banda ciega abajo, separada del vidrio por un travesaño de hoja. Sigue siendo
   * una sola hoja con un solo juego de herrajes. `height` = alto del zócalo desde el borde inferior de
   * la hoja terminada, en mm.
   */
  zocalo?: { height: number }
}

/**
 * División del espacio. `dir: 'vertical'` = travesaños verticales, hijos lado a
 * lado (izquierda → derecha). `'horizontal'` = hijos de arriba hacia abajo.
 * `sizes[i]` es la medida a eje en mm del hijo i; null = reparte el resto en partes iguales.
 * `joint: 'french'` = doble hoja sin travesaño fijo (inversor en la hoja pasiva).
 * `joint: 'fold'` = cadena plegable (solo vertical, hijos = hojas `folding`, sin travesaño).
 */
export interface SplitNode {
  id: Id
  type: 'split'
  dir: 'vertical' | 'horizontal'
  children: DesignNode[]
  sizes: (number | null)[]
  joint?: 'mullion' | 'french' | 'fold'
  /**
   * Unión francesa: qué hoja es la pasiva (lleva el inversor y pasadores, sin manilla), vista
   * desde el interior. Sin dato = la izquierda (comportamiento v4).
   */
  passive?: 'left' | 'right'
}

export interface SlidingPanel {
  id: Id
  kind: 'moving' | 'fixed'
  /** Hacia dónde se desliza la hoja móvil al abrir (guillotina: `up` / `down`). */
  direction?: 'left' | 'right' | 'up' | 'down'
  glassId?: Id
  /** Riel del panel (0 = exterior) cuando difiere del típico de la disposición. */
  rail?: number
}

/** Sólo como raíz en líneas de corredera. Hasta 6 paneles. */
export interface SlidingNode {
  id: Id
  type: 'sliding'
  rails: 1 | 2 | 3
  panels: SlidingPanel[]
  /** Corredera estándar, elevadora (HST) o guillotina. Sin dato = estándar. */
  system?: SlidingSystem
  /**
   * Ancho de cada panel en mm medido sobre el ancho total (como `SplitNode.sizes`; null = reparte
   * el resto; en guillotina, alto sobre el alto total). Sin dato = paneles iguales. Sirve para el
   * fijo central doble de una corredera de 3.
   */
  sizes?: (number | null)[]
}

export type DesignNode = LeafNode | SplitNode | SlidingNode

export type Shape =
  | { kind: 'rect' }
  | { kind: 'arch'; rise: number } // medio punto (rise = ancho/2) o arco rebajado (rise menor)
  | { kind: 'trapezoid'; leftHeight: number; rightHeight: number } // irregular
  | { kind: 'triangle'; apex: 'left' | 'center' | 'right' }
  | { kind: 'round' } // círculo inscrito en ancho × alto (ojo de buey)
  | { kind: 'oval' } // elipse inscrita en ancho × alto
  | { kind: 'pentagon' } // pentágono regular ajustado al ancho × alto, vértice arriba
  | { kind: 'octagon'; chamfer?: number } // ochavo de cada esquina en mm (sin dato = regular)
  | { kind: 'gable'; shoulderHeight: number } // casa: lados verticales de shoulderHeight, cumbrera al centro

/** Persiana enrollable: cajón (monoblock, exterior o integrado) y accionamiento. */
export interface RollerShutter {
  type: RollerShutterType
  operation: RollerShutterOperation
  /** Alto del cajón en mm (sobre el marco en monoblock y exterior). Sin dato = típico del tipo. */
  boxHeight?: number
}

export interface InsectScreen {
  type: InsectScreenType
}

/** Extras de una ventana: se dibujan y se cotizan con reglas de accesorios (`AccessoryRule.extra`). */
export interface WindowExtras {
  /** v4: mosquitero sí/no (equivale a `insectScreen: { type: 'fixed' }`). */
  screen?: boolean
  insectScreen?: InsectScreen
  rollerShutter?: RollerShutter
  /** Alféizar / vierteaguas exterior a lo ancho. */
  sill?: boolean
  /** Umbral bajo en puertas (si no, marco completo). */
  threshold?: boolean
  /** Premarco, ensanche o vierteaguas de la línea (perfil del catálogo, cortado a medida). */
  frameAddons?: FrameAddon[]
}

/** Pieza de contorno elegida del catálogo. Solo existe si la línea la trae; se corta y se cobra como perfil. */
export interface FrameAddon {
  kind: FrameAddonKind
  profileId: Id
  /** Ensanche: lados que lo llevan. Sin dato = izquierda, derecha y arriba. */
  sides?: ('top' | 'bottom' | 'left' | 'right')[]
}

// ─── Conjuntos de ventanas (acopladas, esquina, bay, bow) ───────────────────

/** Una ventana completa dentro de un conjunto: tiene su marco, línea, color, vidrio y árbol. */
export interface AssemblyUnit {
  /** Letra de la unidad («A», «B»…): id estable y rótulo de taller. */
  id: Id
  type: 'unit'
  design: WindowDesign
}

/** Unión entre dos hijos consecutivos de un grupo. */
export interface AssemblyJoint {
  /**
   * Ángulo entre los paños en planta medido por el lado del interior: 180 = plano (acople), 135 =
   * poste de bay window, 90 = esquina. Bajo 180 la punta sale hacia afuera; sobre 180 entra hacia
   * adentro (210 es el poste de 150 al revés). Solo la fila raíz puede quebrarse; lo demás es plano.
   */
  angle: number
  /** Perfil elegido del catálogo. Sin dato, el motor elige el que corresponda y tenga precio. */
  profileId?: Id
}

/** Fila (lado a lado) o columna (uno sobre otro) de unidades, de cualquier tipo, alto y línea. */
export interface AssemblyGroup {
  id: Id
  type: 'group'
  dir: 'row' | 'column'
  children: AssemblyNode[]
  /** Una por cada par de hijos consecutivos (`children.length - 1`). */
  joints: AssemblyJoint[]
  /**
   * Alineación de hijos de distinto tamaño. Fila: `start` = dintel común (por defecto), `end` =
   * antepecho o piso común. Columna: `start` = izquierda, `end` = derecha.
   */
  align?: 'start' | 'center' | 'end'
}

export type AssemblyNode = AssemblyUnit | AssemblyGroup

/** Conjunto de ventanas: `WindowDesign.assembly`. */
export interface Assembly {
  kind: AssemblyKind
  root: AssemblyGroup
  /**
   * Esquina de un solo quiebre: qué extremo queda de frente al muro (`start` = el primero, `end` = el
   * último); el otro es el que gira. Sin dato, el último. Con más quiebres el conjunto es simétrico.
   */
  front?: 'start' | 'end'
}

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
  /** Persiana, mosquitero, alféizar, umbral. */
  extras?: WindowExtras
  /**
   * Conjunto de varias ventanas. `width` y `height` pasan a ser los totales desarrollados, `lineId`,
   * `colorId` y `glassId` los de la primera unidad, y `root` queda como paño fijo de reserva: quien no
   * conozca los conjuntos dibuja un rectángulo en vez de fallar. Medidas, materiales y precio salen de
   * las unidades (`computeLayout`, `computeBom`, `priceItem`).
   */
  assembly?: Assembly
}

/** Grupo de la galería (para ordenar y filtrar; `kind` decide la línea que la fabrica). */
export type TypologyGroup = 'window' | 'door' | 'sliding' | 'folding' | 'shape'

export interface Typology {
  id: TypologyId
  name: string // "Corredera 2 hojas"
  kind: LineKind
  group: TypologyGroup
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
  /** 'fold' = encuentro entre hojas de un plegable (sin perfil fijo). */
  kind: 'mullion' | 'french' | 'fold'
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
  fill: PaneFill
  /** Dónde va la manilla (lado de cierre). */
  handle?: 'left' | 'right' | 'top' | 'bottom'
  /** Hoja pasiva de una doble hoja francesa o de un plegable (sin manilla). */
  passive?: true
  /** Zócalo: banda ciega bajo el vidrio y el travesaño de hoja que la separa. */
  zocalo?: { panel: Rect; bar: Rect }
}

export interface LayoutPane {
  nodeId: Id
  /** 'fixed' = vidrio directo en marco; 'sash' = dentro de una hoja. */
  kind: 'fixed' | 'sash'
  glassRect: Rect
  fill: PaneFill
  glassId: Id
  /** Contorno del vidrio para formas no rectangulares (path SVG en mm). */
  outline?: string
}

export interface LayoutSlidingPanel {
  panelId: Id
  index: number
  kind: 'moving' | 'fixed'
  direction?: 'left' | 'right' | 'up' | 'down'
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
  /** Si es editable: qué nodo y qué índice de `sizes` modifica (o qué unidad de un conjunto). */
  target?: { nodeId: Id; index: number } | { kind: 'width' | 'height'; unitId?: Id }
}

export interface LayoutCell {
  nodeId: Id
  rect: Rect // área de la luz del paño (para seleccionar en el editor)
  path: Id[] // ids desde la raíz
}

/**
 * Accesorios para dibujar (misma convención de coordenadas: y < 0 queda sobre el marco).
 * Las medidas de cajón, guías y alféizar son de dibujo, no de fabricación.
 */
export interface LayoutAttachments {
  rollerShutter?: {
    type: RollerShutterType
    operation: RollerShutterOperation
    /** Cajón sobre el marco (monoblock y exterior); en integrado, oculto en el dintel. */
    box: Rect
    /** Guías laterales de la cortina, por delante del marco. */
    guides: Rect[]
  }
  insectScreen?: { type: InsectScreenType }
  /** Alféizar bajo el marco, con su vuelo a cada lado. */
  sill?: { rect: Rect }
}

/** Unidad de un conjunto ya ubicada. `layout` es su dibujo propio, en coordenadas de la unidad. */
export interface LayoutAssemblyUnit {
  unitId: Id
  /** Rectángulo en el desarrollo (todas las unidades en un mismo plano). */
  rect: Rect
  layout: Layout
  design: WindowDesign
  /** Paño de la planta al que pertenece (índice en `plan.facets`; 0 sin planta). */
  facet: number
  /**
   * Ubicación real (3D y planta): esquina izquierda de la unidad vista desde el interior, en mm
   * (`x` a lo largo del muro, `y` hacia el exterior), `heading` en grados (0 = paralela al muro) y
   * `top` = distancia desde lo alto del conjunto. En un conjunto plano, `x` = `rect.x`, `y` y `heading` 0.
   */
  placement: { x: number; y: number; heading: number; top: number }
}

/** Unión de un conjunto ya resuelta contra el catálogo. */
export interface LayoutAssemblyJoint {
  id: Id
  /** Rótulo («A–B»). */
  label: string
  groupId: Id
  index: number
  /** 'vertical' = acople entre columnas; 'horizontal' = entre unidades apiladas. */
  dir: 'vertical' | 'horizontal'
  /** Banda en el desarrollo. Con cara vista desconocida u oculta mide 0 de ancho. */
  rect: Rect
  /** Ángulo del poste, de 45 a 180: es el mismo vaya hacia afuera o hacia adentro. */
  angle: number
  /** La punta entra hacia adentro (la dirección está en `AssemblyJoint.angle`, sobre 180). */
  inward?: true
  kind: 'coupler' | 'corner_post' | 'variable_post'
  /** `missing` = la línea no trae esa pieza: se dibuja con aviso y queda fuera del total. */
  status: 'ok' | 'unverified' | 'missing'
  profileId?: Id
  code?: string
  name?: string
  /** Largo de corte en mm. */
  length: number
}

/** Paño recto de la planta de un conjunto (y = hacia el exterior, x a lo largo del muro). */
export interface LayoutPlanFacet {
  index: number
  unitIds: Id[]
  /** Extremos en planta, en mm, de izquierda a derecha vistos desde el interior. */
  from: { x: number; y: number }
  to: { x: number; y: number }
  /** Dirección del paño en grados: 0 = paralelo al muro, positivo = saliendo hacia el exterior. */
  heading: number
  width: number
  /** Espesor del perfil (línea), para dibujar la planta. */
  depth: number
  /** Espesor sin dato en el catálogo: la planta usa uno de dibujo. */
  depthAssumed?: true
}

export interface LayoutPlanPost {
  jointId: Id
  x: number
  y: number
  /** Dirección de la bisectriz, en grados. */
  heading: number
  /** Ángulo del poste, de 45 a 180. */
  angle: number
  face: number
  status: LayoutAssemblyJoint['status']
}

export interface LayoutAssemblyPlan {
  facets: LayoutPlanFacet[]
  posts: LayoutPlanPost[]
  /** Ancho en planta, de punta a punta. */
  span: number
  /** Vuelo: cuánto sale del plano del muro. */
  projection: number
  /** Suma de los anchos de los paños y postes (el desarrollo). */
  developed: number
  /** Radio del arco que pasa por los postes de un bow (paños y ángulos iguales). */
  radius?: number
}

/** Geometría de un conjunto: lo que necesitan dibujo, planta, 3D y documentos. */
export interface LayoutAssembly {
  kind: AssemblyKind
  units: LayoutAssemblyUnit[]
  joints: LayoutAssemblyJoint[]
  /** Solo si el conjunto se quiebra en planta (esquina, bay, bow). */
  plan?: LayoutAssemblyPlan
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
  /** Sistema de la corredera (la elevadora se dibuja con su marca de levante). */
  slidingSystem?: SlidingSystem
  attachments?: LayoutAttachments
  /**
   * Conjunto de ventanas. `mullions`, `sashes`, `panes`, `sliding` y `cells` traen además todas las
   * piezas de las unidades en coordenadas del desarrollo, con id `«unidad:nodo»` (`A:n3`), para
   * seleccionar y editar; el dibujo usa `assembly.units`.
   */
  assembly?: LayoutAssembly
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
  /** Largo de barra propio del perfil. 0 = sin dato: manda `CutSettings.barLength` (ver `planCuts`). */
  barLength: number
}

export interface GlassPiece {
  glassId: Id
  name: string
  width: number
  height: number
  qty: number
  /** m² por pieza (4 decimales): ancho × alto, también en formas (el vidrio se cobra por su rectángulo). */
  area: number
  /** Vidrio con forma: su área real en m² (peso estimado y avisos de tamaño). */
  realArea?: number
  nodeId: Id
  label: string // "Paño 1", "Hoja izq."
  shape?: ShapeKind
  /** Contorno real del vidrio con forma (path SVG en mm, coordenadas del dibujo). */
  outline?: string
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

/** Valores de `Warning.params`: texto o número (serializable). */
export type WarningParamRecord = Readonly<Record<string, string | number | undefined>>

/**
 * Aviso en lenguaje de taller. Nunca bloquea: "error" = no fabricable tal cual. `code` y `message`
 * (en español) son estables. `params` trae los datos del aviso en bruto (ver `WarningParamsMap` en
 * `warnings.ts`: medidas en mm sin formato, ids, nombres del catálogo) para decir lo mismo en otro
 * idioma; los avisos del motor siempre los traen, pero un aviso de otra fuente puede no tenerlos.
 */
export interface Warning {
  level: WarningLevel
  code: string
  message: string // "La hoja izquierda mide 1.450 mm de alto: la cremona más larga del kit llega a 1.400."
  nodeId?: Id
  /** Conjunto: unidad de la que habla el aviso («B»). */
  unitId?: Id
  /** Datos del aviso, tipados por código en `WarningParamsMap`. */
  params?: WarningParamRecord
  /**
   * Corrección en un clic, si existe. `key` es la acción (estable) y `params` sus datos (ver
   * `WarningFixParamsMap`); `label` es el texto en español de siempre.
   */
  fix?: { label: string; key?: string; params?: WarningParamRecord; patch: Partial<WindowDesign> }
}

/** Panel ciego (relleno opaco en vez de vidrio): su medida de corte, para cotizarlo y fabricarlo. */
export interface PanelPiece {
  nodeId: Id
  /** Sin dato = panel ciego. `zocalo` = banda ciega de una hoja. `louver` = celosía de lamas. */
  kind?: 'panel' | 'zocalo' | 'louver'
  /** Etiqueta corta para taller («Hoja», «Paño fijo sup.»). */
  label: string
  width: number
  height: number
  qty: number
  /** m² por pieza (4 decimales): ancho × alto, también en formas (el panel se corta del rectángulo). */
  area: number
}

export interface Bom {
  cuts: CutPiece[]
  glass: GlassPiece[]
  /** Paneles ciegos (`fill: 'panel'`). Solo existe si el diseño tiene alguno. */
  panels?: PanelPiece[]
  items: ItemLine[]
  warnings: Warning[]
  /** m² de carpintería (cota). En un conjunto, la suma de sus unidades. */
  area: number
  perimeter: number // m
  weightKg?: number
  /** Conjunto: despiece de cada unidad y de las uniones (las listas de arriba los traen sumados). */
  assembly?: BomAssembly
}

export interface BomUnit {
  unitId: Id
  design: WindowDesign
  bom: Bom
}

export interface BomAssembly {
  units: BomUnit[]
  /** Acoples, postes y su refuerzo. Sin área: no suman mano de obra por m². */
  joints: Bom
  /** Uniones sin pieza en el catálogo: el conjunto queda incompleto. */
  missingJoints: { jointId: Id; label: string; angle: number }[]
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
  /**
   * Lo que falta para tener precio. Regla única: lo que no tiene pieza o precio en el catálogo se
   * dibuja con aviso y queda **fuera del total** hasta tenerlo (o hasta poner un precio manual); nunca
   * se cotiza a $0 ni se estima. Una ventana con faltantes tiene `unitNet` 0; en un conjunto solo salen
   * las unidades y uniones afectadas y el resto conserva su precio. Sin faltantes el campo no existe.
   */
  pending?: PendingPrice[]
  /** Conjunto: precio de cada unidad y unión. */
  units?: ItemPriceUnit[]
}

export type PendingPriceCode =
  | 'profile_missing' // la línea no tiene ese perfil
  | 'price_missing' // material sin precio o que ya no está en el catálogo
  | 'hardware_missing' // sin herraje para esa apertura o medida
  | 'extra_missing' // persiana, mosquitero, panel o celosía sin regla de precio
  | 'line_missing' // la línea ya no está
  | 'joint_missing' // la línea no trae acople o poste para esa unión
  | 'no_materials' // no se pudo calcular el despiece

/** Un faltante: qué (`ref`, nombre del catálogo) y de cuál unidad del conjunto, si aplica. */
export interface PendingPrice {
  code: PendingPriceCode
  ref: string
  unitId?: Id
}

/** Precio de cada unidad de un conjunto, para desglosarlo en documentos e inspector. */
export interface ItemPriceUnit {
  /** Letra de la unidad, o id de la unión. */
  id: Id
  kind: 'unit' | 'joint'
  label: string
  /** Precio neto antes del redondeo final; 0 si está pendiente. */
  net: number
  cost: number
  pending: boolean
}

/** `base`: siempre en el total. `optional`: solo si se marca. `alternative`: una por grupo. */
export type QuoteLineRole = 'base' | 'optional' | 'alternative'

export interface QuoteExtra {
  id: Id
  label: string // "Instalación", "Transporte", "Retiro de ventanas antiguas"
  amount: number // neto CLP
  hidden?: boolean // no se muestra desglosado en el documento
  /** Ítem de texto: se imprime como partida propia, con su detalle y con o sin valor. */
  line?: boolean
  /** Detalle visible de la partida. */
  description?: string
  role?: QuoteLineRole
  altGroup?: string
  /** Opcional marcado o alternativa elegida. */
  included?: boolean
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
  /** Ítems con faltantes de precio (fuera del total, entero o en parte). Solo si hay alguno. */
  pendingItems?: number
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
  shape?: ShapeKind
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
