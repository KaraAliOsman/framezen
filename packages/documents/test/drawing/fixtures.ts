import type { Catalog, Layout, WindowDesign } from '@framezen/engine'

/** Layouts escritos a mano (contrato del motor) para probar el dibujo sin depender del núcleo. */

export const CATALOG: Catalog = {
  colors: [
    { id: 'white', name: 'Blanco', hex: '#F6F5F1' },
    { id: 'walnut', name: 'Nogal', hex: '#5B3A22' },
    { id: 'custom', name: 'Gris perla', hex: '#A1A5A8' },
  ],
  brands: [],
  lines: [],
  profiles: [],
  items: [],
  glass: [{ id: 'dvh', name: 'Termopanel 4-12-4', kind: 'dvh', thickness: 20, pricePerM2: 38000 }],
  brandSettings: [],
}

/** Abatible 1 hoja, bisagras a la izquierda, abre hacia adentro. 1.000 × 1.200. */
export const casementDesign: WindowDesign = {
  version: 1,
  lineId: 'l1',
  width: 1000,
  height: 1200,
  colorId: 'walnut',
  colorInId: 'white',
  glassId: 'dvh',
  root: { id: 'leaf1', type: 'leaf', opening: { kind: 'casement', hinge: 'left', direction: 'in' } },
}

export const casementLayout: Layout = {
  width: 1000,
  height: 1200,
  frame: { rect: { x: 0, y: 0, w: 1000, h: 1200 }, face: 60 },
  mullions: [],
  sashes: [
    {
      nodeId: 'leaf1',
      opening: { kind: 'casement', hinge: 'left', direction: 'in' },
      rect: { x: 52, y: 52, w: 896, h: 1096 },
      face: 80,
      glassRect: { x: 132, y: 132, w: 736, h: 936 },
      fill: 'glass',
      handle: 'right',
    },
  ],
  panes: [{ nodeId: 'leaf1', kind: 'sash', glassRect: { x: 132, y: 132, w: 736, h: 936 }, fill: 'glass', glassId: 'dvh' }],
  sliding: [],
  dimensions: [
    { axis: 'x', from: 0, to: 1000, value: 1000, level: 0, target: { kind: 'width' } },
    { axis: 'y', from: 0, to: 1200, value: 1200, level: 0, target: { kind: 'height' } },
  ],
  cells: [{ nodeId: 'leaf1', rect: { x: 60, y: 60, w: 880, h: 1080 }, path: ['leaf1'] }],
}

/** Fijo arriba (400) + proyectante abajo, travesaño horizontal. 900 × 1.300. */
export const transomDesign: WindowDesign = {
  version: 1,
  lineId: 'l1',
  width: 900,
  height: 1300,
  colorId: 'white',
  glassId: 'dvh',
  root: {
    id: 'split1',
    type: 'split',
    dir: 'horizontal',
    sizes: [400, null],
    children: [
      { id: 'top', type: 'leaf', opening: { kind: 'fixed' } },
      { id: 'bottom', type: 'leaf', opening: { kind: 'awning', direction: 'out' } },
    ],
  },
}

export const transomLayout: Layout = {
  width: 900,
  height: 1300,
  frame: { rect: { x: 0, y: 0, w: 900, h: 1300 }, face: 60 },
  mullions: [{ nodeId: 'split1', index: 0, dir: 'horizontal', rect: { x: 60, y: 368, w: 780, h: 64 }, kind: 'mullion', axis: 400, min: 200, max: 1100 }],
  sashes: [
    {
      nodeId: 'bottom',
      opening: { kind: 'awning', direction: 'out' },
      rect: { x: 52, y: 424, w: 796, h: 824 },
      face: 80,
      glassRect: { x: 132, y: 504, w: 636, h: 664 },
      fill: 'glass',
      handle: 'bottom',
    },
  ],
  panes: [
    { nodeId: 'top', kind: 'fixed', glassRect: { x: 60, y: 60, w: 780, h: 308 }, fill: 'glass', glassId: 'dvh' },
    { nodeId: 'bottom', kind: 'sash', glassRect: { x: 132, y: 504, w: 636, h: 664 }, fill: 'glass', glassId: 'dvh' },
  ],
  sliding: [],
  dimensions: [
    { axis: 'x', from: 0, to: 900, value: 900, level: 0, target: { kind: 'width' } },
    { axis: 'y', from: 0, to: 1300, value: 1300, level: 0, target: { kind: 'height' } },
    { axis: 'y', from: 0, to: 400, value: 400, level: 1, target: { nodeId: 'split1', index: 0 } },
    { axis: 'y', from: 400, to: 1300, value: 900, level: 1, target: { nodeId: 'split1', index: 1 } },
  ],
  cells: [
    { nodeId: 'top', rect: { x: 60, y: 60, w: 780, h: 308 }, path: ['split1', 'top'] },
    { nodeId: 'bottom', rect: { x: 60, y: 432, w: 780, h: 808 }, path: ['split1', 'bottom'] },
  ],
}

