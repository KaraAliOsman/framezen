import { useEffect, useRef, useState, type ComponentProps, type KeyboardEvent } from 'react'
import { cn } from '../lib/cn'
import { formatNumber } from '../lib/format'
import { fieldClass, fieldWidth } from './Input'

/**
 * Interpreta una medida escrita a mano. Devuelve milímetros o null.
 *   "1200" · "1.200" · "1 200" · "1200,5" · "1.249,5" · "1200 mm" · "120 cm" · "1,2 m"
 */
export function parseMeasure(text: string): number | null {
  let t = text.trim().toLowerCase().replace(/\s/g, '')
  if (!t) return null
  let factor = 1
  if (t.endsWith('mm')) t = t.slice(0, -2)
  else if (t.endsWith('cm')) {
    factor = 10
    t = t.slice(0, -2)
  } else if (t.endsWith('m')) {
    factor = 1000
    t = t.slice(0, -1)
  }
  if (!/^-?[\d.,]+$/.test(t)) return null
  let normalized: string
  if (t.includes(',')) {
    // Coma decimal; los puntos son miles.
    normalized = t.replace(/\./g, '').replace(',', '.')
    if ((normalized.match(/\./g) ?? []).length > 1) return null
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    // "1.200" o "12.500": puntos de miles.
    normalized = t.replace(/\./g, '')
  } else {
    normalized = t
  }
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return Math.round(n * factor * 10) / 10
}

/** "1200x1500", "1200 × 1500", "1,2 x 1,5 m" → { width, height } en mm. */
export function parseSize(text: string): { width: number; height: number } | null {
  const parts = text.split(/\s*[x×*]\s*/i)
  if (parts.length !== 2) return null
  // La unidad puede ir solo al final: "120 x 150 cm".
  const unit = parts[1].trim().match(/(mm|cm|m)$/i)?.[1] ?? ''
  const first = /(mm|cm|m)$/i.test(parts[0].trim()) ? parts[0] : `${parts[0]}${unit}`
  const width = parseMeasure(first)
  const height = parseMeasure(parts[1])
  if (width === null || height === null) return null
  return { width, height }
}

function clamp(n: number, min?: number, max?: number): number {
  let v = n
  if (min !== undefined) v = Math.max(min, v)
  if (max !== undefined) v = Math.min(max, v)
  return v
}

export interface NumberFieldProps
  extends Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'size' | 'min' | 'max' | 'step' | 'defaultValue'> {
  value: number | null
  onChange: (value: number | null) => void
  /** Si se escribe o pega "1200x1500", recibe ambas medidas (si no, se usa la primera). */
  onSizeInput?: (size: { width: number; height: number }) => void
  min?: number
  max?: number
  /** Paso de flechas y rueda (10 mm). Con Shift: `bigStep` (100). Con Alt: 1. */
  step?: number
  bigStep?: number
  /** Unidad visible a la derecha; null para ocultarla. */
  unit?: string | null
  /** Decimales permitidos al mostrar (resolución 0,1 mm). */
  decimals?: number
  size?: 'md' | 'lg'
  /** Selecciona todo al enfocar para reescribir rápido. */
  selectOnFocus?: boolean
  /** Clases del input (className va al contenedor: ancho y márgenes). */
  inputClassName?: string
}

