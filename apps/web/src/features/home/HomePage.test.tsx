import '../../../test/setup'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { DEFAULT_CUT, DEFAULT_PRICING } from '@dekopen/engine'
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '@dekopen/catalog'
import type { Me, QuoteFollowUp, QuoteStatus } from '@dekopen/shared'
import { RequireAuth } from '../../lib/auth'
import { createQueryClient } from '../../lib/queryClient'
import { Toaster } from '../../ui'
import { TooltipProvider } from '../../ui/Tooltip'
import HomePage from './HomePage'
import type { QuoteStats } from './homeModel'

const ME: Me = {
  user: { id: 'u1', name: 'Pedro Araya', email: 'pedro@sur.cl', createdAt: '2026-10-01T00:00:00Z' },
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
    features: ['assistant', 'client3d', 'purchasing', 'cnc'],
    provider: 'dev',
  },
  solo: true,
  onboarded: false,
}

function stats(byStatus: Partial<Record<QuoteStatus, { count: number; total: number }>>, extra: Partial<QuoteStats> = {}): QuoteStats {
  const base = { draft: 0, sent: 0, accepted: 0, rejected: 0, workshop: 0, installed: 0, closed: 0 }
  return {
    byStatus: Object.fromEntries(Object.keys(base).map((k) => [k, byStatus[k as QuoteStatus] ?? { count: 0, total: 0 }])) as QuoteStats['byStatus'],
    soldThisMonth: { count: 0, total: 0, inProduction: 0 },
    soldLastMonth: { count: 0, total: 0 },
    followUps: [],
    ...extra,
  }
}

const sentAt = new Date(Date.now() - 6 * 86_400_000 - 3_600_000).toISOString()

function followUp(id: string, extra: Partial<QuoteFollowUp> = {}): QuoteFollowUp {
  return { id, number: 412, title: 'Casa Soto', status: 'sent', revision: 1, createdAt: sentAt, updatedAt: sentAt, sentAt, clientName: 'Pedro Soto', clientPhone: '9 8765 4321', shareToken: 'tok123', total: 2_674_538, units: 3, ...extra }
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function stubApi(routes: Record<string, unknown> = {}) {
  const calls: { path: string; method: string; body?: unknown }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = String(input).split('?')[0]
      calls.push({ path, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (path in routes) return json(routes[path])
      if (path === '/api/catalog') return json({ ...SAMPLE_CATALOG, updatedAt: '' })
      if (path === '/api/settings')
        return json({ pricing: DEFAULT_PRICING, cut: DEFAULT_CUT, documents: {}, defaults: SAMPLE_DEFAULTS, nextQuoteNumber: 1, nextWorkOrderNumber: 1 })
      if (path === '/api/catalog/brands') return json({ items: [], total: 0 })
      if (path === '/api/quotes' || path === '/api/activity') return json({ items: [], total: 0 })
      if (path.endsWith('/follow-up')) return json({ followUpAt: null, previous: '2026-11-01T12:00:00.000Z' })
      if (path.endsWith('/status')) return json({ id: 'q9' })
      return new Response(JSON.stringify({ error: { code: 'not_found', message: 'No' } }), { status: 404 })
    }),
  )
  return calls
}

function renderHome(s: QuoteStats) {
  const client = createQueryClient()
  client.setQueryData(['me'], ME)
  client.setQueryData(['quotes', 'stats'], s)
  return render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={['/inicio']}>
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        </MemoryRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('Inicio sin la API', () => {
  it('no muestra ceros ni «Todo al día»: dice que no pudo cargar y ofrece reintentar', async () => {
    let down = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const path = String(input).split('?')[0]
        if (down) return new Response(JSON.stringify({ error: { code: 'internal', message: 'Boom' } }), { status: 500 })
        if (path === '/api/quotes/stats') return json(stats({ sent: { count: 2, total: 2_674_538 } }))
        if (path === '/api/quotes' || path === '/api/activity') return json({ items: [], total: 0 })
        if (path === '/api/catalog') return json({ ...SAMPLE_CATALOG, updatedAt: '' })
        return json({})
      }),
    )
    const client = createQueryClient()
    client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } })
    client.setQueryData(['me'], ME)
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <MemoryRouter initialEntries={['/inicio']}>
            <RequireAuth>
              <HomePage />
            </RequireAuth>
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('No pudimos cargar tu resumen')).toBeTruthy()
    expect(screen.queryByText('Todo al día')).toBeNull()
    expect(screen.queryByText('Haz tu primera cotización')).toBeNull()
    down = false
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Todo al día')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Enviadas/ }).textContent).toContain('$2.674.538')
    expect(screen.queryByText('No pudimos cargar tu resumen')).toBeNull()
  })
})

