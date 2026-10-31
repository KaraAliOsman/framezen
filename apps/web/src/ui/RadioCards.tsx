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

/** Opciones excluyentes con más contexto que un radio simple (plantillas, modos de precio). */
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
              'group relative flex flex-col gap-2 rounded-md border border-paper-200 bg-paper-0 p-3 text-left',
              'transition-[border-color,background-color,box-shadow] duration-120 ease-out hover:border-paper-350',
              'data-[state=checked]:border-ink-600 data-[state=checked]:bg-ink-50/40 data-[state=checked]:shadow-[inset_0_0_0_1px_var(--ink-600)]',
              'disabled:opacity-50',
            )}
          >
            {option.media ? <div className="overflow-hidden rounded-sm">{option.media}</div> : null}
            <div className="flex items-start gap-2.5">
              {Icon ? (
                <span className="mt-px inline-flex size-8 shrink-0 items-center justify-center rounded-sm bg-paper-100 text-paper-900 group-data-[state=checked]:bg-ink-100 group-data-[state=checked]:text-ink-700">
                  <Icon aria-hidden strokeWidth={1.75} className="size-[18px]" />
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-paper-900">{option.title}</span>
                  {option.badge}
                </div>
                {option.description ? (
                  <p className="mt-0.5 text-[13px] leading-[18px] text-paper-600">{option.description}</p>
                ) : null}
              </div>
              <span
                aria-hidden
                className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-paper-350 bg-paper-0 group-data-[state=checked]:border-ink-600"
              >
                <span className="size-2 scale-0 rounded-full bg-ink-600 transition-transform duration-120 ease-out group-data-[state=checked]:scale-100" />
              </span>
            </div>
          </RadioGroup.Item>
        )
      })}
    </RadioGroup.Root>
  )
}
