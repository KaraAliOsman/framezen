import type { ReactNode } from 'react'
import { Dialog as RadixDialog, VisuallyHidden } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '../lib/cn'
import { useT } from '../lib/i18n'
import es from './i18n/es'
import { IconButton } from './IconButton'

export const Sheet = RadixDialog.Root
export const SheetTrigger = RadixDialog.Trigger
export const SheetClose = RadixDialog.Close

export interface SheetContentProps {
  title: ReactNode
  description?: ReactNode
  hideTitle?: boolean
  /** Lateral (derecha/izquierda) o inferior (teléfono). */
  side?: 'right' | 'left' | 'bottom'
  children?: ReactNode
  footer?: ReactNode
  /** Ancho de la hoja lateral. */
  width?: number
  /** Sin velo oscuro (panel que convive con la página). */
  modal?: boolean
  className?: string
}

/**
 * Hoja lateral o inferior. Desde 640 px la lateral flota con 8 px de aire y radio 16 (como un
 * inspector desprendido); en el teléfono ocupa todo el alto y la inferior reemplaza a los diálogos.
 */
export function SheetContent({
  title,
  description,
  hideTitle,
  side = 'right',
  children,
  footer,
  width = 420,
  modal = true,
  className,
}: SheetContentProps) {
  const t = useT(es)
  const heading = <RadixDialog.Title className="text-h3 font-medium text-fg-strong">{title}</RadixDialog.Title>
  const sideClass = {
    right: 'fz-sheet-right inset-y-0 right-0 w-full sm:inset-y-2 sm:right-2 sm:rounded-lg',
    left: 'fz-sheet-left inset-y-0 left-0 w-full sm:inset-y-2 sm:left-2 sm:rounded-lg',
    bottom: 'fz-sheet-bottom inset-x-0 bottom-0 max-h-[85dvh] w-full rounded-t-lg pb-[env(safe-area-inset-bottom)]',
  }[side]

  return (
    <RadixDialog.Portal>
      {modal ? <RadixDialog.Overlay className="fz-overlay fixed inset-0 z-50" /> : null}
      <RadixDialog.Content
        {...(description ? {} : { 'aria-describedby': undefined })}
        onInteractOutside={modal ? undefined : (e) => e.preventDefault()}
        className={cn(
          'fixed z-50 flex flex-col overflow-hidden bg-raised text-fg shadow-pop focus-visible:outline-none',
          sideClass,
          className,
        )}
        style={side === 'bottom' ? undefined : { maxWidth: width }}
      >
        {side === 'bottom' ? <div aria-hidden className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-divider-strong" /> : null}
        <div className="flex min-h-14 shrink-0 items-center justify-between gap-4 px-5 pt-3">
          <div className="min-w-0">
            {hideTitle ? <VisuallyHidden.Root>{heading}</VisuallyHidden.Root> : heading}
            {description ? (
              <RadixDialog.Description className="mt-0.5 text-table text-fg-muted">{description}</RadixDialog.Description>
            ) : null}
          </div>
          <RadixDialog.Close asChild>
            <IconButton icon={X} label={t('common.close')} size="sm" className="-mr-1.5" tooltip={false} />
          </RadixDialog.Close>
        </div>
        <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? (
          <div className="flex shrink-0 items-center justify-end gap-2 px-5 pt-2 pb-4">{footer}</div>
        ) : null}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  )
}
