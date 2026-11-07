import { describe, expect, it } from 'vitest'
import { getDocPreset, type DocOp } from '@dekopen/shared'
import { applyQuoteOps, isEmptyOverrides, mergedTemplate, normalizeOverrides, overrideCount } from './model'

const luz = getDocPreset('hogar')
const sectionOf = (type: string) => luz.sections.find((s) => s.type === type)!

describe('ajustes del documento de una cotización', () => {
  it('normaliza v1, v2 y vacío sin perder datos', () => {
    expect(isEmptyOverrides(normalizeOverrides(undefined))).toBe(true)
    expect(isEmptyOverrides(normalizeOverrides('basura'))).toBe(true)
    const v1 = normalizeOverrides({ intro: 'Hola', quoteTemplate: 'galeria', validityDays: 30, notes: 'Incluye sellado' })
    expect(v1.texts?.intro).toBe('Hola')
    expect(v1.templateId).toBe('hogar')
    expect(v1.validityDays).toBe(30)
    expect(v1.texts?.clientNote).toBe('Incluye sellado')
  })

  it('oculta una sección sólo en esta cotización y devuelve un v2 compacto con su etiqueta', () => {
    const warranty = sectionOf('warranty')
    const r = applyQuoteOps(undefined, [{ op: 'toggleSection', sectionId: warranty.id, enabled: false }], luz)
    expect(r.ok).toBe(true)
    expect(r.changed).toBe(true)
    expect(r.next?.sections?.[warranty.id]).toMatchObject({ type: 'warranty', enabled: false })
    expect(r.label).toBeTruthy()
    expect(mergedTemplate(luz, r.next).sections.find((s) => s.id === warranty.id)?.enabled).toBe(false)
    // La plantilla de la empresa no se tocó.
    expect(luz.sections.find((s) => s.id === warranty.id)?.enabled).toBe(true)
  })

  it('no deja ocultar lo obligatorio y deja los problemas', () => {
    const items = sectionOf('items')
    const r = applyQuoteOps(undefined, [{ op: 'toggleSection', sectionId: items.id, enabled: false }], luz)
    expect(r.ok).toBe(false)
    expect(r.next).toBeNull()
    expect(r.issues.some((i) => i.severity === 'error')).toBe(true)
  })

  it('textos propios, vigencia, idioma y notas por ventana; null los devuelve a la empresa', () => {
    const ops: DocOp[] = [
      { op: 'setText', field: 'intro', value: 'Estimada Carolina' },
      { op: 'setValidityDays', days: 30 },
      { op: 'setLocale', locale: 'pt' },
      { op: 'setItemNote', itemId: 'i1', note: 'Con celosía' },
    ]
    const first = applyQuoteOps(undefined, ops, luz)
    expect(first.next).toMatchObject({ v: 2, texts: { intro: 'Estimada Carolina' }, validityDays: 30, locale: 'pt', items: { i1: { note: 'Con celosía' } } })
    expect(overrideCount(first.next)).toBe(4)
    const back = applyQuoteOps(first.next, [{ op: 'setText', field: 'intro', value: null }, { op: 'setLocale', locale: null }], luz)
    expect(back.next?.texts?.intro).toBeUndefined()
    expect(back.next?.locale).toBeUndefined()
    expect(back.next?.validityDays).toBe(30)
  })

  it('«quitar los ajustes» deja la cotización sin ajustes (null: se borra la clave)', () => {
    const set = applyQuoteOps(undefined, [{ op: 'setText', field: 'footer', value: 'Banco · Cuenta' }], luz)
    expect(set.next).not.toBeNull()
    const cleared = applyQuoteOps(set.next, [{ op: 'reset', scope: 'all' }], luz)
    expect(cleared.next).toBeNull()
    expect(overrideCount(cleared.next)).toBe(0)
  })

  it('cambiar de plantilla y volver a la de la empresa', () => {
    const chosen = applyQuoteOps(undefined, [{ op: 'setTemplate', templateId: 'memoria' }], luz)
    expect(chosen.next?.templateId).toBe('memoria')
    expect(applyQuoteOps(chosen.next, [{ op: 'reset', scope: 'template' }], luz).next).toBeNull()
  })

  it('rechaza HTML y scripts en un texto, sin cambiar nada', () => {
    const r = applyQuoteOps(undefined, [{ op: 'setText', field: 'intro', value: '<img src=x onerror=alert(1)>' }], luz)
    expect(r.ok).toBe(false)
    expect(r.next).toBeNull()
  })

  it('una operación que no cambia nada no avisa', () => {
    const r = applyQuoteOps(undefined, [{ op: 'setLocale', locale: null }], luz)
    expect(r.changed).toBe(false)
  })
})
