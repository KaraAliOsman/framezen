import '../../../../test/setup'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import type { AssistantListResponse, AssistantProfile, Me } from '@dekopen/shared'
import { RequireAuth } from '../../../lib/auth'
import { createQueryClient } from '../../../lib/queryClient'
import { Toaster } from '../../../ui/Toaster'
import { TooltipProvider } from '../../../ui/Tooltip'
import { AssistantsSection } from './AssistantsSection'

const ME: Me = {
  user: { id: 'u1', name: 'Rosa Martínez', email: 'rosa@sur.cl', createdAt: '2026-10-01T00:00:00Z' },
  org: { id: 'o1', name: 'Ventanas Martínez', createdAt: '2026-10-01T00:00:00Z' },
  role: 'owner',
  billing: {
    plan: 'pro',
    status: 'active',
    period: 'monthly',
    seats: 3,
    seatsUsed: 1,
    aiCredits: { included: 2000, used: 10, extra: 0 },
    features: ['assistant', 'custom_templates', 'texture_upload'],
    provider: 'dev',
  },
  solo: true,
  onboarded: true,
}

function assistant(id: string, name: string, extra: Partial<AssistantProfile> = {}): AssistantProfile {
  return {
    id,
    name,
    avatar: { shape: 'window', palette: 'glass', eyes: 'capsule', accessory: 'none' } as unknown as AssistantProfile['avatar'],
    personality: { tone: 'friendly', instructions: '' },
    defaultMode: 'supervised',
    scopes: ['quotes', 'clients'],
    language: 'auto',
    visibility: 'shared',
    memoryEnabled: true,
    isDefault: false,
    version: 1,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    canEdit: true,
    ...extra,
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function renderSection(list: AssistantListResponse | 404) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const path = String(input).split('?')[0]
      if (path.endsWith('/assistant/v2/assistants')) return list === 404 ? json({ error: { code: 'not_found', message: 'No' } }, 404) : json(list)
      return json({})
    }),
  )
  const client = createQueryClient()
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } })
  client.setQueryData(['me'], ME)
  render(
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <MemoryRouter initialEntries={['/ajustes/asistentes']}>
          <RequireAuth>
            <AssistantsSection />
          </RequireAuth>
        </MemoryRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe('Ajustes › Asistentes', () => {
  it('lista los asistentes con su estado y cuántos permite el plan', async () => {
    renderSection({ items: [assistant('a1', 'Marco', { isDefault: true }), assistant('a2', 'Luna', { visibility: 'private' })], limit: 3, used: 2 })
    expect(await screen.findByText('Marco')).toBeTruthy()
    expect(screen.getByText('Luna')).toBeTruthy()
    expect(screen.getByText('Predeterminado')).toBeTruthy()
    expect(screen.getByText('Privado')).toBeTruthy()
    expect(screen.getByText('2 de 3')).toBeTruthy()
  })

  it('en el tope del plan no abre el editor: explica el límite', async () => {
    renderSection({ items: [assistant('a1', 'Marco', { isDefault: true }), assistant('a2', 'Luna'), assistant('a3', 'Sol')], limit: 3, used: 3 })
    await screen.findByText('Marco')
    fireEvent.click(screen.getByRole('button', { name: /Nuevo asistente/ }))
    expect(await screen.findByText('Tu plan permite 3 asistentes')).toBeTruthy()
    expect(screen.getByText(/Archiva uno que ya no uses/)).toBeTruthy()
  })

  it('si la API de asistentes aún no responde, la pantalla sigue en pie y lo dice sin culpar a la persona', async () => {
    renderSection(404)
    expect(await screen.findByText('La lista de asistentes no está disponible')).toBeTruthy()
    await waitFor(() => expect(screen.queryByText('No pudimos cargar tus asistentes')).toBeNull())
    // Lo que sí sabe del plan sigue a la vista.
    expect(screen.getByText('Asistentes de tu plan')).toBeTruthy()
  })
})
