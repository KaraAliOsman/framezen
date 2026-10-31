import './setup'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'
import type { Me } from '@framezen/shared'
import { GuestOnly, RequireAuth, safeNext, useSession } from '../src/lib/auth'
import { createQueryClient } from '../src/lib/queryClient'

const ME: Me = {
  user: { id: 'u1', name: 'Ana Pérez', email: 'ana@taller.cl', createdAt: '2026-10-01T00:00:00Z' },
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
    features: ['assistant'],
    provider: 'dev',
  },
  solo: true,
  onboarded: false,
}

function Where() {
  const location = useLocation()
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>
}

function Private() {
  const me = useSession()
  return <p>Hola {me.user.name}</p>
}

function setup(me: Me | null, initial: string) {
  const client = createQueryClient()
  client.setQueryData(['me'], me)
  const router = createMemoryRouter(
    [
      { element: <GuestOnly />, children: [{ path: '/entrar', element: <Where /> }] },
      { element: <RequireAuth />, children: [{ path: '/inicio', element: <Private /> }, { path: '/cotizaciones', element: <Private /> }] },
      { path: '/bienvenida', element: <Where /> },
    ],
    { initialEntries: [initial] },
  )
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('rutas protegidas', () => {
  it('sin sesión pide entrar y recuerda adónde ibas', async () => {
    setup(null, '/cotizaciones?estado=enviada')
    expect((await screen.findByTestId('where')).textContent).toBe('/entrar?next=%2Fcotizaciones%3Festado%3Denviada')
  })

  it('con sesión entra directo aunque no haya terminado la puesta a punto', async () => {
    const router = setup(ME, '/inicio')
    expect(await screen.findByText('Hola Ana Pérez')).toBeTruthy()
    expect(router.state.location.pathname).toBe('/inicio')
  })

  it('si ya hay sesión, /entrar lleva a lo que se pedía', async () => {
    setup(ME, '/entrar?next=/cotizaciones')
    expect(await screen.findByText('Hola Ana Pérez')).toBeTruthy()
  })

  it('solo acepta destinos internos', () => {
    expect(safeNext('/cotizaciones/1')).toBe('/cotizaciones/1')
    expect(safeNext('https://otro.sitio')).toBe('/inicio')
    expect(safeNext('//otro.sitio')).toBe('/inicio')
    expect(safeNext(null)).toBe('/inicio')
  })
})
