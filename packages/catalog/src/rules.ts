/**
 * Herrajes y accesorios genéricos con reglas por apertura y tamaño. Sirven para el
 * catálogo de ejemplo y como respaldo cuando una marca no trae reglas propias
 * (ninguna de las listas importadas las trae: sólo artículos sueltos).
 *
 * `buildLineRules` arma las reglas de una línea usando primero los artículos reales
 * de la marca (cremonas con rango en el nombre, brazos por pulgadas, bisagras…) y
 * completa lo que falte con los genéricos.
 */
import type { AccessoryRule, Brand, HardwareRule, Item, LineKind, OpeningKind, SlidingSystem } from '@dekopen/engine'
import { parseBackset, parseInches, parseRange } from './classify'
import { normalizeKey, round1 } from './text'

export const SAMPLE_SOURCE = 'Catálogo de ejemplo DEKOPEN'
export const GENERIC_BRAND_ID = 'dekopen-genericos'

export const GENERIC_BRAND: Brand = {
  id: GENERIC_BRAND_ID,
  name: 'Genéricos DEKOPEN',
  kind: 'hardware',
  country: 'Chile',
  monogram: 'GF',
  accent: '#6F685E',
}

function item(code: string, name: string, kind: Item['kind'], price: number, unit: Item['unit'] = 'u', packSize?: number): Item {
  return { id: `fz.${code}`, brandId: GENERIC_BRAND_ID, kind, code: `FZ-${code.toUpperCase()}`, name, unit, ...(packSize ? { packSize } : {}), price }
}

/** Rangos de alto de hoja (mm) de las cremonas genéricas de abatir. */
const CREMONA_RANGES: [number, number, number][] = [
  [280, 400, 3400],
  [400, 600, 3900],
  [600, 800, 4400],
  [800, 1000, 4900],
  [1000, 1200, 5600],
  [1200, 1400, 6300],
  [1400, 1700, 7200],
  [1700, 2200, 8900],
]
const TILT_TURN_RANGES: [number, number, number][] = [
  [450, 800, 24900],
  [800, 1200, 28900],
  [1200, 1600, 32900],
  // Puertas balconeras oscilobatientes (hoja de puerta hasta 2.400 mm, research 25 L5).
  [1600, 2400, 38900],
]
/** Kits de osciloparalela (PSK) y corredera paralela (PS) por ANCHO de hoja (research 25 L11/L12). */
const PSK_RANGES: [number, number, number][] = [
  [670, 1200, 289000],
  [1200, 2000, 389000],
]
const PS_RANGES: [number, number, number][] = [
  [670, 1200, 239000],
  [1200, 2000, 329000],
]
const fmtRange = (min: number, max: number) => `${min.toLocaleString('es-CL')}–${max.toLocaleString('es-CL')} mm`
/** Brazos de proyección: pulgadas, alto máximo de hoja que cubren, precio por unidad. */
const ARM_SIZES: [number, number, number][] = [
  [10, 450, 6500],
  [12, 550, 7000],
  [16, 750, 8900],
  [20, 950, 10500],
  [24, 1300, 13900],
]

export const GENERIC_ITEMS: Item[] = [
  ...CREMONA_RANGES.map(([min, max, price]) => item(`cremona-${min}-${max}`, `Cremona de abatir ${min}–${max} mm`, 'hardware', price)),
  ...TILT_TURN_RANGES.map(([min, max, price]) => item(`kit-ob-${min}-${max}`, `Kit oscilobatiente ${min}–${max} mm`, 'hardware', price, 'kit')),
  item('kit-oscilante', 'Kit oscilante (compás y cierre)', 'hardware', 18900, 'kit'),
  ...ARM_SIZES.map(([inches, , price]) => item(`brazo-${inches}`, `Brazo de proyección ${inches}"`, 'hardware', price)),
  item('bisagra-ventana', 'Bisagra de ventana 2D', 'hardware', 2300),
  item('cerradero', 'Cerradero de abatir', 'hardware', 380),
  item('manilla-ventana', 'Manilla de ventana', 'hardware', 2900),
  item('bisagra-puerta', 'Bisagra de puerta 3D', 'hardware', 9800),
  item('cerradura-puerta', 'Cerradura multipunto de puerta', 'hardware', 32900, 'kit'),
  item('cilindro', 'Cilindro de seguridad 40/40', 'hardware', 12900),
  item('manilla-puerta', 'Manilla doble de puerta', 'hardware', 13900, 'kit'),
  item('kit-corredera', 'Kit de corredera (2 carros, cierre y topes)', 'hardware', 9900, 'kit'),
  // v5: secuencias, hojas pasivas, pivotantes, osciloparalelas, paralelas, plegables y elevadoras.
  item('kit-tbt', 'Kit oscila primero (caja de cambio y manilla con llave)', 'hardware', 16900, 'kit'),
  item('pasador-pasiva', 'Juego de pasadores de hoja pasiva de ventana', 'hardware', 9900, 'kit'),
  item('pasador-puerta-pasiva', 'Juego de pasadores de hoja pasiva de puerta', 'hardware', 17900, 'kit'),
  item('kit-pivot-v', 'Kit pivotante vertical (pivotes, freno y cierre central)', 'hardware', 64900, 'kit'),
  item('kit-pivot-h', 'Kit pivotante horizontal (pivotes, freno y cierre central)', 'hardware', 58900, 'kit'),
  ...PSK_RANGES.map(([min, max, price]) => item(`kit-psk-${min}-${max}`, `Kit osciloparalela ${fmtRange(min, max)} de ancho (carros, compases, rieles y manilla)`, 'hardware', price, 'kit')),
  ...PS_RANGES.map(([min, max, price]) => item(`kit-paralela-${min}-${max}`, `Kit corredera paralela ${fmtRange(min, max)} de ancho (carros, rieles y manilla)`, 'hardware', price, 'kit')),
  item('kit-hoja-plegable', 'Juego de hoja plegable (bisagras intermedias y carro)', 'hardware', 54900, 'kit'),
  item('cierre-plegable', 'Cierre de hoja activa de plegable (manilla y cremona)', 'hardware', 32900, 'kit'),
  item('pasador-plegable', 'Pasadores de hoja pasiva de plegable', 'hardware', 11900, 'kit'),
  item('kit-elevadora', 'Kit corredera elevadora (carros elevadores, caja de cambio, manilla y cierres)', 'hardware', 469000, 'kit'),
  item('fijacion-elevadora', 'Fijación de paño fijo de elevadora', 'hardware', 14900, 'kit'),
  item('tornillo-refuerzo', 'Tornillo para refuerzo 3,9 × 19 (caja de 1.000)', 'consumable', 16900, 'caja', 1000),
  item('tornillo-instalacion', 'Tornillo de instalación con tarugo (caja de 100)', 'consumable', 18900, 'caja', 100),
  item('calzo', 'Calzo de acristalar', 'accessory', 60),
  item('burlete', 'Burlete EPDM (rollo de 100 m)', 'accessory', 26900, 'm', 100),
  item('felpa', 'Felpa 5 × 7 (rollo de 250 m)', 'accessory', 29900, 'm', 250),
  item('silicona', 'Silicona neutra (cartucho 300 ml)', 'consumable', 3900, 'cartucho'),
  item('tapa-desague', 'Tapa de desagüe', 'accessory', 150),
  // v5: persianas, mosquiteros, alféizar y umbral (extras de la ventana).
  item('persiana-cortina', 'Cortina de persiana de aluminio (lamas y riel final)', 'accessory', 34900, 'm2'),
  item('persiana-cajon-monoblock', 'Cajón de persiana monoblock', 'accessory', 21900, 'm'),
  item('persiana-cajon-exterior', 'Cajón de persiana exterior', 'accessory', 18900, 'm'),
  item('persiana-cajon-integrado', 'Cajón de persiana integrado en el dintel', 'accessory', 16900, 'm'),
  item('persiana-guia', 'Guía de persiana de aluminio', 'accessory', 4900, 'm'),
  item('persiana-cinta', 'Recogedor y cinta de persiana', 'accessory', 8900),
  item('persiana-manivela', 'Torno y manivela de persiana', 'accessory', 21900, 'kit'),
  item('persiana-motor', 'Motor tubular de persiana con control', 'accessory', 94900, 'kit'),
  item('mosquitero-fijo', 'Mosquitero fijo (marco y malla)', 'accessory', 19900, 'm2'),
  item('mosquitero-abatible', 'Mosquitero abatible (marco, malla, bisagras y cierre)', 'accessory', 42900),
  item('mosquitero-corredero', 'Mosquitero corredero (marco, malla, carros y felpa)', 'accessory', 36900),
  item('mosquitero-enrollable', 'Mosquitero enrollable (cajón, guías y malla)', 'accessory', 62900),
  item('mosquitero-plisado', 'Mosquitero plisado (marco, malla plisada y guías)', 'accessory', 58900, 'm2'),
  item('alfeizar', 'Alféizar de aluminio', 'accessory', 13900, 'm'),
  item('tapa-umbral', 'Tapas y sellos de umbral', 'accessory', 6900, 'kit'),
  // v5: panel ciego (relleno opaco en vez de vidrio, p. ej. en puertas), cotizado por m² de panel.
  item('panel-ciego', 'Panel ciego de PVC tipo sándwich 24 mm', 'accessory', 38900, 'm2'),
]

