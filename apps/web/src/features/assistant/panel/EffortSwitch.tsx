/** Cuánto piensa el asistente antes de responder. Vive junto al modo, y se recuerda en este navegador. */
import { useState } from 'react'
import { Brain, Check, ChevronDown } from 'lucide-react'
import { DEFAULT_THINKING_EFFORT, THINKING_EFFORTS, type ThinkingEffort } from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useT } from '../../../lib/i18n'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../../../ui'
import es from '../i18n/es'

const STORAGE_KEY = 'dk-assistant-effort'

export function storedEffort(): ThinkingEffort {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return (THINKING_EFFORTS as readonly (string | null)[]).includes(value) ? (value as ThinkingEffort) : DEFAULT_THINKING_EFFORT
  } catch {
    return DEFAULT_THINKING_EFFORT
  }
}

function storeEffort(effort: ThinkingEffort): void {
  try {
    localStorage.setItem(STORAGE_KEY, effort)
  } catch {
    // Sin almacenamiento dura lo que dure la pantalla.
  }
}

export function EffortSwitch({ className }: { className?: string }) {
  const t = useT(es)
  const [value, setValue] = useState(storedEffort)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${t('effort.label')}: ${t(`effort.${value}`)}`}
          data-effort={value}
          className={cn(
            'inline-flex h-8 min-w-0 items-center gap-1.5 rounded-sm px-2 text-table text-fg-muted transition-colors duration-100 hover:bg-hover hover:text-fg data-[state=open]:bg-hover touch:h-10',
            className,
          )}
        >
          <Brain aria-hidden strokeWidth={1.75} className="size-3.5 shrink-0" />
          <span className="truncate">{t(`effort.${value}`)}</span>
          <ChevronDown aria-hidden strokeWidth={2} className="size-3 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
        {THINKING_EFFORTS.map((effort) => (
          <DropdownMenuItem
            key={effort}
            onSelect={() => {
              setValue(effort)
              storeEffort(effort)
            }}
            className="h-auto py-1.5"
          >
            <span className="flex min-w-0 flex-1 items-start gap-2.5 whitespace-normal">
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-fg-strong">{t(`effort.${effort}`)}</span>
                <span className="block text-table text-fg-muted">{t(`effort.${effort}Hint`)}</span>
              </span>
              <Check aria-hidden strokeWidth={2} className={cn('mt-0.5 size-4 shrink-0 text-accent-ink', effort === value ? 'opacity-100' : 'opacity-0')} />
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
