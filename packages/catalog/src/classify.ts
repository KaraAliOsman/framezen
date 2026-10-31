/**
 * Clasificación de filas de listas de precios: marcadores de descarte, precios de
 * relleno, rol de perfil, tipo y unidad de herrajes/accesorios, vidrios y rangos de
 * medida escritos en los nombres («Cremona abatir E25 1200-1400»).
 */
import type { GlassKind, HardwareUnit, Item, LineKind, ProfileRole } from '@framezen/engine'
import { normalizeKey, parseDecimal, round1 } from './text'

/** Filas que el proveedor marcó para no usar. */
export const DEPRECATED_PATTERN = /\bNO\s*USAR\b|\bELIMINAR\b|DISCONTINU|\bNO VA\b|\bNOVA\b|\(FOTO MAL\)/

/** Comodines de receta del sistema de origen: no son artículos. */
export const VIRTUAL_PATTERN = /^TAMANO\s+(DE\s+)?(VIDRIOS?|JUNQUILLO|BURLETE|FELPA)\b/

const JUNK_DESCRIPTIONS = /^(S{3,}\w*|A?SADASD\w*|SSQWQW\w*|DUMMY.*|VARIOS)$/

export type RowStatus = 'ok' | 'deprecated' | 'virtual' | 'junk'

export function rowStatus(description: string, code = '', line = ''): RowStatus {
  const text = normalizeKey(`${description} ${line}`)
  if (DEPRECATED_PATTERN.test(text)) return 'deprecated'
  if (VIRTUAL_PATTERN.test(normalizeKey(description))) return 'virtual'
  const desc = normalizeKey(description)
  if (JUNK_DESCRIPTIONS.test(desc) || normalizeKey(code) === 'DUMMY' || desc.length < 2) return 'junk'
  return 'ok'
}

/** Precio de relleno típico de las exportaciones (≤ 1,10 CLP). */
export const PLACEHOLDER_MAX = 1.1

export function isPlaceholderPrice(price: number): boolean {
  return price > 0 && price <= PLACEHOLDER_MAX
}

/**
 * Valores repetidos en más de la mitad de los precios de una marca (REHAU repite
 * 21.633 en 138 de 144): se consideran relleno. Devuelve el conjunto de valores.
 */
export function repeatedPlaceholderValues(prices: number[], minCount = 20): Set<number> {
  const real = prices.filter((price) => price > PLACEHOLDER_MAX)
  const counts = new Map<number, number>()
  for (const price of real) counts.set(price, (counts.get(price) ?? 0) + 1)
  const out = new Set<number>()
  for (const [price, count] of counts) if (count >= minCount && count > real.length / 2) out.add(price)
  return out
}

// ── Perfiles ──────────────────────────────────────────────────────────────────

export type ProfileFamily =
  | 'frame'
  | 'sash'
  | 'door_sash'
  | 'mullion'
  | 'bead'
  | 'interlock'
  | 'guide'
  | 'coupler'
  | 'reinforcement'
  | 'french_mullion'
  | 'threshold'
  | 'other'

/** Etiqueta en español para la interfaz («Perfil · Marco»). */
export const PROFILE_ROLE_LABEL: Record<ProfileRole, string> = {
  frame: 'Marco',
  sash: 'Hoja',
  door_sash: 'Hoja de puerta',
  mullion: 'Travesaño',
  bead: 'Junquillo',
  french_mullion: 'Batiente',
  threshold: 'Umbral',
  sliding_frame: 'Marco corredera',
  sliding_sash: 'Hoja corredera',
  interlock: 'Traslapo',
  guide: 'Riel',
  coupler: 'Unión',
  reinforcement: 'Refuerzo',
  other: 'Complementario',
}

const SUBTYPE_FAMILY: Record<string, ProfileFamily> = {
  MARCO: 'frame',
  HOJA: 'sash',
  JUNQUILLO: 'bead',
  PALILLO: 'mullion',
  UNION: 'coupler',
  REFUERZO: 'reinforcement',
  TRASLAPO: 'interlock',
  'RIEL INFERIOR': 'guide',
  COMPLEMENTARIO: 'other',
  ACCESORIOS: 'other',
}

