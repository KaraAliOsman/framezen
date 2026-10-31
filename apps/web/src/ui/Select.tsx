import type { ReactNode } from 'react'
import { Select as RadixSelect } from 'radix-ui'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../lib/cn'
import { fieldClass, fieldWidth } from './Input'

export interface SelectOption<V extends string = string> {
  value: V
  label: ReactNode
  /** Texto secundario dentro del menú. */
  description?: ReactNode
  /** Elemento a la izquierda (muestra de color, icono). */
  leading?: ReactNode
  disabled?: boolean
}

export interface SelectProps<V extends string = string> {
  value: V | undefined
  onValueChange: (value: V) => void
  options: SelectOption<V>[]
  placeholder?: string
  id?: string
  disabled?: boolean
  size?: 'sm' | 'md'
  className?: string
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

/** Lista desplegable accesible (Radix). Para listas largas con búsqueda usa Combobox. */
export function Select<V extends string = string>({
  value,
  onValueChange,
  options,
  placeholder = 'Elige una opción',
  id,
  disabled,
  size = 'md',
  className,
  ...aria
}: SelectProps<V>) {
  const selected = options.find((o) => o.value === value)
  return (
    <RadixSelect.Root value={value} onValueChange={(v) => onValueChange(v as V)} disabled={disabled}>
      <RadixSelect.Trigger
        id={id}
        {...aria}
        className={cn(
          fieldClass,
          fieldWidth(className),
          'group inline-flex items-center justify-between gap-2 px-3 text-left data-[placeholder]:text-paper-600',
          size === 'sm' ? 'h-7 text-[13px]' : 'h-9 touch:h-11',
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          {selected?.leading}
          <RadixSelect.Value placeholder={placeholder}>{selected?.label}</RadixSelect.Value>
        </span>
        <RadixSelect.Icon asChild>
          <ChevronDown
            aria-hidden
            strokeWidth={1.75}
            className="size-4 shrink-0 text-paper-600 transition-transform duration-160 group-data-[state=open]:rotate-180"
          />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          className="fz-pop z-50 max-h-[min(var(--radix-select-content-available-height),360px)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-paper-200 bg-paper-0 shadow-float"
        >
          <RadixSelect.Viewport className="scrollbar-quiet p-1">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="relative flex cursor-default select-none items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-base outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-paper-100"
              >
                {option.leading}
                <div className="min-w-0">
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                  {option.description ? (
                    <div className="text-meta text-paper-600">{option.description}</div>
                  ) : null}
                </div>
                <RadixSelect.ItemIndicator className="absolute right-2 inline-flex text-ink-600">
                  <Check aria-hidden className="size-4" strokeWidth={2} />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
}
