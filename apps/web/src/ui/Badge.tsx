import type { ComponentProps, ReactNode } from 'react'
import type { QuoteStatus } from '@dekopen/shared'
import { cn } from '../lib/cn'
import { getGlossary, useGlossary } from '../lib/i18n'

export type BadgeTone = 'neutral' | 'ink' | 'accent' | 'ok' | 'warn' | 'bad' | 'info' | 'okStrong' | 'outline'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-hover text-fg-muted',
  ink: 'bg-accent-subtle-strong text-fg-strong',
  accent: 'bg-accent-subtle-strong text-fg-strong',
  ok: 'bg-success-bg text-success',
  okStrong: 'bg-success-solid text-on-success-solid',
  warn: 'bg-warning-bg text-warning',
  bad: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
  outline: 'bg-transparent text-fg-muted shadow-[inset_0_0_0_1px_var(--dk-divider-strong)]',
}

export interface BadgeProps extends ComponentProps<'span'> {
  tone?: BadgeTone
  /** Punto de color a la izquierda. */
  dot?: boolean
  icon?: ReactNode
  size?: 'sm' | 'md'
}

/** Etiqueta pequeña (plan, conteo, categoría). Úsala poco: casi siempre basta el texto. */
export function Badge({ tone = 'neutral', dot, icon, size = 'md', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-xs font-medium whitespace-nowrap [&_svg]:size-3',
        size === 'sm' ? 'h-[18px] px-1.5 text-micro' : 'h-5 px-1.5 text-meta',
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot ? <span aria-hidden className="size-1.5 rounded-full bg-current" /> : null}
      {icon}
      {children}
    </span>
  )
}

/**
 * Color de cada estado de cotización: `tone` tiñe el glifo y `dot` sirve para marcas sueltas en filtros y
 * menús. Neutros los estados de trabajo (borrador, cerrada); color solo donde hay una decisión: enviada
 * (información), aceptada e instalada (éxito), en taller (aviso), rechazada (peligro).
 */
const STATUS_STYLE: Record<QuoteStatus, { tone: string; dot: string }> = {
  draft: { tone: 'text-fg-faint', dot: 'bg-transparent ring-[1.5px] ring-inset ring-fg-faint' },
  sent: { tone: 'text-info', dot: 'bg-info' },
  accepted: { tone: 'text-success', dot: 'bg-success' },
  rejected: { tone: 'text-danger', dot: 'bg-danger' },
  workshop: { tone: 'text-warning', dot: 'bg-warning-solid' },
  installed: { tone: 'text-success', dot: 'bg-success' },
  closed: { tone: 'text-fg-muted', dot: 'bg-fg-muted' },
}

/**
 * `label` se lee en el idioma actual de la interfaz (glosario `quoteStatus`) cada vez que se usa:
 * quien lo muestre en un componente debe volver a dibujarse al cambiar el idioma (cualquier
 * `useT`/`useGlossary`/`useLocale` lo hace). En componentes nuevos, preferir `useGlossary().quoteStatus(s)`.
 */
export const QUOTE_STATUS_COPY: Readonly<Record<QuoteStatus, { readonly label: string; readonly tone: string; readonly dot: string }>> =
  Object.fromEntries(
    (Object.keys(STATUS_STYLE) as QuoteStatus[]).map((status) => [
      status,
      Object.freeze({
        ...STATUS_STYLE[status],
        get label() {
          return getGlossary().quoteStatus(status)
        },
      }),
    ]),
  ) as Record<QuoteStatus, { label: string; tone: string; dot: string }>

export const QUOTE_STATUS_ORDER: QuoteStatus[] = ['draft', 'sent', 'accepted', 'workshop', 'installed', 'rejected', 'closed']

/** Anillo con avance, marca de hecho o cruz: la forma dice el estado también sin color. */
export function StatusGlyph({ status, size = 14 }: { status: QuoteStatus; size?: number }) {
  const ring = <circle cx="7" cy="7" r="5.75" stroke="currentColor" strokeWidth="1.5" />
  const shapes: Record<QuoteStatus, ReactNode> = {
    draft: <circle cx="7" cy="7" r="5.75" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.26 1.75" />,
    sent: (
      <>
        {ring}
        <path d="M7 3.5a3.5 3.5 0 0 1 0 7V3.5Z" fill="currentColor" />
      </>
    ),
    workshop: (
      <>
        {ring}
        <path d="M7 3.5a3.5 3.5 0 1 1-3.5 3.5H7V3.5Z" fill="currentColor" />
      </>
    ),
    accepted: (
      <>
        <circle cx="7" cy="7" r="6.5" fill="currentColor" />
        <path d="m4.4 7.2 1.8 1.8 3.4-3.6" stroke="var(--dk-surface)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    installed: (
      <>
        {ring}
        <path d="m4.4 7.2 1.8 1.8 3.4-3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    rejected: (
      <>
        <circle cx="7" cy="7" r="6.5" fill="currentColor" />
        <path d="m5 5 4 4m0-4-4 4" stroke="var(--dk-surface)" strokeWidth="1.5" strokeLinecap="round" />
      </>
    ),
    closed: (
      <>
        <circle cx="7" cy="7" r="6.5" fill="currentColor" />
        <path d="M4.75 7h4.5" stroke="var(--dk-surface)" strokeWidth="1.5" strokeLinecap="round" />
      </>
    ),
  }
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden className={cn('shrink-0', STATUS_STYLE[status].tone)}>
      {shapes[status]}
    </svg>
  )
}

export interface StatusPillProps {
  status: QuoteStatus
  /** Texto extra pequeño, p. ej. revisión «B». */
  suffix?: ReactNode
  size?: 'sm' | 'md'
  className?: string
}

/** Estado de cotización: glifo + texto, sin fondo (nunca solo color). Conserva el nombre por compatibilidad. */
export function StatusPill({ status, suffix, size = 'md', className }: StatusPillProps) {
  const g = useGlossary()
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap',
        size === 'sm' ? 'text-meta' : 'text-table',
        status === 'draft' || status === 'closed' ? 'text-fg-muted' : 'text-fg',
        className,
      )}
    >
      <StatusGlyph status={status} size={size === 'sm' ? 12 : 14} />
      {g.quoteStatus(status)}
      {suffix ? <span className="text-fg-muted">· {suffix}</span> : null}
    </span>
  )
}

export type StatusTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

const dotTones: Record<StatusTone, string> = {
  neutral: 'bg-fg-faint',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning-solid',
  danger: 'bg-danger',
  info: 'bg-info',
}

export interface StatusDotProps {
  tone?: StatusTone
  /** Texto que acompaña al punto (obligatorio para la accesibilidad salvo que el contexto ya lo diga). */
  children?: ReactNode
  /** Late suavemente (en curso: sincronizando, escuchando). Se detiene con movimiento reducido. */
  pulse?: boolean
  className?: string
}

/** Punto de estado + texto, para filas y barras (sin fondo). */
export function StatusDot({ tone = 'neutral', children, pulse, className }: StatusDotProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-table text-fg', className)}>
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', dotTones[tone], pulse && 'fz-breathe')} />
      {children}
    </span>
  )
}
