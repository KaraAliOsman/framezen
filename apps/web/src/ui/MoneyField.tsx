import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import { currencyFractionDigits, DEFAULT_CURRENCY } from '@dekopen/shared'
import { cn } from '../lib/cn'
import { LOCALE_META, useLocale, useOrgCurrency, type Locale } from '../lib/i18n'
import { fieldClass, fieldWidth } from './Input'
import { normalizeNumberInput } from './NumberField'

/** "$ 1.234.567" → 1234567. Montos enteros (pesos chilenos): acepta texto con o sin separadores. */
export function parseCLP(text: string): number | null {
  const negative = /^\s*[-−]/.test(text)
  const digits = text.replace(/\D/g, '')
  if (!digits) return null
  const n = Number(digits)
  return negative ? -n : n
}

export interface MoneyLocaleOptions {
  locale?: Locale
  /** Código ISO 4217; por defecto CLP. */
  currency?: string
}

interface MoneyShape {
  /** Símbolo o código de la moneda tal como lo escribe el idioma («$», «€», «R$», «CLP»). */
  symbol: string
  position: 'prefix' | 'suffix'
  group: string
  decimal: string
  digits: number
}

const shapes = new Map<string, MoneyShape>()

/** Cómo escribe un idioma los montos de una moneda (símbolo, lado, separadores y decimales). */
export function moneyShape({ locale = 'es', currency = DEFAULT_CURRENCY }: MoneyLocaleOptions = {}): MoneyShape {
  const code = currency.toUpperCase()
  const key = `${locale}|${code}`
  let shape = shapes.get(key)
  if (shape) return shape
  const digits = currencyFractionDigits(code)
  let symbol = code
  let position: MoneyShape['position'] = 'prefix'
  let group = '.'
  let decimal = ','
  try {
    const tag = LOCALE_META[locale]?.intl ?? 'es-CL'
    const parts = new Intl.NumberFormat(tag, { style: 'currency', currency: code }).formatToParts(1234.5)
    const currencyIndex = parts.findIndex((p) => p.type === 'currency')
    const integerIndex = parts.findIndex((p) => p.type === 'integer')
    symbol = parts[currencyIndex]?.value ?? code
    position = currencyIndex > integerIndex ? 'suffix' : 'prefix'
    const numberParts = new Intl.NumberFormat(tag).formatToParts(1234567.5)
    group = numberParts.find((p) => p.type === 'group')?.value ?? group
    decimal = numberParts.find((p) => p.type === 'decimal')?.value ?? decimal
  } catch {
    // Moneda desconocida: el código, a la izquierda, con separadores del español.
  }
  shape = { symbol, position, group, decimal, digits }
  shapes.set(key, shape)
  return shape
}

function groupDigits(digits: string, sep: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep)
}

/**
 * Monto según el idioma y la moneda. Enteros (CLP) → 1234567; con decimales (EUR, USD) → 1234.5.
 * Acepta separadores del idioma y, por tolerancia, los del otro sistema («1.234,50» o «1,234.50»).
 */
export function parseMoney(text: string, options: MoneyLocaleOptions = {}): number | null {
  const shape = moneyShape(options)
  if (shape.digits === 0) return parseCLP(text)
  const negative = /^\s*[-−]/.test(text)
  const cleaned = text.replace(/[^\d.,]/g, '')
  if (!/\d/.test(cleaned)) return null
  const normalized = normalizeNumberInput(cleaned, options.locale ?? 'es')
  if (normalized === null) return null
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  const factor = 10 ** shape.digits
  const rounded = Math.round(Math.abs(n) * factor) / factor
  return negative ? -rounded : rounded
}

/** Monto para un campo (sin símbolo): «1.234.567» en es (CLP), «1,234.50» en en (USD), «1.234,50» en de (EUR). */
export function formatMoneyInput(value: number, options: MoneyLocaleOptions = {}): string {
  const shape = moneyShape(options)
  const abs = Math.abs(value)
  const [int, frac = ''] = abs.toFixed(shape.digits).split('.')
  const body = groupDigits(int, shape.group) + (shape.digits > 0 ? `${shape.decimal}${frac}` : '')
  return `${value < 0 ? '−' : ''}${body}`
}

/** Texto para editar con decimales: sin miles, con el decimal del idioma y solo los decimales que hay. */
function editableMoney(value: number, shape: MoneyShape): string {
  const factor = 10 ** shape.digits
  const text = String(Math.round(Math.abs(value) * factor) / factor)
  return `${value < 0 ? '−' : ''}${shape.decimal === '.' ? text : text.replace('.', shape.decimal)}`
}

