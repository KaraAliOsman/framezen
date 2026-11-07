/**
 * Importar clientes desde una planilla: lectura de CSV/TSV (comillas, separador automático, BOM),
 * detección de columnas por encabezado en los 7 idiomas o por contenido, y armado de las filas a
 * crear sin duplicar a quienes ya están en la lista. Funciones puras: la hoja solo las conecta.
 */
import type { Client } from '@dekopen/shared'
import { normalizeSearch } from '../../../lib/format'
import { cleanRut } from '../rut'

export const CLIENT_FIELDS = ['name', 'phone', 'email', 'rut', 'address', 'city', 'notes'] as const
export type ClientField = (typeof CLIENT_FIELDS)[number]
export type ColumnTarget = ClientField | 'ignore'

export type ClientDraft = Partial<Record<ClientField, string>> & { name: string }

/** Tope por pasada (un taller con más clientes los sube en dos partes). */
export const IMPORT_MAX_ROWS = 1000
/** Tope del archivo. */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024
/** Largos que acepta el servidor. */
const MAX_LENGTH: Record<ClientField, number> = { name: 160, phone: 40, email: 254, rut: 20, address: 200, city: 80, notes: 4000 }

// ─────────────────────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────────────────────

/** Separador más probable mirando las primeras líneas (fuera de comillas). */
export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const sample = text.slice(0, 4000)
  const counts = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false
  let lines = 0
  for (let i = 0; i < sample.length && lines < 5; i++) {
    const ch = sample[i]!
    if (ch === '"') quoted = !quoted
    else if (!quoted && (ch === ',' || ch === ';' || ch === '\t')) counts[ch] += 1
    else if (!quoted && ch === '\n') lines += 1
  }
  if (counts['\t'] > 0 && counts['\t'] >= counts[';'] && counts['\t'] >= counts[',']) return '\t'
  return counts[';'] >= counts[','] && counts[';'] > 0 ? ';' : ','
}

/** CSV a filas (RFC 4180 tolerante: comillas dobles, saltos dentro de comillas, CRLF, BOM). */
export function parseCsv(text: string, delimiter: string = detectDelimiter(text)): string[][] {
  const src = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"'
          i += 1
        } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"' && cell.trim() === '') {
      quoted = true
      cell = ''
    } else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''))
}

// ─────────────────────────────────────────────────────────────────────────────
// Columnas
// ─────────────────────────────────────────────────────────────────────────────

/** Encabezados conocidos (sin tildes, minúsculas) en es, en, pt, fr, de, it y tr. */
const HEADER_WORDS: Record<ClientField, readonly string[]> = {
  name: [
    'nombre', 'nombres', 'cliente', 'razon social', 'nombre o razon social', 'contacto', 'empresa',
    'name', 'full name', 'client', 'customer', 'company', 'nome', 'nome completo', 'razao social',
    'nom', 'nom complet', 'raison sociale', 'societe', 'kunde', 'firma', 'vollstandiger name',
    'nominativo', 'ragione sociale', 'cliente', 'ad', 'ad soyad', 'adi soyadi', 'musteri', 'unvan', 'firma adi',
  ],
  phone: [
    'telefono', 'fono', 'celular', 'movil', 'whatsapp', 'tel', 'tel.', 'phone', 'mobile', 'cell', 'phone number',
    'telefone', 'telephone', 'portable', 'telefon', 'handy', 'mobilnummer', 'cellulare', 'telefono cellulare', 'cep', 'gsm', 'cep telefonu',
  ],
  email: ['correo', 'correo electronico', 'email', 'e-mail', 'mail', 'courriel', 'adresse e-mail', 'posta elettronica', 'e-posta', 'eposta'],
  rut: [
    'rut', 'run', 'rut empresa', 'dni', 'nif', 'cif', 'cuit', 'ruc', 'nit', 'rfc', 'tax id', 'vat', 'vat number',
    'cnpj', 'cpf', 'cnpj/cpf', 'siret', 'siren', 'tva', 'numero de tva', 'steuernummer', 'ust-idnr', 'ust-id',
    'partita iva', 'p. iva', 'p.iva', 'codice fiscale', 'vergi no', 'vergi numarasi', 'vkn', 'tckn', 'documento',
  ],
  address: ['direccion', 'domicilio', 'calle', 'address', 'street', 'endereco', 'adresse', 'anschrift', 'strasse', 'indirizzo', 'via', 'adres'],
  city: ['ciudad', 'comuna', 'localidad', 'city', 'town', 'cidade', 'municipio', 'ville', 'stadt', 'ort', 'citta', 'comune', 'sehir', 'il', 'ilce'],
  notes: [
    'notas', 'nota', 'observaciones', 'observacion', 'comentarios', 'comentario', 'notes', 'note', 'comments', 'remarks',
    'observacoes', 'remarques', 'commentaire', 'notizen', 'bemerkung', 'bemerkungen', 'osservazioni', 'notlar', 'aciklama', 'not',
  ],
}

const headerKey = (text: string) => normalizeSearch(text).replace(/[*:]+$/g, '').replace(/\s+/g, ' ').trim()

