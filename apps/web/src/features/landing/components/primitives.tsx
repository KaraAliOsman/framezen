import { clsx } from 'clsx'
import { ArrowRight } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { createElement, useEffect, useLayoutEffect, useRef, type ComponentProps, type ReactNode } from 'react'
import { Link } from 'react-router'

/** Curvas y duraciones de docs/DESIGN.md. */
export const EASE_OUT = [0.2, 0, 0, 1] as const
export const EASE_IN = [0.4, 0, 1, 1] as const

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'inverse' | 'inverseGhost'
type ButtonSize = 'md' | 'lg'

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-ink-600 text-white hover:bg-ink-700 dark:text-paper-50',
  secondary: 'border border-paper-200 bg-paper-0 text-paper-900 hover:border-paper-350 hover:bg-paper-100',
  ghost: 'text-paper-900 hover:bg-paper-100',
  inverse: 'bg-paper-50 text-paper-900 hover:bg-paper-0',
  inverseGhost: 'text-paper-50 hover:bg-paper-50/10',
}

const sizeClass: Record<ButtonSize, string> = {
  md: 'h-9 px-3.5 text-[14px] gap-1.5',
  lg: 'h-12 px-5 text-[15px] gap-2',
}

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className?: string) {
  return clsx(
    'group/button inline-flex shrink-0 select-none items-center justify-center rounded-sm font-medium whitespace-nowrap',
    'transition-[background-color,border-color,color,transform] duration-[120ms] ease-out active:scale-[0.98]',
    variantClass[variant],
    sizeClass[size],
    className,
  )
}

interface ButtonLinkProps extends Omit<ComponentProps<typeof Link>, 'className'> {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  /** Muestra una flecha que avanza 2 px al pasar el cursor. */
  arrow?: boolean
}

export function ButtonLink({ variant, size, className, arrow, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...props}>
      {children}
      {arrow ? (
        <ArrowRight
          aria-hidden
          strokeWidth={1.75}
          className="size-4 transition-transform duration-[160ms] ease-out group-hover/button:translate-x-0.5"
        />
      ) : null}
    </Link>
  )
}

/** Contenedor de ancho máximo con márgenes laterales consistentes. */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('mx-auto w-full max-w-[1200px] px-5 sm:px-8', className)}>{children}</div>
}

interface SectionProps {
  id?: string
  labelledBy?: string
  className?: string
  children: ReactNode
}

export function Section({ id, labelledBy, className, children }: SectionProps) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={clsx('scroll-mt-20 py-20 sm:py-28', className)}>
      <Container>{children}</Container>
    </section>
  )
}

/** Rótulo de sección: número tabular + texto, como el rótulo de un plano. */
export function Kicker({ index, children }: { index?: string; children: ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-[13px] font-medium text-paper-600">
      {index ? <span className="tabular text-ink-600">{index}</span> : null}
      {index ? <span aria-hidden className="h-px w-6 bg-paper-350" /> : null}
      <span>{children}</span>
    </p>
  )
}

export function SectionTitle({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <h2
      id={id}
      className={clsx(
        'mt-4 max-w-[18ch] text-[34px] leading-[40px] font-semibold tracking-[-0.015em] text-balance text-paper-900 sm:text-[48px] sm:leading-[54px]',
        className,
      )}
    >
      {children}
    </h2>
  )
}

export function Lead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={clsx('mt-5 max-w-[60ch] text-[17px] leading-[28px] text-pretty text-paper-600', className)}>
      {children}
    </p>
  )
}

const ENTER_EASING = 'cubic-bezier(0.2, 0, 0, 1)'

/** `useLayoutEffect` sin avisos fuera del navegador. */
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export interface EntranceOptions {
  /** Retardo en segundos. */
  delay?: number
  /** `view`: al entrar en pantalla (una vez). `mount`: al montar. */
  when?: 'view' | 'mount'
  /** Fotogramas propios (por defecto: opacidad + 8 px hacia arriba). */
  keyframes?: Keyframe[]
  duration?: number
}

