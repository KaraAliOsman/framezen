/**
 * Rutas de Framezen (docs/SPEC.md §4). Todas las páginas se cargan bajo demanda.
 * Las de funcionalidades viven en src/features/<área>/ (la ola 2 reemplaza sus contenidos).
 */
import { lazy, Suspense, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react'
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { GuestOnly, RequireAuth } from '../lib/auth'
import { PageFallback } from './shell/PageFallback'
import { NotFound, RouteError, ShellRouteError } from './RouteStates'

// Shell de la app privada: no se descarga en la landing ni en el portal.
const AppShell = lazy(() => import('./shell/AppShell'))

// Zonas de otros equipos (export default).
const LandingPage = lazy(() => import('../features/landing/LandingPage'))
const MarcoShowcase = lazy(() => import('../features/assistant/avatar/MarcoShowcase'))
const Viewer3DShowcase = lazy(() => import('../features/viewer3d/Viewer3DShowcase'))
const DesignerPlayground = lazy(() => import('../features/designer/DesignerPlayground'))

// Acceso.
const LoginPage = lazy(() => import('../features/auth/LoginPage'))
const SignupPage = lazy(() => import('../features/auth/SignupPage'))
const ForgotPasswordPage = lazy(() => import('../features/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('../features/auth/ResetPasswordPage'))
const InvitationPage = lazy(() => import('../features/auth/InvitationPage'))

// Funcionalidades (ola 2).
const WelcomePage = lazy(() => import('../features/onboarding/WelcomePage'))
const HomePage = lazy(() => import('../features/home/HomePage'))
const QuotesPage = lazy(() => import('../features/quotes/QuotesPage'))
const QuoteEditorPage = lazy(() => import('../features/quotes/QuoteEditorPage'))
const ClientsPage = lazy(() => import('../features/clients/ClientsPage'))
const ClientDetailPage = lazy(() => import('../features/clients/ClientDetailPage'))
const WorkshopPage = lazy(() => import('../features/workshop/WorkshopPage'))
const WorkOrderPage = lazy(() => import('../features/workshop/WorkOrderPage'))
const CatalogPage = lazy(() => import('../features/catalog/CatalogPage'))
const DocumentsPage = lazy(() => import('../features/documents/DocumentsPage'))
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'))
const PortalPage = lazy(() => import('../features/portal/PortalPage'))

// Vitrina de componentes.
const UiShowcase = lazy(() => import('../features/dev/UiShowcase'))

/** Pantalla completa (fuera del shell): sin indicador para no parpadear. */
function Full({ page: Page }: { page: LazyExoticComponent<ComponentType> }): ReactNode {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-paper-50" />}>
      <Page />
    </Suspense>
  )
}

/** Dentro del shell el Suspense ya existe; aquí solo envolvemos por claridad. */
function InShell({ page: Page }: { page: LazyExoticComponent<ComponentType> }): ReactNode {
  return (
    <Suspense fallback={<PageFallback />}>
      <Page />
    </Suspense>
  )
}

export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      // Pública.
      { path: '/', element: <Full page={LandingPage} /> },
      { path: '/c/:token', element: <Full page={PortalPage} /> },

      // Acceso (si ya hay sesión, va directo a /inicio).
      {
        element: <GuestOnly />,
        children: [
          { path: '/entrar', element: <Full page={LoginPage} /> },
          { path: '/crear-cuenta', element: <Full page={SignupPage} /> },
          { path: '/recuperar', element: <Full page={ForgotPasswordPage} /> },
        ],
      },
      // Enlaces de correo: funcionan con o sin sesión.
      { path: '/restablecer/:token', element: <Full page={ResetPasswordPage} /> },
      { path: '/invitacion/:token', element: <Full page={InvitationPage} /> },

      // Privadas: piden sesión, nunca exigen terminar la puesta a punto.
      {
        element: <RequireAuth />,
        children: [
          { path: '/bienvenida', element: <Full page={WelcomePage} /> },
          {
            element: (
              <Suspense fallback={<div className="min-h-dvh bg-paper-50" />}>
                <AppShell />
              </Suspense>
            ),
            children: [
              {
                // Límite de errores DENTRO del <Outlet/> del shell: si una pantalla falla al dibujarse
                // se pierde solo el contenido; la barra lateral, la superior y Marco siguen en pie.
                // El router lo reinicia al cambiar de ruta.
                errorElement: <ShellRouteError />,
                children: [
                  { path: '/inicio', element: <InShell page={HomePage} /> },
                  { path: '/cotizaciones', element: <InShell page={QuotesPage} /> },
                  { path: '/cotizaciones/:id', element: <InShell page={QuoteEditorPage} /> },
                  { path: '/clientes', element: <InShell page={ClientsPage} /> },
                  { path: '/clientes/:id', element: <InShell page={ClientDetailPage} /> },
                  { path: '/taller', element: <InShell page={WorkshopPage} /> },
                  { path: '/taller/:id', element: <InShell page={WorkOrderPage} /> },
                  { path: '/catalogo', element: <InShell page={CatalogPage} /> },
                  { path: '/documentos', element: <InShell page={DocumentsPage} /> },
                  { path: '/ajustes', element: <Navigate to="/ajustes/empresa" replace /> },
                  { path: '/ajustes/:section', element: <InShell page={SettingsPage} /> },
                ],
              },
            ],
          },
        ],
      },

      // Desarrollo y vitrinas.
      { path: '/dev/ui', element: <Full page={UiShowcase} /> },
      { path: '/dev/marco', element: <Full page={MarcoShowcase} /> },
      { path: '/dev/3d', element: <Full page={Viewer3DShowcase} /> },
      { path: '/dev/designer', element: <Full page={DesignerPlayground} /> },

      { path: '*', element: <NotFound /> },
    ],
  },
]

export function createAppRouter() {
  return createBrowserRouter(routes)
}