/**
 * Perfiles complementarios que no son estructura de ventana: rótulas, adaptadores, tapas,
 * mosquiteros, alféizares, soportes… Nunca se eligen como marco, hoja, travesaño ni junquillo.
 */
export const COMPLEMENT_PATTERN =
  /MOSQUITER|\bROTULA\b|\bADAPTADOR\b|\bTAPA\b|^(ALFEIZ|CORNIZA|VIERTEAGUA|BOTAGUA|CUBRE|ELEVADOR|SOPORTE|ALETA|PANEL|ENSANCH|TAPAJUNTA|COVERTOR|PREMARCO|CLIP INFERIOR|PERFIL ALUM\.? ENCUENTRO|ENCUENTRO|ACOPLE CUARTA|PERFIL INVERSOR 4|INVERSOR 4|ESCUADRA|ANGULO|PERFIL H\b|PERFIL U\b)/

/** true si el nombre describe un perfil complementario (no estructural). */
export function isComplementProfile(description: string): boolean {
  return COMPLEMENT_PATTERN.test(stripLegacyCode(normalizeKey(description)))
}

function stripLegacyCode(text: string): string {
  return text.replace(/^[\d.\-/A-Z]*\d[\d.\-/A-Z]*\s+(?=[A-Z])/, '') // código legado al inicio
}

/** Prefijo corto de marca antes de la familia («YAG TRASLAPO» → «TRASLAPO»). */
const BRAND_PREFIX = /^[A-Z]{2,4}\s+(?=(?:TRASLAPO|MARCO|HOJA|JUNQUILLO|RIEL|GUIA|TRAVESA[A-Z]*|POSTE|PALILLO|BATIENTE|INVERSOR|MONTANTE)\b)/

/**
 * Familia de un perfil por la primera palabra de la descripción, con respaldo en el subtipo.
 * Los complementos (rótulas, tapas, mosquiteros…) quedan como «other» aunque el subtipo diga
 * «Hoja» o «Marco»; un poste inversor o batiente es la unión móvil de doble hoja (no un
 * travesaño fijo). Un prefijo corto de marca («Yag traslapo») no oculta la familia.
 */
export function profileFamily(subtype: string, description: string): ProfileFamily {
  const raw = stripLegacyCode(normalizeKey(description))
  if (/^(REF\b|REF\.|REFUERZO|REFUEZO|ACERO)/.test(raw) || /^REF\s/.test(raw)) return 'reinforcement'
  if (COMPLEMENT_PATTERN.test(raw)) return 'other'
  const text = raw.replace(BRAND_PREFIX, '')
  if (/^(JUNQUILLO|CONTRAVIDRIO|JUNQ)/.test(text)) return 'bead'
  if (/^(TRASLAPO|CLIP DE TRASLAPO|CLIP TRASLAPO|ENGANCHE)/.test(text)) return 'interlock'
  if (/^(RIEL|GUIA)/.test(text)) return 'guide'
  if (/^(SOLERA|UMBRAL|PERFIL SOLERA|ZOCALO|ZAPATA)/.test(text) || /\bSOLERA\b|\bUMBRAL\b/.test(text)) return 'threshold'
  if (/^(BATIENTE|INVERSOR)/.test(text) || /^(POSTE|PILAR)\b.*\b(INVERSOR|BATIENTE)/.test(text)) return 'french_mullion'
  if (/^(TRAVESA|POSTE|PALILLO|MULLION|MONTANTE|BARRA T)/.test(text) || /^PILAR\s*\/\s*POSTE/.test(text)) return 'mullion'
  if (/^(UNION|ACOPLE|ESQUINERO|TUBULAR|PILAR|CONECTOR DE MARCOS|CONECTOR MARCOS|COMPENSADOR|AUXILIAR|MARCO\s*\/\s*MARCO)/.test(text)) return 'coupler'
  if (/^HOJA/.test(text)) return /PUERTA|PTA\b|PTA\./.test(text) ? 'door_sash' : 'sash'
  if (/^MARCO/.test(text)) return 'frame'
  const fromSubtype = SUBTYPE_FAMILY[normalizeKey(subtype)]
  if (fromSubtype === 'sash' && /PUERTA|PTA\b|PTA\./.test(text)) return 'door_sash'
  return fromSubtype ?? 'other'
}

