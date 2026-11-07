import { isValidElement, useState, type ReactNode } from 'react'
import { Command } from 'cmdk'
import { Dialog as RadixDialog, VisuallyHidden } from 'radix-ui'
import { CornerDownLeft, Search, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'
import { useT } from '../lib/i18n'
import es from './i18n/es'
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
  /** Si existe, ofrece «Preguntarle a {asistente}: …» con lo escrito. */
  onAsk?: (query: string) => void
  askIcon?: ReactNode
  /** Nombre del asistente que recibe la pregunta (dato, p. ej. «Marco»); sin él, «el asistente». */
  askName?: string
  /** Para búsquedas remotas: avisa cada vez que cambia el texto. */
  onQueryChange?: (query: string) => void
}

function renderIcon(icon: CommandAction['icon']) {
  if (!icon) return <span className="size-4" />
  if (isValidElement(icon)) return icon
  const Icon = icon as LucideIcon
  return <Icon aria-hidden strokeWidth={1.75} className="size-4 text-fg-muted group-data-[selected=true]:text-fg" />
}

/** Paleta ⌘K: navegar, buscar objetos y ejecutar acciones (o preguntarle al asistente). */
export function CommandPalette({
  open,
  onOpenChange,
  groups,
  placeholder,
  onAsk,
  askIcon,
  askName,
  onQueryChange,
}: CommandPaletteProps) {
  const t = useT(es)
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
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-scrim" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fixed top-[14vh] left-1/2 z-50 w-[calc(100vw-24px)] max-w-[640px] -translate-x-1/2 overflow-hidden rounded-lg bg-raised text-fg shadow-pop focus-visible:outline-none sm:top-[18vh]"
        >
          <VisuallyHidden.Root>
            <RadixDialog.Title>{t('palette.title')}</RadixDialog.Title>
          </VisuallyHidden.Root>
          <Command filter={accentFilter} loop className="flex flex-col">
            <div className="flex items-center gap-3 px-4 pt-1">
              <Search aria-hidden strokeWidth={1.75} className="size-[18px] shrink-0 text-fg-muted" />
              <Command.Input
                value={query}
                onValueChange={(v) => {
                  setQuery(v)
                  onQueryChange?.(v)
                }}
                placeholder={placeholder ?? t('palette.placeholder')}
                className="h-14 w-full bg-transparent text-lead text-fg-strong outline-none placeholder:text-fg-faint focus-visible:outline-none"
              />
              <Kbd>{t('keys.escape')}</Kbd>
            </div>
            <Command.List className="scrollbar-quiet max-h-[min(420px,60vh)] overflow-y-auto p-2">
              {onAsk && trimmed ? (
                // Con el asistente abajo basta una línea: nada de bloque vacío encima de su sugerencia.
                <Command.Empty className="px-2 pt-2 pb-1 text-table text-fg-muted">
                  {t('palette.noMatchesFor', { query: trimmed })}
                </Command.Empty>
              ) : (
                <Command.Empty className="px-3 py-10 text-center text-fg-muted">{t('palette.nothing')}</Command.Empty>
              )}
              {groups
                .filter((g) => g.items.length > 0)
                .map((group) => (
                  <Command.Group
                    key={group.heading}
                    heading={group.heading}
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-meta [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-muted"
                  >
                    {group.items.map((item) => (
                      <Command.Item
                        key={item.id}
                        value={`${item.label}${ID_SEPARATOR}${item.id}`}
                        keywords={[item.hint ?? '', ...(item.keywords ?? [])]}
                        onSelect={() => run(item.onSelect)}
                        className={cn(
                          'group relative flex h-10 cursor-default items-center gap-3 rounded-sm px-2.5 text-base text-fg',
                          'data-[selected=true]:bg-hover data-[selected=true]:text-fg-strong',
                        )}
                      >
                        {renderIcon(item.icon)}
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.hint ? <span className="max-w-[45%] shrink-0 truncate text-table text-fg-muted">{item.hint}</span> : null}
                        {item.shortcut ? <Kbd combo={item.shortcut} /> : null}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
              {onAsk && trimmed ? (
                <Command.Group
                  heading={askName || t('palette.askHeading')}
                  forceMount
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-meta [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-muted"
                >
                  <Command.Item
                    value={`${trimmed}${ID_SEPARATOR}__ask__`}
                    forceMount
                    onSelect={() => run(() => onAsk(trimmed))}
                    className="flex h-10 cursor-default items-center gap-3 rounded-sm px-2.5 text-base text-fg data-[selected=true]:bg-hover data-[selected=true]:text-fg-strong"
                  >
                    {askIcon ?? <span aria-hidden className="size-4 rounded-full bg-accent" />}
                    <span className="min-w-0 flex-1 truncate">
                      {askName
                        ? t.rich('palette.ask', { name: askName, query: trimmed, b: <span className="font-medium" /> })
                        : t.rich('palette.askGeneric', { query: trimmed, b: <span className="font-medium" /> })}
                    </span>
                  </Command.Item>
                </Command.Group>
              ) : null}
            </Command.List>
            <div className="flex items-center gap-4 border-t border-divider px-4 py-2 text-meta text-fg-muted">
              <span className="inline-flex items-center gap-1.5">
                <Kbd>
                  <CornerDownLeft aria-label={t('keys.enter')} className="size-3" />
                </Kbd>
                {t('palette.open')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                {t('palette.move')}
              </span>
              <span className="ml-auto inline-flex items-center gap-1.5">
                <Kbd combo="mod+k" />
                {t('palette.toggle')}
              </span>
            </div>
          </Command>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
