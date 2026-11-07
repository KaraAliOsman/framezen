/**
 * Consultas y acciones propias de Inicio. Las claves cuelgan de 'quotes' y 'activity' para que crear
 * o cambiar una cotización las refresque solas.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Quote, QuoteFollowUpBody, QuoteFollowUpResponse, QuoteStats, QuoteStatus } from '@dekopen/shared'
import { request } from '../../lib/api'
import { qk } from '../../lib/queryClient'

const STATS_KEY = ['quotes', 'stats']

export function useQuoteStats() {
  return useQuery({ queryKey: STATS_KEY, queryFn: () => request<QuoteStats>('/quotes/stats') })
}

/** Saca una cotización de la cola al instante; si la acción falla, vuelve. */
function useQueueExit() {
  const client = useQueryClient()
  return {
    leave: async (quoteId: string) => {
      await client.cancelQueries({ queryKey: STATS_KEY })
      const previous = client.getQueryData<QuoteStats>(STATS_KEY)
      if (previous) client.setQueryData<QuoteStats>(STATS_KEY, { ...previous, followUps: previous.followUps.filter((q) => q.id !== quoteId) })
      return { previous }
    },
    restore: (context?: { previous?: QuoteStats }) => {
      if (context?.previous) client.setQueryData(STATS_KEY, context.previous)
    },
    refresh: () => {
      void client.invalidateQueries({ queryKey: ['quotes'] })
      void client.invalidateQueries({ queryKey: qk.activity })
    },
  }
}

/** Da por hechos los avisos de una cotización (o los vuelve a dejar pendientes al deshacer). */
export function useResolveNotices() {
  const exit = useQueueExit()
  return useMutation({
    mutationFn: ({ ids, pending }: { quoteId: string; ids: string[]; pending: boolean }) =>
      Promise.all(ids.map((id) => request(`/activity/${encodeURIComponent(id)}`, { method: 'PATCH', body: { pending } }))),
    onMutate: ({ quoteId, pending }) => (pending ? undefined : exit.leave(quoteId)),
    onError: (_error, _vars, context) => exit.restore(context),
    onSettled: exit.refresh,
  })
}

/** Recordar en N días, posponer o volver a la fecha anterior (deshacer). */
export function useSetFollowUp() {
  const exit = useQueueExit()
  return useMutation({
    mutationFn: ({ quoteId, ...body }: { quoteId: string; leave?: boolean } & QuoteFollowUpBody) => {
      const { leave: _leave, ...payload } = body
      return request<QuoteFollowUpResponse>(`/quotes/${encodeURIComponent(quoteId)}/follow-up`, { method: 'POST', body: payload })
    },
    onMutate: ({ quoteId, leave }) => (leave ? exit.leave(quoteId) : undefined),
    onError: (_error, _vars, context) => exit.restore(context),
    onSettled: exit.refresh,
  })
}

/** Marca perdida (con motivo) o devuelve el estado anterior (deshacer). */
export function useSetQuoteStatus() {
  const exit = useQueueExit()
  return useMutation({
    mutationFn: ({ quoteId, status, lostReason }: { quoteId: string; status: QuoteStatus; lostReason?: string }) =>
      request<Quote>(`/quotes/${encodeURIComponent(quoteId)}/status`, { method: 'POST', body: { status, ...(lostReason ? { lostReason } : {}) } }),
    onMutate: ({ quoteId, status }) => (status === 'rejected' ? exit.leave(quoteId) : undefined),
    onError: (_error, _vars, context) => exit.restore(context),
    onSettled: exit.refresh,
  })
}
