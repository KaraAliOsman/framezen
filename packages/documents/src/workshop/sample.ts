/**
 * Datos de ejemplo para la galería y las pruebas de los documentos de taller.
 *
 * Fixtures propios: marcas, códigos y nombres son de EJEMPLO. Los precios son cifras redondas
 * escritas a mano: no salen de ninguna lista de proveedor ni de un catálogo importado (este
 * paquete es público; nunca copies aquí precios netos reales, ni con un factor encima).
 * Las medidas de corte reproducen los casos dorados de la investigación (pauta 60 mm:
 * soldadura 3, descuento de marco 44, traslapo 8, holgura 5, travesaño 20), con las
 * correcciones de DEKOPEN: travesaño de los dos fijos presente e ingletes reales en el
 * trapecio. No dependen del motor: así la galería funciona aunque cambie el cálculo.
 */
import type {
  Bar,
  BarCut,
  Catalog,
  CutPiece,
  CutSettings,
  DesignNode,
  GlassPiece,
  Item,
  ItemLine,
  Layout,
  MaterialCost,
  MaterialLine,
  OptimizationGroup,
  OptimizationResult,
  Profile,
  PurchaseOrderDraft,
  Rect,
  Shape,
  Side,
  Warning,
  WindowDesign,
  WorkshopWindow,
} from '@dekopen/engine'
import type { WorkshopDocumentData } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo de ejemplo
// ─────────────────────────────────────────────────────────────────────────────

const PAUTA_60 = {
  weld: 3,
  frameDeduction: 44,
  sashWidth: 80,
  sashDeduction: 60,
  sashOverlap: 8,
  glassGap: 5,
  mullionDeduction: 20,
  reinforcement: { frame: 114, sash: 146, mullion: 20 },
}

function profile(
  id: string,
  lineId: string,
  code: string,
  name: string,
  role: Profile['role'],
  priceByColor: Record<string, number>,
  extra: Partial<Profile> = {},
): Profile {
  return { id, lineId, code, name, role, barLength: 5800, priceByColor, ...extra }
}

function item(id: string, brandId: string, kind: Item['kind'], code: string, name: string, unit: Item['unit'], price: number, packSize?: number): Item {
  return { id, brandId, kind, code, name, unit, price, ...(packSize ? { packSize } : {}) }
}