/**
 * Entrada como realce, nunca como requisito: el elemento es visible por defecto y la animación
 * (Web Animations, `fill: backwards`) solo se reproduce si el navegador la corre. Si el
 * observador de intersección no dispara (captura de página completa, impresión, navegador sin
 * soporte), el contenido se ve igual. Con movimiento reducido solo hay opacidad.
 */
export function useEntrance<T extends HTMLElement>({ delay = 0, when = 'view', keyframes, duration }: EntranceOptions = {}) {
  const ref = useRef<T>(null)
  const reduce = useReducedMotion()
  const options = useRef({ delay, when, keyframes, duration, reduce })
  options.current = { delay, when, keyframes, duration, reduce }

  useBrowserLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof el.animate !== 'function') return
    let animation: Animation | null = null
    const play = () => {
      const o = options.current
      animation = el.animate(o.reduce ? [{ opacity: 0 }, { opacity: 1 }] : (o.keyframes ?? [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }]), {
        duration: o.reduce ? 120 : (o.duration ?? 240),
        delay: o.reduce ? 0 : o.delay * 1000,
        easing: ENTER_EASING,
        fill: 'backwards',
      })
    }
    const finish = () => animation?.finish()
    window.addEventListener('beforeprint', finish)
    const cleanup = () => {
      window.removeEventListener('beforeprint', finish)
      animation?.cancel()
    }
    const rect = el.getBoundingClientRect()
    // Ya visible al montar: se anima antes del primer pintado (sin parpadeo).
    if (options.current.when === 'mount' || (rect.bottom > 0 && rect.top < window.innerHeight)) {
      play()
      return cleanup
    }
    if (typeof IntersectionObserver !== 'function') return cleanup
    // Dispara un poco antes de entrar para que nunca se vea el contenido «saltar».
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        observer.disconnect()
        play()
      },
      { rootMargin: '0px 0px 48px 0px' },
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      cleanup()
    }
  }, [])

  return ref
}

type RevealTag = 'div' | 'li' | 'p' | 'ul' | 'h1'

/**
 * Aparece al entrar en pantalla (una vez): opacidad + 8 px. Visible por defecto: la animación es
 * solo un realce (ver `useEntrance`).
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as = 'div',
  when = 'view',
  id,
}: {
  children: ReactNode
  delay?: number
  className?: string
  as?: RevealTag
  when?: 'view' | 'mount'
  id?: string
}) {
  const ref = useEntrance<HTMLElement>({ delay, when })
  return createElement(as, { ref, className, id, 'data-reveal': '' }, children)
}

/**
 * Línea de cota horizontal con remates oblicuos y texto al centro: el motivo
 * visual de Framezen (es el mismo lenguaje de las cotas de los dibujos).
 */
export function DimensionLine({ label, className }: { label: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-center text-ink-700', className)}>
      <DimensionEnd side="start" />
      <span aria-hidden className="h-px min-w-4 flex-1 bg-current opacity-60" />
      <span className="tabular shrink-0 px-3 text-[12px] font-medium tracking-[0.01em]">{label}</span>
      <span aria-hidden className="h-px min-w-4 flex-1 bg-current opacity-60" />
      <DimensionEnd side="end" />
    </div>
  )
}

function DimensionEnd({ side }: { side: 'start' | 'end' }) {
  return (
    <svg aria-hidden width="10" height="14" viewBox="0 0 10 14" className="shrink-0">
      <line x1="5" y1="0" x2="5" y2="14" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1" />
      <line
        x1={side === 'start' ? 5 : 0}
        y1="7"
        x2={side === 'start' ? 10 : 5}
        y2="7"
        stroke="currentColor"
        strokeOpacity="0.6"
        strokeWidth="1"
      />
      <line x1="1.5" y1="10.5" x2="8.5" y2="3.5" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  )
}
