/**
 * Piezas visuales pequeñas del taller: número de OT tipo «talón», ref de ventana, avance y
 * fecha comprometida. Mismo lenguaje que los documentos impresos (V3 en caja, cifras tabulares).
 */
import type { ReactNode } from 'react'
import type { Station } from '@framezen/shared'
import { cn } from '../../../lib/cn'
import { formatNumber } from '../../../lib/format'
import { dueSentence, type DueInfo } from '../model/orders'
import { STATIONS, stationIndex, stationInfo } from '../model/stations'

/** Número de OT en caja, como el talón impreso: «OT» pequeño y el número grande. */
export function OrderTicket({ number, size = 'md', className }: { number: number; size?: 'sm' | 'md'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 flex-col items-center justify-center rounded-sm border-[1.5px] border-paper-900 bg-paper-0 leading-none text-paper-900 tabular',
        size === 'sm' ? 'h-9 min-w-10 px-1.5' : 'h-12 min-w-14 px-2',
        className,
      )}
      aria-label={`OT N° ${number}`}
    >
      <span className={cn('font-medium text-paper-600', size === 'sm' ? 'text-[9px]' : 'text-[10px]')}>OT</span>
      <span className={cn('font-semibold tracking-[-0.02em]', size === 'sm' ? 'text-[15px]' : 'text-[19px]')}>{number}</span>
    </span>
  )
}

/** Ref de ventana en caja: «V3». */
export function RefChip({ children, size = 'md', className }: { children: ReactNode; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[5px] border border-paper-900/80 bg-paper-0 font-semibold tracking-[-0.01em] text-paper-900 tabular',
        size === 'sm' && 'h-5 min-w-7 px-1 text-[12px]',
        size === 'md' && 'h-7 min-w-9 px-1.5 text-[14px]',
        size === 'lg' && 'h-9 min-w-11 px-2 text-[17px]',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Barra de avance de la OT (0–1). Llena = verde. */
export function ProgressBar({ ratio, className, label }: { ratio: number; className?: string; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100)
  const full = pct >= 100
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label ?? `Avance ${pct} %`}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-paper-200', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-240 ease-out', full ? 'bg-ok-600' : 'bg-ink-600')}
        style={{ width: `${Math.max(pct, pct > 0 ? 4 : 0)}%` }}
      />
    </div>
  )
}

export function percent(ratio: number): string {
  return `${formatNumber(Math.round(Math.max(0, Math.min(1, ratio)) * 100))} %`
}

/**
 * Avance de una ventana en 7 tramos (Corte → Listo): hechos en tinta, el actual a medias,
 * los que faltan en papel. Lista e instalada: todos en verde.
 */
export function StationMeter({ station, className }: { station: Station; className?: string }) {
  const current = stationIndex(station)
  const done = station === 'ready' || station === 'installed'
  const steps = STATIONS.slice(0, 7)
  return (
    <span className={cn('inline-flex items-center gap-[3px]', className)} aria-hidden>
      {steps.map((s, i) => (
        <span
          key={s.id}
          className={cn(
            'h-1.5 w-2.5 rounded-full transition-colors duration-200',
            done ? 'bg-ok-600' : i < current ? 'bg-ink-600' : i === current ? 'bg-ink-600/35' : 'bg-paper-200',
          )}
        />
      ))}
    </span>
  )
}

/** Icono + nombre de la estación. */
export function StationLabel({ station, className, iconOnly }: { station: Station; className?: string; iconOnly?: boolean }) {
  const info = stationInfo(station)
  const Icon = info.icon
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <Icon aria-hidden strokeWidth={1.75} className="size-4 shrink-0" />
      {iconOnly ? <span className="sr-only">{info.label}</span> : info.label}
    </span>
  )
}

const DUE_TONE: Record<DueInfo['tone'], string> = {
  none: 'text-paper-600',
  calm: 'text-paper-900',
  soon: 'text-warn-600',
  late: 'text-bad-600',
  done: 'text-paper-600',
}

/**
 * Fecha comprometida en palabras: «Atrasada 2 días · 12 nov». Con `sentence` se entiende sin
 * la columna «Entrega» (tarjeta del teléfono): «Entrega en 5 días».
 */
export function DueText({ due, className, compact, sentence }: { due: DueInfo; className?: string; compact?: boolean; sentence?: boolean }) {
  if (due.tone === 'none') return <span className={cn('text-paper-600', className)}>Entrega por definir</span>
  const text = sentence ? dueSentence(due) : due.tone === 'done' ? due.date : due.label
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 tabular', className)}>
      {due.tone === 'late' || due.tone === 'soon' ? (
        <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', due.tone === 'late' ? 'bg-bad-600' : 'bg-warn-600')} />
      ) : null}
      <span className={cn('truncate font-medium', DUE_TONE[due.tone])}>{text}</span>
      {!compact && due.tone !== 'done' && due.date ? <span className="shrink-0 text-paper-600">· {due.date}</span> : null}
    </span>
  )
}
