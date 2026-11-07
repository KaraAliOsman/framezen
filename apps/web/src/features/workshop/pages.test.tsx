import '../../../test/setup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { createDesign, DEFAULT_CUT, DEFAULT_PRICING } from '@dekopen/engine'
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '@dekopen/catalog'
import type { Feature, Me, OrgSettings, Quote, QuoteSummary, Role, WorkOrder } from '@dekopen/shared'
import { RequireAuth } from '../../lib/auth'
import { TooltipProvider } from '../../ui'
import { createQueryClient, qk } from '../../lib/queryClient'
import { workshopKeys } from './data'
import WorkOrderPage from './WorkOrderPage'
import WorkshopPage from './WorkshopPage'
import { CUT_BARS_PAGE } from './detail/CutBars'
import { PREVIEW_LIMITS } from './model/preview'

const design = (t: string, w: number, h: number, lineId: string = SAMPLE_DEFAULTS.lineId) =>
  createDesign(t, { lineId, width: w, height: h, colorId: SAMPLE_DEFAULTS.colorId, glassId: SAMPLE_DEFAULTS.glassId })

function me(features: Feature[], role: Role = 'owner'): Me {
  return {
    user: { id: 'u1', name: 'Ana Taller', email: 'ana@taller.cl', createdAt: '2026-10-01T00:00:00Z' },
    org: { id: 'o1', name: 'Ventanas del Sur', createdAt: '2026-10-01T00:00:00Z' },
    role,
    billing: {
      plan: features.length === 0 ? 'taller' : 'pro',
      status: 'active',
      period: 'monthly',
      seats: 3,
      seatsUsed: 1,
      aiCredits: { included: 2000, used: 0, extra: 0 },
      features,
      provider: 'dev',
    },
    solo: true,
    onboarded: true,
  }
}

const quote: Quote = {
  id: 'q1',
  number: 412,
  title: 'Casa Pérez · Concepción',
  status: 'workshop',
  items: [
    { id: 'i1', ref: 'V1', qty: 2, name: 'Living', design: design('casement', 800, 1200) },
    { id: 'i2', ref: 'V2', qty: 1, design: design('sliding_2', 1500, 1100, 'serie-70-corredera') },
  ],
  extras: [],
  discountPct: 0,
  revision: 1,
  version: 2,
  createdAt: '2026-10-20T12:00:00Z',
  updatedAt: '2026-10-20T12:00:00Z',
}

const order: WorkOrder = {
  id: 'w1',
  number: 38,
  quoteId: 'q1',
  quoteNumber: 412,
  title: 'Casa Pérez · Concepción',
  clientName: 'Pedro Pérez',
  status: 'in_progress',
  progress: { V1: 'weld', V2: 'cut' },
  dueDate: '2099-01-15',
  notes: 'Instalar el jueves',
  createdAt: '2026-10-31T12:00:00Z',
  updatedAt: '2026-10-31T12:00:00Z',
}

const settings = {
  pricing: { ...DEFAULT_PRICING },
  cut: { ...DEFAULT_CUT },
  documents: { paper: 'letter' },
  defaults: {},
  nextQuoteNumber: 413,
  nextWorkOrderNumber: 39,
} as unknown as OrgSettings

function setup(opts: { orders?: WorkOrder[]; accepted?: QuoteSummary[]; features?: Feature[]; role?: Role; quote?: Quote } = {}) {
  const client = createQueryClient()
  client.setDefaultOptions({ queries: { staleTime: Infinity, retry: false } })
  client.setQueryData(qk.me, me(opts.features ?? ['purchasing', 'cnc'], opts.role))
  client.setQueryData(qk.catalog, { ...SAMPLE_CATALOG, updatedAt: '2026-10-31T00:00:00Z' })
  client.setQueryData(qk.settings, settings)
  client.setQueryData(workshopKeys.all, opts.orders ?? [order])
  client.setQueryData(qk.quotes({ status: 'accepted' }), opts.accepted ?? [])
  client.setQueryData(qk.quotes({ status: 'workshop' }), [])
  client.setQueryData(qk.quotes({ status: 'installed' }), [])
  client.setQueryData(qk.workOrder('w1'), { ...order, quote: opts.quote ?? quote })
  return client
}

