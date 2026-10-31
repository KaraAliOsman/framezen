import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react'
import { Label as RadixLabel } from 'radix-ui'
import { CircleAlert } from 'lucide-react'
import { cn } from '../lib/cn'

export function Label({ className, ...props }: React.ComponentProps<typeof RadixLabel.Root>) {
  return <RadixLabel.Root className={cn('text-[13px] font-medium text-paper-900', className)} {...props} />
}

export interface FieldProps {
  label?: ReactNode
  /** Texto de ayuda bajo el control. */
  hint?: ReactNode
  /** Mensaje de error humano (qué pasó + cómo seguir). */
  error?: ReactNode
  /** Acción o dato a la derecha de la etiqueta (p. ej. «¿Olvidaste tu contraseña?»). */
  aside?: ReactNode
  optional?: boolean
  className?: string
  /** Un único control; recibe id, aria-describedby y aria-invalid. */
  children: ReactElement<Record<string, unknown>>
}

/** Etiqueta + control + ayuda/error con la accesibilidad resuelta. */
export function Field({ label, hint, error, aside, optional, className, children }: FieldProps) {
  const autoId = useId()
  const id = (isValidElement(children) && (children.props.id as string | undefined)) || `f${autoId}`
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })
    : children

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label || aside ? (
        <div className="flex items-baseline justify-between gap-3">
          {label ? (
            <Label htmlFor={id}>
              {label}
              {optional ? <span className="ml-1 font-normal text-paper-600">(opcional)</span> : null}
            </Label>
          ) : (
            <span />
          )}
          {aside ? <div className="text-[13px]">{aside}</div> : null}
        </div>
      ) : null}
      {control}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-[13px] leading-[18px] text-bad-600" role="alert">
          <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={2} />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[13px] leading-[18px] text-paper-600">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
