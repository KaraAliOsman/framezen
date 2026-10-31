/**
 * Paleta canónica de colores de perfil y normalización de los nombres que usan
 * los proveedores («ROBLE DOR», «GOLDEN OAK», «JET BLACK»…). Los hex son de dibujo.
 */
import type { Color } from '@framezen/engine'
import { normalizeKey, sentenceCase, slug } from './text'

interface PaletteEntry extends Color {
  aliases: string[]
  /** Sufijos de SKU que suelen indicar este color (para separar modelo y color). */
  suffixes: string[]
}

const PALETTE: PaletteEntry[] = [
  { id: 'blanco', name: 'Blanco', hex: '#F6F5F1', code: 'BL', aliases: ['BLANCO', 'BLANCA', 'WHITE', 'BCO', 'RAL 9016', 'BLANCO 9016'], suffixes: ['BLANCO', 'BLA', 'BL', 'B', 'W'] },
  { id: 'nogal', name: 'Nogal', hex: '#5B3A22', code: 'NO', aliases: ['NOGAL', 'WALNUT'], suffixes: ['NOGAL', 'NOG', 'NO'] },
  { id: 'nogal-oscuro', name: 'Nogal oscuro', hex: '#4A2E1B', code: 'NO', aliases: ['NOGAL OSCURO'], suffixes: ['NO', 'NOG'] },
  { id: 'nogal-claro', name: 'Nogal claro', hex: '#7A5232', code: 'NO', aliases: ['NOGAL CLARO'], suffixes: ['NO', 'NOG'] },
  { id: 'antracita', name: 'Antracita', hex: '#383E42', code: 'AN', aliases: ['ANTRACITA', 'GRIS ANTRACITA', 'RAL 7016', 'ANTHRACITE'], suffixes: ['ANT', 'AN', 'AT', 'A', 'GR'] },
  { id: 'grafito', name: 'Grafito', hex: '#43464B', code: 'GR', aliases: ['GRAFITO', 'GRIS GRAFITO'], suffixes: ['GRAF', 'GR', 'GF', 'AN'] },
  { id: 'negro', name: 'Negro', hex: '#0E0E10', code: 'NE', aliases: ['NEGRO', 'BLACK', 'JET BLACK', 'NEW BLACK', 'NEGRA'], suffixes: ['NEGRO', 'NEG', 'NE', 'NG', 'NB', 'JB', 'N'] },
  { id: 'negro-mate', name: 'Negro mate', hex: '#1A1A1C', code: 'NM', aliases: ['NEGRO MATE', 'MATT BLACK'], suffixes: ['NM', 'NE', 'N'] },
  { id: 'roble-dorado', name: 'Roble dorado', hex: '#A8692E', code: 'RD', aliases: ['ROBLE DORADO', 'ROBLE DOR', 'ROBLE DOR.', 'GOLDEN OAK', 'GOLDENOAK'], suffixes: ['RD', 'RO', 'GO', 'R'] },
  { id: 'roble', name: 'Roble', hex: '#B07D48', code: 'RO', aliases: ['ROBLE', 'OAK'], suffixes: ['RO', 'RD', 'R'] },
  { id: 'roble-montana', name: 'Roble montaña', hex: '#8A6A4A', code: 'RM', aliases: ['ROBLE MONTANA'], suffixes: ['RM'] },
  { id: 'roble-natural', name: 'Roble natural', hex: '#C19A6B', code: 'NO', aliases: ['NATURAL OAK', 'ROBLE NATURAL'], suffixes: ['NO'] },
  { id: 'roble-gris', name: 'Roble gris', hex: '#8B8378', code: 'GO', aliases: ['GREY OAK', 'GRAY OAK', 'ROBLE GRIS'], suffixes: ['GO'] },
  { id: 'winchester', name: 'Winchester', hex: '#7A4A2A', code: 'WI', aliases: ['WINCHESTER'], suffixes: ['WI'] },
  { id: 'titanio', name: 'Titanio', hex: '#8E9196', code: 'TI', aliases: ['TITANIO', 'GRIS METALIZADO'], suffixes: ['TIT', 'TI'] },
  { id: 'peltre', name: 'Peltre', hex: '#7C7F82', code: 'PE', aliases: ['PELTRE'], suffixes: ['PE'] },
  { id: 'gris', name: 'Gris', hex: '#9A9A98', code: 'GR', aliases: ['GRIS'], suffixes: ['GR'] },
  { id: 'lenga', name: 'Lenga', hex: '#B07A4F', code: 'LE', aliases: ['LENGA'], suffixes: ['LE'] },
  { id: 'wengue', name: 'Wengué', hex: '#3B2A20', code: 'WE', aliases: ['WENGUE', 'WENGE'], suffixes: ['WE'] },
  { id: 'colonial', name: 'Colonial', hex: '#7E4E2C', code: 'CO', aliases: ['COLONIAL', 'KOLONIAL'], suffixes: ['CO'] },
  { id: 'anteak', name: 'Anteak', hex: '#8C5B33', code: 'AT', aliases: ['ANTEAK'], suffixes: ['AT'] },
  { id: 'caoba', name: 'Caoba', hex: '#6B2E1F', code: 'CA', aliases: ['CAOBA'], suffixes: ['CAOB', 'CA'] },
  { id: 'embero', name: 'Embero', hex: '#8C5A3C', code: 'EM', aliases: ['EMBERO'], suffixes: ['EM'] },
  { id: 'terra', name: 'Terra', hex: '#8A5A3A', code: 'TE', aliases: ['TERRA'], suffixes: ['TE'] },
  { id: 'madera', name: 'Madera', hex: '#8B5A2B', code: 'MA', aliases: ['MADERA'], suffixes: ['MA'] },
  { id: 'bronce', name: 'Bronce', hex: '#6E5636', code: 'BR', aliases: ['BRONCE'], suffixes: ['BR'] },
  { id: 'mate', name: 'Aluminio mate', hex: '#B8B8B4', code: 'MT', aliases: ['MATE', 'ALUMINIO MATE', 'ANODIZADO', 'NATURAL'], suffixes: ['MAT', 'MT'] },
  { id: 'acero-inox', name: 'Acero inoxidable', hex: '#C9CBCD', code: 'IN', aliases: ['ACERO INOX', 'INOX', 'ACERO INOXIDABLE'], suffixes: ['INOX', 'IN'] },
]

