/**
 * Utilidades de texto para el intérprete local del navegador: plegado sin tildes ni mayúsculas
 * (incluida la ı/İ turca) y prefijo común.
 */

/** Minúsculas sin tildes, con la i turca plegada; conserva el largo de la mayoría de los textos. */
export function fold(text: string): string {
  return text
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
}

/** Prefijo común más largo de varios textos (sin cortar a mitad de un par sustituto). */
export function commonPrefix(values: readonly string[]): string {
  if (!values.length) return ''
  let prefix = values[0]
  for (const value of values.slice(1)) {
    let i = 0
    // Igualdad directa primero; plegar solo cuando difieren (mayúsculas, tildes).
    while (i < prefix.length && i < value.length && (prefix[i] === value[i] || fold(prefix[i]) === fold(value[i]))) i++
    prefix = prefix.slice(0, i)
    if (!prefix) break
  }
  return prefix
}

/** ¿`text` empieza con `prefix` sin mirar tildes ni mayúsculas? */
export function startsWithFolded(text: string, prefix: string): boolean {
  return fold(text).startsWith(fold(prefix))
}
