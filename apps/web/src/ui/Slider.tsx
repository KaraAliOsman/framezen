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
        className="relative flex h-5 flex-1 touch-none items-center select-none data-[disabled]:opacity-50"
      >
        <RadixSlider.Track className="relative h-1 grow overflow-hidden rounded-full bg-paper-200">
          <RadixSlider.Range className="absolute h-full rounded-full bg-ink-600" />
        </RadixSlider.Track>
        <RadixSlider.Thumb
          aria-label={ariaLabel}
          className="block size-4 rounded-full border border-paper-350 bg-paper-0 shadow-[0_1px_2px_rgb(31_28_24/0.15)] transition-transform duration-120 ease-out hover:scale-110 active:scale-110 touch:size-6"
        />
      </RadixSlider.Root>
      {format ? <span className="min-w-12 text-right text-base text-paper-900 tabular">{format(value)}</span> : null}
    </div>
  )
}
