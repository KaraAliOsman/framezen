import type { ComponentProps, ReactNode } from 'react'
import { useId } from 'react'
import { Switch as RadixSwitch } from 'radix-ui'
import { cn } from '../lib/cn'

export interface SwitchProps extends Omit<ComponentProps<typeof RadixSwitch.Root>, 'children'> {
  /** Etiqueta a la derecha (clic en ella también cambia). */
  label?: ReactNode
  description?: ReactNode
  size?: 'sm' | 'md'
}

export function Switch({ label, description, size = 'md', className, id, ...props }: SwitchProps) {
  const autoId = useId()
  const switchId = id ?? autoId
  const control = (
    <RadixSwitch.Root
      id={switchId}
      className={cn(
        'peer relative inline-flex shrink-0 items-center rounded-full bg-track',
        'transition-colors duration-140 ease-out data-[state=checked]:bg-accent',
        'disabled:cursor-not-allowed disabled:opacity-45',
        "after:absolute after:-inset-2 after:content-['']",
        size === 'sm' ? 'h-4 w-7' : 'h-5 w-9',
        !label && className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb
        className={cn(
          'block rounded-full bg-white shadow-[0_1px_2px_rgb(21_22_29/0.25)] transition-transform duration-140 ease-out',
          'dark:bg-fg dark:data-[state=checked]:bg-fg-on-accent',
          size === 'sm'
            ? 'size-3 translate-x-0.5 data-[state=checked]:translate-x-[14px]'
            : 'size-4 translate-x-0.5 data-[state=checked]:translate-x-[18px]',
        )}
      />
    </RadixSwitch.Root>
  )
  if (!label) return control
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <div className="pt-0.5">{control}</div>
      <label htmlFor={switchId} className="min-w-0 cursor-pointer select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-60">
        <span className="block text-base text-fg">{label}</span>
        {description ? <span className="block text-table text-fg-muted">{description}</span> : null}
      </label>
    </div>
  )
}
