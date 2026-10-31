import '../../../test/setup'
import { afterEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { ITEMS_ANCHOR, readAnchor, useDockAnchor } from './placement'

function column(rect: { left: number; top: number; width: number; height: number }, attrs: Record<string, string> = {}): HTMLElement {
  const el = document.createElement('aside')
  el.setAttribute('aria-label', 'Obra y ventanas')
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  el.getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => rect }) as DOMRect
  document.body.appendChild(el)
  return el
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('readAnchor', () => {
  it('redondea el rectángulo de la columna', () => {
    const el = column({ left: 232.4, top: 48, width: 264.2, height: 655.6 })
    expect(readAnchor(el)).toEqual({ left: 232, top: 48, width: 264, height: 656 })
  })

  it('sin columna o si es muy chica, el panel sigue flotando', () => {
    expect(readAnchor(null)).toBeNull()
    expect(readAnchor(column({ left: 0, top: 48, width: 180, height: 600 }))).toBeNull()
    expect(readAnchor(column({ left: 0, top: 48, width: 264, height: 300 }))).toBeNull()
  })

  it('reconoce la columna de ventanas del editor', () => {
    const el = column({ left: 232, top: 48, width: 264, height: 656 })
    expect(document.querySelector(ITEMS_ANCHOR)).toBe(el)
  })
})

describe('useDockAnchor', () => {
  it('se acopla en la columna y la deja inert solo mientras la tapa', () => {
    const el = column({ left: 232, top: 48, width: 264, height: 656 })
    const { result, rerender, unmount } = renderHook(({ on }) => useDockAnchor(on), { initialProps: { on: true } })
    expect(result.current).toEqual({ left: 232, top: 48, width: 264, height: 656 })
    expect(el.hasAttribute('inert')).toBe(true)

    rerender({ on: false })
    expect(result.current).toBeNull()
    expect(el.hasAttribute('inert')).toBe(false)

    rerender({ on: true })
    expect(el.hasAttribute('inert')).toBe(true)
    unmount()
    expect(el.hasAttribute('inert')).toBe(false)
  })

  it('sin columna no se acopla ni toca nada', () => {
    const { result } = renderHook(() => useDockAnchor(true))
    expect(result.current).toBeNull()
  })

  it('no quita un inert que puso otro', () => {
    const el = column({ left: 232, top: 48, width: 264, height: 656 }, { inert: '' })
    const { unmount } = renderHook(() => useDockAnchor(true))
    unmount()
    expect(el.hasAttribute('inert')).toBe(true)
  })
})
