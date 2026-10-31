import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/** Tamaño de un elemento con ResizeObserver (con respaldo si el entorno no lo trae). */
export function useElementSize<T extends HTMLElement>(fallback: { width: number; height: number }) {
  const ref = useRef<T>(null)
  const [size, setSize] = useState(fallback)
  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        setSize((prev) => (Math.abs(prev.width - r.width) < 0.5 && Math.abs(prev.height - r.height) < 0.5 ? prev : { width: r.width, height: r.height }))
      }
    }
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/** `matchMedia` reactivo (false en entornos sin ventana). */
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false)
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener?.('change', onChange)
    return () => mql.removeEventListener?.('change', onChange)
  }, [query])
  return matches
}

/** prefers-reduced-motion en vivo. */
export function useReducedMotionPref(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

/**
 * ¿El foco llegó con Tab? Sirve para mostrar el anillo del lienzo solo al navegar con teclado
 * (no al volver el foco por código después de editar una cota).
 */
let lastTabAt = 0
if (typeof window !== 'undefined') {
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Tab') lastTabAt = Date.now()
    },
    true,
  )
}
export function focusCameFromTab(): boolean {
  return Date.now() - lastTabAt < 400
}
