import '../../../../test/setup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ApiRequestError } from '../../../lib/api'
import { useUpdateSettings } from '../../../lib/hooks'
import { createQueryClient, qk } from '../../../lib/queryClient'
import { toast } from '../../../ui/Toaster'
import { combineStatus, hasUnsavedChanges, useAutosave } from './useAutosave'

describe('guardado automático', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('junta los cambios y guarda una sola vez tras la pausa', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useAutosave<Record<string, string>>(save, { delay: 500 }))
    act(() => {
      result.current.queue({ name: 'Ven' })
      result.current.queue({ name: 'Ventanas', city: 'Talca' })
    })
    expect(result.current.status).toBe('saving')
    expect(save).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith({ name: 'Ventanas', city: 'Talca' })
    expect(result.current.status).toBe('saved')
    expect(result.current.savedAt).toBeInstanceOf(Date)
  })

  it('sin conexión conserva los cambios y reintenta solo', async () => {
    const save = vi.fn().mockRejectedValueOnce(new ApiRequestError(0, 'network', 'sin red')).mockResolvedValue(undefined)
    const { result } = renderHook(() => useAutosave<Record<string, number>>(save, { delay: 100, retryDelay: 1000 }))
    act(() => result.current.queue({ marginPct: 35 }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(result.current.status).toBe('offline')
    expect(result.current.dirty()).toBe(true)
    // Un cambio nuevo durante el corte gana sobre el que falló.
    act(() => result.current.queue({ marginPct: 38 }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(save).toHaveBeenLastCalledWith({ marginPct: 38 })
    expect(result.current.status).toBe('saved')
    expect(result.current.dirty()).toBe(false)
  })

  it('un dato rechazado (4xx) se explica en lenguaje humano y no se reintenta', async () => {
    const save = vi.fn().mockRejectedValue(new ApiRequestError(400, 'invalid', 'El nombre no puede quedar vacío.'))
    const { result } = renderHook(() => useAutosave<Record<string, string>>(save, { delay: 50 }))
    act(() => result.current.queue({ name: 'x' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })
    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('El nombre no puede quedar vacío.')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('flush guarda al tiro lo pendiente', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useAutosave<Record<string, string>>(save, { delay: 5000 }))
    act(() => result.current.queue({ city: 'Chillán' }))
    await act(async () => {
      await result.current.flush()
    })
    expect(save).toHaveBeenCalledWith({ city: 'Chillán' })
  })

  it('si sales de la sección sin conexión, el cambio no se pierde: se reintenta solo y al volver la red', async () => {
    const offline = new ApiRequestError(0, 'network', 'sin red')
    const save = vi.fn().mockRejectedValue(offline)
    const { result, unmount } = renderHook(() => useAutosave<Record<string, number>>(save, { delay: 100, retryDelay: 1000 }))
    act(() => result.current.queue({ marginPct: 55 }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(result.current.status).toBe('offline')
    unmount()
    expect(hasUnsavedChanges()).toBe(true)
    // Sigue reintentando con espera creciente aunque la sección ya no esté.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(save.mock.calls.length).toBeGreaterThanOrEqual(4)
    expect(save.mock.calls.every(([patch]) => patch.marginPct === 55)).toBe(true)
    // Vuelve la conexión: no espera al próximo reintento.
    const before = save.mock.calls.length
    save.mockResolvedValue(undefined)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(save).toHaveBeenCalledTimes(before + 1)
    expect(save).toHaveBeenLastCalledWith({ marginPct: 55 })
    expect(hasUnsavedChanges()).toBe(false)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(save).toHaveBeenCalledTimes(before + 1)
  })

  it('cambiar y salir antes de la pausa con la API caída: el cambio sigue en la cola', async () => {
    const client = createQueryClient()
    client.setQueryData(qk.settings, { pricing: { marginPct: 40 } })
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit): Promise<Response> => {
      throw new TypeError('Failed to fetch')
    })
    vi.stubGlobal('fetch', fetchMock)
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result, unmount } = renderHook(
      () => {
        const update = useUpdateSettings()
        return useAutosave<{ pricing: { marginPct: number } }>((patch) => update.mutateAsync(patch as never), { key: 'settings:pricing' })
      },
      { wrapper },
    )
    act(() => result.current.queue({ pricing: { marginPct: 55 } }))
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000)
    })
    const patches = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')
    expect(patches().length).toBeGreaterThan(1)
    fetchMock.mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? '{}'))
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(JSON.parse(String(patches().at(-1)![1]!.body))).toEqual({ pricing: { marginPct: 55 } })
    expect(client.getQueryData<{ pricing: { marginPct: number } }>(qk.settings)?.pricing.marginPct).toBe(55)
    expect(hasUnsavedChanges()).toBe(false)
  })

  it('al volver con la misma clave retoma lo pendiente y lo nuevo gana (nunca lo pisa lo viejo)', async () => {
    const save = vi.fn().mockRejectedValue(new ApiRequestError(0, 'network', 'sin red'))
    const first = renderHook(() => useAutosave<Record<string, number>>(save, { delay: 100, retryDelay: 1000, key: 'test:retoma' }))
    act(() => first.result.current.queue({ marginPct: 35, laborPerM2: 9000 }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    first.unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    const second = renderHook(() => useAutosave<Record<string, number>>(save, { delay: 100, retryDelay: 1000, key: 'test:retoma' }))
    expect(second.result.current.status).toBe('offline')
    expect(second.result.current.unsaved()).toEqual({ marginPct: 35, laborPerM2: 9000 })
    save.mockResolvedValue(undefined)
    act(() => second.result.current.queue({ marginPct: 38 }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(save).toHaveBeenLastCalledWith({ marginPct: 38, laborPerM2: 9000 })
    expect(second.result.current.status).toBe('saved')
    const calls = save.mock.calls.length
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(save).toHaveBeenCalledTimes(calls)
    second.unmount()
  })

  it('pregunta antes de cerrar la página mientras queda algo sin guardar', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { result } = renderHook(() => useAutosave<Record<string, string>>(save, { delay: 500 }))
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }
    expect(leave()).toBe(false)
    act(() => result.current.queue({ terms: 'Garantía de 5 años' }))
    expect(result.current.dirty()).toBe(true)
    expect(leave()).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(result.current.status).toBe('saved')
    expect(leave()).toBe(false)
  })

  it('si el servidor rechaza un cambio cuando ya saliste, lo avisa en vez de callarlo', async () => {
    const error = vi.spyOn(toast, 'error').mockImplementation(() => 0)
    const save = vi.fn().mockRejectedValue(new ApiRequestError(400, 'invalid', 'El margen no es válido.'))
    const { result, unmount } = renderHook(() => useAutosave<Record<string, number>>(save, { delay: 500 }))
    act(() => result.current.queue({ marginPct: -5 }))
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(save).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('El margen no es válido.'))
    expect(hasUnsavedChanges()).toBe(false)
    error.mockRestore()
  })

  it('el peor estado manda en el indicador combinado', () => {
    expect(combineStatus('saved', 'saving')).toBe('saving')
    expect(combineStatus('saved', 'offline', 'saving')).toBe('offline')
    expect(combineStatus('idle', 'saved')).toBe('saved')
    expect(combineStatus('idle')).toBe('idle')
  })
})