/** Campo de un encabezado conocido, o null. */
export function fieldForHeader(header: string): ClientField | null {
  const key = headerKey(header)
  if (!key) return null
  for (const field of CLIENT_FIELDS) if (HEADER_WORDS[field].includes(key)) return field
  // «Teléfono móvil», «E-mail contacto», «Nombre cliente»: la primera palabra manda.
  const first = key.split(' ')[0]!
  for (const field of CLIENT_FIELDS) if (first.length >= 3 && HEADER_WORDS[field].includes(first)) return field
  return null
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^\+?[\d\s().-]{7,20}$/
const RUT_LIKE = /^\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]$/

/** Qué parece una columna por su contenido (para planillas sin encabezado). */
function fieldForValues(values: readonly string[]): ClientField | null {
  const filled = values.filter(Boolean)
  if (filled.length === 0) return null
  const share = (re: RegExp) => filled.filter((v) => re.test(v)).length / filled.length
  if (share(EMAIL) >= 0.6) return 'email'
  if (share(RUT_LIKE) >= 0.6) return 'rut'
  if (share(PHONE) >= 0.6) return 'phone'
  return null
}

export interface CsvAnalysis {
  headers: string[]
  /** Filas de datos (sin el encabezado). */
  rows: string[][]
  hasHeader: boolean
  /** Qué campo es cada columna (por posición). */
  targets: ColumnTarget[]
}

/** Lee el texto y propone qué es cada columna. Nunca lanza. */
export function analyzeCsv(text: string): CsvAnalysis {
  const all = parseCsv(text)
  const width = all.reduce((m, r) => Math.max(m, r.length), 0)
  if (all.length === 0 || width === 0) return { headers: [], rows: [], hasHeader: false, targets: [] }
  const first = all[0]!
  const byHeader = Array.from({ length: width }, (_, i) => fieldForHeader(first[i] ?? ''))
  const hasHeader = byHeader.some((f) => f !== null)
  const rows = hasHeader ? all.slice(1) : all
  const headers = Array.from({ length: width }, (_, i) => (hasHeader ? first[i] || `${i + 1}` : `${i + 1}`))
  const targets: ColumnTarget[] = []
  const used = new Set<ClientField>()
  for (let i = 0; i < width; i++) {
    let field = byHeader[i] ?? null
    if (!field) field = fieldForValues(rows.slice(0, 50).map((r) => r[i] ?? ''))
    if (field && !used.has(field)) {
      used.add(field)
      targets.push(field)
    } else targets.push('ignore')
  }
  // Sin columna de nombre reconocida: la primera columna de texto libre es el nombre.
  if (!used.has('name')) {
    const i = targets.findIndex((t) => t === 'ignore')
    if (i >= 0) targets[i] = 'name'
  }
  return { headers, rows, hasHeader, targets }
}

// ─────────────────────────────────────────────────────────────────────────────
// Filas a crear
// ─────────────────────────────────────────────────────────────────────────────

export interface ImportPlan {
  drafts: ClientDraft[]
  /** Filas sin nombre (se omiten). */
  skippedEmpty: number
  /** Filas que ya están en la lista (mismo documento o mismo nombre) o repetidas en el archivo. */
  skippedDuplicate: number
  /** Filas que no entran en esta pasada (sobre IMPORT_MAX_ROWS). */
  truncated: number
}

const nameKey = (name: string) => normalizeSearch(name).replace(/\s+/g, ' ').trim()
const docKey = (rut: string | undefined | null) => {
  const clean = cleanRut(rut ?? '')
  return clean.length >= 6 ? clean : ''
}

/**
 * Arma los clientes a crear según qué es cada columna. `existing` = clientes ya guardados (para no
 * duplicar). `normalizeTaxId` = formato del documento (RUT chileno o tal cual).
 */
export function planImport(
  analysis: Pick<CsvAnalysis, 'rows'>,
  targets: readonly ColumnTarget[],
  existing: readonly Pick<Client, 'name' | 'rut'>[] = [],
  normalizeTaxId: (value: string) => string = (v) => v.trim(),
): ImportPlan {
  const names = new Set(existing.map((c) => nameKey(c.name)))
  const docs = new Set(existing.map((c) => docKey(c.rut)).filter(Boolean))
  const drafts: ClientDraft[] = []
  let skippedEmpty = 0
  let skippedDuplicate = 0
  let truncated = 0
  for (const row of analysis.rows) {
    const draft: Partial<Record<ClientField, string>> = {}
    targets.forEach((target, i) => {
      if (target === 'ignore') return
      const raw = (row[i] ?? '').trim()
      if (!raw) return
      const value = target === 'rut' ? normalizeTaxId(raw) : raw
      // Dos columnas al mismo campo (nombre + apellido): se juntan.
      draft[target] = (draft[target] ? `${draft[target]} ${value}` : value).slice(0, MAX_LENGTH[target])
    })
    const name = draft.name?.trim()
    if (!name) {
      skippedEmpty += 1
      continue
    }
    const nk = nameKey(name)
    const dk = docKey(draft.rut)
    if ((dk && docs.has(dk)) || (!dk && names.has(nk))) {
      skippedDuplicate += 1
      continue
    }
    if (drafts.length >= IMPORT_MAX_ROWS) {
      truncated += 1
      continue
    }
    names.add(nk)
    if (dk) docs.add(dk)
    drafts.push({ ...draft, name })
  }
  return { drafts, skippedEmpty, skippedDuplicate, truncated }
}