export function NumberField({
  value,
  onChange,
  onSizeInput,
  min,
  max,
  step = 10,
  bigStep = 100,
  unit = 'mm',
  decimals = 1,
  size = 'md',
  selectOnFocus = true,
  className,
  inputClassName,
  onFocus,
  onBlur,
  onKeyDown,
  disabled,
  ...props
}: NumberFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')
  const valueRef = useRef(value)
  valueRef.current = value
  // Evita confirmar dos veces el mismo texto (Enter y luego blur).
  const lastCommitRef = useRef<string | null>(null)

  const display = value === null || value === undefined ? '' : formatNumber(value, decimals)
  const editText = value === null || value === undefined ? '' : String(value).replace('.', ',')

  const commitNumber = (n: number) => {
    const next = clamp(Math.round(n * 10 ** decimals) / 10 ** decimals, min, max)
    onChange(next)
    return next
  }

  const commitDraft = (text: string) => {
    if (text === lastCommitRef.current) return
    lastCommitRef.current = text
    if (!text.trim()) {
      onChange(null)
      return
    }
    const pair = parseSize(text)
    if (pair) {
      if (onSizeInput) onSizeInput(pair)
      else commitNumber(pair.width)
      return
    }
    const n = parseMeasure(text)
    if (n === null) {
      setDraft(editText) // vuelve al último valor válido, sin regañar
      return
    }
    const next = commitNumber(n)
    setDraft(String(next).replace('.', ','))
  }

  const nudge = (delta: number) => {
    const base = valueRef.current ?? min ?? 0
    const next = commitNumber(base + delta)
    setDraft(String(next).replace('.', ','))
  }

  // Si el valor cambia desde fuera mientras editas (deshacer, "1200x1500"), el borrador lo sigue.
  useEffect(() => {
    if (!focused) return
    if (parseMeasure(draft) !== value) {
      setDraft(editText)
      lastCommitRef.current = null
    }
  }, [value])

  // Rueda solo con el campo enfocado (listener no pasivo para no desplazar la página).
  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      if (document.activeElement !== el || disabled) return
      event.preventDefault()
      const amount = event.shiftKey ? bigStep : event.altKey ? 1 : step
      nudge(event.deltaY < 0 ? amount : -amount)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented) return
    const amount = event.shiftKey ? bigStep : event.altKey ? 1 : step
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault()
        nudge(amount)
        break
      case 'ArrowDown':
        event.preventDefault()
        nudge(-amount)
        break
      case 'PageUp':
        event.preventDefault()
        nudge(bigStep)
        break
      case 'PageDown':
        event.preventDefault()
        nudge(-bigStep)
        break
      case 'Enter':
        commitDraft(draft)
        break
      case 'Escape':
        if (draft !== editText) {
          event.preventDefault()
          event.stopPropagation()
          setDraft(editText)
        }
        break
    }
  }

  const height = size === 'lg' ? 'h-14 text-[22px] font-medium' : 'h-9 touch:h-11'

  return (
    <div className={cn('relative flex items-center', fieldWidth(className), className)}>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        role="spinbutton"
        aria-valuenow={value ?? undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={value !== null && value !== undefined ? `${display}${unit ? ` ${unit}` : ''}` : undefined}
        disabled={disabled}
        value={focused ? draft : display}
        onFocus={(event) => {
          setFocused(true)
          setDraft(editText)
          lastCommitRef.current = null
          if (selectOnFocus) requestAnimationFrame(() => event.target.select())
          onFocus?.(event)
        }}
        onBlur={(event) => {
          commitDraft(event.target.value)
          setFocused(false)
          onBlur?.(event)
        }}
        onChange={(event) => {
          const text = event.target.value
          setDraft(text)
          lastCommitRef.current = null
          // Precio en vivo: si ya es una medida válida dentro del rango, avisamos de inmediato.
          if (/[x×*]/i.test(text)) return
          const n = parseMeasure(text)
          if (n !== null && (min === undefined || n >= min) && (max === undefined || n <= max)) onChange(n)
        }}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData('text')
          const pair = parseSize(pasted)
          if (pair && onSizeInput) {
            event.preventDefault()
            onSizeInput(pair)
          }
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          fieldClass,
          'w-full tabular px-3 text-right',
          height,
          unit ? (size === 'lg' ? 'pr-14' : 'pr-10') : '',
          inputClassName,
        )}
        {...props}
      />
      {unit ? (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute right-3 text-paper-600',
            size === 'lg' ? 'text-base' : 'text-[13px]',
          )}
        >
          {unit}
        </span>
      ) : null}
    </div>
  )
}
