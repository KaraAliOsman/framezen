import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

/**
 * Muestra un documento a tamaño real (px CSS de papel) reducido al ancho disponible, o a un zoom
 * fijo (`scale`). Con `crop` se ve sólo la parte de arriba (miniaturas de la galería).
 */
export function ScaledDoc({
  pageWidth,
  children,
  maxScale = 1,
  scale: fixedScale,
  crop,
  className,
  inert,
}: {
  pageWidth: number
  children: ReactNode
  maxScale?: number
  /** Zoom fijo (1 = 100 %). Sin él, se ajusta al ancho. */
  scale?: number
  /** Alto visible como proporción del ancho (1 = cuadrado). */
  crop?: number
  className?: string
  /** Sin interacción (miniaturas). */
  inert?: boolean
}) {
  const outer = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)

  useLayoutEffect(() => {
    const o = outer.current
    const i = inner.current
    if (!o || !i) return
    setWidth(o.clientWidth)
    setHeight(i.scrollHeight)
    const ro = new ResizeObserver(() => {
      setWidth(o.clientWidth)
      setHeight(i.scrollHeight)
    })
    ro.observe(o)
    ro.observe(i)
    return () => ro.disconnect()
  }, [])

  const fit = width ? Math.min(maxScale, width / pageWidth) : 0
  const scale = fixedScale ?? fit
  const visible = crop ? width * crop : height * scale
  const offset = !crop && width > pageWidth * scale ? (width - pageWidth * scale) / 2 : 0
  return (
    <div ref={outer} className={cn('relative w-full', fixedScale ? 'overflow-visible' : 'overflow-hidden', className)} style={{ height: visible || undefined }}>
      <div
        ref={inner}
        inert={inert}
        aria-hidden={inert || undefined}
        className={cn(inert && 'pointer-events-none select-none')}
        style={{
          width: pageWidth,
          transform: `scale(${scale || 0.0001})`,
          transformOrigin: 'top left',
          marginLeft: offset,
          visibility: width ? 'visible' : 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  )
}
