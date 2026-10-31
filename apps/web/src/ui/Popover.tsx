import type { ComponentProps } from 'react'
import { Popover as RadixPopover } from 'radix-ui'
import { cn } from '../lib/cn'

export const Popover = RadixPopover.Root
export const PopoverTrigger = RadixPopover.Trigger
export const PopoverAnchor = RadixPopover.Anchor
export const PopoverClose = RadixPopover.Close

export interface PopoverContentProps extends ComponentProps<typeof RadixPopover.Content> {
  /** Sin relleno interno (para listas o comandos). */
  flush?: boolean
}

export function PopoverContent({ className, flush, sideOffset = 6, align = 'start', ...props }: PopoverContentProps) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        className={cn(
          'fz-pop z-50 rounded-md border border-paper-200 bg-paper-0 text-paper-900 shadow-float',
          'origin-[var(--radix-popover-content-transform-origin)]',
          flush ? 'p-0' : 'p-3',
          className,
        )}
        {...props}
      />
    </RadixPopover.Portal>
  )
}
