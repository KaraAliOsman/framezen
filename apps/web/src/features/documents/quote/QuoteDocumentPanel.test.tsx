import '../../../../test/setup'
import { useState } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import type { DocTemplateListResponse, QuoteDocOverridesV2 } from '@dekopen/shared'
import { TooltipProvider } from '../../../ui'
import { QuoteDocumentPanel, type QuoteDocumentChange } from './QuoteDocumentPanel'

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }) as MediaQueryList
})

afterEach(() => vi.restoreAllMocks())

const listBody: DocTemplateListResponse = { templates: [], defaults: { quote: 'hogar', catalog: 'coleccion-modular' }, canEdit: true, canGenerate: false, maxPerKind: 60 }

function setup(options: { overrides?: unknown; readOnly?: boolean } = {}) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(listBody), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  const changes: { next: QuoteDocOverridesV2 | null; change: QuoteDocumentChange }[] = []
  function Host() {
    const [overrides, setOverrides] = useState<unknown>(options.overrides)
    return (
      <QuoteDocumentPanel
        overrides={overrides}
        readOnly={options.readOnly}
        orgPrefs={{ quoteTemplate: 'hogar', intro: 'Gracias por confiar en nosotros.' }}
        orgLocale="es"
        items={[{ id: 'i1', ref: 'V1', name: 'Ventanal del living' }]}
        onChange={(next, change) => {
          changes.push({ next, change })
          setOverrides(next)
        }}
      />
    )
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter>
          <Host />
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  )
  return { changes }
}

describe('QuoteDocumentPanel', () => {
  it('lista las secciones de la plantilla; las obligatorias no se pueden ocultar', () => {
    setup()
    expect(screen.getByText('Secciones de esta cotización')).toBeTruthy()
    // Ítems y Totales llevan candado (sin interruptor).
    expect(screen.queryByRole('switch', { name: /Ocultar «Ítems»/ })).toBeNull()
    expect(screen.getByRole('switch', { name: /«Garantía»/ })).toBeTruthy()
  })

  it('ocultar una sección entrega el v2 compacto con una etiqueta, y se puede volver a mostrar', async () => {
    const { changes } = setup()
    fireEvent.click(screen.getByRole('switch', { name: 'Ocultar «Garantía»' }))
    await waitFor(() => expect(changes).toHaveLength(1))
    expect(changes[0].next?.sections).toBeTruthy()
    expect(Object.values(changes[0].next!.sections!)[0]).toMatchObject({ type: 'warranty', enabled: false })
    expect(changes[0].change.ops[0]).toMatchObject({ op: 'toggleSection', enabled: false })
    expect(changes[0].change.label.length).toBeGreaterThan(3)
    fireEvent.click(await screen.findByRole('switch', { name: 'Mostrar «Garantía»' }))
    await waitFor(() => expect(changes).toHaveLength(2))
    expect(changes[1].next).toBeNull()
  })

  it('un texto parte vacío (se ve el de la empresa de guía); al escribir se vuelve propio y se puede revertir', async () => {
    const { changes } = setup()
    const intro = document.querySelector('textarea[data-field="intro"]') as HTMLTextAreaElement
    expect(intro.value).toBe('')
    expect(intro.placeholder).toContain('Gracias por confiar en nosotros.')
    fireEvent.change(intro, { target: { value: 'Estimada Carolina' } })
    await waitFor(() => expect(changes).toHaveLength(1))
    expect(changes[0].next?.texts?.intro).toBe('Estimada Carolina')
    const revert = await screen.findByRole('button', { name: 'Volver al texto de la empresa' })
    fireEvent.click(revert)
    await waitFor(() => expect(changes).toHaveLength(2))
    expect(changes[1].next).toBeNull()
  })

  it('la nota por ventana y «Quitar los ajustes de esta cotización»', async () => {
    const { changes } = setup({ overrides: { v: 2, texts: { footer: 'Banco' } } })
    expect(screen.getByText('1 ajuste propio')).toBeTruthy()
    const note = screen.getByRole('textbox', { name: /Ventanal del living/ })
    fireEvent.change(note, { target: { value: 'Con celosía' } })
    await waitFor(() => expect(changes).toHaveLength(1))
    expect(changes[0].next?.items?.i1?.note).toBe('Con celosía')
    fireEvent.click(screen.getByRole('button', { name: 'Quitar los ajustes de esta cotización' }))
    await waitFor(() => expect(changes).toHaveLength(2))
    expect(changes[1].next).toBeNull()
  })

  it('en modo lectura no cambia nada', () => {
    const { changes } = setup({ readOnly: true })
    const garantia = screen.getByRole('switch', { name: 'Ocultar «Garantía»' }) as HTMLButtonElement
    expect(garantia.disabled).toBe(true)
    fireEvent.click(garantia)
    expect(changes).toHaveLength(0)
  })

  it('acepta ajustes v1 guardados (los migra al leer)', () => {
    setup({ overrides: { intro: 'Estimado cliente', validityDays: 30 } })
    expect((document.querySelector('textarea[data-field="intro"]') as HTMLTextAreaElement).value).toBe('Estimado cliente')
    expect(screen.getByText('2 ajustes propios')).toBeTruthy()
  })
})
