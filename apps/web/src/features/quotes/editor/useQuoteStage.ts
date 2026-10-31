/**
 * En qué etapa está la cotización y qué conviene ofrecer: su OT (si ya pasó a taller), si el
 * enlace del cliente sigue al día y si tus precios cambiaron desde que la enviaste.
 */
import { useQuery } from '@tanstack/react-query'
import type { Paged, QuoteStatus, WorkOrder } from '@framezen/shared'
import { request, toItems } from '../../../lib/api'
import { useSession } from '../../../lib/auth'
import { revisionLetter } from '../../../lib/format'
import { qk } from '../../../lib/queryClient'
import { editedSinceSent, mailtoUrl, portalUrl, sentPriceDrift, shareMessage, whatsappUrl } from '../lib/share'
import { useEditorShallow } from './context'

/** Estados en los que puede existir una OT (aceptada y después). */
const MAY_HAVE_ORDER: readonly QuoteStatus[] = ['accepted', 'workshop', 'installed', 'closed']
/** Estados en los que la cotización ya está (o estuvo) en taller. */
export const IN_WORKSHOP: readonly QuoteStatus[] = ['workshop', 'installed', 'closed']

export type WorkOrderRef = Pick<WorkOrder, 'id' | 'number'>

/** La OT de esta cotización (GET /api/work-orders?quoteId=), solo si su estado lo permite. */
export function useQuoteWorkOrder(): { order: WorkOrderRef | null; status: QuoteStatus } {
  const { id, status } = useEditorShallow((s) => ({ id: s.meta.id, status: s.meta.status }))
  const enabled = MAY_HAVE_ORDER.includes(status)
  const query = useQuery({
    queryKey: [...qk.workOrders, { quoteId: id }],
    queryFn: () => request<WorkOrder[] | Paged<WorkOrder>>('/work-orders', { query: { quoteId: id, limit: 1 } }).then(toItems),
    enabled,
    staleTime: 60_000,
  })
  const found = enabled ? query.data?.find((o) => o.quoteId === id) ?? query.data?.[0] : undefined
  return { order: found ? { id: found.id, number: found.number } : null, status }
}

/**
 * Lo que ve el cliente contra lo que suma hoy el editor. Solo cuenta sin cambios pendientes de
 * guardar (mientras escribes, la diferencia es tuya, no de tus precios).
 */
export function usePriceDrift() {
  const s = useEditorShallow((st) => {
    const idle = !st.save.dirty && st.save.status !== 'saving'
    const drift = idle ? sentPriceDrift(st.meta, st.evaluation.totals.total) : null
    return {
      has: !!drift,
      sent: drift?.sent ?? 0,
      now: drift?.now ?? 0,
      exact: drift?.exact ?? false,
      status: st.meta.status,
      letter: revisionLetter(st.meta.revision),
      next: revisionLetter(st.meta.revision + 1),
    }
  })
  return s.has ? s : null
}

/**
 * Enlace del cliente y mensajes listos para compartir desde el documento. `current` = el enlace ya
 * muestra exactamente esta cotización (si no, hay que enviar una versión nueva antes).
 */
export function useShareState() {
  const session = useSession()
  const s = useEditorShallow((st) => {
    const client = st.doc.clientId ? st.clients[st.doc.clientId] : undefined
    const live = st.evaluation.totals.total
    // Al día = sin diferencias con el servidor; el mensaje lleva el total que calculó el servidor.
    const total = st.meta.totals?.total ?? live
    return {
      token: st.meta.shareToken ?? '',
      current: !!st.meta.shareToken && st.meta.status !== 'draft' && !editedSinceSent(st.meta, st.save.dirty || st.save.status === 'saving', live),
      letter: revisionLetter(st.meta.revision),
      number: st.meta.number,
      title: st.doc.title,
      total,
      clientName: client?.name ?? '',
      clientRut: client?.rut ?? '',
      clientPhone: client?.phone ?? '',
      clientEmail: client?.email ?? '',
    }
  })
  const url = s.current ? portalUrl(s.token) : ''
  const message = url
    ? shareMessage({
        number: s.number,
        title: s.title,
        total: s.total,
        url,
        orgName: session.org.name,
        clientName: s.clientName || undefined,
        clientRut: s.clientRut || undefined,
        revisionLetter: s.letter,
      })
    : ''
  return {
    current: s.current,
    url,
    message,
    whatsappHref: url ? whatsappUrl(message, s.clientPhone) : null,
    mailtoHref: url ? mailtoUrl({ to: s.clientEmail, subject: `Cotización N° ${s.number}${s.title.trim() ? ` · ${s.title.trim()}` : ''}`, body: message }) : null,
  }
}
