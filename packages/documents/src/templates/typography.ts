/**
 * Detalles tipográficos del texto escrito a mano: comillas curvas, raya y semirraya, puntos
 * suspensivos, espacio fino antes de unidades y «N°» que no se separa de su número. No toca cifras ni
 * el sentido del texto, y es idempotente.
 */
const NBSP = ' '

export function fineType(text: string): string {
  if (!text) return text
  return text
    .replace(/\.\.\./g, '…')
    .replace(/(^|[\s(\[«])"(?=\S)/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(^|[\s(\[])'(?=\S)/g, '$1‘')
    .replace(/(\p{L})'(\p{L})/gu, '$1’$2')
    .replace(/(\d)\s?-\s?(\d)(?=\s|$|[,.;:)])/g, (match, a: string, b: string) => (match.includes(' ') ? `${a}–${b}` : match))
    .replace(/\s--?\s/g, ' – ')
    .replace(/\b(N[°ºo]\.?)\s+(?=\d)/g, `$1${NBSP}`)
    .replace(/(\d)\s(mm|cm|m|m²|%|días|dias|days)(?=[\s,.;:)]|$)/g, `$1${NBSP}$2`)
}