/** Rol del motor según la familia y el tipo de línea (en correderas, marco y hoja propios). */
export function roleFor(family: ProfileFamily, kind: LineKind): ProfileRole {
  if (kind === 'sliding') {
    if (family === 'frame') return 'sliding_frame'
    if (family === 'sash' || family === 'door_sash') return 'sliding_sash'
  }
  return family
}

/** Cara vista en mm escrita en la descripción («MARCO DC 60/64» → 64, «HOJA PTA. EXT. 102MM» → 102). */
export function parseFace(family: ProfileFamily, description: string): number | undefined {
  const text = normalizeKey(description).replace(/(\d),(\d)/g, '$1.$2')
  const pair = text.match(/\b(\d{2,3}(?:\.\d)?)\s*\/\s*(\d{2,3}(?:\.\d)?)\b(?!\s*-)/)
  const mm = text.match(/\b(\d{2,3}(?:\.\d)?)\s*MM\b/)
  const value = (() => {
    if (family === 'bead') {
      const first = text.match(/JUNQUILLO\s+(\d{1,2}(?:\.\d)?)\b/)
      return first ? Number(first[1]) : mm ? Number(mm[1]) : undefined
    }
    if (family === 'frame' || family === 'sash' || family === 'door_sash' || family === 'mullion' || family === 'french_mullion') {
      if (pair) return Number(pair[2])
      if (mm) return Number(mm[1])
    }
    return undefined
  })()
  return value !== undefined && value >= 5 && value <= 200 ? value : undefined
}

/** Largo de barra en mm escrito en la descripción o el código («X 5.8», «6000», «3 MTS»). */
export function parseBarLength(description: string, code = ''): number | undefined {
  const text = normalizeKey(description).replace(/(\d),(\d)/g, '$1.$2')
  const meters = text.match(/\bX\s*(\d(?:\.\d{1,2})?)\s*(?:M|MT|MTS|MTRS)?\b(?!\s*MM)/) ?? text.match(/\b(\d(?:\.\d{1,2})?)\s*(?:M|MT|MTS|MTRS)\b/)
  if (meters) {
    const value = Number(meters[1]) * 1000
    if (value >= 2000 && value <= 7000) return round1(value)
  }
  const mm = normalizeKey(code).match(/(5800|6000|6500)$/)
  return mm ? Number(mm[1]) : undefined
}

// ── Herrajes, accesorios e insumos ───────────────────────────────────────────

const CONSUMABLE = /TORNILLO|SILICONA|SELLADOR|SEPARADOR|ESPUMA|TEFLON|PVC LIQUIDO|LAPIZ|REMACHE|TARUGO|\bTACO|CINTA|BUTILO|ADHESIVO|LIMPIADOR|PERNO|PUNTA AGUJA|AUTOPERF|PALETA/
const ACCESSORY = /CALZO|CALZA|TAPA|FELPA|BURLETE|JUNTA|SELLO|PUENTE|CONECTOR|DEFLECTOR|DESAGUE|EMBELLECEDOR|\bCLIP|UNION MECANICA|STOP|CUNA|MALLA|TOPE|ESCUADRA DE UNION|TERMINAL|CUBRE|POSICIONADOR/
const HARDWARE = /CREMONA|BISAGRA|MANILLA|BRAZO|CARRO|CERRADERO|COMPAS|CILINDRO|CERRADURA|\bKIT\b|PESTILLO|FALLEBA|BALANCE|TIRADOR|ANGULO DE CAMBIO|PLETINA|TIRANTE|CIERRE|PASADOR|RODAMIENTO|EXTENSION|BULON|ANTIELEVACION|FALSO MANEJO|ROLDANA|GUARNICION|POMO|RETENEDOR|LIMITADOR/
// «Llave» es herramienta solo cuando el artículo ES la llave («Llave allen…», «Llave regulación…»):
// «doble manilla c/llave» o «cilindro 3 llaves» son herrajes.
const OTHER = /PALETA ACRISTAL|PLANTILLA|FREZA|FRESA|PRENZA|PRENSA|MATRIZ|^LLAVE\b|\bLLAVE (ALLEN|REGULACION|DE REGULACION)\b|DESPACHO|FLETE|MANO DE OBRA|SERVICIO|INSTALACION DE|HERRAMIENTA/

