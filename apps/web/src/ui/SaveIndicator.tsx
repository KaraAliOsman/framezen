import { AnimatePresence, motion } from 'motion/react'
import { Check, CloudOff, RotateCw } from 'lucide-react'
import { cn } from '../lib/cn'
import { useFormat, useT } from '../lib/i18n'
import es from './i18n/es'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error'

export interface SaveIndicatorProps {
  status: SaveStatus
  /** Momento del último guardado (para el tooltip/título). */
  savedAt?: Date | string | null
  /** Texto propio para el estado actual (p. ej. «guardado en este equipo»); si no, el de siempre. */
  label?: string
  className?: string
}

/** Indicador sutil de guardado automático (nunca hay botón «Guardar» obligatorio). */
export function SaveIndicator({ status, savedAt, label, className }: SaveIndicatorProps) {
  const t = useT(es)
  const fmt = useFormat()
  const title = savedAt && status === 'saved' ? t('save.savedAt', { when: fmt.relative(savedAt) }) : label
  return (
    <span
      role="status"
      aria-live="polite"
      title={title}
      className={cn('inline-flex h-6 items-center text-table text-fg-muted', className)}
    >
      <AnimatePresence mode="wait" initial={false}>
        {status === 'idle' ? null : (
          <motion.span
            key={status}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14, ease: [0.23, 1, 0.32, 1] }}
            className={cn(
              'inline-flex items-center gap-1.5',
              status === 'error' && 'text-danger',
              status === 'offline' && 'text-warning',
            )}
          >
            {status === 'saving' ? <span aria-hidden className="fz-breathe size-1.5 rounded-full bg-fg-muted" /> : null}
            {status === 'saved' ? <Check aria-hidden strokeWidth={2.25} className="size-3.5 text-ok-600" /> : null}
            {status === 'offline' ? <CloudOff aria-hidden strokeWidth={1.75} className="size-3.5" /> : null}
            {status === 'error' ? <RotateCw aria-hidden strokeWidth={1.75} className="size-3.5" /> : null}
            {label ?? t(`save.${status}`)}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}
