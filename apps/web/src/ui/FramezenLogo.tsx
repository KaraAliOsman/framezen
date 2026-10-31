import { cn } from '../lib/cn'

/**
 * Marca Framezen: marco cuadrado redondeado de pared gruesa, travesaño vertical a un tercio
 * y un trazo diagonal fino en el paño grande (el reflejo del vidrio). Una sola tinta (currentColor).
 */
export function FramezenMark({
  size = 24,
  className,
  title,
}: {
  size?: number
  className?: string
  /** Texto accesible; si se omite, la marca es decorativa. */
  title?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn('shrink-0', className)}
    >
      {/* Marco: contorno exterior menos la luz interior (pared de 4). */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M9 2h14a7 7 0 0 1 7 7v14a7 7 0 0 1-7 7H9a7 7 0 0 1-7-7V9a7 7 0 0 1 7-7Zm0.5 4A3.5 3.5 0 0 0 6 9.5v13A3.5 3.5 0 0 0 9.5 26h13a3.5 3.5 0 0 0 3.5-3.5v-13A3.5 3.5 0 0 0 22.5 6h-13Z"
      />
      {/* Travesaño a un tercio. */}
      <rect x="11.6" y="5" width="3" height="22" fill="currentColor" />
      {/* Reflejo del vidrio. */}
      <path d="M17.6 20.4 22.4 15.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

const SIZES = {
  sm: { mark: 18, text: 'text-[15px]', gap: 'gap-1.5' },
  md: { mark: 22, text: 'text-[18px]', gap: 'gap-2' },
  lg: { mark: 30, text: 'text-[25px]', gap: 'gap-2.5' },
}

/** Logotipo completo: marca + «framezen» (Instrument Sans 600, tracking −0,02 em). */
export function FramezenLogo({
  size = 'md',
  className,
  showMark = true,
}: {
  size?: keyof typeof SIZES
  className?: string
  showMark?: boolean
}) {
  const s = SIZES[size]
  return (
    <span className={cn('inline-flex items-center', s.gap, className)} aria-label="Framezen" role="img">
      {showMark ? <FramezenMark size={s.mark} /> : null}
      <span aria-hidden="true" className={cn('font-semibold leading-none tracking-[-0.02em]', s.text)}>
        framezen
      </span>
    </span>
  )
}
