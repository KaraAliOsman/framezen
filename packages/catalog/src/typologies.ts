/**
 * Traducción de los nombres de tipología de los proveedores (≈ 90 variantes, con
 * errores de tipeo incluidos) a las plantillas de Framezen (`TypologyId`).
 * Cuando la plantilla exacta no existe se usa la más cercana que el motor sabe
 * fabricar (p. ej. «Corredera 6 hojas triple riel» → corredera de triple riel).
 */
import type { LineKind, TypologyId } from '@framezen/engine'
import { stripAccents } from './text'

export const TYPOLOGY_IDS = [
  'fixed',
  'casement',
  'casement_out',
  'tilt_turn',
  'tilt',
  'awning',
  'casement_double',
  'fixed_casement',
  'fixed_tilt_turn',
  'casement_transom',
  'fixed_awning_bottom',
  'fixed_3',
  'casement_fixed_casement',
  'door',
  'door_double',
  'door_sidelight',
  'door_transom',
  'arch',
  'trapezoid',
  'triangle',
  'sliding_2',
  'sliding_2_fixed',
  'sliding_3',
  'sliding_3_rail',
  'sliding_4',
  'sliding_mono',
] as const satisfies readonly TypologyId[]

export const SLIDING_TYPOLOGIES: TypologyId[] = ['sliding_2', 'sliding_2_fixed', 'sliding_3', 'sliding_3_rail', 'sliding_4', 'sliding_mono']
export const CASEMENT_TYPOLOGIES: TypologyId[] = TYPOLOGY_IDS.filter((id) => !id.startsWith('sliding_'))
export const DOOR_TYPOLOGIES: TypologyId[] = ['door', 'door_double', 'door_sidelight', 'door_transom']
export const SHAPED_FIXED_TYPOLOGIES: TypologyId[] = ['fixed', 'arch', 'trapezoid', 'triangle']

export function typologyKind(id: TypologyId): LineKind {
  return id.startsWith('sliding_') ? 'sliding' : 'casement'
}

/** Familia del nombre del proveedor, incluso si no tiene plantilla (guillotina, vano…). */
export type SupplierFamily = 'sliding' | 'casement' | 'door' | 'fixed' | 'none'

const TYPO_FIXES: [RegExp, string][] = [
  [/\bdobre\b/g, 'doble'],
  [/\bcorrederea\b/g, 'corredera'],
  [/\bpalilo\b/g, 'palillo'],
  [/\babatie\b/g, 'abatir'],
  [/\bexterio\b/g, 'exterior'],
  [/\bmono\s*r+iel\b/g, 'monorriel'],
  [/\bproyec\w*/g, 'proyectante'],
  [/\boscilo\s*-?\s*batiente\b/g, 'oscilobatiente'],
  [/\bpaso\s*libre\b/g, 'pasolibre'],
  [/\b(\d)\s*hf\b/g, '$1hf'],
]

function normalizeTypologyName(name: string): string {
  let text = stripAccents(name).toLowerCase()
  text = text.replace(/\([^)]*\)/g, ' ') // códigos entre paréntesis (Ma:…)
  text = text.replace(/[°º]/g, ' ').replace(/[-_/]+/g, ' ')
  for (const [pattern, replacement] of TYPO_FIXES) text = text.replace(pattern, replacement)
  return text.replace(/\s+/g, ' ').trim()
}

const NUMBER_WORDS: Record<string, number> = { una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 }

function leafCount(text: string): number | undefined {
  const digits = text.match(/\b(\d)\s*hojas?\b/)
  if (digits) return Number(digits[1])
  const words = text.match(/\b(una|un|dos|tres|cuatro|cinco|seis)\s+hojas?\b/)
  return words ? NUMBER_WORDS[words[1]] : undefined
}

/** Familia constructiva del nombre (sirve para decidir si una línea es corredera). */
export function supplierFamily(name: string): SupplierFamily {
  const text = normalizeTypologyName(name)
  if (!text || /^tipologia/.test(text)) return 'none'
  if (/corredera|corrediza|monorriel|sliding|guillotina/.test(text)) return 'sliding'
  if (/\bvano\b|\bpared\b|templado|^vidrio\b|^mosquitero/.test(text)) return 'none'
  if (/\bpuerta\b|balconera/.test(text)) return 'door'
  if (/abat|batiente|oscil|proyectante|practicable/.test(text)) return 'casement'
  if (/fij|pano|medio punto|arcada|arco|trapecio|triangulo|angulo recto|circular|redondo|casita|celosia|sifon|irregular/.test(text)) return 'fixed'
  return 'none'
}

