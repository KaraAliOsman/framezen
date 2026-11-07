/**
 * Catálogo de prueba para las aperturas, formas y extras de v5. Parte del catálogo Proline de
 * prueba (geometría verificada) y le agrega perfiles y reglas ficticias con precios redondos e
 * inventados: inversor, umbral, riel de plegable, una línea elevadora y herrajes por apertura.
 */
import type { AccessoryRule, Catalog, HardwareRule, Item, Line, Profile } from '../../src/types'
import { ITEMS, PRO6004, PROFILES, PROSLD70, prolineCatalog } from './fixtures'

const prof = (p: Omit<Profile, 'barLength'>): Profile => ({ barLength: 5800, ...p })
/** Cara vista del acople de prueba. */
export const V7_COUPLER_FACE = 22
const all = (price: number) => ({ blanco: price, winchester: price, antracita: price })

const EXTRA_PROFILES: Profile[] = [
  prof({ id: 'INV', lineId: 'pro6004', code: 'INV-01', name: 'Inversor', role: 'french_mullion', face: 60, priceByColor: all(15000) }),
  prof({ id: 'UMB', lineId: 'pro6004', code: 'UMB-01', name: 'Umbral aluminio', role: 'threshold', face: 20, priceByColor: all(12000) }),
  prof({ id: 'GUI', lineId: 'pro6004', code: 'GUI-01', name: 'Riel de plegable', role: 'guide', priceByColor: all(6000) }),
  // Conjuntos (v7): acople, postes con el nombre con que vienen en los catálogos reales, y refuerzo.
  prof({ id: 'ACOP', lineId: 'pro6004', code: 'ACOP-22', name: 'Acople', role: 'coupler', face: V7_COUPLER_FACE, priceByColor: all(9800) }),
  prof({ id: 'POST-90', lineId: 'pro6004', code: 'POST-90', name: 'Pilar Esquinero 90°', role: 'coupler', face: 40, priceByColor: all(32000), reinforcementId: 'R1' }),
  prof({ id: 'POST-135', lineId: 'pro6004', code: 'POST-135', name: 'Pilar Esquinero 135°', role: 'coupler', face: 40, priceByColor: all(34000), reinforcementId: 'R1' }),
  // Guillotina: hoja propia de la línea de corredera.
  prof({ id: 'GUI-H', lineId: 'prosld70', code: 'GUI-H', name: 'Hoja guillotina', role: 'sliding_sash', face: 80, priceByColor: all(26000) }),
  // Elevadora (HST)
  prof({ id: 'HST-M', lineId: 'hst', code: 'HST-M', name: 'Marco elevadora', role: 'sliding_frame', face: 58, priceByColor: all(60000) }),
  prof({ id: 'HST-H', lineId: 'hst', code: 'HST-H', name: 'Hoja elevadora', role: 'sliding_sash', face: 112, priceByColor: all(70000) }),
  prof({ id: 'HST-T', lineId: 'hst', code: 'HST-T', name: 'Traslapo elevadora', role: 'interlock', priceByColor: all(20000) }),
  prof({ id: 'HST-J', lineId: 'hst', code: 'HST-J', name: 'Junquillo elevadora', role: 'bead', priceByColor: all(7000) }),
  prof({ id: 'HST-G', lineId: 'hst', code: 'HST-G', name: 'Riel elevadora', role: 'guide', priceByColor: all(9000) }),
  prof({ id: 'HST-U', lineId: 'hst', code: 'HST-U', name: 'Umbral elevadora', role: 'threshold', face: 30, priceByColor: all(35000) }),
]

const item = (id: string, name: string, price: number, kind: Item['kind'] = 'hardware', unit: Item['unit'] = 'kit'): Item => ({ id, brandId: 'proline', kind, code: id, name, unit, price })

export const V5_ITEMS: Item[] = [
  item('K-PIVV', 'Kit pivotante vertical', 50000),
  item('K-PIVH', 'Kit pivotante horizontal', 45000),
  item('K-PSK1', 'Kit PSK hasta 1200', 250000),
  item('K-PSK2', 'Kit PSK 1200-2000', 350000),
  item('K-PS', 'Kit corredera paralela', 200000),
  item('K-FOLD', 'Juego hoja plegable', 50000),
  item('K-FOLDA', 'Cierre hoja activa plegable', 30000),
  item('K-FOLDP', 'Pasadores hoja pasiva plegable', 10000),
  item('K-PAS', 'Pasadores hoja pasiva', 9000),
  item('K-TBT', 'Kit oscila primero', 15000),
  item('K-HST', 'Kit elevadora', 400000),
  item('K-HSTF', 'Fijación paño fijo elevadora', 10000),
  item('X-CORT', 'Cortina de persiana', 30000, 'accessory', 'm2'),
  item('X-CAJM', 'Cajón monoblock', 20000, 'accessory', 'm'),
  item('X-CAJE', 'Cajón exterior', 15000, 'accessory', 'm'),
  item('X-GUIA', 'Guía de persiana', 5000, 'accessory', 'm'),
  item('X-MOT', 'Motor de persiana', 90000, 'accessory'),
  item('X-MAN', 'Manivela de persiana', 20000, 'accessory'),
  item('X-MOSF', 'Mosquitero fijo', 20000, 'accessory', 'm2'),
  item('X-MOSP', 'Mosquitero plisado', 55000, 'accessory', 'm2'),
  item('X-MOSA', 'Mosquitero abatible', 40000, 'accessory', 'u'),
  item('X-ALF', 'Alféizar', 12000, 'accessory', 'm'),
  item('X-UMB', 'Tapas de umbral', 7000, 'accessory'),
]

