/**
 * Reglas de códigos por marca: separan el «modelo» de perfil (PRO01, K6029,
 * W-DJ60-P6002…) del color que viene codificado en el SKU, para agrupar las
 * variantes de color de un mismo perfil. Puras y seguras para navegador.
 */
import { colorSuffixes, ALL_COLOR_SUFFIXES } from './colors'
import { normalizeKey } from './text'

/** Clave de agrupación de un modelo: mayúsculas, sin separadores. */
export function modelGroupKey(model: string): string {
  return normalizeKey(model).replace(/[^A-Z0-9]/g, '')
}

const PROLINE_LINE_NAMES = new Set(['PRO5003', 'PRO6004', 'PRO7005', 'PRO8106'])
const PROLINE_OLD_COLORS: Record<string, string> = {
  '13': 'blanco',
  '14': 'roble-dorado',
  '15': 'nogal',
  '16': 'antracita',
  '17': 'winchester',
  '19': 'roble-montana',
  '20': 'negro',
}
const SHORT_COLOR_CODES: Record<string, string> = {
  BL: 'blanco',
  RD: 'roble-dorado',
  AN: 'antracita',
  NE: 'negro',
  NO: 'nogal',
  WI: 'winchester',
  RM: 'roble-montana',
}
const KOMPEN_COLORS: Record<string, string> = {
  '0003': 'blanco',
  '3241': 'anteak',
  '2097': 'caoba',
  '3110': 'colonial',
  '3154': 'nogal',
  '7016': 'antracita',
  '8518': 'negro',
}
const TERMICO_COLORS: Record<string, string> = { '1': 'blanco', '2': 'nogal', '3': 'roble-dorado', '4': 'antracita', '5': 'negro' }
const WINDOLINE_COLORS: Record<string, string> = { '00': 'blanco', '01': 'nogal', '02': 'roble-dorado', '03': 'antracita', '04': 'negro' }

export type BrandRule = 'proline' | 'kompen' | 'termico' | 'windoline' | 'veratec' | 'muchtek' | 'pentech' | 'tehmco' | 'maxwin' | 'blancoplast' | 'generic'

/** Regla de código aplicable según el nombre de la marca. */
export function brandRuleFor(brandName: string): BrandRule {
  const key = normalizeKey(brandName)
  if (key === 'PROLINE') return 'proline'
  if (key === 'KOMPEN') return 'kompen'
  if (key === 'TERMICO') return 'termico'
  if (key === 'WINDOLINE') return 'windoline'
  if (key === 'VERATEC') return 'veratec'
  if (key.startsWith('MUCHTEK')) return 'muchtek'
  if (key === 'PENTECH') return 'pentech'
  if (key === 'TEHMCO') return 'tehmco'
  if (key === 'MAXWIN') return 'maxwin'
  if (key === 'BLANCOPLAST') return 'blancoplast'
  return 'generic'
}

/** Token de perfil Proline en la descripción (PRO01, PRO231K, PRO-R7). */
export function prolineToken(description: string): string | undefined {
  const text = normalizeKey(description)
  const reinforcement = text.match(/\bPRO\s?-?\s?R\s?(\d{1,2})\b/)
  if (reinforcement) return `PRO-R${Number(reinforcement[1])}`
  for (const match of text.matchAll(/\bPRO\s?-?\s?(\d{1,4}[A-Z]?)\b/g)) {
    const token = `PRO${match[1]}`
    if (PROLINE_LINE_NAMES.has(token)) continue
    // PRO05 y PRO5 son el mismo perfil: se conserva el número con dos dígitos mínimo.
    const digits = match[1].match(/^(\d+)([A-Z]?)$/)
    if (digits) return `PRO${digits[1].length === 1 ? `0${digits[1]}` : digits[1]}${digits[2]}`
    return token
  }
  return undefined
}

/** Color codificado en el SKU, si la marca lo hace de forma conocida. */
export function colorFromCode(brandName: string, code: string): string | undefined {
  const sku = normalizeKey(code)
  switch (brandRuleFor(brandName)) {
    case 'proline': {
      const old = sku.match(/^10(\d{2})\d{5}$/) // 10CCPPPPP: 101600033 = PRO33 antracita
      if (old) return PROLINE_OLD_COLORS[old[1]]
      const modern = sku.match(/^PRO.*?(BL|RD|AN|NE|NO|WI|RM)$/)
      return modern ? SHORT_COLOR_CODES[modern[1]] : undefined
    }
    case 'kompen': {
      const match = sku.match(/^\d{7}-(\d{4})$/)
      return match ? KOMPEN_COLORS[match[1]] : undefined
    }
    case 'termico': {
      const match = sku.match(/^\d{6}-(\d)$/)
      return match ? TERMICO_COLORS[match[1]] : undefined
    }
    case 'windoline': {
      const match = sku.match(/^\d{2}[A-Z]+\d.*?(0[0-4])$/) // 11MF7500, 12JTPC701
      return match ? WINDOLINE_COLORS[match[1]] : undefined
    }
    default:
      return undefined
  }
}