function renderAt(path: string, client = setup()) {
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/taller" element={<WorkshopPage />} />
            <Route path="/taller/:id" element={<WorkOrderPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  // Nada sale a la red en estas pruebas.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })))
})
afterEach(() => vi.unstubAllGlobals())

describe('/taller', () => {
  it('lista las OT con avance, entrega y resumen del taller', () => {
    renderAt('/taller')
    expect(screen.getByRole('heading', { name: 'Taller' })).toBeTruthy()
    const row = screen.getByRole('link', { name: /OT N° 38/ })
    expect(row.getAttribute('href')).toBe('/taller/w1')
    expect(within(row).getByText('Casa Pérez · Concepción')).toBeTruthy()
    expect(within(row).getByText('Pedro Pérez · Cotización N° 412')).toBeTruthy()
    expect(within(row).getByText('0 de 2 listas')).toBeTruthy()
    expect(screen.getByText('OT en taller')).toBeTruthy()
    // Tarjeta: el conteo sin repetir «Entrega ·» (la entrega ya lo dice a la derecha).
    expect(row.textContent).not.toContain('Entrega ·')
    expect(within(row).getAllByText('2 ventanas').length).toBeGreaterThan(0)
  })

  it('busca sin bloquear y ofrece volver a ver todas', () => {
    renderAt('/taller')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar órdenes de trabajo' }), { target: { value: 'lota' } })
    expect(screen.getByText('Ninguna OT calza con tu búsqueda')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas' }))
    expect(screen.getByRole('link', { name: /OT N° 38/ })).toBeTruthy()
  })

  it('estado vacío claro, con las aceptadas listas para pasar a taller', () => {
    const accepted = [{ id: 'q9', number: 9, title: 'Depto. Rojas', status: 'accepted', revision: 1, createdAt: '', updatedAt: '', total: 0, units: 3 }] as QuoteSummary[]
    renderAt('/taller', setup({ orders: [], accepted }))
    expect(screen.getByText('Pasa una cotización a taller y aparecerá aquí')).toBeTruthy()
    expect(screen.getByText('Depto. Rojas')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Pasar a taller/ })).toBeTruthy()
  })

  it('el tablero se ve con su explicación si el plan no trae estaciones', () => {
    renderAt('/taller?vista=tablero')
    expect(screen.getByText('Estaciones de producción')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Mejorar a Empresa/ })).toBeTruthy()
  })

  it('con estaciones, la flecha pasa la ventana a la siguiente y ofrece deshacer', async () => {
    const client = setup({ features: ['stations', 'purchasing', 'cnc'] })
    renderAt('/taller?vista=tablero', client)
    const button = await screen.findByRole('button', { name: 'Pasar V2 de la OT N° 38 a Soldadura' })
    fireEvent.click(button)
    await waitFor(() => expect(client.getQueryData<WorkOrder[]>(workshopKeys.all)?.[0]?.progress.V2).toBe('weld'))
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.some(([url, init]) => String(url).includes('/work-orders/w1') && (init as RequestInit)?.method === 'PATCH')).toBe(true)
  })
})

