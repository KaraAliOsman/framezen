import type { ReactNode } from 'react'
import { Slider as RadixSlider } from 'radix-ui'
import { cn } from '../lib/cn'

export interface SliderProps {
  value: number
  onValueChange: (value: number) => void
  /** Se llama al soltar (para guardar o recalcular algo costoso). */
  onValueCommit?: (value: number) => void
  min?: number
  max?: number
  step?: number
  /** Texto del valor actual (p. ej. «40 %»). */
  format?: (value: number) => ReactNode
  disabled?: boolean
  className?: string
  id?: string
  'aria-label'?: string
}

export function Slider({
  value,
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  format,
  disabled,
  className,
  id,
  'aria-label': ariaLabel,
}: SliderProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <RadixSlider.Root
        id={id}
        value={[value]}
        onValueChange={([v]) => onValueChange(v)}
        onValueCommit={onValueCommit ? ([v]) => onValueCommit(v) : undefined}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="group relative flex h-6 flex-1 touch-none items-center select-none data-[disabled]:opacity-45"
      >
        <RadixSlider.Track className="relative h-1 grow overflow-hidden rounded-full bg-track/70">
          <RadixSlider.Range className="absolute h-full rounded-full bg-accent" />
        </RadixSlider.Track>
        <RadixSlider.Thumb
          aria-label={ariaLabel}
          className="block size-4 rounded-full border border-control bg-white shadow-[0_1px_2px_rgb(21_22_29/0.2)] transition-[transform,box-shadow] duration-100 ease-out hover:scale-110 focus-visible:shadow-[0_0_0_4px_var(--dk-focus-ring)] focus-visible:outline-none active:scale-110 touch:size-6 dark:border-transparent dark:bg-fg"
        />
      </RadixSlider.Root>
      {format ? <span className="min-w-12 text-right text-base text-fg tabular">{format(value)}</span> : null}
    </div>
  )
}