describe('Inicio', () => {
  it('cuenta nueva: la primera cotización a un clic, sin cifras en cero', () => {
    stubApi()
    renderHome(stats({}))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Haz tu primera cotización')
    // Una sola primaria: en una cuenta nueva es «Crear mi primera cotización», no la del encabezado.
    expect(screen.queryByRole('button', { name: /^Nueva cotización/ })).toBeNull()
    expect(screen.getByRole('link', { name: /Nuevo cliente/ }).getAttribute('href')).toBe('/clientes?nuevo=1')
    expect(screen.getByRole('link', { name: /Agregar un cliente/ }).getAttribute('href')).toBe('/clientes?nuevo=1')
    expect(screen.getByRole('button', { name: /Crear mi primera cotización/ })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Hacerlo en 3 pasos guiados/ }).getAttribute('href')).toBe('/bienvenida')
    expect(screen.queryByText('Por seguir')).toBeNull()
  })

  it('sin tareas lo dice, y «Nueva cotización» vuelve a ser la primaria', () => {
    stubApi()
    renderHome(stats({ draft: { count: 1, total: 100 } }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Todo al día')
    expect(screen.getByRole('button', { name: /^Nueva cotización/ }).className).toContain('bg-signal')
  })

  it('contesta qué hacer: la primera tarea trae el mensaje completo y es la única primaria', () => {
    stubApi()
    const message = `Necesito la ventana del living más ancha.\n${'Y el baño con vidrio opaco, por favor. '.repeat(12)}`
    expect(message.length).toBeGreaterThan(160)
    renderHome(
      stats(
        { sent: { count: 2, total: 2_674_538 } },
        {
          followUps: [
            followUp('q1', { title: 'Sin abrir' }),
            followUp('q9', { notices: [{ id: 'a1', kind: 'changes', at: sentAt, who: 'Marcela Fuentes', message }] }),
          ],
        },
      ),
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Marcela pidió cambios')
    const quote = screen.getByText((_, el) => el?.tagName === 'BLOCKQUOTE')
    expect(quote.textContent).toBe(message)
    const adjust = screen.getByRole('link', { name: 'Ajustar cotización' })
    expect(adjust.getAttribute('href')).toBe('/cotizaciones/q9')
    expect(adjust.className).toContain('bg-signal')
    expect(screen.getByRole('button', { name: /^Nueva cotización/ }).className).not.toContain('bg-signal')
    expect(screen.getByText('Al reenviar la cotización, esta tarea se marca sola.')).toBeTruthy()
    const reply = screen.getByRole('link', { name: 'Responder por WhatsApp' })
    expect(decodeURIComponent(reply.getAttribute('href') ?? '')).toContain('recibí los cambios que pediste')
    // El resto de la cola sigue debajo, con su motivo.
    expect(screen.getByText('Sin abrir', { selector: 'h3' })).toBeTruthy()
  })

  it('escribirle a quien abrió: WhatsApp con enlace, Posponer y Perdida con motivo y deshacer', async () => {
    const calls = stubApi()
    renderHome(stats({ sent: { count: 1, total: 2_674_538 } }, { followUps: [followUp('q9', { viewedAt: sentAt })] }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Escríbele a Pedro')
    await waitFor(() => {
      const wa = screen.getByRole('link', { name: 'WhatsApp' })
      expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/56987654321\?text=/)
      expect(decodeURIComponent(wa.getAttribute('href') ?? '')).toContain('/c/tok123')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Perdida' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Precio' }))
    await waitFor(() => expect(calls).toContainEqual({ path: '/api/quotes/q9/status', method: 'POST', body: { status: 'rejected', lostReason: 'Precio' } }))
    // Sale de la cola al instante, y el deshacer aparece aunque la fila ya no exista.
    expect(await screen.findByText('Todo al día')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer' }))
    await waitFor(() => expect(calls).toContainEqual({ path: '/api/quotes/q9/status', method: 'POST', body: { status: 'sent' } }))
  })

  it('posponer ofrece deshacer con la fecha anterior, aunque la fila ya no exista', async () => {
    const calls = stubApi()
    renderHome(stats({ sent: { count: 1, total: 1 } }, { followUps: [followUp('q9'), followUp('q8', { title: 'Otra' })] }))
    fireEvent.pointerDown(screen.getAllByRole('button', { name: 'Posponer' })[0]!, { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitem', { name: '3 días' }))
    await waitFor(() => expect(calls).toContainEqual({ path: '/api/quotes/q9/follow-up', method: 'POST', body: { days: 3 } }))
    // El aviso nuevo va primero (los toasts de otras pruebas pueden seguir visibles).
    fireEvent.click((await screen.findAllByRole('button', { name: 'Deshacer' }))[0]!)
    await waitFor(() => expect(calls).toContainEqual({ path: '/api/quotes/q9/follow-up', method: 'POST', body: { at: '2026-11-01T12:00:00.000Z' } }))
  })

  it('«1 aceptada» ya no contradice a «Aceptadas»: la venta dice que está en taller y lleva a Taller', () => {
    stubApi()
    renderHome(stats({ workshop: { count: 1, total: 900_000 } }, { soldThisMonth: { count: 1, total: 900_000, inProduction: 1 } }))
    const kpi = screen.getByRole('link', { name: /Aceptado en/ })
    expect(kpi.textContent).toContain('1 venta, ya en taller')
    expect(kpi.getAttribute('href')).toBe('/taller')
    expect(within(kpi).queryByText(/cotización aceptada/)).toBeNull()
  })

  it('una cuenta casi nueva no recibe avisos de líneas que no usa', async () => {
    stubApi({ '/api/catalog': { ...SAMPLE_CATALOG, profiles: [], items: [], updatedAt: '' } })
    renderHome(stats({ draft: { count: 1, total: 100 } }))
    await screen.findByText('Recientes')
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})
