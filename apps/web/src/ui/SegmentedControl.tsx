import { useId, type ReactNode } from 'react'
import { ToggleGroup } from 'radix-ui'
import { motion } from 'motion/react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'

export interface SegmentOption<V extends string = string> {
  value: V
  label: ReactNode
  icon?: LucideIcon
  disabled?: boolean
}

export interface SegmentedControlProps<V extends string = string> {
  value: V
  onValueChange: (value: V) => void
  options: SegmentOption<V>[]
  size?: 'sm' | 'md'
  /** Ocupa todo el ancho, segmentos iguales. */
  block?: boolean
  className?: string
  'aria-label': string
}

/** Selector de 2–5 opciones excluyentes («Diseño | Documento»). */
export function SegmentedControl<V extends string = string>({
  value,
  onValueChange,
  options,
  size = 'md',
  block,
  className,
  'aria-label': ariaLabel,
}: SegmentedControlProps<V>) {
  const layoutId = useId()
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) onValueChange(v as V) // nunca queda vacío
      }}
      aria-label={ariaLabel}
      className={cn(
        'relative inline-flex items-center gap-0.5 rounded-sm border border-paper-200 bg-paper-100 p-0.5',
        block && 'flex w-full',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value
        const Icon = option.icon
        return (
          <ToggleGroup.Item
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className={cn(
              'relative inline-flex items-center justify-center gap-1.5 rounded-[5px] px-3 font-medium whitespace-nowrap',
              'transition-colors duration-120 ease-out disabled:opacity-50',
              size === 'sm' ? 'h-6 text-[13px]' : 'h-7 text-base touch:h-9',
              block && 'flex-1',
              active ? 'text-paper-900' : 'text-paper-600 hover:text-paper-900',
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
                className="absolute inset-0 rounded-[5px] border border-paper-200 bg-paper-0 shadow-[0_1px_1px_rgb(31_28_24/0.06)]"
                aria-hidden
              />
            ) : null}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {Icon ? <Icon aria-hidden strokeWidth={1.75} className="size-4" /> : null}
              {option.label}
            </span>
          </ToggleGroup.Item>
        )
      })}
    </ToggleGroup.Root>
  )
}
