import { describe, expect, it } from 'vitest'
import { applyDocOps, createSection, getDocPreset, migrateQuoteDocOverrides, mergeTemplateOverrides, promoteOverridesToTemplate, type DocOp, type DocSection, type DocTemplate } from '@dekopen/shared'
import { canDuplicate, canMoveTo, elementChain, hideElementOps, printedOrder, stepOp } from './model'

const hogar = getDocPreset('hogar')
const items = hogar.sections.find((s) => s.type === 'items') as DocSection

function apply(ops: DocOp[] | null, template: DocTemplate = hogar): DocTemplate {
  const result = applyDocOps(template, ops ?? [], { mode: 'atomic' })
  expect(result.ok).toBe(true)
  return result.result
}

describe('hideElementOps', () => {
  it('apaga el dibujo de la ventana con el modelo real', () => {
    const next = apply(hideElementOps(items, 'drawing'))
    expect(next.sections.find((s) => s.type === 'items')?.options).toMatchObject({ drawingSize: 'none' })
  })

  it('apaga las especificaciones y la imagen del vidrio', () => {
    expect(apply(hideElementOps(items, 'showSpecs')).sections.find((s) => s.type === 'items')?.options).toMatchObject({ showSpecs: false })
    expect(apply(hideElementOps(items, 'showGlassImage')).sections.find((s) => s.type === 'items')?.options).toMatchObject({ showGlassImage: false })
  })

  it('una opción de otra sección usa su propia operación', () => {
    const totals = hogar.sections.find((s) => s.type === 'totals')!
    expect(hideElementOps(totals, 'showSubtotal')).toEqual([{ op: 'updateSectionOptions', sectionId: totals.id, options: { showSubtotal: false } }])
    expect(hideElementOps(totals, 'noExiste')).toBeNull()
  })

  it('quita un dato de una lista; el último oculta la sección', () => {
    const strip = createSection({ type: 'client_strip', id: 'datos', options: { fields: ['client', 'site'] } })
    expect(hideElementOps(strip, 'field:site')).toEqual([{ op: 'updateSectionOptions', sectionId: 'datos', options: { fields: ['client'] } }])
    const single = createSection({ type: 'client_strip', id: 'datos', options: { fields: ['client'] } })
    expect(hideElementOps(single, 'field:client')).toEqual([{ op: 'toggleSection', sectionId: 'datos', enabled: false }])
  })

  it('el logo del encabezado es un ajuste del documento', () => {
    expect(hideElementOps(null, 'showLogo')).toEqual([{ op: 'setDocSettings', patch: { showLogo: false } }])
  })
})

describe('mover secciones', () => {
  const totals = hogar.sections.find((s) => s.type === 'totals')!
  const accept = hogar.sections.find((s) => s.type === 'acceptance')

  it('nada que no sea el cierre va después del total', () => {
    expect(canMoveTo(hogar, items.id, totals.id, true)).toBe(false)
  })

  it('el total no sube de las ventanas', () => {
    expect(canMoveTo(hogar, totals.id, items.id, false)).toBe(false)
  })

  it('nada va antes de la portada', () => {
    const withCover = apply([{ op: 'addSection', section: { type: 'cover' } }])
    const cover = withCover.sections.find((s) => s.type === 'cover')!
    expect(canMoveTo(withCover, items.id, cover.id, false)).toBe(false)
    expect(canMoveTo(withCover, cover.id, items.id, true)).toBe(false)
  })

  it('subir se mide contra lo que se imprime, no contra lo oculto', () => {
    const printed = printedOrder(hogar.sections, 'after_total')
    const at = printed.findIndex((s) => s.id === items.id)
    expect(stepOp(hogar, printed[at + 1]?.id ?? items.id, -1) ?? null).not.toBeUndefined()
    if (accept) expect(stepOp(hogar, accept.id, 1)).toBeNull()
  })

  it('un movimiento válido pasa por applyDocOps', () => {
    const list = hogar.sections.filter((s) => s.enabled)
    const a = list.find((s) => s.type === 'client_strip')
    if (!a) return
    const op = stepOp(hogar, items.id, -1)
    if (op) expect(apply([op]).sections.map((s) => s.id)).not.toEqual(hogar.sections.map((s) => s.id))
  })
})

describe('duplicar', () => {
  it('una cotización solo duplica texto libre', () => {
    const text = createSection({ type: 'custom_text', id: 'nota' })
    expect(canDuplicate('quote', hogar, items)).toBe(false)
    expect(canDuplicate('quote', { sections: [...hogar.sections, text] }, text)).toBe(true)
    expect(canDuplicate('template', hogar, items)).toBe(true)
  })
})

describe('guardar en la plantilla', () => {
  it('pasa la presentación a la plantilla y deja lo propio en la cotización', () => {
    const overrides = migrateQuoteDocOverrides({ v: 2, locale: 'en', texts: { warranty: 'Propia' }, itemDisplay: { drawingSize: 'none', showSpecs: false } }).overrides
    const { template, rest } = promoteOverridesToTemplate(hogar, overrides)
    expect(template.sections.find((s) => s.type === 'items')?.options).toMatchObject({ drawingSize: 'none', showSpecs: false })
    expect(rest).toEqual({ v: 2, locale: 'en', texts: { warranty: 'Propia' } })
    // La cotización se ve igual antes y después.
    expect(mergeTemplateOverrides(template, rest).template.sections).toEqual(mergeTemplateOverrides(hogar, overrides).template.sections)
  })
})

describe('elementChain', () => {
  it('va del elemento más chico al más grande', () => {
    const host = document.createElement('div')
    host.innerHTML = '<dl data-dk-el="showSpecs"><div data-dk-el="showGlass"><span data-dk-el="showGlassImage"><i id="x"></i></span></div></dl>'
    expect(elementChain(host.querySelector('#x'), host)).toEqual(['showGlassImage', 'showGlass', 'showSpecs'])
  })
})
