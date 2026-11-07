import { useLayoutEffect } from 'react'
import { THEME_META_COLOR, THEME_TOKENS } from '../../brand/tokens'
import { useOptionalTheme } from '../../lib/theme'

/**
 * El portal es el documento de venta del taller: se ve siempre en claro, como el PDF, aunque quien
 * lo abra (por ejemplo, el dueño revisando su enlace) tenga guardado el tema oscuro. Al salir se
 * restaura el tema que corresponda.
 *
 * - `data-theme="light"` en <html> (los diálogos se montan fuera de la página y usan los tokens).
 * - Todos los tokens del tema (`THEME_TOKENS`: `--dk-*` y alias heredados) quedan en línea en <html>
 *   con su valor claro, así ganan aunque el proveedor de tema vuelva a poner `data-theme="dark"`
 *   (cambio del tema del sistema); un observador lo devuelve a claro.
 */
export function useLightTheme(): void {
  const resolved = useOptionalTheme()?.resolved
  useLayoutEffect(() => {
    const root = document.documentElement
    const meta = document.querySelector('meta[name="theme-color"]')
    const previousMeta = meta?.getAttribute('content') ?? null
    // <html> puede venir ya en claro (el script de index.html evita el destello): manda la preferencia.
    let wanted: string | undefined = resolved ?? root.dataset.theme

    root.dataset.theme = 'light'
    const light = getComputedStyle(root)
    for (const token of THEME_TOKENS) {
      const value = light.getPropertyValue(token).trim()
      if (value) root.style.setProperty(token, value)
    }
    root.style.setProperty('color-scheme', 'light')
    meta?.setAttribute('content', THEME_META_COLOR.light)

    const observer =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(() => {
            if (root.dataset.theme === 'light') return
            wanted = root.dataset.theme
            root.dataset.theme = 'light'
            meta?.setAttribute('content', THEME_META_COLOR.light)
          })
    observer?.observe(root, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      observer?.disconnect()
      for (const token of THEME_TOKENS) root.style.removeProperty(token)
      root.style.removeProperty('color-scheme')
      if (wanted) root.dataset.theme = wanted
      // Mismos valores que applyTheme (lib/theme.tsx).
      if (previousMeta !== null) meta?.setAttribute('content', THEME_META_COLOR[wanted as keyof typeof THEME_META_COLOR] ?? THEME_META_COLOR.light)
    }
  }, [resolved])
}
