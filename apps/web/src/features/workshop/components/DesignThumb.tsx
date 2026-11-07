import { memo, useMemo } from 'react'
import { computeLayout, type Catalog, type Layout, type WindowDesign } from '@dekopen/engine'
import { WindowThumbnail } from '@dekopen/documents'
import { cn } from '../../../lib/cn'

/** Miniatura dibujada de una ventana (vista interior). Calcula la geometría si no viene. */
export const DesignThumb = memo(function DesignThumb({
  design,
  layout,
  catalog,
  size = 48,
  className,
  title,
}: {
  design: WindowDesign
  layout?: Layout
  catalog?: Catalog
  size?: number
  className?: string
  title?: string
}) {
  const geometry = useMemo(() => {
    if (layout) return layout
    if (!catalog) return null
    try {
      return computeLayout(design, catalog)
    } catch {
      return null
    }
  }, [design, layout, catalog])
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      aria-hidden={title ? undefined : true}
    >
      {geometry && catalog ? (
        <WindowThumbnail layout={geometry} design={design} catalog={catalog} size={size} title={title} />
      ) : (
        <span className="block size-3/4 rounded-xs bg-hover" />
      )}
    </span>
  )
})
