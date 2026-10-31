import { Link, isRouteErrorResponse, useLocation, useNavigate, useRouteError } from 'react-router'
import { Button, buttonClass } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { FramezenLogo } from '../ui/FramezenLogo'
import { usePageTitle } from '../lib/usePageTitle'

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-paper-50">
      <header className="flex h-14 items-center px-6">
        <Link to="/" className="rounded-sm text-paper-900" aria-label="Framezen, inicio">
          <FramezenLogo size="sm" />
        </Link>
      </header>
      <main className="grid flex-1 place-items-center px-6 pb-16">{children}</main>
    </div>
  )
}

/** 404 con salida clara. */
export function NotFound() {
  usePageTitle('Página no encontrada')
  return (
    <Frame>
      <EmptyState
        sketch="fixed"
        title="No encontramos esta página"
        description="Puede que el enlace esté incompleto o que la página se haya movido. Tus datos están a salvo."
        action={
          <Link to="/inicio" className={buttonClass('primary')}>
            Ir al inicio
          </Link>
        }
        secondary={
          <Link to="/" className={buttonClass('ghost')}>
            Conocer Framezen
          </Link>
        }
      />
    </Frame>
  )
}

function isChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /dynamically imported module|Importing a module script failed|Failed to fetch/i.test(message)
}

/**
 * Error de una pantalla dentro del shell: se muestra en el contenido y la barra lateral, la barra
 * superior y Marco siguen funcionando. El router lo olvida al cambiar de ruta; «Reintentar» vuelve a
 * entrar a la misma dirección (nueva ubicación = nuevo intento) sin recargar la app.
 */
export function ShellRouteError() {
  const error = useRouteError()
  const navigate = useNavigate()
  const location = useLocation()
  const notFound = isRouteErrorResponse(error) && error.status === 404
  const chunk = !notFound && isChunkError(error)
  usePageTitle(notFound ? 'Página no encontrada' : 'Esta pantalla no pudo abrirse')
  if (import.meta.env.DEV && !notFound) console.error(error)
  const retry = () => navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state: location.state })
  return (
    <div role="alert" className="grid min-h-full place-items-center px-4 pb-16 sm:px-6">
      <EmptyState
        sketch={notFound ? 'fixed' : 'casement'}
        title={notFound ? 'No encontramos esta página' : chunk ? 'Hay una versión nueva de Framezen' : 'Esta pantalla no pudo abrirse'}
        description={
          notFound
            ? 'Puede que el enlace esté incompleto o que la página se haya movido. Tus datos están a salvo.'
            : chunk
              ? 'Recarga para usar la última versión. No pierdes nada: todo queda guardado.'
              : 'Tus datos están a salvo. Reintenta o sigue en otra sección; si vuelve a pasar, escríbenos y lo revisamos.'
        }
        action={
          notFound ? null : chunk ? (
            <Button variant="primary" onClick={() => window.location.reload()}>
              Recargar
            </Button>
          ) : (
            <Button variant="primary" onClick={retry}>
              Reintentar
            </Button>
          )
        }
        secondary={
          location.pathname === '/inicio' ? null : (
            <Link to="/inicio" className={buttonClass(notFound ? 'primary' : 'ghost')}>
              Ir al inicio
            </Link>
          )
        }
      />
    </div>
  )
}

/** Error de ruta: explica, ofrece recargar y nunca muestra códigos. */
export function RouteError() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />
  const chunk = isChunkError(error)
  if (import.meta.env.DEV) console.error(error)
  return (
    <Frame>
      <EmptyState
        sketch="casement"
        title={chunk ? 'Hay una versión nueva de Framezen' : 'Esta pantalla no pudo abrirse'}
        description={
          chunk
            ? 'Recarga para usar la última versión. No pierdes nada: todo queda guardado.'
            : 'Tus datos están a salvo. Recarga la página; si vuelve a pasar, escríbenos y lo revisamos.'
        }
        action={
          <Button variant="primary" onClick={() => window.location.reload()}>
            Recargar
          </Button>
        }
        secondary={
          <Link to="/inicio" className={buttonClass('ghost')}>
            Ir al inicio
          </Link>
        }
      />
    </Frame>
  )
}
