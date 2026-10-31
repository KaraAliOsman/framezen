import { useMemo, useState, type ReactNode } from 'react'
import { Command } from 'cmdk'
import { Check, ChevronsUpDown, Plus, Search } from 'lucide-react'
import { cn } from '../lib/cn'
import { normalizeSearch } from '../lib/format'
import { fieldClass, fieldWidth } from './Input'
import { Popover, PopoverContent, PopoverTrigger } from './Popover'

export interface ComboboxOption {
  value: string
  label: string
  /** Texto secundario (RUT, ciudad, código). */
  hint?: string
  /** Palabras extra para buscar. */
  keywords?: string[]
  leading?: ReactNode
}

export interface ComboboxProps {
  value: string | undefined
  onChange: (value: string | undefined) => void
  options: ComboboxOption[]
  /** Si existe, ofrece «Crear "…"» con lo escrito. Puede devolver una promesa. */
  onCreate?: (query: string) => void | Promise<void>
  /** Texto del botón de crear: «Crear cliente "Ana"». */
  createLabel?: (query: string) => ReactNode
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: ReactNode
  /** Permite quitar la selección. */
  clearable?: boolean
  clearLabel?: string
  disabled?: boolean
  id?: string
  className?: string
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}

/** Separa la etiqueta visible del id dentro del `value` de cmdk (el id no se busca). */
export const ID_SEPARATOR = String.fromCharCode(0x2063)

/** Filtro de cmdk tolerante a tildes: «perez» encuentra «Pérez». */
export function accentFilter(value: string, search: string, keywords?: string[]): number {
  const label = value.split(ID_SEPARATOR)[0]
  const haystack = normalizeSearch([label, ...(keywords ?? [])].join(' '))
  const terms = normalizeSearch(search).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return 1
  if (!terms.every((t) => haystack.includes(t))) return 0
  return haystack.startsWith(terms[0]) ? 1 : 0.6
}

/** Búsqueda + selección con «crear…» en línea (crear sin salir del flujo). */
export function Combobox({
  value,
  onChange,
  options,
  onCreate,
  createLabel = (q) => (
    <>
      Crear <span className="font-medium">«{q}»</span>
    </>
  ),
  placeholder = 'Elige o escribe…',
  searchPlaceholder = 'Buscar…',
  emptyText = 'Sin coincidencias.',
  clearable = false,
  clearLabel = 'Quitar selección',
  disabled,
  id,
  className,
  ...aria
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const selected = options.find((o) => o.value === value)
  const trimmed = query.trim()
  const exact = useMemo(
    () => options.some((o) => normalizeSearch(o.label) === normalizeSearch(trimmed)),
    [options, trimmed],
  )

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const create = async () => {
    if (!onCreate || !trimmed) return
    setCreating(true)
    try {
      await onCreate(trimmed)
      close()
    } finally {
      setCreating(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          {...aria}
          className={cn(
            fieldClass,
            fieldWidth(className),
            'inline-flex h-9 items-center justify-between gap-2 px-3 text-left touch:h-11',
            !selected && 'text-paper-600',
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected?.leading}
            <span className="truncate">{selected ? selected.label : placeholder}</span>
          </span>
          <ChevronsUpDown aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-paper-600" />
        </button>
      </PopoverTrigger>
      <PopoverContent flush className="w-[max(var(--radix-popover-trigger-width),280px)]">
        <Command filter={accentFilter} loop>
          <div className="flex items-center gap-2 border-b border-paper-200 px-3">
            <Search aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-paper-600" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder={searchPlaceholder}
              className="h-10 w-full bg-transparent text-base outline-none placeholder:text-paper-600/70 focus-visible:outline-none"
            />
          </div>
          <Command.List className="scrollbar-quiet max-h-72 overflow-y-auto p-1">
            <Command.Empty className="px-2 py-3 text-[13px] text-paper-600">
              {onCreate && trimmed ? null : emptyText}
            </Command.Empty>
            {clearable && selected ? (
              <Command.Item
                value="__clear__"
                onSelect={() => {
                  onChange(undefined)
                  close()
                }}
                className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-paper-600 data-[selected=true]:bg-paper-100"
              >
                {clearLabel}
              </Command.Item>
            ) : null}
            {options.map((option) => (
              <Command.Item
                key={option.value}
                value={`${option.label}${ID_SEPARATOR}${option.value}`}
                keywords={[option.hint ?? '', ...(option.keywords ?? [])]}
                onSelect={() => {
                  onChange(option.value)
                  close()
                }}
                className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 data-[selected=true]:bg-paper-100"
              >
                {option.leading}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.hint ? <span className="shrink-0 text-meta text-paper-600">{option.hint}</span> : null}
                <Check
                  aria-hidden
                  strokeWidth={2}
                  className={cn('size-4 shrink-0 text-ink-600', option.value === value ? 'opacity-100' : 'opacity-0')}
                />
              </Command.Item>
            ))}
            {onCreate && trimmed && !exact ? (
              <Command.Item
                value={`${trimmed}${ID_SEPARATOR}__create__`}
                forceMount
                onSelect={() => void create()}
                disabled={creating}
                className="flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-ink-600 data-[selected=true]:bg-ink-50"
              >
                <Plus aria-hidden strokeWidth={2} className="size-4 shrink-0" />
                <span className="truncate">{createLabel(trimmed)}</span>
              </Command.Item>
            ) : null}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
