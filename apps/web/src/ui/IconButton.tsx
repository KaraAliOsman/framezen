import type { ComponentProps } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'
import { Tooltip } from './Tooltip'

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  icon: LucideIcon
  /** Texto accesible y del tooltip (obligatorio: un icono solo no se explica). */
  label: string
  shortcut?: string
  variant?: 'ghost' | 'secondary' | 'primary'
  /** xs 24 · sm 30 · md 36 (44 táctil) · lg 44. */
  size?: 'xs' | 'sm' | 'md' | 'lg'
  /** Mostrar el tooltip (por defecto sí). */
  tooltip?: boolean
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
}

const variants = {
  ghost:
    'text-fg-muted hover:bg-hover hover:text-fg-strong active:bg-pressed data-[state=open]:bg-hover data-[state=open]:text-fg-strong ' +
    'aria-pressed:bg-accent-subtle-strong aria-pressed:text-fg-strong',
  secondary:
    'border border-divider-strong bg-surface text-fg-strong hover:bg-hover active:bg-pressed data-[state=open]:bg-hover',
  primary: 'bg-signal text-on-signal shadow-[var(--dk-shadow-primary)] hover:bg-signal-hover active:bg-signal-pressed',
}

const sizes = {
  xs: 'size-6 rounded-xs [&_svg]:size-3.5',
  sm: 'size-[30px] rounded-sm [&_svg]:size-4',
  md: 'size-9 rounded-sm [&_svg]:size-[18px] touch:size-11',
  lg: 'size-11 rounded-sm [&_svg]:size-5',
}

export function IconButton({
  icon: Icon,
  label,
  shortcut,
  variant = 'ghost',
  size = 'md',
  tooltip = true,
  tooltipSide = 'top',
  className,
  type,
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type={type ?? 'button'}
      aria-label={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center transition-[background-color,color,transform] duration-100 ease-out',
        'active:scale-[0.94] disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      <Icon aria-hidden strokeWidth={1.75} />
    </button>
  )
  return tooltip ? (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide}>
      {button}
    </Tooltip>
  ) : (
    button
  )
}
