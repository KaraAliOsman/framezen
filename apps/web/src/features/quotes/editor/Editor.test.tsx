import '../../../../test/setup'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createDesign, DEFAULT_CUT, DEFAULT_PRICING, formatCLP } from '@dekopen/engine'
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '@dekopen/catalog'
import type { Me, Quote } from '@dekopen/shared'
import { RequireAuth } from '../../../lib/auth'
import { TooltipProvider } from '../../../ui'
import { createQueryClient } from '../../../lib/queryClient'
import { getQuoteEditor } from '../../assistant/bridge'
import { createQuoteEditor, type EditorSettings, type QuoteTransport } from '../model/store'
import { editorSaveLabel } from './saveLabel'
import { createEditorUi, EditorProvider } from './context'
import { Editor } from './Editor'

beforeAll(() => {
  // Escritorio ancho: tres zonas.
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

const design = (typology: string, width: number, height: number) =>
  createDesign(typology, { lineId: SAMPLE_DEFAULTS.lineId, colorId: SAMPLE_DEFAULTS.colorId, glassId: SAMPLE_DEFAULTS.glassId, width, height })

const QUOTE: Quote = {
  id: 'q1',
  number: 412,
  title: 'Casa Pérez',
  status: 'draft',
  items: [
    { id: 'a', ref: 'V1', qty: 1, design: design('casement', 900, 1200), location: 'Cocina' },
    { id: 'b', ref: 'V2', qty: 2, design: design('fixed', 1500, 1000) },
  ],
  extras: [],
  discountPct: 0,
  revision: 0,
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function setup(
  options: { quote?: Partial<Quote>; prime?: (client: QueryClient) => void; settings?: Partial<EditorSettings>; save?: QuoteTransport['save'] } = {},
) {
  const quote: Quote = { ...QUOTE, ...options.quote }
  const saves: unknown[] = []
  const transport: QuoteTransport = {
    save: async (id, body) => {
      saves.push(body)
      if (options.save) return options.save(id, body)
      return { ...quote, version: quote.version + saves.length }
    },
    get: async () => quote,
  }
  const editor = createQuoteEditor(
    { quote, catalog: SAMPLE_CATALOG, settings: { pricing: DEFAULT_PRICING, cut: DEFAULT_CUT, documents: undefined as never, defaults: {}, ...options.settings } },
    { transport, debounceMs: 10_000 },
  )
  const ui = createEditorUi()
  const client = createQueryClient()
  client.setQueryData(['me'], ME)
  client.setQueryData(['clients', ''], [])
  options.prime?.(client)
  const router = createMemoryRouter(
    [
      {
        element: <RequireAuth />,
        children: [
          {
            path: '/cotizaciones/:id',
            element: (
              <EditorProvider editor={editor} ui={ui}>
                <Editor />
              </EditorProvider>
            ),
          },
        ],
      },
    ],
    { initialEntries: ['/cotizaciones/q1'] },
  )
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>,
  )
  return { editor, ui, saves }
}

describe('editor de cotización', () => {
  it('muestra ventanas, totales del motor y edita con deshacer', async () => {
    const { editor } = setup()
    const list = await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(within(list).getByRole('button', { name: /^V1, Abatible/ })).toBeTruthy()

    const totals = screen.getByRole('contentinfo', { name: 'Totales' })
    const total = editor.get().evaluation.totals.total
    expect(total).toBeGreaterThan(0)
    expect(totals.textContent).toContain(formatCLP(total))

    // Cantidad en línea: V1 pasa a 2 y el total sube.
    fireEvent.click(within(within(list).getByRole('group', { name: 'Cantidad de V1' })).getByRole('button', { name: 'Una más' }))
    expect(editor.get().doc.items[0].qty).toBe(2)
    expect(editor.get().evaluation.totals.total).toBeGreaterThan(total)

    // Atajo 2 selecciona V2; Ctrl+Z deshace la cantidad.
    fireEvent.keyDown(window, { key: '2' })
    expect(editor.get().selectedItemId).toBe('b')
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(editor.get().doc.items[0].qty).toBe(1)
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(editor.get().doc.items[0].qty).toBe(2)
  })

  it('D duplica y Supr elimina la ventana seleccionada', async () => {
    const { editor } = setup()
    await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    act(() => editor.select('a'))
    fireEvent.keyDown(window, { key: 'd' })
    expect(editor.get().doc.items.map((i) => i.ref)).toEqual(['V1', 'V2', 'V3'])
    expect(editor.get().selectedItemId).not.toBe('a')
    fireEvent.keyDown(window, { key: 'Delete' })
    expect(editor.get().doc.items).toHaveLength(2)
  })

  it('D deja el cursor en el ancho de la copia', async () => {
    const { editor } = setup()
    await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    act(() => editor.select('a'))
    fireEvent.keyDown(window, { key: 'd' })
    await waitFor(() => expect(document.activeElement?.hasAttribute('data-item-width')).toBe(true))
  })

  it('la fila activa no dibuja filo y el botón anuncia su tecla', async () => {
    const { editor } = setup()
    const list = await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    act(() => editor.select('a'))
    const row = within(list).getByRole('button', { name: /^V1, / }).parentElement!
    expect(row.className).toContain('bg-surface')
    expect(row.querySelector('.bg-accent')).toBeNull()
    expect(screen.getByRole('button', { name: 'Duplicar ventana' }).getAttribute('aria-keyshortcuts')).toBe('D')
  })

  it('Enter sobre la ventana ya elegida abre «Agregar ventana»', async () => {
    const { editor, ui } = setup()
    const list = await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    act(() => editor.select('a'))
    fireEvent.keyDown(within(list).getByRole('button', { name: /^V1, / }), { key: 'Enter' })
    expect(ui.getState().pickerOpen).toBe(true)
  })

  it('agregar varias ventanas es un solo paso de deshacer', async () => {
    const { editor } = setup()
    await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    act(() => {
      editor.addItems([{ design: design('fixed', 1000, 900), qty: 2 }, { design: design('fixed', 1100, 900) }])
    })
    expect(editor.get().doc.items.map((i) => i.ref)).toEqual(['V1', 'V2', 'V3', 'V4'])
    expect(editor.get().doc.items[2].qty).toBe(2)
    act(() => {
      editor.undo()
    })
    expect(editor.get().doc.items).toHaveLength(2)
  })

  it('A abre la galería de tipologías', async () => {
    const { ui } = setup()
    await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    fireEvent.keyDown(window, { key: 'a' })
    expect(ui.getState().pickerOpen).toBe(true)
  })

  it('se registra en el puente del asistente y sus cambios entran al historial', async () => {
    const { editor } = setup()
    await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    const bridge = getQuoteEditor()
    expect(bridge?.quoteId).toBe('q1')
    act(() => bridge?.setDiscount(10))
    expect(editor.get().doc.discountPct).toBe(10)
    const id = bridge!.addItem(design('awning', 600, 500), { qty: 3, location: 'Baño' })
    expect(bridge!.getQuote().items.find((i) => i.id === id)).toMatchObject({ ref: 'V3', qty: 3, location: 'Baño' })
    act(() => bridge!.showDocument())
    expect(editor.get().view).toBe('document')
    act(() => {
      editor.undo()
      editor.undo()
    })
    expect(editor.get().doc.discountPct).toBe(0)
    expect(editor.get().doc.items).toHaveLength(2)
  })

  it('agregar por el puente cierra la galería «Agregar ventana» si estaba abierta', async () => {
    const { editor, ui } = setup()
    await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    act(() => ui.getState().set({ pickerOpen: true }))
    expect(ui.getState().pickerOpen).toBe(true)
    let id = ''
    act(() => {
      id = getQuoteEditor()!.addItem(design('sliding_2', 1500, 1200))
    })
    expect(ui.getState().pickerOpen).toBe(false)
    expect(editor.get().doc.items.some((i) => i.id === id)).toBe(true)
  })

  it('con Marco abierto la hoja le cede su lugar: el editor no reserva columna y el inspector pasa a hoja si no cabe', async () => {
    const wide = window.matchMedia
    window.matchMedia = ((query: string) => ({ ...wide(query), matches: /min-width/.test(query) && !query.includes('1720') })) as typeof window.matchMedia
    setup()
    await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeTruthy()
    await act(async () => {
      document.documentElement.dataset.assistant = 'open'
      await new Promise((r) => setTimeout(r, 0))
    })
    // `.fz-sheet-gutter` solo cede si el editor no trae su propia columna.
    expect(document.querySelector('[data-assistant-dock]')).toBeNull()
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull()
    await act(async () => {
      delete document.documentElement.dataset.assistant
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeTruthy()
    window.matchMedia = wide
  })

  it('«en todas» cambia el color de todas las ventanas en un paso con deshacer', async () => {
    const { editor } = setup()
    await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    act(() => editor.select('a'))
    const other = SAMPLE_CATALOG.colors.find((c) => c.id !== SAMPLE_DEFAULTS.colorId)!
    act(() => editor.updateDesign('a', (d) => ({ ...d, colorId: other.id }), 'Color'))
    const button = await screen.findByRole('button', { name: new RegExp(`${other.name} en todas`) })
    fireEvent.click(button)
    expect(editor.get().doc.items.every((i) => i.design.colorId === other.id)).toBe(true)
    act(() => {
      editor.undo()
    })
    expect(editor.get().doc.items[1].design.colorId).toBe(SAMPLE_DEFAULTS.colorId)
    expect(editor.get().doc.items[0].design.colorId).toBe(other.id)
  })

  it('la lista de ventanas es una sola parada de Tab: ↑/↓ recorren las filas y −/+ no entran al Tab', async () => {
    setup()
    const list = await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    const rows = within(list).getAllByRole('button', { name: /^V\d, / })
    expect(rows.map((r) => r.tabIndex)).toEqual([0, -1])
    const qty = within(list).getAllByRole('textbox', { name: /Cantidad de V/ })
    expect(qty.map((q) => q.tabIndex)).toEqual([0, -1])
    for (const step of within(list).getAllByRole('button', { name: /Una (más|menos)/ })) expect(step.tabIndex).toBe(-1)
    act(() => rows[0].focus())
    fireEvent.keyDown(rows[0], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(rows[1])
    expect(rows.map((r) => r.tabIndex)).toEqual([-1, 0])
    expect(within(list).getAllByRole('textbox', { name: /Cantidad de V/ }).map((q) => q.tabIndex)).toEqual([-1, 0])
    fireEvent.keyDown(rows[1], { key: 'Home' })
    expect(document.activeElement).toBe(rows[0])
  })

  it('la acción principal de la cabecera sigue la etapa: aceptada → «Pasar a taller»; con OT → «Ver OT N° 7»', async () => {
    setup({ quote: { status: 'accepted', revision: 1, sentAt: QUOTE.updatedAt } })
    const header = await screen.findByRole('banner', { name: 'Cotización' })
    const buttons = within(header).getAllByRole('button').map((b) => b.textContent?.trim())
    // El primario va al final: «Pasar a taller»; «Enviar al cliente» queda como secundario.
    expect(buttons.slice(-2)).toEqual(['Enviar al cliente', 'Pasar a taller'])
    // Los totales no llevan acciones de etapa: solo «Agregar» extras.
    const footer = screen.getByRole('contentinfo', { name: 'Totales' })
    expect(within(footer).queryByRole('button', { name: 'Pasar a taller' })).toBeNull()
  })

  it('con OT creada el editor la muestra y enlaza («Ver OT N° 7»)', async () => {
    setup({
      quote: { status: 'workshop', revision: 1, sentAt: QUOTE.updatedAt },
      prime: (client) =>
        client.setQueryData(['work-orders', { quoteId: 'q1' }], [{ id: 'w1', number: 7, quoteId: 'q1', quoteNumber: 412, title: 'Casa Pérez', status: 'open', progress: {}, createdAt: '', updatedAt: '' }]),
    })
    const header = await screen.findByRole('banner', { name: 'Cotización' })
    expect(within(header).getByRole('button', { name: 'Ver OT N° 7' })).toBeTruthy()
    expect(within(header).queryByRole('button', { name: 'Pasar a taller' })).toBeNull()
    expect(within(header).getByRole('link', { name: /OT N° 7/ }).getAttribute('href')).toBe('/taller/w1')
  })

  it('vista Documento: sin inspector y con PDF, Copiar enlace, WhatsApp y Correo', async () => {
    const { editor, ui } = setup()
    await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeTruthy()
    act(() => editor.setView('document'))
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull()
    for (const name of ['Descargar PDF', 'Copiar enlace', 'WhatsApp', 'Correo']) expect(screen.getByRole('button', { name })).toBeTruthy()
    // Borrador sin enlace: copiar abre «Enviar al cliente» para crear el enlace y copiarlo.
    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }))
    expect(ui.getState()).toMatchObject({ sendOpen: true, sendIntent: 'copy' })
    // Escala del documento: 100 %.
    fireEvent.click(screen.getByText('100 %').closest('button')!)
    expect(ui.getState().docZoom).toBe('actual')
  })

  it('la galería de diseños dibuja esta cotización con cada diseño y elegir cambia solo esta cotización (con deshacer)', async () => {
    const { editor, ui } = setup()
    await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    act(() => editor.setView('document'))
    // El botón muestra el diseño en uso y abre la galería.
    fireEvent.click(await screen.findByRole('button', { name: /Diseño del documento: .*Ver todos los diseños/ }))
    expect(ui.getState().templateGalleryOpen).toBe(true)
    const dialog = await screen.findByRole('dialog', { name: 'Diseño del documento' })
    const cards = dialog.querySelectorAll('[data-template-id]')
    expect(cards.length).toBeGreaterThanOrEqual(5)
    expect(within(dialog).getAllByRole('button', { pressed: true })).toHaveLength(1)
    const other = [...cards].find((el) => el.getAttribute('aria-pressed') === 'false')!
    const id = other.getAttribute('data-template-id')!
    fireEvent.click(other)
    expect(editor.get().doc.documentOverrides).toMatchObject({ v: 2, templateId: id })
    expect(ui.getState().templateGalleryOpen).toBe(false)
    act(() => editor.undo())
    expect(editor.get().doc.documentOverrides?.templateId).toBeUndefined()
  })

  it('la vista Documento muestra los ajustes de esta cotización y cada cambio entra al historial', async () => {
    const { editor } = setup()
    await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    act(() => editor.setView('document'))
    const aside = await screen.findByRole('complementary', { name: 'Ajustes del documento' })
    expect(within(aside).getByText('Secciones de esta cotización')).toBeTruthy()
    const toggle = within(aside).getAllByRole('switch')[0]
    const before = editor.get().past.length
    fireEvent.click(toggle)
    await waitFor(() => expect(editor.get().doc.documentOverrides?.sections).toBeTruthy())
    expect(editor.get().past.length).toBe(before + 1)
  })

  it('muestra completo lo que pidió el cliente y responde por WhatsApp con mensaje listo', async () => {
    const message = `Quisiera cambiar el ancho del living a 2.000.\n\n${'Y otra cosa más larga. '.repeat(20)}Gracias.`
    const patches: unknown[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (init?.method === 'PATCH') {
        patches.push({ url, body: JSON.parse(String(init.body)) })
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      if (/\/activity\?/.test(url)) return new Response(JSON.stringify({ items: patches.length ? [] : [{ id: 'e1', at: '2026-11-05T12:00:00.000Z', kind: 'quote.changes_requested', text: '', actor: 'Carolina Soto', meta: { message } }], total: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({ error: { code: 'not_found', message: 'No' } }), { status: 404, headers: { 'Content-Type': 'application/json' } })
    })
    setup({ quote: { status: 'sent', revision: 1, sentAt: QUOTE.updatedAt } })
    const notice = await screen.findByRole('region', { name: 'Lo que pidió el cliente' })
    expect(notice.textContent).toContain('Carolina Soto pidió cambios')
    expect(notice.textContent).toContain(message)
    const link = within(notice).getByRole('link', { name: 'Responder por WhatsApp' })
    expect(decodeURIComponent(link.getAttribute('href') ?? '')).toContain('te mando la versión nueva')
    fireEvent.click(within(notice).getByRole('button', { name: 'Hecho' }))
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Lo que pidió el cliente' })).toBeNull())
    await waitFor(() => expect(patches).toEqual([{ url: expect.stringContaining('/activity/e1'), body: { pending: false } }]))
    vi.restoreAllMocks()
  })

  it('avisa en línea si tus precios cambiaron desde que la enviaste y ofrece la versión nueva', async () => {
    const sentAt = '2026-10-30T12:00:00.000Z'
    const { editor, ui } = setup({ quote: { status: 'sent', revision: 1, sentAt, updatedAt: sentAt, shareToken: 'tok', totals: { ...ZERO_TOTALS, total: 262_990 } } })
    await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    const live = editor.get().evaluation.totals.total
    const notice = screen.getByText(/Tus precios cambiaron desde que la enviaste/).closest('[role="status"]') as HTMLElement
    expect(notice.textContent).toContain(`el cliente ve ${formatCLP(262_990)}, ahora suma ${formatCLP(live)}`)
    fireEvent.click(within(notice).getByRole('button', { name: /Enviar versión nueva \(B\)/ }))
    expect(ui.getState().sendOpen).toBe(true)
  })
})

const ZERO_TOTALS = { subtotal: 0, discountPct: 0, discount: 0, extras: 0, net: 0, iva: 0, total: 0, area: 0, units: 0, cost: 0, marginPct: 0 }

// ── Enviar, copiar enlace y guardado (dinero) ──────────────────────────────────

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** API falsa: registra cada llamada y responde POST /send si se le pasa la respuesta. */
function mockApi(handlers: { send?: () => unknown } = {}) {
  const calls: { url: string; method: string }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = init?.method ?? 'GET'
    calls.push({ url, method })
    if (method === 'POST' && /\/quotes\/[^/]+\/send$/.test(url) && handlers.send) return json(handlers.send())
    return json({ error: { code: 'not_found', message: 'No encontramos lo que buscas.' } }, 404)
  })
  return { sends: () => calls.filter((c) => c.method === 'POST' && c.url.endsWith('/send')) }
}

function mockClipboard() {
  const writeText = vi.fn(async (_text: string) => undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

const SENT_AT = '2026-10-17T12:00:00.000Z'
/** Aceptada por $262.990 (versión A); después cambiaron tus precios y hoy el motor suma otra cifra. */
const ACCEPTED: Partial<Quote> = {
  status: 'accepted',
  revision: 1,
  sentAt: SENT_AT,
  updatedAt: SENT_AT,
  shareToken: 'tok',
  acceptedAt: SENT_AT,
  acceptedBy: { name: 'Carolina Soto', at: SENT_AT },
  totals: { ...ZERO_TOTALS, total: 262_990 },
}

describe('enviar y copiar sin sorpresas de precio', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('«Copiar enlace» con precios cambiados copia el enlace vigente: no crea la versión B ni quita la aceptación', async () => {
    const api = mockApi()
    const writeText = mockClipboard()
    const { editor, ui } = setup({ quote: ACCEPTED })
    await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    expect(editor.get().evaluation.totals.total).not.toBe(262_990)
    act(() => editor.setView('document'))
    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/c/tok`))
    expect(ui.getState().sendOpen).toBe(false)
    expect(api.sends()).toHaveLength(0)
    expect(editor.get().meta).toMatchObject({ status: 'accepted', revision: 1 })
  })

  it('«Enviar al cliente» en una aceptada pide confirmar la versión B (con la diferencia) y el mensaje no lleva el total', async () => {
    const serverTotal = 777_777
    const api = mockApi({
      send: () => ({
        quote: { ...QUOTE, ...ACCEPTED, status: 'sent', revision: 2, version: 3, acceptedAt: undefined, acceptedBy: undefined, totals: { ...ZERO_TOTALS, total: serverTotal } },
        url: 'https://app.dekopen.cl/c/tok',
        revision: 2,
        revisionLabel: 'B',
      }),
    })
    mockClipboard()
    const { editor, ui } = setup({ quote: ACCEPTED })
    await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    const live = editor.get().evaluation.totals.total
    act(() => ui.getState().set({ sendOpen: true }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText(/Carolina Soto aceptó la versión A/)
    expect(dialog.textContent).toContain(formatCLP(262_990))
    expect(dialog.textContent).toContain(formatCLP(live))
    expect(api.sends()).toHaveLength(0)

    fireEvent.click(within(dialog).getByRole('button', { name: 'Enviar versión B' }))
    await within(dialog).findByRole('button', { name: 'Listo' })
    expect(api.sends()).toHaveLength(1)
    expect(dialog.textContent).not.toContain(formatCLP(serverTotal))
    expect(dialog.textContent).not.toContain(formatCLP(live))
  })

  it('si tus últimos cambios no se pudieron guardar, Enviar no manda la versión vieja y dice qué corregir', async () => {
    const api = mockApi({ send: () => ({ quote: { ...QUOTE, status: 'sent', revision: 1 }, url: 'u', revision: 1, revisionLabel: 'A' }) })
    const { editor, ui } = setup({
      save: async () => {
        throw Object.assign(new Error('Revisa el nombre: es demasiado largo.'), { status: 400 })
      },
    })
    await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    act(() => editor.updateItem('a', { name: 'Ventana grande del living' }))
    act(() => ui.getState().set({ sendOpen: true }))
    const dialog = await screen.findByRole('dialog')
    expect(api.sends()).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Preparar PDF' }))
    const alert = await within(dialog).findByRole('alert')
    expect(alert.textContent).toContain('Revisa el nombre: es demasiado largo.')
    expect(api.sends()).toHaveLength(0)
    expect(editor.get().save).toMatchObject({ status: 'error', dirty: true })
  })

  it('con recargo sobre el costo, el ajuste de la cotización se rotula así y guarda la forma de calcularlo', async () => {
    const { editor } = setup({ settings: { pricing: { ...DEFAULT_PRICING, marginMode: 'markup', marginPct: 30 } } })
    await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    act(() => editor.select(null))
    const field = await screen.findByRole('spinbutton', { name: 'Recargo sobre el costo' })
    expect(screen.queryByRole('spinbutton', { name: 'Margen sobre venta' })).toBeNull()
    expect(screen.getByText('Recargo de esta cotización')).toBeTruthy()
    fireEvent.change(field, { target: { value: '35' } })
    expect(editor.get().doc.pricing).toEqual({ marginPct: 35, marginMode: 'markup' })
  })

  it('sin conexión el indicador no promete «a salvo» si los cambios no quedaron en el equipo', async () => {
    const { editor } = setup({
      save: async () => {
        throw Object.assign(new Error('Sin conexión'), { status: 0 })
      },
    })
    await screen.findByRole('list', { name: 'Ventanas de la cotización' })
    act(() => editor.setTitle('Obra nueva'))
    await act(async () => {
      await editor.flush()
    })
    const header = screen.getByRole('banner', { name: 'Cotización' })
    await waitFor(() => expect(within(header).getByRole('status').textContent).toContain('Sin conexión · no cierres esta pestaña'))
    expect(within(header).getByRole('status').textContent).not.toContain('a salvo')
    editor.dispose()
    expect(editorSaveLabel({ status: 'offline', local: true })).toBe('Sin conexión · guardado en este equipo')
    expect(editorSaveLabel({ status: 'error', retrying: false, message: 'Revisa el nombre.' })).toBe('No pudimos guardar: Revisa el nombre.')
    expect(editorSaveLabel({ status: 'error', retrying: true })).toBeUndefined()
  })
})
