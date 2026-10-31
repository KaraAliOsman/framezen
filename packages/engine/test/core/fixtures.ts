/**
 * Catálogo de prueba Proline. Solo la geometría (pautas, caras, rangos de herraje) viene de
 * docs/research (06-documentos-competidor §4–§7, 11-proline-v3, data/proline-v3.json).
 * Los precios son redondos e inventados y los códigos de herrajes/accesorios son ficticios:
 * el repositorio es público y nunca debe llevar listas de precios ni SKU de distribuidores.
 */
import type { Catalog, CutPiece, Glass, HardwareRule, Item, Line, Profile, WindowDesign } from '../../src/types'
import type { LineWithOverrides } from '../../src/core'

const prof = (p: Omit<Profile, 'barLength'> & { barLength?: number }): Profile => ({ barLength: 5800, ...p })

export const COLORS = {
  white: { id: 'blanco', name: 'Blanco', hex: '#F6F5F1', code: 'BL' },
  walnut: { id: 'winchester', name: 'Winchester', hex: '#7A4A2A', code: 'WI' },
  anthracite: { id: 'antracita', name: 'Antracita', hex: '#383E42', code: 'AN' },
}

const all = (white: number, walnut?: number, anthracite?: number): Record<string, number> => {
  const r: Record<string, number> = { blanco: white }
  if (walnut) r.winchester = walnut
  if (anthracite) r.antracita = anthracite
  return r
}

export const PROFILES: Profile[] = [
  // PRO6004
  prof({ id: 'PRO01', lineId: 'pro6004', code: 'PRO01', name: 'Marco DC 60/64', role: 'frame', face: 64, priceByColor: all(20000, 30000, 31000), reinforcementId: 'R1', weightKgM: 1.2 }),
  prof({ id: 'PRO521', lineId: 'pro6004', code: 'PRO521', name: 'Hoja ventana ext. 80', role: 'sash', face: 80, priceByColor: all(25000), reinforcementId: 'R19', weightKgM: 1.2 }),
  // PRO02: el acero real no tiene SKU conocido (research 11): sin reinforcementId.
  prof({ id: 'PRO02', lineId: 'pro6004', code: 'PRO02', name: 'Hoja ventana int. 80', role: 'sash', face: 80, priceByColor: all(25500) }),
  prof({ id: 'PRO03', lineId: 'pro6004', code: 'PRO03', name: 'Travesaño 80', role: 'mullion', face: 80, priceByColor: all(22000, 34000), reinforcementId: 'R1' }),
  prof({ id: 'PRO05', lineId: 'pro6004', code: 'PRO05', name: 'Junquillo 19/20-22', role: 'bead', face: 19, priceByColor: all(5000, 9000, 9500) }),
  prof({ id: 'PRO04', lineId: 'pro6004', code: 'PRO04', name: 'Hoja puerta int. 90', role: 'door_sash', priceByColor: all(48000, 48000), reinforcementId: 'R4' }),
  prof({ id: 'R1', lineId: 'pro6004', code: 'PRO-R1', name: 'Refuerzo múltiple 28×25×28', role: 'reinforcement', priceByColor: { default: 8000 } }),
  prof({ id: 'R4', lineId: 'pro6004', code: 'PRO-R4', name: 'Refuerzo 57×30×57', role: 'reinforcement', priceByColor: { default: 16000 } }),
  prof({ id: 'R19', lineId: 'pro6004', code: 'PRO-R19', name: 'Refuerzo Pro 521', role: 'reinforcement', priceByColor: { default: 8500 } }),
  // PROSLD70
  prof({ id: 'PRO201', lineId: 'prosld70', code: 'PRO201', name: 'Marco corredera 70/52', role: 'sliding_frame', face: 72, priceByColor: all(21000), reinforcementId: 'R5' }),
  prof({ id: 'PRO211', lineId: 'prosld70', code: 'PRO211', name: 'Hoja corredera 48/80', role: 'sliding_sash', face: 80, priceByColor: all(24000, 39000), reinforcementId: 'R18' }),
  prof({ id: 'PRO204', lineId: 'prosld70', code: 'PRO204', name: 'Traslapo 52,5×44,8', role: 'interlock', priceByColor: all(7000, 17000) }),
  prof({ id: 'PRO703', lineId: 'prosld70', code: 'PRO703', name: 'Junquillo 11/20-22', role: 'bead', priceByColor: all(5000, 9000) }),
  prof({ id: 'PRO271', lineId: 'prosld70', code: 'PRO271', name: 'Guía aluminio', role: 'guide', priceByColor: all(3500, 3500) }),
  prof({ id: 'R5', lineId: 'prosld70', code: 'PRO-R5', name: 'Refuerzo 10×42', role: 'reinforcement', priceByColor: { default: 9500 } }),
  prof({ id: 'R18', lineId: 'prosld70', code: 'PRO-R18', name: 'Refuerzo 24×27×24', role: 'reinforcement', priceByColor: { default: 7000 } }),
]

