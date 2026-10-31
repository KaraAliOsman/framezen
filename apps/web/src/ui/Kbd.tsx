import type { ReactNode } from 'react'
import { cn } from '../lib/cn'
import { formatShortcut } from '../lib/useShortcut'

export interface KbdProps {
  /** Combinación a mostrar: 'mod+k' → ⌘ K (Mac) o Ctrl K. */
  combo?: string
  children?: ReactNode
  /** 'inverse' para usar sobre fondos tinta (botón primario, toasts). */
  tone?: 'default' | 'inverse'
  className?: string
}

const keyClass = {
  default: 'border-paper-200 bg-paper-0 text-paper-600',
  inverse: 'border-transparent bg-paper-0/15 text-paper-0/85',
}

export function Kbd({ combo, children, tone = 'default', className }: KbdProps) {
  const keys = combo ? formatShortcut(combo) : [children]
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={combo ? keys.join(' + ') : undefined}>
      {keys.map((key, i) => (
        <kbd
          key={i}
          className={cn(
            'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-xs border px-1 font-mono text-[11px] leading-none font-medium',
            keyClass[tone],
          )}
        >
          {key}
        </kbd>
      ))}
    </span>
  )
}
