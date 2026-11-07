/**
 * Modo del asistente: un selector pequeño junto al campo, como en cualquier herramienta de trabajo.
 * El menú explica cada modo; los que el plan o el rol no permiten se ven deshabilitados con el motivo
 * (nunca escondidos).
 */
import { Check, ChevronDown, MessageSquare, ShieldCheck, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ASSISTANT_MODES, type AssistantMode } from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useT } from '../../../lib/i18n'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../ui'
import es from '../i18n/es'

const ICONS: Record<AssistantMode, LucideIcon> = { chat: MessageSquare, supervised: ShieldCheck, full: Zap }

export interface ModeSwitchProps {
  value: AssistantMode
  onChange(mode: AssistantMode): void
  /** Modos permitidos (undefined = todos). */
  allowed?: readonly AssistantMode[]
  className?: string
}

export function ModeSwitch({ value, onChange, allowed, className }: ModeSwitchProps) {
  const t = useT(es)
  const Icon = ICONS[value]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${t('modes.label')}: ${t(`modes.${value}`)}`}
          data-mode={value}
          className={cn(
            'inline-flex h-8 min-w-0 items-center gap-1.5 rounded-sm px-2 text-table text-fg-muted transition-colors duration-100 hover:bg-hover hover:text-fg data-[state=open]:bg-hover touch:h-10',
            className,
          )}
        >
          <Icon aria-hidden strokeWidth={1.75} className={cn('size-3.5 shrink-0', value === 'full' && 'text-warning')} />
          <span className="truncate">{t(`modes.${value}`)}</span>
          <ChevronDown aria-hidden strokeWidth={2} className="size-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-72">
        {ASSISTANT_MODES.map((mode) => {
          const ModeIcon = ICONS[mode]
          const disabled = allowed ? !allowed.includes(mode) : false
          return (
            <DropdownMenuItem key={mode} disabled={disabled} onSelect={() => onChange(mode)} className="h-auto py-1.5">
              <span className="flex min-w-0 items-start gap-2.5 whitespace-normal">
                <ModeIcon aria-hidden strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-fg-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-fg-strong">{t(`modes.${mode}`)}</span>
                  <span className="block text-table text-fg-muted">{disabled ? t('modes.unavailable') : t(`modes.${mode}Hint`)}</span>
                </span>
                <Check aria-hidden strokeWidth={2} className={cn('mt-0.5 size-4 shrink-0 text-accent-ink', mode === value ? 'opacity-100' : 'opacity-0')} />
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
