import { useEffect, useRef, useState, type ReactNode } from 'react'
import { animate, useReducedMotion } from 'motion/react'
import { cn } from '../lib/cn'

/**
 * Cifra que rueda hasta su nuevo valor (240 ms, sin rebote). Con movimiento reducido, cambia directo.
 * `format` convierte el número en texto (formatCLP, formatArea…).
 */
export function AnimatedNumber({
  value,
  format = (n) => String(Math.round(n)),
  duration = 0.24,
  className,
}: {
  value: number
  format?: (n: number) => string
  duration?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(value)
  const fromRef = useRef(value)

  useEffect(() => {
    if (reduced || fromRef.current === value) {
      fromRef.current = value
      setShown(value)
      return
    }
    const controls = animate(fromRef.current, value, {
      duration,
      ease: [0.2, 0, 0, 1],
      onUpdate: (latest) => {
        fromRef.current = latest
        setShown(latest)
      },
    })
    return () => controls.stop()
  }, [value, reduced, duration])

  return (
    <span className={cn('tabular', className)} aria-live="off">
      {format(shown)}
    </span>
  )
}

/** Destello `--ink-50` de 600 ms cuando cambia `trigger` (p. ej. un total). Solo opacidad. */
export function Flash({ trigger, children, className }: { trigger: unknown; children: ReactNode; className?: string }) {
  const [key, setKey] = useState(0)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setKey((k) => k + 1)
  }, [trigger])
  return (
    <span className={cn('relative isolate inline-block rounded-xs', className)}>
      {key > 0 ? <span key={key} aria-hidden className="fz-flash-layer absolute -inset-x-1 inset-y-0 -z-10 rounded-xs bg-ink-50" /> : null}
      {children}
    </span>
  )
}
