import { useLayoutEffect } from 'react'

/** Tokens de color del sistema (styles.css): el portal los fija con sus valores del tema claro. */
const THEME_TOKENS = [
  '--paper-0',
  '--paper-50',
  '--paper-100',
  '--paper-200',
  '--paper-350',
  '--paper-600',
  '--paper-900',
  '--ink-50',
  '--ink-100',
  '--ink-500',
  '--ink-600',
  '--ink-700',
  '--ok-50',
  '--ok-600',
  '--ok-800',
  '--warn-50',
  '--warn-600',
  '--warn-800',
  '--bad-50',
  '--bad-600',
  '--bad-800',
  '--sketch-glass-opacity',
  '--sketch-glint-opacity',
] as const

const LIGHT_THEME_COLOR = '#faf8f5'
const DARK_THEME_COLOR = '#151311'

/**
 * El portal es el documento de venta del taller: se ve siempre en claro, como el PDF, aunque quien
 * lo abra (por ejemplo, el dueño revisando su enlace) tenga guardado el tema oscuro. Al salir se
 * restaura el tema que corresponda.
 *
 * - `data-theme="light"` en <html> (los diálogos se montan fuera de la página y usan `dark:`).
 * - Los tokens claros quedan en línea en <html>, así ganan aunque el proveedor de tema vuelva a
 *   poner `data-theme="dark"` (cambio del tema del sistema); un observador lo devuelve a claro.
 */
export function useLightTheme(): void {
  useLayoutEffect(() => {
    const root = document.documentElement
    const meta = document.querySelector('meta[name="theme-color"]')
    const previousMeta = meta?.getAttribute('content') ?? null
    let wanted = root.dataset.theme

    root.dataset.theme = 'light'
    const light = getComputedStyle(root)
    for (const token of THEME_TOKENS) {
      const value = light.getPropertyValue(token).trim()
      if (value) root.style.setProperty(token, value)
    }
    root.style.setProperty('color-scheme', 'light')
    meta?.setAttribute('content', LIGHT_THEME_COLOR)

    const observer = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => {
      if (root.dataset.theme === 'light') return
      wanted = root.dataset.theme
      root.dataset.theme = 'light'
      meta?.setAttribute('content', LIGHT_THEME_COLOR)
    })
    observer?.observe(root, { attributes: true, attributeFilter: ['data-theme'] })

    return () => {
      observer?.disconnect()
      for (const token of THEME_TOKENS) root.style.removeProperty(token)
      root.style.removeProperty('color-scheme')
      if (wanted) root.dataset.theme = wanted
      // Mismos valores que applyTheme (lib/theme.tsx).
      if (previousMeta !== null) meta?.setAttribute('content', wanted === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR)
    }
  }, [])
}
