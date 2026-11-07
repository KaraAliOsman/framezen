import { Link, isRouteErrorResponse, useLocation, useNavigate, useRouteError } from 'react-router'
import { RotateCcw } from 'lucide-react'
import { useOptionalSession } from '../lib/auth'
import { useT } from '../lib/i18n'
import { usePageTitle } from '../lib/usePageTitle'
import { Button, buttonClass } from '../ui/Button'
import { DekopenLogo } from '../ui/DekopenLogo'
import { EmptyState } from '../ui/EmptyState'
import es from './i18n/es'

/** Marco de las pantallas de error fuera del shell: marca arriba, el aviso al centro, sin ruido. */
function Frame({ children, code }: { children: React.ReactNode; code?: string }) {
  const t = useT(es)
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-fg">
      <header className="flex h-14 items-center justify-between px-6">
        <Link to="/" className="rounded-sm text-fg-strong" aria-label={t('routes.brandHome')}>
          <DekopenLogo size="sm" />
        </Link>
        {code ? <span className="code-id text-table text-fg-faint">{code}</span> : null}
      </header>
      <main className="grid flex-1 place-items-center px-6 pb-16">{children}</main>
    </div>
  )
}

function isChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(message)
}

/** 404 con salida clara: al inicio si hay sesión, a conocer DEKOPEN si no. */
export function NotFound() {
  const t = useT(es)
  const session = useOptionalSession()
  usePageTitle(t('routes.notFoundTitle'))
  return (
    <Frame code="404">
      <EmptyState
        headingLevel="h1"
        title={t('routes.notFound')}
        description={t('routes.notFoundText')}
        action={
          <Link to={session ? '/inicio' : '/'} className={buttonClass('primary')}>
            {session ? t('routes.goHome') : t('routes.discover')}
          </Link>
        }
        secondary={
          session ? (
            <Link to="/" className={buttonClass('ghost')}>
              {t('routes.discover')}
            </Link>
          ) : (
            <Link to="/inicio" className={buttonClass('ghost')}>
              {t('routes.goHome')}
            </Link>
          )
        }
      />
    </Frame>
  )
}

/**
 * Error de una pantalla dentro del shell: se muestra en el contenido y la barra lateral, la barra
 * superior y el asistente siguen funcionando. El router lo olvida al cambiar de ruta; «Reintentar»
 * vuelve a entrar a la misma dirección (nueva ubicación = nuevo intento) sin recargar la app.
 */
export function ShellRouteError() {
  const t = useT(es)
  const error = useRouteError()
  const navigate = useNavigate()
  const location = useLocation()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  const chunk = !notFound && isChunkError(error)
  usePageTitle(notFound ? t('routes.notFoundTitle') : t('routes.failedTitle'))
  if (import.meta.env.DEV && !notFound) console.error(error)
  const retry = () => navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: location.state })
  return (
    <div role="alert" className="grid min-h-full place-items-center px-4 pb-16 sm:px-6">
      <EmptyState
        headingLevel="h1"
        title={notFound ? t('routes.notFound') : chunk ? t('routes.newVersion') : t('routes.failedTitle')}
        description={notFound ? t('routes.notFoundText') : chunk ? t('routes.newVersionText') : t('routes.failedInShell')}
        action={
          notFound ? null : chunk ? (
            <Button variant="primary" icon={RotateCcw} onClick={() => window.location.reload()}>
              {t('routes.reload')}
            </Button>
          ) : (
            <Button variant="primary" icon={RotateCcw} onClick={retry}>
              {t('routes.retry')}
            </Button>
          )
        }
        secondary={
          location.pathname === '/inicio' ? null : (
            <Link to="/inicio" className={buttonClass(notFound ? 'primary' : 'ghost')}>
              {t('routes.goHome')}
            </Link>
          )
        }
      />
    </div>
  )
}

/** Error de ruta fuera del shell: explica, ofrece recargar y nunca muestra el detalle técnico. */
export function RouteError() {
  const t = useT(es)
  const error = useRouteError()
  usePageTitle(t('routes.failedTitle'))
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />
  const chunk = isChunkError(error)
  if (import.meta.env.DEV) console.error(error)
  return (
    <Frame>
      <EmptyState
        headingLevel="h1"
        title={chunk ? t('routes.newVersion') : t('routes.failedTitle')}
        description={chunk ? t('routes.newVersionText') : t('routes.failedRoot')}
        action={
          <Button variant="primary" icon={RotateCcw} onClick={() => window.location.reload()}>
            {t('routes.reload')}
          </Button>
        }
        secondary={
          <Link to="/inicio" className={buttonClass('ghost')}>
            {t('routes.goHome')}
          </Link>
        }
      />
    </Frame>
  )
}