/** Tipo de ítem (herraje, accesorio, insumo u otro) por descripción y grupo. */
export function itemKind(group: string, description: string): Item['kind'] {
  const text = normalizeKey(description)
  if (OTHER.test(text)) return 'other'
  if (HARDWARE.test(text)) return 'hardware'
  if (CONSUMABLE.test(text)) return 'consumable'
  if (ACCESSORY.test(text)) return 'accessory'
  const g = normalizeKey(group)
  if (g === 'HERRAJE') return 'hardware'
  if (g === 'INSTALACION' || g === 'VIDRIO') return 'consumable'
  if (g === 'ACCESORIOS') return 'accessory'
  return 'other'
}

export interface InferredUnit {
  unit: HardwareUnit
  packSize?: number
  /**
   * La lista no dice la unidad ni el envase: lo deducimos (por el precio o un número entre
   * paréntesis) y queda por confirmar con el proveedor. Texto corto para el reporte.
   */
  doubtful?: string
}

/**
 * Unidad de compra y envase. Lo que la descripción dice explícito (caja de 1.000, rollo de
 * 250 m, par) manda y no depende del precio; lo deducido por el precio queda marcado como
 * dudoso para que el reporte lo muestre en vez de presentarlo como dato.
 */
export function inferUnit(description: string, price: number): InferredUnit {
  const text = normalizeKey(description).replace(/(\d),(\d)/g, '$1.$2')
  const packMatch =
    text.match(/CAJA\s*(?:DE\s*)?\/?\s*(\d{2,5})/) ??
    text.match(/(\d{2,5})\s*(?:UNDS?|UNID(?:ADES)?|UDS|UN\b|PCS|PZAS?)/) ??
    text.match(/\bX\s*(\d{3,5})\s*U\b/)
  const pack = packMatch ? Number(packMatch[1]) : undefined
  // «(10)», «(100)» al final: posible envase del proveedor, pero también puede ser un número de modelo.
  const parenthesis = text.match(/\((\d{1,4})\)\s*$/)
  const parenthesisNote = parenthesis && Number(parenthesis[1]) >= 2 ? `posible envase de ${Number(parenthesis[1]).toLocaleString('es-CL')}` : undefined
  if (/\bPAR\b|\(PAR\)/.test(text)) return { unit: 'par', packSize: 2 }
  if (/\bKIT\b|\bJGO\b|\bJUEGO\b|\bSET\b/.test(text)) return { unit: 'kit' }
  if (/SILICONA|ESPUMA|PVC LIQUIDO|ADHESIVO|\bTUBO\b|\bPOMO\b|CARTUCHO|\d+\s*ML\b/.test(text)) return { unit: 'cartucho' }
  if (/FELPA|BURLETE|SELLADOR|SEPARADOR|\bROLLO\b|X METRO|POR METRO|METRO LINEAL|\bML\b|\/M\b|\bCINTA\b/.test(text)) {
    const roll = text.match(/(\d{2,4})\s*(?:M|MT|MTS|METROS)\b/)
    const length = roll ? Number(roll[1]) : undefined
    if (length && length >= 10) return { unit: 'm', packSize: length }
    // Un metro de felpa no cuesta miles de pesos: probablemente es un rollo sin largo escrito.
    return price > 3000 && !/X METRO|POR METRO|METRO LINEAL/.test(text) ? { unit: 'm', doubtful: 'precio de rollo sin largo' } : { unit: 'm' }
  }
  if (/TORNILLO|REMACHE|TARUGO|\bTACO|PERNO|PUNTA AGUJA|AUTOPERF/.test(text)) {
    if (/\bCAJA\b|\bCJA\b/.test(text) || pack) {
      const length = text.match(/X\s*(\d{2,3})\s*(?:MM)?\b/)
      const fallback = length && Number(length[1]) >= 60 ? 200 : 1000
      return pack ? { unit: 'caja', packSize: pack } : { unit: 'caja', packSize: fallback, doubtful: `caja de ${fallback.toLocaleString('es-CL')} supuesta` }
    }
    if (price >= 5000) {
      // Ningún tornillo suelto vale $5.000: es una caja, pero la lista no dice de cuántos.
      const length = text.match(/X\s*(\d{2,3})\s*(?:MM)?\b/)
      const fallback = length && Number(length[1]) >= 60 ? 200 : 1000
      return { unit: 'caja', packSize: fallback, doubtful: `caja de ${fallback.toLocaleString('es-CL')} supuesta por el precio` }
    }
    return parenthesisNote ? { unit: 'u', doubtful: parenthesisNote } : { unit: 'u' }
  }
  if (/\bCAJA\b|\bCJA\b/.test(text) && pack) return { unit: 'caja', packSize: pack }
  return parenthesisNote ? { unit: 'u', doubtful: parenthesisNote } : { unit: 'u' }
}

