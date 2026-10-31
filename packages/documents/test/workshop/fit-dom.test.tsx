// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { fitWorkshopSheets } from '../../src/workshop'

/**
 * jsdom no calcula layout: simulamos offsetTop/offsetHeight. Cada hijo de la hoja mide lo que
 * dice su data-h (en px) y se reduce un 10 % con «fzw-tight» y un 18 % con «fzw-tighter». La sonda
 * de página mide 960 px (alto útil), 14 mm = 53 px y 90 mm = 340 px.
 */
function sizeOf(el: HTMLElement): number {
  if (el.style.height.includes('calc')) return 960
  if (el.style.height === '14mm') return 53
  if (el.style.height === '90mm') return 340
  const base = Number(el.dataset.h ?? 0)
  const sheet = el.closest('.fzw-sheet')
  const factor = sheet?.classList.contains('fzw-tighter') ? 0.82 : sheet?.classList.contains('fzw-tight') ? 0.9 : 1
  return base * factor
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return sizeOf(this)
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
    configurable: true,
    get(this: HTMLElement) {
      let top = 0
      let prev = this.previousElementSibling as HTMLElement | null
      while (prev) {
        top += sizeOf(prev)
        prev = prev.previousElementSibling as HTMLElement | null
      }
      return top
    },
  })
})

afterEach(() => {
  document.body.innerHTML = ''
})

function doc(heights: number[][], fit = true): HTMLElement {
  const root = document.createElement('div')
  root.className = 'fzw-doc'
  if (fit) root.setAttribute('data-fit', '')
  for (const sheetHeights of heights) {
    const sheet = document.createElement('section')
    sheet.className = 'fzw-sheet'
    for (const h of sheetHeights) {
      const child = document.createElement('div')
      child.dataset.h = String(h)
      sheet.appendChild(child)
    }
    sheet.appendChild(document.createElement('footer'))
    root.appendChild(sheet)
  }
  document.body.appendChild(root)
  return root
}

const classes = (root: HTMLElement) => [...root.querySelectorAll('.fzw-sheet')].map((s) => [...s.classList].filter((c) => c !== 'fzw-sheet').join(' '))

describe('fitWorkshopSheets', () => {
  it('compacta la hoja que se pasaría a otra página por unas pocas filas', () => {
    // 980 px: 20 px de más (una fila) → compacta y cabe en una página.
    const root = doc([[300, 680]])
    fitWorkshopSheets(root)
    expect(classes(root)).toEqual(['fzw-tight'])
  })

  it('no toca las hojas que caben ni las que necesitan de verdad otra página', () => {
    const root = doc([[300, 600], [300, 1200]])
    fitWorkshopSheets(root)
    expect(classes(root)).toEqual(['', ''])
  })

  it('usa el nivel más compacto solo si hace falta, y si ni así cabe la deja como estaba', () => {
    // 1100 px: con −10 % queda en 990 (no cabe), con −18 % en 902 (cabe).
    const root = doc([[400, 700], [500, 750]])
    fitWorkshopSheets(root)
    // 1250 px: sobran 290 px (< 340), pero ni con −18 % (1025) cabe → sin cambios.
    expect(classes(root)).toEqual(['fzw-tight fzw-tighter', ''])
  })

  it('simula los bloques que no se parten: pasan enteros a la hoja siguiente', () => {
    // Continuo serían 1.850 px (caben en 2 hojas de 960 + 907), pero el bloque de 900 que no se
    // parte salta entero a la 2.ª hoja y los últimos 50 px caen en una 3.ª: se compacta.
    const root = doc([[900, 900, 50]])
    const avoid = root.querySelectorAll('.fzw-sheet > div')[1] as HTMLElement
    avoid.dataset.avoid = ''
    const real = window.getComputedStyle.bind(window)
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element) => {
      const style = real(el)
      if ((el as HTMLElement).dataset?.avoid !== undefined) Object.defineProperty(style, 'breakInside', { value: 'avoid-page' })
      return style
    })
    try {
      fitWorkshopSheets(root)
    } finally {
      spy.mockRestore()
    }
    expect(classes(root)).toEqual(['fzw-tight'])
    // Sin el bloque que no se parte, 1.850 px ya caben en 2 hojas: no se toca.
    const plain = doc([[900, 900, 50]])
    fitWorkshopSheets(plain)
    expect(classes(plain)).toEqual([''])
  })

  it('mide la hoja como bloque (como al imprimir) y la deja como estaba', () => {
    const root = doc([[300, 680]])
    const sheet = root.querySelector('.fzw-sheet') as HTMLElement
    sheet.style.display = 'flex'
    fitWorkshopSheets(root)
    expect(sheet.style.display).toBe('flex')
    const bare = doc([[300, 680]])
    fitWorkshopSheets(bare)
    expect((bare.querySelector('.fzw-sheet') as HTMLElement).hasAttribute('style')).toBe(false)
  })

  it('solo actúa en documentos marcados para ajustar y se puede repetir', () => {
    const plain = doc([[300, 680]], false)
    fitWorkshopSheets(document)
    expect(classes(plain)).toEqual([''])
    const marked = doc([[300, 680]])
    fitWorkshopSheets(document)
    fitWorkshopSheets(document)
    expect(classes(marked)).toEqual(['fzw-tight'])
    expect(marked.querySelectorAll('div[style]').length).toBe(0) // la sonda no queda en la hoja
  })
})
