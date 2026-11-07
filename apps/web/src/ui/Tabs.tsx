import { createContext, useContext, type ComponentProps, type ReactNode } from 'react'
import { Tabs as RadixTabs } from 'radix-ui'
import { cn } from '../lib/cn'

export const Tabs = RadixTabs.Root

/** line = pestañas de página con subrayado de tinta · pill = pestañas compactas dentro de paneles e inspectores. */
export type TabsVariant = 'line' | 'pill'

const VariantContext = createContext<TabsVariant>('line')

export interface TabsListProps extends ComponentProps<typeof RadixTabs.List> {
  variant?: TabsVariant
}

export function TabsList({ className, variant = 'line', ...props }: TabsListProps) {
  return (
    <VariantContext.Provider value={variant}>
      <RadixTabs.List
        className={cn(
          'scrollbar-quiet flex items-center overflow-x-auto',
          variant === 'line' ? 'gap-1 border-b border-divider' : 'gap-0.5 rounded-sm bg-pressed/70 p-0.5',
          className,
        )}
        {...props}
      />
    </VariantContext.Provider>
  )
}

export interface TabsTriggerProps extends ComponentProps<typeof RadixTabs.Trigger> {
  /** Conteo o marca a la derecha («Compras · Pro»). */
  badge?: ReactNode
}

export function TabsTrigger({ className, children, badge, ...props }: TabsTriggerProps) {
  const variant = useContext(VariantContext)
  return (
    <RadixTabs.Trigger
      className={cn(
        'group relative inline-flex shrink-0 items-center gap-1.5 font-medium whitespace-nowrap text-fg-muted',
        'transition-colors duration-100 ease-out hover:text-fg data-[state=active]:text-fg-strong',
        'focus-visible:outline-offset-[-2px] disabled:opacity-45 [&_svg]:size-4',
        variant === 'line'
          ? "-mb-px h-9 px-2.5 text-base first:pl-0 first:after:left-0 after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent after:opacity-0 after:transition-opacity after:duration-140 after:content-[''] data-[state=active]:after:opacity-100"
          : 'h-[26px] rounded-[6px] px-2.5 text-table data-[state=active]:bg-thumb data-[state=active]:shadow-raised',
        className,
      )}
      {...props}
    >
      {children}
      {badge !== undefined && badge !== null ? (
        <span className="text-table font-normal text-fg-muted tabular group-data-[state=active]:text-fg">
          {badge}
        </span>
      ) : null}
    </RadixTabs.Trigger>
  )
}

export function TabsContent({ className, ...props }: ComponentProps<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cn('pt-5 focus-visible:outline-offset-4', className)} {...props} />
}
