/**
 * Avisos reales del motor, uno o más por cada código y variante, producidos con diseños y catálogos
 * de prueba. Los usan las pruebas de parámetros del motor y las del glosario (en `packages/shared`),
 * que comprueban que cada frase en español del glosario reproduce el `message` del motor.
 */
import {
  computeBom,
  createAssembly,
  createDesign,
  joinWindow,
  priceItem,
  setAssemblyAngle,
  setExtras,
  setOpening,
  setShape,
  setSize,
  setSlidingPanels,
} from '../../src'
import { optimizeCuts } from '../../src/commerce/optimizer'
import { safeBom } from '../../src/commerce/evaluate'
import type { Catalog, Line, SlidingNode, SplitNode, Warning, WindowDesign } from '../../src/types'
import { design, GLASS, ITEMS, PRO6004, PROFILES, prolineCatalog } from './fixtures'
import { HST_LINE, v5Catalog } from './v5-fixtures'

export interface WarningSample {
  /** Qué se hizo para provocarlo (legible en los mensajes de error de las pruebas). */
  scenario: string
  warning: Warning
}

const base = { lineId: 'pro6004', colorId: 'blanco', glassId: 'dvh-4-12-4' }

/** Catálogo con el junquillo sin precio en antracita. */
const noPriceCatalogFor = (catalog: Catalog): Catalog => ({ ...catalog, profiles: catalog.profiles.map((p) => (p.id === 'PRO05' ? { ...p, priceByColor: { blanco: 5000 } } : p)) })

/** Catálogo Proline con la línea PRO6004 modificada. */
const withLine = (patch: Partial<Line>, extra: Partial<Catalog> = {}): Catalog => prolineCatalog({ lines: [{ ...PRO6004, ...patch }], ...extra })

