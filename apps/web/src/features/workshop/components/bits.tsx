/** Piezas visuales pequeñas del taller: ref de ventana, avance y fecha comprometida. */
import type { ReactNode } from 'react'
import type { Station } from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useFormat, useGlossary, useT } from '../../../lib/i18n'
import { Meter } from '../../../ui'
import es from '../i18n/es'
import { dueSentence, type DueInfo } from '../model/orders'
import { STATIONS, stationIndex } from '../model/stations'

/** «OT N° 38» en el idioma de la interfaz. */
export function useOrderLabel(): (number: number) => string {
  const t = useT(es)
  const fmt = useFormat()
  return (number) => t('common.otNumber', { number: fmt.docNumber(number) })
}

/** Ref de ventana: «V3», en cifras tabulares y sin caja. */
export function RefChip({ children, size = 'md', className }: { children: ReactNode; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span
      className={cn(
        'code-id inline-flex shrink-0 items-center font-semibold text-fg-strong',
        size === 'sm' && 'text-table',
        size === 'md' && 'text-base',
        size === 'lg' && 'text-lead',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Barra de avance de la OT (0–1): acento mientras se fabrica, éxito al completar. */
export function ProgressBar({ ratio, className, label }: { ratio: number; className?: string; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100)
  return <Meter value={pct} max={100} tone={pct >= 100 ? 'success' : 'accent'} size="md" aria-label={label} className={className} />
}

/** «61 %» en el idioma de la interfaz. */
export function usePercent(): (ratio: number) => string {
  const fmt = useFormat()
  return (ratio) => fmt.pct(Math.round(Math.max(0, Math.min(1, ratio)) * 100))
}

/**
 * Avance de una ventana en 7 tramos (Corte → Listo): hechos en acento, el actual a medias,
 * los que faltan en gris. Lista e instalada: todos en verde de éxito.
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
            'h-1 w-3 rounded-full transition-colors duration-180',
            done ? 'bg-ok-600' : i < current ? 'bg-accent' : i === current ? 'bg-accent/35' : 'bg-track',
          )}
        />
      ))}
    </span>
  )
}

/**
 * Las etapas de una ventana como fila tocable: lo hecho en tinta, la actual marcada con su nombre,
 * lo que falta en gris. En tablet cada etapa mide 44 px de alto.
 */
export function StageTrack({ station, windowRef, disabled, onChange, className }: { station: Station; windowRef: string; disabled?: boolean; onChange: (station: Station) => void; className?: string }) {
  const t = useT(es)
  const g = useGlossary()
  const current = stationIndex(station)
  return (
    <ol className={cn('grid grid-cols-8 gap-[3px]', className)} aria-label={t('order.stationOf', { ref: windowRef })}>
      {STATIONS.map((s, i) => {
        const name = g.station(s.id)
        const on = i === current
        return (
          <li key={s.id} className="min-w-0">
            <button
              type="button"
              disabled={disabled}
              aria-current={on ? 'step' : undefined}
              aria-label={t('order.moveTo', { ref: windowRef, station: name })}
              title={name}
              onClick={() => onChange(s.id)}
              className={cn(
                'flex h-7 w-full items-center justify-center rounded-xs transition-colors duration-100 touch:h-11',
                on ? 'bg-accent text-fg-on-accent' : i < current ? 'bg-pressed text-fg-strong hover:bg-divider-strong' : 'bg-hover text-fg-faint hover:bg-pressed hover:text-fg',
                disabled && 'cursor-default',
              )}
            >
              <s.icon aria-hidden strokeWidth={1.75} className="size-4" />
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** Icono + nombre de la estación. */
export function StationLabel({ station, className, iconOnly }: { station: Station; className?: string; iconOnly?: boolean }) {
  const g = useGlossary()
  const info = STATIONS.find((s) => s.id === station) ?? STATIONS[0]!
  const Icon = info.icon
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <Icon aria-hidden strokeWidth={1.75} className="size-4 shrink-0" />
      {iconOnly ? <span className="sr-only">{g.station(station)}</span> : g.station(station)}
    </span>
  )
}

const DUE_TONE: Record<DueInfo['tone'], string> = {
  none: 'text-fg-muted',
  calm: 'text-fg',
  soon: 'text-warning',
  late: 'text-danger',
  done: 'text-fg-muted',
}

/**
 * Fecha comprometida en palabras: «Atrasada 2 días · 12 nov». Con `sentence` se entiende sin
 * la columna «Entrega» (tarjeta del teléfono): «Entrega en 5 días».
 */
export function DueText({ due, className, compact, sentence }: { due: DueInfo; className?: string; compact?: boolean; sentence?: boolean }) {
  useT(es)
  if (due.tone === 'none') return <span className={cn('text-fg-muted', className)}>{dueSentence(due)}</span>
  const text = sentence ? dueSentence(due) : due.tone === 'done' ? due.date : due.label
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 tabular', className)}>
      {due.tone === 'late' || due.tone === 'soon' ? (
        <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', due.tone === 'late' ? 'bg-danger' : 'bg-warning-solid')} />
      ) : null}
      <span className={cn('truncate font-medium', DUE_TONE[due.tone])}>{text}</span>
      {!compact && due.tone !== 'done' && due.date ? <span className="shrink-0 text-fg-muted">· {due.date}</span> : null}
    </span>
  )
}
