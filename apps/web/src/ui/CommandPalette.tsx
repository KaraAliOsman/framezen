import { isValidElement, useState, type ReactNode } from 'react'
import { Command } from 'cmdk'
import { Dialog as RadixDialog, VisuallyHidden } from 'radix-ui'
import { CornerDownLeft, Search, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'
import { accentFilter, ID_SEPARATOR } from './Combobox'
import { Kbd } from './Kbd'

export interface CommandAction {
  id: string
  label: string
  /** Texto secundario («Cliente · Concepción», «Cotización N° 412»). */
  hint?: string
  icon?: LucideIcon | ReactNode
  shortcut?: string
  keywords?: string[]
  onSelect: () => void
}

export interface CommandGroup {
  heading: string
  items: CommandAction[]
}

export interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: CommandGroup[]
  placeholder?: string
  /** Si existe, ofrece «Preguntarle a Marco: …» con lo escrito. */
  onAsk?: (query: string) => void
  askIcon?: ReactNode
  /** Para búsquedas remotas: avisa cada vez que cambia el texto. */
  onQueryChange?: (query: string) => void
}

function renderIcon(icon: CommandAction['icon']) {
  if (!icon) return <span className="size-4" />
  if (isValidElement(icon)) return icon
  const Icon = icon as LucideIcon
  return <Icon aria-hidden strokeWidth={1.75} className="size-4 text-paper-600" />
}

/** Paleta ⌘K: navegar, buscar objetos y ejecutar acciones (o preguntarle a Marco). */
export function CommandPalette({
  open,
  onOpenChange,
  groups,
  placeholder = 'Busca o escribe un comando…',
  onAsk,
  askIcon,
  onQueryChange,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const trimmed = query.trim()

  const run = (fn: () => void) => {
    onOpenChange(false)
    setQuery('')
    // Deja cerrar el diálogo antes de navegar o abrir otro.
    requestAnimationFrame(fn)
  }

  return (
    <RadixDialog.Root
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setQuery('')
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fz-overlay fixed inset-0 z-50 bg-paper-900/25 dark:bg-black/50" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fz-pop fixed top-[14vh] left-1/2 z-50 w-[calc(100vw-24px)] max-w-[640px] -translate-x-1/2 overflow-hidden rounded-lg border border-paper-200 bg-paper-0 shadow-pop sm:top-[20vh]"
        >
          <VisuallyHidden.Root>
            <RadixDialog.Title>Buscar y comandos</RadixDialog.Title>
          </VisuallyHidden.Root>
          <Command filter={accentFilter} loop className="flex flex-col">
            <div className="flex items-center gap-3 border-b border-paper-200 px-4">
              <Search aria-hidden strokeWidth={1.75} className="size-[18px] shrink-0 text-paper-600" />
              <Command.Input
                value={query}
                onValueChange={(v) => {
                  setQuery(v)
                  onQueryChange?.(v)
                }}
                placeholder={placeholder}
                className="h-13 w-full bg-transparent text-lead outline-none placeholder:text-paper-600/70 focus-visible:outline-none"
              />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="scrollbar-quiet max-h-[min(420px,60vh)] overflow-y-auto p-2">
              {onAsk && trimmed ? (
                // Con Marco abajo basta una línea: nada de bloque vacío encima de su sugerencia.
                <Command.Empty className="px-2 pt-2 pb-1 text-[13px] text-paper-600">
                  Sin coincidencias para «{trimmed}».
                </Command.Empty>
              ) : (
                <Command.Empty className="px-3 py-8 text-center text-paper-600">Nada por aquí. Prueba con otra palabra.</Command.Empty>
              )}
              {groups
                .filter((g) => g.items.length > 0)
                .map((group) => (
                  <Command.Group
                    key={group.heading}
                    heading={group.heading}
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-meta [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-paper-600"
                  >
                    {group.items.map((item) => (
                      <Command.Item
                        key={item.id}
                        value={`${item.label}${ID_SEPARATOR}${item.id}`}
                        keywords={[item.hint ?? '', ...(item.keywords ?? [])]}
                        onSelect={() => run(item.onSelect)}
                        className={cn(
                          'group relative flex h-10 cursor-default items-center gap-3 rounded-sm px-2 text-base',
                          'data-[selected=true]:bg-paper-100',
                        )}
                      >
                        {renderIcon(item.icon)}
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.hint ? <span className="shrink-0 truncate text-[13px] text-paper-600">{item.hint}</span> : null}
                        {item.shortcut ? <Kbd combo={item.shortcut} /> : null}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
              {onAsk && trimmed ? (
                <Command.Group
                  heading="Marco"
                  forceMount
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-meta [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-paper-600"
                >
                  <Command.Item
                    value={`${trimmed}${ID_SEPARATOR}__ask__`}
                    forceMount
                    onSelect={() => run(() => onAsk(trimmed))}
                    className="flex h-10 cursor-default items-center gap-3 rounded-sm px-2 text-base data-[selected=true]:bg-ink-50"
                  >
                    {askIcon ?? <span aria-hidden className="size-4 rounded-full bg-ink-600" />}
                    <span className="min-w-0 flex-1 truncate">
                      Preguntarle a Marco: <span className="font-medium">«{trimmed}»</span>
                    </span>
                  </Command.Item>
                </Command.Group>
              ) : null}
            </Command.List>
            <div className="flex items-center gap-4 border-t border-paper-200 bg-paper-50 px-4 py-2 text-meta text-paper-600">
              <span className="inline-flex items-center gap-1.5">
                <Kbd>
                  <CornerDownLeft aria-label="Enter" className="size-3" />
                </Kbd>
                abrir
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                moverte
              </span>
              <span className="ml-auto inline-flex items-center gap-1.5">
                <Kbd combo="mod+k" />
                abrir y cerrar
              </span>
            </div>
          </Command>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
