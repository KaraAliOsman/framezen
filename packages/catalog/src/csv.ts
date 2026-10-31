/**
 * Lectura de CSV y del formato «MisPrecios» (exportación de listas de precios por marca).
 * Formato real: UTF-8 con BOM, CRLF, separador «;», coma decimal y dos columnas sin
 * nombre entre Color y Precio («$» y «CLP»). Campos entre comillas al estilo RFC 4180.
 */
import { normalizeKey, parseDecimal } from './text'

/** Separa un CSV en filas y campos. Respeta comillas, comillas dobladas y saltos CRLF/LF. */
export function parseCsv(text: string, delimiter = ';'): string[][] {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i++
        } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"' && field === '') quoted = true
    else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''))
}

export interface MisPreciosRow {
  /** ID del ítem en la plataforma de origen (único global). */
  id: string
  brand: string
  /** Tipo completo, p. ej. «Perfil · Marco». */
  type: string
  /** Grupo antes del «·»: Perfil, Herraje, Accesorios, Vidrio, Instalación… */
  group: string
  /** Subtipo después del «·» (vacío si no hay). */
  subtype: string
  code: string
  description: string
  line: string
  color: string
  currency: string
  /** Precio de lista en la moneda indicada (0 si viene vacío o ilegible). */
  price: number
  /** Texto original del precio. */
  priceText: string
}

type Field = 'id' | 'brand' | 'type' | 'code' | 'description' | 'line' | 'color' | 'price'

const HEADER_ALIASES: Record<Field, string[]> = {
  id: ['ID', 'ID ITEM', 'ITEM'],
  brand: ['MARCA', 'FABRICA', 'PROVEEDOR'],
  type: ['TIPO'],
  code: ['CODIGO', 'COD', 'SKU'],
  description: ['DESCRIPCION', 'NOMBRE', 'DETALLE'],
  line: ['LINEA', 'SERIE'],
  color: ['COLOR'],
  price: ['PRECIO', 'PRECIO LISTA', 'VALOR'],
}

// Posiciones del formato exportado cuando la cabecera no se reconoce.
const DEFAULT_POSITIONS: Record<Field, number> = { id: 0, brand: 1, type: 2, code: 3, description: 4, line: 5, color: 6, price: 9 }

function detectDelimiter(firstLine: string): string {
  const semicolons = (firstLine.match(/;/g) ?? []).length
  const commas = (firstLine.match(/,/g) ?? []).length
  const tabs = (firstLine.match(/\t/g) ?? []).length
  if (tabs > semicolons && tabs > commas) return '\t'
  return commas > semicolons ? ',' : ';'
}

/** Divide «Perfil · Marco» en grupo y subtipo (separador «·» con o sin espacios). */
export function splitType(type: string): { group: string; subtype: string } {
  const [group = '', ...rest] = type.split(/\s*[·•]\s*/)
  return { group: group.trim(), subtype: rest.join(' · ').trim() }
}

/**
 * Lee un CSV «MisPrecios». Tolera BOM, CRLF, separador «;» (o «,»/tab detectado),
 * coma decimal, columnas sin nombre y cabeceras con o sin tildes. Nunca lanza: las
 * filas sin descripción ni código se omiten.
 */
export function parseMisPreciosCsv(text: string): MisPreciosRow[] {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const newline = clean.search(/\r?\n/)
  const firstLine = newline >= 0 ? clean.slice(0, newline) : clean
  const table = parseCsv(clean, detectDelimiter(firstLine))
  if (table.length === 0) return []

  const header = table[0].map((cell) => normalizeKey(cell))
  const positions: Partial<Record<Field, number>> = {}
  for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
    const index = header.findIndex((cell) => HEADER_ALIASES[field].includes(cell))
    if (index >= 0) positions[field] = index
  }
  const hasHeader = positions.description !== undefined || positions.price !== undefined
  const pos = (field: Field) => (hasHeader ? positions[field] : DEFAULT_POSITIONS[field])
  // Columnas sin nombre: la que trae un código de moneda (CLP, USD, UF…).
  const unnamed = header.map((cell, index) => (cell === '' ? index : -1)).filter((index) => index >= 0)

  const rows: MisPreciosRow[] = []
  for (const cells of hasHeader ? table.slice(1) : table) {
    const get = (field: Field) => {
      const index = pos(field)
      return index === undefined ? '' : (cells[index] ?? '').trim()
    }
    const description = get('description')
    const code = get('code')
    if (!description && !code) continue
    const priceText = get('price')
    const parsed = parseDecimal(priceText)
    const currencyCell = unnamed.map((index) => (cells[index] ?? '').trim()).find((value) => /^[A-Z]{2,4}$/.test(value))
    const type = get('type')
    const { group, subtype } = splitType(type)
    rows.push({
      id: get('id'),
      brand: get('brand'),
      type,
      group,
      subtype,
      code,
      description,
      line: get('line'),
      color: get('color'),
      currency: currencyCell ?? 'CLP',
      price: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
      priceText,
    })
  }
  return rows
}