const CASEMENT_HANDLE_OPENINGS: OpeningKind[] = ['casement', 'tilt_turn', 'tilt', 'awning', 'pivot_v', 'pivot_h']
/** Hojas que pueden ser pasivas en una doble hoja francesa (llevan pasadores en vez de manilla). */
const PASSIVE_WINDOW_OPENINGS: OpeningKind[] = ['casement', 'tilt_turn']

/** Solo hoja activa (manilla, cremona, cerradura): la pasiva de una francesa lleva pasadores. */
const active = (rule: HardwareRule): HardwareRule => ({ ...rule, leaf: 'active' })

/**
 * Reglas por rangos contiguos, sin solaparse ni dejar huecos: cada tramo empieza 0,1 mm después
 * del anterior. Si la lista no trae un tramo intermedio (cremonas E15 1.200–1.400 y 1.600–1.800,
 * sin 1.400–1.600), lo cubre el artículo siguiente, el más largo: ninguna hoja queda sin herraje
 * y nunca se cotiza uno que no alcance.
 */
function rangedRules(
  prefix: string,
  openings: OpeningKind[],
  ranges: { itemId: string; min?: number; max?: number; qty?: number }[],
  dimension: 'height' | 'width' = 'height',
): HardwareRule[] {
  const sorted = [...ranges].sort((a, b) => (a.min ?? 0) - (b.min ?? 0) || (a.max ?? Infinity) - (b.max ?? Infinity))
  const out: HardwareRule[] = []
  let previousMax: number | undefined
  for (const range of sorted) {
    let min = range.min
    if (previousMax !== undefined) min = round1(previousMax + 0.1)
    if (range.max !== undefined && min !== undefined && min > range.max) continue
    const rule: HardwareRule = { id: `${prefix}-${out.length + 1}`, openings, itemId: range.itemId, qty: range.qty ?? 1 }
    if (dimension === 'height') {
      if (min !== undefined) rule.minHeight = min
      if (range.max !== undefined) rule.maxHeight = range.max
    } else {
      if (min !== undefined) rule.minWidth = min
      if (range.max !== undefined) rule.maxWidth = range.max
    }
    out.push(rule)
    previousMax = range.max
    if (range.max === undefined) break
  }
  return out
}

// `perStep` suma por cada tramo o fracción sobre `minHeight` (convención del motor).
/** Bisagras: 2 hasta 1.000 mm de hoja, 3 hasta 1.700, 4 hasta 2.400… */
function hingeRules(prefix: string, itemId: string): HardwareRule[] {
  return [
    { id: `${prefix}-1`, openings: ['casement'], itemId, qty: 2, maxHeight: 1000 },
    { id: `${prefix}-2`, openings: ['casement'], itemId, qty: 2, minHeight: 1000.1, perStep: { stepMm: 700, qty: 1 } },
  ]
}
/** Cerraderos: 2 hasta 700 mm de hoja, 3 hasta 1.400, 4 hasta 2.100… */
function strikeRules(prefix: string, itemId: string): HardwareRule[] {
  return [{ id: `${prefix}-1`, openings: ['casement'], itemId, qty: 1, perStep: { stepMm: 700, qty: 1 } }]
}
/**
 * Cerraderos con artículo de la marca (OT 385): además de los de abatir, 2 en la proyectante u
 * oscilante, que cierran con cremona (V7: 3 + 2 = 5 en la ventana), y 4 en la puerta (V1).
 */
function brandStrikeRules(prefix: string, itemId: string): HardwareRule[] {
  return [
    ...strikeRules(prefix, itemId),
    { id: `${prefix}-proyectante`, openings: ['awning', 'tilt'], itemId, qty: 2 },
    { id: `${prefix}-puerta`, openings: ['door'], itemId, qty: 4 },
  ]
}

/**
 * Las cremonas de corredera se eligen por alto de hoja − 100 mm, no por el alto de la hoja (OT 385:
 * hoja de 1.047 → «800-801/1000» en V6; monorriel de 911 → «800-801/1000» en V3; PROSLD84 de
 * 897 → «600-601/800» en V4). Por eso sus tramos se corren 100 mm hacia arriba.
 */
export const SLIDING_CREMONA_OFFSET = 100
function doorHingeRules(prefix: string, itemId: string): HardwareRule[] {
  return [
    { id: `${prefix}-1`, openings: ['door'], itemId, qty: 3, maxHeight: 2200 },
    { id: `${prefix}-2`, openings: ['door'], itemId, qty: 4, minHeight: 2200.1 },
  ]
}
function armRules(prefix: string, arms: { itemId: string; inches: number }[]): HardwareRule[] {
  const sorted = [...arms].sort((a, b) => a.inches - b.inches)
  return rangedRules(
    prefix,
    ['awning'],
    sorted.map((arm, index) => ({
      itemId: arm.itemId,
      max: index === sorted.length - 1 ? undefined : Math.round(arm.inches * 25.4 * 1.8),
      qty: 2,
    })),
  )
}

/** Herrajes de líneas practicables (ventanas y puertas) con artículos genéricos. */
export const GENERIC_HARDWARE_RULES: HardwareRule[] = [
  ...rangedRules(
    'fz.r.cremona',
    ['casement'],
    CREMONA_RANGES.map(([min, max]) => ({ itemId: `fz.cremona-${min}-${max}`, min, max })),
  ).map(active),
  ...rangedRules(
    'fz.r.ob',
    ['tilt_turn'],
    TILT_TURN_RANGES.map(([min, max]) => ({ itemId: `fz.kit-ob-${min}-${max}`, min, max })),
  ),
  { id: 'fz.r.oscilante', openings: ['tilt'], itemId: 'fz.kit-oscilante', qty: 1 },
  ...rangedRules(
    'fz.r.brazo',
    ['awning'],
    ARM_SIZES.map(([inches, max], index) => ({ itemId: `fz.brazo-${inches}`, max: index === ARM_SIZES.length - 1 ? undefined : max, qty: 2 })),
  ),
  ...hingeRules('fz.r.bisagra', 'fz.bisagra-ventana'),
  ...strikeRules('fz.r.cerradero', 'fz.cerradero'),
  { id: 'fz.r.manilla', openings: CASEMENT_HANDLE_OPENINGS, itemId: 'fz.manilla-ventana', qty: 1, leaf: 'active' },
  ...doorHingeRules('fz.r.bisagra-puerta', 'fz.bisagra-puerta'),
  { id: 'fz.r.cerradura', openings: ['door'], itemId: 'fz.cerradura-puerta', qty: 1, leaf: 'active' },
  { id: 'fz.r.cilindro', openings: ['door'], itemId: 'fz.cilindro', qty: 1, leaf: 'active' },
  { id: 'fz.r.manilla-puerta', openings: ['door'], itemId: 'fz.manilla-puerta', qty: 1, leaf: 'active' },
  ...v5HardwareRules(),
]

