import '../../../test/setup'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { DEFAULT_CUT, DEFAULT_PRICING } from '@framezen/engine'
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '@framezen/catalog'
import type { Me } from '@framezen/shared'
import { RequireAuth } from '../../lib/auth'
import { createQueryClient } from '../../lib/queryClient'
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

afterEach(() => vi.unstubAllGlobals())

describe('puesta a punto', () => {
  it('3 pasos con «Saltar» siempre a mano; saltar marca la puesta a punto y vuelve a Inicio aunque algo falle', async () => {
    const calls: { path: string; method: string; body?: unknown }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        const path = String(input).split('?')[0]
        const method = init?.method ?? 'GET'
        calls.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
        if (path === '/api/org' && method === 'PATCH') return json({ error: { code: 'internal', message: 'Falla' } }, 500)
        if (path === '/api/catalog') return json({ ...SAMPLE_CATALOG, updatedAt: '' })
        if (path === '/api/settings') return json({ pricing: DEFAULT_PRICING, cut: DEFAULT_CUT, defaults: SAMPLE_DEFAULTS, nextQuoteNumber: 1, nextWorkOrderNumber: 1 })
        if (path === '/api/catalog/brands')
          return json({
            items: [
              {
                brand: { id: 'proline', name: 'Proline', kind: 'profiles', monogram: 'PR', accent: '#6B4FA0' },
                enabled: true,
                recommended: true,
                completeness: 'verified',
                settings: {},
                counts: { lines: 7, profiles: 96, items: 138, glass: 0, priced: 219, unpriced: 10, overrides: 0 },
              },
              {
                brand: { id: 'veka', name: 'Veka', kind: 'profiles', monogram: 'VE' },
                enabled: false,
                recommended: false,
                completeness: 'partial',
                settings: {},
                counts: { lines: 5, profiles: 0, items: 0, glass: 0, priced: 0, unpriced: 0, overrides: 0 },
              },
            ],
            total: 2,
          })
        return json({})
      }),
    )
    const client = createQueryClient()
    client.setQueryData(['me'], ME)
    render(
      <QueryClientProvider client={client}>
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
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByRole('heading', { level: 1, name: '¿Con qué marcas trabajas?' })).toBeTruthy()
    // Solo las activas o recomendadas a la vista; el resto a un clic.
    expect(await screen.findByText('Proline')).toBeTruthy()
    expect(screen.queryByText('Veka')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Ver todas las marcas \(1 más\)/ }))
    expect(screen.getByText('Veka')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Tu empresa y tu logo' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Tus precios base' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Crear mi primera cotización/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }))
    expect(await screen.findByText('Inicio')).toBeTruthy()
    await waitFor(() => expect(calls).toContainEqual({ path: '/api/org', method: 'PATCH', body: { onboarded: true } }))
  })
})
