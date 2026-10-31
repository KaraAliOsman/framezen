import '../../../test/setup'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { createDesign } from '@framezen/engine'
import { SAMPLE_CATALOG } from '@framezen/catalog'
import { createQueryClient, qk } from '../../lib/queryClient'
import PortalPage from './PortalPage'
import type { PortalData } from './portalModel'

function portalData(partial: Partial<PortalData['quote']> = {}): PortalData {
  const sliding = createDesign('sliding_2', { lineId: 'serie-70-corredera', width: 1800, height: 1200, colorId: 'blanco', glassId: 'dvh-4-12-4' })
  const tilt = createDesign('tilt_turn', { lineId: 'serie-60', width: 800, height: 1200, colorId: 'blanco', glassId: 'dvh-4-12-4' })
  return {
    quote: {
      id: 'q1',
      number: 412,
      title: 'Casa Soto · Concepción',
      status: 'sent',
      client: { id: 'c1', name: 'Pedro Soto', createdAt: '', updatedAt: '' },
      items: [
        { id: 'a', ref: 'V1', name: 'Ventanal', location: 'Living', qty: 1, design: sliding },
        { id: 'b', ref: 'V2', location: 'Dormitorio', qty: 2, design: tilt },
      ],
      extras: [{ id: 'e', label: 'Instalación', amount: 120_000 }],
      discountPct: 0,
      revision: 2,
      version: 4,
      sentAt: '2026-10-30T12:00:00.000Z',
      createdAt: '2026-10-29T12:00:00.000Z',
      updatedAt: '2026-10-30T12:00:00.000Z',
      totals: { subtotal: 700_000, discountPct: 0, discount: 0, extras: 120_000, net: 820_000, iva: 155_800, total: 975_800, area: 4.08, units: 3, cost: 0, marginPct: 0 },
      ...partial,
    },
    org: { name: 'Ventanas del Sur', accent: '#8A2E3B', phone: '+56 9 1234 5678', email: 'ventas@sur.cl' },
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
      intro: 'Gracias por confiar en nosotros.',
      conditions: '- Precios en pesos chilenos.',
      paymentTerms: '50 % al aceptar y 50 % contra entrega',
      warranty: '5 años en perfiles.',
      validityDays: 15,
      leadTimeText: '15 días hábiles.',
    },
    catalog: { ...SAMPLE_CATALOG, updatedAt: '' },
    features: ['client3d'],
    prices: { a: { unitNet: 400_000, totalNet: 400_000 }, b: { unitNet: 150_000, totalNet: 300_000 } },
    revisionLabel: 'B',
  }
}