export function collectWarningSamples(): WarningSample[] {
  const out: WarningSample[] = []
  const take = (scenario: string, warnings: Warning[]): void => {
    for (const warning of warnings) out.push({ scenario, warning })
  }
  const bom = (scenario: string, d: WindowDesign, catalog: Catalog): void => take(scenario, computeBom(d, catalog).warnings)
  /** Avisos del despiece y del precio de la misma ventana. */
  const price = (scenario: string, d: WindowDesign, catalog: Catalog, settings = {}, opts = {}): void => {
    const b = computeBom(d, catalog)
    take(scenario, [...b.warnings, ...priceItem(b, d, catalog, settings, opts).warnings])
  }

  const proline = prolineCatalog()
  const v5 = v5Catalog()

  // ── Diseño y catálogo ──
  bom('línea inexistente', createDesign('fixed', { ...base, lineId: 'nada', width: 1000, height: 1000 }), proline)
  price('línea que ya no está (precio)', createDesign('fixed', { ...base, lineId: 'nada' }), proline)
  bom('pauta incompleta', createDesign('fixed', { ...base, width: 1000, height: 1000 }), withLine({ pauta: { weld: 3, frameDeduction: 44 } as Line['pauta'] }))
  bom('medidas en cero', design({ width: 0, height: 1000, root: { id: 'n1', type: 'leaf', opening: { kind: 'fixed' } } }), proline)
  const door = createDesign('door', { ...base, width: 900, height: 2100 })
  bom('umbral pedido en una línea sin umbral (puerta)', setExtras(door, { threshold: true }), proline)
  bom('umbral de la elevadora ausente', createDesign('lift_slide_2', { lineId: 'hst', colorId: 'blanco', glassId: 'dvh-4-12-4' }), v5Catalog({ lines: [{ ...HST_LINE, profiles: { ...HST_LINE.profiles, threshold: undefined } }, ...v5.lines.filter((l) => l.id !== 'hst')] }))
  bom('color que la línea no fabrica', createDesign('sliding_2', { ...base, lineId: 'prosld70', colorId: 'antracita' }), proline)
  bom('color que la línea no fabrica (el primero no está en el catálogo)', createDesign('sliding_2', { ...base, lineId: 'prosld70', colorId: 'antracita' }), prolineCatalog({ colors: proline.colors.filter((c) => c.id !== 'blanco') }))
  bom('color de la ventana que no está en el catálogo', createDesign('fixed', { ...base, colorId: 'fantasma' }), withLine({ colorIds: [] }))
  bom('línea practicable con ventana corredera', createDesign('sliding_2', base), proline)
  bom('línea de corredera con ventana practicable', createDesign('casement', { ...base, lineId: 'prosld70' }), proline)
  const fixed3 = createDesign('fixed_3', base)
  bom('unión francesa entre fijos (vertical)', { ...fixed3, root: { ...fixed3.root, joint: 'french' } } as WindowDesign, proline)
  const transom = createDesign('casement_transom', base)
  bom('unión francesa horizontal', { ...transom, root: { ...transom.root, joint: 'french' } } as WindowDesign, proline)
  const fold3 = createDesign('folding_3', base)
  const foldRoot = fold3.root as SplitNode
  bom(
    'plegable con grupos desordenados',
    { ...fold3, root: { ...foldRoot, children: [foldRoot.children[0], { ...foldRoot.children[1], opening: { kind: 'folding', hinge: 'right' } }, foldRoot.children[2]] } as SplitNode },
    v5,
  )
  bom('plegable con un fijo (vertical)', { ...fold3, root: { ...foldRoot, children: [{ id: 'n2', type: 'leaf', opening: { kind: 'fixed' } }, ...foldRoot.children.slice(1)] } as SplitNode }, v5)
  bom('plegable horizontal', { ...fold3, root: { ...foldRoot, dir: 'horizontal' } as SplitNode }, v5)
  bom('hoja plegable suelta', setOpening(createDesign('casement', base), 'n1', { kind: 'folding', hinge: 'left' }), v5)
  const sl = createDesign('sliding_2', { ...base, lineId: 'prosld70' })
  const nested = createDesign('casement', base)
  bom('corredera dentro de otro paño', { ...nested, root: { id: 'n1', type: 'split', dir: 'vertical', sizes: [null, null], children: [{ ...(sl.root as SlidingNode), id: 's1' }, nested.root] } as SplitNode }, proline)
  bom('hoja en una forma', setOpening(createDesign('trapezoid', base), 'n1', { kind: 'casement', hinge: 'left' }), v5)
  bom('arco', createDesign('arch', base), v5)
  bom('ventana redonda', createDesign('round', { ...base, width: 1000, height: 1000 }), v5)
  bom('ventana ovalada', createDesign('oval', { ...base, width: 1200, height: 800 }), v5)
  bom('redonda con ancho y alto distintos', createDesign('round', { ...base, width: 1000, height: 900 }), v5)

  // ── Despiece ──
  bom('perfil sin asignar (travesaño)', createDesign('fixed_casement', base), withLine({ profiles: { frame: 'PRO01', sash: 'PRO521', bead: 'PRO05' } }))
  bom('perfil sin asignar (hoja de puerta)', door, withLine({ profiles: { frame: 'PRO01', sash: 'PRO521', mullion: 'PRO03', bead: 'PRO05' } }))
  bom('perfil sin asignar (guía de corredera)', createDesign('sliding_2', { ...base, lineId: 'prosld70' }), prolineCatalog({ lines: [PRO6004, { ...v5.lines[1], profiles: { sliding_frame: 'PRO201', sliding_sash: 'PRO211', interlock: 'PRO204', bead: 'PRO703' } }] }))
  bom('refuerzo sin descuento en la pauta', createDesign('fixed', { ...base, width: 1000, height: 1000 }), withLine({ pauta: { ...PRO6004.pauta, reinforcement: {} } }))
  bom('refuerzo sin acero asignado', createDesign('fixed', { ...base, width: 1000, height: 1000 }), prolineCatalog({ profiles: PROFILES.map((p) => (p.id === 'PRO01' ? { ...p, reinforcementId: 'nada' } : p)) }))
  bom('vidrio fuera del catálogo', createDesign('fixed', { ...base, glassId: 'raro' }), proline)
  bom('vidrio fuera del catálogo y sin otros vidrios', createDesign('fixed', { ...base, glassId: 'raro' }), prolineCatalog({ glass: [] }))
  bom('herraje de una regla que no está en el catálogo', createDesign('casement', { ...base, width: 700, height: 1000 }), prolineCatalog({ items: ITEMS.filter((i) => i.id !== 'H-M1') }))
  bom('accesorio de una regla que no está en el catálogo', createDesign('casement', { ...base, width: 700, height: 1000 }), withLine({ accessoryRules: [{ id: 'x', itemId: 'no-existe', per: 'window', qty: 1 }] }))
  const small = design({
    width: 1000,
    height: 1000,
    root: { id: 'n1', type: 'split', dir: 'vertical', sizes: [200, 800], children: [{ id: 'a', type: 'leaf', opening: { kind: 'fixed' } }, { id: 'b', type: 'leaf', opening: { kind: 'fixed' } }] },
  })
  bom('paño muy chico', small, proline)
  bom('paño imposible', { ...small, root: { ...small.root, sizes: [50, 950] } } as WindowDesign, proline)
  // Un paño de esquina cae fuera del círculo: el recorte contra el contorno no deja nada.
  const round = createDesign('round', { ...base, width: 1000, height: 1000 })
  const corner: WindowDesign = {
    ...round,
    root: {
      id: 'r',
      type: 'split',
      dir: 'horizontal',
      sizes: [100, null],
      children: [
        { id: 'top', type: 'split', dir: 'vertical', sizes: [100, null], children: [{ id: 'tl', type: 'leaf', opening: { kind: 'fixed' } }, { id: 'tr', type: 'leaf', opening: { kind: 'fixed' } }] },
        { id: 'bottom', type: 'leaf', opening: { kind: 'fixed' } },
      ],
    },
  }
  bom('paño fuera de la forma', corner, v5)
  const slidingBase = createDesign('sliding_2', { ...base, lineId: 'prosld70' })
  const slidingRoot = slidingBase.root as SlidingNode
  bom('corredera de una hoja', { ...slidingBase, root: { ...slidingRoot, panels: slidingRoot.panels.slice(0, 1) } }, proline)
  const six = createDesign('sliding_6', { lineId: 'prosld70', colorId: 'blanco', glassId: 'dvh-4-12-4' })
  bom('corredera con siete hojas', setSlidingPanels(six, [...(six.root as SlidingNode).panels, { id: 'x', kind: 'moving' }]), v5)
  const noMoving = createDesign('sliding_2', { ...base, lineId: 'prosld70' })
  bom('corredera sin hojas móviles', { ...noMoving, root: { ...(noMoving.root as SlidingNode), panels: (noMoving.root as SlidingNode).panels.map((p) => ({ ...p, kind: 'fixed' as const })) } }, proline)
  bom('corredera monorriel', createDesign('sliding_mono', { ...base, lineId: 'prosld70' }), proline)
  bom('corredera de 6 hojas demasiado angosta', setSize(six, { width: 300 }), v5)
  bom('línea sin reglas de herrajes', createDesign('tilt_turn', base), withLine({ hardwareRules: [] }))
  bom('línea sin herrajes para oscilobatientes', createDesign('tilt_turn', base), withLine({ hardwareRules: PRO6004.hardwareRules.filter((r) => !r.openings.includes('tilt_turn')) }))
  bom('línea sin herrajes para paños fijos de corredera elevadora', createDesign('lift_slide_2', { lineId: 'hst', colorId: 'blanco', glassId: 'dvh-4-12-4' }), v5Catalog({ lines: [{ ...HST_LINE, hardwareRules: [{ id: 'k', openings: [], itemId: 'K-HST', qty: 1, systems: ['lift_slide'] }] }, ...v5.lines.filter((l) => l.id !== 'hst')] }))
  bom('hoja sin herraje para su alto (entre rangos)', createDesign('casement_out', { ...base, width: 600, height: 1000 }), proline)
  bom('hoja sin herraje para su alto (sobre todos los rangos)', createDesign('casement', { ...base, width: 600, height: 1700 }), proline)
  bom('hoja sin herraje para su ancho (bajo todos los rangos)', createDesign('awning', { ...base, width: 450, height: 700 }), withLine({ hardwareRules: [{ id: 'a', openings: ['awning'], itemId: 'H-C04', qty: 1, minWidth: 500, maxWidth: 900 }] }))
  const twoSashes = createDesign('casement_double', { ...base, width: 1800, height: 1000 })
  bom('dos hojas sin herraje', twoSashes, proline)
  bom('persiana sin precios en la línea', setExtras(createDesign('casement', { ...base, width: 800, height: 1200 }), { rollerShutter: { type: 'monoblock', operation: 'motor' } }), proline)
  bom('mosquitero sin precios en la línea', setExtras(createDesign('casement', { ...base, width: 800, height: 1200 }), { insectScreen: { type: 'pleated' } }), proline)
  bom('alféizar sin precios en la línea', setExtras(createDesign('casement', { ...base, width: 800, height: 1200 }), { sill: true }), proline)
  const panelDoor = { ...door, root: { ...door.root, fill: 'panel' } } as WindowDesign
  bom('panel ciego sin precio en la línea', panelDoor, proline)
  bom('regla de accesorio que no se sabe contar', createDesign('casement', { ...base, width: 700, height: 1000 }), withLine({ accessoryRules: [{ id: 'z', itemId: 'A-TD', per: 'nada' as never, qty: 1 }] }))
  bom('regla de accesorio sin ficha y sin forma de contarla', createDesign('casement', { ...base, width: 700, height: 1000 }), withLine({ accessoryRules: [{ id: 'z', itemId: 'fantasma', per: 'nada' as never, qty: 1 }] }))
  bom('hoja demasiado grande', createDesign('casement', { ...base, width: 1400, height: 1800 }), v5)
  bom('hoja demasiado chica', createDesign('tilt_slide', { ...base, width: 1000, height: 2200 }), v5)
  bom('plegable demasiado ancho', setSize(createDesign('folding_7', base), { width: 7000 }), v5)
  bom('elevadora demasiado ancha', setSize(createDesign('lift_slide_4', { lineId: 'hst', colorId: 'blanco', glassId: 'dvh-4-12-4' }), { width: 7000 }), v5)
  bom('vidrio grande (termopanel)', createDesign('fixed', { ...base, width: 1800, height: 1700 }), proline)
  bom('vidrio grande (monolítico)', createDesign('fixed', { ...base, glassId: 'mono-4', width: 1500, height: 1400 }), proline)
  bom('vidrio grande (monolítico, sin vidrio de reemplazo)', createDesign('fixed', { ...base, glassId: 'mono-4', width: 1500, height: 1400 }), prolineCatalog({ glass: GLASS.filter((g) => g.kind === 'mono') }))
  bom('vidrio grande en una hoja', createDesign('casement', { ...base, width: 1000, height: 1500 }), v5)

  // ── Conjuntos y v7 ──
  const fixedPane = createDesign('fixed', { ...base, width: 1000, height: 1200 })
  const noCouplers: Catalog = { ...v5, profiles: v5.profiles.filter((p) => p.role !== 'coupler') }
  bom('unión sin acople en la línea', joinWindow(fixedPane, fixedPane, 'right', noCouplers), noCouplers)
  bom('unión a un ángulo sin poste', setAssemblyAngle(createAssembly('bay', { ...base, width: 800, height: 1400 }, v5), 150, v5), v5)
  const undeclared: Catalog = { ...v5, profiles: [...noCouplers.profiles, { id: 'ESQ', lineId: 'pro6004', code: 'MQ60', name: 'Esquinero MQ60 60/60', role: 'coupler', barLength: 5800, priceByColor: { blanco: 30000 } }] }
  bom('esquinero sin ángulo declarado, cara vista ni refuerzo', createAssembly('corner_90', { ...base, width: 1000, height: 1300 }, undeclared), undeclared)
  const otherBrand: Catalog = { ...v5, lines: v5.lines.map((l) => (l.id === 'prosld70' ? { ...l, brandId: 'otra' } : l)) }
  bom('unión de sistemas distintos', joinWindow(fixedPane, createDesign('sliding_2', { lineId: 'prosld70', colorId: 'blanco', glassId: 'dvh-4-12-4', width: 1500, height: 1200 }), 'right', otherBrand), otherBrand)
  bom('unidades que no se tocan', joinWindow(fixedPane, { ...fixedPane, height: 0 }, 'right', v5), v5)
  bom('guillotina sin hoja propia', createDesign('vertical_sliding', { lineId: 'hst', colorId: 'blanco', glassId: 'dvh-4-12-4' }), v5)
  const doorZocalo = createDesign('door_zocalo', { ...base, width: 900, height: 2100 })
  bom('zócalo que no cabe', { ...doorZocalo, root: { ...doorZocalo.root, zocalo: { height: 2000 } } as WindowDesign['root'] }, v5)
  bom('celosía sin regla de precio', createDesign('louver_fixed', base), v5)
  bom('pieza de contorno que ya no está', { ...fixedPane, extras: { frameAddons: [{ kind: 'subframe', profileId: 'NADA' }] } }, v5)
  price('ventana fuera del total', createDesign('fixed', { ...base, colorId: 'antracita', width: 1000, height: 1000 }), noPriceCatalogFor(proline))
  price('unidad de un conjunto fuera del total', joinWindow(fixedPane, { ...fixedPane, colorId: 'antracita' }, 'right', noPriceCatalogFor(v5)), noPriceCatalogFor(v5))

  const withSupplierData: Catalog = { ...v5, lines: v5.lines.map((l) => (l.id === 'pro6004' ? { ...l, provenance: { glazing: { min: 4, max: 16 }, beads: [{ code: 'PRO05', min: 20, max: 22 }], limits: [{ opening: 'casement', width: [400, 500], height: [400, 500] }] } } : l)) }
  bom('junquillo que no calza con el vidrio', createDesign('fixed', { ...base, glassId: 'mono-4', width: 1000, height: 1000 }), withSupplierData)
  bom('vidrio que la línea no admite', createDesign('fixed', { ...base, width: 1000, height: 1000 }), withSupplierData)
  bom('perfil sin largo de barra', createDesign('fixed', { ...base, width: 1000, height: 1000 }), { ...v5, profiles: v5.profiles.map((p) => (p.id === 'PRO01' ? { ...p, barLength: 0 } : p)) })
  bom('hoja fuera del límite publicado', createDesign('casement', { ...base, width: 700, height: 1300 }), withSupplierData)

  // ── Precio ──
  const noPriceCatalog = (patch: Partial<Catalog>): Catalog => prolineCatalog(patch)
  price('perfil sin precio en el color (un solo faltante)', createDesign('fixed', { ...base, colorId: 'antracita', width: 1000, height: 1000 }), noPriceCatalog({ profiles: PROFILES.map((p) => (p.id === 'PRO01' ? { ...p, priceByColor: { blanco: 20000 } } : p)) }))
  price('perfil sin precio en el color', createDesign('fixed', { ...base, colorId: 'antracita', width: 1000, height: 1000 }), proline)
  price('refuerzo sin precio', createDesign('fixed', { ...base, width: 1000, height: 1000 }), noPriceCatalog({ profiles: PROFILES.map((p) => (p.role === 'reinforcement' ? { ...p, priceByColor: {} } : p)) }))
  price('vidrio sin precio', createDesign('fixed', base), noPriceCatalog({ glass: GLASS.map((g) => ({ ...g, pricePerM2: 0 })) }))
  price('herraje sin precio', createDesign('tilt_turn', { ...base, width: 700, height: 1300 }), proline)
  price('accesorio sin precio', createDesign('casement', { ...base, width: 700, height: 1000 }), noPriceCatalog({ items: ITEMS.map((i) => (i.id === 'A-CT' ? { ...i, price: 0 } : i)) }))
  price('insumo sin precio', createDesign('fixed_casement', base), noPriceCatalog({ items: ITEMS.map((i) => (i.kind === 'consumable' ? { ...i, price: 0 } : i)) }))
  price('perfil que no está en el catálogo', createDesign('fixed', base), noPriceCatalog({ profiles: PROFILES.filter((p) => p.id !== 'PRO01') }))
  price('vidrio que no está en el catálogo', createDesign('fixed', { ...base, glassId: 'raro' }), proline)
  price('herraje que no está en el catálogo', createDesign('casement', { ...base, width: 700, height: 1000 }), noPriceCatalog({ items: ITEMS.filter((i) => i.id !== 'H-M1') }))
  price('varios materiales sin precio', createDesign('tilt_turn', { ...base, colorId: 'antracita', width: 700, height: 1300 }), noPriceCatalog({ glass: GLASS.map((g) => ({ ...g, pricePerM2: 0 })), profiles: PROFILES.map((p) => ({ ...p, priceByColor: {} })) }))
  price('varios materiales sin precio (sin colores)', createDesign('casement', { ...base, width: 700, height: 1000 }), noPriceCatalog({ glass: GLASS.map((g) => ({ ...g, pricePerM2: 0 })), items: ITEMS.map((i) => ({ ...i, price: 0 })) }))
  price('cantidad inválida', createDesign('fixed', base), proline, {}, { qty: -1 })
  price('margen negativo', createDesign('fixed', base), proline, { marginPct: -5 })
  price('margen sobre 95 %', createDesign('fixed', base), proline, { marginMode: 'margin', marginPct: 97.2 })
  price('precio manual inválido', createDesign('fixed', base), proline, {}, { manualUnitPrice: -1 })
  price('precio manual', createDesign('fixed', base), proline, {}, { manualUnitPrice: 1 })
  price('precio manual bajo el costo', createDesign('fixed', base), proline, { marginPct: 30 }, { manualUnitPrice: 1000 })
  take('sin materiales ni medida', priceItem(computeBom(createDesign('fixed', { ...base, width: 0, height: 0 }), proline), createDesign('fixed', { ...base, width: 0, height: 0 }), proline, {}).warnings)
  take('sin materiales (con medida)', priceItem({ cuts: [], glass: [], items: [], warnings: [], area: 1, perimeter: 4 }, createDesign('fixed', base), proline, { laborPerM2: 1000 }).warnings)
  take('el cálculo del despiece falla', safeBom({ computeBom: () => { throw new Error('x') } }, createDesign('fixed', base), proline).warnings)

  // ── Optimizador de cortes ──
  const saw = { barLength: 5800, kerf: 4, trimStart: 15, trimEnd: 15, minReusable: 500 }
  take('pieza más larga que la barra (sin etiqueta)', optimizeCuts([{ key: 'PRO01|blanco', length: 6200, qty: 1, label: '' }], saw).warnings)
  take('pieza más larga que la barra (con etiqueta)', optimizeCuts([{ key: 'PRO01|blanco', length: 6200.5, qty: 1, label: 'V2 · izq' }], saw).warnings)
  take('sin largo de barra en el perfil ni en Ajustes', optimizeCuts([{ key: 'PRO01|blanco', code: 'PRO01', length: 1000, qty: 1, label: '' }], {}).warnings)
  take('demasiadas unidades', optimizeCuts([{ key: 'PRO01|blanco', length: 500, qty: 1_000_000, label: 'p500' }], saw).warnings)
  take('una pieza sin largo', optimizeCuts([{ key: 'PRO01|blanco', length: 0, qty: 1, label: '' }], saw).warnings)
  take('varias piezas sin largo', optimizeCuts([{ key: 'PRO01|blanco', length: 0, qty: 1, label: '' }, { key: 'PRO01|blanco', length: Number.NaN, qty: 2, label: '' }], saw).warnings)

  return out
}
