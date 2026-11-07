/**
 * Formatos por idioma (plan v5 §4.B). En español delegan en los formateadores deterministas del
 * motor (`$1.234.567`, `1.200 × 1.500 mm`, `1,95 m²`, `35 %`), así que la salida en `es` es
 * idéntica byte a byte a la de hoy y no depende del ICU del entorno. En los demás idiomas usan
 * `Intl` con la etiqueta del idioma (`en-US`, `pt-BR`, `fr-FR`, `de-DE`, `it-IT`, `tr-TR`).
 *
 * Convenciones comunes: signo menos tipográfico (−), cantidades ya en su unidad (mm, m², %) y
 * fechas en la zona horaria del negocio (por defecto America/Santiago).
 */
import { formatArea as esArea, formatCLP, formatMeters as esMeters, formatMM as esMm, formatPct as esPct, roundHalfUp } from '@dekopen/engine'
import { DEFAULT_CURRENCY, DEFAULT_LOCALE, DEFAULT_TIME_ZONE, intlTag, type Locale } from './locales'

const MINUS = '−'

export interface LocaleOption {
  /** Idioma de salida (por defecto español). */
  locale?: Locale
}

export interface NumberFormatOptions extends LocaleOption {
  /** Máximo de decimales (los ceros sobrantes no se muestran). Por defecto 0. */
  maxDecimals?: number
  /** Mínimo de decimales. Por defecto 0. */
  minDecimals?: number
}

export interface MoneyFormatOptions extends LocaleOption {
  /** Código ISO 4217 (`CLP`, `EUR`, `USD`, `BRL`, `TRY`…). Por defecto CLP. */
  currency?: string
  /** Decimales fijos; por defecto los de la moneda (CLP 0, EUR/USD 2). */
  fractionDigits?: number
  /** `always` antepone `+` a los positivos (variaciones, ajustes). */
  sign?: 'auto' | 'always'
}

export interface DateFormatOptions extends LocaleOption {
  /**
   * - `short`: numérica (`31-10-2026` en es, `10/31/2026` en en, `31.10.2026` en de);
   * - `long`: `31 de octubre de 2026`; `dayMonth`: `31 de octubre`; `monthYear`: `octubre de 2026`;
   * - `weekday`: `sábado, 31 de octubre`.
   */
  style?: 'short' | 'long' | 'dayMonth' | 'monthYear' | 'weekday'
  timeZone?: string
}

export type DateInput = string | number | Date

// ── Utilidades internas ─────────────────────────────────────────────────────

const numberFormats = new Map<string, Intl.NumberFormat>()

function numberFormat(locale: Locale, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let nf = numberFormats.get(key)
  if (!nf) {
    nf = new Intl.NumberFormat(intlTag(locale), options)
    numberFormats.set(key, nf)
  }
  return nf
}

const dateFormats = new Map<string, Intl.DateTimeFormat>()

function dateFormat(locale: Locale, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let df = dateFormats.get(key)
  if (!df) {
    df = new Intl.DateTimeFormat(intlTag(locale), options)
    dateFormats.set(key, df)
  }
  return df
}

/** Une las partes de `formatToParts` sin el signo (lo pone el llamador, tipográfico). */
function unsigned(parts: Intl.NumberFormatPart[]): string {
  return parts
    .filter((p) => p.type !== 'minusSign' && p.type !== 'plusSign')
    .map((p) => p.value)
    .join('')
    .trim()
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0
}

function clampDigits(n: number | undefined, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(20, Math.max(0, Math.round(n))) : fallback
}

/** Número con punto de miles y coma decimal, idéntico al formateador del motor (HALF_UP). */
function esNumber(value: number, maxDecimals: number, minDecimals: number): string {
  const rounded = roundHalfUp(finite(value), maxDecimals)
  const [int, frac = ''] = Math.abs(rounded).toFixed(maxDecimals).split('.')
  let decimals = frac.replace(/0+$/, '')
  while (decimals.length < minDecimals) decimals += '0'
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const body = decimals ? `${grouped},${decimals}` : grouped
  return rounded < 0 ? `${MINUS}${body}` : body
}

