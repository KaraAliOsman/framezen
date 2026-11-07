/** Validación amable: solo lo indispensable para entrar o crear la cuenta (textos en el idioma de la interfaz). */
import { translate } from '../../lib/i18n'
import es from './i18n/es'

export const MIN_PASSWORD = 8

export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export function emailError(email: string): string | undefined {
  if (!email.trim()) return translate(es, 'validation.emailRequired')
  if (!looksLikeEmail(email)) return translate(es, 'validation.emailInvalid')
  return undefined
}

export function passwordError(password: string): string | undefined {
  if (!password) return translate(es, 'validation.passwordRequired')
  if (password.length < MIN_PASSWORD) return translate(es, 'validation.passwordShort', { min: MIN_PASSWORD })
  return undefined
}
