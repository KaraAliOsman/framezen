/** RUT chileno: limpieza, validación módulo 11 y formato 12.345.678-5. */

export function cleanRut(value: string): string {
  return value.replace(/[^0-9kK]/g, '').toUpperCase()
}

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

/** Formatea si es válido; si no, devuelve el texto tal cual (nunca se pierde lo escrito). */
export function formatRut(value: string): string {
  const trimmed = value.trim()
  if (!isValidRut(trimmed)) return trimmed
  const clean = cleanRut(trimmed)
  const body = clean.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${body}-${clean.slice(-1)}`
}

/** Aviso suave (no bloquea) cuando el RUT no calza con su dígito verificador. */
export function rutWarning(value: string | undefined): string | undefined {
  if (!value || !value.trim()) return undefined
  return isValidRut(value) ? undefined : `El RUT ${value.trim()} no parece válido (el dígito verificador no calza). Lo guardamos igual por si acaso.`
}