function intlNumber(value: number, locale: Locale, maxDecimals: number, minDecimals: number): string {
  const v = finite(value)
  const nf = numberFormat(locale, { maximumFractionDigits: maxDecimals, minimumFractionDigits: Math.min(minDecimals, maxDecimals) })
  const parts = nf.formatToParts(Math.abs(v))
  const body = unsigned(parts)
  const isZero = !parts.some((p) => (p.type === 'integer' || p.type === 'fraction') && /[1-9]/.test(p.value))
  return v < 0 && !isZero ? `${MINUS}${body}` : body
}

function toDate(input: DateInput): Date {
  return input instanceof Date ? input : new Date(input)
}

// ── Números, dinero y medidas ───────────────────────────────────────────────

/** Número del idioma: `1.249,5` (es/de/pt/it/tr), `1,249.5` (en), `1 249,5` (fr). */
export function formatNumber(value: number, options: NumberFormatOptions = {}): string {
  const locale = options.locale ?? DEFAULT_LOCALE
  const max = clampDigits(options.maxDecimals, 0)
  const min = Math.min(clampDigits(options.minDecimals, 0), max)
  return locale === 'es' ? esNumber(value, max, min) : intlNumber(value, locale, max, min)
}

/** Decimales estándar de una moneda (CLP 0, EUR 2…). Una moneda desconocida usa 2. */
export function currencyFractionDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    return 2
  }
}

/**
 * Dinero con la moneda de la empresa y el formato del idioma.
 * `formatMoney(1234567)` → `$1.234.567`; `{ currency: 'EUR', locale: 'de' }` → `1.234,50 €`;
 * `{ currency: 'USD', locale: 'en' }` → `$1,234.50`; `{ currency: 'TRY', locale: 'tr' }` → `₺1.234,50`.
 */
export function formatMoney(amount: number, options: MoneyFormatOptions = {}): string {
  const locale = options.locale ?? DEFAULT_LOCALE
  const currency = (options.currency ?? DEFAULT_CURRENCY).toUpperCase()
  const value = finite(amount)
  const always = options.sign === 'always'
  if (locale === 'es' && currency === 'CLP' && options.fractionDigits === undefined) {
    const text = formatCLP(value)
    return always && roundHalfUp(value) > 0 ? `+${text}` : text
  }
  let body: string
  let isZero: boolean
  try {
    const digits = clampDigits(options.fractionDigits, currencyFractionDigits(currency))
    const nf = numberFormat(locale, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits })
    const parts = nf.formatToParts(Math.abs(value))
    body = unsigned(parts)
    isZero = !parts.some((p) => (p.type === 'integer' || p.type === 'fraction') && /[1-9]/.test(p.value))
  } catch {
    // Código de moneda inválido: el número y el código, sin romper la pantalla.
    body = `${formatNumber(Math.abs(value), { locale, maxDecimals: 2, minDecimals: 2 })} ${currency}`
    isZero = roundHalfUp(Math.abs(value), 2) === 0
  }
  if (isZero) return body
  if (value < 0) return `${MINUS}${body}`
  return always ? `+${body}` : body
}

/** Milímetros con resolución 0,1 y decimales solo si existen: `1.200`, `554,5` (sin unidad). */
export function formatMm(mm: number, options: LocaleOption & { unit?: boolean } = {}): string {
  const locale = options.locale ?? DEFAULT_LOCALE
  const body = locale === 'es' ? esMm(mm) : intlNumber(mm, locale, 1, 0)
  return options.unit ? `${body} mm` : body
}

/** Ancho × alto: `1.500 × 1.200 mm` (es), `1,500 × 1,200 mm` (en), `1500 × 1200 mm` (it). */
export function formatSize(width: number, height: number, options: LocaleOption = {}): string {
  return `${formatMm(width, options)} × ${formatMm(height, options)} mm`
}

/** Superficie con dos decimales: `1,95 m²` / `1.95 m²`. */
export function formatArea(m2: number, options: LocaleOption = {}): string {
  const locale = options.locale ?? DEFAULT_LOCALE
  return locale === 'es' ? esArea(m2) : `${intlNumber(m2, locale, 2, 2)} m²`
}

/** Largo en metros desde milímetros, dos decimales: 4392 → `4,39 m`. */
export function formatMeters(mm: number, options: LocaleOption = {}): string {
  const locale = options.locale ?? DEFAULT_LOCALE
  return locale === 'es' ? esMeters(mm) : `${intlNumber(finite(mm) / 1000, locale, 2, 2)} m`
}

