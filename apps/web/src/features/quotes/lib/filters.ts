/**
 * Filtros por estado de /cotizaciones y lectura de `?estado=` (enlaces del embudo de Inicio). Los
 * nombres visibles salen de `list.filters.<valor>` (i18n de cotizaciones).
 */
import type { QuoteStatus } from '@dekopen/shared'

export type QuoteFilter = 'all' | 'draft' | 'sent' | 'accepted' | 'workshop' | 'rejected'
export const FILTERS: { value: QuoteFilter; statuses?: QuoteStatus[] }[] = [
  { value: 'all' },
  { value: 'draft', statuses: ['draft'] },
  { value: 'sent', statuses: ['sent'] },
  { value: 'accepted', statuses: ['accepted'] },
  { value: 'workshop', statuses: ['workshop', 'installed'] },
  { value: 'rejected', statuses: ['rejected'] },
]

/**
 * Filtro desde `?estado=` (el embudo de Inicio enlaza con el QuoteStatus). Acepta también las
 * palabras de la pantalla («borradores», «enviadas», «en-taller»…) para enlaces escritos a mano.
 */
export function filterFromParam(value: string | null | undefined): QuoteFilter {
  const key = (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/ı/g, 'i')
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
