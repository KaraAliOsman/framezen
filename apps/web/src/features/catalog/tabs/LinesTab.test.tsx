import '../../../../test/setup'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Catalog } from '@framezen/engine'
import { SAMPLE_CATALOG } from '@framezen/catalog'
import { TooltipProvider } from '../../../ui'
import { LinesTab } from './LinesTab'

const serie60 = SAMPLE_CATALOG.lines.find((line) => line.id === 'serie-60')!
const catalogWithGap: Catalog = {
  ...SAMPLE_CATALOG,
  profiles: SAMPLE_CATALOG.profiles.map((profile) => (profile.id === serie60.profiles.sash ? { ...profile, priceByColor: {} } : profile)),
}

function renderTab(catalog: Catalog, onCompletePrices = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <LinesTab catalog={catalog} loading={false} onCompletePrices={onCompletePrices} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
  return onCompletePrices
}

describe('LinesTab · completitud', () => {
  it('dice en palabras qué falta y abre Precios con eso', () => {
    const onCompletePrices = renderTab(catalogWithGap)
    expect(screen.getAllByText('Cotiza con avisos').length).toBeGreaterThan(0)
    expect(screen.getByText('Cotiza con avisos: faltan precios de hoja')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Completar \d+ precios/ }))
    expect(onCompletePrices).toHaveBeenCalledTimes(1)
    const [focus, line] = onCompletePrices.mock.calls[0]
    expect(line.id).toBe('serie-60')
    expect(focus.label).toBe('Lo que falta en Serie 60 Practicable')
    expect(focus.keys.length).toBe(serie60.colorIds.length)
  })

  it('una línea completa se ve «Lista para cotizar» sin acción', () => {
    renderTab(SAMPLE_CATALOG)
    expect(screen.getAllByText('Lista para cotizar').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Completar/ })).toBeNull()
  })
})