/** Porcentaje (0–100) con decimales solo si existen: `35 %` (es), `35%` (en), `%35` (tr), `35 %` (fr/de). */
export function formatPct(value: number, options: LocaleOption & { maxDecimals?: number } = {}): string {
  const locale = options.locale ?? DEFAULT_LOCALE
  const max = clampDigits(options.maxDecimals, 1)
  if (locale === 'es') return esPct(value, max)
  const v = finite(value)
  const parts = numberFormat(locale, { style: 'percent', maximumFractionDigits: max }).formatToParts(Math.abs(v) / 100)
  const body = unsigned(parts)
  const isZero = !parts.some((p) => (p.type === 'integer' || p.type === 'fraction') && /[1-9]/.test(p.value))
  return v < 0 && !isZero ? `${MINUS}${body}` : body
}

const DOC_NUMBER: Record<Locale, string> = {
  es: 'N°',
  en: 'No.',
  pt: 'Nº',
  fr: 'N°',
  de: 'Nr.',
  it: 'N.',
  tr: 'No.',
}

/** Número de documento: `N° 412` (es), `No. 412` (en), `Nr. 412` (de). */
export function formatDocNumber(n: number | string, options: LocaleOption = {}): string {
  return `${DOC_NUMBER[options.locale ?? DEFAULT_LOCALE]} ${n}`
}

/** Lista legible: `a, b y c` / `a, b, and c` / `a, b und c`. */
export function formatList(items: readonly string[], options: LocaleOption & { type?: 'conjunction' | 'disjunction' } = {}): string {
  const locale = options.locale ?? DEFAULT_LOCALE
  return new Intl.ListFormat(intlTag(locale), { type: options.type ?? 'conjunction', style: 'long' }).format(items)
}

// ── Fechas ──────────────────────────────────────────────────────────────────

const DATE_STYLES: Record<Exclude<NonNullable<DateFormatOptions['style']>, 'short'>, Intl.DateTimeFormatOptions> = {
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  dayMonth: { day: 'numeric', month: 'long' },
  monthYear: { month: 'long', year: 'numeric' },
  weekday: { weekday: 'long', day: 'numeric', month: 'long' },
}

