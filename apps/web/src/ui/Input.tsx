import type { ComponentProps, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'

/**
 * Clase compartida por todos los campos de texto: borde de control (3:1), foco = borde de tinta + aro
 * suave, error = borde de peligro, deshabilitado y solo lectura sobre fondo hundido. 36 px (44 táctil).
 */
export const fieldClass =
  'rounded-sm border border-control bg-surface text-base text-fg placeholder:text-fg-faint ' +
  'transition-[border-color,box-shadow,background-color] duration-100 ease-out hover:border-control-hover ' +
  'focus-visible:border-focus focus-visible:shadow-[0_0_0_3px_var(--dk-focus-ring)] focus-visible:outline-none ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--dk-danger)_22%,transparent)] ' +
  'disabled:cursor-not-allowed disabled:border-divider disabled:bg-sunken disabled:text-fg-faint disabled:shadow-none ' +
  '[&:is(input,textarea):read-only]:bg-sunken [&:is(input,textarea):read-only]:shadow-none touch:text-lead'

const WIDTH_RE = /(^|\s)(w-|size-|flex-1|basis-|grow)/

/** Ancho completo salvo que el llamador indique su propio ancho (sin tailwind-merge, evitamos choques). */
export function fieldWidth(className?: string): string {
  return className && WIDTH_RE.test(className) ? '' : 'w-full'
}

export interface InputProps extends Omit<ComponentProps<'input'>, 'size' | 'prefix'> {
  /** Icono a la izquierda. */
  icon?: LucideIcon
  /** Contenido fijo a la derecha (unidad, botón pequeño, Spinner). */
  suffix?: ReactNode
  /** Contenido fijo a la izquierda (p. ej. «$»). */
  prefix?: ReactNode
  /** sm 30 · md 36 (44 táctil) · lg 44. */
  size?: 'sm' | 'md' | 'lg'
  /** Clases para el contenedor (ancho, márgenes). */
  wrapperClassName?: string
}

const heights = {
  sm: 'h-[30px] text-table',
  md: 'h-9 touch:h-11',
  lg: 'h-11 text-lead',
}

export function Input({ icon: Icon, suffix, prefix, size = 'md', className, wrapperClassName, ...props }: InputProps) {
  const height = heights[size]
  if (!Icon && !suffix && !prefix) {
    const classes = `${className ?? ''} ${wrapperClassName ?? ''}`
    return <input className={cn(fieldClass, fieldWidth(classes), height, 'px-3', className, wrapperClassName)} {...props} />
  }
  return (
    <div className={cn('relative flex items-center', fieldWidth(wrapperClassName), wrapperClassName)}>
      {Icon ? (
        <Icon aria-hidden strokeWidth={1.75} className="pointer-events-none absolute left-3 size-4 text-fg-muted" />
      ) : null}
      {prefix && !Icon ? <span className="pointer-events-none absolute left-3 text-fg-muted tabular">{prefix}</span> : null}
      <input
        className={cn(fieldClass, 'w-full', height, Icon ? 'pl-9' : prefix ? 'pl-7' : 'pl-3', suffix ? 'pr-10' : 'pr-3', className)}
        {...props}
      />
      {suffix ? <span className="absolute right-3 flex items-center text-table text-fg-muted">{suffix}</span> : null}
    </div>
  )
}

export interface TextareaProps extends ComponentProps<'textarea'> {
  /** Crece con el contenido (usa field-sizing donde existe). */
  autoGrow?: boolean
}

export function Textarea({ className, autoGrow = true, rows = 3, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      className={cn(fieldClass, fieldWidth(className), 'min-h-20 px-3 py-2.5 leading-[20px]', autoGrow && '[field-sizing:content]', className)}
      {...props}
    />
  )
}
