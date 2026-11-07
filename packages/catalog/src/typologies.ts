/**
 * Traducción de los nombres de tipología de los proveedores (≈ 90 variantes, con
 * errores de tipeo incluidos) a las plantillas de DEKOPEN (`TypologyId`).
 * Cuando la plantilla exacta no existe se usa la más cercana que el motor sabe
 * fabricar (p. ej. «Corredera 8 hojas triple riel» → corredera de 6 hojas).
 *
 * Las listas de ids NO se copian a mano: salen de la galería del motor (`TYPOLOGIES`), que es la
 * única fuente de verdad (familia por `Typology.kind` y `Typology.group`, no por prefijos).
 */
import { TYPOLOGIES, TYPOLOGY_IDS as ENGINE_TYPOLOGY_IDS, getTypology, type LineKind, type TypologyId } from '@dekopen/engine'
import { stripAccents } from './text'

export const TYPOLOGY_IDS: readonly TypologyId[] = ENGINE_TYPOLOGY_IDS

const ids = (test: (t: (typeof TYPOLOGIES)[number]) => boolean): TypologyId[] => TYPOLOGIES.filter(test).map((t) => t.id)

/** Tipologías que fabrica una línea de corredera (incluida la elevadora). */
export const SLIDING_TYPOLOGIES: TypologyId[] = ids((t) => t.kind === 'sliding')
/** Tipologías que fabrica una línea practicable (incluidas osciloparalela, paralela y plegables). */
export const CASEMENT_TYPOLOGIES: TypologyId[] = ids((t) => t.kind === 'casement')
export const DOOR_TYPOLOGIES: TypologyId[] = ids((t) => t.group === 'door')
/** Paño fijo y formas que se fabrican como un solo paño fijo. */
export const SHAPED_FIXED_TYPOLOGIES: TypologyId[] = ids((t) => {
  if (t.id === 'fixed') return true
  if (t.group !== 'shape') return false
  const built = t.build(t.defaultSize.width, t.defaultSize.height)
  return built.root.type === 'leaf' && built.root.opening.kind === 'fixed'
})

