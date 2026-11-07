import type { ComponentProps, ReactNode } from 'react'
import { useId } from 'react'
import { Checkbox as RadixCheckbox } from 'radix-ui'
import { Check, Minus } from 'lucide-react'
import { cn } from '../lib/cn'

export interface CheckboxProps extends Omit<ComponentProps<typeof RadixCheckbox.Root>, 'children'> {
  label?: ReactNode
  description?: ReactNode
}

export function Checkbox({ label, description, className, id, ...props }: CheckboxProps) {
  const autoId = useId()
  const boxId = id ?? autoId
  const box = (
    <RadixCheckbox.Root
      id={boxId}
      className={cn(
        'peer relative inline-flex size-4 shrink-0 items-center justify-center rounded-xs border border-control bg-surface',
        'transition-[background-color,border-color,box-shadow] duration-100 ease-out hover:border-control-hover',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
        'aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-45 touch:size-5',
        // Área táctil de 32 px sin cambiar el tamaño visible.
        "after:absolute after:-inset-2 after:content-['']",
        !label && className,
      )}
      {...props}
    >
      <RadixCheckbox.Indicator className="fz-check text-fg-on-accent">
        {props.checked === 'indeterminate' ? (
          <Minus aria-hidden strokeWidth={3} className="size-3" />
        ) : (
          <Check aria-hidden strokeWidth={3} className="size-3" />
        )}
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  )
  if (!label) return box
  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <div className="pt-0.5">{box}</div>
      <label htmlFor={boxId} className="min-w-0 cursor-pointer select-none peer-disabled:cursor-not-allowed peer-disabled:opacity-60">
        <span className="block text-base text-fg">{label}</span>
        {description ? <span className="block text-table text-fg-muted">{description}</span> : null}
      </label>
    </div>
  )
}
