import { describe, expect, it } from 'vitest'
import { applyDocOps, getDocPreset, type DocOp, type DocTemplate } from '@dekopen/shared'
import { changeCount, diffTemplates } from './diff'

const luz = (): DocTemplate => getDocPreset('hogar')
const edit = (ops: DocOp[], base = luz()): DocTemplate => {
  const r = applyDocOps(base, ops, { mode: 'atomic' })
  expect(r.ok).toBe(true)
  return r.result
}

describe('diferencias entre plantillas (propuesta de la IA)', () => {
  it('plantillas iguales no tienen cambios', () => {
    expect(diffTemplates(luz(), luz())).toEqual([])
  })

  it('detecta nombre, color, tema y página', () => {
    const next = edit([
      { op: 'rename', name: 'Otra' },
      { op: 'setColor', role: 'accent', value: '#B4531F' },
      { op: 'setTheme', patch: { density: 'airy' } },
      { op: 'setPage', patch: { size: luz().page.size === 'A4' ? 'Letter' : 'A4' } },
    ])
    const changes = diffTemplates(luz(), next)
    const kinds = changes.map((c) => c.kind)
    expect(kinds).toEqual(expect.arrayContaining(['name', 'color', 'theme', 'page']))
    const color = changes.find((c) => c.kind === 'color')
    expect(color).toMatchObject({ role: 'accent', after: '#B4531F' })
    expect(changeCount(changes)).toBe(changes.length)
  })

  it('detecta secciones ocultas, mostradas, agregadas, quitadas y el cambio de orden', () => {
    const base = luz()
    const warranty = base.sections.find((s) => s.type === 'warranty')!
    const hidden = edit([{ op: 'toggleSection', sectionId: warranty.id, enabled: false }])
    expect(diffTemplates(base, hidden)).toContainEqual(expect.objectContaining({ kind: 'sectionHidden' }))
    expect(diffTemplates(hidden, base)).toContainEqual(expect.objectContaining({ kind: 'sectionShown' }))

    const added = edit([{ op: 'addSection', section: { type: 'custom_text' } }])
    expect(diffTemplates(base, added).filter((c) => c.kind === 'sectionAdded')).toHaveLength(1)
    expect(diffTemplates(added, base).filter((c) => c.kind === 'sectionRemoved')).toHaveLength(1)

    const letter = base.sections.find((s) => s.type === 'letter')
    const terms = base.sections.find((s) => s.type === 'terms')
    if (letter && terms) {
      const moved = edit([{ op: 'moveSection', sectionId: terms.id, beforeId: letter.id }])
      expect(diffTemplates(base, moved)).toContainEqual({ kind: 'order' })
    }
  })

  it('un cambio de opciones de una sección dice qué opción cambió', () => {
    const base = luz()
    const items = base.sections.find((s) => s.type === 'items')!
    const current = (items.options as { showArea?: boolean }).showArea
    const next = edit([{ op: 'updateSectionOptions', sectionId: items.id, options: { showArea: !current } }])
    const change = diffTemplates(base, next).find((c) => c.kind === 'sectionChanged')
    expect(change).toMatchObject({ kind: 'sectionChanged', keys: ['showArea'] })
  })

  it('comparar con otro diseño entero da muchos cambios de tipografía y color', () => {
    const changes = diffTemplates(getDocPreset('hogar'), getDocPreset('atelier'))
    expect(changes.length).toBeGreaterThan(5)
    expect(changes.some((c) => c.kind === 'fonts')).toBe(true)
  })
})
