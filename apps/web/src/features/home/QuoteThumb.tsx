import { memo } from 'react'
import type { Catalog } from '@dekopen/engine'
import type { QuoteItem } from '@dekopen/shared'
import { cn } from '../../lib/cn'
// Archivo directo (no el índice del diseñador) para no cargar el lienzo completo en Inicio.
import { DesignThumbnail } from '../designer/DesignThumbnail'

/**
 * Miniatura real de la primera ventana de una cotización, `size` px de alto en un tile apaisado (las
 * ventanas suelen ser más anchas que altas: así llenan el recuadro y no parecen un icono). Sin
 * ventana (o sin catálogo todavía) queda el hueco con su tamaño: nada de dibujos de relleno.
 */
export const QuoteThumb = memo(function QuoteThumb({
  item,
  catalog,
  size = 40,
  className,
}: {
  item?: Pick<QuoteItem, 'design'> | null
  catalog?: Catalog | null
  size?: number
  className?: string
}) {
  const width = Math.round(size * 1.25)
  const inset = Math.max(4, Math.round(size / 12))
  return (
    <span aria-hidden className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-sunken', className)} style={{ width, height: size }}>
      {item?.design && catalog ? <DesignThumbnail design={item.design} catalog={catalog} box={{ width: width - inset * 2, height: size - inset * 2 }} /> : null}
    </span>
  )
})
