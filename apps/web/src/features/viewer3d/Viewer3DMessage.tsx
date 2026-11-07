import clsx from 'clsx'
import { useT } from '../../lib/i18n'
import es from './i18n/es'

/** Dibujo de ventana en trazo fino (marco, travesaño a un tercio y reflejo). */
function WindowGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden>
      <rect x="7" y="5" width="34" height="38" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="9" width="26" height="30" rx="1" stroke="currentColor" strokeWidth="1" />
      <path d="M20 9v30" stroke="currentColor" strokeWidth="1" />
      <path d="M25 22l6-6M27 27l6-6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity=".55" />
    </svg>
  )
}

/** Mensaje cuando el navegador no puede dibujar en 3D. Nunca bloquea: el resto sigue igual. */
export function Viewer3DUnavailable({ className }: { className?: string }) {
  const t = useT(es)
  return (
    <div role="status" className={clsx('flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center', className)}>
      <WindowGlyph className="h-10 w-10 text-fg-faint" />
      <p className="text-base font-medium text-fg-strong">{t('unavailable.title')}</p>
      <p className="max-w-[36ch] text-table text-fg-muted">{t('unavailable.body')}</p>
    </div>
  )
}

/** Lugar reservado mientras carga el visor (bloque quieto, sin brillo). */
export function Viewer3DPlaceholder({ className, height = 420 }: { className?: string; height?: number | string }) {
  const t = useT(es)
  return (
    <div
      className={clsx('relative isolate flex items-center justify-center overflow-hidden bg-canvas', className)}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-2 text-fg-muted">
        <WindowGlyph className="h-9 w-9 text-fg-faint" />
        <span className="text-meta">{t('loading')}</span>
      </div>
    </div>
  )
}