/** Fecha en la zona del negocio. En español, `short` es `dd-mm-aaaa` (como hoy). */
export function formatDate(input: DateInput, options: DateFormatOptions = {}): string {
  const date = toDate(input)
  if (Number.isNaN(date.getTime())) return ''
  const locale = options.locale ?? DEFAULT_LOCALE
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE
  const style = options.style ?? 'short'
  if (style !== 'short') return dateFormat(locale, { timeZone, ...DATE_STYLES[style] }).format(date)
  const numeric = dateFormat(locale, { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' })
  if (locale !== 'es') return numeric.format(date)
  const parts = numeric.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('day')}-${get('month')}-${get('year')}`
}

/** Hora: `14:05` (es-CL), `2:05 PM` (en-US). */
export function formatTime(input: DateInput, options: LocaleOption & { timeZone?: string } = {}): string {
  const date = toDate(input)
  if (Number.isNaN(date.getTime())) return ''
  const locale = options.locale ?? DEFAULT_LOCALE
  // Reloj de 24 h salvo en inglés de EE. UU. (en Chile y Europa se lee «14:05», no «2:05 p. m.»).
  const hourCycle = locale === 'en' ? 'h12' : 'h23'
  return dateFormat(locale, { timeZone: options.timeZone ?? DEFAULT_TIME_ZONE, hour: 'numeric', minute: '2-digit', hourCycle }).format(date)
}

const JUST_NOW: Record<Locale, string> = {
  es: 'hace un momento',
  en: 'just now',
  pt: 'agora mesmo',
  fr: 'à l’instant',
  de: 'gerade eben',
  it: 'poco fa',
  tr: 'az önce',
}

const relativeFormats = new Map<string, Intl.RelativeTimeFormat>()

function relativeFormat(locale: Locale, style: 'short' | 'long', numeric: 'auto' | 'always'): Intl.RelativeTimeFormat {
  const key = `${locale}|${style}|${numeric}`
  let rtf = relativeFormats.get(key)
  if (!rtf) {
    rtf = new Intl.RelativeTimeFormat(intlTag(locale), { style, numeric })
    relativeFormats.set(key, rtf)
  }
  return rtf
}

/**
 * Tiempo relativo para listas: «hace un momento», «hace 5 min», «hace 2 h», «ayer», «hace 3 días»
 * y, desde una semana (o en el futuro), la fecha corta. En inglés: `just now`, `5 min. ago`,
 * `2 hr. ago`, `yesterday`, `3 days ago`.
 */
export function formatRelative(input: DateInput, options: LocaleOption & { now?: Date; timeZone?: string } = {}): string {
  const date = toDate(input)
  if (Number.isNaN(date.getTime())) return ''
  const locale = options.locale ?? DEFAULT_LOCALE
  const now = options.now ?? new Date()
  const diff = now.getTime() - date.getTime()
  const fallback = () => formatDate(date, { locale, timeZone: options.timeZone })
  if (diff < 0) return fallback()
  const min = Math.round(diff / 60_000)
  const hours = Math.floor(min / 60)
  const days = Math.floor(hours / 24)
  if (min < 1) return JUST_NOW[locale]
  if (locale === 'es') {
    // Literales de hoy (no dependen del ICU del entorno).
    if (min < 60) return `hace ${min} min`
    if (hours < 24) return `hace ${hours} h`
    if (days === 1) return 'ayer'
    if (days < 7) return `hace ${days} días`
    return fallback()
  }
  if (min < 60) return relativeFormat(locale, 'short', 'always').format(-min, 'minute')
  if (hours < 24) return relativeFormat(locale, 'short', 'always').format(-hours, 'hour')
  if (days === 1) return relativeFormat(locale, 'long', 'auto').format(-1, 'day')
  if (days < 7) return relativeFormat(locale, 'long', 'always').format(-days, 'day')
  return fallback()
}

// ── Formateador ligado a un idioma y una moneda ─────────────────────────────

export interface FormatterOptions {
  /** Moneda de la empresa (por defecto CLP). */
  currency?: string
  /** Zona horaria de las fechas (por defecto America/Santiago). */
  timeZone?: string
}

export interface Formatter {
  readonly locale: Locale
  readonly currency: string
  readonly timeZone: string
  money(amount: number, options?: Omit<MoneyFormatOptions, 'locale'>): string
  number(value: number, options?: Omit<NumberFormatOptions, 'locale'>): string
  mm(mm: number, options?: { unit?: boolean }): string
  size(width: number, height: number): string
  area(m2: number): string
  meters(mm: number): string
  pct(value: number, maxDecimals?: number): string
  date(input: DateInput, style?: DateFormatOptions['style']): string
  time(input: DateInput): string
  relative(input: DateInput, now?: Date): string
  list(items: readonly string[], type?: 'conjunction' | 'disjunction'): string
  docNumber(n: number | string): string
}

/** Formateador con idioma, moneda y zona fijados (servidor, documentos, `useFormat()` en la web). */
export function createFormatter(locale: Locale = DEFAULT_LOCALE, options: FormatterOptions = {}): Formatter {
  const currency = (options.currency || DEFAULT_CURRENCY).toUpperCase()
  const timeZone = options.timeZone || DEFAULT_TIME_ZONE
  return {
    locale,
    currency,
    timeZone,
    money: (amount, o = {}) => formatMoney(amount, { currency, ...o, locale }),
    number: (value, o = {}) => formatNumber(value, { ...o, locale }),
    mm: (mm, o = {}) => formatMm(mm, { ...o, locale }),
    size: (width, height) => formatSize(width, height, { locale }),
    area: (m2) => formatArea(m2, { locale }),
    meters: (mm) => formatMeters(mm, { locale }),
    pct: (value, maxDecimals) => formatPct(value, { locale, maxDecimals }),
    date: (input, style) => formatDate(input, { locale, style, timeZone }),
    time: (input) => formatTime(input, { locale, timeZone }),
    relative: (input, now) => formatRelative(input, { locale, now, timeZone }),
    list: (items, type) => formatList(items, { locale, type }),
    docNumber: (n) => formatDocNumber(n, { locale }),
  }
}
