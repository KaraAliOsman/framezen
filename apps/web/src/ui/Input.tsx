import type { ComponentProps, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../lib/cn'

/** Clase compartida por todos los campos de texto (36 px, 44 px en pantallas táctiles). */
export const fieldClass =
  'rounded-sm border border-paper-350 bg-paper-0 text-base text-paper-900 placeholder:text-paper-600/70 ' +
  'transition-[border-color,box-shadow] duration-120 ease-out hover:border-paper-600 ' +
  'focus-visible:border-ink-500 ' +
  'aria-[invalid=true]:border-bad-600 disabled:cursor-not-allowed disabled:bg-paper-100 disabled:text-paper-600 ' +
  'read-only:bg-paper-50 touch:text-lead'

const WIDTH_RE = /(^|\s)(w-|size-|flex-1|basis-|grow)/

/** Ancho completo salvo que el llamador indique su propio ancho (sin tailwind-merge, evitamos choques). */
export function fieldWidth(className?: string): string {
  return className && WIDTH_RE.test(className) ? '' : 'w-full'
}

export interface InputProps extends Omit<ComponentProps<'input'>, 'size' | 'prefix'> {
  /** Icono a la izquierda. */
  icon?: LucideIcon
  /** Contenido fijo a la derecha (unidad, botón pequeño). */
  suffix?: ReactNode
  /** Contenido fijo a la izquierda (p. ej. «$»). */
  prefix?: ReactNode
  size?: 'md' | 'lg'
  /** Clases para el contenedor (ancho, márgenes). */
  wrapperClassName?: string
}

export function Input({ icon: Icon, suffix, prefix, size = 'md', className, wrapperClassName, ...props }: InputProps) {
  const height = size === 'lg' ? 'h-11 text-lead' : 'h-9 touch:h-11'
  if (!Icon && !suffix && !prefix) {
    const classes = `${className ?? ''} ${wrapperClassName ?? ''}`
    return <input className={cn(fieldClass, fieldWidth(classes), height, 'px-3', className, wrapperClassName)} {...props} />
  }
  return (
    <div className={cn('relative flex items-center', fieldWidth(wrapperClassName), wrapperClassName)}>
      {Icon ? (
        <Icon aria-hidden strokeWidth={1.75} className="pointer-events-none absolute left-2.5 size-4 text-paper-600" />
      ) : null}
      {prefix && !Icon ? (
        <span className="pointer-events-none absolute left-3 text-paper-600 tabular">{prefix}</span>
      ) : null}
      <input
        className={cn(fieldClass, 'w-full', height, Icon ? 'pl-8' : prefix ? 'pl-7' : 'pl-3', suffix ? 'pr-10' : 'pr-3', className)}
        {...props}
      />
      {suffix ? (
        <span className="absolute right-2.5 flex items-center text-[13px] text-paper-600">{suffix}</span>
      ) : null}
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
      className={cn(fieldClass, fieldWidth(className), 'min-h-20 px-3 py-2 leading-[20px]', autoGrow && '[field-sizing:content]', className)}
      {...props}
    />
  )
}
