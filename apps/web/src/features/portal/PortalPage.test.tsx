import '../../../test/setup'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { resetI18nForTests } from '../../lib/i18n'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { createDesign } from '@dekopen/engine'
import { SAMPLE_CATALOG } from '@dekopen/catalog'
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
  resetI18nForTests()
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
    expect(screen.getAllByText('$975.800')).toHaveLength(1)
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
    expect(screen.getAllByRole('button', { name: 'Pedir cambios' })).toHaveLength(1)
  })

  it('el total aparece una sola vez, después de las ventanas, y las condiciones van tras él', () => {
    renderPortal(portalData())
    const text = document.body.textContent ?? ''
    const total = text.indexOf('$975.800')
    expect(total).toBeGreaterThan(text.indexOf('Oscilobatiente'))
    expect(text.indexOf('Condiciones')).toBeGreaterThan(total)
    expect(text.lastIndexOf('$975.800')).toBe(total)
    // La barra del teléfono lleva al final sin mostrar la cifra.
    expect(screen.getByRole('button', { name: 'Ver el total' }).textContent).not.toMatch(/\$/)
  })

  it('sin nada configurado no hay sección de pago, y el PDF siempre está a mano', () => {
    renderPortal(portalData())
    expect(screen.queryByRole('heading', { name: 'Pago' })).toBeNull()
    // Arriba, siempre a mano, y otra vez en el cierre, donde el cliente termina de leer.
    expect(screen.getAllByRole('button', { name: 'Descargar PDF' })).toHaveLength(2)
  })

  it('datos de pago: se copian de a uno o todos juntos, y un enlace que no es https no se dibuja', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const data = portalData()
    renderPortal({
      ...data,
      payment: {
        unlocked: true,
        deposit: { amount: 292_740, mode: 'percent', pct: 30 },
        accounts: [{ id: 'a', holder: 'Ventanas SpA', rut: '76.543.210-3', bank: 'Banco Uno', type: 'corriente', number: '12345', email: '' }],
        links: [
          { id: 'ok', label: 'Pagar con tarjeta', url: 'https://pago.ejemplo.cl/x' },
          { id: 'mal', label: 'Enlace malo', url: 'javascript:alert(1)' },
        ],
        instructions: 'Avísanos al transferir',
      },
    })
    expect(screen.getByRole('heading', { name: 'Pago' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Pagar con tarjeta' }).getAttribute('href')).toBe('https://pago.ejemplo.cl/x')
    expect(screen.getByRole('link', { name: 'Pagar con tarjeta' }).getAttribute('rel')).toContain('noreferrer')
    expect(screen.queryByText('Enlace malo')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Copiar Número de cuenta/ }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('12345'))
    fireEvent.click(screen.getByRole('button', { name: 'Copiar todos los datos' }))
    await waitFor(() => expect(String(writeText.mock.calls.at(-1)?.[0 as never])).toContain('Banco: Banco Uno'))
    // El pago va después del total.
    const text = document.body.textContent ?? ''
    expect(text.indexOf('Pago')).toBeGreaterThan(text.indexOf('$975.800'))
  })

  it('con pago solo tras aceptar, avisa sin mostrar ningún dato', () => {
    const data = portalData()
    renderPortal({ ...data, payment: { unlocked: false, deposit: { amount: 100_000, mode: 'amount' } } })
    expect(screen.getByText('Los datos para pagar aparecen al aceptar la cotización.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copiar todos los datos' })).toBeNull()
  })

  it('el taller apaga la vista 3D aunque su plan la incluya', () => {
    const data = portalData()
    renderPortal({ ...data, experience: { view3d: false, ar: false } })
    expect(screen.queryByRole('button', { name: 'Ver en 3D' })).toBeNull()
  })

  it('una ventana sin precio se rotula: nunca $0, y el total lo avisa', () => {
    const data = portalData()
    const id = data.quote.items[0]!.id
    renderPortal({ ...data, prices: { ...data.prices, [id]: { unitNet: 0, totalNet: 0, pending: true } } })
    expect(screen.getByText('Precio por confirmar')).toBeTruthy()
    expect(screen.queryByText('$0')).toBeNull()
    expect(screen.getByText(/Una ventana aún no tiene precio y no está en este total/)).toBeTruthy()
  })

  it('respeta lo que el taller decidió mostrar: sin precio por ventana no aparece', () => {
    const data = portalData()
    data.documents = { ...data.documents, showUnitPrice: false, showGlass: false }
    renderPortal(data)
    const v1 = screen.getByRole('article', { name: 'Corredera 2 hojas' })
    expect(within(v1).queryByText('$400.000')).toBeNull()
    expect(within(v1).queryByText('Vidrio')).toBeNull()
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
      expect(JSON.parse(String(init?.body))).toEqual({ name: 'Pedro Soto', rut: '12.345.678-9', revision: 2, declared: true })
      return new Response(
        JSON.stringify({ ok: true, alreadyAccepted: false, status: 'accepted', acceptedBy: { name: 'Pedro Soto', at: '2026-10-31T12:00:00.000Z' }, warnings: ['El RUT no parece válido.'] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    renderPortal(portalData())
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar cotización' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Al aceptar confirmas que estás de acuerdo con las 3 ventanas/)).toBeTruthy()
    const name = within(dialog).getByLabelText('Tu nombre') as HTMLInputElement
    expect(name.value).toBe('Pedro Soto')
    fireEvent.change(within(dialog).getByLabelText(/RUT/), { target: { value: '12.345.678-9' } })
    expect(within(dialog).getByText(/dígito verificador no calza/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('checkbox'))
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
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar cotización' }))
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

  it('pedir cambios envía el mensaje general y las notas por ventana, y confirma', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('/api/public/quotes/tok/request-changes')
      expect(JSON.parse(String(init?.body))).toEqual({ message: ['Todo en nogal.', 'V2 · Oscilobatiente: más alta'].join('\n'), name: 'Pedro Soto' })
      return new Response(JSON.stringify({ ok: true, message: 'Listo, le avisamos al taller.' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    renderPortal(portalData())
    fireEvent.click(screen.getAllByRole('button', { name: /Pedir cambios/ })[0])
    const dialog = await screen.findByRole('dialog')
    // Sin texto no se envía nada: aviso en línea.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enviar' }))
    expect(within(dialog).getByText('Escribe aunque sea una línea para saber qué ajustar.')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByLabelText('¿Qué te gustaría cambiar?'), { target: { value: 'Todo en nogal.' } })
    fireEvent.change(within(dialog).getByLabelText('V2 · Oscilobatiente'), { target: { value: 'más alta' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(within(dialog).getByText('Listo, le avisamos a Ventanas del Sur. Te contactarán con la cotización ajustada.')).toBeTruthy())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('se muestra en el idioma del documento (no en el de quien lo abre), con su formato de cifras', async () => {
    renderPortal({ ...portalData(), locale: 'en' })
    expect(await screen.findByRole('heading', { level: 2, name: 'Your windows' })).toBeTruthy()
    expect(screen.getByText('Quote No. 412 · version B')).toBeTruthy()
    expect(screen.getByRole('article', { name: '2-panel slider' })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Accept quote' }).length).toBeGreaterThan(0)
    // Moneda de la empresa (CLP) con la puntuación del inglés.
    expect(screen.getAllByText(/975,800/).length).toBeGreaterThan(0)
    expect(screen.getByText('Awaiting your reply')).toBeTruthy()
    // El documento no cambia el idioma de la interfaz de quien lo mira.
    expect(document.documentElement.lang).not.toBe('en-US')
  })

  it('la vigencia vencida se avisa sin bloquear: igual se puede aceptar', () => {
    renderPortal(portalData({ validUntil: '2020-01-31' }))
    expect(screen.getByText('Vigencia terminada')).toBeTruthy()
    expect(screen.getByText(/La vigencia de esta cotización terminó el/)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Aceptar/ }).length).toBeGreaterThan(0)
  })
})
