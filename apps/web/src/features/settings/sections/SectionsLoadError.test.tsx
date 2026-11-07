import '../../../../test/setup'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentType } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { DEFAULT_CUT, DEFAULT_PRICING } from '@dekopen/engine'
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '@dekopen/catalog'
import { createQueryClient } from '../../../lib/queryClient'
import { TooltipProvider } from '../../../ui/Tooltip'
import { PricingSection } from './PricingSection'
import { WorkshopSection } from './WorkshopSection'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => vi.unstubAllGlobals())

/** API caída hasta que la prueba la levanta; luego responde ajustes y catálogo reales. */
function renderDown(Section: ComponentType) {
  const state = { down: true }
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const path = String(input).split('?')[0]
      if (state.down) return json({ error: { code: 'internal', message: 'Boom' } }, 500)
      if (path === '/api/settings')
        return json({ pricing: DEFAULT_PRICING, cut: DEFAULT_CUT, documents: {}, defaults: SAMPLE_DEFAULTS, nextQuoteNumber: 412, nextWorkOrderNumber: 37 })
      if (path === '/api/catalog') return json({ ...SAMPLE_CATALOG, updatedAt: '' })
      return json({})
    }),
  )
  const client = createQueryClient()
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } })
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter>
          <Section />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  )
  return state
}

describe('Ajustes sin la API', () => {
  it('Precios: en vez de cargar para siempre, avisa y deja reintentar', async () => {
    const api = renderDown(PricingSection)
    expect(await screen.findByText('No pudimos cargar tus precios')).toBeTruthy()
    api.down = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByLabelText('Forma de calcular la ganancia')).toBeTruthy()
    expect(screen.queryByText('No pudimos cargar tus precios')).toBeNull()
  })

  it('Taller: en vez de cargar para siempre, avisa y deja reintentar', async () => {
    const api = renderDown(WorkshopSection)
    expect(await screen.findByText('No pudimos cargar los ajustes del taller')).toBeTruthy()
    api.down = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('La siguiente que crees será la N° 412.')).toBeTruthy()
    expect(screen.queryByText('No pudimos cargar los ajustes del taller')).toBeNull()
  })
})
