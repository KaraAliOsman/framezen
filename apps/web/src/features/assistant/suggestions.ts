/**
 * Ideas para Marco según la pantalla: en el editor, sobre la cotización abierta; fuera de él,
 * para empezar una obra o moverse por la app. Son frases que el modo local también entiende.
 */
import type { QuoteEditorBridge } from './bridge'

export function suggestionsFor(route: string, bridge: QuoteEditorBridge | null): string[] {
  if (bridge) {
    const quote = bridge.getQuote()
    const items = quote.items
    if (!items.length) return ['Agrega una corredera de 1.500 × 1.200', 'Dos oscilobatientes de 60 × 120', 'Una puerta de 900 × 2.100 para la entrada']
    const selected = items.find((i) => i.id === bridge.selectedItemId()) ?? items[items.length - 1]
    const ref = selected?.ref || 'V1'
    const list = [`Explica el precio de la ${ref}`, quote.discountPct ? 'Quita el descuento' : 'Aplica 5 % de descuento', `Duplica la ${ref}`]
    if (items.length > 1) list.splice(2, 0, 'Cambia todo a nogal')
    else list.push('Ponle termopanel')
    if (!quote.clientId) list.push('Cliente Juan Pérez')
    list.push('Muéstrame el documento')
    return list.slice(0, 4)
  }
  if (route.startsWith('/cotizaciones')) return ['Nueva cotización con una corredera de 1.500 × 1.200', 'Busca a Pérez', 'Abre la cotización 1']
  if (route.startsWith('/clientes')) return ['Busca el cliente Soto', 'Nueva cotización para Juan Pérez', 'Ve a cotizaciones']
  if (route.startsWith('/taller')) return ['Ve a cotizaciones', 'Busca a Pérez', 'Nueva cotización']
  return ['Cotiza una corredera de 1.500 × 1.200', 'Busca a Pérez', 'Llévame al taller']
}
