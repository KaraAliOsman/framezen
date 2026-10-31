import '../../../test/setup'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { DEFAULT_CUT, DEFAULT_PRICING } from '@framezen/engine'
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '@framezen/catalog'
import type { Me, QuoteStatus } from '@framezen/shared'
import { RequireAuth } from '../../lib/auth'
import { createQueryClient } from '../../lib/queryClient'
import HomePage from './HomePage'
import type { QuoteStats } from './homeModel'

const ME: Me = {
  user: { id: 'u1', name: 'Pedro Araya', email: 'pedro@sur.cl', createdAt: '2026-10-01T00:00:00Z' },
  org: { id: 'o1', name: 'Ventanas del Sur', createdAt: '2026-10-01T00:00:00Z' },
  role: 'owner',
  billing: {
    plan: 'trial',
    status: 'trialing',
    period: null,
    trialEndsAt: '2026-11-14T00:00:00Z',
    seats: 3,
    seatsUsed: 1,
    aiCredits: { included: 500, used: 0, extra: 0 },
    features: ['assistant', 'client3d', 'purchasing', 'cnc'],
    provider: 'dev',
  },
  solo: true,
  onboarded: false,
}

function stats(byStatus: Partial<Record<QuoteStatus, { count: number; total: number }>>, extra: Partial<QuoteStats> = {}): QuoteStats {
  const base = { draft: 0, sent: 0, accepted: 0, rejected: 0, workshop: 0, installed: 0, closed: 0 }
  return {
    byStatus: Object.fromEntries(Object.keys(base).map((k) => [k, byStatus[k as QuoteStatus] ?? { count: 0, total: 0 }])) as QuoteStats['byStatus'],
    soldThisMonth: { count: 0, total: 0 },
    followUps: [],
    ...extra,
  }
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function stubApi(routes: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const path = String(input).split('?')[0]
      if (path in routes) return json(routes[path])
      if (path === '/api/catalog') return json({ ...SAMPLE_CATALOG, updatedAt: '' })
      if (path === '/api/settings')
        return json({ pricing: DEFAULT_PRICING, cut: DEFAULT_CUT, documents: {}, defaults: SAMPLE_DEFAULTS, nextQuoteNumber: 1, nextWorkOrderNumber: 1 })
      if (path === '/api/catalog/brands') return json({ items: [], total: 0 })
      if (path === '/api/quotes' || path === '/api/activity') return json({ items: [], total: 0 })
      return new Response(JSON.stringify({ error: { code: 'not_found', message: 'No' } }), { status: 404 })
    }),
  )
}

function renderHome(s: QuoteStats) {
  const client = createQueryClient()
  client.setQueryData(['me'], ME)
  client.setQueryData(['quotes', 'stats'], s)
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/inicio']}>
        <RequireAuth>
          <HomePage />
        </RequireAuth>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('Inicio sin la API', () => {
  it('no muestra ceros ni «Todo al día»: dice que no pudo cargar y ofrece reintentar', async () => {
    let down = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const path = String(input).split('?')[0]
        if (down) return new Response(JSON.stringify({ error: { code: 'internal', message: 'Boom' } }), { status: 500 })
        if (path === '/api/quotes/stats') return json(stats({ sent: { count: 2, total: 2_674_538 } }))
        if (path === '/api/quotes' || path === '/api/activity') return json({ items: [], total: 0 })
        if (path === '/api/catalog') return json({ ...SAMPLE_CATALOG, updatedAt: '' })
        return json({})
      }),
    )
    const client = createQueryClient()
    client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } })
    client.setQueryData(['me'], ME)
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/inicio']}>
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('No pudimos cargar tu resumen')).toBeTruthy()
    expect(screen.queryByText('Tus cotizaciones')).toBeNull()
    expect(screen.queryByText('Todo al día')).toBeNull()
    expect(screen.queryByText('Tu primera cotización está a un minuto')).toBeNull()
    down = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    const funnel = await screen.findByRole('region', { name: 'Tus cotizaciones' })
    expect(within(within(funnel).getByRole('link', { name: /Enviadas/ })).getByText('$2.674.538')).toBeTruthy()
    expect(screen.queryByText('No pudimos cargar tu resumen')).toBeNull()
  })
})

describe('Inicio', () => {
  it('cuenta nueva: saludo con el nombre, acciones rápidas y la primera cotización a un clic', async () => {
    stubApi({})
    renderHome(stats({}))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^(Buenos días|Buenas tardes|Buenas noches), Pedro$/)
    expect(screen.getByRole('button', { name: /Nueva cotización/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Nuevo cliente/ }).getAttribute('href')).toBe('/clientes?nuevo=1')
    expect(screen.getByRole('link', { name: /Ir a taller/ }).getAttribute('href')).toBe('/taller')
    expect(screen.getByText('Tu primera cotización está a un minuto')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Crear mi primera cotización/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Hacerlo en 3 pasos guiados/ }).getAttribute('href')).toBe('/bienvenida')
    // Sin gráficos de relleno: ni embudo vacío ni tarjetas en cero.
    expect(screen.queryByText('Tus cotizaciones')).toBeNull()
  })

  it('con movimiento: embudo clicable con montos y seguimiento con WhatsApp al cliente', async () => {
    const sentAt = new Date(Date.now() - 6 * 86_400_000 - 3_600_000).toISOString()
    stubApi({
      '/api/quotes/q9': {
        id: 'q9',
        number: 412,
        title: 'Casa Soto',
        status: 'sent',
        client: { id: 'c1', name: 'Pedro Soto', phone: '9 8765 4321', createdAt: '', updatedAt: '' },
        shareToken: 'tok123',
        items: [],
        extras: [],
        discountPct: 0,
        revision: 1,
        version: 1,
        createdAt: sentAt,
        updatedAt: sentAt,
      },
    })
    renderHome(
      stats(
        { draft: { count: 3, total: 1_200_000 }, sent: { count: 2, total: 2_674_538 }, accepted: { count: 1, total: 900_000 }, workshop: { count: 4, total: 5_000_000 } },
        {
          followUps: [
            { id: 'q9', number: 412, title: 'Casa Soto', status: 'sent', revision: 1, createdAt: sentAt, updatedAt: sentAt, sentAt, clientName: 'Pedro Soto', total: 2_674_538, units: 3 },
          ],
        },
      ),
    )
    const funnel = screen.getByRole('region', { name: 'Tus cotizaciones' })
    const sent = within(funnel).getByRole('link', { name: /Enviadas/ })
    expect(sent.getAttribute('href')).toBe('/cotizaciones?estado=sent')
    expect(within(sent).getByText('2')).toBeTruthy()
    expect(within(sent).getByText('$2.674.538')).toBeTruthy()
    expect(within(funnel).getByRole('link', { name: /En taller/ }).getAttribute('href')).toBe('/cotizaciones?estado=workshop')
    expect(await screen.findByText('La N° 412 lleva 6 días enviada sin respuesta: escríbele a Pedro')).toBeTruthy()
    await waitFor(() => {
      const wa = screen.getByRole('link', { name: 'WhatsApp' })
      expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/56987654321\?text=/)
      expect(decodeURIComponent(wa.getAttribute('href') ?? '')).toContain('/c/tok123')
    })
  })
})
