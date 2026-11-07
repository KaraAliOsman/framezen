/**
 * RUT chileno en la interfaz: limpieza, dígito verificador (módulo 11) y formato 12.345.678-5.
 * La validación es SIEMPRE un aviso suave: nunca impide guardar ni cotizar (SPEC §1.2).
 * Mismo algoritmo que apps/server/src/lib/rut.ts, para que el aviso del navegador y el del
 * servidor digan lo mismo.
 */
import type { Locale } from '@dekopen/shared'
import { translate } from '../../lib/i18n'
import es from './i18n/es'

/** Deja solo dígitos y K (en mayúscula). */
export function cleanRut(value: string): string {
  return value.replace(/[^0-9kK]/g, '').toUpperCase()
}

/** Dígito verificador para el cuerpo numérico del RUT. */
export function rutCheckDigit(body: string): string {
  let sum = 0
  let factor = 2
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * factor
    factor = factor === 7 ? 2 : factor + 1
  }
  const dv = 11 - (sum % 11)
  return dv === 11 ? '0' : dv === 10 ? 'K' : String(dv)
}

export function isValidRut(value: string): boolean {
  const clean = cleanRut(value)
  if (clean.length < 2) return false
  const body = clean.slice(0, -1)
  if (!/^\d{1,9}$/.test(body)) return false
  return rutCheckDigit(body) === clean.slice(-1)
}

/** Formatea si es válido; si no, devuelve lo escrito tal cual (nunca se pierde lo que tipeaste). */
export function formatRut(value: string): string {
  const trimmed = value.trim()
  if (!isValidRut(trimmed)) return trimmed
  const clean = cleanRut(trimmed)
  const body = clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${body}-${clean.slice(-1)}`
}

export type RutStatus = 'empty' | 'incomplete' | 'valid' | 'invalid'

/** Estado del RUT escrito: vacío, a medio escribir, válido o con dígito que no calza. */
export function rutStatus(value: string | null | undefined): RutStatus {
  const clean = cleanRut(value ?? '')
  if (!clean) return 'empty'
  // Menos de 7 caracteres útiles: seguramente lo están escribiendo.
  if (clean.length < 7) return 'incomplete'
  return isValidRut(clean) ? 'valid' : 'invalid'
}

/**
 * Aviso en lenguaje humano (o null si no hay nada que decir). Pensado para mostrarse bajo el
 * campo en color de aviso, nunca como error que bloquea. `locale` = idioma del texto (por
 * defecto, el de la interfaz; el portal pasa el del documento).
 */
export function rutHint(value: string | null | undefined, locale?: Locale): string | null {
  const status = rutStatus(value)
  if (status !== 'invalid') return null
  const clean = cleanRut(value ?? '')
  const expected = rutCheckDigit(clean.slice(0, -1))
  if (!/^\d+$/.test(clean.slice(0, -1))) return translate(es, 'rut.letters', undefined, locale)
  return translate(es, 'rut.checkDigit', { expected }, locale)
}
