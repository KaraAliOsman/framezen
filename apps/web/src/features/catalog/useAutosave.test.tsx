import '../../../test/setup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ApiRequestError } from '../../lib/api'
import { createQueryClient } from '../../lib/queryClient'
import { toast } from '../../ui'
import { usePatchBrand } from './api'
import { pendingAutosaves, resetAutosaveQueue, RETRY_MS } from './autosaveQueue'
import { useAutosave } from './useAutosave'

const offline = () => new ApiRequestError(0, 'network', 'sin red')

/** Dispara `beforeunload` como el navegador y dice si la página pidió confirmación. */
function leaveAsks(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

describe('autoguardado del catálogo', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    // Primero se desmontan las pantallas (pasan lo suyo a la cola) y luego se vacía la cola.
    cleanup()
    resetAutosaveQueue()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('junta los cambios y guarda una sola vez tras la pausa', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useAutosave<{ price: number }>(save, 500))
    act(() => {
      result.current.schedule({ price: 1 })
      result.current.schedule({ price: 2 })
    })
    expect(result.current.status).toBe('saving')
    await act(() => vi.advanceTimersByTimeAsync(500))
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ price: 2 })
    expect(result.current.status).toBe('saved')
  })

  it('sin conexión y saliendo de la pantalla, el cambio no se pierde: llega al volver la red', async () => {
    let online = false
    const save = vi.fn(async () => {
      if (!online) throw offline()
    })
    const { result, unmount } = renderHook(() => useAutosave<{ price: number }>(save, 100, 'brand:proline'))
    act(() => result.current.schedule({ price: 999 }))
    await act(() => vi.advanceTimersByTimeAsync(100))
    expect(result.current.status).toBe('offline')
    expect(save).toHaveBeenCalledTimes(1)

    // Vas a Cotizaciones con el wifi caído.
    unmount()
    await act(() => vi.advanceTimersByTimeAsync(RETRY_MS))
    expect(save).toHaveBeenCalledTimes(2)
    expect(pendingAutosaves()).toBe(1)

    // Vuelve la red: el cambio se manda solo, sin esperar al siguiente reintento.
    online = true
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(save).toHaveBeenCalledTimes(3)
    expect(save).toHaveBeenLastCalledWith({ price: 999 })
    expect(pendingAutosaves()).toBe(0)
  })

  it('sigue reintentando aunque la red no avise que volvió', async () => {
    const save = vi.fn().mockRejectedValueOnce(offline()).mockRejectedValueOnce(offline()).mockResolvedValue(undefined)
    const { result, unmount } = renderHook(() => useAutosave<{ area: number }>(save, 100))
    act(() => result.current.schedule({ area: 0.5 }))
    unmount()
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(save).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(save).toHaveBeenCalledTimes(3)
    expect(save).toHaveBeenLastCalledWith({ area: 0.5 })
    expect(pendingAutosaves()).toBe(0)
  })

  it('cerrar la pestaña con un cambio sin guardar pide confirmación; ya guardado, no', async () => {
    let online = false
    const save = vi.fn(async () => {
      if (!online) throw offline()
    })
    const { result } = renderHook(() => useAutosave<{ trim: number }>(save, 500))
    expect(leaveAsks()).toBe(false)
    act(() => result.current.schedule({ trim: 5 }))
    // Aún en la espera corta: el aviso lo manda a guardar y pide confirmación.
    expect(leaveAsks()).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(save).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('offline')
    expect(leaveAsks()).toBe(true)

    online = true
    await act(() => vi.advanceTimersByTimeAsync(RETRY_MS))
    expect(result.current.status).toBe('saved')
    expect(leaveAsks()).toBe(false)
  })

  it('un cambio viejo que se reintenta nunca pisa uno más nuevo de la misma marca', async () => {
    let online = false
    const sent: number[] = []
    const save = vi.fn(async (value: { profiles: number }) => {
      if (!online) throw offline()
      sent.push(value.profiles)
    })
    const first = renderHook(() => useAutosave<{ profiles: number }>(save, 100, 'brand:andes'))
    act(() => first.result.current.schedule({ profiles: 30 }))
    await act(() => vi.advanceTimersByTimeAsync(100))
    first.unmount()

    // Vuelves a abrir la misma marca y cambias de nuevo, todavía sin red.
    const second = renderHook(() => useAutosave<{ profiles: number }>(save, 100, 'brand:andes'))
    act(() => second.result.current.schedule({ profiles: 40 }))
    online = true
    await act(() => vi.advanceTimersByTimeAsync(100))
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(sent).toEqual([30, 40])
    expect(second.result.current.status).toBe('saved')
  })

  it('un dato rechazado (4xx) después de salir de la pantalla se avisa y no se reintenta', async () => {
    const error = vi.spyOn(toast, 'error').mockImplementation(() => 'toast')
    const save = vi.fn().mockRejectedValue(new ApiRequestError(400, 'invalid', 'El descuento no puede pasar de 100 %.'))
    const { result, unmount } = renderHook(() => useAutosave<{ glass: number }>(save, 500))
    act(() => result.current.schedule({ glass: 120 }))
    unmount()
    await act(() => vi.advanceTimersByTimeAsync(60_000))
    expect(save).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('El descuento no puede pasar de 100 %.'))
    expect(pendingAutosaves()).toBe(0)
  })

  it('con la mutación y el fetch reales: el descuento cambiado sin red llega al servidor tras salir de la pantalla', async () => {
    let online = false
    const bodies: string[] = []
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      bodies.push(`${online ? 'ok' : 'fail'}:${String(init?.body)}`)
      if (!online) throw new TypeError('Failed to fetch')
      return new Response(null, { status: 204 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = createQueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result, unmount } = renderHook(
      () => {
        const patch = usePatchBrand()
        return useAutosave<{ discounts: { profiles: number } }>((value) => patch.mutateAsync({ id: 'proline', patch: { settings: value } }), 100, 'brand:proline')
      },
      { wrapper },
    )
    act(() => result.current.schedule({ discounts: { profiles: 12 } }))
    await act(() => vi.advanceTimersByTimeAsync(100))
    expect(result.current.status).toBe('offline')
    unmount()
    await act(() => vi.advanceTimersByTimeAsync(RETRY_MS))
    online = true
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(0)
    })
    const body = JSON.stringify({ settings: { discounts: { profiles: 12 } } })
    expect(bodies).toEqual([`fail:${body}`, `fail:${body}`, `ok:${body}`])
    expect(pendingAutosaves()).toBe(0)
  })
})
