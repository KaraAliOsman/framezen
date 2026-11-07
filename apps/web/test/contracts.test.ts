import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BillingState, OrgSettings, Quote } from '@dekopen/shared'
import { api, ApiRequestError, conflictBody } from '../src/lib/api'
import { mergeSettings } from '../src/lib/hooks'
import { describePlan } from '../src/lib/plan'
import { toggleAssistant, useAssistantStore } from '../src/lib/stores'

function json(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('contrato HTTP del cliente', () => {
  const fetchMock = vi.fn<typeof fetch>()
  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('un 409 al autoguardar conserva { version, quote } para retomar sin otra ida y vuelta', async () => {
    const quote = { id: 'q1', version: 7, title: 'Casa Pérez' } as Quote
    fetchMock.mockResolvedValueOnce(json(409, { error: { code: 'version_conflict', message: 'Esta cotización cambió en otra pestaña.' }, version: 7, quote }))
    const error = await api.quotes.save('q1', { version: 3 } as never).catch((e) => e)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect(error.isConflict).toBe(true)
    expect(conflictBody(error)).toMatchObject({ version: 7, quote: { id: 'q1', title: 'Casa Pérez' } })
    expect(conflictBody(new Error('otro'))).toBeUndefined()
  })

  it('envía con canal enlace por defecto y tipa la respuesta', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { quote: { id: 'q1' }, url: 'http://app.test/c/abc', revision: 2, revisionLabel: 'B' }))
    const sent = await api.quotes.send('q1')
    expect(sent.revisionLabel).toBe('B')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/quotes/q1/send')
    expect(JSON.parse(String(init?.body))).toEqual({ channel: 'link' })
  })

  it('facturación: cancelar, deshacer, vista previa e historial', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { billing: {}, message: 'Listo' }))
      .mockResolvedValueOnce(json(200, { billing: {}, message: 'Listo' }))
      .mockResolvedValueOnce(json(200, { plan: 'pro', period: 'yearly', amount: 1, immediate: true, chargeNow: 1, credit: 0, newBalance: 0, effectiveAt: '' }))
      .mockResolvedValueOnce(json(200, { items: [{ id: 'c1' }], total: 1 }))
    await api.billing.cancel()
    await api.billing.resume()
    await api.billing.preview('pro', 'yearly')
    const history = await api.billing.history()
    expect(history).toEqual([{ id: 'c1' }])
    expect(fetchMock.mock.calls.map(([u, i]) => `${i?.method} ${u}`)).toEqual([
      'POST /api/billing/cancel',
      'POST /api/billing/resume',
      'GET /api/billing/preview?plan=pro&period=yearly',
      'GET /api/billing/history',
    ])
  })

  it('OT: null borra la fecha y las notas; la lista acepta filtros', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { id: 'w1' })).mockResolvedValueOnce(json(200, { items: [], total: 0 }))
    await api.workOrders.update('w1', { dueDate: null, notes: null })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ dueDate: null, notes: null })
    await api.workOrders.list({ status: 'open', limit: 100 })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/work-orders?status=open&limit=100')
  })

  it('importar CSV con vista previa y área mínima de vidrio', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { dryRun: true })).mockResolvedValueOnce(json(200, { minArea: null }))
    await api.catalog.importCsv('a;b', { dryRun: true })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ csv: 'a;b', dryRun: true })
    await api.catalog.patchGlass('dvh 4+12+4', null)
    expect(fetchMock.mock.calls[1][0]).toBe('/api/catalog/glass/dvh%204%2B12%2B4')
  })
})

describe('ajustes optimistas', () => {
  it('mezcla por sección: un parche parcial no borra el resto', () => {
    const previous = { documents: { intro: 'Hola', validityDays: 15 }, nextQuoteNumber: 10 } as unknown as OrgSettings
    const next = mergeSettings(previous, { documents: { intro: 'Buenas' } } as Partial<OrgSettings>)
    expect(next.documents).toEqual({ intro: 'Buenas', validityDays: 15 })
    expect(next.nextQuoteNumber).toBe(10)
  })
})

describe('plan: el servidor manda en el modo lectura', () => {
  const base: BillingState = {
    plan: 'pro',
    status: 'past_due',
    period: 'monthly',
    seats: 3,
    seatsUsed: 1,
    aiCredits: { included: 2000, used: 0, extra: 0 },
    features: [],
    provider: 'dev',
  }
  it('pago muy atrasado: solo lectura con el mensaje del servidor', () => {
    const plan = describePlan({ ...base, readOnly: true, readOnlyReason: 'payment_overdue', readOnlyMessage: 'No pudimos cobrar tu plan.' })
    expect(plan.readOnly).toBe(true)
    expect(plan.readOnlyReason).toBe('payment_overdue')
    expect(plan.readOnlyMessage).toBe('No pudimos cobrar tu plan.')
  })
  it('sin el dato del servidor se deduce por fechas (compatibilidad)', () => {
    expect(describePlan(base).readOnly).toBe(false)
    expect(describePlan({ ...base, status: 'expired' }).readOnly).toBe(true)
  })
})

describe('⌘J desde la paleta', () => {
  afterEach(() => useAssistantStore.setState({ open: false }))

  it('dispara el mismo atajo que atiende el panel de Marco', () => {
    const seen: KeyboardEvent[] = []
    const onKey = (e: KeyboardEvent) => {
      seen.push(e)
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    toggleAssistant()
    window.removeEventListener('keydown', onKey)
    expect(seen).toHaveLength(1)
    expect(seen[0].key).toBe('j')
    expect(seen[0].ctrlKey || seen[0].metaKey).toBe(true)
    expect(useAssistantStore.getState().open).toBe(false) // lo resolvió el panel
  })

  it('si el panel no está montado, abre y cierra el puente', () => {
    toggleAssistant()
    expect(useAssistantStore.getState().open).toBe(true)
    toggleAssistant()
    expect(useAssistantStore.getState().open).toBe(false)
  })
})
