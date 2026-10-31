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
  size?: 'sm' | 'md' | 'lg'
  /** Mostrar el tooltip (por defecto sí). */
  tooltip?: boolean
  tooltipSide?: 'top' | 'right' | 'bottom' | 'left'
}

const variants = {
  ghost: 'text-paper-600 hover:bg-paper-100 hover:text-paper-900 data-[state=open]:bg-paper-100 data-[state=open]:text-paper-900',
  secondary: 'border border-paper-200 bg-paper-0 text-paper-900 hover:bg-paper-100',
  primary: 'bg-ink-600 text-paper-0 hover:bg-ink-700',
}

const sizes = {
  sm: 'size-7 [&_svg]:size-4',
  md: 'size-9 [&_svg]:size-[18px] touch:size-11',
  lg: 'size-11 [&_svg]:size-5',
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
        'inline-flex shrink-0 items-center justify-center rounded-sm transition-[background-color,color,transform] duration-120 ease-out active:scale-[0.96] disabled:pointer-events-none disabled:opacity-50',
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
