import { lazy, Suspense, useSyncExternalStore, type ReactNode } from 'react'
import { Link } from 'react-router'
import { CircleAlert } from 'lucide-react'
import { LanguageSelect } from '../../app/shell/LanguageMenu'
import { useT } from '../../lib/i18n'
import { usePageTitle } from '../../lib/usePageTitle'
import { DekopenLogo } from '../../ui'
import type { AuthArtSpec } from './AuthArt'
import es from './i18n/es'

export type { AuthArtSpec } from './AuthArt'

const AuthArt = lazy(() => import('./AuthArt'))

const WIDE_QUERY = '(min-width: 1024px)'

/** ¿Pantalla ancha (≥ 1024 px)? El panel con el dibujo solo se descarga y dibuja ahí. */
function useWide(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
      const query = window.matchMedia(WIDE_QUERY)
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    },
    () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(WIDE_QUERY).matches : false),
    () => false,
  )
}

export interface AuthLayoutProps {
  /** Título de la pestaña. */
  pageTitle: string
  title: ReactNode
  subtitle?: ReactNode
  /** Enlace bajo el formulario («¿No tienes cuenta? Crear cuenta»). */
  aside?: ReactNode
  art: AuthArtSpec
  children: ReactNode
}

/**
 * Acceso: formulario angosto y centrado a la izquierda, con una sola primaria de ancho completo; a
 * la derecha, sobre el marco, una ventana real a gran tamaño y nada más. Teléfono: una columna.
 */
export function AuthLayout({ pageTitle, title, subtitle, aside, art, children }: AuthLayoutProps) {
  const t = useT(es)
  const wide = useWide()
  usePageTitle(pageTitle)
  return (
    <div className="grid min-h-dvh bg-canvas text-fg lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex min-h-dvh flex-col px-6 py-5 sm:px-10">
        <header className="flex items-center justify-between gap-4">
          <Link to="/" className="rounded-sm text-fg-strong" aria-label={t('layout.home')}>
            <DekopenLogo size="md" />
          </Link>
          <LanguageSelect />
        </header>

        <main className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[360px]">
            <h1 className="font-display text-h1 font-medium text-fg-strong">{title}</h1>
            {subtitle ? <p className="mt-2 text-base text-fg-muted">{subtitle}</p> : null}
            <div className="mt-8">{children}</div>
            {aside ? <p className="mt-6 text-table text-fg-muted">{aside}</p> : null}
          </div>
        </main>

        <footer className="text-meta text-fg-muted">{t('layout.copyright', { year: new Date().getFullYear() })}</footer>
      </div>

      <aside data-frame aria-hidden className="relative hidden overflow-hidden bg-frame lg:block">
        {wide ? (
          <Suspense fallback={null}>
            <AuthArt art={art} />
          </Suspense>
        ) : null}
      </aside>
    </div>
  )
}

/** Mensaje de error de formulario (no de un campo): qué pasó y cómo seguir. */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-control bg-danger-bg px-3 py-2.5 text-table text-fg">
      <CircleAlert aria-hidden strokeWidth={2} className="mt-0.5 size-3.5 shrink-0 text-danger" />
      <span className="min-w-0">{children}</span>
    </div>
  )
}
