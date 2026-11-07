import type { ReactNode } from 'react'
import { Select as RadixSelect } from 'radix-ui'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../lib/cn'
import { useT } from '../lib/i18n'
import es from './i18n/es'
import { fieldClass, fieldWidth } from './Input'
import { floatingClass } from './Popover'

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
  /** sm 30 · md 36 (44 táctil). */
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
  placeholder,
  id,
  disabled,
  size = 'md',
  className,
  ...aria
}: SelectProps<V>) {
  const t = useT(es)
  const selected = options.find((o) => o.value === value)
  return (
    <RadixSelect.Root value={value} onValueChange={(v) => onValueChange(v as V)} disabled={disabled}>
      <RadixSelect.Trigger
        id={id}
        {...aria}
        className={cn(
          fieldClass,
          fieldWidth(className),
          'group inline-flex items-center justify-between gap-2 px-3 text-left data-[placeholder]:text-fg-faint',
          'data-[state=open]:border-focus data-[state=open]:shadow-[0_0_0_3px_var(--dk-focus-ring)]',
          size === 'sm' ? 'h-[30px] text-table' : 'h-9 touch:h-11',
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          {selected?.leading}
          <RadixSelect.Value placeholder={placeholder ?? t('common.selectPlaceholder')}>{selected?.label}</RadixSelect.Value>
        </span>
        <RadixSelect.Icon asChild>
          <ChevronDown
            aria-hidden
            strokeWidth={1.75}
            className="size-4 shrink-0 text-fg-muted transition-transform duration-140 group-data-[state=open]:rotate-180"
          />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          className={cn(
            'fz-pop max-h-[min(var(--radix-select-content-available-height),360px)] min-w-[var(--radix-select-trigger-width)] overflow-hidden',
            floatingClass,
          )}
        >
          <RadixSelect.Viewport className="scrollbar-quiet p-1">
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="relative flex min-h-8 cursor-default select-none items-center gap-2 rounded-xs py-1 pr-8 pl-2 text-base outline-none data-[disabled]:opacity-45 data-[highlighted]:bg-hover data-[state=checked]:font-medium touch:min-h-10"
              >
                {option.leading}
                <div className="min-w-0">
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                  {option.description ? <div className="text-meta font-normal text-fg-muted">{option.description}</div> : null}
                </div>
                <RadixSelect.ItemIndicator className="absolute right-2 inline-flex text-accent">
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
