import '../../../../test/setup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { CATALOG_PRESET_IDS, DOC_PRESET_TRAITS, QUOTE_PRESET_IDS, getDocPreset, presetName, type DocTemplateListResponse, type DocTemplateRecord, type Me } from '@dekopen/shared'
import { I18nProvider, resetI18nForTests, setLocale } from '../../../lib/i18n'
import { qk } from '../../../lib/queryClient'
import { TooltipProvider } from '../../../ui'
import { TemplateGallery } from './TemplateGallery'

vi.mock('../preview/TemplatePreview', () => ({ TemplatePreview: () => <div data-testid="thumb" /> }))
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

const ME = {
  user: { id: 'u1', name: 'Rosa Martínez', email: 'rosa@martinez.cl', createdAt: '2026-10-01T00:00:00Z' },
  org: { id: 'o1', name: 'Ventanas Martínez', createdAt: '2026-10-01T00:00:00Z' },
  role: 'owner',
  billing: { plan: 'pro', status: 'active', period: 'monthly', seats: 3, seatsUsed: 1, aiCredits: { included: 500, used: 0, extra: 0 }, features: ['assistant', 'custom_templates', 'roles'], provider: 'dev' },
  solo: true,
  onboarded: true,
} as unknown as Me

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const own: DocTemplateRecord = {
  id: 'tpl-propia-1',
  kind: 'quote',
  name: 'Propuesta de la casa',
  presetId: 'memoria',
  builtin: false,
  version: 2,
  template: { ...getDocPreset('memoria'), id: 'tpl-propia-1', name: 'Propuesta de la casa' },
  isDefault: true,
  createdAt: '2026-10-30T10:00:00Z',
  updatedAt: '2026-10-30T10:00:00Z',
}

function setup(list: Partial<DocTemplateListResponse> = {}, path = '/documentos') {
  const calls: { method: string; path: string }[] = []
  const body: DocTemplateListResponse = { templates: [], defaults: { quote: 'hogar', catalog: 'coleccion-modular' }, canEdit: true, canGenerate: false, maxPerKind: 60, ...list }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? 'GET').toUpperCase()
    const pathname = new URL(url, 'http://localhost').pathname
    calls.push({ method, path: pathname })
    if (pathname === '/api/templates' && method === 'GET') return json(body)
    if (pathname === '/api/templates/default' && method === 'PUT') {
      const sent = JSON.parse(String(init?.body)) as { kind: 'quote' | 'catalog'; templateId: string }
      return json({ defaults: { ...body.defaults, [sent.kind]: sent.templateId } })
    }
    return json({ error: { code: 'not_found', message: 'No encontrado' } }, 404)
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(qk.me, ME)
  render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={[path]}>
            <TemplateGallery />
          </MemoryRouter>
        </TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>,
  )
  return { calls }
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  resetI18nForTests()
})

const cards = () => document.querySelectorAll('article[data-template-id]')

describe('galería de plantillas', () => {
  it('muestra los 10 estilos de cotización con su nombre, y el estado vacío de las propias', async () => {
    setup()
    expect(await screen.findByText('Todavía no tienes plantillas propias')).toBeTruthy()
    expect(cards()).toHaveLength(QUOTE_PRESET_IDS.length)
    for (const id of QUOTE_PRESET_IDS) expect(screen.getByRole('button', { name: presetName(id, 'es') })).toBeTruthy()
    // Una sola es la predeterminada.
    expect(screen.getAllByText('Predeterminada')).toHaveLength(1)
  })

  it('los filtros por estilo dejan sólo los que corresponden', async () => {
    setup()
    await screen.findByText('Todavía no tienes plantillas propias')
    fireEvent.click(screen.getByRole('radio', { name: 'Técnicos' }))
    const technical = QUOTE_PRESET_IDS.filter((id) => DOC_PRESET_TRAITS[id].style === 'technical')
    expect(technical.length).toBeGreaterThan(0)
    expect(cards()).toHaveLength(technical.length)
    fireEvent.click(screen.getByRole('radio', { name: 'Todos' }))
    expect(cards()).toHaveLength(QUOTE_PRESET_IDS.length)
  })

  it('tus plantillas aparecen primero, con su estilo de origen y la marca de predeterminada', async () => {
    setup({ templates: [own], defaults: { quote: own.id, catalog: 'coleccion-modular' } })
    const card = await waitFor(() => {
      const el = document.querySelector(`article[data-template-id="${own.id}"]`)
      expect(el).toBeTruthy()
      return el as HTMLElement
    })
    expect(within(card).getByText('Propuesta de la casa')).toBeTruthy()
    expect(within(card).getByText(/Basada en Memoria/)).toBeTruthy()
    expect(within(card).getByText('Predeterminada')).toBeTruthy()
    // La de la casa es la predeterminada: ningún estilo DEKOPEN lo es.
    expect(screen.getAllByText('Predeterminada')).toHaveLength(1)
    expect(screen.queryByText('Todavía no tienes plantillas propias')).toBeNull()
  })

  it('«Usar» un estilo lo deja como predeterminado en el servidor', async () => {
    const { calls } = setup()
    await screen.findByText('Todavía no tienes plantillas propias')
    const plano = document.querySelector('article[data-template-id="memoria"]') as HTMLElement
    fireEvent.click(within(plano).getByRole('button', { name: 'Usar' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'PUT' && c.path === '/api/templates/default')).toBe(true))
  })

  it('el catálogo tiene sus 4 estilos y su propia pestaña', async () => {
    setup({}, '/documentos?tipo=catalogo')
    await screen.findByText('Todavía no tienes plantillas propias')
    expect(cards()).toHaveLength(CATALOG_PRESET_IDS.length)
    expect(screen.getByRole('button', { name: 'Generar catálogo' })).toBeTruthy()
    expect(screen.getByText(/Vista previa con tus líneas activas/)).toBeTruthy()
  })

  it('se ve en alemán y los nombres de los estilos siguen el idioma', async () => {
    setup()
    await screen.findByText('Todavía no tienes plantillas propias')
    await act(() => setLocale('de'))
    expect(await screen.findByText('Sie haben noch keine eigenen Vorlagen')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'DEKOPEN-Stile' })).toBeTruthy()
    expect(screen.getByRole('button', { name: presetName('hogar', 'de') })).toBeTruthy()
  })

  it('si la lista no carga lo dice y deja reintentar, sin esconder los estilos', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({ error: { code: 'server', message: 'x' } }, 500))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(qk.me, ME)
    render(
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <MemoryRouter>
            <TemplateGallery />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('No pudimos cargar tus plantillas.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy()
    expect(cards().length).toBe(QUOTE_PRESET_IDS.length)
  })
})
