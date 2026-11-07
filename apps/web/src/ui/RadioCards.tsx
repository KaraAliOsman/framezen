import type { ReactNode } from 'react'
import { RadioGroup } from 'radix-ui'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'

export interface RadioCardOption<V extends string = string> {
  value: V
  title: ReactNode
  description?: ReactNode
  icon?: LucideIcon
  /** Contenido visual libre (miniatura de plantilla, dibujo). */
  media?: ReactNode
  /** Marca a la derecha del título («Recomendado», «Pro»). */
  badge?: ReactNode
  disabled?: boolean
}

export interface RadioCardsProps<V extends string = string> {
  value: V | undefined
  onValueChange: (value: V) => void
  options: RadioCardOption<V>[]
  columns?: 1 | 2 | 3 | 4
  className?: string
  'aria-label'?: string
  'aria-labelledby'?: string
}

const cols = { 1: 'grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }

/** Opciones excluyentes con más contexto que un radio simple (plantillas, modos de precio, tipologías). */
export function RadioCards<V extends string = string>({
  value,
  onValueChange,
  options,
  columns = 2,
  className,
  ...aria
}: RadioCardsProps<V>) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(v) => onValueChange(v as V)}
      className={cn('grid grid-cols-1 gap-2', cols[columns], className)}
      {...aria}
    >
      {options.map((option) => {
        const Icon = option.icon
        return (
          <RadioGroup.Item
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className={cn(
              'group relative flex flex-col gap-2.5 rounded-md border border-divider bg-surface p-3 text-left',
              'transition-[border-color,background-color,box-shadow] duration-100 ease-out hover:border-divider-strong hover:bg-sunken',
              'data-[state=checked]:border-accent data-[state=checked]:shadow-[inset_0_0_0_1px_var(--dk-accent)]',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {option.media ? <div className="overflow-hidden rounded-[6px] bg-sunken">{option.media}</div> : null}
            <div className="flex items-start gap-2.5">
              {Icon ? (
                <Icon aria-hidden strokeWidth={1.75} className="mt-0.5 size-[18px] shrink-0 text-fg-muted group-data-[state=checked]:text-fg-strong" />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-fg-strong">{option.title}</span>
                  {option.badge}
                </div>
                {option.description ? <p className="mt-0.5 text-table text-fg-muted">{option.description}</p> : null}
              </div>
              <span
                aria-hidden
                className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-control bg-surface transition-colors duration-100 group-data-[state=checked]:border-accent group-data-[state=checked]:bg-accent"
              >
                <span className="size-1.5 scale-0 rounded-full bg-fg-on-accent transition-transform duration-140 ease-out group-data-[state=checked]:scale-100" />
              </span>
            </div>
          </RadioGroup.Item>
        )
      })}
    </RadioGroup.Root>
  )
}
