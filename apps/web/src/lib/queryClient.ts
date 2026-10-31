import { QueryClient } from '@tanstack/react-query'
import { ApiRequestError } from './api'

/** Claves de consulta compartidas por toda la app. */
export const qk = {
  me: ['me'] as const,
  settings: ['settings'] as const,
  catalog: ['catalog'] as const,
  clients: (q = '') => ['clients', q] as const,
  client: (id: string) => ['client', id] as const,
  quotes: (params: object = {}) => ['quotes', params] as const,
  quote: (id: string) => ['quote', id] as const,
  workOrders: ['work-orders'] as const,
  workOrder: (id: string) => ['work-order', id] as const,
  activity: ['activity'] as const,
  portal: (token: string) => ['portal', token] as const,
  invitation: (token: string) => ['invitation', token] as const,
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        // `request` ya reintenta cortes de red; aquí solo un intento extra ante fallas del servidor.
        retry: (failureCount, error) => {
          if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500) return false
          return failureCount < 1
        },
      },
      mutations: { retry: false },
    },
  })
}

export const queryClient = createQueryClient()
