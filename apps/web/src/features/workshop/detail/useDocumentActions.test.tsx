import '../../../../test/setup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { toast } from '../../../ui'
import { useDocumentActions, type DocumentRequest } from './useDocumentActions'

const PRINT_ROOT = 'fz-print-root'

function hook(simulated = false) {
  return renderHook(() => useDocumentActions({ orderId: 'w1', orderNumber: 38, simulated })).result
}

const huge: DocumentRequest = {
  kind: 'labels',
  element: <div className="doc">28.000 etiquetas</div>,
  params: { labels: 'sheet', glass: 1 },
  serverOnly: 'Son 28.000 etiquetas: es demasiado para armarlo en el navegador sin trabarlo.',
}

const fetchCalls = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.map(([url]) => String(url))

beforeEach(() => {
  vi.stubGlobal('print', vi.fn())
  // El servidor no devuelve un PDF (caído o sin el render): el respaldo sería imprimir en el navegador.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{}}', { status: 500, headers: { 'content-type': 'application/json' } })))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.getElementById(PRINT_ROOT)?.remove()
})

describe('documentos demasiado grandes para el navegador', () => {
  it('«Imprimir» pide el PDF al servidor y no monta el documento en la pestaña', async () => {
    const error = vi.spyOn(toast, 'error')
    const actions = hook()
    await act(async () => {
      actions.current.print(huge)
      await Promise.resolve()
    })
    // Antes se montaba aquí mismo con flushSync: con miles de etiquetas, la pestaña se congelaba o caía.
    expect(document.getElementById(PRINT_ROOT)).toBeNull()
    expect(fetchCalls()).toEqual(['/api/work-orders/w1/pdf?doc=labels&labels=sheet&glass=1'])
    await vi.waitFor(() => expect(error).toHaveBeenCalled())
    expect(String(error.mock.calls[0]?.[0])).toContain('No pudimos armar el PDF en el servidor. Son 28.000 etiquetas')
    expect(window.print).not.toHaveBeenCalled()
  })

  it('si el servidor falla al descargar, avisa en vez de armarlo en la pestaña', async () => {
    const actions = hook()
    await act(() => actions.current.download(huge))
    expect(fetchCalls()).toHaveLength(1)
    expect(document.getElementById(PRINT_ROOT)).toBeNull()
    expect(window.print).not.toHaveBeenCalled()
  })

  it('simulando cortes no hay PDF del servidor que sirva: se explica y no se arma nada', async () => {
    const error = vi.spyOn(toast, 'error')
    const actions = hook(true)
    await act(async () => {
      actions.current.print({ ...huge, kind: 'cuts', serverOnly: 'Son 6.330 barras: es demasiado para armarlo en el navegador sin trabarlo.' })
      await Promise.resolve()
    })
    expect(fetchCalls()).toHaveLength(0)
    expect(document.getElementById(PRINT_ROOT)).toBeNull()
    expect(String(error.mock.calls[0]?.[0])).toContain('Vuelve a tus ajustes de corte')
  })

  it('un documento normal se sigue imprimiendo en el navegador', async () => {
    const actions = hook()
    act(() => actions.current.print({ kind: 'labels', element: <div>30 etiquetas</div> }))
    expect(document.getElementById(PRINT_ROOT)?.textContent).toContain('30 etiquetas')
    await vi.waitFor(() => expect(window.print).toHaveBeenCalled())
    expect(fetchCalls()).toHaveLength(0)
  })
})
