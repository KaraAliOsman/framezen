import '../../../../test/setup'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import type { BillingStateDetail, Me } from '@framezen/shared'
import { RequireAuth } from '../../../lib/auth'
import { createQueryClient } from '../../../lib/queryClient'
import { Toaster } from '../../../ui/Toaster'
import { TooltipProvider } from '../../../ui/Tooltip'
import { PlanSection } from './PlanSection'

const BILLING: BillingStateDetail = {
  plan: 'empresa',
  status: 'active',
  period: 'monthly',
  currentPeriodEnd: '2026-11-30T15:00:00.000Z',
  seats: null,
  seatsUsed: 1,
  aiCredits: { included: 3000, used: 12, extra: 0 },
  features: ['assistant', 'client3d', 'roles'],
  provider: 'dev',
  readOnly: false,
  cancelAtPeriodEnd: false,
  pendingChange: { plan: 'taller', period: 'monthly', at: '2026-11-30T15:00:00.000Z' },
  creditBalance: 12_345,
  card: { brand: 'Visa', last4: '4242' },
}

const ME: Me = {
  user: { id: 'u1', name: 'Rosa Martínez', email: 'rosa@sur.cl', createdAt: '2026-10-01T00:00:00Z' },
  org: { id: 'o1', name: 'Ventanas Martínez', createdAt: '2026-10-01T00:00:00Z' },
  role: 'owner',
  billing: BILLING,
  solo: true,
  onboarded: true,
}

const HISTORY = {
  items: [
    { id: 'h3', kind: 'change', plan: 'taller', period: 'monthly', amount: 0, credit: 0, status: 'applied', provider: 'dev', createdAt: '2026-10-31T12:02:00Z', appliedAt: '2026-10-31T12:02:00Z' },
    { id: 'h2', kind: 'change', plan: 'empresa', period: 'monthly', amount: 60_000, credit: 40_000, status: 'applied', provider: 'dev', createdAt: '2026-10-31T12:01:00Z', appliedAt: '2026-10-31T12:01:00Z' },
    { id: 'h1', kind: 'subscribe', plan: 'pro', period: 'monthly', amount: 83_288, credit: 0, status: 'applied', provider: 'dev', createdAt: '2026-10-31T12:00:00Z', appliedAt: '2026-10-31T12:00:00Z' },
  ],
  total: 3,
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

function renderPlan(billing: BillingStateDetail, onPost: (path: string) => unknown = () => ({})) {
  const calls: string[] = []
  // El servidor responde con el estado vigente tras cada acción.
  let current = billing
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const path = String(input).split('?')[0]!
      if (init?.method === 'POST') {
        calls.push(path)
        const body = onPost(path) as { billing?: BillingStateDetail }
        if (body?.billing) current = body.billing
        return json(body)
      }
      if (path === '/api/me') return json({ ...ME, billing: current })
      if (path === '/api/billing') return json(current)
      if (path === '/api/billing/history') return json(HISTORY)
      return json({ items: [], total: 0 })
    }),
  )
  const client = createQueryClient()
  client.setQueryData(['me'], { ...ME, billing })
  client.setQueryData(['billing'], billing)
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={['/ajustes/plan']}>
          <RequireAuth>
            <PlanSection />
          </RequireAuth>
        </MemoryRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>,
  )
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe('Plan y facturación', () => {
  it('la baja programada se ve siempre: banda con «Mantener», tarjeta marcada e historial con la fecha', async () => {
    const calls = renderPlan(BILLING, () => ({ url: null, billing: { ...BILLING, pendingChange: undefined }, message: 'Listo: te quedas con Empresa mensual. No cambia nada.' }))
    expect(screen.getByText(/^Desde el 30 de noviembre( de 2026)? pasas a Taller mensual\./)).toBeTruthy()
    expect(screen.getByText('Cambio programado')).toBeTruthy()

    const taller = screen.getByRole('heading', { level: 4, name: 'Taller' }).closest('article')!
    expect(within(taller).getByText('Programado')).toBeTruthy()
    expect(within(taller).getByText(/^Desde el 30 de noviembre/)).toBeTruthy()
    expect(within(taller).queryByRole('button', { name: 'Cambiar a Taller' })).toBeNull()

    // Medio de pago y saldo a favor a la vista.
    expect(screen.getByText('Visa terminada en 4242')).toBeTruthy()
    expect(screen.getByText('$12.345')).toBeTruthy()

    // Historial: la baja dice para cuándo está programada y no muestra $0.
    expect(await screen.findByText('Cambio al plan Taller mensual · programado para el 30-11-2026')).toBeTruthy()
    expect(screen.queryByText('$0')).toBeNull()

    // El texto ya no promete que todo se ajusta «desde hoy».
    expect(screen.queryByText(/se ajusta el cobro desde hoy/)).toBeNull()
    expect(screen.getByText(/Si bajas, rige desde tu próxima renovación/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Mantener Empresa' }))
    await waitFor(() => expect(calls).toEqual(['/api/billing/checkout']))
  })

  it('cancelar la suscripción no pide confirmación: avisa con «Deshacer», que reactiva y deja la baja como estaba', async () => {
    const canceled = { ...BILLING, status: 'canceled' as const, cancelAtPeriodEnd: true, pendingChange: undefined }
    const calls = renderPlan(BILLING, (path) =>
      path === '/api/billing/cancel'
        ? { billing: canceled, message: 'Listo: no habrá más cobros. Tu plan sigue activo hasta el 30 de noviembre de 2026.' }
        : path === '/api/billing/resume'
          ? { billing: { ...BILLING, pendingChange: undefined }, message: 'Listo: tu plan sigue activo y se renueva el 30 de noviembre de 2026.' }
          : { url: null, billing: BILLING, message: 'Listo: desde el 30 de noviembre pasas a Taller mensual.' },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar suscripción' }))
    await waitFor(() => expect(calls).toEqual(['/api/billing/cancel']))
    expect(await screen.findByText(/no habrá más cobros/)).toBeTruthy()
    await waitFor(() => expect(screen.getByText('No se renueva')).toBeTruthy())
    expect(screen.getByText('Cancelaste la renovación.')).toBeTruthy()

    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer' }))
    await waitFor(() => expect(calls).toEqual(['/api/billing/cancel', '/api/billing/resume', '/api/billing/checkout']))
  })

  it('cancelada: la banda ofrece reactivar y no hay botón de cancelar', () => {
    renderPlan({ ...BILLING, status: 'canceled', cancelAtPeriodEnd: true, pendingChange: undefined })
    expect(screen.getByText('Cancelaste la renovación.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reactivar plan' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Cancelar suscripción' })).toBeNull()
  })

  it('en la prueba no hay nada que cancelar ni medio de pago que mostrar', () => {
    renderPlan({
      ...BILLING,
      plan: 'trial',
      status: 'trialing',
      period: null,
      trialEndsAt: '2026-11-14T00:00:00Z',
      currentPeriodEnd: undefined,
      pendingChange: undefined,
      creditBalance: 0,
      card: undefined,
    })
    expect(screen.queryByRole('button', { name: 'Cancelar suscripción' })).toBeNull()
    expect(screen.queryByText('Medio de pago')).toBeNull()
    expect(screen.getByRole('button', { name: 'Elegir Pro' })).toBeTruthy()
  })
})
