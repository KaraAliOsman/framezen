import { useLayoutEffect, useRef, useState } from 'react'

/** Mide un elemento con ResizeObserver (ancho y alto en px enteros). */
export function useElementSize<T extends HTMLElement>(fallback = { width: 640, height: 400 }) {
  const ref = useRef<T>(null)
  const [size, setSize] = useState(fallback)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () => {
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setSize((previous) => {
          const width = Math.round(rect.width)
          const height = Math.round(rect.height)
          return previous.width === width && previous.height === height ? previous : { width, height }
        })
      }
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return [ref, size] as const
}
