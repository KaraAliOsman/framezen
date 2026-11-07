// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { QuoteDocument, buildSampleQuoteDoc } from '../../src/sales'
import { buildQuoteModel, flowDocumentPages } from '../../src/templates'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * jsdom no calcula diseño: simulamos las medidas de Chromium. Cada bloque mide su alto estimado
 * (`data-dk-h`) por un factor; el cuerpo de la hoja mide el alto útil del diseño; la hoja, su alto.
 */
const sim = { factor: 1, body: 0, lead: 0, page: 1056 }

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.hasAttribute('data-dk-block') || this.hasAttribute('data-dk-clone')) return Math.round(Number(this.getAttribute('data-dk-h') ?? 0) * sim.factor)
      if (this.classList.contains('dkd-page')) return sim.page
      return 0
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (!this.hasAttribute('data-dk-body')) return 0
      return this.parentElement?.classList.contains('dkd-page--lead') ? sim.lead : sim.body
    },
  })
})

let root: Root | undefined
let host: HTMLDivElement | undefined
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = undefined
  host = undefined
  sim.factor = 1
})

const data = buildSampleQuoteDoc({ items: 8 })
const model = buildQuoteModel(data, { template: 'hogar' })
sim.body = model.page.bodyHeight
sim.lead = model.page.leadBodyHeight
sim.page = model.page.height

const staticHtml = () => renderToStaticMarkup(<QuoteDocument data={data} template="hogar" measure={false} />)
const pagesIn = (el: ParentNode) => el.querySelectorAll('.dkd-page').length

describe('paginación medida (Chromium antes de imprimir)', () => {
  it('con los altos estimados repartir de nuevo no cambia nada y es idempotente', () => {
    host = document.createElement('div')
    host.innerHTML = staticHtml()
    document.body.append(host)
    const before = pagesIn(host)
    flowDocumentPages(host)
    expect(pagesIn(host)).toBe(before)
    flowDocumentPages(host)
    expect(pagesIn(host)).toBe(before)
  })

  it('con alturas reales mayores abre hojas nuevas, las numera y no pierde ningún bloque', () => {
    host = document.createElement('div')
    host.innerHTML = staticHtml()
    document.body.append(host)
    const blocksBefore = [...host.querySelectorAll('[data-dk-block]')].map((b) => b.getAttribute('data-dk-block'))
    const before = pagesIn(host)
    sim.factor = 1.6
    flowDocumentPages(host)
    const after = pagesIn(host)
    expect(after).toBeGreaterThan(before)
    // Todos los bloques siguen, en el mismo orden.
    expect([...host.querySelectorAll('[data-dk-block]')].map((b) => b.getAttribute('data-dk-block'))).toEqual(blocksBefore)
    // La numeración «Página X de Y» se corrige en cada hoja (la portada no lleva pie).
    const total = host.querySelector('[data-dk-flow]')?.getAttribute('data-dk-flowed')
    expect(total).toBe(String(after))
    const numbers = [...host.querySelectorAll('[data-dk-pn]')].map((n) => Number(n.textContent))
    expect(numbers.length).toBeGreaterThan(0)
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b))
    expect(Math.max(...numbers)).toBe(after)
    for (const n of host.querySelectorAll('[data-dk-pt]')) expect(n.textContent).toBe(String(after))
    // Con medidas menores caben en menos hojas que antes.
    sim.factor = 0.7
    flowDocumentPages(host)
    expect(pagesIn(host)).toBeLessThanOrEqual(before)
  })

  it('la vista previa del navegador mide el DOM y vuelve a repartir con esos altos', () => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    act(() => root!.render(<QuoteDocument data={data} template="hogar" />))
    const estimated = pagesIn(host)
    expect(estimated).toBe(pagesIn(Object.assign(document.createElement('div'), { innerHTML: staticHtml() })))
    sim.factor = 1.6
    // Un cambio de datos fuerza una nueva medición con los altos simulados.
    act(() => root!.render(<QuoteDocument data={{ ...data, quote: { ...data.quote, title: `${data.quote.title} ` } }} template="hogar" />))
    expect(pagesIn(host)).toBeGreaterThan(estimated)
    // Nada se pinta como desborde cuando los bloques caben en una hoja.
    expect(host.querySelector('.dkd-block--overflow')).toBeNull()
  })
})
