import { AnimatePresence, motion } from 'motion/react'
import { Check, CloudOff, RotateCw } from 'lucide-react'
import { cn } from '../lib/cn'
import { formatRelative } from '../lib/format'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error'

export interface SaveIndicatorProps {
  status: SaveStatus
  /** Momento del último guardado (para el tooltip/título). */
  savedAt?: Date | string | null
  /** Texto propio para el estado actual (p. ej. «guardado en este equipo»); si no, el de siempre. */
  label?: string
  className?: string
}

const COPY: Record<Exclude<SaveStatus, 'idle'>, string> = {
  saving: 'Guardando…',
  saved: 'Guardado',
  offline: 'Sin conexión · tus cambios están a salvo',
  error: 'No pudimos guardar · reintentamos solos',
}

/** Indicador sutil de guardado automático (nunca hay botón «Guardar» obligatorio). */
export function SaveIndicator({ status, savedAt, label, className }: SaveIndicatorProps) {
  const title = savedAt && status === 'saved' ? `Guardado ${formatRelative(savedAt)}` : label
  return (
    <span
      role="status"
      aria-live="polite"
      title={title}
      className={cn('inline-flex h-6 items-center text-[13px] text-paper-600', className)}
    >
      <AnimatePresence mode="wait" initial={false}>
        {status === 'idle' ? null : (
          <motion.span
            key={status}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className={cn(
              'inline-flex items-center gap-1.5',
              status === 'error' && 'text-bad-600',
              status === 'offline' && 'text-warn-600',
            )}
          >
            {status === 'saving' ? <span aria-hidden className="fz-breathe size-1.5 rounded-full bg-paper-600" /> : null}
            {status === 'saved' ? <Check aria-hidden strokeWidth={2} className="size-3.5 text-ok-600" /> : null}
            {status === 'offline' ? <CloudOff aria-hidden strokeWidth={1.75} className="size-3.5" /> : null}
            {status === 'error' ? <RotateCw aria-hidden strokeWidth={1.75} className="size-3.5" /> : null}
            {label ?? COPY[status]}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}