function stripSuffix(sku: string, suffixes: string[]): string | undefined {
  for (const suffix of suffixes) {
    if (!sku.endsWith(suffix)) continue
    const stem = sku.slice(0, -suffix.length).replace(/[-_. /]+$/, '')
    if (stem.length >= 2 && (/\d/.test(stem) || stem.length >= 3)) return stem
  }
  return undefined
}

/**
 * Código de modelo (sin color) de un perfil. `colorId` es el color canónico de la
 * fila (de la columna Color), que ayuda a reconocer el sufijo de color del SKU.
 */
export function profileModelCode(brandName: string, code: string, description: string, colorId?: string): string {
  const sku = normalizeKey(code).replace(/\s+/g, ' ')
  const leading = normalizeKey(description).match(/^(\d[\dA-Z.]{4,})\s/)
  const rule = brandRuleFor(brandName)

  if (rule === 'proline') {
    const token = prolineToken(description)
    if (token) return token
  }
  if (!sku) return leading?.[1] ?? normalizeKey(description)

  const byRule = (() => {
    switch (rule) {
      case 'kompen':
        // 0201406-0003 (PVC) · 0201R8000003 / 0201812A0003 (aluminio: modelo + acabado de 4 dígitos).
        return sku.match(/^(\d{7})-\d{4}$/)?.[1] ?? sku.match(/^(\d{4}[A-Z]\d{3})\d{4}$/)?.[1] ?? sku.match(/^(\d{7}[A-Z])\d{4}$/)?.[1]
      case 'termico':
        return sku.match(/^(\d{6})-\d$/)?.[1]
      case 'windoline':
        return sku.match(/^(\d{2}[A-Z]+\d.*?)0[0-4]$/)?.[1]
      case 'veratec':
        return sku.match(/^(\d{5}[A-Z]{3})\d{3}$/)?.[1] // 66014VER199, 61112EKO000
      case 'muchtek':
        return sku.match(/^(\d{6})\d{3}$/)?.[1]
      case 'pentech': {
        // PVC2221BL6000 y PVC22216000-NE son el mismo perfil 222-1 (color antes o después del largo).
        const after = sku.match(/^PVC(.+?)\d{4}-?(BL|NO|RD|AT|AN|NE)$/)
        if (after) return `PVC${after[1]}`
        const match = sku.match(/^PVC(.+?)(BL|NO|RD|AT|AN|NE)(\d{4})?$/)
        return match ? `PVC${match[1]}` : undefined
      }
      case 'tehmco': {
        const match = sku.match(/^41\d(\d+?)\s*(NEG)?$/)
        return match ? `41${match[1]}` : undefined
      }
      case 'maxwin': {
        // 7090NE = 7090 negro (el 0 es parte del modelo) · 70900 = 7090 blanco (último dígito = color).
        const black = sku.match(/^(\d{4,})NE$/)
        if (black) return black[1]
        const numeric = sku.match(/^(\d{4})[0-3]$/)
        if (numeric) return numeric[1]
        const match = sku.match(/^([A-Z0-9]{3,}?)[0-3]$/)
        return match ? match[1] : undefined
      }
      case 'blancoplast':
        return sku.match(/^(.+?)\/0\d$/)?.[1]
      default:
        return undefined
    }
  })()
  if (byRule) return byRule

  const numericSuffix = sku.match(/^(\d{4,})\.\d{3}$/) // REHAU 500013.100
  if (numericSuffix) return numericSuffix[1]
  if (colorId && colorId !== 'sin-color') return stripSuffix(sku, colorSuffixes(colorId)) ?? sku
  return sku
}

/** Variante para filas sin color: intenta quitar cualquier sufijo de color conocido. */
export function strippedModelCandidates(code: string): string[] {
  const sku = normalizeKey(code)
  const out: string[] = []
  for (const suffix of ALL_COLOR_SUFFIXES) {
    const stem = stripSuffix(sku, [suffix])
    if (stem && !out.includes(stem)) out.push(stem)
  }
  return out
}
