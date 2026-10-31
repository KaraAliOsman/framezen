import type { Bom, BrandSettings, Catalog, CutPiece, GlassPiece, ItemLine, Line, WindowDesign } from '../../src/types'

/** Línea PRO6004 mínima (los valores de pauta no se usan en comercio). */
const pro6004: Line = {
  id: 'pro6004',
  brandId: 'proline',
  name: 'PRO6004',
  kind: 'casement',
  material: 'pvc',
  pauta: { weld: 3, frameDeduction: 44, sashWidth: 80, sashDeduction: 60, sashOverlap: 8, glassGap: 5, mullionDeduction: 20 },
  profiles: { frame: 'pro01', bead: 'pro05', mullion: 'pro03', reinforcement: 'r1' },
  colorIds: ['blanco', 'winchester', 'antracita'],
  typologyIds: ['fixed'],
  hardwareRules: [],
  accessoryRules: [],
}

/** Catálogo de prueba con precios redondos inventados (el repositorio es público: nada de listas reales). */
export function makeCatalog(brandSettings: BrandSettings[] = []): Catalog {
  return {
    colors: [
      { id: 'blanco', name: 'Blanco', hex: '#F6F5F1' },
      { id: 'winchester', name: 'Winchester', hex: '#7A4A2A' },
      { id: 'antracita', name: 'Antracita', hex: '#383E42' },
    ],
    brands: [
      { id: 'proline', name: 'Proline', kind: 'profiles' },
      { id: 'vorne', name: 'Vorne', kind: 'hardware' },
      { id: 'generico', name: 'Insumos Genéricos', kind: 'mixed' },
      { id: 'cristales', name: 'Cristales del Sur', kind: 'glass' },
    ],
    lines: [pro6004],
    profiles: [
      { id: 'pro01', lineId: 'pro6004', code: 'PRO01', name: 'Marco 60/64', role: 'frame', barLength: 5800, priceByColor: { blanco: 20000, winchester: 30000, antracita: 31000 }, reinforcementId: 'r1' },
      { id: 'pro05', lineId: 'pro6004', code: 'PRO05', name: 'Junquillo 19/20-22', role: 'bead', barLength: 5800, priceByColor: { blanco: 5000, winchester: 9000 } },
      { id: 'pro03', lineId: 'pro6004', code: 'PRO03', name: 'Travesaño 80', role: 'mullion', barLength: 5800, priceByColor: { blanco: 22000 } },
      { id: 'r1', lineId: 'pro6004', code: 'R1', name: 'Refuerzo marco R1', role: 'reinforcement', barLength: 5800, priceByColor: { '*': 8000 } },
    ],
    items: [
      { id: 'kit-ob', brandId: 'vorne', kind: 'hardware', code: 'KIT-OB', name: 'Kit oscilobatiente', unit: 'kit', price: 12000 },
      { id: 'bisagra', brandId: 'vorne', kind: 'hardware', code: 'BIS3D', name: 'Bisagra 3D', unit: 'u', price: 0 },
      { id: 'cremona', brandId: 'vorne', kind: 'hardware', code: 'CRE-OB', name: 'Cremona OB', unit: 'u', price: 0 },
      { id: 'compas', brandId: 'vorne', kind: 'hardware', code: 'COMP', name: 'Brazo compás', unit: 'u', price: 0 },
      { id: 'tornillo-ref', brandId: 'generico', kind: 'consumable', code: 'T3919', name: 'Tornillo ref. 3,9×19', unit: 'caja', packSize: 1000, price: 27000 },
      { id: 'tornillo-inst', brandId: 'generico', kind: 'consumable', code: 'T7592', name: 'Tornillo instalación 7,5×92', unit: 'caja', packSize: 200, price: 50000 },
      { id: 'felpa', brandId: 'generico', kind: 'accessory', code: 'FELPA', name: 'Felpa 7×8', unit: 'm', price: 100 },
    ],
    glass: [
      { id: 'dvh', brandId: 'cristales', name: 'DVH 4+12+4', kind: 'dvh', thickness: 20, pricePerM2: 40000, minArea: 0.25 },
      { id: 'inc4', name: 'Incoloro 4 mm', kind: 'mono', thickness: 4, pricePerM2: 10000, minArea: 0.35 },
    ],
    brandSettings,
  }
}

export function design(partial: Partial<WindowDesign> = {}): WindowDesign {
  return {
    version: 1,
    lineId: 'pro6004',
    width: 1000,
    height: 1000,
    colorId: 'blanco',
    glassId: 'dvh',
    root: { id: 'n1', type: 'leaf', opening: { kind: 'fixed' } },
    ...partial,
  }
}

export function cut(partial: Partial<CutPiece> & { length: number }): CutPiece {
  return {
    kind: 'profile',
    profileId: 'pro01',
    code: 'PRO01',
    name: 'Marco 60/64',
    role: 'frame',
    qty: 1,
    angleStart: 45,
    angleEnd: 45,
    side: 'top',
    label: 'arr',
    nodeId: 'frame',
    barLength: 5800,
    ...partial,
  }
}

export function glassPiece(partial: Partial<GlassPiece> & { width: number; height: number }): GlassPiece {
  return {
    glassId: 'dvh',
    name: 'DVH 4+12+4',
    qty: 1,
    area: Math.round(((partial.width * partial.height) / 1_000_000) * 10_000) / 10_000,
    nodeId: 'n1',
    label: 'Paño',
    ...partial,
  }
}

export function itemLine(partial: Partial<ItemLine> & { itemId: string; qty: number }): ItemLine {
  return { code: partial.itemId.toUpperCase(), name: partial.itemId, unit: 'u', kind: 'hardware', ...partial }
}

export function bom(partial: Partial<Bom> = {}): Bom {
  return { cuts: [], glass: [], items: [], warnings: [], area: 1, perimeter: 4, ...partial }
}

/** Fijo PRO6004 1000 × 1000 (T01/T02): marco 4 × 1006, junquillo 4 × 912, R1 4 × 892, DVH 902 × 902. */
export function fixedWindowBom(colorId = 'blanco'): Bom {
  return bom({
    area: 1,
    perimeter: 4,
    cuts: [
      cut({ length: 1006, qty: 2, side: 'top', label: 'arr/aba', colorId }),
      cut({ length: 1006, qty: 2, side: 'left', label: 'izq/der', colorId }),
      cut({ kind: 'bead', profileId: 'pro05', code: 'PRO05', name: 'Junquillo', role: 'bead', length: 912, qty: 4, label: 'junq', colorId }),
      cut({ kind: 'reinforcement', profileId: 'r1', code: 'R1', name: 'Refuerzo marco', role: 'reinforcement', length: 892, qty: 4, angleStart: 90, angleEnd: 90, label: 'ref' }),
    ],
    glass: [glassPiece({ width: 902, height: 902, label: 'Paño' })],
    items: [itemLine({ itemId: 'tornillo-ref', qty: 12, kind: 'consumable', unit: 'u' })],
  })
}

/** Ajustes de precio «limpios» para aislar cálculos. */
export const PLAIN = {
  marginMode: 'margin',
  marginPct: 0,
  laborPerM2: 0,
  installMode: 'none',
  installValue: 0,
  wastePct: 0,
  roundTo: 1,
  ivaPct: 19,
  chargeFullBars: false,
} as const
