import { clsx } from 'clsx'
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { EASE_OUT } from '../components/primitives'

interface AnimatedNumberProps {
  value: number
  format: (value: number) => string
  className?: string
  /** Destello `--ink-50` de 600 ms cuando cambia la cifra. */
  flash?: boolean
}

/**
 * Cifra que rueda hasta su nuevo valor (240 ms). Los lectores de pantalla solo
 * reciben el valor final.
 */
export function AnimatedNumber({ value, format, className, flash = true }: AnimatedNumberProps) {
  const reduce = useReducedMotion()
  const motionValue = useMotionValue(value)
  const text = useTransform(motionValue, (latest) => format(latest))
  const previous = useRef(value)
  const [flashKey, setFlashKey] = useState(0)

  useEffect(() => {
    // Solo se anima un cambio real (StrictMode monta los efectos dos veces).
    if (previous.current === value) {
      if (motionValue.get() !== value) motionValue.set(value)
      return
    }
    previous.current = value
    if (flash) setFlashKey((key) => key + 1)
    if (reduce) {
      motionValue.set(value)
      return
    }
    const controls = animate(motionValue, value, { duration: 0.24, ease: EASE_OUT })
    return () => controls.stop()
  }, [value, reduce, flash, motionValue])

  return (
    <span className={clsx('tabular relative inline-block', className)}>
      {flashKey > 0 ? (
        <motion.span
          key={flashKey}
          aria-hidden
          className="absolute -inset-x-1.5 -inset-y-0.5 rounded-xs bg-ink-50"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: 'linear' }}
        />
      ) : null}
      <motion.span aria-hidden className="relative">
        {text}
      </motion.span>
      <span className="sr-only">{format(value)}</span>
    </span>
  )
}
