/**
 * Pliegue del panel: lo ocasional queda en una fila con su estado a la derecha y se abre al pedirlo.
 * Sin relleno lateral propio: toma el del panel donde viva.
 */
import { useId, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '../../../lib/cn'

export function Fold({ title, summary, children, className }: { title: ReactNode; summary?: ReactNode; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  return (
    <section className={cn('border-t border-divider', className)} data-fold="">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className="-mx-1 flex min-h-10 w-[calc(100%+0.5rem)] items-center gap-2 rounded-xs px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-focus touch:min-h-11"
        >
          <span className="shrink-0 text-table font-medium text-fg-strong">{title}</span>
          <span className="min-w-0 flex-1 truncate text-right text-meta text-fg-muted">{summary}</span>
          <ChevronRight aria-hidden strokeWidth={2} className={cn('size-3.5 shrink-0 text-fg-muted transition-transform duration-140 ease-out', open && 'rotate-90')} />
        </button>
      </h3>
      {open ? (
        <div id={bodyId} className="flex flex-col gap-3 pt-1 pb-4">
          {children}
        </div>
      ) : null}
    </section>
  )
}