/**
 * Reglas genéricas de las aperturas de v5 (ids con prefijo propio para que `buildLineRules` las
 * tome como respaldo): oscila primero, hoja pasiva francesa, pivotantes, osciloparalela, corredera
 * paralela y plegables. Cantidades por hoja; los kits por ancho siguen research 25 L11/L12.
 */
function v5HardwareRules(): HardwareRule[] {
  return [
    { id: 'fz.r.tbt', openings: ['tilt_turn'], itemId: 'fz.kit-tbt', qty: 1, sequence: 'tilt_first' },
    { id: 'fz.r.pasiva', openings: PASSIVE_WINDOW_OPENINGS, itemId: 'fz.pasador-pasiva', qty: 1, leaf: 'passive' },
    { id: 'fz.r.pasiva-puerta', openings: ['door'], itemId: 'fz.pasador-puerta-pasiva', qty: 1, leaf: 'passive' },
    { id: 'fz.r.pivot-v', openings: ['pivot_v'], itemId: 'fz.kit-pivot-v', qty: 1 },
    { id: 'fz.r.pivot-h', openings: ['pivot_h'], itemId: 'fz.kit-pivot-h', qty: 1 },
    ...rangedRules('fz.r.psk', ['tilt_slide'], PSK_RANGES.map(([min, max]) => ({ itemId: `fz.kit-psk-${min}-${max}`, min, max })), 'width'),
    ...rangedRules('fz.r.paralela', ['parallel_slide'], PS_RANGES.map(([min, max]) => ({ itemId: `fz.kit-paralela-${min}-${max}`, min, max })), 'width'),
    { id: 'fz.r.plegable', openings: ['folding'], itemId: 'fz.kit-hoja-plegable', qty: 1 },
    { id: 'fz.r.plegable-cierre', openings: ['folding'], itemId: 'fz.cierre-plegable', qty: 1, leaf: 'active' },
    { id: 'fz.r.plegable-pasador', openings: ['folding'], itemId: 'fz.pasador-plegable', qty: 1, leaf: 'passive' },
  ]
}

/**
 * Extras de la ventana (solo cuando el diseño los pide, `AccessoryRule.extra`): persiana (cortina
 * por m², cajón por metro de ancho según tipo, 2 guías por metro de alto, accionamiento por
 * ventana), mosquitero según tipo, alféizar por metro de ancho y tapas de umbral.
 */
export const GENERIC_EXTRA_ACCESSORY_RULES: AccessoryRule[] = [
  { id: 'fz.x.persiana-cortina', itemId: 'fz.persiana-cortina', per: 'area_m2', qty: 1, extra: 'rollerShutter' },
  { id: 'fz.x.persiana-cajon-monoblock', itemId: 'fz.persiana-cajon-monoblock', per: 'width_m', qty: 1, extra: 'rollerShutter', variants: ['monoblock'] },
  { id: 'fz.x.persiana-cajon-exterior', itemId: 'fz.persiana-cajon-exterior', per: 'width_m', qty: 1, extra: 'rollerShutter', variants: ['exterior'] },
  { id: 'fz.x.persiana-cajon-integrado', itemId: 'fz.persiana-cajon-integrado', per: 'width_m', qty: 1, extra: 'rollerShutter', variants: ['integrated'] },
  { id: 'fz.x.persiana-guia', itemId: 'fz.persiana-guia', per: 'height_m', qty: 2, extra: 'rollerShutter' },
  { id: 'fz.x.persiana-cinta', itemId: 'fz.persiana-cinta', per: 'window', qty: 1, extra: 'rollerShutter', variants: ['strap'] },
  { id: 'fz.x.persiana-manivela', itemId: 'fz.persiana-manivela', per: 'window', qty: 1, extra: 'rollerShutter', variants: ['crank'] },
  { id: 'fz.x.persiana-motor', itemId: 'fz.persiana-motor', per: 'window', qty: 1, extra: 'rollerShutter', variants: ['motor'] },
  { id: 'fz.x.mosquitero-fijo', itemId: 'fz.mosquitero-fijo', per: 'area_m2', qty: 1, extra: 'insectScreen', variants: ['fixed'] },
  { id: 'fz.x.mosquitero-abatible', itemId: 'fz.mosquitero-abatible', per: 'sash', qty: 1, extra: 'insectScreen', variants: ['hinged'] },
  { id: 'fz.x.mosquitero-corredero', itemId: 'fz.mosquitero-corredero', per: 'sash', qty: 1, extra: 'insectScreen', variants: ['sliding'] },
  { id: 'fz.x.mosquitero-enrollable', itemId: 'fz.mosquitero-enrollable', per: 'window', qty: 1, extra: 'insectScreen', variants: ['roller'] },
  { id: 'fz.x.mosquitero-plisado', itemId: 'fz.mosquitero-plisado', per: 'area_m2', qty: 1, extra: 'insectScreen', variants: ['pleated'] },
  { id: 'fz.x.alfeizar', itemId: 'fz.alfeizar', per: 'width_m', qty: 1, extra: 'sill' },
  { id: 'fz.x.tapa-umbral', itemId: 'fz.tapa-umbral', per: 'window', qty: 1, extra: 'threshold' },
]

/**
 * Paneles ciegos (`fill: 'panel'`): el panel se cotiza por m² de relleno (`scope: 'panels'`), sea cual
 * sea la ventana que lo lleve. Sin paneles en el diseño la regla vale cero: no cambia ningún precio.
 */
export const GENERIC_PANEL_ACCESSORY_RULES: AccessoryRule[] = [
  { id: 'fz.p.panel-ciego', itemId: 'fz.panel-ciego', per: 'area_m2', qty: 1, scope: 'panels' },
]

/** Accesorios e insumos comunes a toda ventana (más los extras, que solo aplican si se piden). */
export const GENERIC_ACCESSORY_RULES: AccessoryRule[] = [
  { id: 'fz.a.tornillo-refuerzo', itemId: 'fz.tornillo-refuerzo', per: 'reinforcement_m', qty: 4 },
  { id: 'fz.a.tornillo-instalacion', itemId: 'fz.tornillo-instalacion', per: 'perimeter_m', qty: 2 },
  { id: 'fz.a.calzo', itemId: 'fz.calzo', per: 'glass_m', qty: 1.5 },
  { id: 'fz.a.burlete', itemId: 'fz.burlete', per: 'glass_m', qty: 2 },
  { id: 'fz.a.silicona', itemId: 'fz.silicona', per: 'perimeter_m', qty: 0.2 },
  { id: 'fz.a.tapa-desague', itemId: 'fz.tapa-desague', per: 'window', qty: 2 },
  ...GENERIC_EXTRA_ACCESSORY_RULES,
  ...GENERIC_PANEL_ACCESSORY_RULES,
]

/**
 * Correderas: `OpeningKind` no tiene «corredera»; por convención del motor una hoja
 * móvil toma las reglas con `openings` vacío (los paños fijos solo las que incluyen
 * 'fixed'). La felpa va por metro de perímetro.
 */
export const GENERIC_SLIDING_HARDWARE_RULES: HardwareRule[] = [{ id: 'fz.r.kit-corredera', openings: [], itemId: 'fz.kit-corredera', qty: 1 }]
export const GENERIC_SLIDING_ACCESSORY_RULES: AccessoryRule[] = [{ id: 'fz.a.felpa', itemId: 'fz.felpa', per: 'perimeter_m', qty: 3.5 }]
/**
 * Corredera elevadora (HST): kit por hoja móvil y fijación del paño fijo, solo para paneles de
 * elevadora (`systems`); nunca se mezclan con las reglas de la corredera estándar.
 */
