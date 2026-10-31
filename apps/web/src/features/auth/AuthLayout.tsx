import { useId, type ReactNode } from 'react'
import { Link } from 'react-router'
import { FramezenLogo, WindowSketch, type SketchKind } from '../../ui'
import { formatSize } from '../../lib/format'
import { usePageTitle } from '../../lib/usePageTitle'

export interface AuthArt {
  kind: SketchKind
  width: number
  height: number
  /** Nombre de la tipología para el rótulo del plano. */
  label: string
  /** Frase protagonista del panel. */
  phrase: ReactNode
  caption: ReactNode
}

export interface AuthLayoutProps {
  /** Título de la pestaña. */
  pageTitle: string
  title: ReactNode
  subtitle?: ReactNode
  /** Enlace arriba a la derecha («¿No tienes cuenta? Crear cuenta»). */
  aside?: ReactNode
  art: AuthArt
  children: ReactNode
}

/** Papel milimetrado muy tenue, dibujado con un patrón SVG (sin degradados). */
function DraftingGrid() {
  const id = useId()
  return (
    <svg aria-hidden className="absolute inset-0 size-full text-paper-200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id={`${id}-minor`} width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M12 0H0V12" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.55" />
        </pattern>
        <pattern id={`${id}-major`} width="60" height="60" patternUnits="userSpaceOnUse">
          <rect width="60" height="60" fill={`url(#${id}-minor)`} />
          <path d="M60 0H0V60" fill="none" stroke="currentColor" strokeWidth="0.75" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id}-major)`} />
    </svg>
  )
}

/** Acceso: formulario a la izquierda, plano de una ventana con una frase a la derecha. */
export function AuthLayout({ pageTitle, title, subtitle, aside, art, children }: AuthLayoutProps) {
  usePageTitle(pageTitle)
  return (
    <div className="grid min-h-dvh bg-paper-50 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex min-h-dvh flex-col px-6 py-5 sm:px-10">
        <header className="flex items-center justify-between gap-4">
          <Link to="/" className="rounded-sm text-paper-900" aria-label="Framezen, página principal">
            <FramezenLogo size="md" />
          </Link>
          {aside ? <div className="text-[13px] text-paper-600">{aside}</div> : null}
        </header>

        <main className="flex flex-1 items-center justify-center py-12">
          <div className="w-full max-w-[380px]">
            <h1 className="text-h2 font-semibold tracking-[-0.015em] text-paper-900">{title}</h1>
            {subtitle ? <p className="mt-1.5 text-paper-600">{subtitle}</p> : null}
            <div className="mt-8">{children}</div>
          </div>
        </main>

        <footer className="flex flex-wrap items-center justify-between gap-2 text-meta text-paper-600">
          <span>Hecho en Chile para talleres de ventanas.</span>
          <span>© {new Date().getFullYear()} Framezen</span>
        </footer>
      </div>

      <aside aria-hidden className="relative hidden overflow-hidden border-l border-paper-200 bg-paper-100 lg:block">
        <DraftingGrid />
        <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
          <div className="flex flex-1 items-center justify-center py-8">
            <WindowSketch kind={art.kind} width={art.width} height={art.height} dimensions size={360} className="text-paper-600" />
          </div>
          <div className="flex items-end justify-between gap-10">
            <div className="max-w-md">
              <p className="text-[28px] leading-[36px] font-semibold tracking-[-0.02em] text-paper-900">{art.phrase}</p>
              <p className="mt-3 text-lead text-paper-600">{art.caption}</p>
            </div>
            {/* Rótulo de plano, como en una lámina técnica. */}
            <dl className="hidden shrink-0 border border-paper-350/50 bg-paper-50/80 text-meta text-paper-600 xl:block">
              <div className="flex gap-6 border-b border-paper-350/50 px-3 py-1.5">
                <dt>Lámina</dt>
                <dd className="ml-auto font-medium text-paper-900">V1</dd>
              </div>
              <div className="flex gap-6 border-b border-paper-350/50 px-3 py-1.5">
                <dt>Tipología</dt>
                <dd className="ml-auto font-medium text-paper-900">{art.label}</dd>
              </div>
              <div className="flex gap-6 px-3 py-1.5">
                <dt>Medidas</dt>
                <dd className="ml-auto font-medium text-paper-900 tabular">{formatSize(art.width, art.height)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </aside>
    </div>
  )
}

/** Mensaje de error de formulario (no de un campo). */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <div role="alert" className="rounded-sm border border-bad-600/25 bg-bad-50 px-3 py-2.5 text-[13px] leading-[18px] text-bad-800">
      {children}
    </div>
  )
}
