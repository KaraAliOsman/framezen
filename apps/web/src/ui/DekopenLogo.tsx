import { cn } from '../lib/cn'
import { MARK_JAMB, MARK_LEAF, MARK_VIEWBOX, TILE_RADIUS, WORDMARK_HEIGHT, WORDMARK_PATH, WORDMARK_WIDTH } from '../brand/logo'
import { BRAND_COLORS } from '../brand/tokens'

export type LogoTone = 'brand' | 'mono'

export interface DekopenMarkProps {
  size?: number
  className?: string
  /** Texto accesible; si se omite, la marca es decorativa. */
  title?: string
  /** 'brand' = jamba y hoja en tinta sobre la placa amarilla · 'mono' = una sola tinta (currentColor), sin placa. */
  tone?: LogoTone
  /** Fuerza la placa (ícono de la app, favicon). Con tone="mono" la placa toma currentColor. */
  tile?: boolean
}

/** Marca DEKOPEN «Hoja abierta»: la jamba y la hoja que abre. Se lee a 16 px y a cualquier tamaño. */
export function DekopenMark({ size = 24, className, title, tone = 'brand', tile = false }: DekopenMarkProps) {
  const withTile = tile || tone === 'brand'
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`}
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn('shrink-0', className)}
    >
      {withTile ? (
        <>
          <rect width="32" height="32" rx={TILE_RADIUS} fill={tone === 'brand' ? BRAND_COLORS.signal : 'currentColor'} />
          <g transform="translate(16 16) scale(0.74) translate(-16 -16)" fill={BRAND_COLORS.ink}>
            <path d={MARK_JAMB} />
            <path d={MARK_LEAF} />
          </g>
        </>
      ) : (
        <g fill="currentColor">
          <path d={MARK_JAMB} />
          <path d={MARK_LEAF} />
        </g>
      )}
    </svg>
  )
}

export interface DekopenWordmarkProps {
  /** Altura de caja en px (la altura de las mayúsculas). */
  height?: number
  className?: string
  /** Sin efecto: se conserva para no romper usos anteriores. */
  accentEdge?: boolean
}

/** Logotipo DEKOPEN dibujado (no depende de la fuente cargada). Una tinta: currentColor. */
export function DekopenWordmark({ height = 14, className }: DekopenWordmarkProps) {
  const width = (height * WORDMARK_WIDTH) / WORDMARK_HEIGHT
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${WORDMARK_WIDTH} ${WORDMARK_HEIGHT}`}
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      <path d={WORDMARK_PATH} fill="currentColor" />
    </svg>
  )
}

const SIZES = {
  sm: { cap: 11, mark: 18, gap: 'gap-1.5' },
  md: { cap: 13, mark: 22, gap: 'gap-2' },
  lg: { cap: 18, mark: 30, gap: 'gap-2.5' },
}

export interface DekopenLogoProps {
  size?: keyof typeof SIZES
  className?: string
  showMark?: boolean
  tone?: LogoTone
  /** Sin efecto: se conserva para no romper usos anteriores. */
  accentEdge?: boolean
}

/** Logotipo completo: placa amarilla + DEKOPEN. `tone="mono"` lo deja todo en una tinta. */
export function DekopenLogo({ size = 'md', className, showMark = true, tone = 'brand' }: DekopenLogoProps) {
  const s = SIZES[size]
  return (
    <span className={cn('inline-flex items-center', s.gap, className)} aria-label="DEKOPEN" role="img">
      {showMark ? <DekopenMark size={s.mark} tone={tone} /> : null}
      <DekopenWordmark height={s.cap} />
    </span>
  )
}
