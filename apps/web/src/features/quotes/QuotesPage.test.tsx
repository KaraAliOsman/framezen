import '../../../test/setup'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { SAMPLE_CATALOG } from '@framezen/catalog'
import { qk } from '../../lib/queryClient'
import { TooltipProvider } from '../../ui'
import QuotesPage from './QuotesPage'

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      matches: /min-width/.test(query),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
})

afterEach(() => {
  vi.restoreAllMocks()
})

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function renderList(respond: () => Response) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (/\/api\/quotes(\?|$)/.test(url)) return respond()
    return json({ error: { code: 'not_found', message: 'No encontrado' } }, 404)
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(qk.catalog, SAMPLE_CATALOG)
  const router = createMemoryRouter([{ path: '/cotizaciones', element: <QuotesPage /> }], { initialEntries: ['/cotizaciones'] })
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

describe('lista de cotizaciones', () => {
  it('si la API falla muestra el error con «Reintentar», nunca el vacío de cuenta nueva', async () => {
    let fail = true
    renderList(() => (fail ? json({ error: { code: 'server', message: 'Tuvimos un problema de nuestro lado.' } }, 500) : json({ items: [], total: 0 })))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('No pudimos cargar tus cotizaciones.')
    expect(screen.queryByText('Tu primera cotización en menos de 3 minutos')).toBeNull()
    // Al reintentar con la API de vuelta (y sin cotizaciones), ahí sí es una cuenta nueva.
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Tu primera cotización en menos de 3 minutos')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
