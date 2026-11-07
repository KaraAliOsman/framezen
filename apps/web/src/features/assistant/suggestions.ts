/**
 * Ideas para el asistente según la pantalla: en el editor, sobre la cotización abierta; fuera de él,
 * para empezar una obra o moverse por la app. Son frases que el intérprete local entiende (en el
 * idioma de la interfaz).
 */
import type { MessageKey } from '@dekopen/shared'
import { translate } from '../../lib/i18n'
import type { QuoteEditorBridge } from './bridge'
import es from './i18n/es'

export function suggestionsFor(route: string, bridge: QuoteEditorBridge | null): string[] {
  const t = (key: MessageKey<typeof es>, params?: Record<string, string>) => translate(es, key, params)
  if (bridge) {
    const quote = bridge.getQuote()
    const items = quote.items
    if (!items.length) return [t('ideas.emptyQuote.a'), t('ideas.emptyQuote.b'), t('ideas.emptyQuote.c')]
    const selected = items.find((i) => i.id === bridge.selectedItemId()) ?? items[items.length - 1]
    const ref = selected?.ref || 'V1'
    const list = [t('ideas.explain', { ref }), quote.discountPct ? t('ideas.removeDiscount') : t('ideas.addDiscount'), t('ideas.duplicate', { ref })]
    if (items.length > 1) list.splice(2, 0, t('ideas.colorAll'))
    else list.push(t('ideas.glass'))
    list.push(t('ideas.document'))
    return list.slice(0, 4)
  }
  const pick = (key: 'quotes' | 'clients' | 'workshop' | 'general') => Object.keys(es.ideas[key]).map((k) => t(`ideas.${key}.${k}` as MessageKey<typeof es>))
  if (route.startsWith('/cotizaciones')) return pick('quotes')
  if (route.startsWith('/clientes')) return pick('clients')
  if (route.startsWith('/taller')) return pick('workshop')
  return pick('general')
}
