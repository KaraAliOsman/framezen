import '../../../test/setup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAssistantStore } from '../../lib/stores'
import { TooltipProvider } from '../../ui'
import { registerQuoteEditor } from './bridge'
import { MarcoRoot } from './MarcoRoot'
import { useMarcoStore } from './store'
import { fakeEditor } from './testing'

const original = window.matchMedia
let unregister: (() => void) | null = null

/** Simula el ancho de la ventana para las media queries que usa MarcoRoot. */
function viewport(width: number) {
  window.matchMedia = ((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    const max = /max-width:\s*(\d+)px/.exec(query)
    const matches = (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]))
    return { matches, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }
  }) as typeof window.matchMedia
}

/** La columna «Obra y ventanas» del editor de escritorio, con su rectángulo a 1024 px. */
function itemsColumn(): HTMLElement {
  const el = document.createElement('aside')
  el.setAttribute('aria-label', 'Obra y ventanas')
  const rect = { left: 232, top: 48, width: 264, height: 656 }
  el.getBoundingClientRect = () => ({ ...rect, right: 496, bottom: 704, x: 232, y: 48, toJSON: () => rect }) as DOMRect
  document.body.appendChild(el)
  return el
}

function renderRoot() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/cotizaciones/q1']}>
        <TooltipProvider>
          <MarcoRoot />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const root = document.documentElement
const panel = () => screen.queryByRole('complementary', { name: 'Marco, tu asistente' })

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  useAssistantStore.setState({ open: true, pendingPrompt: null })
  useMarcoStore.setState({ minimized: false, entries: [], busy: false })
})

afterEach(() => {
  cleanup()
  unregister?.()
  unregister = null
  window.matchMedia = original
  vi.unstubAllGlobals()
  useAssistantStore.setState({ open: false })
  document.body.innerHTML = ''
})

describe('MarcoRoot · dónde va el panel en escritorio', () => {
  it('bajo xl, en el editor, se acopla en la columna de ventanas y no le quita ancho al lienzo', () => {
    viewport(1024)
    const column = itemsColumn()
    unregister = registerQuoteEditor(fakeEditor().bridge)
    renderRoot()

    expect(root.dataset.assistant).toBe('open')
    expect(root.dataset.assistantPlace).toBe('items')
    expect(root.style.getPropertyValue('--fz-assistant-inset')).toBe('0px')
    expect(panel()?.hasAttribute('data-docked')).toBe(true)
    const host = panel()!.parentElement!
    expect([host.style.left, host.style.top, host.style.width, host.style.height]).toEqual(['232px', '48px', '264px', '656px'])
    // La columna tapada no recibe el foco mientras Marco está encima.
    expect(column.hasAttribute('inert')).toBe(true)

    // Minimizar devuelve la columna.
    act(() => useMarcoStore.getState().setMinimized(true))
    expect(root.dataset.assistant).toBe('minimized')
    expect(root.dataset.assistantPlace).toBe('none')
    expect(column.hasAttribute('inert')).toBe(false)
  })

  it('desde xl va a la derecha y reserva su columna, como antes', () => {
    viewport(1440)
    const column = itemsColumn()
    unregister = registerQuoteEditor(fakeEditor().bridge)
    renderRoot()

    expect(root.dataset.assistantPlace).toBe('right')
    expect(root.style.getPropertyValue('--fz-assistant-inset')).toBe('380px')
    expect(panel()?.hasAttribute('data-docked')).toBe(false)
    expect(column.hasAttribute('inert')).toBe(false)
  })

  it('fuera del editor flota abajo a la derecha aunque la pantalla sea angosta', () => {
    viewport(1024)
    itemsColumn()
    renderRoot()

    expect(root.dataset.assistantPlace).toBe('right')
    expect(panel()?.hasAttribute('data-docked')).toBe(false)
  })

  it('en la tableta (editor en lista) sigue flotando', () => {
    viewport(900)
    const column = itemsColumn()
    unregister = registerQuoteEditor(fakeEditor().bridge)
    renderRoot()

    expect(root.dataset.assistantPlace).toBe('right')
    expect(panel()?.hasAttribute('data-docked')).toBe(false)
    expect(column.hasAttribute('inert')).toBe(false)
  })

  it('al cerrar no deja señales', () => {
    viewport(1024)
    itemsColumn()
    unregister = registerQuoteEditor(fakeEditor().bridge)
    const view = renderRoot()
    act(() => useAssistantStore.getState().setOpen(false))
    expect(root.dataset.assistant).toBe('closed')
    expect(root.dataset.assistantPlace).toBe('none')
    expect(root.style.getPropertyValue('--fz-assistant-inset')).toBe('0px')
    view.unmount()
    expect(root.dataset.assistant).toBeUndefined()
    expect(root.dataset.assistantPlace).toBeUndefined()
  })
})