/** Catálogo de ejemplo: marcas inventadas (marcadas como ejemplo) y precios redondos escritos a mano. */
export function sampleWorkshopCatalog(): Catalog {
  return {
    colors: [
      { id: 'blanco', name: 'Blanco', hex: '#F6F5F1', code: 'BL' },
      { id: 'winchester', name: 'Winchester', hex: '#7A4A2A', code: 'WI' },
      { id: 'antracita', name: 'Antracita', hex: '#383E42', code: 'AN' },
    ],
    brands: [
      { id: 'andino', name: 'Perfiles Andino (ejemplo)', kind: 'profiles', country: 'CL', monogram: 'PA' },
      { id: 'pacifico', name: 'Herrajes Pacífico (ejemplo)', kind: 'hardware', country: 'CL', monogram: 'HP' },
      { id: 'austral', name: 'Vidrios Austral (ejemplo)', kind: 'glass', country: 'CL', monogram: 'VA' },
      { id: 'centro', name: 'Insumos Centro (ejemplo)', kind: 'mixed', country: 'CL', monogram: 'IC' },
    ],
    lines: [
      {
        id: 'andino-60',
        brandId: 'andino',
        name: 'Andino 60',
        kind: 'casement',
        material: 'pvc',
        description: 'Practicable 60 mm, 4 cámaras',
        pauta: PAUTA_60,
        doorPauta: { sashWidth: 110, sashDeduction: 90 },
        profiles: { frame: 'a601', sash: 'a621', door_sash: 'a604', mullion: 'a603', bead: 'a605', reinforcement: 'ra1' },
        sashInProfileId: 'a602',
        colorIds: ['blanco', 'winchester', 'antracita'],
        typologyIds: ['fixed', 'casement', 'casement_out', 'fixed_casement', 'door_transom', 'trapezoid', 'casement_double'],
        hardwareRules: [],
        accessoryRules: [],
        source: 'Catálogo de ejemplo',
        completeness: 'complete',
      },
      {
        id: 'andino-c70',
        brandId: 'andino',
        name: 'Andino Corredera 70',
        kind: 'sliding',
        material: 'pvc',
        description: 'Corredera 70 mm, doble riel',
        pauta: { ...PAUTA_60, frameDeduction: 52, mullionDeduction: 0 },
        profiles: { sliding_frame: 'a701', sliding_sash: 'a711', interlock: 'a714', bead: 'a715', guide: 'g271' },
        colorIds: ['blanco', 'winchester'],
        typologyIds: ['sliding_2'],
        hardwareRules: [],
        accessoryRules: [],
        source: 'Catálogo de ejemplo',
        completeness: 'complete',
      },
    ],
    profiles: [
      profile('a601', 'andino-60', 'A601', 'Marco 60', 'frame', { blanco: 18000, winchester: 27000, antracita: 28500 }, { face: 64, reinforcementId: 'ra1' }),
      profile('a602', 'andino-60', 'A602', 'Hoja interior 80', 'sash', { blanco: 23000, winchester: 34500 }, { face: 80, reinforcementId: 'ra1' }),
      profile('a621', 'andino-60', 'A621', 'Hoja exterior 80', 'sash', { blanco: 22500, winchester: 34000 }, { face: 80, reinforcementId: 'ra1' }),
      profile('a604', 'andino-60', 'A604', 'Hoja de puerta 90', 'door_sash', { blanco: 31000, winchester: 47500 }, { face: 110, reinforcementId: 'ra4' }),
      profile('a603', 'andino-60', 'A603', 'Travesaño 80', 'mullion', { blanco: 21500, winchester: 32500, antracita: 34000 }, { face: 80, reinforcementId: 'ra1' }),
      profile('a605', 'andino-60', 'A605', 'Junquillo 20', 'bead', { blanco: 5000, winchester: 9500, antracita: 10000 }),
      profile('a701', 'andino-c70', 'A701', 'Marco corredera 70', 'sliding_frame', { blanco: 21000, winchester: 32000 }, { face: 70, reinforcementId: 'ra5' }),
      profile('a711', 'andino-c70', 'A711', 'Hoja corredera 80', 'sliding_sash', { blanco: 24000, winchester: 37000 }, { face: 80, reinforcementId: 'ra18' }),
      profile('a714', 'andino-c70', 'A714', 'Traslapo corredera', 'interlock', { blanco: 7000, winchester: 16000 }),
      profile('a715', 'andino-c70', 'A715', 'Junquillo corredera', 'bead', { blanco: 5500, winchester: 9000 }),
      profile('g271', 'andino-c70', 'G271', 'Guía de aluminio', 'guide', { aluminio: 3500 }),
      profile('ra1', 'andino-60', 'RA1', 'Refuerzo 28 × 25', 'reinforcement', { acero: 7500 }),
      profile('ra4', 'andino-60', 'RA4', 'Refuerzo de puerta 57 × 30', 'reinforcement', { acero: 16500 }),
      profile('ra19', 'andino-60', 'RA19', 'Refuerzo hoja exterior', 'reinforcement', { acero: 8500 }),
      profile('ra5', 'andino-c70', 'RA5', 'Refuerzo marco corredera', 'reinforcement', { acero: 9500 }),
      profile('ra18', 'andino-c70', 'RA18', 'Refuerzo hoja corredera', 'reinforcement', { acero: 7000 }),
    ],
    items: [
      item('cremona-balc', 'pacifico', 'hardware', 'HP-CB22', 'Cremona balconera 1.700–2.200', 'u', 5200),
      item('ext-puerta', 'pacifico', 'hardware', 'HP-EX40', 'Extensión de cremona 200–400', 'u', 1500),
      item('bisagra-3d', 'pacifico', 'hardware', 'HP-B3D', 'Bisagra 3D 105 mm', 'u', 5900),
      item('cerradero', 'pacifico', 'hardware', 'HP-CRA', 'Cerradero de abatir', 'u', 250),
      item('manilla-llave', 'pacifico', 'hardware', 'HP-MDL', 'Manilla doble con llave', 'u', 7200),
      item('cremona-aba', 'pacifico', 'hardware', 'HP-CA14', 'Cremona de abatir 1.200–1.400', 'u', 3000),
      item('bisagra-2d', 'pacifico', 'hardware', 'HP-B2D', 'Bisagra 2D 100 mm', 'u', 1800),
      item('manilla', 'pacifico', 'hardware', 'HP-MR', 'Manilla recta', 'u', 1750),
      item('limitador', 'pacifico', 'hardware', 'HP-LIM', 'Limitador de apertura', 'u', 0),
      item('carro', 'pacifico', 'hardware', 'HP-CD12', 'Carro doble regulable', 'u', 1850),
      item('cierre-corr', 'pacifico', 'hardware', 'HP-CC10', 'Cierre de corredera 800–1.000', 'u', 2050),
      item('tope', 'pacifico', 'hardware', 'HP-TE', 'Tope estanco', 'u', 350),
      item('conector', 'andino', 'accessory', 'A-CT', 'Conector de travesaño', 'u', 700),
      item('tapa-desague', 'andino', 'accessory', 'A-TD', 'Tapa de desagüe', 'u', 150),
      item('puente', 'andino', 'accessory', 'A-PA', 'Puente de acristalamiento', 'u', 180),
      item('felpa', 'centro', 'accessory', 'IC-F78', 'Felpa 7 × 8', 'm', 95),
      item('calzo', 'centro', 'accessory', 'IC-CZ5', 'Calzo de vidrio 5 mm', 'u', 90),
      item('tornillo-ref', 'centro', 'consumable', 'IC-T3919', 'Tornillo autoperforante 3,9 × 19', 'caja', 28500, 1000),
      item('tornillo-her', 'centro', 'consumable', 'IC-T4125', 'Tornillo de herrajes 4,1 × 25', 'caja', 22500, 1000),
      item('silicona', 'centro', 'consumable', 'IC-SN', 'Silicona neutra', 'cartucho', 4500),
    ],
    glass: [
      {
        id: 'dvh-4124',
        brandId: 'austral',
        name: 'DVH 4+12+4 incoloro',
        kind: 'dvh',
        thickness: 20,
        composition: '4 incoloro + cámara 12 + 4 incoloro',
        pricePerM2: 41000,
        minArea: 0.25,
      },
      {
        id: 'dvh-lam',
        brandId: 'austral',
        name: 'DVH laminado 3+3 / 12 / 4',
        kind: 'dvh',
        thickness: 22,
        composition: 'laminado 3+3 + cámara 12 + 4 incoloro',
        pricePerM2: 66000,
        minArea: 0.25,
      },
    ],
    brandSettings: [
      { brandId: 'andino', enabled: true, trim: 0, kerf: 4, discounts: { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 } },
      { brandId: 'pacifico', enabled: true, trim: 0, kerf: 4, discounts: { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 } },
      { brandId: 'austral', enabled: true, trim: 0, kerf: 4, discounts: { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 } },
      { brandId: 'centro', enabled: true, trim: 0, kerf: 4, discounts: { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 } },
    ],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Constructores de piezas
// ─────────────────────────────────────────────────────────────────────────────

const SIDE_BY_TOKEN: Record<string, Side> = {
  arr: 'top',
  aba: 'bottom',
  izq: 'left',
  der: 'right',
  incl: 'top',
  trav: 'mullion',
  guía: 'guide',
  traslapo: 'interlock',
}

type Cut = (
  profileId: string,
  colorId: string | undefined,
  length: number,
  qty: number,
  label: string,
  nodeId: string,
  angles?: [number, number],
) => CutPiece

function cutFactory(catalog: Catalog): Cut {
  return (profileId, colorId, length, qty, label, nodeId, angles) => {
    const p = catalog.profiles.find((x) => x.id === profileId)
    if (!p) throw new Error(`Perfil de ejemplo inexistente: ${profileId}`)
    const kind: CutPiece['kind'] = p.role === 'reinforcement' ? 'reinforcement' : p.role === 'bead' ? 'bead' : 'profile'
    const straight = kind === 'reinforcement' || p.role === 'mullion' || p.role === 'interlock' || p.role === 'guide'
    const [a, b] = angles ?? (straight ? [90, 90] : [45, 45])
    const token = label.split(' · ')[0] ?? label
    return {
      kind,
      profileId,
      code: p.code,
      name: p.name,
      role: p.role,
      ...(colorId && kind !== 'reinforcement' ? { colorId } : {}),
      length,
      qty,
      angleStart: a,
      angleEnd: b,
      side: SIDE_BY_TOKEN[token] ?? 'other',
      label,
      nodeId,
      barLength: p.barLength,
    }
  }
}

type It = (itemId: string, qty: number, nodeId?: string) => ItemLine

function itemFactory(catalog: Catalog): It {
  return (itemId, qty, nodeId) => {
    const it = catalog.items.find((x) => x.id === itemId)
    if (!it) throw new Error(`Artículo de ejemplo inexistente: ${itemId}`)
    // Lo que va en caja se consume por unidad.
    const unit = it.packSize && it.packSize > 1 ? 'u' : it.unit
    return { itemId, code: it.code, name: it.name, unit, qty, kind: it.kind, ...(nodeId ? { nodeId } : {}) }
  }
}

function glassPiece(catalog: Catalog, glassId: string, width: number, height: number, qty: number, label: string, nodeId: string, shape?: Shape['kind']): GlassPiece {
  const g = catalog.glass.find((x) => x.id === glassId)
  return {
    glassId,
    name: g?.name ?? glassId,
    width,
    height,
    qty,
    area: Math.round((width * height) / 1e6 * 10000) / 10000,
    nodeId,
    label,
    ...(shape ? { shape } : {}),
  }
}

const r = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h })

