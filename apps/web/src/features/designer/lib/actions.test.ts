import { describe, expect, it } from 'vitest'
import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { computeBom, createDesign, findNode, type LeafNode, type SplitNode, type TypologyId, type WindowDesign } from '@dekopen/engine'
import {
  OPENING_PRESETS,
  applyOpeningPreset,
  canRemoveDivision,
  clearNodeGlass,
  equalizeSplit,
  flipHinge,
  frenchHost,
  isPresetActive,
  nodeGlassId,
  nodeSummary,
  nodeTitle,
  presetOpening,
  removeDivision,
  resolveSelection,
  selectableIds,
  setDirection,
  setFill,
  setNodeGlass,
  setPanelCount,
  setPanelDirection,
  setPanelKind,
  setRails,
  splitAction,
  toggleFrench,
} from './actions'

const catalog = SAMPLE_CATALOG
const make = (t: TypologyId, width = 1200, height = 1200, lineId?: string): WindowDesign =>
  createDesign(t, { lineId: lineId ?? (t.startsWith('sliding') ? 'serie-70-corredera' : 'serie-60'), width, height, colorId: 'blanco', glassId: 'dvh-4-12-4' })
const preset = (id: string) => OPENING_PRESETS.find((p) => p.id === id)!
const leaf = (d: WindowDesign, id: string) => findNode(d, id) as LeafNode

describe('aperturas', () => {
  it('fijo → abatible con bisagras a la derecha, hacia adentro', () => {
    const d = make('fixed')
    const id = d.root.id
    const change = applyOpeningPreset(d, id, preset('casement_right'))!
    expect(leaf(change.design, id).opening).toEqual({ kind: 'casement', hinge: 'right', direction: 'in' })
    expect(change.label).toBe('Apertura: Abatible')
    expect(isPresetActive(preset('casement_right'), leaf(change.design, id).opening)).toBe(true)
    expect(isPresetActive(preset('casement_left'), leaf(change.design, id).opening)).toBe(false)
  })

  it('conserva bisagra y sentido al pasar entre aperturas con bisagras', () => {
    expect(presetOpening(preset('tilt_turn'), { kind: 'casement', hinge: 'right', direction: 'out' })).toEqual({ kind: 'tilt_turn', hinge: 'right', direction: 'in' })
    expect(presetOpening(preset('door'), { kind: 'door', hinge: 'right', direction: 'out' })).toEqual({ kind: 'door', hinge: 'right', direction: 'out' })
    expect(presetOpening(preset('awning'), undefined)).toEqual({ kind: 'awning', direction: 'out' })
    expect(presetOpening(preset('fixed'), { kind: 'casement', hinge: 'left' })).toEqual({ kind: 'fixed' })
  })

  it('elegir lo mismo no crea un paso de deshacer', () => {
    const d = make('casement')
    expect(applyOpeningPreset(d, d.root.id, preset('casement_left'))).toBeNull()
  })

  it('cambia el lado de las bisagras y el sentido', () => {
    const d = make('casement')
    const id = d.root.id
    const flipped = flipHinge(d, id)!
    expect(leaf(flipped.design, id).opening.hinge).toBe('right')
    expect(flipped.label).toBe('Bisagras a la derecha')
    const out = setDirection(flipped.design, id, 'out')!
    expect(leaf(out.design, id).opening.direction).toBe('out')
    expect(setDirection(out.design, id, 'out')).toBeNull()
    expect(flipHinge(make('fixed'), make('fixed').root.id)).toBeNull()
  })
})

describe('divisiones', () => {
  it('divide en 3 y quita una división desde un paño', () => {
    const d = make('fixed', 1800, 1000)
    const id = d.root.id
    const split = splitAction(d, id, 'vertical', 3)!
    expect(split.label).toBe('Dividir en 3 (vertical)')
    expect(selectableIds(split.design)).toHaveLength(3)
    expect(canRemoveDivision(split.design, id)).toBe(true)
    const merged = removeDivision(split.design, id)!
    expect(merged.label).toBe('Quitar división')
    expect(selectableIds(merged.design)).toHaveLength(2)
  })

  it('quita un travesaño concreto o la división entera', () => {
    const d = make('fixed_3', 2100, 1000)
    const splitId = d.root.id
    const one = removeDivision(d, splitId, 0)!
    expect(one.label).toBe('Quitar travesaño')
    expect(selectableIds(one.design)).toHaveLength(2)
    const all = removeDivision(d, splitId)!
    expect(all.design.root.type).toBe('leaf')
    expect(removeDivision(make('fixed'), make('fixed').root.id)).toBeNull()
    expect(canRemoveDivision(make('fixed'), make('fixed').root.id)).toBe(false)
  })

  it('unión francesa solo en divisiones verticales', () => {
    const d = make('fixed_casement')
    const splitId = d.root.id
    const leafId = (d.root as SplitNode).children[1].id
    expect(frenchHost(d, leafId)?.id).toBe(splitId)
    const fr = toggleFrench(d, splitId)!
    expect((fr.design.root as SplitNode).joint).toBe('french')
    expect(fr.label).toBe('Unión francesa')
    expect(toggleFrench(fr.design, splitId)!.label).toBe('Travesaño fijo')
    const h = make('casement_transom', 800, 1600)
    expect(toggleFrench(h, h.root.id)).toBeNull()
    expect(frenchHost(h, (h.root as SplitNode).children[0].id)).toBeNull()
  })

  it('repartir en partes iguales deja las medidas automáticas', () => {
    const d = make('door_sidelight', 1300, 2100)
    const eq = equalizeSplit(d, d.root.id)!
    expect((eq.design.root as SplitNode).sizes).toEqual([null, null])
    expect(equalizeSplit(eq.design, d.root.id)).toBeNull()
  })
})

