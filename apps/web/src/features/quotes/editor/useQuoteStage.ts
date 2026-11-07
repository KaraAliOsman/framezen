/**
 * En qué etapa está la cotización y qué conviene ofrecer: su OT (si ya pasó a taller), si el
 * enlace del cliente sigue al día y si tus precios cambiaron desde que la enviaste.
 */
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Locale, Paged, QuoteStatus, WorkOrder } from '@dekopen/shared'
import { request, toItems } from '../../../lib/api'
import { useSession } from '../../../lib/auth'
import { revisionLetter } from '../../../lib/format'
import { isLocaleReady, loadLocale, useT } from '../../../lib/i18n'
import { qk } from '../../../lib/queryClient'
import es from '../i18n/es'
import { editedSinceSent, mailtoUrl, portalUrl, sentPriceDrift, shareMessage, shareSubject, whatsappUrl } from '../lib/share'
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
  const found = enabled ? (query.data?.find((o) => o.quoteId === id) ?? query.data?.[0]) : undefined
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

/** Idioma de lo que recibe el cliente (documento, enlace, mensajes): el de la cotización o el de la empresa. */
export function useMessageLocale(): Locale {
  const locale = useEditorShallow((s) => ({ l: (s.doc.documentOverrides?.locale ?? s.settings.locale ?? 'es') as Locale })).l
  // Los textos del mensaje están en el espacio de cotizaciones: se descarga ese idioma si hace falta.
  const t = useT(es)
  useEffect(() => {
    if (!isLocaleReady(locale)) void loadLocale(locale)
  }, [locale, t])
  return locale
}

/**
 * Enlace del cliente y mensajes listos para compartir desde el documento. `current` = el enlace ya
 * muestra exactamente esta cotización (si no, hay que enviar una versión nueva antes).
 */
export function useShareState() {
  const session = useSession()
  const locale = useMessageLocale()
  const s = useEditorShallow((st) => {
    const client = st.doc.clientId ? st.clients[st.doc.clientId] : undefined
    const live = st.evaluation.totals.total
    return {
      token: st.meta.shareToken ?? '',
      current: !!st.meta.shareToken && st.meta.status !== 'draft' && !editedSinceSent(st.meta, st.save.dirty || st.save.status === 'saving', live),
      letter: revisionLetter(st.meta.revision),
      number: st.meta.number,
      title: st.doc.title,
      templates: st.settings.sending?.templates,
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
        url,
        orgName: session.org.name,
        sellerName: session.user.name,
        clientName: s.clientName || undefined,
        clientRut: s.clientRut || undefined,
        revisionLetter: s.letter,
        locale,
        templates: s.templates,
      })
    : ''
  return {
    current: s.current,
    url,
    message,
    whatsappHref: url ? whatsappUrl(message, s.clientPhone) : null,
    mailtoHref: url ? mailtoUrl({ to: s.clientEmail, subject: shareSubject(s.number, s.title, locale), body: message }) : null,
  }
}