const item = (id: string, name: string, price: number, kind: Item['kind'] = 'hardware', unit: Item['unit'] = 'u', packSize?: number): Item => {
  const it: Item = { id, brandId: 'proline', kind, code: id, name, unit, price }
  if (packSize) it.packSize = packSize
  return it
}

export const ITEMS: Item[] = [
  item('H-C12', 'Cremona abatir E25 1200-1400 3B', 3000),
  item('H-C04', 'Cremona abatir E25 400-600 2B', 1600),
  item('H-B2D', 'Bisagra 2D 100 mm blanca', 1800),
  item('H-R13', 'Cerradero abatir R13', 200),
  item('H-M1', 'Manilla recta blanca', 1700),
  item('H-CB', 'Cremona balconera E30 1700-2200', 5000),
  item('H-B3D', 'Bisagra 3D 105 mm', 6000),
  item('A-T19', 'Tornillo refuerzo 3,9×19', 27000, 'consumable', 'caja', 1000),
  item('A-TD', 'Tapa desagüe', 150, 'accessory'),
  // Conector metálico de travesaño: 2 por travesaño (OT 385 V1, V7, V8; research T06 para V9).
  item('A-CT', 'Conector metálico travesaño PRO6004', 600, 'accessory'),
  // Variantes por color de la OT 385 (V1 Winchester, V9 Antracita).
  item('A-TDB', 'Tapa desagüe blanca', 150, 'accessory'),
  item('A-TDN', 'Tapa desagüe negra', 150, 'accessory'),
  item('S-BL', 'Silicona neutra blanca', 4500, 'consumable', 'cartucho'),
  item('S-NE', 'Silicona neutra negra', 4500, 'consumable', 'cartucho'),
  item('S-TO', 'Silicona neutra toffee', 6000, 'consumable', 'cartucho'),
  item('carro', 'Carro doble PROSLD70', 2000),
  item('cremona-corr', 'Cremona corredera E15 800-1000', 2000),
  item('tope', 'Tope estanco PRO201', 300, 'accessory'),
  item('sin-precio', 'Kit oscilobatiente', 0),
]

/** Kits Vorne de la OT 385 como reglas sueltas (contenido por hoja). */
const PRO6004_HARDWARE: HardwareRule[] = [
  { id: 'crem-1200', openings: ['casement', 'tilt_turn'], itemId: 'H-C12', qty: 1, minWidth: 300, maxWidth: 900, minHeight: 1200, maxHeight: 1400 },
  { id: 'crem-400', openings: ['casement', 'tilt_turn'], itemId: 'H-C04', qty: 1, minWidth: 300, maxWidth: 900, minHeight: 400, maxHeight: 600 },
  // Proyectante: la cremona corre a lo ancho (OT 385, V7: cremona 400-600 en hoja de 548,5 de ancho).
  { id: 'crem-400-aw', openings: ['awning', 'tilt'], itemId: 'H-C04', qty: 1, minWidth: 400, maxWidth: 600 },
  { id: 'bisagra', openings: ['casement'], itemId: 'H-B2D', qty: 3, minWidth: 300, maxWidth: 900 },
  { id: 'cerradero', openings: ['casement'], itemId: 'H-R13', qty: 3 },
  { id: 'cerradero-aw', openings: ['awning'], itemId: 'H-R13', qty: 2 },
  { id: 'manilla', openings: ['casement', 'tilt_turn', 'awning', 'tilt'], itemId: 'H-M1', qty: 1 },
  { id: 'crem-balconera', openings: ['door'], itemId: 'H-CB', qty: 1, minHeight: 1700, maxHeight: 2200 },
  { id: 'bisagra-puerta', openings: ['door'], itemId: 'H-B3D', qty: 3 },
  { id: 'kit-ob', openings: ['tilt_turn'], itemId: 'sin-precio', qty: 1 },
]

