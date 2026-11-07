/**
 * Etiquetas del historial de deshacer. Se guardan como **clave + parámetros** (la clave es la
 * identidad que agrupa cambios seguidos) y se traducen al mostrarse, así el menú de deshacer y los
 * avisos siguen el idioma actual aunque cambie a mitad de la edición (guía i18n §8).
 *
 * Una etiqueta puede ser:
 * - un texto ya listo (cambios que llegan de otros módulos con su propio texto);
 * - `{ key, params }` del espacio de cotizaciones;
 * - `{ ns, key, params }` de otro espacio (p. ej. el diseñador), que se traduce con su diccionario.
 * Los parámetros pueden ser otras etiquetas (anidadas) o cifras con formato del idioma.
 */
import type { MessageKey, MessageTree } from '@dekopen/shared'
import { getFormatter, getLocale, translate, type Locale } from '../../../lib/i18n'
import es from '../i18n/es'

export type QuotesKey = MessageKey<typeof es>

/** Cifra que se formatea al mostrarse (con el idioma de ese momento). */
export interface FormattedParam {
  format: 'pct' | 'money' | 'number'
  value: number
}

export type UndoParam = string | number | FormattedParam | UndoLabelDescriptor

export interface UndoLabelDescriptor {
  key: string
  params?: Record<string, UndoParam>
  /** Diccionario de otro espacio (por defecto, el de cotizaciones). */
  ns?: MessageTree
  /** Traductor propio de otro módulo (p. ej. los pasos del diseñador); manda sobre `ns`. */
  render?: (locale?: Locale) => string
}

export type UndoLabel = string | UndoLabelDescriptor

/** Etiqueta del espacio de cotizaciones (clave tipada). */
export function ql(key: QuotesKey, params?: Record<string, UndoParam>): UndoLabelDescriptor {
  return params ? { key, params } : { key }
}

export const pctParam = (value: number): FormattedParam => ({ format: 'pct', value })
export const moneyParam = (value: number): FormattedParam => ({ format: 'money', value })

function isDescriptor(value: unknown): value is UndoLabelDescriptor {
  return !!value && typeof value === 'object' && typeof (value as { key?: unknown }).key === 'string'
}

function isFormatted(value: unknown): value is FormattedParam {
  return !!value && typeof value === 'object' && typeof (value as { format?: unknown }).format === 'string' && typeof (value as { value?: unknown }).value === 'number'
}

/** Normaliza lo que llega de afuera (texto, descriptor u otra cosa) a una etiqueta válida. */
export function toUndoLabel(value: unknown, fallback: UndoLabel): UndoLabel {
  if (typeof value === 'string') return value.trim() ? value : fallback
  if (isDescriptor(value)) return value
  // Otros módulos pueden mandar { label } o { text } ya traducido.
  const text = (value as { label?: unknown; text?: unknown } | null)?.label ?? (value as { text?: unknown } | null)?.text
  return typeof text === 'string' && text.trim() ? text : fallback
}

/** Identidad estable (independiente del idioma) para agrupar cambios seguidos. */
export function undoLabelKey(label: UndoLabel): string {
  if (typeof label === 'string') return label
  const params = label.params
    ? Object.keys(label.params)
        .sort()
        .map((k) => {
          const v = label.params![k]
          return `${k}=${isDescriptor(v) ? `(${undoLabelKey(v)})` : isFormatted(v) ? `${v.format}:${v.value}` : String(v)}`
        })
        .join('&')
    : ''
  return `${label.key}${params ? `?${params}` : ''}`
}

function paramText(value: UndoParam, locale: Locale): string | number {
  if (isDescriptor(value)) return undoText(value, locale)
  if (isFormatted(value)) {
    const fmt = getFormatter({ locale })
    if (value.format === 'pct') return fmt.pct(value.value, 1)
    if (value.format === 'money') return fmt.money(value.value)
    return fmt.number(value.value, { maxDecimals: 2 })
  }
  return value
}

/** Texto de una etiqueta en el idioma actual (o el indicado). */
export function undoText(label: UndoLabel | null | undefined, locale: Locale = getLocale()): string {
  if (!label) return ''
  if (typeof label === 'string') return label
  if (label.render) return label.render(locale)
  const params: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(label.params ?? {})) params[k] = paramText(v, locale)
  const ns = (label.ns ?? es) as typeof es
  return translate(ns, label.key as QuotesKey, params, locale)
}
