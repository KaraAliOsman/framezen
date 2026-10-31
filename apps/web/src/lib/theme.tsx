import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/** Tema claro (principal) u oscuro. Se guarda en localStorage y se aplica en <html data-theme>. */
export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'fz-theme'

interface ThemeContextValue {
  theme: ThemePreference
  resolved: ResolvedTheme
  setTheme: (theme: ThemePreference) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'dark' || stored === 'light' || stored === 'system' ? stored : 'light'
  } catch {
    return 'light'
  }
}

function systemTheme(): ResolvedTheme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement
  root.dataset.theme = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', resolved === 'dark' ? '#151311' : '#faf8f5')
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readPreference)
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme)

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!query) return
    const onChange = () => setSystem(query.matches ? 'dark' : 'light')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolved: ResolvedTheme = theme === 'system' ? system : theme

  useEffect(() => {
    applyTheme(resolved)
  }, [resolved])

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Modo privado: el tema dura la sesión.
    }
  }, [])

  const toggle = useCallback(() => setTheme(resolved === 'dark' ? 'light' : 'dark'), [resolved, setTheme])

  const value = useMemo(() => ({ theme, resolved, setTheme, toggle }), [theme, resolved, setTheme, toggle])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** Igual que useTheme, pero devuelve null fuera del proveedor (pruebas, vitrinas). */
export function useOptionalTheme(): ThemeContextValue | null {
  return useContext(ThemeContext)
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>')
  return ctx
}
