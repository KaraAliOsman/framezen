import '../../../test/setup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Me } from '@framezen/shared'
import { useAssistantStore } from '../../lib/stores'
import { qk } from '../../lib/queryClient'
import { TooltipProvider } from '../../ui'
import { undoRegistry } from './conversation'
import { MarcoRoot } from './MarcoRoot'
import { useMarcoStore } from './store'

const SECRET = 'SECRETO-ORG-A margen 42 por ciento'

function session(userId: string, orgId: string, orgName: string): Me {
  return {
    user: { id: userId, name: 'Persona', email: `${userId}@taller.cl`, createdAt: '2026-10-31T12:00:00.000Z' },
    org: { id: orgId, name: orgName },
    role: 'owner',
    solo: true,
    onboarded: true,
  } as unknown as Me
}

function renderAs(me: Me | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(qk.me, me)
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/inicio']}>
        <TooltipProvider>
          <MarcoRoot />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { client, view }
}

const stored = () => sessionStorage.getItem('fz-marco') ?? ''

/** La conversación que dejó la empresa A en la pestaña. */
function leaveConversationOfA() {
  useMarcoStore.getState().clearSession()
  useMarcoStore.getState().bindSession('uA:oA')
  useMarcoStore.setState({
    entries: [{ id: 'e1', role: 'user', text: SECRET, at: Date.now() }],
    history: [{ role: 'user', content: SECRET }],
    draft: 'SECRETO borrador',
  })
  undoRegistry.set('r-a', () => true)
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
  sessionStorage.clear()
  useAssistantStore.setState({ open: true, pendingPrompt: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
  useAssistantStore.setState({ open: false, pendingPrompt: null })
  useMarcoStore.getState().clearSession()
  undoRegistry.clear()
  sessionStorage.clear()
})

describe('Marco · la conversación es de una sesión', () => {
  it('otra persona de otra empresa en la misma pestaña no ve ni reenvía la conversación anterior', () => {
    leaveConversationOfA()
    expect(stored()).toContain(SECRET)

    renderAs(session('uB', 'oB', 'Empresa B'))

    expect(screen.queryByText(SECRET)).toBeNull()
    const state = useMarcoStore.getState()
    expect(state.owner).toBe('uB:oB')
    expect(state.entries).toEqual([])
    // Es lo que viajaría a /api/assistant/chat en el próximo mensaje.
    expect(state.history).toEqual([])
    expect(state.draft).toBe('')
    expect(stored()).not.toContain('SECRETO')
    // El deshacer en memoria apuntaba a la cotización de la otra empresa.
    expect(undoRegistry.size).toBe(0)
  })

  it('la misma persona en la misma empresa conserva su conversación al recargar', () => {
    useMarcoStore.getState().bindSession('uB:oB')
    useMarcoStore.setState({ entries: [{ id: 'e1', role: 'user', text: 'Duplica la V2', at: Date.now() }] })

    renderAs(session('uB', 'oB', 'Empresa B'))

    expect(screen.getByText('Duplica la V2')).toBeTruthy()
    expect(useMarcoStore.getState().entries).toHaveLength(1)
  })

  it('al cerrar sesión se olvida todo, también lo guardado en la pestaña', () => {
    const { client, view } = renderAs(session('uA', 'oA', 'Empresa A'))
    act(() => {
      useMarcoStore.getState().addEntry({ id: 'e1', role: 'user', text: SECRET, at: Date.now() })
      useMarcoStore.getState().pushHistory({ role: 'user', content: SECRET })
    })
    expect(stored()).toContain(SECRET)

    // useLogout: limpia la sesión y el shell (con Marco) se desmonta al ir a /entrar.
    act(() => client.setQueryData(qk.me, null))
    view.unmount()

    expect(stored()).not.toContain('SECRETO')
    expect(useMarcoStore.getState()).toMatchObject({ owner: null, entries: [], history: [], draft: '' })
    expect(useAssistantStore.getState().open).toBe(false)

    // Una respuesta tardía de la sesión anterior ya no queda guardada en la pestaña.
    useMarcoStore.getState().addEntry({ id: 'e2', role: 'assistant', text: 'RESPUESTA-TARDIA', at: Date.now() })
    expect(stored()).not.toContain('RESPUESTA-TARDIA')
  })

  it('una conversación guardada sin dueño (versión anterior) se descarta al abrir la pestaña', async () => {
    sessionStorage.setItem('fz-marco', JSON.stringify({ state: { entries: [{ id: 'e1', role: 'user', text: SECRET, at: 1 }], history: [{ role: 'user', content: SECRET }] }, version: 1 }))
    await useMarcoStore.persist.rehydrate()
    expect(useMarcoStore.getState().entries).toEqual([])
    expect(useMarcoStore.getState().history).toEqual([])
  })
})
