import { describe, expect, it } from 'vitest'
import { createDesign, describeDesign, designName, matchTypology, openingLabel, setColor, setOpening, TYPOLOGIES } from '../../src/core'
import type { DesignNode, SplitNode, WindowDesign } from '../../src/types'
import { design, prolineCatalog } from './fixtures'

const catalog = prolineCatalog()
const base = { lineId: 'pro6004', colorId: 'blanco', glassId: 'dvh-4-12-4' }

describe('describeDesign', () => {
  it('corredera: «Corredera 2 hojas · PROSLD70 · Blanco · DVH 4+12+4»', () => {
    const d = createDesign('sliding_2', { ...base, lineId: 'prosld70', width: 1475, height: 1135 })
    expect(describeDesign(d, catalog)).toBe('Corredera 2 hojas · PROSLD70 · Blanco · DVH 4+12+4')
  })

  it('bicolor y datos faltantes', () => {
    const d = setColor(createDesign('fixed_casement', base), 'winchester', 'blanco')
    expect(describeDesign(d, catalog)).toBe('Fijo + abatible · PRO6004 · Winchester exterior / Blanco interior · DVH 4+12+4')
    expect(describeDesign({ ...d, lineId: 'x', glassId: 'y' }, catalog)).toBe('Fijo + abatible · Winchester exterior / Blanco interior')
  })

  it('cada tipología se reconoce a sí misma', () => {
    for (const t of TYPOLOGIES) {
      const d = createDesign(t.id, { ...base, width: 1777, height: 1333 })
      expect(matchTypology(d)).toBe(t.id)
      expect(designName(d)).toBe(t.name)
    }
  })

  it('ignora bisagras y medidas; diseños libres reciben un nombre compuesto', () => {
    const flipped = setOpening(createDesign('fixed_casement', base), 'n3', { kind: 'casement', hinge: 'left', direction: 'in' })
    expect(matchTypology(flipped)).toBe('fixed_casement')
    const custom: WindowDesign = design({
      width: 2400,
      height: 1200,
      root: {
        id: 'n1',
        type: 'split',
        dir: 'vertical',
        sizes: [null, null, null],
        children: [
          { id: 'n2', type: 'leaf', opening: { kind: 'fixed' } },
          { id: 'n3', type: 'leaf', opening: { kind: 'tilt_turn', hinge: 'left' } },
          { id: 'n4', type: 'leaf', opening: { kind: 'casement', hinge: 'right' } },
        ],
      },
    })
    expect(matchTypology(custom)).toBeUndefined()
    expect(designName(custom)).toBe('Fijo + oscilobatiente + abatible')
    // Fijo + oscilobatiente + fijo es tipología propia desde v5.
    const ftf = { ...custom, root: { ...custom.root, children: [...(custom.root as SplitNode).children.slice(0, 2), { id: 'n4', type: 'leaf', opening: { kind: 'fixed' } }] } } as WindowDesign
    expect(matchTypology(ftf)).toBe('fixed_tilt_turn_fixed')
    expect(designName(ftf)).toBe('Fijo + oscilobatiente + fijo')
  })
})

describe('diseños incompletos (guardados sin validar el árbol)', () => {
  // El servidor solo valida root.type: estos árboles llegan desde la base y no deben tumbar la vista.
  const broken = (root: unknown, extra: Partial<WindowDesign> = {}): WindowDesign => ({
    ...design({ width: 1200, height: 1000, root: root as DesignNode }),
    ...extra,
  })
  const LEAF_FIXED = { id: 'a', type: 'leaf', opening: { kind: 'fixed' } }

  it('división sin hijos, corredera sin paneles o hijos basura: nombre genérico, sin excepción', () => {
    for (const root of [
      { id: 'r', type: 'split' },
      { id: 'r', type: 'split', children: [null, 5] },
      { id: 'r', type: 'split', dir: 'vertical', children: 'x' },
      { id: 'r' },
      null,
      undefined,
      5,
    ]) {
      expect(matchTypology(broken(root))).toBeUndefined()
      expect(designName(broken(root))).toBe('Ventana')
    }
    // 300 mm de flecha en 1.200 de ancho es un arco rebajado; 600 es medio punto.
    expect(designName(broken({ id: 'r', type: 'split' }, { shape: { kind: 'arch', rise: 300 } }))).toBe('Arco rebajado · ventana')
    expect(designName(broken({ id: 'r', type: 'split' }, { shape: { kind: 'arch', rise: 600 } }))).toBe('Arco · ventana')
  })

  it('corredera sin paneles (o con paneles nulos) se nombra «Corredera»', () => {
    expect(matchTypology(broken({ id: 'r', type: 'sliding' }))).toBeUndefined()
    expect(designName(broken({ id: 'r', type: 'sliding' }))).toBe('Corredera')
    expect(designName(broken({ id: 'r', type: 'sliding', rails: 2, panels: 7 }))).toBe('Corredera')
    expect(designName(broken({ id: 'r', type: 'sliding', rails: 2, panels: [null, { id: 'p', kind: 'sliding' }] }))).toBe('Corredera 2 hojas')
    expect(describeDesign(broken({ id: 'r', type: 'sliding' }), catalog)).toBe('Corredera · PRO6004 · Blanco · DVH 4+12+4')
  })

  it('ramas rotas dentro de un árbol válido se ignoran y el resto conserva su nombre', () => {
    const root = { id: 'r', type: 'split', dir: 'vertical', children: [LEAF_FIXED, { id: 's', type: 'split' }, { id: 'c', type: 'sliding' }, null] }
    expect(matchTypology(broken(root))).toBeUndefined()
    expect(designName(broken(root))).toBe('Paño fijo')
    // Sin ids ni sizes la estructura aún se reconoce como tipología.
    const lax = { type: 'split', dir: 'vertical', children: [{ type: 'leaf', opening: { kind: 'fixed' } }, { type: 'leaf', opening: { kind: 'casement' } }] }
    expect(matchTypology(broken(lax))).toBe('fixed_casement')
  })
})

describe('openingLabel', () => {
  it('nombres cortos y detalle de bisagras', () => {
    expect(openingLabel({ kind: 'fixed' })).toBe('Fijo')
    expect(openingLabel({ kind: 'casement', direction: 'in' })).toBe('Abatible')
    expect(openingLabel({ kind: 'casement', direction: 'out' })).toBe('Abatible exterior')
    expect(openingLabel({ kind: 'awning' })).toBe('Proyectante')
    expect(openingLabel({ kind: 'tilt' })).toBe('Oscilante')
    expect(openingLabel({ kind: 'door', hinge: 'right' }, true)).toBe('Puerta, bisagras a la derecha (vista interior)')
  })
})
