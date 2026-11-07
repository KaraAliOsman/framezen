import '../../../test/setup'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { Client } from '@dekopen/shared'
import { createQueryClient } from '../../lib/queryClient'
import { TooltipProvider } from '../../ui/Tooltip'
import ClientDetailPage from './ClientDetailPage'

const CLIENT: Client = {
  id: 'c1',
  name: 'Pedro Soto',
  phone: '+56 9 8765 4321',
  city: 'Concepción',
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
  quotesCount: 0,
  totalAccepted: 0,
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => vi.unstubAllGlobals())

function renderDetail(client: Client) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const path = String(input).split('?')[0]
      if (path === '/api/clients/c1') return json(client)
      if (path === '/api/quotes') return json({ items: [], total: 0 })
      return json({})
    }),
  )
  const queryClient = createQueryClient()
  queryClient.setQueryData(['me'], null)
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter initialEntries={['/clientes/c1']}>
          <Routes>
            <Route path="/clientes/:id" element={<ClientDetailPage />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

describe('ficha del cliente', () => {
  it('una empresa: el nombre completo en el título y sin partirlo en los textos', async () => {
    renderDetail({ ...CLIENT, name: 'Constructora Los Aromos SpA' })
    const title = await screen.findByRole('button', { name: 'Constructora Los Aromos SpA' })
    expect(title.className).not.toContain('truncate')
    expect(await screen.findByText('Aún no hay cotizaciones para este cliente')).toBeTruthy()
    expect(screen.queryByText(/a Constructora$/)).toBeNull()
    const wa = screen.getAllByRole('link', { name: 'Escribir por WhatsApp' })[0]!.getAttribute('href') ?? ''
    expect(decodeURIComponent(wa)).toContain('text=Hola, ')
    expect(decodeURIComponent(wa)).not.toContain('Hola Constructora')
  })

  it('edita en el lugar, avisa si el RUT no calza sin bloquear y guarda solo', async () => {
    const patches: unknown[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string, init?: RequestInit) => {
        const path = String(input).split('?')[0]
        if (path === '/api/clients/c1' && init?.method === 'PATCH') {
          const body = JSON.parse(String(init.body))
          patches.push(body)
          return json({ ...CLIENT, ...body })
        }
        if (path === '/api/clients/c1') return json(CLIENT)
        if (path === '/api/quotes') return json({ items: [], total: 0 })
        return json({})
      }),
    )
    const client = createQueryClient()
    client.setQueryData(['me'], null)
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <MemoryRouter initialEntries={['/clientes/c1']}>
            <Routes>
              <Route path="/clientes/:id" element={<ClientDetailPage />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findByRole('button', { name: 'Pedro Soto' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Nueva cotización para este cliente/ })).toBeTruthy()
    expect(await screen.findByText('Aún no hay cotizaciones para este cliente')).toBeTruthy()
    // El saludo de WhatsApp usa el nombre de pila de una persona.
    expect(screen.getAllByRole('link', { name: 'Escribir por WhatsApp' })[0]!.getAttribute('href')).toContain(encodeURIComponent('Hola Pedro, '))

    fireEvent.click(screen.getByRole('button', { name: /RUT: vacío/ }))
    const input = screen.getByLabelText('RUT')
    fireEvent.change(input, { target: { value: '123456789' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText(/dígito verificador no calza/)).toBeTruthy()
    await waitFor(() => expect(patches).toContainEqual({ rut: '123456789' }), { timeout: 2000 })

    // Un RUT válido se formatea al confirmar.
    fireEvent.click(screen.getByRole('button', { name: /RUT: 123456789/ }))
    const again = screen.getByLabelText('RUT')
    fireEvent.change(again, { target: { value: '123456785' } })
    fireEvent.blur(again)
    await waitFor(() => expect(patches).toContainEqual({ rut: '12.345.678-5' }), { timeout: 2000 })
    expect(screen.queryByText(/dígito verificador no calza/)).toBeNull()
  })
})