/** Corredera: hoja fija a la izquierda + hoja móvil que abre hacia la izquierda. 1.600 × 1.100. */
export const slidingDesign: WindowDesign = {
  version: 1,
  lineId: 'l2',
  width: 1600,
  height: 1100,
  colorId: 'nogal-oscuro',
  glassId: 'dvh',
  root: {
    id: 'sl',
    type: 'sliding',
    rails: 2,
    panels: [
      { id: 'p1', kind: 'fixed' },
      { id: 'p2', kind: 'moving', direction: 'left' },
    ],
  },
}

export const slidingLayout: Layout = {
  width: 1600,
  height: 1100,
  frame: { rect: { x: 0, y: 0, w: 1600, h: 1100 }, face: 52 },
  mullions: [],
  sashes: [],
  panes: [
    { nodeId: 'p1', kind: 'sash', glassRect: { x: 116, y: 106, w: 640, h: 888 }, fill: 'glass', glassId: 'dvh' },
    { nodeId: 'p2', kind: 'sash', glassRect: { x: 844, y: 106, w: 640, h: 888 }, fill: 'glass', glassId: 'dvh' },
  ],
  sliding: [
    { panelId: 'p1', index: 0, kind: 'fixed', rail: 0, rect: { x: 52, y: 42, w: 768, h: 1016 }, face: 64, glassRect: { x: 116, y: 106, w: 640, h: 888 } },
    { panelId: 'p2', index: 1, kind: 'moving', direction: 'left', rail: 1, rect: { x: 780, y: 42, w: 768, h: 1016 }, face: 64, glassRect: { x: 844, y: 106, w: 640, h: 888 } },
  ],
  dimensions: [
    { axis: 'x', from: 0, to: 1600, value: 1600, level: 0, target: { kind: 'width' } },
    { axis: 'y', from: 0, to: 1100, value: 1100, level: 0, target: { kind: 'height' } },
  ],
  cells: [
    { nodeId: 'p1', rect: { x: 116, y: 106, w: 640, h: 888 }, path: ['sl', 'p1'] },
    { nodeId: 'p2', rect: { x: 844, y: 106, w: 640, h: 888 }, path: ['sl', 'p2'] },
  ],
  rails: 2,
}

/** Puerta de abatir, bisagras a la derecha. 900 × 2.100. Sin cotas en el layout (se sintetizan). */
export const doorDesign: WindowDesign = {
  version: 1,
  lineId: 'l1',
  width: 900,
  height: 2100,
  colorId: 'white',
  glassId: 'dvh',
  root: { id: 'door', type: 'leaf', opening: { kind: 'door', hinge: 'right', direction: 'in' }, fill: 'panel' },
}

export const doorLayout: Layout = {
  width: 900,
  height: 2100,
  frame: { rect: { x: 0, y: 0, w: 900, h: 2100 }, face: 64 },
  mullions: [],
  sashes: [
    {
      nodeId: 'door',
      opening: { kind: 'door', hinge: 'right', direction: 'in' },
      rect: { x: 56, y: 56, w: 788, h: 1988 },
      face: 110,
      glassRect: { x: 166, y: 166, w: 568, h: 1768 },
      fill: 'panel',
    },
  ],
  panes: [{ nodeId: 'door', kind: 'sash', glassRect: { x: 166, y: 166, w: 568, h: 1768 }, fill: 'panel', glassId: 'dvh' }],
  sliding: [],
  dimensions: [],
  cells: [{ nodeId: 'door', rect: { x: 64, y: 64, w: 772, h: 1972 }, path: ['door'] }],
}
