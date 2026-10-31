/**
 * Sesión: la fuente de verdad es la consulta `me` (TanStack Query). Las rutas privadas usan
 * <RequireAuth>, que entrega la sesión por contexto (`useSession()` nunca es null ahí dentro).
 * Regla de producto: NUNCA redirigimos a /bienvenida ni bloqueamos por no haber terminado la
 * puesta a punto; solo pedimos entrar si no hay sesión.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { LoginBody, Me, SignupBody } from '@framezen/shared'
import { api, humanError } from './api'
import { useMe } from './hooks'
import { qk } from './queryClient'
import { FramezenMark } from '../ui/FramezenLogo'
import { Button } from '../ui/Button'

const SessionContext = createContext<Me | null>(null)

/** Sesión garantizada (solo dentro de <RequireAuth>). */
export function useSession(): Me {
  const me = useContext(SessionContext)
  if (!me) throw new Error('useSession debe usarse dentro de <RequireAuth>')
  return me
}

/** Sesión si existe (para zonas públicas como la landing o el portal). */
export function useOptionalSession(): Me | null {
  const fromContext = useContext(SessionContext)
  const { data } = useMe()
  return fromContext ?? data ?? null
}

/** Solo rutas internas: evita redirecciones abiertas a otros dominios. */
export function safeNext(next: string | null | undefined, fallback = '/inicio'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback
  return next
}

function SessionSplash() {
  // Aparece solo si la carga demora; así no parpadea en conexiones rápidas.
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 250)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true" aria-live="polite">
      <div
        className="flex flex-col items-center gap-3 text-paper-600 transition-opacity duration-200"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <FramezenMark size={28} className="fz-breathe text-paper-900" />
        <span className="text-meta">Abriendo tu taller…</span>
      </div>
    </div>
  )
}

function ConnectionProblem({ message, onRetry, busy }: { message: string; onRetry: () => void; busy: boolean }) {
  return (
    <div className="grid min-h-dvh place-items-center px-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <FramezenMark size={28} className="text-paper-900" />
        <div className="space-y-1">
          <h1 className="text-h3 font-semibold tracking-[-0.01em]">No pudimos abrir tu cuenta</h1>
          <p className="text-paper-600">{message}</p>
        </div>
        <Button variant="secondary" onClick={onRetry} loading={busy}>
          Reintentar
        </Button>
      </div>
    </div>
  )
}

/** Protege rutas privadas. Nunca exige onboarding. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const me = useMe()
  const location = useLocation()
  if (me.data) {
    return <SessionContext.Provider value={me.data}>{children ?? <Outlet />}</SessionContext.Provider>
  }
  if (me.isPending) return <SessionSplash />
  if (me.isError) {
    return <ConnectionProblem message={humanError(me.error)} onRetry={() => void me.refetch()} busy={me.isFetching} />
  }
  const next = `${location.pathname}${location.search}`
  return <Navigate to={`/entrar?next=${encodeURIComponent(next)}`} replace />
}

/** Rutas de acceso: si ya hay sesión, vamos directo a donde corresponde. */
export function GuestOnly({ children }: { children?: ReactNode }) {
  const me = useMe()
  const [params] = useSearchParams()
  if (me.data) return <Navigate to={safeNext(params.get('next'))} replace />
  return <>{children ?? <Outlet />}</>
}

export function useLogin() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: LoginBody) => api.auth.login(body),
    onSuccess: (me) => client.setQueryData(qk.me, me),
  })
}

export function useSignup() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: SignupBody) => api.auth.signup(body),
    onSuccess: (me) => client.setQueryData(qk.me, me),
  })
}

export function useResetPassword() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ token, password }: { token: string; password: string }) => api.auth.reset(token, password),
    onSuccess: (me) => {
      if (me) client.setQueryData(qk.me, me)
    },
  })
}

export function useAcceptInvitation() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ token, ...body }: { token: string; name: string; email: string; password: string }) =>
      api.auth.acceptInvitation(token, body),
    onSuccess: (me) => client.setQueryData(qk.me, me),
  })
}

/** Cierra sesión. Aunque falle la red, limpiamos todo localmente. */
export function useLogout() {
  const client = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: () => api.auth.logout().catch(() => undefined),
    onSettled: () => {
      client.clear()
      client.setQueryData(qk.me, null)
      navigate('/entrar', { replace: true })
    },
  })
}
