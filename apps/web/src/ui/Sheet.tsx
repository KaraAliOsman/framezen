import type { ReactNode } from 'react'
import { Dialog as RadixDialog, VisuallyHidden } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '../lib/cn'
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

/** Hoja lateral o inferior. En el teléfono, la inferior reemplaza a los diálogos. */
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
  const heading = <RadixDialog.Title className="text-base font-semibold">{title}</RadixDialog.Title>
  const sideClass = {
    right: 'fz-sheet-right inset-y-0 right-0 h-dvh w-full border-l',
    left: 'fz-sheet-left inset-y-0 left-0 h-dvh w-full border-r',
    bottom:
      'fz-sheet-bottom inset-x-0 bottom-0 max-h-[85dvh] w-full rounded-t-lg border-t pb-[env(safe-area-inset-bottom)]',
  }[side]

  return (
    <RadixDialog.Portal>
      {modal ? <RadixDialog.Overlay className="fz-overlay fixed inset-0 z-50 bg-paper-900/25 dark:bg-black/50" /> : null}
      <RadixDialog.Content
        {...(description ? {} : { 'aria-describedby': undefined })}
        onInteractOutside={modal ? undefined : (e) => e.preventDefault()}
        className={cn(
          'fixed z-50 flex flex-col border-paper-200 bg-paper-0 shadow-pop',
          sideClass,
          className,
        )}
        style={side === 'bottom' ? undefined : { maxWidth: width }}
      >
        {side === 'bottom' ? (
          <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-paper-200" />
        ) : null}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-paper-200 px-5 py-3.5">
          <div className="min-w-0">
            {hideTitle ? <VisuallyHidden.Root>{heading}</VisuallyHidden.Root> : heading}
            {description ? (
              <RadixDialog.Description className="mt-0.5 text-[13px] leading-[18px] text-paper-600">
                {description}
              </RadixDialog.Description>
            ) : null}
          </div>
          <RadixDialog.Close asChild>
            <IconButton icon={X} label="Cerrar" size="sm" className="-mr-1.5" tooltip={false} />
          </RadixDialog.Close>
        </div>
        <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-paper-200 bg-paper-50 px-5 py-3">
            {footer}
          </div>
        ) : null}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  )
}
