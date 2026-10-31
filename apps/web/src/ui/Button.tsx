import type { ComponentProps, ReactNode } from 'react'
import { Slot } from 'radix-ui'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'
import { Kbd } from './Kbd'
import { Spinner } from './Spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const base =
  'relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium ' +
  'transition-[background-color,border-color,color,transform,opacity] duration-120 ease-out active:scale-[0.98] ' +
  'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50'

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-ink-600 text-paper-0 hover:bg-ink-700',
  secondary: 'border border-paper-200 bg-paper-0 text-paper-900 hover:border-paper-350/60 hover:bg-paper-100',
  ghost: 'text-paper-900 hover:bg-paper-100',
  danger: 'bg-bad-600 text-paper-0 hover:bg-bad-800 dark:hover:bg-bad-800 dark:hover:text-paper-0',
}

const sizes: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-[13px] [&_svg]:size-4',
  md: 'h-9 px-3.5 text-base [&_svg]:size-4 touch:h-11',
  lg: 'h-11 px-5 text-lead [&_svg]:size-[18px]',
}

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string): string {
  return cn(base, variants[variant], sizes[size], className)
}

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Icono a la izquierda. */
  icon?: LucideIcon
  /** Icono a la derecha. */
  iconRight?: LucideIcon
  /** Atajo que se muestra dentro del botón: 'mod+enter', 'a'. */
  shortcut?: string
  loading?: boolean
  /** Renderiza el hijo (p. ej. <Link>) con el estilo del botón. */
  asChild?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  shortcut,
  loading = false,
  asChild = false,
  className,
  children,
  disabled,
  type,
  ...props
}: ButtonProps) {
  const classes = buttonClass(variant, size, className)
  if (asChild) {
    return (
      <Slot.Root className={classes} {...props}>
        {children}
      </Slot.Root>
    )
  }
  const strokeWidth = 1.75
  let leading: ReactNode = Icon ? <Icon aria-hidden strokeWidth={strokeWidth} /> : null
  if (loading) leading = <Spinner size={size === 'lg' ? 18 : 16} />
  return (
    <button
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {leading}
      {children}
      {IconRight ? <IconRight aria-hidden strokeWidth={strokeWidth} /> : null}
      {shortcut ? (
        <Kbd combo={shortcut} tone={variant === 'primary' || variant === 'danger' ? 'inverse' : 'default'} className="-mr-1 ml-0.5" />
      ) : null}
    </button>
  )
}
