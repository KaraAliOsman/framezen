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
        'peer inline-flex size-4 shrink-0 items-center justify-center rounded-xs border border-paper-350 bg-paper-0',
        'transition-colors duration-120 ease-out hover:border-paper-600',
        'data-[state=checked]:border-ink-600 data-[state=checked]:bg-ink-600 data-[state=indeterminate]:border-ink-600 data-[state=indeterminate]:bg-ink-600',
        'disabled:opacity-50 touch:size-5',
        !label && className,
      )}
      {...props}
    >
      <RadixCheckbox.Indicator className="text-paper-0">
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
      <label htmlFor={boxId} className="min-w-0 cursor-pointer select-none">
        <span className="block text-base text-paper-900">{label}</span>
        {description ? <span className="block text-[13px] leading-[18px] text-paper-600">{description}</span> : null}
      </label>
    </div>
  )
}