function baseLayout(width: number, height: number, face: number): Layout {
  return {
    width,
    height,
    frame: { rect: r(0, 0, width, height), face },
    mullions: [],
    sashes: [],
    panes: [],
    sliding: [],
    dimensions: [
      { axis: 'x', from: 0, to: width, value: width, level: 0, target: { kind: 'width' } },
      { axis: 'y', from: 0, to: height, value: height, level: 0, target: { kind: 'height' } },
    ],
    cells: [],
  }
}

function design(lineId: string, width: number, height: number, colorId: string, glassId: string, root: DesignNode, shape?: Shape): WindowDesign {
  return { version: 1, lineId, width, height, colorId, glassId, root, ...(shape ? { shape } : {}) }
}

function bomOf(cuts: CutPiece[], glass: GlassPiece[], items: ItemLine[], width: number, height: number, perimeter: number, warnings: Warning[] = [], area?: number) {
  return {
    cuts,
    glass,
    items,
    warnings,
    area: area ?? Math.round((width * height) / 1e6 * 10000) / 10000,
    perimeter,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ventanas
// ─────────────────────────────────────────────────────────────────────────────

function buildWindows(catalog: Catalog): WorkshopWindow[] {
  const cut = cutFactory(catalog)
  const it = itemFactory(catalog)
  const gp = (glassId: string, w: number, h: number, qty: number, label: string, nodeId: string, shape?: Shape['kind']) =>
    glassPiece(catalog, glassId, w, h, qty, label, nodeId, shape)

  // V1 · Puerta con fijo superior (eje del travesaño a 400 mm desde arriba).
  const v1Layout = baseLayout(856, 2240, 44)
  v1Layout.mullions.push({ nodeId: 'v1-root', index: 0, dir: 'horizontal', rect: r(44, 380, 768, 40), kind: 'mullion', axis: 400, min: 200, max: 2040 })
  v1Layout.sashes.push({
    nodeId: 'v1-door',
    opening: { kind: 'door', hinge: 'right', direction: 'in' },
    rect: r(36, 412, 784, 1792),
    face: 90,
    glassRect: r(126, 502, 604, 1612),
    fill: 'glass',
    handle: 'left',
  })
  v1Layout.panes.push(
    { nodeId: 'v1-top', kind: 'fixed', glassRect: r(44, 44, 768, 336), fill: 'glass', glassId: 'dvh-4124' },
    { nodeId: 'v1-door', kind: 'sash', glassRect: r(126, 502, 604, 1612), fill: 'glass', glassId: 'dvh-lam' },
  )
  v1Layout.dimensions.push(
    { axis: 'y', from: 0, to: 400, value: 400, level: 1, target: { nodeId: 'v1-root', index: 0 } },
    { axis: 'y', from: 400, to: 2240, value: 1840, level: 1, target: { nodeId: 'v1-root', index: 1 } },
  )
  v1Layout.cells.push(
    { nodeId: 'v1-top', rect: r(44, 44, 768, 336), path: ['v1-root', 'v1-top'] },
    { nodeId: 'v1-door', rect: r(44, 420, 768, 1776), path: ['v1-root', 'v1-door'] },
  )
  const v1: WorkshopWindow = {
    ref: 'V1',
    name: 'Puerta balcón',
    location: 'Living',
    qty: 1,
    description: 'Puerta con fijo superior · Andino 60 · Winchester · DVH laminado 3+3 / 12 / 4',
    design: design('andino-60', 856, 2240, 'winchester', 'dvh-4124', {
      id: 'v1-root',
      type: 'split',
      dir: 'horizontal',
      sizes: [400, null],
      joint: 'mullion',
      children: [
        { id: 'v1-top', type: 'leaf', opening: { kind: 'fixed' } },
        { id: 'v1-door', type: 'leaf', opening: { kind: 'door', hinge: 'right', direction: 'in' }, glassId: 'dvh-lam' },
      ],
    }),
    layout: v1Layout,
    bom: bomOf(
      [
        cut('a601', 'winchester', 862, 2, 'arr · aba', 'frame'),
        cut('a601', 'winchester', 2246, 2, 'izq · der', 'frame'),
        cut('a604', 'winchester', 790, 2, 'arr · aba', 'v1-door'),
        cut('a604', 'winchester', 1798, 2, 'izq · der', 'v1-door'),
        cut('a603', 'winchester', 856, 1, 'trav', 'v1-root'),
        cut('a605', 'winchester', 768, 2, 'arr · aba', 'v1-top'),
        cut('a605', 'winchester', 336, 2, 'izq · der', 'v1-top'),
        cut('a605', 'winchester', 604, 2, 'arr · aba', 'v1-door'),
        cut('a605', 'winchester', 1612, 2, 'izq · der', 'v1-door'),
        cut('ra1', undefined, 748, 2, 'arr · aba', 'frame'),
        cut('ra1', undefined, 2132, 2, 'izq · der', 'frame'),
        cut('ra1', undefined, 836, 1, 'trav', 'v1-root'),
        cut('ra4', undefined, 682, 2, 'arr · aba', 'v1-door'),
        cut('ra4', undefined, 1690, 2, 'izq · der', 'v1-door'),
      ],
      [gp('dvh-4124', 758, 326, 1, 'Fijo superior', 'v1-top'), gp('dvh-lam', 594, 1602, 1, 'Hoja de puerta', 'v1-door')],
      [
        it('cremona-balc', 1, 'v1-door'),
        it('ext-puerta', 2, 'v1-door'),
        it('bisagra-3d', 3, 'v1-door'),
        it('cerradero', 4, 'v1-door'),
        it('manilla-llave', 1, 'v1-door'),
        it('conector', 2, 'v1-root'),
        it('tapa-desague', 2),
        it('tornillo-ref', 12, 'v1-top'),
        it('tornillo-ref', 24, 'v1-door'),
        it('tornillo-her', 10, 'v1-door'),
        it('calzo', 8),
        it('puente', 8),
      ],
      856,
      2240,
      6.192,
    ),
  }

  // V2 · Fijo trapecio: base 1.000, lado derecho 1.000, lado izquierdo 500.
  const v2Layout = baseLayout(1000, 1000, 44)
  v2Layout.frame.outline = 'M0 500 L1000 0 L1000 1000 L0 1000 Z'
  v2Layout.frame.innerOutline = 'M44 527.2 L956 71.2 L956 956 L44 956 Z'
  v2Layout.panes.push({
    nodeId: 'v2-pane',
    kind: 'fixed',
    glassRect: r(44, 71.2, 912, 884.8),
    fill: 'glass',
    glassId: 'dvh-4124',
    outline: 'M49 530.3 L951 79.3 L951 951 L49 951 Z',
  })
  v2Layout.dimensions.push({ axis: 'y', from: 500, to: 1000, value: 500, level: 1 })
  v2Layout.cells.push({ nodeId: 'v2-pane', rect: r(44, 71.2, 912, 884.8), path: ['v2-pane'] })
  const v2: WorkshopWindow = {
    ref: 'V2',
    location: 'Escalera',
    qty: 1,
    description: 'Fijo trapecio · Andino 60 · Winchester · DVH 4+12+4 incoloro',
    design: design(
      'andino-60',
      1000,
      1000,
      'winchester',
      'dvh-4124',
      { id: 'v2-pane', type: 'leaf', opening: { kind: 'fixed' } },
      { kind: 'trapezoid', leftHeight: 500, rightHeight: 1000 },
    ),
    layout: v2Layout,
    bom: bomOf(
      [
        cut('a601', 'winchester', 1006, 1, 'aba', 'frame'),
        cut('a601', 'winchester', 1006, 1, 'der', 'frame', [45, 31.72]),
        cut('a601', 'winchester', 506, 1, 'izq', 'frame', [45, 58.28]),
        cut('a601', 'winchester', 1124, 1, 'incl', 'frame', [58.28, 31.72]),
        cut('a605', 'winchester', 912, 1, 'aba', 'v2-pane'),
        cut('a605', 'winchester', 884.8, 1, 'der', 'v2-pane', [45, 31.72]),
        cut('a605', 'winchester', 428.8, 1, 'izq', 'v2-pane', [45, 58.28]),
        cut('a605', 'winchester', 1019.6, 1, 'incl', 'v2-pane', [58.28, 31.72]),
        cut('ra1', undefined, 898, 1, 'aba', 'frame'),
        cut('ra1', undefined, 898, 1, 'der', 'frame'),
        cut('ra1', undefined, 398, 1, 'izq', 'frame'),
        cut('ra1', undefined, 1016, 1, 'incl', 'frame'),
      ],
      [gp('dvh-4124', 902, 902, 1, 'Paño trapecio', 'v2-pane', 'trapezoid')],
      [it('tapa-desague', 2), it('tornillo-ref', 18), it('calzo', 2), it('puente', 2), it('silicona', 0.8)],
      1000,
      1000,
      3.618,
      [
        {
          level: 'info',
          code: 'odd_angles',
          message: 'Esquinas superiores de 116,6° y 63,4°: corta los ingletes a 58,3° y 31,7°, no a 45°.',
          nodeId: 'v2-pane',
        },
      ],
      0.75,
    ),
  }

  // V3 · Corredera 2 hojas (2 unidades iguales).
  const v3Layout = baseLayout(1475, 1135, 52)
  v3Layout.sliding.push(
    { panelId: 'v3-p1', index: 0, kind: 'moving', direction: 'right', rail: 1, rect: r(44, 44, 733.5, 1047), face: 60, glassRect: r(104, 104, 613.5, 927) },
    { panelId: 'v3-p2', index: 1, kind: 'moving', direction: 'left', rail: 0, rect: r(697.5, 44, 733.5, 1047), face: 60, glassRect: r(757.5, 104, 613.5, 927) },
  )
  v3Layout.panes.push(
    { nodeId: 'v3-p1', kind: 'sash', glassRect: r(104, 104, 613.5, 927), fill: 'glass', glassId: 'dvh-4124' },
    { nodeId: 'v3-p2', kind: 'sash', glassRect: r(757.5, 104, 613.5, 927), fill: 'glass', glassId: 'dvh-4124' },
  )
  v3Layout.rails = 2
  v3Layout.cells.push(
    { nodeId: 'v3-p1', rect: r(44, 44, 733.5, 1047), path: ['v3-sl', 'v3-p1'] },
    { nodeId: 'v3-p2', rect: r(697.5, 44, 733.5, 1047), path: ['v3-sl', 'v3-p2'] },
  )
  const v3: WorkshopWindow = {
    ref: 'V3',
    name: 'Ventana dormitorios',
    location: 'Dormitorios 1 y 2',
    qty: 2,
    description: 'Corredera 2 hojas · Andino Corredera 70 · Blanco · DVH 4+12+4 incoloro',
    design: design('andino-c70', 1475, 1135, 'blanco', 'dvh-4124', {
      id: 'v3-sl',
      type: 'sliding',
      rails: 2,
      panels: [
        { id: 'v3-p1', kind: 'moving', direction: 'right' },
        { id: 'v3-p2', kind: 'moving', direction: 'left' },
      ],
    }),
    layout: v3Layout,
    bom: bomOf(
      [
        cut('a701', 'blanco', 1481, 2, 'arr · aba', 'frame'),
        cut('a701', 'blanco', 1141, 2, 'izq · der', 'frame'),
        cut('a711', 'blanco', 739.5, 2, 'arr · aba', 'v3-p1'),
        cut('a711', 'blanco', 1053, 2, 'izq · der', 'v3-p1'),
        cut('a711', 'blanco', 739.5, 2, 'arr · aba', 'v3-p2'),
        cut('a711', 'blanco', 1053, 2, 'izq · der', 'v3-p2'),
        cut('a714', 'blanco', 1047, 2, 'traslapo', 'v3-sl'),
        cut('g271', undefined, 1371, 2, 'guía', 'frame'),
        cut('a715', 'blanco', 613.5, 2, 'arr · aba', 'v3-p1'),
        cut('a715', 'blanco', 927, 2, 'izq · der', 'v3-p1'),
        cut('a715', 'blanco', 613.5, 2, 'arr · aba', 'v3-p2'),
        cut('a715', 'blanco', 927, 2, 'izq · der', 'v3-p2'),
        cut('ra5', undefined, 1351, 2, 'arr · aba', 'frame'),
        cut('ra5', undefined, 1011, 2, 'izq · der', 'frame'),
        cut('ra18', undefined, 593.5, 2, 'arr · aba', 'v3-p1'),
        cut('ra18', undefined, 907, 2, 'izq · der', 'v3-p1'),
        cut('ra18', undefined, 593.5, 2, 'arr · aba', 'v3-p2'),
        cut('ra18', undefined, 907, 2, 'izq · der', 'v3-p2'),
      ],
      [gp('dvh-4124', 603.5, 917, 1, 'Hoja izquierda', 'v3-p1'), gp('dvh-4124', 603.5, 917, 1, 'Hoja derecha', 'v3-p2')],
      [
        it('carro', 4),
        it('cierre-corr', 2),
        it('manilla', 2),
        it('tope', 2),
        it('felpa', 17.45),
        it('tapa-desague', 4),
        it('tornillo-ref', 24),
        it('calzo', 16),
        it('puente', 16),
      ],
      1475,
      1135,
      5.22,
    ),
  }

  // V4 · Abatir doble exterior con travesaño central.
  const v4Layout = baseLayout(1193, 1350, 44)
  v4Layout.mullions.push({ nodeId: 'v4-root', index: 0, dir: 'vertical', rect: r(576.5, 44, 40, 1262), kind: 'mullion', axis: 596.5, min: 300, max: 893 })
  v4Layout.sashes.push(
    {
      nodeId: 'v4-l',
      opening: { kind: 'casement', hinge: 'left', direction: 'out' },
      rect: r(36, 36, 548.5, 1278),
      face: 60,
      glassRect: r(96, 96, 428.5, 1158),
      fill: 'glass',
      handle: 'right',
    },
    {
      nodeId: 'v4-r',
      opening: { kind: 'casement', hinge: 'right', direction: 'out' },
      rect: r(608.5, 36, 548.5, 1278),
      face: 60,
      glassRect: r(668.5, 96, 428.5, 1158),
      fill: 'glass',
      handle: 'left',
    },
  )
  v4Layout.panes.push(
    { nodeId: 'v4-l', kind: 'sash', glassRect: r(96, 96, 428.5, 1158), fill: 'glass', glassId: 'dvh-4124' },
    { nodeId: 'v4-r', kind: 'sash', glassRect: r(668.5, 96, 428.5, 1158), fill: 'glass', glassId: 'dvh-4124' },
  )
  v4Layout.dimensions.push(
    { axis: 'x', from: 0, to: 596.5, value: 596.5, level: 1, target: { nodeId: 'v4-root', index: 0 } },
    { axis: 'x', from: 596.5, to: 1193, value: 596.5, level: 1, target: { nodeId: 'v4-root', index: 1 } },
  )
  v4Layout.cells.push(
    { nodeId: 'v4-l', rect: r(44, 44, 532.5, 1262), path: ['v4-root', 'v4-l'] },
    { nodeId: 'v4-r', rect: r(616.5, 44, 532.5, 1262), path: ['v4-root', 'v4-r'] },
  )
  const v4: WorkshopWindow = {
    ref: 'V4',
    name: 'Ventana cocina',
    location: 'Cocina',
    qty: 1,
    description: 'Abatir doble exterior · Andino 60 · Blanco · DVH 4+12+4 incoloro',
    design: design('andino-60', 1193, 1350, 'blanco', 'dvh-4124', {
      id: 'v4-root',
      type: 'split',
      dir: 'vertical',
      sizes: [596.5, null],
      joint: 'mullion',
      children: [
        { id: 'v4-l', type: 'leaf', opening: { kind: 'casement', hinge: 'left', direction: 'out' } },
        { id: 'v4-r', type: 'leaf', opening: { kind: 'casement', hinge: 'right', direction: 'out' } },
      ],
    }),
    layout: v4Layout,
    bom: bomOf(
      [
        cut('a601', 'blanco', 1199, 2, 'arr · aba', 'frame'),
        cut('a601', 'blanco', 1356, 2, 'izq · der', 'frame'),
        cut('a621', 'blanco', 554.5, 2, 'arr · aba', 'v4-l'),
        cut('a621', 'blanco', 1284, 2, 'izq · der', 'v4-l'),
        cut('a621', 'blanco', 554.5, 2, 'arr · aba', 'v4-r'),
        cut('a621', 'blanco', 1284, 2, 'izq · der', 'v4-r'),
        cut('a603', 'blanco', 1350, 1, 'trav', 'v4-root'),
        cut('a605', 'blanco', 428.5, 2, 'arr · aba', 'v4-l'),
        cut('a605', 'blanco', 1158, 2, 'izq · der', 'v4-l'),
        cut('a605', 'blanco', 428.5, 2, 'arr · aba', 'v4-r'),
        cut('a605', 'blanco', 1158, 2, 'izq · der', 'v4-r'),
        cut('ra1', undefined, 1085, 2, 'arr · aba', 'frame'),
        cut('ra1', undefined, 1242, 2, 'izq · der', 'frame'),
        cut('ra1', undefined, 1330, 1, 'trav', 'v4-root'),
        cut('ra1', undefined, 408.5, 2, 'arr · aba', 'v4-l'),
        cut('ra1', undefined, 1138, 2, 'izq · der', 'v4-l'),
        cut('ra1', undefined, 408.5, 2, 'arr · aba', 'v4-r'),
        cut('ra19', undefined, 1138, 2, 'izq · der', 'v4-r'),
      ],
      [gp('dvh-4124', 418.5, 1148, 1, 'Hoja izquierda', 'v4-l'), gp('dvh-4124', 418.5, 1148, 1, 'Hoja derecha', 'v4-r')],
      [
        it('cremona-aba', 2),
        it('bisagra-2d', 6),
        it('cerradero', 5),
        it('manilla', 2),
        it('limitador', 2),
        it('conector', 2, 'v4-root'),
        it('tapa-desague', 2),
        it('tornillo-ref', 54),
        it('tornillo-her', 10),
        it('calzo', 14),
        it('puente', 14),
      ],
      1193,
      1350,
      5.086,
      [{ level: 'warn', code: 'price_missing_item', message: 'El limitador de apertura no tiene precio: se cotiza en $0.', nodeId: 'v4-r' }],
    ),
  }

  // V5 · Fijo + abatir interior.
  const v5Layout = baseLayout(1193, 1358, 44)
  v5Layout.mullions.push({ nodeId: 'v5-root', index: 0, dir: 'vertical', rect: r(576.5, 44, 40, 1270), kind: 'mullion', axis: 596.5, min: 300, max: 893 })
  v5Layout.sashes.push({
    nodeId: 'v5-sash',
    opening: { kind: 'casement', hinge: 'right', direction: 'in' },
    rect: r(608.5, 36, 548.5, 1286),
    face: 60,
    glassRect: r(668.5, 96, 428.5, 1166),
    fill: 'glass',
    handle: 'left',
  })
  v5Layout.panes.push(
    { nodeId: 'v5-fix', kind: 'fixed', glassRect: r(44, 44, 532.5, 1270), fill: 'glass', glassId: 'dvh-4124' },
    { nodeId: 'v5-sash', kind: 'sash', glassRect: r(668.5, 96, 428.5, 1166), fill: 'glass', glassId: 'dvh-4124' },
  )
  v5Layout.dimensions.push(
    { axis: 'x', from: 0, to: 596.5, value: 596.5, level: 1, target: { nodeId: 'v5-root', index: 0 } },
    { axis: 'x', from: 596.5, to: 1193, value: 596.5, level: 1, target: { nodeId: 'v5-root', index: 1 } },
  )
  v5Layout.cells.push(
    { nodeId: 'v5-fix', rect: r(44, 44, 532.5, 1270), path: ['v5-root', 'v5-fix'] },
    { nodeId: 'v5-sash', rect: r(616.5, 44, 532.5, 1270), path: ['v5-root', 'v5-sash'] },
  )
  const v5: WorkshopWindow = {
    ref: 'V5',
    name: 'Ventana baño',
    location: 'Baño',
    qty: 1,
    description: 'Fijo + abatir interior · Andino 60 · Blanco · DVH 4+12+4 incoloro',
    design: design('andino-60', 1193, 1358, 'blanco', 'dvh-4124', {
      id: 'v5-root',
      type: 'split',
      dir: 'vertical',
      sizes: [596.5, null],
      joint: 'mullion',
      children: [
        { id: 'v5-fix', type: 'leaf', opening: { kind: 'fixed' } },
        { id: 'v5-sash', type: 'leaf', opening: { kind: 'casement', hinge: 'right', direction: 'in' } },
      ],
    }),
    layout: v5Layout,
    bom: bomOf(
      [
        cut('a601', 'blanco', 1199, 2, 'arr · aba', 'frame'),
        cut('a601', 'blanco', 1364, 2, 'izq · der', 'frame'),
        cut('a602', 'blanco', 554.5, 2, 'arr · aba', 'v5-sash'),
        cut('a602', 'blanco', 1292, 2, 'izq · der', 'v5-sash'),
        cut('a603', 'blanco', 1358, 1, 'trav', 'v5-root'),
        cut('a605', 'blanco', 532.5, 2, 'arr · aba', 'v5-fix'),
        cut('a605', 'blanco', 1270, 2, 'izq · der', 'v5-fix'),
        cut('a605', 'blanco', 441.5, 2, 'arr · aba', 'v5-sash'),
        cut('a605', 'blanco', 1179, 2, 'izq · der', 'v5-sash'),
        cut('ra1', undefined, 1085, 2, 'arr · aba', 'frame'),
        cut('ra1', undefined, 1250, 2, 'izq · der', 'frame'),
        cut('ra1', undefined, 1338, 1, 'trav', 'v5-root'),
        cut('ra1', undefined, 489.7, 2, 'arr · aba', 'v5-sash'),
        cut('ra1', undefined, 1227.2, 2, 'izq · der', 'v5-sash'),
      ],
      [gp('dvh-4124', 522.5, 1260, 1, 'Paño fijo', 'v5-fix'), gp('dvh-4124', 418.5, 1156, 1, 'Hoja', 'v5-sash')],
      [
        it('cremona-aba', 1),
        it('bisagra-2d', 3),
        it('cerradero', 3),
        it('manilla', 1),
        it('conector', 2, 'v5-root'),
        it('tapa-desague', 2),
        it('tornillo-ref', 36),
        it('tornillo-her', 10),
        it('calzo', 8),
        it('puente', 8),
      ],
      1193,
      1358,
      5.102,
    ),
  }

  // V6 · Dos paños fijos con travesaño (el competidor lo omitía).
  const v6Layout = baseLayout(2385, 900, 44)
  v6Layout.mullions.push({ nodeId: 'v6-root', index: 0, dir: 'vertical', rect: r(1172.5, 44, 40, 812), kind: 'mullion', axis: 1192.5, min: 300, max: 2085 })
  v6Layout.panes.push(
    { nodeId: 'v6-l', kind: 'fixed', glassRect: r(44, 44, 1128.5, 812), fill: 'glass', glassId: 'dvh-4124' },
    { nodeId: 'v6-r', kind: 'fixed', glassRect: r(1212.5, 44, 1128.5, 812), fill: 'glass', glassId: 'dvh-4124' },
  )
  v6Layout.dimensions.push(
    { axis: 'x', from: 0, to: 1192.5, value: 1192.5, level: 1, target: { nodeId: 'v6-root', index: 0 } },
    { axis: 'x', from: 1192.5, to: 2385, value: 1192.5, level: 1, target: { nodeId: 'v6-root', index: 1 } },
  )
  v6Layout.cells.push(
    { nodeId: 'v6-l', rect: r(44, 44, 1128.5, 812), path: ['v6-root', 'v6-l'] },
    { nodeId: 'v6-r', rect: r(1212.5, 44, 1128.5, 812), path: ['v6-root', 'v6-r'] },
  )
  const v6: WorkshopWindow = {
    ref: 'V6',
    name: 'Ventanal terraza',
    location: 'Terraza',
    qty: 1,
    description: 'Dos paños fijos · Andino 60 · Antracita · DVH 4+12+4 incoloro',
    design: design('andino-60', 2385, 900, 'antracita', 'dvh-4124', {
      id: 'v6-root',
      type: 'split',
      dir: 'vertical',
      sizes: [1192.5, null],
      joint: 'mullion',
      children: [
        { id: 'v6-l', type: 'leaf', opening: { kind: 'fixed' } },
        { id: 'v6-r', type: 'leaf', opening: { kind: 'fixed' } },
      ],
    }),
    layout: v6Layout,
    bom: bomOf(
      [
        cut('a601', 'antracita', 2391, 2, 'arr · aba', 'frame'),
        cut('a601', 'antracita', 906, 2, 'izq · der', 'frame'),
        cut('a603', 'antracita', 900, 1, 'trav', 'v6-root'),
        cut('a605', 'antracita', 1128.5, 2, 'arr · aba', 'v6-l'),
        cut('a605', 'antracita', 812, 2, 'izq · der', 'v6-l'),
        cut('a605', 'antracita', 1128.5, 2, 'arr · aba', 'v6-r'),
        cut('a605', 'antracita', 812, 2, 'izq · der', 'v6-r'),
        cut('ra1', undefined, 2277, 2, 'arr · aba', 'frame'),
        cut('ra1', undefined, 792, 2, 'izq · der', 'frame'),
        cut('ra1', undefined, 880, 1, 'trav', 'v6-root'),
      ],
      [gp('dvh-4124', 1118.5, 802, 1, 'Paño izquierdo', 'v6-l'), gp('dvh-4124', 1118.5, 802, 1, 'Paño derecho', 'v6-r')],
      [it('conector', 2, 'v6-root'), it('tapa-desague', 4), it('tornillo-ref', 36), it('calzo', 4), it('puente', 4)],
      2385,
      900,
      6.57,
    ),
  }

  return [v1, v2, v3, v4, v5, v6]
}

// ─────────────────────────────────────────────────────────────────────────────
// Optimización de ejemplo (primer ajuste decreciente, disco por cada pieza)
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_RANK: Partial<Record<CutPiece['role'], number>> = {
  frame: 0,
  sliding_frame: 0,
  sash: 1,
  sliding_sash: 1,
  door_sash: 1,
  mullion: 2,
  interlock: 3,
  guide: 4,
  bead: 5,
  reinforcement: 9,
}

interface FlatPiece {
  key: string
  piece: CutPiece
  length: number
  label: string
  ref: string
}

function flattenPieces(windows: WorkshopWindow[]): FlatPiece[] {
  const out: FlatPiece[] = []
  for (const w of windows) {
    for (let u = 0; u < w.qty; u++) {
      for (const p of w.bom.cuts) {
        const tokens = p.label.split(' · ')
        for (let k = 0; k < p.qty; k++) {
          const side = tokens.length === p.qty ? (tokens[k] ?? p.label) : p.label
          out.push({ key: `${p.profileId ?? p.code}|${p.colorId ?? ''}`, piece: p, length: p.length, label: `${w.ref} · ${side}`, ref: w.ref })
        }
      }
    }
  }
  return out
}

function optimizeSample(windows: WorkshopWindow[], settings: CutSettings): OptimizationResult {
  const pieces = flattenPieces(windows)
  const keys = [...new Set(pieces.map((p) => p.key))]
  const groups: OptimizationGroup[] = keys.map((key) => {
    const list = pieces.filter((p) => p.key === key).sort((a, b) => b.length - a.length)
    const first = list[0]?.piece
    const capacity = settings.barLength - settings.trimStart - settings.trimEnd
    // Como el optimizador: el disco ocupa más en el eje si la pieza termina en inglete.
    const disc = (p: FlatPiece) => {
      const angle = p.piece.angleEnd
      return angle >= 89.95 ? settings.kerf : Math.ceil((settings.kerf * 10) / Math.sin((angle * Math.PI) / 180) - 1e-6) / 10
    }
    const bins: { cuts: FlatPiece[]; used: number; kerf: number }[] = []
    for (const p of list) {
      const bin = bins.find((b) => b.used + b.kerf + disc(p) + p.length <= capacity)
      if (bin) {
        bin.cuts.push(p)
        bin.used += p.length
        bin.kerf += disc(p)
      } else bins.push({ cuts: [p], used: p.length, kerf: disc(p) })
    }
    const bars: Bar[] = bins.map((b) => {
      let offset = settings.trimStart
      const cuts: BarCut[] = b.cuts.map((p) => {
        const c: BarCut = { length: p.length, label: p.label, ref: p.ref, offset, angleStart: p.piece.angleStart, angleEnd: p.piece.angleEnd }
        offset = Math.round((offset + p.length + disc(p)) * 10) / 10
        return c
      })
      const used = Math.round(b.used * 10) / 10
      const kerfLoss = Math.round(b.kerf * 10) / 10
      return {
        key,
        barLength: settings.barLength,
        fromOffcut: false,
        cuts,
        used,
        kerfLoss,
        remainder: Math.round((capacity - used - kerfLoss) * 10) / 10,
        yieldPct: Math.round((used / settings.barLength) * 1000) / 10,
      }
    })
    const used = bars.reduce((s, b) => s + b.used, 0)
    return {
      key,
      code: first?.code ?? key,
      name: first?.name ?? key,
      ...(first?.colorId ? { colorId: first.colorId } : {}),
      bars,
      pieces: list.length,
      yieldPct: Math.round((used / (bars.length * settings.barLength)) * 1000) / 10,
      barsNeeded: bars.length,
    }
  })
  groups.sort((a, b) => {
    const pa = pieces.find((p) => p.key === a.key)?.piece
    const pb = pieces.find((p) => p.key === b.key)?.piece
    return (ROLE_RANK[pa?.role ?? 'other'] ?? 8) - (ROLE_RANK[pb?.role ?? 'other'] ?? 8) || a.code.localeCompare(b.code) || a.key.localeCompare(b.key)
  })
  const totalBars = groups.reduce((s, g) => s + g.barsNeeded, 0)
  const totalUsed = groups.reduce((s, g) => s + g.bars.reduce((t, b) => t + b.used, 0), 0)
  return {
    groups,
    totalBars,
    totalPieces: pieces.length,
    yieldPct: totalBars > 0 ? Math.round((totalUsed / (totalBars * settings.barLength)) * 1000) / 10 : 0,
    offcuts: groups.flatMap((g) => g.bars.filter((b) => b.remainder >= settings.minReusable).map((b) => ({ key: g.key, length: b.remainder }))),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Materiales, compras y costos de ejemplo
// ─────────────────────────────────────────────────────────────────────────────

function profilePrice(catalog: Catalog, profileId: string | undefined, colorId: string | undefined): number {
  const p = catalog.profiles.find((x) => x.id === profileId)
  if (!p) return 0
  return (colorId ? p.priceByColor[colorId] : undefined) ?? Object.values(p.priceByColor)[0] ?? 0
}

function brandName(catalog: Catalog, brandId: string): string {
  return catalog.brands.find((b) => b.id === brandId)?.name ?? brandId
}

function buildMaterials(catalog: Catalog, windows: WorkshopWindow[], opt: OptimizationResult): MaterialLine[] {
  const lines: MaterialLine[] = []
  for (const g of opt.groups) {
    const [profileId] = g.key.split('|')
    const p = catalog.profiles.find((x) => x.id === profileId)
    const unitCost = profilePrice(catalog, profileId, g.colorId)
    const meters = g.bars.reduce((s, b) => s + b.used, 0) / 1000
    const line = p ? catalog.lines.find((l) => l.id === p.lineId) : undefined
    const color = catalog.colors.find((c) => c.id === g.colorId)
    lines.push({
      group: p?.role === 'reinforcement' ? 'reinforcement' : 'profile',
      code: g.code,
      name: g.name,
      ...(g.colorId ? { colorId: g.colorId } : {}),
      ...(color ? { colorName: color.name } : {}),
      ...(line ? { brandId: line.brandId, brandName: brandName(catalog, line.brandId) } : {}),
      qty: g.barsNeeded,
      unit: 'barra',
      bars: g.barsNeeded,
      meters: Math.round(meters * 100) / 100,
      unitCost,
      total: unitCost * g.barsNeeded,
    })
  }

  const usage = new Map<string, number>()
  for (const w of windows) for (const i of w.bom.items) usage.set(i.itemId, (usage.get(i.itemId) ?? 0) + i.qty * w.qty)
  for (const [itemId, used] of usage) {
    const it = catalog.items.find((x) => x.id === itemId)
    if (!it) continue
    const pack = it.packSize && it.packSize > 1 ? it.packSize : 1
    const qty = pack > 1 || it.unit === 'cartucho' ? Math.ceil(used / pack) : Math.round(used * 100) / 100
    lines.push({
      group: it.kind === 'hardware' ? 'hardware' : 'accessory',
      code: it.code,
      name: it.name,
      brandId: it.brandId,
      brandName: brandName(catalog, it.brandId),
      qty,
      unit: it.unit,
      unitCost: it.price,
      total: Math.round(qty * it.price),
    })
  }

  const glassUse = new Map<string, number>()
  for (const w of windows) for (const g of w.bom.glass) glassUse.set(g.glassId, (glassUse.get(g.glassId) ?? 0) + g.area * g.qty * w.qty)
  for (const [glassId, area] of glassUse) {
    const g = catalog.glass.find((x) => x.id === glassId)
    if (!g) continue
    const qty = Math.round(area * 100) / 100
    lines.push({
      group: 'glass',
      code: g.id.toUpperCase(),
      name: g.name,
      ...(g.brandId ? { brandId: g.brandId, brandName: brandName(catalog, g.brandId) } : {}),
      qty,
      unit: 'm²',
      unitCost: g.pricePerM2,
      total: Math.round(qty * g.pricePerM2),
    })
  }
  return lines
}

function buildPurchaseOrders(lines: MaterialLine[]): PurchaseOrderDraft[] {
  const map = new Map<string, PurchaseOrderDraft>()
  for (const line of lines) {
    if (!line.brandId) continue
    const order = map.get(line.brandId) ?? { brandId: line.brandId, brandName: line.brandName ?? line.brandId, lines: [], total: 0 }
    order.lines.push(line)
    order.total += line.total ?? 0
    map.set(line.brandId, order)
  }
  return [...map.values()]
}

function unitMaterials(catalog: Catalog, w: WorkshopWindow): MaterialCost {
  const m: MaterialCost = { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 }
  for (const c of w.bom.cuts) {
    const cost = (c.length / c.barLength) * profilePrice(catalog, c.profileId, c.colorId) * c.qty
    if (c.kind === 'reinforcement') m.reinforcement += cost
    else m.profiles += cost
  }
  for (const i of w.bom.items) {
    const it = catalog.items.find((x) => x.id === i.itemId)
    if (!it) continue
    const cost = (it.price / (it.packSize && it.packSize > 1 ? it.packSize : 1)) * i.qty
    if (it.kind === 'hardware') m.hardware += cost
    else m.accessories += cost
  }
  for (const g of w.bom.glass) {
    const glass = catalog.glass.find((x) => x.id === g.glassId)
    if (!glass) continue
    m.glass += Math.max(g.area, glass.minArea ?? 0) * glass.pricePerM2 * g.qty
  }
  return m
}

function buildCosts(catalog: Catalog, windows: WorkshopWindow[]): WorkshopDocumentData['costs'] {
  const materials: MaterialCost = { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 }
  const perWindow = windows.map((w) => {
    const m = unitMaterials(catalog, w)
    const keys = Object.keys(materials) as (keyof MaterialCost)[]
    for (const k of keys) materials[k] += m[k] * w.qty
    const materialTotal = keys.reduce((s, k) => s + m[k], 0)
    // Merma 5 %, mano de obra $12.000/m², margen 40 % sobre venta, redondeo a $100.
    const cost = materialTotal * 1.05 + 12000 * w.bom.area
    const unitPrice = Math.ceil(cost / 0.6 / 100) * 100
    return { ref: w.ref, qty: w.qty, unitCost: Math.round(cost), unitPrice }
  })
  const rounded: MaterialCost = {
    profiles: Math.round(materials.profiles),
    reinforcement: Math.round(materials.reinforcement),
    hardware: Math.round(materials.hardware),
    glass: Math.round(materials.glass),
    accessories: Math.round(materials.accessories),
  }
  const total = rounded.profiles + rounded.reinforcement + rounded.hardware + rounded.glass + rounded.accessories
  return { materials: rounded, total, perWindow }
}

// ─────────────────────────────────────────────────────────────────────────────
// Builder público
// ─────────────────────────────────────────────────────────────────────────────

export const SAMPLE_CUT_SETTINGS: CutSettings = { barLength: 5800, kerf: 4, trimStart: 0, trimEnd: 0, minReusable: 500 }

/**
 * Datos de taller completos de ejemplo (OT N° 38, 6 ventanas, 7 unidades).
 * `overrides` reemplaza campos de primer nivel (org, quote, workOrder, cut…). Si cambias
 * `cut`, la optimización se recalcula con esos parámetros.
 */
export function sampleWorkshopData(overrides: Partial<WorkshopDocumentData> = {}): WorkshopDocumentData {
  const catalog = overrides.catalog ?? sampleWorkshopCatalog()
  const windows = overrides.windows ?? buildWindows(catalog)
  const cut = overrides.cut ?? SAMPLE_CUT_SETTINGS
  const optimization = overrides.optimization ?? optimizeSample(windows, cut)
  const materials = overrides.materials ?? buildMaterials(catalog, windows, optimization)
  const glassMap = new Map<string, WorkshopDocumentData['glass'][number]>()
  for (const w of windows) {
    for (const g of w.bom.glass) {
      const key = `${g.glassId}|${g.width}|${g.height}|${g.shape ?? 'rect'}`
      const prev = glassMap.get(key)
      const ref = `${w.ref} · ${g.label}`
      if (prev) {
        prev.qty += g.qty * w.qty
        if (!prev.refs.includes(ref)) prev.refs.push(ref)
      } else {
        glassMap.set(key, {
          glassId: g.glassId,
          name: g.name,
          width: g.width,
          height: g.height,
          qty: g.qty * w.qty,
          area: g.area,
          refs: [ref],
          ...(g.shape ? { shape: g.shape } : {}),
        })
      }
    }
  }
  return {
    org: { name: 'Ventanas del Sur', accent: '#2747C2' },
    quote: { number: 412, title: 'Casa Pérez · Concepción', clientName: 'Pedro Soto' },
    workOrder: { number: 38, date: '2026-10-31', dueDate: '2026-11-14', notes: 'Entregar todo en una sola visita.' },
    windowNotes: { V1: 'Bisagras a la derecha vistas desde el interior.', V3: 'Dos unidades iguales para los dormitorios.' },
    ...overrides,
    catalog,
    windows,
    cut,
    optimization,
    materials,
    glass: overrides.glass ?? [...glassMap.values()],
    purchaseOrders: overrides.purchaseOrders ?? buildPurchaseOrders(materials),
    costs: overrides.costs ?? buildCosts(catalog, windows),
  }
}