/** Tipo de línea que fabrica una tipología (desconocida → practicable). */
export function typologyKind(id: TypologyId): LineKind {
  return getTypology(id)?.kind ?? 'casement'
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
  [/\boscilo\s*-?\s*paralel\w*/g, 'osciloparalela'],
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

const NUMBER_WORDS: Record<string, number> = { una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7 }

function leafCount(text: string): number | undefined {
  const digits = text.match(/\b(\d)\s*hojas?\b/)
  if (digits) return Number(digits[1])
  const words = text.match(/\b(una|un|dos|tres|cuatro|cinco|seis|siete)\s+hojas?\b/)
  return words ? NUMBER_WORDS[words[1]] : undefined
}

/** Sistemas especiales que se reconocen antes que la corredera común. */
const LIFT_SLIDE = /elevadora|elevable|\bhst\b|\bhs\b|lift/
const TILT_SLIDE = /osciloparalela|\bpsk\b/
const PARALLEL_SLIDE = /\bparalela\b/
const FOLDING = /plegable|plegadiza|acordeon|fuelle|\blibro\b|bifold/
const PIVOT = /pivot|basculante/

/** Familia constructiva del nombre (sirve para decidir si una línea es corredera). */
export function supplierFamily(name: string): SupplierFamily {
  const text = normalizeTypologyName(name)
  if (!text || /^tipologia/.test(text)) return 'none'
  // Plegables, osciloparalelas y paralelas se arman sobre el sistema practicable.
  if (FOLDING.test(text) || TILT_SLIDE.test(text) || PARALLEL_SLIDE.test(text)) return /\bpuerta\b|balconera/.test(text) ? 'door' : 'casement'
  if (/corredera|corrediza|monorriel|sliding|guillotina/.test(text) || LIFT_SLIDE.test(text)) return 'sliding'
  if (/\bvano\b|\bpared\b|templado|^vidrio\b|^mosquitero/.test(text)) return 'none'
  if (/\bpuerta\b|balconera/.test(text)) return 'door'
  if (/abat|batiente|oscil|proyectante|practicable/.test(text) || PIVOT.test(text)) return 'casement'
  if (/fij|pano|medio punto|arcada|arco|trapecio|triangulo|angulo recto|circular|redondo|ojo de buey|ovalad|elipti|pentagon|octogon|octagon|casita|fronton|celosia|sifon|irregular/.test(text)) return 'fixed'
  return 'none'
}

/** Elevadora de 2, 3 o 4 hojas (más hojas → la de 4, aproximada). */
function liftSlideId(leaves: number | undefined): TypologyId {
  if (leaves !== undefined && leaves >= 4) return 'lift_slide_4'
  if (leaves === 3) return 'lift_slide_3'
  return 'lift_slide_2'
}

/** Plegable de 3 a 7 hojas (sin cantidad o fuera de rango → la más cercana, aproximada). */
function foldingId(leaves: number | undefined): TypologyId {
  const n = Math.min(7, Math.max(3, leaves ?? 3))
  return `folding_${n}` as TypologyId
}

/**
 * Plantilla DEKOPEN para un nombre de tipología (o de producto) del proveedor.
 * Devuelve null para lo que no es una ventana fabricable con las plantillas
 * (vano vacío, pared, vidrio suelto, templados, mosquiteros, guillotinas).
 */
export function mapTypology(name: string | null | undefined): TypologyId | null {
  const text = normalizeTypologyName(name ?? '')
  if (!text || /^tipologia/.test(text)) return null
  if (/^mosquitero/.test(text)) return null

  // Sistemas especiales antes que la corredera común («Corredera elevadora», «Corredera plegable»).
  if (FOLDING.test(text)) return foldingId(leafCount(text))
  if (TILT_SLIDE.test(text)) return (leafCount(text) ?? 2) >= 4 || /abre al centro|(dos|2) hojas moviles/.test(text) ? 'tilt_slide_2' : 'tilt_slide'
  if (PARALLEL_SLIDE.test(text) && !/corredera\s+(\d|dos|tres|cuatro|seis)\b/.test(text)) return 'parallel_slide'
  if (LIFT_SLIDE.test(text)) return liftSlideId(leafCount(text))

  // Correderas primero: «Corredera doble vidrio mosquitero» sigue siendo corredera.
  if (/corredera|corrediza|monorriel|sliding/.test(text)) {
    if (/monorriel/.test(text)) return 'sliding_mono'
    const leaves = leafCount(text) ?? 2
    const triple = /triple\s+riel|3\s*rieles/.test(text)
    const oneFixed = /\b1hf\b|\b1\s*fij[ao]\b|hoja fija|\bfija\b/.test(text)
    const centerFixed = /(fij[ao]s?|pano)\s+(central(es)?|centro)|central(es)?\s+fij[ao]s?/.test(text)
    if (leaves <= 2) return oneFixed ? 'sliding_2_fixed' : 'sliding_2'
    if (leaves === 3) return centerFixed ? 'sliding_3_center_fixed' : triple ? 'sliding_3_rail' : 'sliding_3'
    if (leaves === 4) return centerFixed ? 'sliding_4_center_fixed' : 'sliding_4'
    return 'sliding_6'
  }
  if (/guillotina|\bvano\b|\bpared\b|templado|^vidrio\b|mosquitero/.test(text)) return null

  if (/\bpuerta\b|balconera/.test(text)) {
    if (/sobreluz|sobre luz/.test(text)) return 'door_transom'
    const double = /doble|\b2\s*hojas?\b|dos hojas/.test(text)
    if (/laterales|fijos/.test(text)) return double ? 'door_double_sidelights' : 'entrance_door_sidelights'
    if (/lateral|con fijo|\bfijo\b/.test(text)) return 'door_sidelight'
    if (double) return 'door_double'
    return 'door'
  }

  if (PIVOT.test(text)) return /vertical/.test(text) ? 'pivot_v' : 'pivot_h'

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

  if (/arco rebajado|rebajad|carpanel|segmental/.test(text)) return 'arch_segmental'
  if (/circular|redond|ojo de buey/.test(text)) return 'round'
  if (/ovalad|\boval\b|elipti/.test(text)) return 'oval'
  if (/pentagon/.test(text)) return 'pentagon'
  if (/octogon|octagon|ochavad/.test(text)) return 'octagon'
  if (/casita|fronton|forma de casa|dos aguas/.test(text)) return 'gable'
  if (/medio punto|arcada|\barco\b/.test(text)) return 'arch'
  if (/triangulo|angulo recto/.test(text)) return 'triangle'
  if (/trapecio|irregular/.test(text)) return 'trapezoid'
  if (/\bfij[oa]s?\b|\bpano\b|celosia|sifon/.test(text)) {
    return /\b3\b|tres|triple/.test(text) ? 'fixed_3' : 'fixed'
  }
  return null
}

/**
 * Plantilla para un nombre del proveedor y si la equivalencia es exacta. Aproximada = la
 * plantilla tiene otra cantidad de hojas o rieles, u otra forma («Corredera 8 hojas» → 6 hojas;
 * «4 hojas triple riel» → 4 hojas de doble riel; «pivotante» sin eje → pivotante horizontal).
 * Lo aproximado no se publica como capacidad de la línea.
 */
export function typologyMatch(name: string | null | undefined): { id: TypologyId; exact: boolean } | null {
  const id = mapTypology(name)
  if (!id) return null
  const text = normalizeTypologyName(name ?? '')
  const leaves = leafCount(text)
  if (FOLDING.test(text)) return { id, exact: leaves !== undefined && leaves >= 3 && leaves <= 7 }
  if (LIFT_SLIDE.test(text) && id.startsWith('lift_slide')) return { id, exact: leaves === undefined || (leaves >= 2 && leaves <= 4) }
  if (id === 'pivot_v' || id === 'pivot_h') return { id, exact: /vertical|horizontal/.test(text) }
  if (id === 'tilt_slide' || id === 'tilt_slide_2') return { id, exact: leaves === undefined || leaves === 2 || leaves === 4 }
  if (/corredera|corrediza|monorriel|sliding/.test(text) && SLIDING_TYPOLOGIES.includes(id)) {
    const triple = /triple\s+riel|3\s*rieles/.test(text)
    if (leaves !== undefined && leaves > 6) return { id, exact: false }
    if (leaves === 5) return { id, exact: false }
    if (id === 'sliding_6' && !triple) return { id, exact: false }
    if (leaves === 4 && triple) return { id, exact: false }
    if (id === 'sliding_3' && triple) return { id, exact: false }
    if (id === 'sliding_2' && leaves === 1 && !/monorriel/.test(text)) return { id, exact: false }
    return { id, exact: true }
  }
  return { id, exact: true }
}