/** Rango de medida en mm escrito en el nombre («1200-1201/1400», «800 - 1000», «920/801-1200»). */
export function parseRange(description: string): { min: number; max: number; open?: true } | undefined {
  const text = normalizeKey(description)
  const match = text.match(/\b(\d{3,4})\s*-\s*(?:\d{3,4}\s*\/\s*)?(\d{3,4})(?!\d)/)
  if (!match) return undefined
  const min = Number(match[1])
  const max = Number(match[2])
  if (!(max > min && max <= 3000)) return undefined
  // «2000-2001/CV» (cota variable): desde 2.001 sin tope, se corta a la medida.
  return /\d{3,4}\s*\/\s*CV\b/.test(text) ? { min, max, open: true } : { min, max }
}

/** Entrada (backset) de una cremona: «E15», «E7,5», «E25». */
export function parseBackset(description: string): string | undefined {
  const match = normalizeKey(description).match(/\bE\s?(\d{1,2}(?:[.,]\d)?)\b/)
  return match ? match[1].replace(',', '.') : undefined
}

/** Pulgadas de un brazo de proyección («Brazo 16"»). */
export function parseInches(description: string): number | undefined {
  const match = description.match(/(\d{1,2})\s*(?:"|''|”|PLG|PULG)/i)
  const value = match ? Number(match[1]) : undefined
  return value && value >= 6 && value <= 40 ? value : undefined
}

// ── Vidrios ──────────────────────────────────────────────────────────────────

export interface ParsedGlass {
  name: string
  kind: GlassKind
  /** Espesor total en mm; 0 si no se puede saber (cámara sin medida, nombre sin espesor). */
  thickness: number
  composition?: string
  /** Masa de vidrio por m² (solo cristales: el PVB y la cámara no pesan como vidrio). */
  weightKgM2?: number
  /** Algo de la composición quedó por confirmar (texto corto para el reporte). */
  doubtful?: string
}

const NOT_GLASS = /MELAMINA|PANEL DE PUERTA|PANEL PUERTA|TERCIADO|\bMDF\b|TAMANO|SILICONA|PALETA|SELLADOR|SEPARADOR|BUTILO|HOTMELT|TAMIZ|CALZO|\bCINTA\b/
const GLASS_WORDS = /DVH|TVH|TERMOPANEL|CRISTAL|VIDRIO|INCOLORO|FLOAT|BRONCE|CATEDRAL|SEMILLA|SATEN|EMPAVONADO|ESPEJO|MIRROR|HUMO|LOW.?E|REFLECT|ECLIPSE|PLANITHERM|SOLARKONTROL|SOLAR|LAMINADO|TEMPLADO|TEMPEX|SENTRYGLASS|ACUSTICO|POLICARBONATO|ACRILICO|VERDE|GRIS|AZUL|MARTELE|MORISCO|STIPOLITE|ACANALADO|BLUEGREEN|EVERGREEN|CEBRACE|EXTRACLEAR/
/** Lámina de PVB nominal de un laminado (mm). */
const PVB = 0.38
const GLASS_KG_M2_PER_MM = 2.5

interface Pane {
  /** mm de cristal (suma de las hojas de vidrio). */
  glass: number
  /** mm totales del paño (con PVB). */
  total: number
  label: string
  laminated: boolean
}

const fmt = (value: number) => String(round1(value)).replace('.', ',')

function paneTags(segment: string): string[] {
  const tags: string[] = []
  if (/TEMPLAD|TEMPEX/.test(segment)) tags.push('templado')
  if (/LOW.?E|PLANITHERM|\bSI\b/.test(segment)) tags.push('low-e')
  if (/ACUS/.test(segment)) tags.push('acústico')
  return tags
}

/** Un paño de DVH: «4», «6 LOW-E», «8LAMACUS», «4&4 PLANITHERM» (laminado 4+4), «44.4 FT» (4+4 con 4 PVB). */
function parsePane(raw: string): Pane | undefined {
  // Códigos comerciales con letras y números («NP50 6») no son espesores.
  const segment = raw.replace(/\b[A-Z]{1,4}\d+\b/g, ' ').trim()
  const tags = paneTags(segment)
  const pair = segment.match(/(\d+(?:\.\d+)?)\s*&\s*(\d+(?:\.\d+)?)/)
  if (pair) {
    const a = Number(pair[1])
    const b = Number(pair[2])
    return { glass: a + b, total: a + b + PVB, label: [`${fmt(a)}+${fmt(b)} laminado`, ...tags].join(' '), laminated: true }
  }
  const technical = segment.match(/(?<![\d.])([2-8])([2-8])\.([1-8])(?![\d])/)
  if (technical) {
    const a = Number(technical[1])
    const b = Number(technical[2])
    const films = Number(technical[3])
    return { glass: a + b, total: round1(a + b + films * PVB), label: [`${a}+${b} laminado`, ...tags].join(' '), laminated: true }
  }
  const number = segment.match(/(\d+(?:\.\d+)?)/)
  if (!number) return undefined
  const mm = Number(number[1])
  if (!(mm > 0 && mm <= 25)) return undefined
  const laminated = /LAM/.test(segment)
  return { glass: mm, total: mm, label: [fmt(mm), ...(laminated ? ['laminado'] : []), ...tags].join(' '), laminated }
}

/** Cámara: «12», «15AR», «12 ARGON», «15BR» (separador bronce). undefined si no trae medida. */
function parseChamber(segment: string, argonEverywhere: boolean): { mm?: number; label: string } {
  const number = segment.match(/(\d+(?:\.\d+)?)/)
  const gas = argonEverywhere || /\bAR\b|ARG|ARGON|\d+AR\b/.test(segment) ? ' argón' : ''
  const mm = number ? Number(number[1]) : undefined
  if (mm === undefined || !(mm >= 4 && mm <= 30)) return { label: `cámara por confirmar${gas}` }
  return { mm, label: `${fmt(mm)} cámara${gas}` }
}

/** Cámara escrita en la columna Color de algunas listas («Mate 10», «Negro 8», «Bronce 11.5»). */
export function chamberFromColor(color: string | undefined): number | undefined {
  const match = normalizeKey(color ?? '').replace(/(\d),(\d)/g, '$1.$2').match(/^(?:MATE|NEGRO|BRONCE|NATURAL|GRIS|ALUMINIO)\s+(\d+(?:\.\d+)?)$/)
  const mm = match ? Number(match[1]) : undefined
  return mm && mm >= 4 && mm <= 30 ? mm : undefined
}

function parseInsulated(text: string, name: string, chamberHint?: number): ParsedGlass | undefined {
  const argonEverywhere = /CON (GAS )?ARGON|C\/ARGON/.test(text)
  let body = text.replace(/^(DVH|TVH|TERMOPANEL)\s*/, '')
  // Cámaras entre paréntesis: «(15 AIR)», «(12 ARGON 90)», «(ARGON 90)».
  body = body.replace(/\(\s*(\d+(?:\.\d+)?)\s*(AIR\w*|ARG\w*|AR)\b[^)]*\)/g, ' + $1 $2 + ')
  body = body.replace(/\(\s*(AIR\w*|ARG\w*)[^)]*\)/g, ' + ?$1 + ')
  // Paños laminados entre paréntesis: «(4+4 PLANITHERM)», «(5+5)», «(6+PLANITHERM)».
  body = body.replace(/\(([^()]*)\)/g, (_, inner: string) => inner.replace(/\s*\+\s*/g, (sep) => (/\d\s*\+\s*\d/.test(inner) ? '&' : ' ')))
  body = body.replace(/(\d)\s*&\s*(?=[A-Z])/g, '$1 ')
  const segments = body
    .split(/\s*[+/]\s*/)
    .map((segment) => segment.replace(/^[,.\s]+|[,.\s]+$/g, '').trim())
    .filter(Boolean)
  if (segments.some((segment) => /^PVB\b/.test(segment))) {
    // «DVH 4+PVB+6»: es un laminado, no un doble vidriado (no trae cámara).
    const panes = segments.filter((segment) => !/^PVB\b/.test(segment)).map(parsePane).filter((pane): pane is Pane => Boolean(pane))
    if (!panes.length) return undefined
    const glass = panes.reduce((sum, pane) => sum + pane.glass, 0)
    return {
      name,
      kind: 'laminated',
      thickness: round1(glass + PVB),
      composition: panes.map((pane) => pane.label).join(' + PVB + '),
      weightKgM2: round1(glass * GLASS_KG_M2_PER_MM),
      doubtful: 'dice DVH pero no trae cámara: revisa si es un laminado',
    }
  }
  const usable = segments.filter((segment) => /\d|^\?/.test(segment))
  const panes: Pane[] = []
  const chambers: { mm?: number; label: string }[] = []
  if (usable.length === 2 && chamberHint) {
    // «DVH 4+4» con la cámara en la columna Color.
    const [a, b] = usable.map(parsePane)
    if (!a || !b) return undefined
    panes.push(a, b)
    chambers.push(parseChamber(String(chamberHint), argonEverywhere))
  } else {
    if (usable.length < 3 || usable.length % 2 === 0) return undefined
    for (const [index, segment] of usable.entries()) {
      if (index % 2 === 0) {
        const pane = parsePane(segment)
        if (!pane) return undefined
        panes.push(pane)
      } else chambers.push(parseChamber(segment.replace(/^\?/, ''), argonEverywhere))
    }
  }
  const glass = panes.reduce((sum, pane) => sum + pane.glass, 0)
  const unknownChamber = chambers.some((chamber) => chamber.mm === undefined)
  const thickness = unknownChamber ? 0 : round1(panes.reduce((sum, pane) => sum + pane.total, 0) + chambers.reduce((sum, chamber) => sum + (chamber.mm ?? 0), 0))
  const composition = panes.flatMap((pane, index) => (index < chambers.length ? [pane.label, chambers[index].label] : [pane.label])).join(' + ')
  return {
    name,
    kind: 'dvh',
    thickness,
    composition,
    weightKgM2: round1(glass * GLASS_KG_M2_PER_MM),
    ...(unknownChamber ? { doubtful: 'cámara sin medida: espesor por confirmar' } : {}),
  }
}

