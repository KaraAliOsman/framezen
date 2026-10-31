import type { ReactNode } from 'react'
import { Dialog as RadixDialog, VisuallyHidden } from 'radix-ui'
import { X } from 'lucide-react'
import { cn } from '../lib/cn'
import { IconButton } from './IconButton'

export const Dialog = RadixDialog.Root
export const DialogTrigger = RadixDialog.Trigger
export const DialogClose = RadixDialog.Close

export interface DialogContentProps {
  title: ReactNode
  description?: ReactNode
  /** Oculta visualmente el título (sigue siendo accesible). */
  hideTitle?: boolean
  children?: ReactNode
  /** Acciones al pie, alineadas a la derecha. */
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  className?: string
  /** Evita cerrar al hacer clic fuera (formularios con datos). */
  preventOutsideClose?: boolean
}

const widths = { sm: 'max-w-[400px]', md: 'max-w-[520px]', lg: 'max-w-[720px]' }

/**
 * Diálogo modal. Úsalo poco: solo para efectos externos irreversibles o tareas cortas.
 * Para lo reversible preferimos deshacer (toast).
 */
export function DialogContent({
  title,
  description,
  hideTitle,
  children,
  footer,
  size = 'md',
  className,
  preventOutsideClose,
}: DialogContentProps) {
  const heading = <RadixDialog.Title className="text-h3 font-semibold tracking-[-0.01em]">{title}</RadixDialog.Title>
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fz-overlay fixed inset-0 z-50 bg-paper-900/30 dark:bg-black/50" />
      <RadixDialog.Content
        onPointerDownOutside={preventOutsideClose ? (e) => e.preventDefault() : undefined}
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cn(
          'fz-dialog fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] flex-col overflow-hidden',
          'rounded-lg border border-paper-200 bg-paper-0 shadow-pop',
          widths[size],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div className="min-w-0">
            {hideTitle ? <VisuallyHidden.Root>{heading}</VisuallyHidden.Root> : heading}
            {description ? (
              <RadixDialog.Description className="mt-1 text-paper-600">{description}</RadixDialog.Description>
            ) : null}
          </div>
          <RadixDialog.Close asChild>
            <IconButton icon={X} label="Cerrar" size="sm" className="-mt-0.5 -mr-2" tooltip={false} />
          </RadixDialog.Close>
        </div>
        <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-6">{children}</div>
        {footer ? (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-paper-200 bg-paper-50 px-6 py-3">
            {footer}
          </div>
        ) : null}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  )
}
