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
        'peer relative inline-flex shrink-0 items-center rounded-full border border-transparent bg-paper-350/60',
        'transition-colors duration-160 ease-out data-[state=checked]:bg-ink-600 disabled:opacity-50',
        size === 'sm' ? 'h-4 w-7' : 'h-5 w-9',
        !label && className,
      )}
      {...props}
    >
      <RadixSwitch.Thumb
        className={cn(
          'block rounded-full bg-paper-0 shadow-[0_1px_2px_rgb(31_28_24/0.2)] transition-transform duration-160 ease-out',
          'dark:bg-paper-900 dark:data-[state=checked]:bg-paper-0',
          size === 'sm'
            ? 'size-3 translate-x-0.5 data-[state=checked]:translate-x-[13px]'
            : 'size-4 translate-x-0.5 data-[state=checked]:translate-x-[17px]',
        )}
      />
    </RadixSwitch.Root>
  )
  if (!label) return control
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <div className="pt-0.5">{control}</div>
      <label htmlFor={switchId} className="min-w-0 cursor-pointer select-none">
        <span className="block text-base text-paper-900">{label}</span>
        {description ? <span className="block text-[13px] leading-[18px] text-paper-600">{description}</span> : null}
      </label>
    </div>
  )
}