/**
 * Plantilla Framezen para un nombre de tipología (o de producto) del proveedor.
 * Devuelve null para lo que no es una ventana fabricable con las plantillas
 * (vano vacío, pared, vidrio suelto, templados, mosquiteros, guillotinas).
 */
export function mapTypology(name: string | null | undefined): TypologyId | null {
  const text = normalizeTypologyName(name ?? '')
  if (!text || /^tipologia/.test(text)) return null

  // Correderas primero: «Corredera doble vidrio mosquitero» sigue siendo corredera.
  if (/corredera|corrediza|monorriel|sliding/.test(text)) {
    if (/monorriel/.test(text)) return 'sliding_mono'
    const leaves = leafCount(text) ?? 2
    const triple = /triple\s+riel|3\s*rieles/.test(text)
    const oneFixed = /\b1hf\b|\b1\s*fij[ao]\b|hoja fija|\bfija\b/.test(text)
    if (leaves <= 2) return oneFixed ? 'sliding_2_fixed' : 'sliding_2'
    if (leaves === 3) return triple ? 'sliding_3_rail' : 'sliding_3'
    if (leaves === 4) return 'sliding_4'
    return triple ? 'sliding_3_rail' : 'sliding_4'
  }
  if (/guillotina|\bvano\b|\bpared\b|templado|^vidrio\b|mosquitero/.test(text)) return null

  if (/\bpuerta\b|balconera/.test(text)) {
    if (/sobreluz|sobre luz/.test(text)) return 'door_transom'
    if (/lateral|con fijo|\bfijo\b/.test(text)) return 'door_sidelight'
    if (/doble|\b2\s*hojas?\b|dos hojas/.test(text)) return 'door_double'
    return 'door'
  }

  const double = /doble|\b2\s*hojas?\b|dos hojas/.test(text)
  const withFixed = /\bfij[oa]s?\b|\bpano\b/.test(text)
  if (/oscilobatiente/.test(text)) {
    if (double) return 'casement_double'
    return withFixed ? 'fixed_tilt_turn' : 'tilt_turn'
  }
  if (/oscilante/.test(text)) return 'tilt'
  if (/proyectante/.test(text)) return withFixed ? 'fixed_awning_bottom' : 'awning'
  if (/abat|batiente|practicable/.test(text)) {
    if (/abat\w*\s+fij\w*\s+abat/.test(text)) return 'casement_fixed_casement'
    if (double) return 'casement_double'
    if (/sobreluz|sobre luz/.test(text)) return 'casement_transom'
    if (withFixed) return 'fixed_casement'
    return /exterior/.test(text) ? 'casement_out' : 'casement'
  }

  if (/medio punto|arcada|\barco\b|circular|redondo/.test(text)) return 'arch'
  if (/triangulo|angulo recto/.test(text)) return 'triangle'
  if (/trapecio|irregular|casita/.test(text)) return 'trapezoid'
  if (/\bfij[oa]s?\b|\bpano\b|celosia|sifon/.test(text)) {
    return /\b3\b|tres|triple/.test(text) ? 'fixed_3' : 'fixed'
  }
  return null
}

/**
 * Plantilla para un nombre del proveedor y si la equivalencia es exacta. Aproximada = la
 * plantilla tiene otra cantidad de hojas o rieles, u otra forma («Corredera 6 hojas triple riel»
 * → corredera de 3 hojas; «4 hojas triple riel» → 4 hojas de doble riel; «circular» → arco).
 * Lo aproximado no se publica como capacidad de la línea.
 */
export function typologyMatch(name: string | null | undefined): { id: TypologyId; exact: boolean } | null {
  const id = mapTypology(name)
  if (!id) return null
  const text = normalizeTypologyName(name ?? '')
  if (/corredera|corrediza|monorriel|sliding/.test(text)) {
    const leaves = leafCount(text)
    const triple = /triple\s+riel|3\s*rieles/.test(text)
    if (leaves !== undefined && leaves > 4) return { id, exact: false }
    if (leaves === 4 && triple) return { id, exact: false }
    if (id === 'sliding_3' && triple) return { id, exact: false }
    if (id === 'sliding_2' && leaves === 1 && !/monorriel/.test(text)) return { id, exact: false }
    return { id, exact: true }
  }
  if (id === 'arch' && /circular|redondo/.test(text)) return { id, exact: false }
  if (id === 'trapezoid' && /casita/.test(text)) return { id, exact: false }
  return { id, exact: true }
}
