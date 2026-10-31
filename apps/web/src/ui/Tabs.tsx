import type { ComponentProps, ReactNode } from 'react'
import { Tabs as RadixTabs } from 'radix-ui'
import { cn } from '../lib/cn'

export const Tabs = RadixTabs.Root

export function TabsList({ className, ...props }: ComponentProps<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn('scrollbar-quiet flex items-center gap-1 overflow-x-auto border-b border-paper-200', className)}
      {...props}
    />
  )
}

export interface TabsTriggerProps extends ComponentProps<typeof RadixTabs.Trigger> {
  /** Conteo o marca a la derecha («Compras · Pro»). */
  badge?: ReactNode
}

export function TabsTrigger({ className, children, badge, ...props }: TabsTriggerProps) {
  return (
    <RadixTabs.Trigger
      className={cn(
        'group relative -mb-px inline-flex h-10 shrink-0 items-center gap-1.5 px-2.5 text-base font-medium text-paper-600',
        'transition-colors duration-120 ease-out hover:text-paper-900 data-[state=active]:text-paper-900',
        'focus-visible:outline-offset-[-2px] disabled:opacity-50',
        "after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-ink-600 after:opacity-0 after:transition-opacity after:duration-160 after:content-['']",
        'data-[state=active]:after:opacity-100',
        className,
      )}
      {...props}
    >
      {children}
      {badge !== undefined && badge !== null ? (
        <span className="rounded-full bg-paper-100 px-1.5 text-meta text-paper-600 tabular group-data-[state=active]:bg-ink-50 group-data-[state=active]:text-ink-700">
          {badge}
        </span>
      ) : null}
    </RadixTabs.Trigger>
  )
}

export function TabsContent({ className, ...props }: ComponentProps<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cn('pt-5 focus-visible:outline-offset-4', className)} {...props} />
}
