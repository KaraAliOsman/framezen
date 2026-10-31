import type { ComponentProps, ReactNode } from 'react'
import type { QuoteStatus } from '@framezen/shared'
import { cn } from '../lib/cn'

export type BadgeTone = 'neutral' | 'ink' | 'ok' | 'warn' | 'bad' | 'okStrong' | 'outline'

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-paper-100 text-paper-600 border-paper-200',
  ink: 'bg-ink-50 text-ink-700 border-ink-100',
  ok: 'bg-ok-50 text-ok-800 border-ok-600/20',
  okStrong: 'bg-ok-600 text-paper-0 border-transparent dark:text-paper-50',
  warn: 'bg-warn-50 text-warn-800 border-warn-600/25',
  bad: 'bg-bad-50 text-bad-800 border-bad-600/20',
  outline: 'bg-transparent text-paper-600 border-paper-200',
}

export interface BadgeProps extends ComponentProps<'span'> {
  tone?: BadgeTone
  /** Punto de color a la izquierda. */
  dot?: boolean
  icon?: ReactNode
  size?: 'sm' | 'md'
}

/** Etiqueta pequeña (plan, conteo, categoría). Radio 4: es un chip, no una píldora. */
export function Badge({ tone = 'neutral', dot, icon, size = 'md', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-xs border font-medium whitespace-nowrap',
        size === 'sm' ? 'h-[18px] px-1.5 text-[11px]' : 'h-5 px-1.5 text-meta',
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

/** Textos y colores de cada estado de cotización (DESIGN: borrador gris, enviada tinta…). */
export const QUOTE_STATUS_COPY: Record<QuoteStatus, { label: string; tone: string; dot: string }> = {
  draft: { label: 'Borrador', tone: 'bg-paper-100 text-paper-600', dot: 'bg-paper-350' },
  sent: { label: 'Enviada', tone: 'bg-ink-50 text-ink-700', dot: 'bg-ink-600' },
  accepted: { label: 'Aceptada', tone: 'bg-ok-50 text-ok-800', dot: 'bg-ok-600' },
  rejected: { label: 'Rechazada', tone: 'bg-bad-50 text-bad-800', dot: 'bg-bad-600' },
  workshop: { label: 'En taller', tone: 'bg-warn-50 text-warn-800', dot: 'bg-warn-600' },
  installed: { label: 'Instalada', tone: 'bg-ok-600 text-paper-0 dark:text-paper-50', dot: 'bg-paper-0/80' },
  closed: { label: 'Cerrada', tone: 'bg-paper-100 text-paper-900', dot: 'bg-paper-900' },
}

export const QUOTE_STATUS_ORDER: QuoteStatus[] = ['draft', 'sent', 'accepted', 'workshop', 'installed', 'rejected', 'closed']

export interface StatusPillProps {
  status: QuoteStatus
  /** Texto extra pequeño, p. ej. revisión «B». */
  suffix?: ReactNode
  className?: string
}

/** Píldora de estado de cotización: punto + texto (nunca solo color). */
export function StatusPill({ status, suffix, className }: StatusPillProps) {
  const copy = QUOTE_STATUS_COPY[status]
  return (
    <span
      className={cn(
        'inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full pr-2.5 pl-2 text-meta font-medium whitespace-nowrap',
        copy.tone,
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', copy.dot)} />
      {copy.label}
      {/* Mismo color que el estado (contraste AA): se distingue solo por el peso. */}
      {suffix ? <span className="font-normal">· {suffix}</span> : null}
    </span>
  )
}
