/** Utilidades de texto puras (seguras para navegador). */

export function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Clave de comparación: sin tildes, mayúsculas, espacios colapsados. */
export function normalizeKey(value: string): string {
  return stripAccents(value).toUpperCase().replace(/\s+/g, ' ').trim()
}

/** Identificador estable en minúsculas con guiones. */
export function slug(value: string): string {
  const out = stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return out || 'x'
}

/** Quita marcadores de proveedor (** NO USAR **, +++ELIMINAR+++, «*» sueltos) y colapsa espacios. */
export function cleanLabel(value: string): string {
  return value
    .replace(/\*{2,}[^*]*\*{2,}/g, ' ')
    .replace(/\+{3}[^+]*\+{3}/g, ' ')
    .replace(/\s\*+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim()
}

/** «ROBLE DORADO» → «Roble dorado» (mayúscula inicial, estilo de interfaz). */
export function sentenceCase(value: string): string {
  const lower = value.toLocaleLowerCase('es-CL').trim()
  return lower.charAt(0).toLocaleUpperCase('es-CL') + lower.slice(1)
}

/** Número con coma o punto decimal («26528,00», «1.234,5», «55.3»). NaN si no es número. */
export function parseDecimal(raw: string): number {
  let text = raw.replace(/[$\s]/g, '').replace(/CLP/i, '')
  if (!text) return Number.NaN
  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  if (lastComma >= 0 && lastDot >= 0) {
    text = lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '')
  } else if (lastComma >= 0) {
    text = text.replace(',', '.')
  }
  if (!/^-?\d+(\.\d+)?$/.test(text)) return Number.NaN
  return Number(text)
}

/** Redondeo a 0,1 (resolución de medidas del motor). */
export function round1(value: number): number {
  return Math.round(value * 10) / 10
}

/** Valor más frecuente; en empate, el que apareció primero. */
export function mode<T>(values: T[], key: (value: T) => string = (v) => String(v)): T | undefined {
  const counts = new Map<string, { value: T; count: number; first: number }>()
  values.forEach((value, index) => {
    const k = key(value)
    const entry = counts.get(k)
    if (entry) entry.count++
    else counts.set(k, { value, count: 1, first: index })
  })
  let best: { value: T; count: number; first: number } | undefined
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count || (entry.count === best.count && entry.first < best.first)) best = entry
  }
  return best?.value
}
