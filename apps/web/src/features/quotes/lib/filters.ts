/** Filtros por estado de /cotizaciones y lectura de `?estado=` (enlaces del embudo de Inicio). */
import type { QuoteStatus } from '@framezen/shared'

export type QuoteFilter = 'all' | 'draft' | 'sent' | 'accepted' | 'workshop' | 'rejected'
export const FILTERS: { value: QuoteFilter; label: string; statuses?: QuoteStatus[] }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'draft', label: 'Borradores', statuses: ['draft'] },
  { value: 'sent', label: 'Enviadas', statuses: ['sent'] },
  { value: 'accepted', label: 'Aceptadas', statuses: ['accepted'] },
  { value: 'workshop', label: 'En taller', statuses: ['workshop', 'installed'] },
  { value: 'rejected', label: 'Rechazadas', statuses: ['rejected'] },
]

/**
 * Filtro desde `?estado=` (el embudo de Inicio enlaza con el QuoteStatus). Acepta también las
 * palabras de la pantalla («borradores», «enviadas», «en-taller»…) para enlaces escritos a mano.
 */
export function filterFromParam(value: string | null | undefined): QuoteFilter {
  const key = (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\s_]+/g, '-')
  if (!key) return 'all'
  const byStatus: Record<string, QuoteFilter> = {
    draft: 'draft',
    sent: 'sent',
    accepted: 'accepted',
    workshop: 'workshop',
    installed: 'workshop',
    rejected: 'rejected',
    borrador: 'draft',
    borradores: 'draft',
    enviada: 'sent',
    enviadas: 'sent',
    aceptada: 'accepted',
    aceptadas: 'accepted',
    taller: 'workshop',
    'en-taller': 'workshop',
    instalada: 'workshop',
    instaladas: 'workshop',
    rechazada: 'rejected',
    rechazadas: 'rejected',
  }
  return byStatus[key] ?? 'all'
}
