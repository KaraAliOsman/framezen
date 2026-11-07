import { useEffect, useRef, useState, type ComponentProps, type KeyboardEvent } from 'react'
import { cn } from '../lib/cn'
import { LOCALE_META, useFormat, useLocale, type Locale } from '../lib/i18n'
import { fieldClass, fieldWidth } from './Input'

const decimalSeparators = new Map<Locale, ',' | '.'>()

/** Separador decimal del idioma: «,» en es/pt/fr/de/it/tr, «.» en en. */
export function decimalSeparator(locale: Locale = 'es'): ',' | '.' {
  let sep = decimalSeparators.get(locale)
  if (!sep) {
    const part = new Intl.NumberFormat(LOCALE_META[locale]?.intl ?? 'es-CL').formatToParts(1.5).find((p) => p.type === 'decimal')
    sep = part?.value === '.' ? '.' : ','
    decimalSeparators.set(locale, sep)
  }
  return sep
}

/**
 * Normaliza un número escrito con separadores de miles y decimales a la notación de JS ("1249.5").
 * Tolerante: si aparecen los dos separadores, el último es el decimal (sirve «1.249,5» y «1,249.5»
 * en cualquier idioma); con uno solo, cuenta como miles solo si agrupa de a 3 («1.200», «1,200»).
 */
export function normalizeNumberInput(text: string, locale: Locale = 'es'): string | null {
  const t = text.replace(/[−–]/g, '-')
  const sign = t.startsWith('-') ? '-' : ''
  const body = sign ? t.slice(1) : t
  if (!/^[\d.,]+$/.test(body)) return null
  const dec = decimalSeparator(locale)
  const group = dec === ',' ? '.' : ','
  const grouped = (s: string, sep: string) => new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`).test(s)
  const hasDec = body.includes(dec)
  const hasGroup = body.includes(group)
  let out: string
  if (hasDec && hasGroup) {
    const decimal = body.lastIndexOf(dec) > body.lastIndexOf(group) ? dec : group
    const thousands = decimal === dec ? group : dec
    const parts = body.split(decimal)
    if (parts.length !== 2) return null
    out = `${parts[0].split(thousands).join('')}.${parts[1]}`
  } else if (hasDec) {
    const parts = body.split(dec)
    if (parts.length === 2) out = `${parts[0]}.${parts[1]}`
    else if (grouped(body, dec)) out = parts.join('')
    else return null
  } else if (hasGroup) {
    const parts = body.split(group)
    if (grouped(body, group)) out = parts.join('')
    else if (parts.length === 2) out = `${parts[0]}.${parts[1]}`
    else return null
  } else {
    out = body
  }
  return `${sign}${out}`
}

/**
 * Interpreta una medida escrita a mano según el idioma (por defecto español). Devuelve milímetros o null.
 *   es: "1200" · "1.200" · "1 200" · "1200,5" · "1.249,5" · "1200 mm" · "120 cm" · "1,2 m"
 *   en: "1200" · "1,200" · "1200.5" · "1,249.5" · "1.2 m"
 * Quien muestre el valor con `useFormat()` debe releerlo con el mismo `locale`.
 */
export function parseMeasure(text: string, locale: Locale = 'es'): number | null {
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
  const normalized = normalizeNumberInput(t, locale)
  if (normalized === null) return null
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return Math.round(n * factor * 10) / 10
}

/** "1200x1500", "1200 × 1500", "1,2 x 1,5 m" → { width, height } en mm (con las reglas del idioma). */
export function parseSize(text: string, locale: Locale = 'es'): { width: number; height: number } | null {
  const parts = text.split(/\s*[x×*]\s*/i)
  if (parts.length !== 2) return null
  // La unidad puede ir solo al final: "120 x 150 cm".
  const unit = parts[1].trim().match(/(mm|cm|m)$/i)?.[1] ?? ''
  const first = /(mm|cm|m)$/i.test(parts[0].trim()) ? parts[0] : `${parts[0]}${unit}`
  const width = parseMeasure(first, locale)
  const height = parseMeasure(parts[1], locale)
  if (width === null || height === null) return null
  return { width, height }
}

/** Texto para editar una medida: sin miles y con el decimal del idioma («1200,5» / «1200.5»). */
export function measureInputText(value: number, locale: Locale = 'es'): string {
  const text = String(value)
  return decimalSeparator(locale) === ',' ? text.replace('.', ',') : text
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
  const { locale } = useLocale()
  const fmt = useFormat()
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')
  const valueRef = useRef(value)
  valueRef.current = value
  // Evita confirmar dos veces el mismo texto (Enter y luego blur).
  const lastCommitRef = useRef<string | null>(null)
  // Seleccionar al enfocar espera un cuadro (el clic pondría el cursor encima). Si la primera tecla llega
  // antes, se selecciona ahí mismo: después ya no, o la segunda tecla borraría la primera.
  const selectPendingRef = useRef(false)

  const display = value === null || value === undefined ? '' : fmt.number(value, { maxDecimals: decimals })
  const editText = value === null || value === undefined ? '' : measureInputText(value, locale)

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
    const pair = parseSize(text, locale)
    if (pair) {
      if (onSizeInput) onSizeInput(pair)
      else commitNumber(pair.width)
      return
    }
    const n = parseMeasure(text, locale)
    if (n === null) {
      setDraft(editText) // vuelve al último valor válido, sin regañar
      return
    }
    const next = commitNumber(n)
    setDraft(measureInputText(next, locale))
  }

  const nudge = (delta: number) => {
    const base = valueRef.current ?? min ?? 0
    const next = commitNumber(base + delta)
    setDraft(measureInputText(next, locale))
  }

  // Si el valor cambia desde fuera mientras editas (deshacer, "1200x1500"), el borrador lo sigue.
  useEffect(() => {
    if (!focused) return
    if (parseMeasure(draft, locale) !== value) {
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
    if (selectPendingRef.current) {
      selectPendingRef.current = false
      event.currentTarget.select()
    }
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
          if (selectOnFocus) {
            const input = event.target
            selectPendingRef.current = true
            requestAnimationFrame(() => {
              if (!selectPendingRef.current) return
              selectPendingRef.current = false
              input.select()
            })
          }
          onFocus?.(event)
        }}
        onBlur={(event) => {
          selectPendingRef.current = false
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
          const n = parseMeasure(text, locale)
          if (n !== null && (min === undefined || n >= min) && (max === undefined || n <= max)) onChange(n)
        }}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData('text')
          const pair = parseSize(pasted, locale)
          if (pair && onSizeInput) {
            event.preventDefault()
            onSizeInput(pair)
          }
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          fieldClass,
          'w-full dim px-3 text-right',
          height,
          unit ? (size === 'lg' ? 'pr-14' : 'pr-10') : '',
          inputClassName,
        )}
        // Unidades largas («días», «Tage», «giorni») no caben en el relleno fijo: lo ampliamos
        // según su largo (≈ 0,6 em por letra) para que el número nunca las pise.
        {...props}
        style={unit && unit.length > 2 ? { paddingRight: `calc(1.25rem + ${unit.length * (size === 'lg' ? 10 : 7)}px)`, ...props.style } : props.style}
      />
      {unit ? (
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute right-3 text-fg-muted',
            size === 'lg' ? 'text-base' : 'text-meta',
          )}
        >
          {unit}
        </span>
      ) : null}
    </div>
  )
}
