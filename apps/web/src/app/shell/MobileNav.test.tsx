import '../../../test/setup'
import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import type { Me } from '@dekopen/shared'
import { RequireAuth } from '../../lib/auth'
import { createQueryClient, qk } from '../../lib/queryClient'
import { useShellStore } from '../../lib/stores'
import { ThemeProvider } from '../../lib/theme'
import { TooltipProvider } from '../../ui'
import { MobileNavSheet, MobileTabBar } from './MobileNav'
import { Topbar } from './Topbar'

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

function renderShell(path = '/inicio') {
  const client = createQueryClient()
  client.setQueryData(qk.me, ME)
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <ThemeProvider>
          <TooltipProvider>
            <RequireAuth>
              <Topbar onShowShortcuts={() => {}} />
              <MobileTabBar />
              <MobileNavSheet />
            </RequireAuth>
          </TooltipProvider>
        </ThemeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('navegación del teléfono', () => {
  beforeEach(() => useShellStore.setState({ mobileNavOpen: false }))

  it('sin hamburguesa arriba: «Más» es la única entrada al resto', () => {
    renderShell()
    expect(screen.queryByRole('button', { name: 'Abrir menú' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Más' })).toBeTruthy()
  })

  it('«Más» abre una hoja solo con lo que no está en la barra inferior', () => {
    renderShell()
    const tabBar = screen.getByRole('navigation', { name: 'Navegación' })
    const tabs = within(tabBar).getAllByRole('link').map((a) => a.textContent)
    expect(tabs).toEqual(['Inicio', 'Cotizaciones', 'Clientes', 'Taller'])

    fireEvent.click(screen.getByRole('button', { name: 'Más' }))
    const sheet = screen.getByRole('dialog')
    const more = within(sheet).getByRole('navigation', { name: 'Más secciones' })
    const labels = [...within(more).getAllByRole('link'), ...within(more).getAllByRole('button')].map((el) => (el.querySelector('.truncate') ?? el).textContent?.trim())
    expect(labels).toEqual(['Catálogo', 'Documentos', 'Ajustes', 'Plan y facturación', 'Cerrar sesión'])
    for (const repeated of tabs) expect(within(sheet).queryByRole('link', { name: repeated ?? '' })).toBeNull()
  })

  it('marca «Más» cuando estás en una de sus secciones', () => {
    renderShell('/catalogo')
    expect(screen.getByRole('button', { name: 'Más' }).className).toContain('text-fg-strong')
  })
})