/** Reglas v5 sobre las de PRO6004 (la manilla y la cremona de abatir quedan solo en la hoja activa). */
export const V5_HARDWARE: HardwareRule[] = [
  ...PRO6004.hardwareRules.map((rule) => (rule.id === 'manilla' || rule.id.startsWith('crem-') ? { ...rule, leaf: 'active' as const } : rule)),
  { id: 'piv-v', openings: ['pivot_v'], itemId: 'K-PIVV', qty: 1 },
  { id: 'piv-h', openings: ['pivot_h'], itemId: 'K-PIVH', qty: 1 },
  { id: 'psk-1', openings: ['tilt_slide'], itemId: 'K-PSK1', qty: 1, minWidth: 670, maxWidth: 1200 },
  { id: 'psk-2', openings: ['tilt_slide'], itemId: 'K-PSK2', qty: 1, minWidth: 1200.1, maxWidth: 2000 },
  { id: 'ps', openings: ['parallel_slide'], itemId: 'K-PS', qty: 1 },
  { id: 'fold', openings: ['folding'], itemId: 'K-FOLD', qty: 1 },
  { id: 'fold-a', openings: ['folding'], itemId: 'K-FOLDA', qty: 1, leaf: 'active' },
  { id: 'fold-p', openings: ['folding'], itemId: 'K-FOLDP', qty: 1, leaf: 'passive' },
  { id: 'pasiva', openings: ['casement', 'tilt_turn', 'door'], itemId: 'K-PAS', qty: 1, leaf: 'passive' },
  { id: 'tbt', openings: ['tilt_turn'], itemId: 'K-TBT', qty: 1, sequence: 'tilt_first' },
]

export const V5_ACCESSORIES: AccessoryRule[] = [
  ...PRO6004.accessoryRules,
  { id: 'x-cort', itemId: 'X-CORT', per: 'area_m2', qty: 1, extra: 'rollerShutter' },
  { id: 'x-cajm', itemId: 'X-CAJM', per: 'width_m', qty: 1, extra: 'rollerShutter', variants: ['monoblock'] },
  { id: 'x-caje', itemId: 'X-CAJE', per: 'width_m', qty: 1, extra: 'rollerShutter', variants: ['exterior'] },
  { id: 'x-guia', itemId: 'X-GUIA', per: 'height_m', qty: 2, extra: 'rollerShutter' },
  { id: 'x-mot', itemId: 'X-MOT', per: 'window', qty: 1, extra: 'rollerShutter', variants: ['motor'] },
  { id: 'x-man', itemId: 'X-MAN', per: 'window', qty: 1, extra: 'rollerShutter', variants: ['crank'] },
  { id: 'x-mosf', itemId: 'X-MOSF', per: 'area_m2', qty: 1, extra: 'insectScreen', variants: ['fixed'] },
  { id: 'x-mosp', itemId: 'X-MOSP', per: 'area_m2', qty: 1, extra: 'insectScreen', variants: ['pleated'] },
  { id: 'x-mosa', itemId: 'X-MOSA', per: 'sash', qty: 1, extra: 'insectScreen', variants: ['hinged'] },
  { id: 'x-alf', itemId: 'X-ALF', per: 'width_m', qty: 1, extra: 'sill' },
  { id: 'x-umb', itemId: 'X-UMB', per: 'window', qty: 1, extra: 'threshold' },
]

export const V5_LINE: Line = {
  ...PRO6004,
  profiles: { ...PRO6004.profiles, french_mullion: 'INV', threshold: 'UMB', guide: 'GUI' },
  hardwareRules: V5_HARDWARE,
  accessoryRules: V5_ACCESSORIES,
}

export const HST_LINE: Line = {
  id: 'hst',
  brandId: 'proline',
  name: 'HST 85',
  kind: 'sliding',
  material: 'pvc',
  pauta: { weld: 3, frameDeduction: 58, sashWidth: 112, sashDeduction: 90, sashOverlap: 10, glassGap: 5, mullionDeduction: 20, slidingHeightAdd: 20 },
  profiles: { sliding_frame: 'HST-M', sliding_sash: 'HST-H', interlock: 'HST-T', bead: 'HST-J', guide: 'HST-G', threshold: 'HST-U' },
  colorIds: ['blanco', 'winchester', 'antracita'],
  typologyIds: [],
  hardwareRules: [
    { id: 'hst-kit', openings: [], itemId: 'K-HST', qty: 1, systems: ['lift_slide'] },
    { id: 'hst-fijo', openings: ['fixed'], itemId: 'K-HSTF', qty: 1, systems: ['lift_slide'] },
  ],
  accessoryRules: [{ id: 'x-umb', itemId: 'X-UMB', per: 'window', qty: 1, extra: 'threshold' }],
}

/** Catálogo con la línea practicable v5, la corredera PROSLD70 y la elevadora. */
export function v5Catalog(overrides: Partial<Catalog> = {}): Catalog {
  return prolineCatalog({
    lines: [V5_LINE, PROSLD70, HST_LINE],
    profiles: [...PROFILES, ...EXTRA_PROFILES],
    items: [...ITEMS, ...V5_ITEMS],
    ...overrides,
  })
}

/** Línea de cada tipología en el catálogo v5. */
export const lineFor = (kind: 'casement' | 'sliding', liftSlide = false) => (kind === 'casement' ? 'pro6004' : liftSlide ? 'hst' : 'prosld70')