const LIFT_SLIDE: SlidingSystem[] = ['lift_slide']
export const GENERIC_LIFT_SLIDE_HARDWARE_RULES: HardwareRule[] = [
  { id: 'fz.r.kit-elevadora', openings: [], itemId: 'fz.kit-elevadora', qty: 1, systems: LIFT_SLIDE },
  { id: 'fz.r.fijacion-elevadora', openings: ['fixed'], itemId: 'fz.fijacion-elevadora', qty: 1, systems: LIFT_SLIDE },
]

/**
 * Reglas genéricas completas para un tipo de línea. `liftSlide` = línea de corredera elevadora
 * (sus hojas toman el kit de elevadora en vez del de corredera).
 */
export function genericRulesFor(kind: LineKind, options: { liftSlide?: boolean } = {}): { hardwareRules: HardwareRule[]; accessoryRules: AccessoryRule[] } {
  if (kind === 'sliding') {
    return {
      hardwareRules: options.liftSlide ? [...GENERIC_LIFT_SLIDE_HARDWARE_RULES] : [...GENERIC_SLIDING_HARDWARE_RULES],
      accessoryRules: [...GENERIC_SLIDING_ACCESSORY_RULES, ...GENERIC_ACCESSORY_RULES],
    }
  }
  return { hardwareRules: [...GENERIC_HARDWARE_RULES], accessoryRules: [...GENERIC_ACCESSORY_RULES] }
}

// ── Resolución con artículos reales de la marca ──────────────────────────────

const COLOR_WORDS = /MARR|NEGR|INOX|BRONCE|CAFE|NOGAL|ROBLE|GRAFITO|TITANIO|ANTRACITA|PLATA|DORAD/

type Bias = (name: string) => number

function score(candidate: Item, bias: Bias = () => 0): number {
  const name = normalizeKey(candidate.name)
  let value = candidate.price > 0 ? 4 : 0
  if (/BLANC/.test(name)) value += 2
  else if (!COLOR_WORDS.test(name)) value += 1
  else value -= 1
  return value + bias(name)
}

function best(items: Item[], bias?: Bias): Item | undefined {
  return [...items].sort((a, b) => score(b, bias) - score(a, bias) || a.name.length - b.name.length || a.price - b.price)[0]
}

/**
 * Mejor artículo para una función: primero los que tienen precio, recorriendo los catálogos en
 * orden de preferencia (la marca, luego Herrajes genéricos); si ninguno tiene precio, el de la
 * marca, para que el hueco quede a la vista con su aviso en vez de esconderlo.
 */
function find(pools: Item[][], test: (name: string, item: Item) => boolean, bias?: Bias): { item: Item; pool: number } | undefined {
  for (const [index, pool] of pools.entries()) {
    const found = best(pool.filter((candidate) => candidate.price > 0 && test(normalizeKey(candidate.name), candidate)), bias)
    if (found) return { item: found, pool: index }
  }
  for (const [index, pool] of pools.entries()) {
    const found = best(pool.filter((candidate) => test(normalizeKey(candidate.name), candidate)), bias)
    if (found) return { item: found, pool: index }
  }
  return undefined
}

/**
 * Preferencia por artículos que nombran la propia línea (+3) o una línea hermana declarada como
 * compatible (+2), y castigo si nombran solo otra (−3).
 */