describe('vidrio y relleno', () => {
  it('vidrio propio del paño y vuelta al de la ventana', () => {
    const d = make('fixed_casement')
    const id = (d.root as SplitNode).children[0].id
    expect(nodeGlassId(d, id)).toEqual({ glassId: 'dvh-4-12-4', own: false })
    const own = setNodeGlass(d, id, 'laminado-3-3', catalog)!
    expect(own.label).toBe('Vidrio del paño: Laminado 3+3')
    expect(nodeGlassId(own.design, id)).toEqual({ glassId: 'laminado-3-3', own: true })
    const back = clearNodeGlass(own.design, id)!
    expect(nodeGlassId(back.design, id)).toEqual({ glassId: 'dvh-4-12-4', own: false })
    expect(leaf(back.design, id).glassId).toBeUndefined()
    expect(clearNodeGlass(back.design, id)).toBeNull()
  })

  it('panel ciego en puertas', () => {
    const d = make('door', 900, 2100, 'serie-puerta-70')
    const change = setFill(d, d.root.id, 'panel')!
    expect(leaf(change.design, d.root.id).fill).toBe('panel')
    expect(setFill(change.design, d.root.id, 'panel')).toBeNull()
  })
})

describe('correderas', () => {
  it('hoja fija y móvil con sentido', () => {
    const d = make('sliding_2', 1500, 1200)
    const root = d.root
    if (root.type !== 'sliding') throw new Error('debía ser corredera')
    const [a] = root.panels
    const fixed = setPanelKind(d, a.id, 'fixed')!
    const pa = fixed.design.root.type === 'sliding' ? fixed.design.root.panels[0] : null
    expect(pa).toMatchObject({ id: a.id, kind: 'fixed' })
    expect(pa?.direction).toBeUndefined()
    const moving = setPanelDirection(fixed.design, a.id, 'left')!
    expect(moving.design.root.type === 'sliding' && moving.design.root.panels[0]).toMatchObject({ kind: 'moving', direction: 'left' })
    expect(setPanelDirection(moving.design, a.id, 'left')).toBeNull()
    // El motor sigue calculando la corredera sin errores.
    expect(computeBom(moving.design, catalog).warnings.filter((w) => w.level === 'error')).toEqual([])
  })

  it('número de hojas y rieles', () => {
    const d = make('sliding_2', 2400, 1200)
    const three = setPanelCount(d, 3)!
    expect(three.design.root.type === 'sliding' && three.design.root.panels).toHaveLength(3)
    const rails = setRails(three.design, 3)!
    expect(rails.design.root.type === 'sliding' && rails.design.root.rails).toBe(3)
    expect(setRails(rails.design, 3)).toBeNull()
    expect(setPanelCount(make('fixed'), 3)).toBeNull()
  })
})

describe('selección', () => {
  it('reconoce paño, división, hoja y corredera', () => {
    const d = make('fixed_casement')
    const split = d.root as SplitNode
    expect(resolveSelection(d, split.children[0].id)?.kind).toBe('leaf')
    expect(resolveSelection(d, split.id)?.kind).toBe('split')
    expect(resolveSelection(d, 'nada')).toBeNull()
    expect(resolveSelection(d, null)).toBeNull()
    const s = make('sliding_3', 2400, 1200)
    const root = s.root
    if (root.type !== 'sliding') throw new Error('debía ser corredera')
    expect(resolveSelection(s, root.panels[1].id)).toMatchObject({ kind: 'panel', index: 1 })
    expect(resolveSelection(s, root.id)?.kind).toBe('sliding')
  })

  it('nombres humanos en orden de lectura', () => {
    const d = make('casement_fixed_casement', 1800, 1200)
    const ids = selectableIds(d)
    expect(ids).toHaveLength(3)
    expect(nodeTitle(d, ids[1])).toBe('Paño 2')
    expect(nodeSummary(d, ids[0])).toBe('Abatible, bisagras a la izquierda (vista interior)')
    expect(nodeSummary(d, ids[1])).toBe('Fijo')
    const s = make('sliding_2_fixed', 1500, 1200)
    const sid = selectableIds(s)
    expect(nodeTitle(s, sid[0])).toBe('Hoja 1 de 2')
    expect(nodeSummary(s, sid[0])).toBe('Hoja fija')
    expect(nodeSummary(s, sid[1])).toBe('Hoja móvil, abre hacia la izquierda')
  })
})
