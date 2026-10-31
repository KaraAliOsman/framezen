import '../../../test/setup'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import type { Client } from '@framezen/shared'
import { createQueryClient } from '../../lib/queryClient'
import { TooltipProvider } from '../../ui/Tooltip'
import ClientsPage from './ClientsPage'

const CLIENT: Client = {
  id: 'c1',
  name: 'Pedro Soto',
  phone: '+56 9 8765 4321',
  city: 'Concepción',
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
  quotesCount: 2,
  totalAccepted: 0,
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => vi.unstubAllGlobals())

describe('Clientes sin la API', () => {
  it('un error no es «sin clientes»: lo dice y ofrece reintentar', async () => {
    let down = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const path = String(input).split('?')[0]
        if (down) return json({ error: { code: 'internal', message: 'Boom' } }, 500)
        if (path === '/api/clients') return json({ items: [CLIENT], total: 1 })
        return json({})
      }),
    )
    const client = createQueryClient()
    client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } })
    client.setQueryData(['me'], null)
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <MemoryRouter initialEntries={['/clientes']}>
            <ClientsPage />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('No pudimos cargar tus clientes')).toBeTruthy()
    expect(screen.queryByText('Tus clientes aparecerán aquí')).toBeNull()
    down = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Pedro Soto')).toBeTruthy()
    expect(screen.queryByText('No pudimos cargar tus clientes')).toBeNull()
  })

  it('sin clientes de verdad muestra la bienvenida', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ items: [], total: 0 })),
    )
    const client = createQueryClient()
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <MemoryRouter initialEntries={['/clientes']}>
            <ClientsPage />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Tus clientes aparecerán aquí')).toBeTruthy()
    expect(screen.queryByText('No pudimos cargar tus clientes')).toBeNull()
  })
})
