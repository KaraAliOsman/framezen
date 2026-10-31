/** Validación amable: solo lo indispensable para entrar o crear la cuenta. */
export const MIN_PASSWORD = 8

export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export function emailError(email: string): string | undefined {
  if (!email.trim()) return 'Escribe tu correo.'
  if (!looksLikeEmail(email)) return 'Revisa el correo: parece que le falta algo (por ejemplo, @ o el dominio).'
  return undefined
}

export function passwordError(password: string): string | undefined {
  if (!password) return 'Escribe una contraseña.'
  if (password.length < MIN_PASSWORD) return `Usa al menos ${MIN_PASSWORD} caracteres.`
  return undefined
}
