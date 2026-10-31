import { useLayoutEffect, useRef, useState, type ComponentProps } from 'react'
import { cn } from '../lib/cn'
import { fieldClass, fieldWidth } from './Input'

/** "$ 1.234.567" → 1234567. Acepta texto con o sin separadores. */
export function parseCLP(text: string): number | null {
  const negative = /^\s*[-−]/.test(text)
  const digits = text.replace(/\D/g, '')
  if (!digits) return null
  const n = Number(digits)
  return negative ? -n : n
}

function groupDigits(n: number): string {
  return String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export interface MoneyFieldProps
  extends Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'size' | 'defaultValue' | 'min' | 'max'> {
  value: number | null
  onChange: (value: number | null) => void
  allowNegative?: boolean
  size?: 'md' | 'lg'
  /** Texto a la derecha (p. ej. «+ IVA», «/m²»). */
  suffix?: string
  /** Clases del input (className va al contenedor: ancho y márgenes). */
  inputClassName?: string
}

/** Monto en pesos chilenos con punto de miles mientras escribes. Sin decimales. */
export function MoneyField({
  value,
  onChange,
  allowNegative = false,
  size = 'md',
  suffix,
  className,
  inputClassName,
  ...props
}: MoneyFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  // Dígitos a la derecha del cursor, para reponerlo tras reformatear.
  const caretFromEnd = useRef<number | null>(null)
  const [negativeDraft, setNegativeDraft] = useState(false)

  const text =
    value === null || value === undefined
      ? negativeDraft
        ? '−'
        : ''
      : `${value < 0 ? '−' : ''}${groupDigits(value)}`

  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el || caretFromEnd.current === null || document.activeElement !== el) return
    let digitsSeen = 0
    let pos = el.value.length
    while (pos > 0 && digitsSeen < caretFromEnd.current) {
      pos--
      if (/\d/.test(el.value[pos])) digitsSeen++
    }
    el.setSelectionRange(pos, pos)
    caretFromEnd.current = null
  })

  const height = size === 'lg' ? 'h-11 text-lead' : 'h-9 touch:h-11'

  return (
    <div className={cn('relative flex items-center', fieldWidth(className), className)}>
      <span aria-hidden="true" className="pointer-events-none absolute left-3 text-paper-600">
        $
      </span>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={text}
        onChange={(event) => {
          const raw = event.target.value
          const caret = event.target.selectionStart ?? raw.length
          caretFromEnd.current = raw.slice(caret).replace(/\D/g, '').length
          const isNegative = allowNegative && /^\s*[-−]/.test(raw)
          const parsed = parseCLP(raw)
          setNegativeDraft(isNegative && parsed === null)
          if (parsed === null) onChange(null)
          else onChange(isNegative ? -Math.abs(parsed) : Math.abs(parsed))
        }}
        className={cn(fieldClass, 'w-full tabular pl-7 text-right', height, suffix ? 'pr-16' : 'pr-3', inputClassName)}
        {...props}
      />
      {suffix ? (
        <span aria-hidden="true" className="pointer-events-none absolute right-3 text-[13px] text-paper-600">
          {suffix}
        </span>
      ) : null}
    </div>
  )
}
