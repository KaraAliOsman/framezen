import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiRequestError, NETWORK_MESSAGE, request, toItems } from '../src/lib/api'

function json(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('cliente HTTP', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('pide a /api con cookies y devuelve el JSON tipado', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }))
    await expect(request<{ ok: boolean }>('/health', { query: { q: 'pérez', empty: '' } })).resolves.toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/health?q=p%C3%A9rez')
    expect(init?.credentials).toBe('same-origin')
  })

  it('reintenta suave una lectura ante un 503 y luego responde', async () => {
    fetchMock.mockResolvedValueOnce(json(503, undefined)).mockResolvedValueOnce(json(200, [{ id: 'a' }]))
    const promise = request<{ id: string }[]>('/clients')
    await vi.runAllTimersAsync()
    await expect(promise).resolves.toEqual([{ id: 'a' }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('sin conexión, tras los reintentos, explica en lenguaje humano', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const promise = request('/quotes')
    const assertion = expect(promise).rejects.toMatchObject({ status: 0, message: NETWORK_MESSAGE })
    await vi.runAllTimersAsync()
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('no reintenta un POST ni un 4xx, y usa el mensaje del servidor', async () => {
    fetchMock.mockResolvedValueOnce(
      json(400, { error: { code: 'email_taken', message: 'Ese correo ya tiene una cuenta. Entra o recupera tu contraseña.', field: 'email' } }),
    )
    const error = await api.auth.signup({ name: 'Ana', company: 'Taller', email: 'a@b.cl', password: '12345678' }).catch((e) => e)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error.code).toBe('email_taken')
    expect(error.field).toBe('email')
    expect(error.message).toMatch(/ya tiene una cuenta/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('pone un mensaje claro cuando el servidor no lo trae', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
    const error = (await request('/me').catch((e: unknown) => e)) as ApiRequestError
    expect(error.isUnauthorized).toBe(true)
    expect(error.message).toBe('Tu sesión terminó. Vuelve a entrar para seguir.')
  })

  it('acepta listas planas o paginadas', () => {
    expect(toItems([1, 2])).toEqual([1, 2])
    expect(toItems({ items: [3], total: 1 })).toEqual([3])
    expect(toItems(undefined)).toEqual([])
  })
})
