import type { ReactNode } from 'react'
import { Tooltip as RadixTooltip } from 'radix-ui'
import { cn } from '../lib/cn'
import { Kbd } from './Kbd'

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <RadixTooltip.Provider delayDuration={400} skipDelayDuration={250}>
      {children}
    </RadixTooltip.Provider>
  )
}

export interface TooltipProps {
  content: ReactNode
  /** Atajo que se muestra junto al texto. */
  shortcut?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  /** Desactiva el tooltip sin cambiar el árbol. */
  disabled?: boolean
  children: ReactNode
  className?: string
}

/** Tooltip breve. El hijo debe ser un elemento enfocable (botón, enlace). */
export function Tooltip({ content, shortcut, side = 'top', align = 'center', disabled, children, className }: TooltipProps) {
  if (disabled || (!content && !shortcut)) return <>{children}</>
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            'fz-pop z-50 flex max-w-64 items-center gap-2 rounded-sm bg-paper-900 px-2 py-1 text-meta font-medium text-paper-0 shadow-float',
            className,
          )}
        >
          {content}
          {shortcut ? <Kbd combo={shortcut} tone="inverse" /> : null}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}
