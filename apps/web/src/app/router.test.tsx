import '../../test/setup'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { Me } from '@dekopen/shared'
import { createQueryClient, qk } from '../lib/queryClient'
import { AppProviders } from './providers'
import { routes } from './router'

/**
 * Límites de error del shell: si una pantalla (o Marco) falla al dibujarse, se pierde solo esa zona.
 * La barra lateral, la barra superior y la navegación siguen funcionando.
 */

const crash = vi.hoisted(() => ({ home: false, marco: false }))

vi.mock('../features/home/HomePage', () => ({
  default: function HomePage() {
    if (crash.home) throw new TypeError("Cannot read properties of undefined (reading 'map')")
    return <h1>Inicio de prueba</h1>
  },
}))

vi.mock('../features/quotes/QuotesPage', () => ({
  default: function QuotesPage() {
    return <h1>Lista de cotizaciones de prueba</h1>
  },
}))

vi.mock('../features/assistant/MarcoRoot', () => ({
  MarcoRoot: function MarcoRoot() {
    if (crash.marco) throw new Error('Marco no pudo dibujarse')
    return <button type="button">Hablar con Marco</button>
  },
}))

const ME: Me = {
  user: { id: 'u1', name: 'Rosa Martínez', email: 'rosa@martinez.cl', createdAt: '2026-10-01T00:00:00Z' },
  org: { id: 'o1', name: 'Ventanas Martínez', createdAt: '2026-10-01T00:00:00Z' },
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
  onboarded: true,
}

function renderApp(path = '/inicio') {
  const client = createQueryClient()
  client.setQueryData(qk.me, ME)
  // Sin red en las pruebas: las consultas secundarias del shell quedan pendientes, sin errores.
  client.setDefaultOptions({ queries: { retry: false, enabled: false } })
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <AppProviders client={client}>
      <RouterProvider router={router} />
    </AppProviders>,
  )
  return router
}

describe('límites de error del shell', () => {
  // El shell se carga con React.lazy: transformar su árbol de módulos puede tardar más que el 1 s de
  // findBy* cuando corre toda la suite en paralelo. Se precarga aquí para que las pruebas midan el
  // límite de errores y no el tiempo de importación.
  beforeAll(async () => {
    await import('./shell/AppShell')
  }, 30_000)

  beforeEach(() => {
    crash.home = false
    crash.marco = false
    // React y el router anuncian el error capturado en consola: aquí es lo esperado.
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('una pantalla que falla deja vivos la barra lateral y la barra superior', async () => {
    crash.home = true
    renderApp('/inicio')

    expect(await screen.findByRole('heading', { name: 'Esta pantalla no pudo abrirse' })).toBeTruthy()
    const sidebar = screen.getByRole('complementary', { name: 'Navegación principal' })
    expect(within(sidebar).getByRole('link', { name: /Cotizaciones/ })).toBeTruthy()
    // Hay dos: el de la barra lateral y el icono del teléfono (el CSS no corre en jsdom).
    expect(screen.getAllByRole('button', { name: /Buscar o ir a/ }).length).toBeGreaterThan(0)
    // El aviso vive dentro del contenido, no en una pantalla aparte.
    const main = document.getElementById('contenido')
    expect(main?.textContent).toContain('Esta pantalla no pudo abrirse')
  })

  it('desde el aviso se puede seguir navegando y el error se olvida al cambiar de ruta', async () => {
    crash.home = true
    renderApp('/inicio')
    await screen.findByRole('heading', { name: 'Esta pantalla no pudo abrirse' })

    const sidebar = screen.getByRole('complementary', { name: 'Navegación principal' })
    await act(async () => {
      fireEvent.click(within(sidebar).getByRole('link', { name: /Cotizaciones/ }))
    })
    expect(await screen.findByRole('heading', { name: 'Lista de cotizaciones de prueba' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Esta pantalla no pudo abrirse' })).toBeNull()
  })

  it('«Reintentar» vuelve a dibujar la pantalla cuando el problema ya pasó', async () => {
    crash.home = true
    renderApp('/inicio')
    await screen.findByRole('heading', { name: 'Esta pantalla no pudo abrirse' })

    crash.home = false
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    })
    expect(await screen.findByRole('heading', { name: 'Inicio de prueba' })).toBeTruthy()
  })

  it('si Marco falla, la barra superior y la pantalla siguen en pie', async () => {
    crash.marco = true
    renderApp('/inicio')

    expect(await screen.findByRole('heading', { name: 'Inicio de prueba' })).toBeTruthy()
    // Hay dos: el de la barra lateral y el icono del teléfono (el CSS no corre en jsdom).
    expect(screen.getAllByRole('button', { name: /Buscar o ir a/ }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('heading', { name: 'Esta pantalla no pudo abrirse' })).toBeNull()
    expect(screen.getByRole('button', { name: /tuvo un problema/ })).toBeTruthy()
  })
})
