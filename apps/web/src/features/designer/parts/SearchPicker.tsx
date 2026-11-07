/**
 * Selector con búsqueda y grupos (líneas por marca, vidrios por tipo). Mismo aspecto que los
 * campos del kit; la lista usa cmdk con el filtro sin tildes del Combobox. `PickerList` sirve
 * también suelta dentro de un popover (barra contextual del lienzo).
 */
import { useState, type ReactNode } from 'react'
import { Command } from 'cmdk'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useT } from '../../../lib/i18n'
import es from '../i18n/es'
import { accentFilter } from '../../../ui/Combobox'
import { fieldClass, fieldWidth } from '../../../ui/Input'
import { Popover, PopoverContent, PopoverTrigger } from '../../../ui/Popover'

const SEP = String.fromCharCode(0x2063)

export interface PickerItem {
  value: string
  label: string
  /** Texto secundario (detalle). */
  hint?: string
  keywords?: string[]
  leading?: ReactNode
  /** Marca a la derecha (p. ej. «A corredera»). */
  badge?: ReactNode
}

export interface PickerGroup {
  id: string
  heading?: string
  items: PickerItem[]
}

export interface LeadingPickerItem extends PickerItem {
  onSelect: () => void
  active?: boolean
}

export interface PickerListProps {
  value: string | undefined
  onSelect: (value: string) => void
  groups: PickerGroup[]
  leadingItem?: LeadingPickerItem
  searchPlaceholder?: string
  emptyText?: string
  /** Muestra la búsqueda solo si hay más de N ítems (por defecto 6). */
  searchThreshold?: number
  autoFocus?: boolean
  className?: string
}

const itemClass = 'flex min-h-9 cursor-default items-center gap-2 rounded-xs px-2 py-1.5 text-fg data-[selected=true]:bg-hover touch:min-h-11 touch:py-2.5'

export function PickerList({
  value,
  onSelect,
  groups,
  leadingItem,
  searchPlaceholder,
  emptyText,
  searchThreshold = 6,
  autoFocus = true,
  className,
}: PickerListProps) {
  const t = useT(es)
  const [query, setQuery] = useState('')
  const total = groups.reduce((n, g) => n + g.items.length, 0)
  return (
    <Command filter={accentFilter} loop className={className}>
      {total > searchThreshold ? (
        <div className="flex items-center gap-2 border-b border-divider px-3">
          <Search aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-fg-muted" />
          <Command.Input
            autoFocus={autoFocus}
            value={query}
            onValueChange={setQuery}
            placeholder={searchPlaceholder ?? t('pickers.search')}
            className="h-10 w-full bg-transparent text-base text-fg outline-none placeholder:text-fg-faint focus-visible:outline-none touch:text-lead"
          />
        </div>
      ) : null}
      <Command.List className="scrollbar-quiet max-h-80 overflow-y-auto p-1">
        <Command.Empty className="px-2 py-3 text-table text-fg-muted">{emptyText ?? t('pickers.nothing')}</Command.Empty>
        {leadingItem && !query ? (
          <Command.Item value={`${leadingItem.label}${SEP}__leading__`} onSelect={leadingItem.onSelect} className={itemClass}>
            {leadingItem.leading}
            <span className="min-w-0 flex-1">
              <span className="block truncate">{leadingItem.label}</span>
              {leadingItem.hint ? <span className="block truncate text-meta text-fg-muted">{leadingItem.hint}</span> : null}
            </span>
            <Check aria-hidden strokeWidth={2} className={cn('size-4 shrink-0 text-accent-ink', leadingItem.active ? 'opacity-100' : 'opacity-0')} />
          </Command.Item>
        ) : null}
        {groups.map((group) => (
          <Command.Group
            key={group.id}
            heading={group.heading}
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-meta [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-muted"
          >
            {group.items.map((item) => (
              <Command.Item
                key={item.value}
                value={`${item.label}${SEP}${item.value}`}
                keywords={[group.heading ?? '', item.hint ?? '', ...(item.keywords ?? [])]}
                onSelect={() => onSelect(item.value)}
                className={itemClass}
              >
                {item.leading}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.label}</span>
                  {item.hint ? <span className="block truncate text-meta text-fg-muted">{item.hint}</span> : null}
                </span>
                {item.badge}
                <Check
                  aria-hidden
                  strokeWidth={2}
                  className={cn('size-4 shrink-0 text-accent-ink', item.value === value && !leadingItem?.active ? 'opacity-100' : 'opacity-0')}
                />
              </Command.Item>
            ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command>
  )
}

export interface SearchPickerProps {
  value: string | undefined
  onChange: (value: string) => void
  groups: PickerGroup[]
  /** Contenido del botón (si no, la etiqueta del ítem elegido). */
  display?: ReactNode
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  /** Ítem fijo al inicio (p. ej. «Igual que la ventana»). */
  leadingItem?: LeadingPickerItem
  size?: 'sm' | 'md' | 'lg'
  className?: string
  contentClassName?: string
  disabled?: boolean
  id?: string
  'aria-label'?: string
  'aria-describedby'?: string
}

export function SearchPicker({
  value,
  onChange,
  groups,
  display,
  placeholder,
  searchPlaceholder,
  emptyText,
  leadingItem,
  size = 'md',
  className,
  contentClassName,
  disabled,
  id,
  ...aria
}: SearchPickerProps) {
  const t = useT(es)
  const [open, setOpen] = useState(false)
  const selected = groups.flatMap((g) => g.items).find((i) => i.value === value)
  const height = size === 'sm' ? 'h-8 text-table touch:h-11' : size === 'lg' ? 'h-11 text-lead' : 'h-9 touch:h-11'
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          {...aria}
          className={cn(
            fieldClass,
            fieldWidth(className),
            'group inline-flex items-center justify-between gap-2 px-3 text-left',
            height,
            !selected && !display && 'text-fg-muted',
            className,
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {display ?? (
              <>
                {selected?.leading}
                <span className="truncate">{selected ? selected.label : (placeholder ?? t('pickers.choose'))}</span>
              </>
            )}
          </span>
          <ChevronsUpDown aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-fg-muted" />
        </button>
      </PopoverTrigger>
      <PopoverContent flush className={cn('w-[max(var(--radix-popover-trigger-width),300px)]', contentClassName)}>
        {open ? (
          <PickerList
            value={value}
            groups={groups}
            searchPlaceholder={searchPlaceholder}
            emptyText={emptyText}
            leadingItem={
              leadingItem
                ? {
                    ...leadingItem,
                    onSelect: () => {
                      leadingItem.onSelect()
                      setOpen(false)
                    },
                  }
                : undefined
            }
            onSelect={(v) => {
              onChange(v)
              setOpen(false)
            }}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
