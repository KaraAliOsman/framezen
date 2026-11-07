import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { THEME_META_COLOR } from '../brand/tokens'

/**
 * Tema de la interfaz: Original (el oficial y el predeterminado), Blanco, Oscuro o el del sistema.
 * Se guarda en localStorage y se aplica en <html data-theme>. El sistema solo sabe de claro y oscuro,
 * así que «Como el sistema» elige entre Blanco y Oscuro.
 */
export type ThemePreference = 'original' | 'light' | 'dark' | 'system'
export type ResolvedTheme = 'original' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'fz-theme'
/** Quien nunca eligió (cuentas nuevas y antiguas sin preferencia guardada) ve el tema oficial. */
export const DEFAULT_THEME = 'original' satisfies ThemePreference
/** Orden en que se ofrecen en Ajustes, en el menú de cuenta y en la paleta. */
export const THEME_CHOICES = ['original', 'light', 'dark', 'system'] as const satisfies readonly ThemePreference[]

interface ThemeContextValue {
  theme: ThemePreference
  resolved: ResolvedTheme
  setTheme: (theme: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function isThemePreference(value: unknown): value is ThemePreference {
  return (THEME_CHOICES as readonly unknown[]).includes(value)
}

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return isThemePreference(stored) ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

function systemTheme(): 'light' | 'dark' {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** La landing y el portal del cliente no son la app: se ven siempre como fueron diseñados. */
export function isPublicPath(pathname: string): boolean {
  return pathname === '/' || pathname.startsWith('/c/')
}

export function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement
  root.dataset.theme = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', THEME_META_COLOR[resolved])
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(readPreference)
  const [system, setSystem] = useState<'light' | 'dark'>(systemTheme)

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!query) return
    const onChange = () => setSystem(query.matches ? 'dark' : 'light')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolved: ResolvedTheme = theme === 'system' ? system : theme

  useEffect(() => {
    applyTheme(resolved === 'original' && isPublicPath(window.location.pathname) ? 'light' : resolved)
  }, [resolved])

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Modo privado: el tema dura la sesión.
    }
  }, [])

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme])
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

/**
 * Para la landing: con Original vigente se ve en Blanco y, al salir, vuelve el tema de la persona.
 * Devuelve el `data-theme` para su contenedor (los menús se montan fuera y leen <html>).
 */
export function useLandingTheme(): 'light' | undefined {
  const resolved = useOptionalTheme()?.resolved
  const forced = resolved === 'original'
  useLayoutEffect(() => {
    if (!forced) return
    applyTheme('light')
    return () => applyTheme('original')
  }, [forced])
  return forced ? 'light' : undefined
}