function renderPortal(data: PortalData) {
  const client = createQueryClient()
  client.setQueryData(qk.portal('tok'), data)
  client.setQueryData(['me'], null)
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/c/tok']}>
        <Routes>
          <Route path="/c/:token" element={<PortalPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('portal del cliente', () => {
  it('muestra la marca del taller, cada ventana con su precio, totales y condiciones', () => {
    renderPortal(portalData())
    expect(screen.getByRole('heading', { level: 1, name: 'Casa Soto · Concepción' })).toBeTruthy()
    expect(screen.getByText('Cotización N° 412 · versión B')).toBeTruthy()
    expect(screen.getAllByText('Ventanas del Sur').length).toBeGreaterThan(0)
    const v1 = screen.getByRole('article', { name: 'Corredera 2 hojas' })
    expect(within(v1).getByText('1.800 × 1.200 mm')).toBeTruthy()
    expect(within(v1).getByText('$400.000')).toBeTruthy()
    const v2 = screen.getByRole('article', { name: 'Oscilobatiente' })
    expect(within(v2).getByText('$150.000 c/u')).toBeTruthy()
    expect(within(v2).getByText('$300.000')).toBeTruthy()
    expect(screen.getAllByText('$975.800').length).toBeGreaterThan(0)
    expect(screen.getByText('Instalación')).toBeTruthy()
    // Forma de pago con montos calculados.
    expect(screen.getAllByText('$487.900')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Ver en 3D' })).toHaveLength(2)
  })

  it('resumen claro: ventanas contadas por unidad y sin filas repetidas si no hay descuento ni extras', () => {
    const data = portalData({
      extras: [],
      totals: { subtotal: 700_000, discountPct: 0, discount: 0, extras: 0, net: 700_000, iva: 133_000, total: 833_000, area: 4.08, units: 3, cost: 0, marginPct: 0 },
    })
    renderPortal(data)
    expect(screen.getByText(/^3 ventanas · /)).toBeTruthy()
    expect(screen.queryByText(/diseños|unidades ·/)).toBeNull()
    const summary = screen.getByRole('region', { name: 'Resumen' })
    expect(within(summary).queryByText('Ventanas')).toBeNull()
    expect(within(summary).getByText('Neto')).toBeTruthy()
    // En el teléfono, el botón dice lo que hace.
    expect(screen.getAllByRole('button', { name: 'Pedir cambios' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Cambios' })).toBeNull()
  })

  it('con extras, el subtotal de ventanas sí aparece', () => {
    renderPortal(portalData())
    expect(within(screen.getByRole('region', { name: 'Resumen' })).getByText('Ventanas')).toBeTruthy()
  })

  it('se ve siempre en claro aunque el tema guardado sea oscuro, y lo restaura al salir', () => {
    document.documentElement.dataset.theme = 'dark'
    const view = renderPortal(portalData())
    expect(document.documentElement.dataset.theme).toBe('light')
    // Si el proveedor de tema vuelve a ponerlo oscuro (cambio del sistema), el portal sigue claro.
    document.documentElement.dataset.theme = 'dark'
    return waitFor(() => expect(document.documentElement.dataset.theme).toBe('light')).then(() => {
      view.unmount()
      expect(document.documentElement.dataset.theme).toBe('dark')
      document.documentElement.dataset.theme = 'light'
    })
  })

  it('aceptar: pide el nombre, explica el consentimiento y deja la cotización aceptada', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('/api/public/quotes/tok/accept')
      expect(JSON.parse(String(init?.body))).toEqual({ name: 'Pedro Soto', rut: '12.345.678-9', revision: 2 })
      return new Response(
        JSON.stringify({ ok: true, alreadyAccepted: false, status: 'accepted', acceptedBy: { name: 'Pedro Soto', at: '2026-10-31T12:00:00.000Z' }, warnings: ['El RUT no parece válido.'] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    renderPortal(portalData())
    fireEvent.click(screen.getAllByRole('button', { name: /Aceptar/ })[0])
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Al aceptar confirmas que estás de acuerdo con las 2 ventanas/)).toBeTruthy()
    const name = within(dialog).getByLabelText('Tu nombre') as HTMLInputElement
    expect(name.value).toBe('Pedro Soto')
    fireEvent.change(within(dialog).getByLabelText(/RUT/), { target: { value: '12.345.678-9' } })
    expect(within(dialog).getByText(/dígito verificador no calza/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Acepto la cotización' }))
    await waitFor(() => expect(within(dialog).getByText('¡Listo, Pedro!')).toBeTruthy())
    expect(within(dialog).getByText('El RUT no parece válido.')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getAllByText('Cotización aceptada').length).toBeGreaterThan(0))
  })

  it('aceptar sin nombre avisa en línea y no envía nada', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    renderPortal(portalData({ client: undefined }))
    fireEvent.click(screen.getAllByRole('button', { name: /Aceptar/ })[0])
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Acepto la cotización' }))
    expect(within(dialog).getByText('Escribe tu nombre para dejar registrada la aceptación.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('ya aceptada: lo dice arriba y ofrece escribir al taller en vez de aceptar', () => {
    renderPortal(portalData({ status: 'accepted', acceptedBy: { name: 'Pedro Soto', at: '2026-10-31T12:00:00.000Z' } }))
    expect(screen.getByText('Aceptada por Pedro Soto')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Aceptar cotización' })).toBeNull()
    expect(screen.getAllByRole('button', { name: /Escribir al taller/ }).length).toBeGreaterThan(0)
  })

  it('pedir cambios envía el mensaje y confirma', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, message: 'Listo, le avisamos al taller.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    )
    renderPortal(portalData())
    fireEvent.click(screen.getAllByRole('button', { name: /Pedir cambios/ })[0])
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('¿Qué te gustaría cambiar?'), { target: { value: 'La V1 en nogal.' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(within(dialog).getByText('Listo, le avisamos al taller.')).toBeTruthy())
  })
})
