import '../../../../test/setup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { getDocPreset, type DocTemplate, type DocTemplateListResponse, type DocTemplateRecord, type Me } from '@dekopen/shared'
import { qk } from '../../../lib/queryClient'
import { TooltipProvider } from '../../../ui'
import { TemplateEditor } from './TemplateEditor'

// La vista previa real (renderizador de documentos + medición en el DOM) no se ejerce aquí:
// estas pruebas miden el editor (secciones, historial, guardado automático y conflictos).
vi.mock('../preview/TemplatePreview', () => ({ TemplatePreview: () => <div data-testid="preview" /> }))
vi.mock('../preview/usePreviewData', () => ({
  usePreviewData: () => ({
    ready: true,
    quote: null,
    quoteThumb: null,
    catalog: null,
    catalogThumb: null,
    source: { kind: 'sample' },
    currency: 'CLP',
    taxLabel: 'IVA',
    orgLocale: 'es',
  }),
}))

const ME: Me = {
  user: { id: 'u1', name: 'Rosa Martínez', email: 'rosa@martinez.cl', createdAt: '2026-10-01T00:00:00Z' },
  org: { id: 'o1', name: 'Ventanas Martínez', createdAt: '2026-10-01T00:00:00Z' },
  role: 'owner',
  billing: {
    plan: 'pro',
    status: 'active',
    period: 'monthly',
    seats: 3,
    seatsUsed: 1,
    aiCredits: { included: 500, used: 0, extra: 0 },
    features: ['assistant', 'custom_templates', 'roles'],
    provider: 'dev',
  },
  solo: true,
  onboarded: true,
} as unknown as Me

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

interface Backend {
  record: DocTemplateRecord
  puts: { version: number; template: DocTemplate }[]
}

function startBackend(initial: DocTemplate = getDocPreset('hogar')): Backend {
  const backend: Backend = {
    record: {
      id: 'tpl-propia-1',
      kind: 'quote',
      name: 'Mi propuesta',
      presetId: 'hogar',
      builtin: false,
      version: 3,
      template: { ...initial, id: 'tpl-propia-1', name: 'Mi propuesta' },
      isDefault: false,
      createdAt: '2026-10-30T10:00:00Z',
      updatedAt: '2026-10-30T10:00:00Z',
    },
    puts: [],
  }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? 'GET').toUpperCase()
    const path = new URL(url, 'http://localhost').pathname
    if (path === '/api/templates' && method === 'GET') {
      const list: DocTemplateListResponse = { templates: [backend.record], defaults: { quote: 'hogar', catalog: 'coleccion-modular' }, canEdit: true, canGenerate: false, maxPerKind: 60 }
      return json(list)
    }
    if (path === `/api/templates/${backend.record.id}` && method === 'GET') return json(backend.record)
    if (path === `/api/templates/${backend.record.id}` && method === 'PUT') {
      const body = JSON.parse(String(init?.body)) as { template: DocTemplate; version: number }
      backend.puts.push(body)
      if (body.version !== backend.record.version) {
        return json({ error: { code: 'version_conflict', message: 'Otra persona cambió esta plantilla.' }, version: backend.record.version, template: backend.record }, 409)
      }
      backend.record = { ...backend.record, version: backend.record.version + 1, template: body.template, name: body.template.name }
      return json(backend.record)
    }
    return json({ error: { code: 'not_found', message: 'No encontrado' } }, 404)
  })
  return backend
}

function renderEditor() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(qk.me, ME)
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter>
          <TemplateEditor id="tpl-propia-1" />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

// En jsdom no corre el CSS: la lista de secciones aparece en la columna y en el panel del inspector.
const warrantyOf = (template: DocTemplate) => template.sections.find((s) => s.type === 'warranty')!

describe('editor de plantillas', () => {
  it('muestra la plantilla y sus secciones; las obligatorias no se pueden ocultar', async () => {
    startBackend()
    renderEditor()
    expect(await screen.findByDisplayValue('Mi propuesta')).toBeTruthy()
    expect(screen.getAllByText('Garantía').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Ocultar «Ítems»' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Ocultar «Garantía»' }).length).toBeGreaterThan(0)
    expect(screen.getByTestId('preview')).toBeTruthy()
  })

  it('cada cambio es un paso de historial y se guarda solo con la versión leída', async () => {
    const backend = startBackend()
    renderEditor()
    const hide = (await screen.findAllByRole('button', { name: 'Ocultar «Garantía»' }))[0]
    const undo = screen.getByRole('button', { name: 'Deshacer' }) as HTMLButtonElement
    expect(undo.disabled).toBe(true)

    fireEvent.click(hide)
    await waitFor(() => expect(backend.puts).toHaveLength(1), { timeout: 4000 })
    expect(backend.puts[0].version).toBe(3)
    expect(warrantyOf(backend.puts[0].template).enabled).toBe(false)
    expect(warrantyOf(backend.record.template).enabled).toBe(false)
    expect(backend.record.version).toBe(4)

    // Deshacer vuelve a guardar la versión anterior con la versión nueva.
    const undoNow = await screen.findByRole('button', { name: /^Deshacer: / })
    expect((undoNow as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(undoNow)
    await waitFor(() => expect(backend.puts).toHaveLength(2), { timeout: 4000 })
    expect(backend.puts[1].version).toBe(4)
    expect(warrantyOf(backend.puts[1].template).enabled).toBe(true)
  })

  it('si otra persona guardó antes (409), junta sus cambios con los tuyos y vuelve a guardar sin perder nada', async () => {
    const backend = startBackend()
    renderEditor()
    const hide = (await screen.findAllByRole('button', { name: 'Ocultar «Garantía»' }))[0]
    // Otra persona renombra la plantilla en el servidor mientras tú editas.
    backend.record = { ...backend.record, version: 4, name: 'Nombre de otra persona', template: { ...backend.record.template, name: 'Nombre de otra persona' } }

    fireEvent.click(hide)
    await waitFor(() => expect(backend.puts.length).toBeGreaterThanOrEqual(2), { timeout: 6000 })
    expect(backend.puts[0].version).toBe(3)
    const last = backend.puts[backend.puts.length - 1]
    expect(last.version).toBe(4)
    expect(last.template.name).toBe('Nombre de otra persona')
    expect(warrantyOf(last.template).enabled).toBe(false)
    expect(backend.record.version).toBe(5)
    expect(await screen.findByText(/juntamos sus cambios con los tuyos/i)).toBeTruthy()
  })

  it('un estilo DEKOPEN avisa que el primer cambio crea una copia', async () => {
    startBackend()
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(qk.me, ME)
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <MemoryRouter>
            <TemplateEditor id="memoria" />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Estás viendo un estilo DEKOPEN')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Duplicar y editar' }).length).toBeGreaterThan(0)
  })
})
