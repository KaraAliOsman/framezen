import type { ComponentProps, ReactNode } from 'react'
import { DropdownMenu as RadixMenu } from 'radix-ui'
import { Check, ChevronRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'
import { Kbd } from './Kbd'
import { floatingClass } from './Popover'

export const DropdownMenu = RadixMenu.Root
export const DropdownMenuTrigger = RadixMenu.Trigger
export const DropdownMenuGroup = RadixMenu.Group
export const DropdownMenuSub = RadixMenu.Sub
export const DropdownMenuRadioGroup = RadixMenu.RadioGroup

const contentClass = cn('fz-pop min-w-48 overflow-hidden p-1', floatingClass, 'origin-[var(--radix-dropdown-menu-content-transform-origin)]')

const itemClass =
  'relative flex h-8 cursor-default select-none items-center gap-2 rounded-xs px-2 text-base outline-none ' +
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-45 data-[highlighted]:bg-hover touch:h-10'

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = 'end',
  ...props
}: ComponentProps<typeof RadixMenu.Content>) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        className={cn(contentClass, className)}
        {...props}
      />
    </RadixMenu.Portal>
  )
}

export interface DropdownMenuItemProps extends ComponentProps<typeof RadixMenu.Item> {
  icon?: LucideIcon
  shortcut?: string
  /** Acción destructiva (texto rojo). */
  danger?: boolean
  /** Texto secundario a la derecha. */
  hint?: ReactNode
}

export function DropdownMenuItem({ icon: Icon, shortcut, danger, hint, className, children, ...props }: DropdownMenuItemProps) {
  return (
    <RadixMenu.Item
      className={cn(itemClass, danger && 'text-danger data-[highlighted]:bg-danger-bg', className)}
      {...props}
    >
      {Icon ? <Icon aria-hidden strokeWidth={1.75} className={cn('size-4 shrink-0', danger ? '' : 'text-fg-muted')} /> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint ? <span className="text-meta text-fg-muted">{hint}</span> : null}
      {shortcut ? <Kbd combo={shortcut} /> : null}
    </RadixMenu.Item>
  )
}

export function DropdownMenuCheckboxItem({ className, children, ...props }: ComponentProps<typeof RadixMenu.CheckboxItem>) {
  return (
    <RadixMenu.CheckboxItem className={cn(itemClass, 'pl-8', className)} {...props}>
      <RadixMenu.ItemIndicator className="absolute left-2 inline-flex text-accent">
        <Check aria-hidden strokeWidth={2} className="size-4" />
      </RadixMenu.ItemIndicator>
      {children}
    </RadixMenu.CheckboxItem>
  )
}

export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof RadixMenu.RadioItem>) {
  return (
    <RadixMenu.RadioItem className={cn(itemClass, 'pl-8', className)} {...props}>
      <RadixMenu.ItemIndicator className="absolute left-2 inline-flex text-accent">
        <Check aria-hidden strokeWidth={2} className="size-4" />
      </RadixMenu.ItemIndicator>
      {children}
    </RadixMenu.RadioItem>
  )
}

export function DropdownMenuSubTrigger({
  icon: Icon,
  className,
  children,
  ...props
}: ComponentProps<typeof RadixMenu.SubTrigger> & { icon?: LucideIcon }) {
  return (
    <RadixMenu.SubTrigger className={cn(itemClass, 'data-[state=open]:bg-hover', className)} {...props}>
      {Icon ? <Icon aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-fg-muted" /> : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <ChevronRight aria-hidden strokeWidth={1.75} className="size-4 text-fg-muted" />
    </RadixMenu.SubTrigger>
  )
}

export function DropdownMenuSubContent({ className, ...props }: ComponentProps<typeof RadixMenu.SubContent>) {
  return (
    <RadixMenu.Portal>
      <RadixMenu.SubContent sideOffset={4} collisionPadding={8} className={cn(contentClass, 'min-w-40', className)} {...props} />
    </RadixMenu.Portal>
  )
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof RadixMenu.Label>) {
  return <RadixMenu.Label className={cn('px-2 pt-2 pb-1 text-meta font-medium text-fg-muted', className)} {...props} />
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof RadixMenu.Separator>) {
  return <RadixMenu.Separator className={cn('-mx-1 my-1 h-px bg-divider', className)} {...props} />
}
