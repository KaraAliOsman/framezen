import { CompactaQuote } from './quote/Compacta'
import { EditorialQuote } from './quote/Editorial'
import { EsencialQuote } from './quote/Esencial'
import { GaleriaQuote } from './quote/Galeria'
import { quoteCtx } from './quote/shared'
import type { QuoteDocumentProps, QuoteTemplateId } from './types'

export const QUOTE_TEMPLATES: { id: QuoteTemplateId; name: string; description: string; bestFor: string }[] = [
  { id: 'esencial', name: 'Esencial', description: 'Limpia y directa: una fila por ventana con el dibujo grande.', bestFor: 'La mayoría de las obras' },
  { id: 'galeria', name: 'Galería', description: 'Portada con la fachada y tarjetas visuales de a dos.', bestFor: 'Clientes particulares' },
  { id: 'compacta', name: 'Compacta', description: 'Tabla densa con miniaturas; 20 ventanas en una o dos hojas.', bestFor: 'Obras grandes y constructoras' },
  { id: 'editorial', name: 'Editorial', description: 'Una ventana por página, vista interior y exterior, cierre con firma.', bestFor: 'Proyectos de alto valor' },
]

/** Cotización para el cliente en cualquiera de los cuatro diseños. */
export function QuoteDocument({ data, template, editable = false, onEdit, withStyles, className }: QuoteDocumentProps) {
  const ctx = quoteCtx(data, editable, onEdit)
  switch (template) {
    case 'galeria':
      return <GaleriaQuote ctx={ctx} className={className} withStyles={withStyles} />
    case 'compacta':
      return <CompactaQuote ctx={ctx} className={className} withStyles={withStyles} />
    case 'editorial':
      return <EditorialQuote ctx={ctx} className={className} withStyles={withStyles} />
    default:
      return <EsencialQuote ctx={ctx} className={className} withStyles={withStyles} />
  }
}