describe('/taller/:id', () => {
  it('cabecera, ventanas con estación y totales del motor', () => {
    renderAt('/taller/w1')
    expect(screen.getAllByRole('heading', { level: 1 })[0]?.textContent).toContain('OT N° 38')
    expect(screen.getByText('Casa Pérez · Concepción · Pedro Pérez')).toBeTruthy()
    expect(screen.getByLabelText('Fecha comprometida de entrega')).toHaveProperty('value', '2099-01-15')
    expect(screen.getByRole('link', { name: /Cotización N° 412/ }).getAttribute('href')).toBe('/cotizaciones/q1')
    expect(screen.getByText('Ventanas y avance')).toBeTruthy()
    expect(screen.getByRole('combobox', { name: 'Estación de la V1' }).textContent).toContain('Soldadura')
    expect(screen.getByRole('combobox', { name: 'Estación de la V2' }).textContent).toContain('Corte')
    expect((screen.getByLabelText('Notas para el taller') as HTMLTextAreaElement).value).toBe('Instalar el jueves')
    // La hoja de OT se dibuja con el documento real.
    expect(document.querySelector('[data-document="work-order"]')).toBeTruthy()
  })

  it('cortes interactivos con barras a escala y la hoja para imprimir', () => {
    renderAt('/taller/w1?pestana=cortes')
    expect(screen.getByText('Barras a sacar')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Marcar barra 1 como cortada/ }).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('radio', { name: 'Hoja para imprimir' }))
    expect(document.querySelector('[data-document="cuts"]')).toBeTruthy()
  })

  it('vidrios y materiales muestran su documento', () => {
    renderAt('/taller/w1?pestana=vidrios')
    expect(screen.getByRole('heading', { name: 'Pedido de vidrios' })).toBeTruthy()
    expect(document.querySelector('[data-document="glass"]')).toBeTruthy()
  })

  it('un solo primario por vista: la OT completa va en la cabecera solo en Resumen', () => {
    const { unmount } = renderAt('/taller/w1')
    expect(screen.getAllByRole('button', { name: 'Descargar OT' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /Toda la OT/ })).toBeNull()
    unmount()
    renderAt('/taller/w1?pestana=vidrios')
    expect(screen.queryByRole('button', { name: 'Descargar OT' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Imprimir OT' })).toBeNull()
    expect(screen.getByRole('button', { name: /Toda la OT/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeTruthy()
  })

  // Dibujar todas las etiquetas con QR toma ~1,5 s solo y más con la suite completa en paralelo.
  const LABELS_TIMEOUT = 15_000

  it('etiquetas en rollo: el PDF se pide con ?labels=roll, que es lo que lee el servidor', async () => {
    vi.stubGlobal('print', vi.fn())
    renderAt('/taller/w1?pestana=etiquetas')
    fireEvent.click(screen.getByRole('radio', { name: 'Rollo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Descargar PDF' }))
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    await waitFor(() => expect(calls.some(([url]) => String(url).includes('doc=labels'))).toBe(true))
    const url = new URL(String(calls.find(([u]) => String(u).includes('doc=labels'))?.[0]), 'http://x')
    expect(url.searchParams.get('labels')).toBe('roll')
    expect(url.searchParams.has('format')).toBe(false)
  }, LABELS_TIMEOUT)

  it('etiquetas sin vidrios: el PDF se pide al servidor con ?glass=0 (sale igual que en pantalla)', async () => {
    vi.stubGlobal('print', vi.fn())
    renderAt('/taller/w1?pestana=etiquetas')
    fireEvent.click(screen.getByRole('switch', { name: 'Incluir vidrios' }))
    fireEvent.click(screen.getByRole('button', { name: 'Descargar PDF' }))
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    await waitFor(() => expect(calls.some(([url]) => String(url).includes('doc=labels'))).toBe(true))
    const url = new URL(String(calls.find(([u]) => String(u).includes('doc=labels'))?.[0]), 'http://x')
    expect(url.searchParams.get('glass')).toBe('0')
  }, LABELS_TIMEOUT)

  // Una sola ventana con muchas unidades. Antes la vista previa de etiquetas entraba la primera
  // ventana completa: con 200 unidades, 800.000 nodos y la pestaña congelada 10 s; con 10.000, caída.
  const manyUnits = (qty: number): Quote => ({ ...quote, items: [{ ...quote.items[0]!, qty }, quote.items[1]!] })
  const drawn = (region: string, selector: string) => screen.getByRole('region', { name: region }).querySelectorAll(selector).length

  it('etiquetas: la vista previa dibuja a lo más 30 aunque sean todas de la primera ventana', () => {
    renderAt('/taller/w1?pestana=etiquetas', setup({ quote: manyUnits(12) }))
    expect(drawn('Vista previa de las etiquetas', '.fzw-label')).toBe(PREVIEW_LIMITS.labels)
    expect(screen.getByText(/^Muestra de las primeras 30 etiquetas\. Al imprimir salen las [\d.]+\.$/)).toBeTruthy()
  }, LABELS_TIMEOUT)

  it('etiquetas: con miles, la vista previa sigue en 30 e «Imprimir» baja el PDF del servidor', async () => {
    const print = vi.fn()
    vi.stubGlobal('print', print)
    // Otras pruebas imprimen en el navegador (respaldo del PDF) y la hoja queda montada hasta «afterprint».
    document.getElementById('fz-print-root')?.remove()
    renderAt('/taller/w1?pestana=etiquetas', setup({ quote: manyUnits(2000) }))
    expect(drawn('Vista previa de las etiquetas', '.fzw-label')).toBe(PREVIEW_LIMITS.labels)
    fireEvent.click(screen.getByRole('button', { name: 'Imprimir' }))
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    await waitFor(() => expect(calls.some(([url]) => String(url).includes('doc=labels'))).toBe(true))
    expect(document.getElementById('fz-print-root')).toBeNull()
    expect(print).not.toHaveBeenCalled()
  }, LABELS_TIMEOUT)

  it('cortes: con muchas unidades las barras se dibujan de a tandas y la hoja muestra las primeras', () => {
    renderAt('/taller/w1?pestana=cortes', setup({ quote: manyUnits(200) }))
    const more = screen.getAllByRole('button', { name: /^Ver \d+ barras más$/ })
    expect(more.length).toBeGreaterThan(0)
    const group = more[0]!.closest('section')!
    const marks = () => within(group).getAllByRole('button', { name: /^Marcar barra \d+ como cortada$/ }).length
    expect(marks()).toBe(CUT_BARS_PAGE)
    fireEvent.click(more[0]!)
    expect(marks()).toBeGreaterThan(CUT_BARS_PAGE)
    for (const section of document.querySelectorAll('section[aria-label]')) {
      expect(within(section as HTMLElement).queryAllByRole('button', { name: /^Marcar barra/ }).length).toBeLessThanOrEqual(2 * CUT_BARS_PAGE)
    }

    fireEvent.click(screen.getByRole('radio', { name: 'Hoja para imprimir' }))
    expect(drawn('Vista previa de la optimización de cortes', '.fzw-bar-row')).toBe(PREVIEW_LIMITS.cutBars)
    expect(screen.getByText(/^Muestra de las primeras 60 barras\. Al imprimir salen las [\d.]+\.$/)).toBeTruthy()
  })

  it('montaje: con muchas unidades la vista previa muestra las primeras hojas, numeradas del total', () => {
    renderAt('/taller/w1?pestana=montaje', setup({ quote: manyUnits(200) }))
    // 200 unidades en fichas de 8 = 25 fichas, más la V2: 26 fichas, 2 por hoja = 13 hojas.
    expect(drawn('Vista previa del listado de montaje', '.fzw-sheet')).toBe(PREVIEW_LIMITS.assemblySheets)
    expect(screen.getByRole('region', { name: 'Vista previa del listado de montaje' }).textContent).toContain('Hoja 1 de 13')
    expect(screen.getByText('Muestra de las primeras 6 hojas. Al imprimir salen las 13.')).toBeTruthy()
  })

  it('con roles, quien no es dueño ni jefe de taller no ve costos', () => {
    renderAt('/taller/w1?pestana=materiales', setup({ features: ['roles', 'purchasing', 'cnc', 'stations'], role: 'operator' }))
    expect(screen.getByRole('heading', { name: 'Lista de materiales' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'Con costos' })).toBeNull()
    expect(screen.queryByRole('radio', { name: 'Costos internos' })).toBeNull()
  })

  it('el dueño elige entre bodega, con costos y costos internos', () => {
    renderAt('/taller/w1?pestana=materiales')
    fireEvent.click(screen.getByRole('radio', { name: 'Costos internos' }))
    expect(document.querySelector('[data-document="costs"]')).toBeTruthy()
  })

  it('CNC: tabla del CSV de sierra; sin el plan, se explica sin romper', () => {
    renderAt('/taller/w1?pestana=cnc')
    expect(screen.getByRole('button', { name: 'Descargar CSV' })).toBeTruthy()
    expect(screen.getByText('OT-38-Sierra.csv')).toBeTruthy()
  })

  it('CNC fuera del plan', () => {
    renderAt('/taller/w1?pestana=cnc', setup({ features: [] }))
    expect(screen.getByText('Exportación para sierras')).toBeTruthy()
  })
})
