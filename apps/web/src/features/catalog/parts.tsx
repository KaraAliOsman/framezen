import type { ReactNode } from 'react'
import type { Brand, Color } from '@framezen/engine'
import { cn } from '../../lib/cn'
import { formatNumber } from '../../lib/format'
import { Badge, Tooltip, type BadgeTone } from '../../ui'
import { BadgeCheck } from 'lucide-react'
import { COMPLETENESS_COPY, monogramText, monogramTone, type Completeness } from './model/labels'
import { READINESS_COPY, type LineReadiness, type ReadinessState } from './model/readiness'

/** Iniciales de la marca en un cuadrado sobrio (nunca logos de terceros). `siblings` = todas las marcas, para no repetir iniciales. */
export function Monogram({
  brand,
  siblings,
  size = 40,
  className,
}: {
  brand: Pick<Brand, 'id' | 'name' | 'monogram'>
  siblings?: readonly Pick<Brand, 'id' | 'name' | 'monogram'>[]
  size?: number
  className?: string
}) {
  const tone = monogramTone(brand.id)
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 items-center justify-center rounded-md font-semibold tracking-[-0.02em] select-none', className)}
      style={{
        width: size,
        height: size,
        background: tone.bg,
        color: tone.fg,
        fontSize: Math.round(size * 0.36),
        boxShadow: `inset 0 0 0 1px ${tone.fg}1f`,
      }}
    >
      {monogramText(brand, siblings)}
    </span>
  )
}

/** Barra de cobertura de precios: cuántos artículos tienen precio. */
export function CoverageBar({ priced, unpriced, className }: { priced: number; unpriced: number; className?: string }) {
  const total = priced + unpriced
  const pct = total ? Math.round((priced / total) * 100) : 0
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-paper-100"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Artículos con precio"
      >
        <div
          className={cn('absolute inset-y-0 left-0 rounded-full', pct >= 90 ? 'bg-ok-600' : pct >= 50 ? 'bg-ink-600' : 'bg-warn-600')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-10 text-right text-meta font-medium text-paper-900 tabular">{total ? `${pct} %` : '—'}</span>
    </div>
  )
}

export function CompletenessBadge({ value, size = 'md', copy: given }: { value: Completeness; size?: 'sm' | 'md'; copy?: { label: string; tone: BadgeTone; help: string } }) {
  const copy = given ?? COMPLETENESS_COPY[value]
  return (
    <Tooltip content={copy.help}>
      <span tabIndex={0} className="inline-flex rounded-xs focus-visible:outline-offset-1">
        <Badge tone={copy.tone} dot size={size}>
          {copy.label}
        </Badge>
      </span>
    </Tooltip>
  )
}

/** Muestra de color con borde (para fondos claros y colores muy claros). */
export function Swatch({ color, size = 14, className }: { color: Pick<Color, 'hex' | 'name'> | undefined; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block shrink-0 rounded-[3px]', className)}
      style={{ width: size, height: size, background: color?.hex ?? 'transparent', boxShadow: 'inset 0 0 0 1px rgb(31 28 24 / 0.18)' }}
    />
  )
}

/** Cifra corta con etiqueta (encabezados de pestaña). */
export function MiniStat({ label, value, tone = 'default' }: { label: ReactNode; value: number | string; tone?: 'default' | 'warn' }) {
  return (
    <div className="flex flex-col">
      <span className={cn('text-lead font-semibold tabular', tone === 'warn' ? 'text-warn-600' : 'text-paper-900')}>
        {typeof value === 'number' ? formatNumber(value) : value}
      </span>
      <span className="text-meta text-paper-600">{label}</span>
    </div>
  )
}

/** Título de sección dentro de una pestaña. */
export function SectionTitle({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-4 gap-y-2', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-paper-900">{title}</h2>
        {description ? <p className="mt-0.5 max-w-2xl text-[13px] leading-[18px] text-paper-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** Fragmento de texto con chip «Filtro» que se puede quitar. */
export function FilterChip({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: ReactNode; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-120',
        active ? 'border-ink-100 bg-ink-50 text-ink-700' : 'border-paper-200 bg-paper-0 text-paper-600 hover:border-paper-350/60 hover:text-paper-900',
      )}
    >
      {children}
      {count !== undefined ? <span className={cn('tabular', active ? 'text-ink-700' : 'text-paper-600')}>{formatNumber(count)}</span> : null}
    </button>
  )
}

/** Estado de una línea en palabras («Lista para cotizar», «Cotiza con avisos», «Solo medidas»). */
export function ReadinessBadge({ readiness, size = 'md' }: { readiness: LineReadiness; size?: 'sm' | 'md' }) {
  const copy = READINESS_COPY[readiness.state]
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Tooltip content={copy.help}>
        <span tabIndex={0} className="inline-flex rounded-xs focus-visible:outline-offset-1">
          <Badge tone={copy.tone} dot size={size}>
            {copy.label}
          </Badge>
        </span>
      </Tooltip>
      {readiness.level === 'verified' ? (
        <Tooltip content="Sus cortes están comprobados al 0,1 mm contra una orden de trabajo real.">
          <span tabIndex={0} className="inline-flex rounded-xs focus-visible:outline-offset-1">
            <Badge tone="outline" size={size} icon={<BadgeCheck aria-hidden className="size-3.5" strokeWidth={1.75} />}>
              Verificada en taller
            </Badge>
          </span>
        </Tooltip>
      ) : null}
    </span>
  )
}

/** Punto de color del estado de una línea (listas compactas). */
export function ReadinessDot({ state, className }: { state: ReadinessState; className?: string }) {
  const copy = READINESS_COPY[state]
  return <span role="img" aria-label={copy.label} title={copy.label} className={cn('size-2 shrink-0 rounded-full', copy.dot, className)} />
}
