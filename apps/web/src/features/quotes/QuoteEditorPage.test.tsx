import '../../../test/setup'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createDesign, DEFAULT_CUT, DEFAULT_PRICING, evaluateQuote, type Catalog } from '@framezen/engine'
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '@framezen/catalog'
import type { Me, OrgSettings, Quote } from '@framezen/shared'
import { api } from '../../lib/api'
import { RequireAuth } from '../../lib/auth'
import { createQueryClient, qk } from '../../lib/queryClient'
import { TooltipProvider } from '../../ui'
import { getQuoteEditor } from '../assistant/bridge'
import { docFromQuote } from './model/doc'
import QuoteEditorPage from './QuoteEditorPage'

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
  onboarded: true,
}

const SETTINGS: OrgSettings = {
  pricing: { ...DEFAULT_PRICING },
  cut: { ...DEFAULT_CUT },
  documents: {
    quoteTemplate: 'esencial',
    catalogTemplate: 'vitrina',
    font: 'instrument',
    showUnitPrice: true,
    showArea: true,
    showGlass: true,
    showLine: true,
    showColorSwatch: true,
    showExteriorView: false,
    paper: 'letter',
    intro: '',
    conditions: '',
    paymentTerms: '',
    warranty: '',
    validityDays: 15,
    leadTimeText: '',
  },
  defaults: {},
  nextQuoteNumber: 1,
  nextWorkOrderNumber: 1,
}

const design = (typology: string, width: number, height: number) =>
  createDesign(typology, { lineId: SAMPLE_DEFAULTS.lineId, colorId: SAMPLE_DEFAULTS.colorId, glassId: SAMPLE_DEFAULTS.glassId, width, height })

function quoteFor(id: string): Quote {
  return {
    id,
    number: 412,
    title: 'Casa Pérez',
    status: 'draft',
    items: [
      { id: 'a', ref: 'V1', qty: 1, design: design('casement', 900, 1200) },
      { id: 'b', ref: 'V2', qty: 2, design: design('fixed', 1500, 1000) },
    ],
    extras: [],
    discountPct: 0,
    revision: 0,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

/** Catálogo con 30 % de descuento en perfiles (como «Mis precios» de una marca). */
const DISCOUNTED: Catalog = {
  ...SAMPLE_CATALOG,
  brandSettings: SAMPLE_CATALOG.brandSettings.map((b) => ({ ...b, discounts: { ...b.discounts, profiles: 30 } })),
}

const totalWith = (quote: Quote, catalog: Catalog, settings: OrgSettings = SETTINGS) =>
  evaluateQuote(docFromQuote(quote), catalog, settings.pricing, { cut: settings.cut }).totals.total

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function renderPage(quote: Quote, prime: (client: ReturnType<typeof createQueryClient>) => void) {
  // El resto de la API (OT, clientes…) no importa aquí.
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } }))
  vi.spyOn(api.quotes, 'get').mockResolvedValue(quote)
  const client = createQueryClient()
  client.setQueryData(['me'], ME)
  client.setQueryData(['clients', ''], [])
  client.setQueryData(qk.quote(quote.id), quote)
  prime(client)
  const router = createMemoryRouter([{ element: <RequireAuth />, children: [{ path: '/cotizaciones/:id', element: <QuoteEditorPage /> }] }], {
    initialEntries: [`/cotizaciones/${quote.id}`],
  })
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
  return client
}

describe('editor: catálogo y ajustes al día', () => {
  it('con el catálogo del caché invalidado (cambiaste «Mis precios»), espera el fresco antes de abrir', async () => {
    const quote = quoteFor('q-fresh-open')
    const fresh = deferred<Catalog>()
    vi.spyOn(api.catalog, 'get').mockImplementation(() => fresh.promise as never)
    vi.spyOn(api.settings, 'get').mockResolvedValue(SETTINGS)
    renderPage(quote, (client) => {
      client.setQueryData(qk.catalog, SAMPLE_CATALOG)
      client.setQueryData(qk.settings, SETTINGS)
      // Lo que hace usePatchBrand al guardar los descuentos de una marca.
      void client.invalidateQueries({ queryKey: qk.catalog, exact: true, refetchType: 'none' })
    })
    // Mientras llega el catálogo nuevo no se arma el editor con precios viejos.
    expect(await screen.findByLabelText('Abriendo la cotización')).toBeTruthy()
    expect(screen.queryByRole('list', { name: 'Ventanas de la cotización' })).toBeNull()
    await act(async () => {
      fresh.resolve(DISCOUNTED)
    })
    await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    const bridge = getQuoteEditor()
    expect(bridge?.quoteId).toBe(quote.id)
    expect(bridge?.getCatalog()).toEqual(DISCOUNTED)
    expect(bridge?.getQuote().totals?.total).toBe(totalWith(quote, DISCOUNTED))
    expect(totalWith(quote, DISCOUNTED)).toBeLessThan(totalWith(quote, SAMPLE_CATALOG))
  })

  it('con el editor abierto, un catálogo o unos ajustes nuevos recalculan el precio en vivo', async () => {
    const quote = quoteFor('q-live-update')
    vi.spyOn(api.catalog, 'get').mockResolvedValue(SAMPLE_CATALOG as never)
    vi.spyOn(api.settings, 'get').mockResolvedValue(SETTINGS)
    const client = renderPage(quote, (c) => {
      c.setQueryData(qk.catalog, SAMPLE_CATALOG)
      c.setQueryData(qk.settings, SETTINGS)
    })
    await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    const bridge = getQuoteEditor()
    expect(bridge?.getQuote().totals?.total).toBe(totalWith(quote, SAMPLE_CATALOG))

    // Otra persona cambió los descuentos (llega con el refetch).
    act(() => {
      client.setQueryData(qk.catalog, DISCOUNTED)
    })
    await waitFor(() => expect(bridge?.getQuote().totals?.total).toBe(totalWith(quote, DISCOUNTED)))

    // Y el margen general.
    const higher: OrgSettings = { ...SETTINGS, pricing: { ...SETTINGS.pricing, marginPct: SETTINGS.pricing.marginPct + 10 } }
    act(() => {
      client.setQueryData(qk.settings, higher)
    })
    await waitFor(() => expect(bridge?.getQuote().totals?.total).toBe(totalWith(quote, DISCOUNTED, higher)))
  })
})