export interface MoneyFieldProps
  extends Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'size' | 'defaultValue' | 'min' | 'max'> {
  value: number | null
  onChange: (value: number | null) => void
  allowNegative?: boolean
  size?: 'md' | 'lg'
  /** Texto a la derecha (p. ej. «+ IVA», «/m²»). */
  suffix?: string
  /** Moneda del monto (por defecto, la de la empresa; CLP si aún no se sabe). */
  currency?: string
  /** Clases del input (className va al contenedor: ancho y márgenes). */
  inputClassName?: string
}

/**
 * Monto en la moneda de la empresa con el formato del idioma. En pesos chilenos (sin decimales)
 * agrupa los miles mientras escribes; con monedas de decimales (EUR, USD…) edita el número tal cual
 * y lo muestra agrupado al salir. El símbolo va donde lo pone el idioma («$», «R$», «… €»).
 */
export function MoneyField({
  value,
  onChange,
  allowNegative = false,
  size = 'md',
  suffix,
  currency: currencyProp,
  className,
  inputClassName,
  onFocus,
  onBlur,
  ...props
}: MoneyFieldProps) {
  const { locale } = useLocale()
  const orgCurrency = useOrgCurrency()
  const currency = (currencyProp ?? orgCurrency ?? DEFAULT_CURRENCY).toUpperCase()
  const shape = useMemo(() => moneyShape({ locale, currency }), [locale, currency])
  const inputRef = useRef<HTMLInputElement>(null)
  // Dígitos a la derecha del cursor, para reponerlo tras reformatear.
  const caretFromEnd = useRef<number | null>(null)
  const [negativeDraft, setNegativeDraft] = useState(false)
  // Con decimales: borrador libre mientras el campo tiene el foco.
  const [draft, setDraft] = useState<string | null>(null)
  const decimals = shape.digits > 0

  const grouped =
    value === null || value === undefined
      ? negativeDraft
        ? '−'
        : ''
      : `${value < 0 ? '−' : ''}${groupDigits(String(Math.abs(Math.round(value))), shape.group)}`
  const text = decimals ? (draft ?? (value === null || value === undefined ? '' : formatMoneyInput(value, { locale, currency }))) : grouped

  // Si el valor cambia desde fuera mientras se edita (deshacer), el borrador lo sigue.
  useEffect(() => {
    setDraft((current) =>
      current === null || parseMoney(current, { locale, currency }) === value
        ? current
        : value === null || value === undefined
          ? ''
          : editableMoney(value, shape),
    )
  }, [value, locale, currency, shape])

  useLayoutEffect(() => {
    const el = inputRef.current
    if (decimals || !el || caretFromEnd.current === null || document.activeElement !== el) return
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
  const prefix = shape.position === 'prefix' ? shape.symbol : null
  const right = [shape.position === 'suffix' ? shape.symbol : null, suffix].filter(Boolean).join(' ')
  // «$» cabe en 28 px (como siempre); símbolos más largos («R$», «CLP») ensanchan el margen.
  const padLeft = prefix ? (prefix.length <= 1 ? undefined : `calc(${prefix.length}ch + 1.25rem)`) : undefined
  const padRight = shape.position === 'suffix' ? `calc(${right.length}ch + 1.25rem)` : undefined

  return (
    <div className={cn('relative flex items-center', fieldWidth(className), className)}>
      {prefix ? (
        <span aria-hidden="true" className="pointer-events-none absolute left-3 text-fg-muted">
          {prefix}
        </span>
      ) : null}
      <input
        ref={inputRef}
        type="text"
        inputMode={decimals ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={text}
        onFocus={(event) => {
          if (decimals) setDraft(value === null || value === undefined ? '' : editableMoney(value, shape))
          onFocus?.(event)
        }}
        onBlur={(event) => {
          if (decimals) setDraft(null)
          onBlur?.(event)
        }}
        onChange={(event) => {
          const raw = event.target.value
          const isNegative = allowNegative && /^\s*[-−]/.test(raw)
          if (decimals) {
            setDraft(raw)
            const parsed = parseMoney(raw, { locale, currency })
            if (parsed === null) onChange(null)
            else onChange(isNegative ? -Math.abs(parsed) : Math.abs(parsed))
            return
          }
          const caret = event.target.selectionStart ?? raw.length
          caretFromEnd.current = raw.slice(caret).replace(/\D/g, '').length
          const parsed = parseCLP(raw)
          setNegativeDraft(isNegative && parsed === null)
          if (parsed === null) onChange(null)
          else onChange(isNegative ? -Math.abs(parsed) : Math.abs(parsed))
        }}
        className={cn(
          fieldClass,
          'w-full tabular text-right',
          prefix ? 'pl-7' : 'pl-3',
          height,
          right ? (suffix ? 'pr-16' : 'pr-8') : 'pr-3',
          inputClassName,
        )}
        style={{ paddingLeft: padLeft, paddingRight: padRight }}
        {...props}
      />
      {right ? (
        <span aria-hidden="true" className="pointer-events-none absolute right-3 text-table text-fg-muted">
          {right}
        </span>
      ) : null}
    </div>
  )
}
