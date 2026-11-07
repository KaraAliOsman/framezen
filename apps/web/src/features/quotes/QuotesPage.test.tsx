import '../../../test/setup'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { qk } from '../../lib/queryClient'
import { TooltipProvider } from '../../ui'
import { cleanCopyTitle } from './DuplicateDialog'
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
  it('las tres cifras salen de las filas y el filtro cambia solo el total', async () => {
    const row = (id: string, status: string, total: number) => ({ id, number: Number(id), title: `Obra ${id}`, status, revision: 0, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z', total, units: 1 })
    renderList(() => json({ items: [row('1', 'sent', 100_000), row('2', 'sent', 50_000), row('3', 'accepted', 70_000), row('4', 'workshop', 30_000), row('5', 'draft', 9_000)], total: 5 }))
    const label = await screen.findByText('Por seguir')
    const figure = (text: string) => screen.getByText(text).parentElement?.parentElement?.textContent ?? ''
    expect(label).toBeTruthy()
    expect(figure('Por seguir')).toContain('$150.000')
    expect(figure('Aceptado')).toContain('$100.000')
    expect(figure('Total con IVA')).toContain('$259.000')
  })

  it('duplicar deja el título limpio', () => {
    expect(cleanCopyTitle('Casa Soto (copia)')).toBe('Casa Soto')
    expect(cleanCopyTitle('Casa Soto (copia) (copia)')).toBe('Casa Soto')
    expect(cleanCopyTitle('Casa (copia) grande')).toBe('Casa (copia) grande')
  })

  it('si la API falla muestra el error con «Reintentar», nunca el vacío de cuenta nueva', async () => {
    let fail = true
    renderList(() => (fail ? json({ error: { code: 'server', message: 'Tuvimos un problema de nuestro lado.' } }, 500) : json({ items: [], total: 0 })))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('No pudimos cargar tus cotizaciones.')
    expect(screen.queryByText('Haz tu primera cotización')).toBeNull()
    // Al reintentar con la API de vuelta (y sin cotizaciones), ahí sí es una cuenta nueva.
    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Haz tu primera cotización')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
