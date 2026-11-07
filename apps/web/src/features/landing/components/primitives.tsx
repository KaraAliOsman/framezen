import { clsx } from 'clsx'
import { ArrowRight } from 'lucide-react'
import { useReducedMotion } from 'motion/react'
import { createElement, useEffect, useLayoutEffect, useRef, type ComponentProps, type ReactNode } from 'react'
import { Link } from 'react-router'
import { buttonClass, type ButtonSize, type ButtonVariant } from '../../../ui/Button'

/** Curvas de docs/DESIGN.md (cambios de estado y salidas). */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const
export const EASE_IN = [0.4, 0, 1, 1] as const

interface ButtonLinkProps extends Omit<ComponentProps<typeof Link>, 'className'> {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  /** Flecha que avanza 2 px al pasar el cursor. */
  arrow?: boolean
}

export function ButtonLink({ variant, size, className, arrow, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, size, clsx('group/button', className))} {...props}>
      {children}
      {arrow ? (
        <ArrowRight aria-hidden strokeWidth={1.75} className="size-4 transition-transform duration-100 ease-out group-hover/button:translate-x-0.5" />
      ) : null}
    </Link>
  )
}

/** Ancho de la página. */
export const PAGE_WIDTH = 'max-w-[1312px]'

/** Márgenes laterales de la página (también para lo que corre a sangre por un solo lado). */
export const PAGE_GUTTER = 'px-4 sm:px-8 lg:px-12'

/** Contenedor con márgenes laterales consistentes. */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx('mx-auto w-full', PAGE_GUTTER, PAGE_WIDTH, className)}>{children}</div>
}

type SectionTone = 'plain' | 'sunken' | 'dark'

interface SectionProps {
  id?: string
  labelledBy?: string
  className?: string
  /** `dark`: tema oscuro local, en ambos temas de la página. */
  tone?: SectionTone
  children: ReactNode
}

/** Sección de la landing: solo aire y, si hace falta, un cambio de fondo. El contenido pone su contenedor. */
export function Section({ id, labelledBy, className, tone = 'plain', children }: SectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      data-theme={tone === 'dark' ? 'dark' : undefined}
      className={clsx('relative scroll-mt-16 py-20 text-fg sm:py-28 lg:py-36', tone === 'sunken' ? 'bg-sunken' : 'bg-canvas', className)}
    >
      {children}
    </section>
  )
}

export function SectionTitle({ id, children, className }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <h2 id={id} className={clsx('font-display text-figure font-medium text-balance text-fg-strong sm:text-display-sm lg:text-display', className)}>
      {children}
    </h2>
  )
}

export function Lead({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx('max-w-[56ch] text-lead text-pretty text-fg-muted', className)}>{children}</p>
}

/** Pie de un medio: dice de dónde sale lo que se ve. */
export function Caption({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx('text-table text-fg-muted', className)}>{children}</p>
}

const ENTER_EASING = 'cubic-bezier(0.23, 1, 0.32, 1)'

/** `useLayoutEffect` sin avisos fuera del navegador. */
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

interface EntranceOptions {
  /** Retardo en segundos. */
  delay?: number
  /** `view`: al entrar en pantalla (una vez). `mount`: al montar. */
  when?: 'view' | 'mount'
}

/**
 * Entrada como realce, nunca como requisito: el elemento es visible por defecto y la animación
 * (Web Animations, `fill: backwards`) solo se reproduce si el navegador la corre. Si el observador
 * de intersección no dispara (captura de página completa, impresión), el contenido se ve igual.
 */
function useEntrance<T extends HTMLElement>({ delay = 0, when = 'view' }: EntranceOptions = {}) {
  const ref = useRef<T>(null)
  const reduce = useReducedMotion()
  const options = useRef({ delay, when, reduce })
  options.current = { delay, when, reduce }

  useBrowserLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof el.animate !== 'function') return
    let animation: Animation | null = null
    const play = () => {
      const o = options.current
      animation = el.animate(o.reduce ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], {
        duration: o.reduce ? 160 : 420,
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
    if (options.current.when === 'mount' || (rect.bottom > 0 && rect.top < window.innerHeight)) {
      play()
      return cleanup
    }
    if (typeof IntersectionObserver !== 'function') return cleanup
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

type RevealTag = 'div' | 'li' | 'p' | 'ul' | 'h1' | 'figure'

/** Aparece al entrar en pantalla (una vez): opacidad + 12 px. Visible por defecto. */
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
