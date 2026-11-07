import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ToggleGroup } from 'radix-ui'
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
  /** sm 26 · md 30 (34 con el riel) · lg 36. */
  size?: 'sm' | 'md' | 'lg'
  /** Ocupa todo el ancho, segmentos iguales. */
  block?: boolean
  className?: string
  'aria-label': string
}

const itemSizes = {
  sm: 'h-[22px] px-2.5 text-table [&_svg]:size-3.5',
  md: 'h-[30px] px-3 text-base [&_svg]:size-4 touch:h-10',
  lg: 'h-8 px-3.5 text-base [&_svg]:size-4 touch:h-10',
}

/** Selector de 2–5 opciones excluyentes («Diseño | Documento», «Interior | Exterior»). */
export function SegmentedControl<V extends string = string>({
  value,
  onValueChange,
  options,
  size = 'md',
  block,
  className,
  'aria-label': ariaLabel,
}: SegmentedControlProps<V>) {
  // Una sola pastilla que se desliza: CSS puro, para que el portal no cargue una librería de animación.
  const rootRef = useRef<HTMLDivElement>(null)
  const [thumb, setThumb] = useState<{ x: number; width: number; animate: boolean } | null>(null)
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const measure = (animate: boolean) => {
      const item = root.querySelector<HTMLElement>('[data-state="on"]')
      if (!item) return setThumb(null)
      const next = { x: item.offsetLeft, width: item.offsetWidth }
      setThumb((prev) => (prev && prev.x === next.x && prev.width === next.width ? prev : { ...next, animate: animate && prev !== null }))
    }
    measure(true)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measure(false))
    observer.observe(root)
    return () => observer.disconnect()
  }, [value, options.length])
  return (
    <ToggleGroup.Root
      ref={rootRef}
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) onValueChange(v as V) // nunca queda vacío
      }}
      aria-label={ariaLabel}
      className={cn(
        'relative inline-flex items-center gap-0.5 rounded-sm bg-pressed/70 p-0.5',
        block && 'flex w-full',
        className,
      )}
    >
      {thumb ? (
        <span
          aria-hidden
          data-thumb=""
          className={cn('absolute top-0.5 bottom-0.5 left-0 rounded-[6px] bg-thumb shadow-raised', thumb.animate && 'transition-[transform,width] duration-[160ms] ease-[cubic-bezier(0.2,0,0,1)]')}
          style={{ width: thumb.width, transform: `translateX(${thumb.x}px)` }}
        />
      ) : null}
      {options.map((option) => {
        const active = option.value === value
        const Icon = option.icon
        return (
          <ToggleGroup.Item
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className={cn(
              'relative inline-flex items-center justify-center gap-1.5 rounded-[6px] font-medium whitespace-nowrap',
              'transition-colors duration-100 ease-out focus-visible:outline-offset-0 disabled:opacity-45',
              itemSizes[size],
              block && 'flex-1',
              active ? 'text-fg-strong' : 'text-fg-muted hover:text-fg',
            )}
          >
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {Icon ? <Icon aria-hidden strokeWidth={1.75} /> : null}
              {option.label}
            </span>
          </ToggleGroup.Item>
        )
      })}
    </ToggleGroup.Root>
  )
}
