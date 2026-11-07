import type { ComponentProps, ReactNode } from 'react'
import { Slot } from 'radix-ui'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'
import { Kbd } from './Kbd'
import { Spinner } from './Spinner'

/**
 * primary = la acción principal de la vista, en señal amarilla (una sola por vista) · ink = fuerte sin
 * señal (portal del cliente, segunda acción firme) · secondary = acciones normales · ghost = barras y filas ·
 * subtle = secundaria con peso («Agregar ventana») · danger = efecto externo irreversible.
 */
export type ButtonVariant = 'primary' | 'ink' | 'secondary' | 'ghost' | 'subtle' | 'danger'
/** xs 26 · sm 30 · md 36 (44 táctil) · lg 44 (48 táctil). */
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg'

const base =
  'relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-sm font-medium ' +
  'transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-100 ease-out ' +
  'active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ' +
  'disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 ' +
  'aria-busy:cursor-progress disabled:aria-busy:opacity-80'

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-signal font-semibold text-on-signal shadow-[var(--dk-shadow-primary)] hover:bg-signal-hover active:bg-signal-pressed',
  ink: 'bg-accent font-semibold text-fg-on-accent hover:bg-accent-hover active:bg-accent-pressed',
  secondary:
    'border border-divider-strong bg-surface text-fg-strong hover:border-control/60 hover:bg-hover active:bg-pressed ' +
    'data-[state=open]:bg-hover',
  ghost: 'text-fg hover:bg-hover active:bg-pressed data-[state=open]:bg-hover',
  subtle: 'bg-hover text-fg-strong hover:bg-pressed active:bg-accent-subtle-strong data-[state=open]:bg-pressed',
  danger: 'bg-danger-solid font-semibold text-on-danger-solid hover:brightness-95 active:brightness-90',
}

const sizes: Record<ButtonSize, string> = {
  xs: 'h-[26px] gap-1 px-2 text-table [&_svg]:size-3.5',
  sm: 'h-[30px] gap-1.5 px-2.5 text-table [&_svg]:size-4',
  md: 'h-9 gap-1.5 px-3.5 text-base [&_svg]:size-4 touch:h-11',
  lg: 'h-11 gap-2 px-5 text-lead [&_svg]:size-[18px] touch:h-12',
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
  /** Trabajo en curso: el botón conserva su ancho, muestra un indicador y no acepta clics. */
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
  const leading: ReactNode = Icon ? <Icon aria-hidden strokeWidth={strokeWidth} /> : null
  const inverse = variant === 'primary' || variant === 'ink' || variant === 'danger'
  return (
    <button
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {/* El contenido queda invisible pero ocupa su lugar: el botón no cambia de ancho al cargar. */}
      <span className={cn('contents', loading && 'invisible')}>
        {leading}
        {children}
        {IconRight ? <IconRight aria-hidden strokeWidth={strokeWidth} className="-mr-0.5" /> : null}
        {shortcut ? <Kbd combo={shortcut} tone={inverse ? 'inverse' : 'default'} className="-mr-1 ml-0.5 touch:hidden" /> : null}
      </span>
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size={size === 'lg' ? 18 : size === 'xs' ? 14 : 16} />
        </span>
      ) : null}
    </button>
  )
}
