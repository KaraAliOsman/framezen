import { useEffect, useState } from 'react'

/** Ancho de `xl` en Tailwind: bajo esto las tablas del catálogo esconden columnas secundarias. */
const XL_QUERY = '(min-width: 1280px)'

/**
 * Pantalla ancha (≥ 1.280 px). Las tablas del catálogo la usan para ocultar columnas secundarias
 * (línea, unidad de compra) antes de achicar el nombre del artículo, que es lo que se busca.
 */
export function useWide(query: string = XL_QUERY): boolean {
  const [wide, setWide] = useState(() => typeof window === 'undefined' || !window.matchMedia || window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const onChange = () => setWide(mq.matches)
    onChange()
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [query])
  return wide
}
