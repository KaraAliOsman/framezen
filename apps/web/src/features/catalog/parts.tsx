import type { ReactNode } from 'react'
import type { Brand, Color } from '@dekopen/engine'
import { BadgeCheck } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useFormat, useT } from '../../lib/i18n'
import { Badge, Meter, Tooltip } from '../../ui'
import es from './i18n/es'
import { completenessCopy, monogramText, type Completeness, type StateCopy } from './model/labels'
import { readinessCopy, type LineReadiness, type ReadinessState } from './model/readiness'
import { swatchImage } from './model/swatch'

/**
 * Iniciales de la marca en una placa sobria (nunca logos de terceros, ni colores por marca: el
 * nombre ya distingue). `siblings` = todas las marcas, para no repetir iniciales.
 */
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
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center bg-hover font-medium text-fg-strong select-none',
        size >= 32 ? 'rounded-sm' : 'rounded-xs',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(8, Math.round(size * 0.34)), letterSpacing: '-0.01em' }}
    >
      {monogramText(brand, siblings)}
    </span>
  )
}

/** Cobertura de precios: cuántos artículos tienen precio (medidor + porcentaje). */
export function CoverageBar({ priced, unpriced, className }: { priced: number; unpriced: number; className?: string }) {
  const t = useT(es)
  const fmt = useFormat()
  const total = priced + unpriced
  const pct = total ? Math.round((priced / total) * 100) : 0
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Meter
        value={pct}
        max={100}
        size="md"
        tone={pct >= 90 ? 'success' : pct >= 50 ? 'accent' : 'warning'}
        aria-label={t('brands.coverageLabel')}
        className="flex-1"
      />
      <span className="w-11 text-right text-meta font-medium text-fg tabular">{total ? fmt.pct(pct) : t('common.noneDash')}</span>
    </div>
  )
}

export function CompletenessBadge({ value, size = 'md', copy: given }: { value: Completeness; size?: 'sm' | 'md'; copy?: StateCopy }) {
  useT(es)
  const copy = given ?? completenessCopy(value)
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

/**
 * Muestra de color cuadrada como una muestra física: veta para los foliados, grano para los
 * texturizados y cepillado para los metalizados (ver `model/swatch`); el `hex` es el respaldo.
 */
export function Swatch({
  color,
  size = 14,
  className,
}: {
  color: (Pick<Color, 'hex' | 'name'> & { id?: string; texture?: Color['texture'] }) | undefined
  size?: number
  className?: string
}) {
  const image = color ? swatchImage({ id: color.id ?? color.name, name: color.name, hex: color.hex, texture: color.texture }) : undefined
  return (
    <span
      aria-hidden
      className={cn('relative inline-block shrink-0 overflow-hidden border border-black/15 dark:border-white/20', size >= 24 ? 'rounded-xs' : 'rounded-[2px]', className)}
      style={{
        width: size,
        height: size,
        background: image ? `center / cover no-repeat url("${image}"), ${color?.hex}` : (color?.hex ?? 'transparent'),
      }}
    >
      {/* Brillo de canto (luz arriba a la izquierda), como en los dibujos realistas. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgb(255_255_255/0.2),transparent_45%,rgb(0_0_0/0.08))]" />
    </span>
  )
}

/** Cifra corta con etiqueta (resúmenes de importación). */
export function MiniStat({ label, value, tone = 'default' }: { label: ReactNode; value: number | string; tone?: 'default' | 'warn' }) {
  const fmt = useFormat()
  return (
    <div className="flex flex-col gap-0.5">
      <span className={cn('figure text-h3 font-medium', tone === 'warn' ? 'text-warning' : 'text-fg-strong')}>
        {typeof value === 'number' ? fmt.number(value) : value}
      </span>
      <span className="text-table text-fg-muted">{label}</span>
    </div>
  )
}

/** Título de sección dentro de una pestaña. */
export function SectionTitle({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-4 gap-y-2', className)}>
      <div className="min-w-0">
        <h2 className="text-h4 font-medium text-fg-strong">{title}</h2>
        {description ? <p className="mt-1 max-w-2xl text-table text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** Chip de filtro alternable (familia, «Sin precio», «Mis precios»), con su conteo. */
export function FilterChip({ active, onClick, children, count }: { active: boolean; onClick: () => void; children: ReactNode; count?: number }) {
  const fmt = useFormat()
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm px-2 text-table whitespace-nowrap transition-colors duration-100 ease-out touch:h-10',
        active ? 'bg-accent-subtle font-medium text-accent-ink' : 'text-fg-muted hover:bg-hover hover:text-fg',
      )}
    >
      {children}
      {count !== undefined ? <span className={cn('tabular', active ? 'text-accent-ink' : 'text-fg-faint')}>{fmt.number(count)}</span> : null}
    </button>
  )
}

/** Sello «Verificada» de una línea (su estado en palabras ya lo dice el aviso de completitud). */
export function ReadinessBadge({ readiness }: { readiness: LineReadiness }) {
  const t = useT(es)
  if (readiness.level !== 'verified') return null
  return (
    <Tooltip content={t('lines.verifiedHint')}>
      <span tabIndex={0} className="inline-flex items-center gap-1 rounded-xs text-table text-fg-muted focus-visible:outline-offset-1">
        <BadgeCheck aria-hidden className="size-3.5" strokeWidth={1.75} />
        {t('lines.verified')}
      </span>
    </Tooltip>
  )
}

const READINESS_MARK: Record<ReadinessState, string> = {
  ready: 'size-2 rounded-full bg-success-solid',
  warnings: 'size-2 rounded-full border-[1.5px] border-fg-faint',
  geometry: 'h-0.5 w-2 rounded-full bg-fg-faint',
}

/** Estado de una línea en listas compactas: la forma lo dice, y el color solo marca las que están listas. */
export function ReadinessDot({ state, className }: { state: ReadinessState; className?: string }) {
  const t = useT(es)
  const copy = readinessCopy(state, t.locale)
  return (
    <span role="img" aria-label={copy.label} title={copy.label} className={cn('inline-flex size-2 shrink-0 items-center justify-center', className)}>
      <span aria-hidden className={READINESS_MARK[state]} />
    </span>
  )
}