const BY_ALIAS = new Map<string, PaletteEntry>()
for (const entry of PALETTE) for (const alias of entry.aliases) BY_ALIAS.set(normalizeKey(alias), entry)

/** Valores de la columna Color que no son un color de perfil (vidrio, separadores, N/A…). */
const COLORLESS = /^(|N\/?A|NA|SIN COLOR|INCOLORO|TRANSPARENTE|VIDRIO|ESPEJO|SEPARADOR.*|MATE \d.*|NEGRO \d.*|BRONCE \d.*|-+)$/

/** Colores de la paleta canónica (sin alias), para catálogos y selectores. */
export const COLOR_PALETTE: Color[] = PALETTE.map(({ id, name, hex, code }) => ({ id, name, hex, code }))

/** true si el texto de color no corresponde a un color de perfil (los refuerzos, por ejemplo). */
export function isColorless(name: string | undefined | null): boolean {
  return COLORLESS.test(normalizeKey(name ?? ''))
}

function guessHex(key: string): string {
  if (/NEGR|BLACK/.test(key)) return '#141416'
  if (/BLANC|WHITE/.test(key)) return '#F6F5F1'
  if (/GRIS|GREY|GRAY|GRAF|PLATA|SILVER/.test(key)) return '#8A8D91'
  if (/ROBLE|OAK|MADERA|NOGAL|CEREZO|PINO|TEAK/.test(key)) return '#9A6B3F'
  if (/BRONCE|COBRE|ORO|GOLD/.test(key)) return '#7A5C3A'
  if (/AZUL|BLUE/.test(key)) return '#3D5A80'
  if (/VERDE|GREEN/.test(key)) return '#4F6F52'
  if (/ROJO|RED|BURDEO/.test(key)) return '#7A2E2A'
  return '#A39D94'
}

/**
 * Normaliza un nombre de color de proveedor a la paleta canónica. Si no lo conoce,
 * crea un color con id derivado del nombre y un tono aproximado. Un nombre vacío o
 * «sin color» devuelve el color neutro «sin-color».
 */
export function normalizeColor(name: string): Color {
  const key = normalizeKey(name).replace(/[.]+$/, '')
  if (isColorless(key)) return { id: 'sin-color', name: 'Sin color', hex: '#D8D4CC' }
  const known = BY_ALIAS.get(key)
  if (known) return { id: known.id, name: known.name, hex: known.hex, code: known.code }
  return { id: slug(key), name: sentenceCase(key), hex: guessHex(key) }
}

/** Sufijos de SKU típicos de un color canónico (más largos primero). */
export function colorSuffixes(colorId: string): string[] {
  const entry = PALETTE.find((candidate) => candidate.id === colorId)
  return entry ? [...entry.suffixes].sort((a, b) => b.length - a.length) : []
}

/** Todos los sufijos conocidos (para limpiar códigos de filas sin color). */
export const ALL_COLOR_SUFFIXES: string[] = [...new Set(PALETTE.flatMap((entry) => entry.suffixes))]
  .filter((suffix) => suffix.length >= 2)
  .sort((a, b) => b.length - a.length)
