import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkOrder } from '@dekopen/shared'
import { applyUpdate, fetchServerPdf, pdfUrl } from './data'
import { previewZoom, paperWidthPx } from './detail/DocumentPreview'
import { BROWSER_PRINT_LIMITS, PREVIEW_LIMITS, browserPrintNotice, previewFooter } from './model/preview'

const base: WorkOrder = {
  id: 'w1',
  number: 38,
  quoteId: 'q1',
  quoteNumber: 412,
  title: 'Casa Pérez',
  status: 'open',
  progress: { V1: 'cut', V2: 'cut' },
  dueDate: '2026-11-15',
  notes: 'Con cuidado',
  createdAt: '',
  updatedAt: '',
}

describe('cambios optimistas', () => {
  it('el avance actualiza el estado como el servidor', () => {
    const moved = applyUpdate(base, { progress: { V1: 'weld' } })
    expect(moved.progress).toEqual({ V1: 'weld', V2: 'cut' })
    expect(moved.status).toBe('in_progress')
    expect(applyUpdate(base, { progress: { V1: 'ready', V2: 'installed' } }).status).toBe('done')
    expect(base.progress.V1).toBe('cut')
  })

  it('null borra la fecha o las notas; undefined no toca', () => {
    const cleared = applyUpdate(base, { dueDate: null, notes: null })
    expect(cleared.dueDate).toBeUndefined()
    expect(cleared.notes).toBeUndefined()
    expect(applyUpdate(base, {}).dueDate).toBe('2026-11-15')
    expect(applyUpdate(base, { notes: 'Nueva' }).notes).toBe('Nueva')
  })
})

describe('PDF del servidor con respaldo', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('arma la URL con el tipo y los parámetros', () => {
    expect(pdfUrl('w 1', 'labels', { format: 'roll', brandId: undefined, glass: 1 })).toBe('/api/work-orders/w%201/pdf?doc=labels&format=roll&glass=1')
  })

  it('devuelve el PDF solo si de verdad es un PDF', async () => {
    const pdf = new Blob(['%PDF-1.7'], { type: 'application/pdf' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(pdf, { status: 200, headers: { 'content-type': 'application/pdf' } })))
    expect(await fetchServerPdf('/x')).toBeInstanceOf(Blob)

    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{}}', { status: 404, headers: { 'content-type': 'application/json' } })))
    expect(await fetchServerPdf('/x')).toBeNull()

    // El fallback SPA devuelve HTML con 200: no es un PDF.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html>', { status: 200, headers: { 'content-type': 'text/html' } })))
    expect(await fetchServerPdf('/x')).toBeNull()

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    expect(await fetchServerPdf('/x')).toBeNull()
  })
})

describe('vista previa', () => {
  it('escala la hoja al ancho disponible sin agrandarla', () => {
    expect(paperWidthPx('letter')).toBeCloseTo(816, 0)
    expect(previewZoom(408, 'letter')).toBeCloseTo(0.5, 2)
    expect(previewZoom(2000, 'letter')).toBe(1)
    expect(previewZoom(0, 'a4')).toBe(0.5)
    expect(previewZoom(50, 'a4')).toBe(0.25)
  })

  it('la muestra se corta por piezas (etiquetas, barras, hojas), no por ventanas', () => {
    expect(PREVIEW_LIMITS.labels).toBe(30)
    expect(previewFooter(28, 28, 'labels')).toBeUndefined()
    expect(previewFooter(30, 5600, 'labels')).toBe('Muestra de las primeras 30 etiquetas. Al imprimir salen las 5.600.')
    expect(previewFooter(60, 6330, 'bars')).toBe('Muestra de las primeras 60 barras. Al imprimir salen las 6.330.')
  })

  it('sobre cierto tamaño, el documento no se arma en el navegador', () => {
    expect(browserPrintNotice(BROWSER_PRINT_LIMITS.labels, BROWSER_PRINT_LIMITS.labels, 'labels')).toBeUndefined()
    expect(browserPrintNotice(28_000, BROWSER_PRINT_LIMITS.labels, 'labels')).toBe(
      'Son 28.000 etiquetas: es demasiado para armarlo en el navegador sin trabarlo.',
    )
    expect(browserPrintNotice(Number.NaN, 10, 'bars')).toBeUndefined()
  })
})

describe('fecha comprometida escrita a mano', () => {
  it('ignora los años a medio escribir', async () => {
    const { isPlausibleDueDate } = await import('./detail/OrderFields')
    expect(isPlausibleDueDate('0002-11-15')).toBe(false)
    expect(isPlausibleDueDate('0202-11-15')).toBe(false)
    expect(isPlausibleDueDate('2026-11-15')).toBe(true)
    expect(isPlausibleDueDate('')).toBe(false)
  })
})
