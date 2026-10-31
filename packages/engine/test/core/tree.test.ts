import { describe, expect, it } from 'vitest'
import { collectLeaves, computeBom, computeLayout, findNode, findPanel, findParent, mapNode, nextId, nodePath, openingLabel, walkNodes } from '../../src/core'
import type { DesignNode, Opening } from '../../src/types'
import { design, prolineCatalog } from './fixtures'

// Árboles que el servidor acepta (solo valida root.type) y que antes lanzaban
// «Cannot read properties of undefined (reading 'map')» o «… is not iterable».
const node = (raw: unknown) => raw as DesignNode
const SPLIT_NO_CHILDREN = node({ id: 'r', type: 'split' })
const SLIDING_NO_PANELS = node({ id: 'r', type: 'sliding' })
const JUNK_CHILDREN = node({ id: 'r', type: 'split', dir: 'vertical', children: [null, 5, { id: 'a', type: 'leaf', opening: { kind: 'fixed' } }, { id: 's', type: 'split' }] })

describe('recorridos del árbol con diseños incompletos', () => {
  it('walkNodes y collectLeaves ignoran ramas rotas', () => {
    const seen: string[] = []
    walkNodes(JUNK_CHILDREN, (n) => seen.push(n.id))
    expect(seen).toEqual(['r', 'a', 's'])
    expect(collectLeaves(SPLIT_NO_CHILDREN)).toEqual([])
    expect(collectLeaves(SLIDING_NO_PANELS)).toEqual([])
    expect(collectLeaves(JUNK_CHILDREN).map((l) => l.id)).toEqual(['a'])
    expect(collectLeaves(node(undefined))).toEqual([])
  })

  it('búsquedas devuelven undefined en vez de lanzar', () => {
    expect(findNode(SPLIT_NO_CHILDREN, 'x')).toBeUndefined()
    expect(findNode(JUNK_CHILDREN, 'a')?.id).toBe('a')
    expect(findPanel(SLIDING_NO_PANELS, 'p')).toBeUndefined()
    expect(findPanel(node({ id: 'r', type: 'sliding', panels: [null, { id: 'p', kind: 'fixed' }] }), 'p')?.id).toBe('p')
    expect(findParent(SPLIT_NO_CHILDREN, 'x')).toBeUndefined()
    expect(findParent(JUNK_CHILDREN, 'a')?.index).toBe(2)
    expect(nodePath(SPLIT_NO_CHILDREN, 'x')).toBeUndefined()
    expect(nodePath(SLIDING_NO_PANELS, 'p')).toBeUndefined()
    expect(nodePath(JUNK_CHILDREN, 'a')).toEqual(['r', 'a'])
    expect(findNode({ version: 1, lineId: 'l', width: 1, height: 1, colorId: 'c', glassId: 'g', root: node(undefined) }, 'x')).toBeUndefined()
  })

  it('mapNode deja intacto un árbol sin hijos y reemplaza dentro de uno con basura', () => {
    expect(mapNode(SPLIT_NO_CHILDREN, 'x', (n) => n)).toBe(SPLIT_NO_CHILDREN)
    const next = mapNode(JUNK_CHILDREN, 'a', (n) => ({ ...n, id: 'b' }))
    expect(collectLeaves(next).map((l) => l.id)).toEqual(['b'])
  })

  it('openingLabel sin apertura cae en «Fijo»', () => {
    expect(openingLabel(undefined as unknown as Opening)).toBe('Fijo')
  })

  it('nextId tolera correderas sin paneles o con paneles nulos', () => {
    expect(nextId(node({ id: 'n3', type: 'sliding' }))).toBe('n4')
    expect(nextId(node({ id: 'n2', type: 'sliding', panels: [null, { id: 'n7', kind: 'fixed' }] }))).toBe('n8')
  })

  it('corredera sin paneles en una línea practicable: layout y despiece no lanzan', () => {
    // convertRoot (corredera → practicable) numera ids con idFactory → walkNodes → paneles.
    const d = design({ width: 1200, height: 1000, root: SLIDING_NO_PANELS })
    const catalog = prolineCatalog()
    expect(() => computeLayout(d, catalog)).not.toThrow()
    expect(() => computeBom(d, catalog)).not.toThrow()
  })
})
