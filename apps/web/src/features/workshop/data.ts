/**
 * Datos del taller: consultas y cambios de OT sobre `lib/api` y TanStack Query.
 * Los cambios son optimistas (se ven al instante) y se deshacen si el servidor falla.
 */
import { useQueries, useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import type { Paged, Quote, Station, WorkOrder } from '@framezen/shared'
import { api, request, toItems } from '../../lib/api'
import { qk } from '../../lib/queryClient'
import { statusFromProgress } from './model/stations'

/** GET /api/work-orders/:id trae la cotización para calcular los documentos al vuelo. */
export type WorkOrderDetail = WorkOrder & { quote?: Quote }

/** Cambio de OT. `null` borra la fecha o las notas. */
export interface WorkOrderUpdate {
  progress?: Record<string, Station>
  notes?: string | null
  dueDate?: string | null
}

export const workshopKeys = {
  /** Todas las OT (hasta 200, la más nueva primero). Cuelga de qk.workOrders para invalidarse junto. */
  all: [...qk.workOrders, 'all'] as const,
}

/** Lista completa de OT del taller (abiertas y recientes). */
export function useWorkshopOrders() {
  return useQuery({
    queryKey: workshopKeys.all,
    queryFn: () => request<WorkOrder[] | Paged<WorkOrder>>('/work-orders', { query: { limit: 200 } }).then(toItems),
  })
}

export function useWorkOrderDetail(id: string | undefined) {
  return useQuery({
    queryKey: qk.workOrder(id ?? ''),
    queryFn: () => api.workOrders.get(id as string) as Promise<WorkOrderDetail>,
    enabled: Boolean(id),
  })
}

/** Detalles (con cotización) de varias OT, para las tarjetas del tablero. */
export function useWorkOrderDetails(ids: readonly string[], enabled = true) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: qk.workOrder(id),
      queryFn: () => api.workOrders.get(id) as Promise<WorkOrderDetail>,
      enabled,
      staleTime: 60_000,
    })),
  })
}

/** Aplica un cambio a una OT como lo haría el servidor (avance → estado). */
export function applyUpdate<T extends WorkOrder>(order: T, patch: WorkOrderUpdate): T {
  const next: T = { ...order }
  if (patch.progress) {
    next.progress = { ...order.progress, ...patch.progress }
    next.status = statusFromProgress(next.progress)
  }
  if (patch.notes !== undefined) {
    if (patch.notes) next.notes = patch.notes
    else delete next.notes
  }
  if (patch.dueDate !== undefined) {
    if (patch.dueDate) next.dueDate = patch.dueDate
    else delete next.dueDate
  }
  return next
}

function patchCaches(client: QueryClient, id: string, update: (o: WorkOrder) => WorkOrder) {
  client.setQueryData<WorkOrderDetail>(qk.workOrder(id), (prev) => (prev ? { ...update(prev), ...(prev.quote ? { quote: prev.quote } : {}) } : prev))
  client.setQueriesData<WorkOrder[]>({ queryKey: qk.workOrders }, (list) =>
    Array.isArray(list) ? list.map((o) => (o.id === id ? update(o) : o)) : list,
  )
}

// Cambios en vuelo por OT: solo el último confirma con la respuesta del servidor (evita que
// una respuesta vieja pise un arrastre más nuevo).
const pending = new Map<string, number>()

export function useUpdateWorkOrder() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: WorkOrderUpdate }) =>
      request<WorkOrder>(`/work-orders/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }),
    onMutate: async ({ id, patch }) => {
      pending.set(id, (pending.get(id) ?? 0) + 1)
      await Promise.all([client.cancelQueries({ queryKey: qk.workOrder(id) }), client.cancelQueries({ queryKey: qk.workOrders })])
      const previousDetail = client.getQueryData<WorkOrderDetail>(qk.workOrder(id))
      const previousLists = client.getQueriesData<WorkOrder[]>({ queryKey: qk.workOrders })
      patchCaches(client, id, (o) => applyUpdate(o, patch))
      return { previousDetail, previousLists }
    },
    onError: (_error, { id }, context) => {
      if (!context) return
      client.setQueryData(qk.workOrder(id), context.previousDetail)
      for (const [key, data] of context.previousLists) client.setQueryData(key, data)
    },
    onSuccess: (order, { id }) => {
      if ((pending.get(id) ?? 0) > 1 || !order) return
      patchCaches(client, id, (o) => ({ ...o, ...order }))
    },
    onSettled: (_data, _error, { id, patch }) => {
      const left = (pending.get(id) ?? 1) - 1
      if (left > 0) pending.set(id, left)
      else pending.delete(id)
      // Todo instalado cambia el estado de la cotización en el servidor.
      if (patch.progress && left === 0) void client.invalidateQueries({ queryKey: ['quotes'] })
    },
  })
}

/** «Pasar a taller» desde una cotización aceptada. */
export function useCreateWorkOrder() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (quoteId: string) => api.workOrders.createFromQuote(quoteId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.workOrders })
      void client.invalidateQueries({ queryKey: ['quotes'] })
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Descargas
// ─────────────────────────────────────────────────────────────────────────────

/** Guarda un archivo en el equipo (descarga del navegador). */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export function pdfUrl(orderId: string, kind: string, params: Record<string, string | number | undefined> = {}): string {
  const query = new URLSearchParams({ doc: kind })
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') query.set(key, String(value))
  return `/api/work-orders/${encodeURIComponent(orderId)}/pdf?${query.toString()}`
}

/**
 * PDF generado en el servidor. Devuelve null si el servidor no puede (ruta aún no
 * disponible, sin Chromium, sin conexión): quien llama imprime desde el navegador.
 */
export async function fetchServerPdf(url: string, signal?: AbortSignal): Promise<Blob | null> {
  try {
    const res = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/pdf' }, signal })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (!type.includes('pdf')) return null
    const blob = await res.blob()
    return blob.size > 0 ? blob : null
  } catch {
    return null
  }
}
