/**
 * Consultas propias de Inicio (las que no están en lib/hooks). Las claves cuelgan de 'quotes' y
 * 'activity' para que crear o cambiar una cotización las refresque solas.
 */
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ActivityEvent, Paged, Quote, QuoteSummary } from '@framezen/shared'
import { api, request } from '../../lib/api'
import { qk } from '../../lib/queryClient'
import { WON_STATUSES, type QuoteStats } from './homeModel'

export type ActivityItem = ActivityEvent & { pending?: boolean; meta?: Record<string, unknown> }

export function useQuoteStats() {
  return useQuery({ queryKey: ['quotes', 'stats'], queryFn: () => request<QuoteStats>('/quotes/stats') })
}

/** Cotizaciones ganadas (para comparar el mes con el anterior). */
export function useWonQuotes() {
  return useQuery({
    queryKey: ['quotes', 'won'],
    queryFn: () =>
      request<Paged<QuoteSummary>>('/quotes', { query: { status: WON_STATUSES.join(','), limit: 200 } }).then((r) => r.items),
    staleTime: 60_000,
  })
}

/** Avisos que esperan una acción (pidió cambios, aceptó). */
export function usePendingActivity() {
  return useQuery({
    queryKey: ['activity', 'pending'],
    queryFn: () => request<Paged<ActivityItem>>('/activity', { query: { pending: 1, limit: 10 } }).then((r) => r.items),
  })
}

export function useRecentActivity() {
  return useQuery({
    queryKey: ['activity', 'recent'],
    queryFn: () => request<Paged<ActivityItem>>('/activity', { query: { limit: 12 } }).then((r) => r.items),
  })
}

/** Marca un aviso como atendido (con respuesta optimista). */
export function useResolveActivity() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, pending }: { id: string; pending: boolean }) =>
      request<ActivityItem>(`/activity/${encodeURIComponent(id)}`, { method: 'PATCH', body: { pending } }),
    onMutate: async ({ id, pending }) => {
      const key = ['activity', 'pending']
      await client.cancelQueries({ queryKey: key })
      const previous = client.getQueryData<ActivityItem[]>(key)
      if (previous && !pending) client.setQueryData<ActivityItem[]>(key, previous.filter((e) => e.id !== id))
      return { previous }
    },
    onError: (_e, _v, context) => {
      if (context?.previous) client.setQueryData(['activity', 'pending'], context.previous)
    },
    onSettled: () => void client.invalidateQueries({ queryKey: qk.activity }),
  })
}

/** Detalle de las cotizaciones a seguir (teléfono del cliente y enlace del portal). */
export function useQuoteDetails(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => ({ queryKey: qk.quote(id), queryFn: () => api.quotes.get(id), staleTime: 60_000 })),
    combine: (results) => {
      const byId = new Map<string, Quote>()
      for (const r of results) if (r.data) byId.set(r.data.id, r.data)
      return byId
    },
  })
}