export const PRO6004: LineWithOverrides = {
  id: 'pro6004',
  brandId: 'proline',
  name: 'PRO6004',
  kind: 'casement',
  material: 'pvc',
  description: 'Practicable 60 mm, 4 cámaras',
  pauta: {
    weld: 3,
    frameDeduction: 44,
    sashWidth: 80,
    sashDeduction: 60,
    sashOverlap: 8,
    glassGap: 5,
    mullionDeduction: 20,
    reinforcement: { frame: 114, sash: 146, mullion: 20 },
  },
  // Puerta balconera PRO04: ancho 110 / descuento 90 (OT 385 V1); acero R4 = nominal − 102 = corte − 108.
  doorPauta: { sashWidth: 110, sashDeduction: 90, reinforcement: { sash: 108 } },
  // Hoja interior PRO02: junquillo nominal − 107 y acero corte − 64,8 (OT 385 ítem 05).
  sashInPauta: { beadDeduction: 107, reinforcement: { sash: 64.8 } },
  profiles: { frame: 'PRO01', sash: 'PRO521', mullion: 'PRO03', bead: 'PRO05', door_sash: 'PRO04' },
  sashInProfileId: 'PRO02',
  colorIds: ['blanco', 'winchester', 'antracita'],
  typologyIds: [],
  hardwareRules: PRO6004_HARDWARE,
  accessoryRules: [
    { id: 'tornillos-refuerzo', itemId: 'A-T19', per: 'reinforcement_m', qty: 4 },
    { id: 'conector', itemId: 'A-CT', per: 'mullion', qty: 2 },
  ],
  source: 'OT 385 verificada',
  completeness: 'verified',
}

export const PROSLD70: Line = {
  id: 'prosld70',
  brandId: 'proline',
  name: 'PROSLD70',
  kind: 'sliding',
  material: 'pvc',
  pauta: {
    weld: 3,
    frameDeduction: 52,
    sashWidth: 80,
    sashDeduction: 60,
    sashOverlap: 8,
    glassGap: 5,
    mullionDeduction: 20,
    // Marco R5 = luz − 20 = corte − 130; hoja R18 = nominal − 140 = corte − 146 (OT 385 V6).
    reinforcement: { frame: 130, sash: 146 },
  },
  profiles: { sliding_frame: 'PRO201', sliding_sash: 'PRO211', interlock: 'PRO204', guide: 'PRO271', bead: 'PRO703' },
  colorIds: ['blanco', 'winchester'],
  typologyIds: [],
  hardwareRules: [
    { id: 'carros', openings: [], itemId: 'carro', qty: 2 },
    { id: 'cremona', openings: [], itemId: 'cremona-corr', qty: 1 },
    { id: 'manilla', openings: [], itemId: 'H-M1', qty: 1 },
  ],
  accessoryRules: [
    { id: 'tope', itemId: 'tope', per: 'window', qty: 2 },
    { id: 'desague', itemId: 'A-TD', per: 'sash', qty: 2 },
  ],
  source: 'OT 385 verificada',
  completeness: 'verified',
}

export const GLASS: Glass[] = [
  { id: 'dvh-4-12-4', name: 'DVH 4+12+4', kind: 'dvh', thickness: 20, composition: '4 incoloro + 12 cámara + 4 incoloro', pricePerM2: 40000, weightKgM2: 20 },
  { id: 'mono-4', name: 'Incoloro 4 mm', kind: 'mono', thickness: 4, pricePerM2: 10000 },
]

export function prolineCatalog(overrides: Partial<Catalog> = {}): Catalog {
  return {
    colors: Object.values(COLORS),
    brands: [{ id: 'proline', name: 'Proline', kind: 'profiles', country: 'CL', monogram: 'PL' }],
    lines: [PRO6004, PROSLD70],
    profiles: PROFILES,
    items: ITEMS,
    glass: GLASS,
    brandSettings: [],
    ...overrides,
  }
}

/** Plantilla del fabricante: misma pauta con soldadura 2,5 mm por extremo. */
export function manufacturerCatalog(): Catalog {
  const line: LineWithOverrides = {
    ...PRO6004,
    id: 'pro6004-fab',
    name: 'PRO6004 (plantilla fabricante)',
    // Con soldadura 2,5 la plantilla nombra aceros 892 y 788 (= cota − 108 y nominal − 140): con
    // la regla «corte − descuento» del contrato, el descuento de esa plantilla es 113 / 145.
    pauta: { ...PRO6004.pauta, weld: 2.5, reinforcement: { frame: 113, sash: 145, mullion: 20 } },
  }
  return prolineCatalog({ lines: [line] })
}

// ─── Ayudas para las aserciones ─────────────────────────────────────────────

/** [largo, cantidad] de los cortes que cumplen el filtro, ordenados por largo. */
export function lengths(cuts: CutPiece[], filter: Partial<CutPiece>): [number, number][] {
  const keys = Object.keys(filter) as (keyof CutPiece)[]
  const rows = cuts.filter((c) => keys.every((k) => c[k] === filter[k]))
  const map = new Map<number, number>()
  for (const r of rows) map.set(r.length, (map.get(r.length) ?? 0) + r.qty)
  return [...map.entries()].sort((a, b) => a[0] - b[0])
}

export function design(partial: Partial<WindowDesign> & Pick<WindowDesign, 'root' | 'width' | 'height'>): WindowDesign {
  return { version: 1, lineId: 'pro6004', colorId: 'blanco', glassId: 'dvh-4-12-4', ...partial }
}
