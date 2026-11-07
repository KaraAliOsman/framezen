/**
 * Última barrera de la regla «el total sólo al final»: un texto escrito a mano (carta, condiciones,
 * nota de una ventana, título) puede traer la cifra del total. Se reconoce con o sin separadores y se
 * reemplaza por una remisión al cierre. Las cifras del documento no pasan por aquí: salen del motor.
 */

/** Patrón del monto entero (`2.674.538`, `2,674,538`, `2 674 538`, `$2674538`), o nada si es muy corto. */
export function totalPattern(total: number): RegExp | null {
  const digits = String(Math.round(Math.abs(total)))
  if (!(digits.length >= 4)) return null
  const head = digits.length % 3
  const groups = [...(head ? [digits.slice(0, head)] : []), ...(digits.slice(head).match(/\d{3}/g) ?? [])]
  const body = groups.join(`[.,\\s\\u00A0\\u202F']?`)
  return new RegExp(`(?<![\\d.,])(?:(?:[$€£₺]|CLP|USD|EUR|TRY|BRL)\\s*)?${body}(?:[.,]\\d{1,2})?(?![\\d])`, 'g')
}

export type TotalGuard = (text: string) => string

export function totalGuard(total: number, replacement: string): TotalGuard {
  const pattern = totalPattern(total)
  if (!pattern) return (text) => text
  return (text) => (text ? text.replace(pattern, replacement) : text)
}
