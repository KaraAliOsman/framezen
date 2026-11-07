import '../../../../test/setup'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createDesign, DEFAULT_CUT, DEFAULT_PRICING } from '@dekopen/engine'
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '@dekopen/catalog'
import type { Me, Quote } from '@dekopen/shared'
import { RequireAuth } from '../../../lib/auth'
import { TooltipProvider } from '../../../ui'
import { createQueryClient } from '../../../lib/queryClient'
import { createQuoteEditor, type QuoteTransport } from '../model/store'
import { createEditorUi, EditorProvider } from './context'
import { Editor } from './Editor'

/**
 * Límites locales del editor: si el lienzo de una ventana falla, se pierde solo el lienzo. La lista
 * de ventanas, los totales y el inspector siguen, y se puede eliminar la ventana que no se dibuja.
 */

// Diseños que el lienzo «no puede dibujar» (por referencia: cada ventana tiene el suyo).
const broken = vi.hoisted(() => ({ designs: new Set<object>() }))

vi.mock('../../designer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../designer')>()
  const Real = actual.DesignCanvas
  return {
    ...actual,
    DesignCanvas: (props: Parameters<typeof Real>[0]) => {
      if (broken.designs.has(props.design)) throw new TypeError("Cannot read properties of undefined (reading 'map')")
      return <Real {...props} />
    },
  }
})

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

function setup(options: { brokenItem?: string } = {}) {
  const quote: Quote = {
    id: 'q1',
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
  const target = quote.items.find((i) => i.id === options.brokenItem)
  if (target) broken.designs.add(target.design)
  const transport: QuoteTransport = { save: async () => quote, get: async () => quote }
  const editor = createQuoteEditor(
    { quote, catalog: SAMPLE_CATALOG, settings: { pricing: DEFAULT_PRICING, cut: DEFAULT_CUT, documents: undefined as never, defaults: {} } },
    { transport, debounceMs: 10_000 },
  )
  const ui = createEditorUi()
  const client = createQueryClient()
  client.setQueryData(['me'], ME)
  client.setQueryData(['clients', ''], [])
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
  return { editor, quote }
}

describe('límites locales del editor', () => {
  beforeEach(() => {
    broken.designs.clear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('si el lienzo de una ventana falla, el resto del editor sigue y se puede eliminar esa ventana', async () => {
    const { editor } = setup({ brokenItem: 'a' })
    const list = await screen.findByRole('list', { name: 'Ventanas de la cotización' })

    act(() => editor.select('a'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('No pudimos dibujar esta ventana')
    // La lista, los totales y el inspector siguen en pie.
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('contentinfo', { name: 'Totales' })).toBeTruthy()
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeTruthy()

    // Otra ventana se dibuja (el límite se reinicia al cambiar de ítem).
    act(() => editor.select('b'))
    expect(screen.queryByText('No pudimos dibujar esta ventana')).toBeNull()

    // Volver a la que falla y eliminarla desde el aviso.
    act(() => editor.select('a'))
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar esta ventana' }))
    // Queda solo la otra ventana (las referencias se renumeran: ahora es la V1).
    expect(editor.get().doc.items.map((i) => i.id)).toEqual(['b'])
    expect(screen.queryByText('No pudimos dibujar esta ventana')).toBeNull()
  })
})