function lineBias(lineName?: string, otherLineNames: string[] = [], relatedLineNames: string[] = []): Bias {
  const compact = (value: string) => normalizeKey(value).replace(/[^A-Z0-9]/g, '')
  const own = lineName ? compact(lineName) : ''
  const related = relatedLineNames.map(compact).filter((other) => other.length >= 3 && other !== own)
  const others = otherLineNames.map(compact).filter((other) => other.length >= 3 && other !== own && !related.includes(other))
  return (name) => {
    const text = compact(name)
    if (own.length >= 3 && text.includes(own)) return 3
    if (related.some((other) => text.includes(other))) return 2
    return others.some((other) => text.includes(other)) ? -3 : 0
  }
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** El nombre trae el código como palabra suelta («Tope estanco PRO201» no nombra a PRO20). */
function mentionsCode(name: string, code: string): boolean {
  const token = normalizeKey(code)
  return token.length >= 3 && new RegExp(`(?<![A-Z0-9])${escapeRegExp(token)}(?![A-Z0-9])`).test(name)
}

const SLOT = {
  casementCremona: (n: string) =>
    /CREMONA/.test(n) &&
    /ABAT|\bABA\b|APERTURA (EXTERIOR|INTERIOR)|INTERIOR ABATIR/.test(n) &&
    !/CORR|PUERTA|\bPTA\b|\bOB\b|OSCIL|PROYEC|BALCONERA|CENTRAL|PASIVA|FRONTAL|\bCF\b|MULTIPUNTO|COTA VARIABLE|CILINDRO|KIT/.test(n),
  arm: (n: string) => /BRAZO/.test(n) && /PROYEC/.test(n) && !/ABATIR|REFORZADO/.test(n),
  hinge: (n: string) => /BISAGRA/.test(n) && !/PUERTA|3D|COMPAS|OCULTA|ESQUINA|INTERMEDIA|PLANTILLA|SUPERIOR|SOPORTE|LLAVE|\bOB\b/.test(n),
  strike: (n: string) => /CERRADERO/.test(n) && !/CORR|PUERTA|\bPTA\b|CENTRAL|DOBLE HOJA|BASCULA|PASADOR|PESTILLO|HORIZONTAL|SOPORTE|PLANO/.test(n),
  handle: (n: string) => /MANILLA/.test(n) && !/PUERTA|\bPTA\b|CORREDERA|MOSQUITERO|DOBLE|GUARNICION|ESPECIAL|LLAVE|WC|MONOBLOCK/.test(n),
  doorHinge: (n: string) => /BISAGRA/.test(n) && /PUERTA|3D/.test(n) && !/PLANTILLA|LLAVE/.test(n),
  doorLock: (n: string) => /MULTIPUNTO|CERRADURA|CREMONA (CF )?PUERTA|CREMONA PTA|BALCONERA/.test(n) && !/CORREDERA|CERRADERO/.test(n),
  cylinder: (n: string) => /CILINDRO/.test(n) && !/KIT|CREMONA|TIRADOR|CORREDERA/.test(n),
  doorHandle: (n: string) => /MANILLA/.test(n) && /PUERTA|\bPTA\b|MONOBLOCK|DOBLE MANILLA/.test(n),
  doorExtension: (n: string) => /EXTENSION/.test(n) && /PUERTA|\bPTA\b/.test(n) && !/CORR/.test(n),
  carriage: (n: string) => /CARRO/.test(n) && !/MOSQUITERO|FALSO|SUPLE|AMERICANA|PLEGABLE|PUERTA|KIT/.test(n),
  slidingCremona: (n: string) => /CREMONA/.test(n) && /CORR/.test(n) && !/CILINDRO|KIT|MOSQUITERO/.test(n),
  slidingHandle: (n: string) =>
    /MANILLA/.test(n) && !/PUERTA|\bPTA\b|MOSQUITERO|DOBLE|GUARNICION|ESPECIAL|LLAVE|WC|MONOBLOCK|PARCHE|KIT|CREMONA|TIRADOR|OSCILO/.test(n),
  slidingStrike: (n: string) => /CERRADERO/.test(n) && /CORR/.test(n) && !/SOPORTE|CALZO/.test(n),
  stop: (n: string) => /TOPE ESTANCO/.test(n),
  brush: (n: string) => /FELPA/.test(n) && !/MOSQUITERO/.test(n),
  reinforcementScrew: (n: string) => /TORNILLO/.test(n) && /3[.,][69]\s*X\s*19/.test(n) && !/TAPA/.test(n),
  reinforcementScrewAlt: (n: string) => /TORNILLO/.test(n) && /3[.,][69]\s*X\s*(13|16|25)/.test(n) && !/TAPA/.test(n),
  installScrew: (n: string) => /TORNILLO/.test(n) && /INST|AMO/.test(n) && !/TAPA/.test(n),
  screwCap: (n: string) => /TAPA/.test(n) && /TORNILLO/.test(n),
  hardwareScrew: (n: string) => /TORNILLO/.test(n) && /4[.,]1\s*X\s*25/.test(n) && !/TAPA/.test(n),
  hardwareScrewAlt: (n: string) => /TORNILLO/.test(n) && /4[.,]1\s*X\s*19/.test(n) && !/TAPA/.test(n),
  glazingBridge: (n: string) => /PUENTE/.test(n) && /ACRISTAL/.test(n),
  mullionConnector: (n: string) => /CONECTOR/.test(n) && /METALIC|BARRA T|TRAVES/.test(n) && !/MONO ?RR?IEL|CORR/.test(n),
  // El calzo del cerradero o del carro de corredera no es de acristalar.
  setting: (n: string) => /CALZO|CALZA ACRIST/.test(n) && !/CERRADERO|CARRO|MOSQUITERO/.test(n),
  silicone: (n: string) => /SILICONA/.test(n) && /NEUTRA/.test(n),
  drainCap: (n: string) => /DESAGUE/.test(n),
  gasket: (n: string) => /BURLETE|JUNTA (DE )?VIDRIO|EPDM/.test(n) && !/MOSQUITERO/.test(n),
}

/** Manilla de corredera: la que lo dice; si no, la recta (OT 385 V4 y V6). */
const SLIDING_HANDLE_BIAS: Bias = (n) => (/CORR/.test(n) ? 2 : 0) + (/RECTA/.test(n) ? 1 : 0)
/** Felpa con aleta plástica (OT 385: «Felpa 7×8 negra c/plástico»); el color no se ve. */
const BRUSH_BIAS: Bias = (n) => (/CON PLASTICO|C\/ ?PLASTICO/.test(n) ? 3 : 0)
/** Carro doble (OT 385 V4 y V6: «Carro doble» × 2 por hoja). */
const CARRIAGE_BIAS: Bias = (n) => (/DOBLE/.test(n) ? 1 : 0)
/** El cerradero plano es de otro sistema de cierre: solo si no hay otro. */
const SLIDING_STRIKE_BIAS: Bias = (n) => (/PLANO/.test(n) ? -2 : 0)
/**
 * Calzo de acristalar de 5 mm × 26 (OT 385: «Calzo 5 mm 26×100»), no el ajustable de 18 mm, que
 * cuesta casi el triple y es para otra holgura.
 */
const SETTING_BIAS: Bias = (n) =>
  (/\b5\s*MM\b/.test(n) ? 2 : 0) + (/26\s*X\s*100/.test(n) ? 1 : 0) + (/ACRIST/.test(n) ? 1 : 0) - (/AJUSTABLE/.test(n) ? 2 : 0)
/** La manilla de puerta con llave ya trae la cerradura: no lleva cilindro aparte (OT 385 V1). */
const KEYED = /C\/ ?LLAVE|CON LLAVE/

/**
 * Artículos con rango de alto en el nombre (cremonas), del primer catálogo que tenga
 * al menos dos, de una sola familia de entrada (E15, E25…) para no duplicar.
 */
/** Artículo con rango en el nombre; `max` vacío = sin tope («2000-2001/CV», cota variable). */
interface RangedItem {
  itemId: string
  min: number
  max?: number
  pool: number
}

function rangedFamily(pools: Item[][], test: (name: string) => boolean, bias: Bias): RangedItem[] {
  // Primero una familia completa con precio; si no hay, la primera que exista (con su hueco a la vista).
  for (const pricedOnly of [true, false]) {
    const found = rangedFamilyIn(pools, test, bias, pricedOnly)
    if (found.items.length) return [...found.items, ...familyEnds(found, pools, test, bias)]
  }
  return []
}

/**
 * Tramos que la familia de la marca no trae en los extremos, tomados de los catálogos siguientes
 * (Herrajes genéricos), de la misma entrada si la hay (E25 con E25): Proline vende la cremona de
 * abatir E25 solo hasta 1.400 mm, y sin esto una abatible de 1.500 de alto (hoja de 1.428) se
 * cotizaba sin cremona y sin aviso, porque las bisagras sí calzaban. Solo se agregan tramos con
 * precio que quedan enteros por debajo del primero o por encima del último; los intermedios ya los
 * cubre `rangedRules`.
 */
function familyEnds(found: { items: RangedItem[]; backset: string }, pools: Item[][], test: (name: string) => boolean, bias: Bias): RangedItem[] {
  const { items } = found
  if (!items.length) return []
  const pool = items[0].pool
  const bottom = Math.min(...items.map((entry) => entry.min))
  const top = items.some((entry) => entry.max === undefined) ? undefined : Math.max(...items.map((entry) => entry.max!))
  type Candidate = { item: Item; min: number; max?: number; pool: number }
  /** Por entrada (E15, E25…) y tramo; el primer catálogo de respaldo manda y, dentro de él, el mejor artículo. */
  const byBackset = new Map<string, Map<string, Candidate>>()
  for (const [poolIndex, list] of pools.entries()) {
    if (poolIndex <= pool) continue
    for (const candidate of list) {
      if (!(candidate.price > 0) || !test(normalizeKey(candidate.name))) continue
      const range = parseRange(candidate.name)
      if (!range) continue
      const max = range.open ? undefined : range.max
      const below = max !== undefined && max <= bottom + 1
      const above = top !== undefined && range.min >= top - 1
      if (!below && !above) continue
      const backset = found.backset === '?' ? '?' : (parseBackset(candidate.name) ?? '?')
      const group = byBackset.get(backset) ?? new Map<string, Candidate>()
      byBackset.set(backset, group)
      const key = `${range.min}-${max ?? 'libre'}`
      const current = group.get(key)
      if (!current || (current.pool === poolIndex && score(candidate, bias) > score(current.item, bias))) group.set(key, { item: candidate, min: range.min, max, pool: poolIndex })
    }
  }
  // La misma entrada; si el respaldo no la tiene (Winhouse E22), la entrada con más tramos.
  const chosen = byBackset.get(found.backset) ?? [...byBackset.values()].sort((a, b) => b.size - a.size)[0]
  return [...(chosen?.values() ?? [])].map(({ item: entry, min, max, pool: poolIndex }) => ({ itemId: entry.id, min, ...(max === undefined ? {} : { max }), pool: poolIndex }))
}

function rangedFamilyIn(pools: Item[][], test: (name: string) => boolean, bias: Bias, pricedOnly: boolean): { items: RangedItem[]; backset: string } {
  for (const [poolIndex, fullPool] of pools.entries()) {
    const pool = pricedOnly ? fullPool.filter((candidate) => candidate.price > 0) : fullPool
    const ranged = pool
      .filter((candidate) => test(normalizeKey(candidate.name)))
      .map((candidate) => ({ candidate, range: parseRange(candidate.name), backset: parseBackset(candidate.name) ?? '?' }))
      .filter((entry): entry is typeof entry & { range: { min: number; max: number; open?: true } } => entry.range !== undefined)
    if (ranged.length < 2) continue
    const families = new Map<string, typeof ranged>()
    for (const entry of ranged) families.set(entry.backset, [...(families.get(entry.backset) ?? []), entry])
    const family = [...families.values()].sort((a, b) => b.length - a.length)[0]
    const byRange = new Map<string, { item: Item; min: number; max?: number }>()
    for (const entry of family) {
      const max = entry.range.open ? undefined : entry.range.max
      const key = `${entry.range.min}-${max ?? 'libre'}`
      const current = byRange.get(key)
      if (!current || score(entry.candidate, bias) > score(current.item, bias)) byRange.set(key, { item: entry.candidate, min: entry.range.min, max })
    }
    return {
      items: [...byRange.values()].map(({ item: found, min, max }) => ({ itemId: found.id, min, ...(max === undefined ? {} : { max }), pool: poolIndex })),
      backset: family[0].backset,
    }
  }
  return { items: [], backset: '?' }
}

export interface ResolvedRules {
  hardwareRules: HardwareRule[]
  accessoryRules: AccessoryRule[]
  /** Ids de ítems genéricos usados como respaldo (deben existir en el catálogo). */
  genericItemIds: string[]
  /** Funciones cubiertas con artículos de la marca y con genéricos. */
  fromBrand: string[]
  fromGeneric: string[]
  /** Funciones cubiertas con artículos de otro catálogo de proveedor (Herrajes genéricos). */
  fromOtherCatalog: string[]
}

/** Opciones de `buildLineRules`: nombres y códigos que sirven para elegir el artículo de la línea. */
export interface LineRuleOptions {
  lineName?: string
  otherLineNames?: string[]
  /** Líneas hermanas cuyos herrajes sirven si no hay uno que nombre a esta (PROSLD84 → PROSLD70). */
  relatedLineNames?: string[]
  /** Códigos de los perfiles de la línea (marco, hoja): «Tope estanco PRO201» es de PROSLD70. */
  ownCodes?: string[]
  /** Códigos de los perfiles de las otras líneas de la marca. */
  otherCodes?: string[]
  /**
   * Colores de la línea: con ellos cada regla lleva la variante del artículo que va con la ventana
   * (`byColor`): manilla y bisagra marrones en winchester, tapas negras en antracita…
   */
  colorIds?: string[]
  /** Línea de corredera elevadora (HST): kit de elevadora genérico en vez de carros de corredera. */
  liftSlide?: boolean
}

// ── Variantes por color ─────────────────────────────────────────────────────────

type VariantTone = 'blanco' | 'marron' | 'toffe' | 'negro' | 'gris'

const TONE_WORDS: [RegExp, VariantTone][] = [
  [/\bTOFF?EE?\b/, 'toffe'],
  [/\bMARRON\b|\bCAFE\b/, 'marron'],
  [/\bNEGR[OA]\b/, 'negro'],
  [/\bGRIS\b/, 'gris'],
  [/\bBLANC[OA]\b/, 'blanco'],
]
const TONE_PATTERN = /\b(TOFF?EE?|MARRON|CAFE|NEGR[OA]|GRIS|BLANC[OA])\b/g

/** Tono del artículo según su nombre (el primero que nombra). */
function itemTone(name: string): VariantTone | undefined {
  const key = normalizeKey(name)
  return TONE_WORDS.find(([pattern]) => pattern.test(key))?.[1]
}

/** Nombre sin código de proveedor al inicio ni color: «T02940107 doble manilla blanca c/llave» → «DOBLE MANILLA C/LLAVE». */
function variantKey(name: string): string {
  return normalizeKey(name)
    .replace(/^\(?[A-Z]?\d[\dA-Z.]{5,}\)?\s+/, '')
    .replace(TONE_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const WOOD_COLOR = /nogal|roble|winchester|caoba|embero|colonial|anteak|lenga|wengu|terra|bronce|cerezo|madera|pino/
const DARK_COLOR = /negro|antracita|grafito|gris|titanio|peltre/

/**
 * Tonos aceptables para un color de ventana, en orden. Los foliados madera llevan marrón (y la
 * silicona toffee); si la marca no tiene marrón, negro (OT 385: V1 winchester con bisagra y doble
 * manilla marrones y silicona toffee; V4 winchester con tope estanco negro; V9 antracita con
 * tapas y silicona negras). El blanco usa el artículo de la regla.
 */
function tonesFor(colorId: string): VariantTone[] {
  if (WOOD_COLOR.test(colorId)) return ['toffe', 'marron', 'negro']
  if (DARK_COLOR.test(colorId)) return ['negro', 'gris']
  return []
}

/**
 * Agrega `byColor` a las reglas cuyo artículo blanco (o sin color) tiene hermanos de color en la
 * misma lista: mismo nombre salvo el código inicial y el color, mismo tipo y con precio.
 */
function withColorVariants<T extends HardwareRule | AccessoryRule>(rules: T[], pools: Item[][], colorIds: readonly string[]): T[] {
  if (!colorIds.some((colorId) => tonesFor(colorId).length)) return rules
  const byId = new Map<string, { item: Item; pool: Item[] }>()
  for (const pool of pools) for (const candidate of pool) if (!byId.has(candidate.id)) byId.set(candidate.id, { item: candidate, pool })
  const cache = new Map<string, Record<string, string> | undefined>()
  const variantsFor = (itemId: string): Record<string, string> | undefined => {
    if (cache.has(itemId)) return cache.get(itemId)
    let result: Record<string, string> | undefined
    const found = byId.get(itemId)
    const tone = found ? itemTone(found.item.name) : undefined
    if (found && (tone === undefined || tone === 'blanco')) {
      const key = variantKey(found.item.name)
      const siblings = new Map<VariantTone, Item>()
      for (const candidate of found.pool) {
        if (candidate.id === itemId || candidate.kind !== found.item.kind || !(candidate.price > 0)) continue
        const candidateTone = itemTone(candidate.name)
        if (!candidateTone || candidateTone === 'blanco' || variantKey(candidate.name) !== key) continue
        const current = siblings.get(candidateTone)
        if (!current || candidate.price < current.price) siblings.set(candidateTone, candidate)
      }
      if (siblings.size) {
        const map: Record<string, string> = {}
        for (const colorId of colorIds) {
          const sibling = tonesFor(colorId).map((wanted) => siblings.get(wanted)).find(Boolean)
          if (sibling) map[colorId] = sibling.id
        }
        if (Object.keys(map).length) result = map
      }
    }
    cache.set(itemId, result)
    return result
  }
  return rules.map((rule) => {
    const byColor = variantsFor(rule.itemId)
    return byColor ? { ...rule, byColor } : rule
  })
}

/**
 * Reglas de herrajes y accesorios para una línea. `pools` son listas de artículos en
 * orden de preferencia (la marca primero, luego un catálogo genérico de herrajes).
 *
 * Cantidades calibradas con la OT 385 (research 06 §4): tornillos de instalación y sus tapas 20 por
 * ventana; tornillos de refuerzo 18 por marco y 18 por hoja en practicables (V1, V7 y V8) y 12 por
 * hoja en correderas (V4 y V6); puentes de acristalamiento y calzos 2 por ventana y 6 por hoja (8 por
 * hoja de corredera); conectores metálicos 2 por travesaño; tornillos de herrajes 10 por hoja; tapas
 * de desagüe 2 por ventana (2 por hoja de corredera); topes estancos 2 por corredera.
 *
 * La OT no es pareja en todo: V9 (dos fijos) lleva 36 tornillos de refuerzo y 4 puentes, mientras que
 * V8 (fijo + hoja) lleva 36 y 8. Se sigue la regla que cuadra con más ventanas (V9 queda con 18 y 2).
 */
export function buildLineRules(kind: LineKind, pools: Item[][], idPrefix: string, options: LineRuleOptions = {}): ResolvedRules {
  const bias = lineBias(options.lineName, options.otherLineNames, options.relatedLineNames)
  const ownCodes = (options.ownCodes ?? []).filter(Boolean)
  const otherCodes = (options.otherCodes ?? []).filter((code) => code && !ownCodes.includes(code))
  /** No nombra solo otras líneas (los puentes y topes son de un sistema: mejor ninguno que uno ajeno). */
  const fitsLine = (name: string) => bias(name) >= 0
  /** Si nombra códigos de perfil, que sean los de esta línea. */
  const fitsCodes = (name: string) => ownCodes.some((code) => mentionsCode(name, code)) || !otherCodes.some((code) => mentionsCode(name, code))
  const ownCodeBias: Bias = (name) => (ownCodes.some((code) => mentionsCode(name, code)) ? 4 : 0)
  const withBias = (extra?: Bias): Bias => (extra ? (name) => bias(name) + extra(name) : bias)
  const pick = (test: (name: string, item: Item) => boolean, extra?: Bias) => find(pools, test, withBias(extra))?.item
  const fromOtherCatalog: string[] = []
  const fromBrand: string[] = []
  const fromGeneric: string[] = []
  /** Busca el artículo y anota de qué catálogo salió. */
  const origin = (label: string, test: (name: string, item: Item) => boolean, extra?: Bias): Item | undefined => {
    const found = find(pools, test, withBias(extra))
    if (found) (found.pool > 0 ? fromOtherCatalog : fromBrand).push(label)
    return found?.item
  }
  const hardwareRules: HardwareRule[] = []
  const accessoryRules: AccessoryRule[] = []
  const generic = genericRulesFor(kind, { liftSlide: options.liftSlide })
  const useGeneric = (label: string, predicate: (rule: { id: string }) => boolean) => {
    fromGeneric.push(label)
    hardwareRules.push(...generic.hardwareRules.filter(predicate))
    accessoryRules.push(...generic.accessoryRules.filter(predicate))
  }
  /** Accesorio con una o más cantidades (por ventana + por hoja…); sin artículo, el genérico si hay. */
  const accessory = (itemFound: Item | undefined, amounts: [AccessoryRule['per'], number][], genericId?: string, label = '') => {
    if (itemFound) {
      for (const [per, qty] of amounts) accessoryRules.push({ id: `${idPrefix}.a.${accessoryRules.length + 1}`, itemId: itemFound.id, per, qty })
    } else if (genericId) useGeneric(label, (rule) => rule.id === genericId)
  }

  if (kind === 'casement') {
    const ranged = rangedFamily(pools, SLOT.casementCremona, bias)
    const cremonas = ranged.length >= 2 ? rangedRules(`${idPrefix}.r.cremona`, ['casement'], ranged) : []
    if (cremonas.length) {
      ;(ranged[0].pool > 0 ? fromOtherCatalog : fromBrand).push('cremonas de abatir')
      if (ranged.some((entry) => entry.pool !== ranged[0].pool)) fromOtherCatalog.push('cremonas de abatir más cortas o más largas')
      hardwareRules.push(...cremonas)
      // Proyectante y oscilante cierran con la misma cremona, elegida por el ANCHO de la hoja
      // (OT 385 V7: hoja de 548,5 de ancho → «400-401/600»).
      hardwareRules.push(...rangedRules(`${idPrefix}.r.cremona-ancho`, ['awning', 'tilt'], ranged, 'width'))
    } else useGeneric('cremonas de abatir', (rule) => rule.id.startsWith('fz.r.cremona'))

    useGeneric('kit oscilobatiente', (rule) => rule.id.startsWith('fz.r.ob'))
    useGeneric('kit oscilante', (rule) => rule.id === 'fz.r.oscilante')

    let arms: HardwareRule[] = []
    let armsPool = 0
    for (const [poolIndex, pool] of pools.entries()) {
      const byInches = new Map<number, Item>()
      for (const candidate of pool) {
        const inches = SLOT.arm(normalizeKey(candidate.name)) ? parseInches(candidate.name) : undefined
        if (!inches) continue
        const current = byInches.get(inches)
        if (!current || (candidate.price > 0 && (current.price === 0 || candidate.price < current.price))) byInches.set(inches, candidate)
      }
      if (byInches.size >= 2) {
        arms = armRules(`${idPrefix}.r.brazo`, [...byInches.entries()].map(([inches, found]) => ({ itemId: found.id, inches })))
        armsPool = poolIndex
        break
      }
    }
    if (arms.length) {
      ;(armsPool > 0 ? fromOtherCatalog : fromBrand).push('brazos de proyección')
      hardwareRules.push(...arms)
    } else useGeneric('brazos de proyección', (rule) => rule.id.startsWith('fz.r.brazo'))

    const single = (label: string, test: (name: string) => boolean, build: (itemId: string) => HardwareRule[], genericPrefix: string): Item | undefined => {
      const found = origin(label, test)
      if (found) hardwareRules.push(...build(found.id))
      // Solo los tramos numerados de esa familia: «fz.r.bisagra-1», no «fz.r.bisagra-puerta-1».
      else useGeneric(label, (rule) => rule.id === genericPrefix || new RegExp(`^${escapeRegExp(genericPrefix)}-\\d+$`).test(rule.id))
      return found
    }
    single('bisagras de ventana', SLOT.hinge, (id) => hingeRules(`${idPrefix}.r.bisagra`, id), 'fz.r.bisagra')
    single('cerraderos', SLOT.strike, (id) => brandStrikeRules(`${idPrefix}.r.cerradero`, id), 'fz.r.cerradero')
    single('manilla de ventana', SLOT.handle, (id) => [{ id: `${idPrefix}.r.manilla`, openings: CASEMENT_HANDLE_OPENINGS, itemId: id, qty: 1 }], 'fz.r.manilla')
    single('bisagras de puerta', SLOT.doorHinge, (id) => doorHingeRules(`${idPrefix}.r.bisagra-puerta`, id), 'fz.r.bisagra-puerta')
    single('cerradura de puerta', SLOT.doorLock, (id) => [{ id: `${idPrefix}.r.cerradura`, openings: ['door'], itemId: id, qty: 1 }], 'fz.r.cerradura')
    const doorHandle = single('manilla de puerta', SLOT.doorHandle, (id) => [{ id: `${idPrefix}.r.manilla-puerta`, openings: ['door'], itemId: id, qty: 1 }], 'fz.r.manilla-puerta')
    // La manilla con llave ya cierra con llave: sin cilindro aparte (OT 385 V1).
    if (!doorHandle || !KEYED.test(normalizeKey(doorHandle.name))) {
      single('cilindro', SLOT.cylinder, (id) => [{ id: `${idPrefix}.r.cilindro`, openings: ['door'], itemId: id, qty: 1 }], 'fz.r.cilindro')
    }
    // Extensiones de la cremona balconera: 2 por puerta (OT 385 V1).
    const extension = origin('extensiones de puerta', SLOT.doorExtension)
    if (extension) hardwareRules.push({ id: `${idPrefix}.r.extension-puerta`, openings: ['door'], itemId: extension.id, qty: 2 })
    // Aperturas de v5 sin artículos de marca reconocibles: respaldo genérico de DEKOPEN.
    useGeneric('kit oscila primero', (rule) => rule.id === 'fz.r.tbt')
    useGeneric('pasadores de hoja pasiva', (rule) => rule.id === 'fz.r.pasiva' || rule.id === 'fz.r.pasiva-puerta')
    useGeneric('kits de pivotante', (rule) => rule.id.startsWith('fz.r.pivot-'))
    useGeneric('kits de osciloparalela', (rule) => /^fz\.r\.psk-\d+$/.test(rule.id))
    useGeneric('kits de corredera paralela', (rule) => /^fz\.r\.paralela-\d+$/.test(rule.id))
    useGeneric('herrajes de plegable', (rule) => rule.id.startsWith('fz.r.plegable'))
  } else if (options.liftSlide) {
    useGeneric('kit de corredera elevadora', (rule) => rule.id.startsWith('fz.r.') && (rule.id.includes('elevadora')))
    accessory(origin('felpa', SLOT.brush, BRUSH_BIAS), [['perimeter_m', 3.5]], 'fz.a.felpa', 'felpa')
  } else {
    // Hojas móviles de corredera: reglas con `openings` vacío (convención del motor); los paños
    // fijos toman solo las que incluyen 'fixed'.
    const carriage = origin('carros de corredera', SLOT.carriage, CARRIAGE_BIAS)
    if (carriage) {
      hardwareRules.push({ id: `${idPrefix}.r.carro`, openings: [], itemId: carriage.id, qty: 2 })
      const ranged = rangedFamily(pools, SLOT.slidingCremona, bias)
      if (ranged.length >= 2) {
        const shift = (value: number | undefined) => (value === undefined ? undefined : value + SLIDING_CREMONA_OFFSET)
        hardwareRules.push(...rangedRules(`${idPrefix}.r.cremona`, [], ranged.map((range) => ({ ...range, min: shift(range.min), max: shift(range.max) }))))
      } else {
        // Cremona de rango medio (800–1000 mm de hoja), o la que haya.
        const midRange = (candidate: Item) => {
          const range = parseRange(candidate.name)
          return Boolean(range && range.min <= 1000 && range.max >= 800)
        }
        const cremona = pick((name, candidate) => SLOT.slidingCremona(name) && midRange(candidate)) ?? pick(SLOT.slidingCremona)
        if (cremona) hardwareRules.push({ id: `${idPrefix}.r.cremona`, openings: [], itemId: cremona.id, qty: 1 })
      }
      // Una manilla por hoja móvil (OT 385 V4 y V6: manilla recta × 2).
      const handle = origin('manilla de corredera', SLOT.slidingHandle, SLIDING_HANDLE_BIAS)
      if (handle) hardwareRules.push({ id: `${idPrefix}.r.manilla`, openings: [], itemId: handle.id, qty: 1 })
      // La cremona de una hoja móvil cierra contra la otra hoja; el cerradero va en el paño fijo
      // (OT 385: V4 y V6 sin cerradero; monorriel V3 con 2).
      const strike = pick(SLOT.slidingStrike, SLIDING_STRIKE_BIAS)
      if (strike) hardwareRules.push({ id: `${idPrefix}.r.cerradero`, openings: ['fixed'], itemId: strike.id, qty: 2 })
    } else useGeneric('kit de corredera', (rule) => rule.id === 'fz.r.kit-corredera')
    accessory(origin('felpa', SLOT.brush, BRUSH_BIAS), [['perimeter_m', 3.5]], 'fz.a.felpa', 'felpa')
    // Topes estancos del marco de la línea: 2 por corredera (OT 385 V3, V4 y V6).
    accessory(origin('topes estancos', (name) => SLOT.stop(name) && fitsLine(name) && fitsCodes(name), ownCodeBias), [['window', 2]])
  }

  const sliding = kind === 'sliding'
  accessory(
    origin('tornillos de refuerzo', SLOT.reinforcementScrew) ?? origin('tornillos de refuerzo', SLOT.reinforcementScrewAlt),
    sliding ? [['sash', 12]] : [['window', 18], ['sash', 18]],
    'fz.a.tornillo-refuerzo',
    'tornillos de refuerzo',
  )
  accessory(origin('tornillos de instalación', SLOT.installScrew), [['window', 20]], 'fz.a.tornillo-instalacion', 'tornillos de instalación')
  accessory(origin('tapas de tornillo', SLOT.screwCap), [['window', 20]])
  accessory(origin('tornillos de herrajes', SLOT.hardwareScrew) ?? origin('tornillos de herrajes', SLOT.hardwareScrewAlt), [['sash', 10]])
  // Puentes y calzos van de a pares en la OT 385 (V1 8 y 8, V6 16 y 16, V7 14 y 14, V8 8 y 8).
  const glazing: [AccessoryRule['per'], number][] = sliding ? [['sash', 8]] : [['window', 2], ['sash', 6]]
  accessory(origin('calzos', SLOT.setting, SETTING_BIAS), glazing, 'fz.a.calzo', 'calzos')
  accessory(origin('puentes de acristalamiento', (name) => SLOT.glazingBridge(name) && fitsLine(name)), glazing)
  // Conector metálico del travesaño al marco: 2 por travesaño fijo (OT 385 V1, V7 y V8; a V9 le faltaron).
  if (!sliding) accessory(origin('conectores de travesaño', (name) => SLOT.mullionConnector(name) && fitsLine(name)), [['mullion', 2]])
  accessory(origin('silicona', SLOT.silicone), [['perimeter_m', 0.2]], 'fz.a.silicona', 'silicona')
  accessory(origin('tapas de desagüe', SLOT.drainCap), [sliding ? ['sash', 2] : ['window', 2]], 'fz.a.tapa-desague', 'tapas de desagüe')
  accessory(origin('burlete', SLOT.gasket), [['glass_m', 2]])
  // Persianas, mosquiteros, alféizar y umbral: solo se cotizan si el diseño los pide.
  useGeneric('persianas, mosquiteros y alféizar', (rule) => rule.id.startsWith('fz.x.'))
  // Paneles ciegos: se cotizan por m² de panel solo si el diseño tiene alguno.
  useGeneric('paneles ciegos', (rule) => rule.id.startsWith('fz.p.'))
  // Manilla, cremona y cerradura de marca solo en la hoja activa: la pasiva lleva pasadores.
  const activeOnly = new RegExp(`^${escapeRegExp(idPrefix)}\\.r\\.(cremona-\\d+|manilla|cerradura|cilindro|manilla-puerta|extension-puerta)$`)
  for (const [index, rule] of hardwareRules.entries()) if (!rule.leaf && activeOnly.test(rule.id)) hardwareRules[index] = { ...rule, leaf: 'active' }

  const genericItemIds = [
    ...new Set([...hardwareRules, ...accessoryRules].map((rule) => rule.itemId).filter((id) => id.startsWith('fz.'))),
  ]
  const external = new Set(fromOtherCatalog)
  const colorIds = options.colorIds ?? []
  return {
    hardwareRules: withColorVariants(hardwareRules, pools, colorIds),
    accessoryRules: withColorVariants(accessoryRules, pools, colorIds),
    genericItemIds,
    fromBrand: [...new Set(fromBrand)].filter((label) => !external.has(label)),
    fromGeneric: [...new Set(fromGeneric)],
    fromOtherCatalog: [...external],
  }
}

// ── Continuidad de los tramos ───────────────────────────────────────────────────

export interface HardwareRangeGap {
  /** Familia de reglas (id sin el número de tramo: «proline.prosld70.r.cremona»). */
  family: string
  openings: OpeningKind[]
  dimension: 'height' | 'width'
  /** Hueco entre dos tramos consecutivos (mm). */
  from: number
  to: number
}

/**
 * Huecos entre tramos consecutivos de una misma familia de reglas (cremonas por alto, brazos…):
 * una hoja que cae en el hueco se cotizaría sin ese herraje. Cada familia se revisa por separado
 * porque otras reglas (bisagras) cubren todas las medidas y esconderían el hueco.
 */
export function hardwareRangeGaps(rules: readonly HardwareRule[]): HardwareRangeGap[] {
  const families = new Map<string, { family: string; openings: OpeningKind[]; dimension: 'height' | 'width'; ranges: [number, number][] }>()
  for (const rule of rules) {
    for (const dimension of ['height', 'width'] as const) {
      const min = dimension === 'height' ? rule.minHeight : rule.minWidth
      const max = dimension === 'height' ? rule.maxHeight : rule.maxWidth
      if (min === undefined && max === undefined) continue
      const family = rule.id.replace(/-\d+$/, '')
      const key = `${family}|${[...rule.openings].sort().join(',')}|${dimension}`
      const entry = families.get(key) ?? { family, openings: rule.openings, dimension, ranges: [] }
      entry.ranges.push([min ?? Number.NEGATIVE_INFINITY, max ?? Number.POSITIVE_INFINITY])
      families.set(key, entry)
    }
  }
  const gaps: HardwareRangeGap[] = []
  for (const { family, openings, dimension, ranges } of families.values()) {
    const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1])
    let reach = sorted[0][1]
    for (const [min, max] of sorted.slice(1)) {
      // Contiguos = el siguiente empieza a lo más 0,1 mm después (los tramos son inclusivos).
      if (min > reach + 0.1 + 1e-6) gaps.push({ family, openings, dimension, from: reach, to: min })
      reach = Math.max(reach, max)
    }
  }
  return gaps
}
