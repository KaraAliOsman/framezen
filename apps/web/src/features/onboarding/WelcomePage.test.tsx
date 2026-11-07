import '../../../test/setup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { DEFAULT_CUT, DEFAULT_PRICING } from '@dekopen/engine'
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '@dekopen/catalog'
import type { Me } from '@dekopen/shared'
import { RequireAuth } from '../../lib/auth'
import { createQueryClient } from '../../lib/queryClient'
import { TooltipProvider } from '../../ui'
import { resolveWindow, EMPTY_DRAFT } from './draft'
import WelcomePage from './WelcomePage'

const ME: Me = {
  user: { id: 'u1', name: 'Pedro Araya', email: 'pedro@sur.cl', createdAt: '2026-10-01T00:00:00Z' },
  org: { id: 'o1', name: 'Ventanas del Sur', createdAt: '2026-10-01T00:00:00Z' },
  role: 'owner',
  billing: {
    plan: 'trial',
    status: 'trialing',
    period: null,
    seats: 3,
    seatsUsed: 1,
    aiCredits: { included: 500, used: 0, extra: 0 },
    features: [],
    provider: 'dev',
  },
  solo: true,
  onboarded: false,
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => localStorage.clear())
afterEach(() => vi.unstubAllGlobals())

function stubFetch(calls: { path: string; method: string; body?: unknown }[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = String(input).split('?')[0]
      const method = init?.method ?? 'GET'
      calls.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (path === '/api/org' && method === 'PATCH') return json({ error: { code: 'internal', message: 'Falla' } }, 500)
      if (path === '/api/clients' && method === 'POST') return json({ id: 'c1', name: 'Marcela Fuentes', createdAt: '', updatedAt: '' }, 201)
      if (path === '/api/quotes' && method === 'POST') return json({ id: 'q1', number: 1, title: '', status: 'draft', items: [], extras: [], discountPct: 0, revision: 0, version: 1, createdAt: '', updatedAt: '' }, 201)
      if (path === '/api/catalog') return json({ ...SAMPLE_CATALOG, updatedAt: '' })
      if (path === '/api/settings') return json({ pricing: DEFAULT_PRICING, cut: DEFAULT_CUT, defaults: SAMPLE_DEFAULTS, nextQuoteNumber: 1, nextWorkOrderNumber: 1 })
      return json({ items: [], total: 0 })
    }),
  )
  return calls
}

function renderWelcome() {
  const client = createQueryClient()
  client.setQueryData(['me'], ME)
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={['/bienvenida']}>
          <Routes>
            <Route
              path="/bienvenida"
              element={
                <RequireAuth>
                  <WelcomePage />
                </RequireAuth>
              }
            />
            <Route path="/inicio" element={<p>Inicio</p>} />
            <Route path="/cotizaciones/:id" element={<p>Editor</p>} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

describe('puesta a punto', () => {
  it('saludo con el nombre y «Saltar por ahora» siempre a mano: marca la puesta a punto aunque el guardado falle', async () => {
    const calls = stubFetch()
    renderWelcome()
    expect(screen.getByRole('heading', { level: 1, name: /^Hola, Pedro/ })).toBeTruthy()
    expect(screen.getByText('Paso 1 de 4')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Saltar por ahora' }))
    expect(await screen.findByText('Inicio')).toBeTruthy()
    await waitFor(() => expect(calls).toContainEqual({ path: '/api/org', method: 'PATCH', body: { onboarded: true } }))
    expect(calls.some((c) => c.path === '/api/quotes' && c.method === 'POST')).toBe(false)
  })

  it('termina con una cotización real: crea al cliente escrito y su ventana, y abre el editor', async () => {
    const calls = stubFetch()
    renderWelcome()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    fireEvent.change(await screen.findByLabelText('Nombre del cliente'), { target: { value: 'Marcela Fuentes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByRole('heading', { level: 1, name: '¿Qué ventana necesita Marcela Fuentes?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByRole('heading', { level: 1, name: '¿Con qué margen trabajas?' })).toBeTruthy()
    await screen.findByText('Total')
    fireEvent.click(screen.getByRole('button', { name: 'Crear cotización' }))
    expect(await screen.findByText('Editor')).toBeTruthy()

    expect(calls).toContainEqual({ path: '/api/clients', method: 'POST', body: { name: 'Marcela Fuentes' } })
    const quote = calls.find((c) => c.path === '/api/quotes' && c.method === 'POST')?.body as { title: string; clientId: string; items: { qty: number; design: { width: number; height: number } }[] }
    expect(quote.title).toBe('Obra de Marcela Fuentes')
    expect(quote.clientId).toBe('c1')
    expect(quote.items).toHaveLength(1)
    expect(quote.items[0].design.width).toBe(1500)
    expect(quote.items[0].design.height).toBe(1200)
  })

  it('recargar no borra lo escrito', async () => {
    stubFetch()
    localStorage.setItem('dk-primera-cotizacion', JSON.stringify({ client: { name: 'Ana Rojas' } }))
    renderWelcome()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(((await screen.findByLabelText('Nombre del cliente')) as HTMLInputElement).value).toBe('Ana Rojas')
  })
})

describe('primera ventana', () => {
  it('sale del motor con el catálogo del taller y responde a la cantidad', () => {
    const one = resolveWindow(SAMPLE_CATALOG, DEFAULT_PRICING, EMPTY_DRAFT.window, { defaults: SAMPLE_DEFAULTS })
    const three = resolveWindow(SAMPLE_CATALOG, DEFAULT_PRICING, { ...EMPTY_DRAFT.window, qty: 3 }, { defaults: SAMPLE_DEFAULTS })
    expect(one?.price.unitNet).toBeGreaterThan(0)
    expect(one?.missingPrices).toBe(false)
    expect(three?.price.totalNet).toBe((one?.price.unitNet ?? 0) * 3)
  })

  it('sin medida o sin catálogo no inventa cifras', () => {
    expect(resolveWindow(SAMPLE_CATALOG, DEFAULT_PRICING, { ...EMPTY_DRAFT.window, width: null })).toBeNull()
    expect(resolveWindow(undefined, DEFAULT_PRICING, EMPTY_DRAFT.window)).toBeNull()
  })
})
