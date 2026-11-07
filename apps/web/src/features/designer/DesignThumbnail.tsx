/**
 * Miniatura de una ventana para listas (ítems de la cotización, recientes). Memoizada: la
 * geometría se calcula una vez por diseño y catálogo, aunque la lista se vuelva a montar.
 */
import { memo, useMemo } from 'react'
import { computeLayout, type Catalog, type Layout, type WindowDesign } from '@dekopen/engine'
import { WindowThumbnail, type DrawingView } from '@dekopen/documents'

const cache = new WeakMap<WindowDesign, { catalog: Catalog; layout: Layout }>()

/** computeLayout con caché por referencia de diseño (los diseños son inmutables). */
export function cachedLayout(design: WindowDesign, catalog: Catalog): Layout | null {
  const hit = cache.get(design)
  if (hit && hit.catalog === catalog) return hit.layout
  try {
    const layout = computeLayout(design, catalog)
    cache.set(design, { catalog, layout })
    return layout
  } catch {
    return null
  }
}

export interface DesignThumbnailProps {
  design: WindowDesign
  catalog: Catalog
  /** Lado mayor en px (por defecto 48). */
  size?: number
  /** Caja en la que debe caber (en vez de `size`): llena el ancho o el alto según la proporción de la ventana. */
  box?: { width: number; height: number }
  view?: DrawingView
  className?: string
  /** Texto accesible; por defecto el del dibujo («Ventana 1.200 × 1.500 mm, vista interior»). */
  title?: string
}

function ThumbnailImpl({ design, catalog, size = 48, box, view = 'interior', className, title }: DesignThumbnailProps) {
  const layout = useMemo(() => cachedLayout(design, catalog), [design, catalog])
  if (!layout || !(layout.width > 0) || !(layout.height > 0)) {
    return <span aria-hidden className={className} style={{ display: 'inline-block', width: size, height: size }} />
  }
  // Lado mayor = size (o lo que permita la caja), conservando la proporción de la ventana.
  const landscape = box ? layout.width / layout.height >= box.width / box.height : layout.width >= layout.height
  const side = box ? (landscape ? box.width : box.height) : size
  return (
    <WindowThumbnail
      layout={layout}
      design={design}
      catalog={catalog}
      view={view}
      width={landscape ? side : undefined}
      height={landscape ? undefined : side}
      className={className}
      title={title}
    />
  )
}

export const DesignThumbnail = memo(ThumbnailImpl)