/**
 * Interpreta el nombre de un vidrio. undefined si no es un vidrio (siliconas, paletas,
 * separadores, paneles…). Los DVH se leen por capas: paños (simples o laminados, con low-e,
 * templados), cámaras (con argón) y la cámara escrita aparte en la columna Color.
 */
export function parseGlass(description: string, chamberHint?: number): ParsedGlass | undefined {
  const raw = description.replace(/\s+/g, ' ').replace(/\.{2,}/g, '').trim()
  const text = normalizeKey(raw).replace(/(\d),(\d)/g, '$1.$2')
  if (NOT_GLASS.test(text) || !GLASS_WORDS.test(text)) return undefined
  const isInsulated = /^(DVH|TVH)|TERMOPANEL|\bDVH\b/.test(text)
  const name = raw.replace(/^(DVH|TVH)\s+/i, (m) => m.toUpperCase()).replace(/\s*\+\s*/g, '+')
  if (isInsulated) {
    const parsed = parseInsulated(text, name, chamberHint)
    if (parsed) return parsed
    return { name, kind: 'dvh', thickness: 0, doubtful: 'composición sin interpretar' }
  }
  const laminatedText = /LAMINAD|SENTRYGLASS|ANTIRROBO|\d\.(38|76|52)\b/.test(text)
  const mm = text.match(/\b(\d{1,2}(?:\.\d{1,2})?)\s*(?:MM|MT2|M2)?\b(?=[^+]*$)/g)
  const thicknessMatch = text.match(/(\d{1,2}(?:\.\d{1,2})?)\s*MM\b/) ?? (mm ? [mm[mm.length - 1], mm[mm.length - 1]] : null)
  const thickness = thicknessMatch ? Number(String(thicknessMatch[1]).replace(/[^\d.]/g, '')) : 0
  const kind: GlassKind = laminatedText
    ? 'laminated'
    : /TEMPLAD|TEMPEX/.test(text)
      ? 'tempered'
      : /POLICARBONATO|ACRILICO/.test(text)
        ? 'other'
        : 'mono'
  // Notación técnica de laminado «33.1», «44.2»: 3+3 o 4+4 con 1 o 2 láminas de PVB.
  const technical = kind === 'laminated' ? text.match(/(?<![\d.])([2-8])([2-8])\.([1-8])(?![\d])/) : null
  if (technical) {
    const glassMm = Number(technical[1]) + Number(technical[2])
    return {
      name,
      kind,
      thickness: round1(glassMm + Number(technical[3]) * PVB),
      composition: `${technical[1]}+${technical[2]} laminado`,
      weightKgM2: round1(glassMm * GLASS_KG_M2_PER_MM),
    }
  }
  const safeThickness = thickness > 0 && thickness <= 60 ? thickness : 0
  // Laminado 6.38 = 3+3 + PVB 0,38: la masa sale del vidrio, no del PVB.
  const film = kind === 'laminated' ? String(safeThickness).match(/^(\d+)\.(\d+)$/) : null
  const glassMm = film ? Number(film[1]) : safeThickness
  return {
    name,
    kind,
    thickness: safeThickness,
    weightKgM2: glassMm && kind !== 'other' ? round1(glassMm * GLASS_KG_M2_PER_MM) : undefined,
    ...(safeThickness ? {} : { doubtful: 'sin espesor en el nombre' }),
  }
}

/** Precio por m² plausible (los relleno y los errores de tipeo quedan fuera). */
export function isPlausibleGlassPrice(price: number): boolean {
  return price >= 3000 && price <= 300000
}

/** Número de la descripción («55.3» → 55,3); NaN si no hay. */
export function numberIn(value: string): number {
  return parseDecimal(value)
}
