import { memo } from 'react'
import { AppWindow } from 'lucide-react'
import type { Catalog } from '@framezen/engine'
import type { QuoteItem } from '@framezen/shared'
import { cn } from '../../lib/cn'
// Archivo directo (no el índice del diseñador) para no cargar el lienzo completo en Inicio.
import { DesignThumbnail } from '../designer/DesignThumbnail'

/**
 * Miniatura de la primera ventana de una cotización (DesignThumbnail del diseñador) dentro de
 * un marco fijo. Sin ventana (o sin catálogo todavía) muestra un marco vacío sobrio.
 */
export const QuoteThumb = memo(function QuoteThumb({
  item,
  catalog,
  size = 48,
  className,
}: {
  item?: Pick<QuoteItem, 'design'> | null
  catalog?: Catalog | null
  size?: number
  className?: string
}) {
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-paper-200 bg-paper-50', className)}
      style={{ width: size + 12, height: size + 12 }}
    >
      {item?.design && catalog ? (
        <DesignThumbnail design={item.design} catalog={catalog} size={size} />
      ) : (
        <AppWindow strokeWidth={1.5} className="size-5 text-paper-350" />
      )}
    </span>
  )
})
