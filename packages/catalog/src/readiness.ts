/**
 * Completitud honesta de una línea: ¿se puede cotizar una ventana completa con precio?
 *
 * Reglas (las mismas en el importador y en la web, que recalcula en vivo con los precios del
 * taller):
 *  - Roles requeridos según las tipologías que publica la línea (marco, hoja, junquillo;
 *    travesaño si hay paños divididos; hoja de puerta e inversor si hay puertas o doble hoja;
 *    en correderas marco, hoja, traslapo, riel y junquillo).
 *  - «complete» solo si todos esos roles tienen perfil, hay al menos un color ofrecido en que
 *    TODOS tienen precio, los refuerzos que llevan tienen precio, los herrajes y accesorios de
 *    sus reglas tienen precio, la pauta viene del fabricante (no la típica) y, en las líneas del
 *    catálogo base, los cortes tienen respaldo (`provenance.automatic`).
 *  - «verified» = «complete» + evidencia de taller (pauta verificada contra una obra real). La
 *    evidencia nunca se salta la comprobación.
 *  - «partial» en cualquier otro caso. Se cotiza igual y se avisa qué falta: nada bloquea.
 *
 * Puro y seguro para navegador.
 */
import type { Catalog, Id, Item, Line, OpeningKind, Profile, ProfileRole, TypologyId } from '@dekopen/engine'
import { cutOrigin, lineProvenance, provenanceWarnings, type DataOrigin } from './provenance'

export type ReadinessState = 'ready' | 'warnings' | 'geometry'

export interface RoleGap {
  role: ProfileRole
  /** Perfil por defecto del rol. */
  profileId: Id
  /** Colores ofrecidos por la línea en que ese perfil no tiene precio. */
  colorIds: Id[]
}

export interface LineReadiness {
  lineId: Id
  level: NonNullable<Line['completeness']>
  /** ready = «Lista para cotizar» · warnings = «Cotiza con avisos» · geometry = «Solo medidas». */
  state: ReadinessState
  /** Colores en que una ventana completa sale con todos sus perfiles con precio. */
  readyColors: Id[]
  requiredRoles: ProfileRole[]
  /** Roles requeridos sin perfil asignado. */
  missingRoles: ProfileRole[]
  /** Perfiles asignados sin precio en algún color ofrecido. */
  unpricedRoles: RoleGap[]
  /** Refuerzos (acero) de los perfiles requeridos que no tienen precio. */
  unpricedSteel: Id[]
  /** Herrajes y accesorios de las reglas de la línea sin precio. */
  unpricedItems: Id[]
  /** Herrajes de referencia de DEKOPEN (precio estimado, no de un proveedor). */
  referenceItems: Id[]
  /** Perfiles que la línea toma de otra línea de la marca. */
  sharedProfiles: { role: ProfileRole; profileId: Id; fromLineId: Id }[]
  /** La pauta es la típica de DEKOPEN, no la del fabricante. */
  typicalPauta: boolean
  /** Hay evidencia de taller (pauta verificada contra una obra real). */
  evidence: boolean
  /** Peor origen de sus cortes (`fabricante`, `lista_taller`, `sin_verificar`). Sin dato: línea propia. */
  cutOrigin?: DataOrigin
  /** Línea del catálogo base cuyos cortes no tienen respaldo: se cotiza, pero con aviso. */
  unbackedCuts: boolean
  /** Motivos y contradicciones de sus datos técnicos, para mostrar junto a la línea. */
  dataWarnings: string[]
  /** Lo que falta en palabras cortas («hoja», «riel», «herrajes», «la pauta del fabricante»). */
  missing: string[]
  /** «Lista para cotizar», «Cotiza con avisos: faltan precios de hoja y riel», «Solo medidas». */
  headline: string
  /** Detalle legible, una idea por frase. */
  details: string[]
}

/** La pauta típica de DEKOPEN (sin productos del fabricante) se declara con este prefijo en `source`. */
export const TYPICAL_PAUTA_PREFIX = 'Pauta típica'
/**
 * Evidencia de taller declarada en `source`. `source` se muestra tal cual a cada taller, así que
 * dice «verificada por DEKOPEN» y nunca cita la orden de trabajo de un tercero.
 */
export const VERIFIED_SOURCE_MARK = 'verificada por DEKOPEN'
/**
 * Reconoce la evidencia en `source`. También acepta el texto de catálogos generados antes
 * («… + OT N° 385 …») para no bajar de nivel una línea que ya estaba verificada.
 */
export const VERIFIED_EVIDENCE_PATTERN = /verificada por DEKOPEN|\bOT N° ?\d+/i

/** Nombre corto y en minúscula de cada rol, para frases («faltan precios de hoja y riel»). */
export const READINESS_ROLE_NAME: Record<ProfileRole, string> = {
  frame: 'marco',
  sash: 'hoja',
  door_sash: 'hoja de puerta',
  mullion: 'travesaño',
  bead: 'junquillo',
  french_mullion: 'inversor',
  threshold: 'umbral',
  sliding_frame: 'marco',
  sliding_sash: 'hoja',
  interlock: 'traslapo',
  guide: 'riel',
  coupler: 'unión',
  reinforcement: 'refuerzo',
  other: 'complementario',
}

/** Sujeto con artículo para frases («El riel no tiene precio en negro»). */
const READINESS_ROLE_SUBJECT: Record<ProfileRole, string> = {
  frame: 'El marco',
  sash: 'La hoja',
  door_sash: 'La hoja de puerta',
  mullion: 'El travesaño',
  bead: 'El junquillo',
  french_mullion: 'El inversor',
  threshold: 'El umbral',
  sliding_frame: 'El marco',
  sliding_sash: 'La hoja',
  interlock: 'El traslapo',
  guide: 'El riel',
  coupler: 'La unión',
  reinforcement: 'El refuerzo',
  other: 'El perfil complementario',
}

const SLIDING_ROLES: ProfileRole[] = ['sliding_frame', 'sliding_sash', 'interlock', 'guide', 'bead']
const LIFT_SLIDE_ROLES: ProfileRole[] = [...SLIDING_ROLES, 'threshold']

const FIXED_ROLES: ProfileRole[] = ['frame', 'bead']
const SASH_ROLES: ProfileRole[] = ['frame', 'sash', 'bead']
const SASH_MULLION_ROLES: ProfileRole[] = ['frame', 'sash', 'bead', 'mullion']
const FRENCH_ROLES: ProfileRole[] = ['frame', 'sash', 'bead', 'french_mullion']
const DOOR_ROLES: ProfileRole[] = ['frame', 'door_sash', 'bead']
const FOLDING_ROLES: ProfileRole[] = ['frame', 'sash', 'bead', 'guide']

/**
 * Roles que necesita cada tipología. `Record` completo: una tipología nueva del motor no compila
 * hasta declarar aquí qué perfiles pide (antes era parcial y una omisión pasaba en silencio).
 */
const TYPOLOGY_ROLES: Record<TypologyId, ProfileRole[]> = {
  fixed: FIXED_ROLES,
  arch: FIXED_ROLES,
  trapezoid: FIXED_ROLES,
  triangle: FIXED_ROLES,
  round: FIXED_ROLES,
  oval: FIXED_ROLES,
  pentagon: FIXED_ROLES,
  octagon: FIXED_ROLES,
  gable: FIXED_ROLES,
  arch_segmental: FIXED_ROLES,
  fixed_3: ['frame', 'bead', 'mullion'],
  casement: SASH_ROLES,
  casement_out: SASH_ROLES,
  tilt_turn: SASH_ROLES,
  tilt: SASH_ROLES,
  awning: SASH_ROLES,
  pivot_v: SASH_ROLES,
  pivot_h: SASH_ROLES,
  casement_double: FRENCH_ROLES,
  french_casement: FRENCH_ROLES,
  french_tilt_turn: FRENCH_ROLES,
  fixed_casement: SASH_MULLION_ROLES,
  fixed_tilt_turn: SASH_MULLION_ROLES,
  casement_transom: SASH_MULLION_ROLES,
  fixed_awning_bottom: SASH_MULLION_ROLES,
  casement_fixed_casement: SASH_MULLION_ROLES,
  fixed_tilt_turn_fixed: SASH_MULLION_ROLES,
  tilt_turn_double_transom: SASH_MULLION_ROLES,
  arch_casement: SASH_MULLION_ROLES,
  // Osciloparalela y paralela: hoja de practicable junto a un fijo, separados por travesaño.
  tilt_slide: SASH_MULLION_ROLES,
  tilt_slide_2: SASH_MULLION_ROLES,
  parallel_slide: SASH_MULLION_ROLES,
  folding_3: FOLDING_ROLES,
  folding_4: FOLDING_ROLES,
  folding_5: FOLDING_ROLES,
  folding_6: FOLDING_ROLES,
  folding_7: FOLDING_ROLES,
  door: DOOR_ROLES,
  balcony_door: DOOR_ROLES,
  entrance_door: DOOR_ROLES,
  door_double: ['frame', 'door_sash', 'bead', 'french_mullion'],
  balcony_door_double: ['frame', 'door_sash', 'bead', 'french_mullion'],
  door_sidelight: ['frame', 'door_sash', 'bead', 'mullion'],
  door_transom: ['frame', 'door_sash', 'bead', 'mullion'],
  entrance_door_sidelights: ['frame', 'door_sash', 'bead', 'mullion'],
  door_double_sidelights: ['frame', 'door_sash', 'bead', 'mullion', 'french_mullion'],
  sliding_2: SLIDING_ROLES,
  sliding_2_fixed: SLIDING_ROLES,
  sliding_3: SLIDING_ROLES,
  sliding_3_rail: SLIDING_ROLES,
  sliding_4: SLIDING_ROLES,
  sliding_mono: SLIDING_ROLES,
  sliding_6: SLIDING_ROLES,
  sliding_3_center_fixed: SLIDING_ROLES,
  sliding_4_center_fixed: SLIDING_ROLES,
  lift_slide_2: LIFT_SLIDE_ROLES,
  lift_slide_3: LIFT_SLIDE_ROLES,
  lift_slide_4: LIFT_SLIDE_ROLES,
  casement_bottom_fixed: SASH_MULLION_ROLES,
  tilt_turn_bottom_fixed: SASH_MULLION_ROLES,
  casement_double_bottom_fixed: ['frame', 'sash', 'bead', 'mullion', 'french_mullion'],
  tilt_turn_transom: SASH_MULLION_ROLES,
  awning_transom: SASH_MULLION_ROLES,
  fixed_tilt: SASH_MULLION_ROLES,
  fixed_awning_side: SASH_MULLION_ROLES,
  casement_double_mullion: SASH_MULLION_ROLES,
  tilt_turn_fixed_tilt_turn: SASH_MULLION_ROLES,
  door_panel: ['frame', 'door_sash'],
  door_zocalo: [...DOOR_ROLES, 'mullion'],
  door_double_zocalo: ['frame', 'door_sash', 'bead', 'french_mullion'],
  door_out: DOOR_ROLES,
  vertical_sliding: SLIDING_ROLES,
  vertical_sliding_double: SLIDING_ROLES,
  louver_fixed: ['frame'],
}

/** Aperturas de hoja de cada tipología (para revisar que sus herrajes tengan precio). */
const TYPOLOGY_OPENINGS: Record<TypologyId, OpeningKind[]> = {
  fixed: [],
  arch: [],
  trapezoid: [],
  triangle: [],
  round: [],
  oval: [],
  pentagon: [],
  octagon: [],
  gable: [],
  arch_segmental: [],
  fixed_3: [],
  casement: ['casement'],
  casement_out: ['casement'],
  casement_double: ['casement'],
  french_casement: ['casement'],
  fixed_casement: ['casement'],
  casement_transom: ['casement'],
  casement_fixed_casement: ['casement'],
  arch_casement: ['casement'],
  balcony_door: ['casement'],
  balcony_door_double: ['casement'],
  tilt_turn: ['tilt_turn'],
  fixed_tilt_turn: ['tilt_turn'],
  fixed_tilt_turn_fixed: ['tilt_turn'],
  tilt_turn_double_transom: ['tilt_turn'],
  french_tilt_turn: ['casement', 'tilt_turn'],
  tilt: ['tilt'],
  awning: ['awning'],
  fixed_awning_bottom: ['awning'],
  pivot_v: ['pivot_v'],
  pivot_h: ['pivot_h'],
  tilt_slide: ['tilt_slide'],
  tilt_slide_2: ['tilt_slide'],
  parallel_slide: ['parallel_slide'],
  folding_3: ['folding'],
  folding_4: ['folding'],
  folding_5: ['folding'],
  folding_6: ['folding'],
  folding_7: ['folding'],
  door: ['door'],
  door_double: ['door'],
  door_sidelight: ['door'],
  door_transom: ['door'],
  entrance_door: ['door'],
  entrance_door_sidelights: ['door'],
  door_double_sidelights: ['door'],
  // Correderas: sus reglas se revisan aparte (openings vacío = hoja móvil).
  sliding_2: [],
  sliding_2_fixed: [],
  sliding_3: [],
  sliding_3_rail: [],
  sliding_4: [],
  sliding_mono: [],
  sliding_6: [],
  sliding_3_center_fixed: [],
  sliding_4_center_fixed: [],
  lift_slide_2: [],
  lift_slide_3: [],
  lift_slide_4: [],
  casement_bottom_fixed: ['casement'],
  tilt_turn_bottom_fixed: ['tilt_turn'],
  casement_double_bottom_fixed: ['casement'],
  tilt_turn_transom: ['tilt_turn'],
  awning_transom: ['awning'],
  fixed_tilt: ['tilt'],
  fixed_awning_side: ['awning'],
  casement_double_mullion: ['casement'],
  tilt_turn_fixed_tilt_turn: ['tilt_turn'],
  door_panel: ['door'],
  door_zocalo: ['door'],
  door_double_zocalo: ['door'],
  door_out: ['door'],
  vertical_sliding: [],
  vertical_sliding_double: [],
  louver_fixed: [],
}

/** Equivalencias que usa el motor al buscar el perfil de un rol. */
const ROLE_FALLBACKS: Partial<Record<ProfileRole, ProfileRole[]>> = {
  frame: ['frame', 'sliding_frame'],
  sliding_frame: ['sliding_frame', 'frame'],
  sash: ['sash', 'sliding_sash'],
  sliding_sash: ['sliding_sash', 'sash'],
}

/** Roles que una línea necesita para fabricar las tipologías que publica. */
export function requiredRolesFor(line: Pick<Line, 'kind' | 'typologyIds'>): ProfileRole[] {
  const typologyIds = (line.typologyIds ?? []).filter((id): id is TypologyId => id in TYPOLOGY_ROLES)
  if (line.kind === 'sliding') {
    // La elevadora corre sobre su umbral: si la línea la publica, el umbral también es requerido.
    const lift = typologyIds.some((id) => TYPOLOGY_ROLES[id].includes('threshold'))
    return lift ? [...LIFT_SLIDE_ROLES] : [...SLIDING_ROLES]
  }
  const roles = new Set<ProfileRole>()
  for (const id of typologyIds) for (const role of TYPOLOGY_ROLES[id]) roles.add(role)
  if (!roles.size) for (const role of SASH_ROLES) roles.add(role)
  const order: ProfileRole[] = ['frame', 'sash', 'door_sash', 'mullion', 'french_mullion', 'bead', 'guide', 'threshold']
  return order.filter((role) => roles.has(role))
}

function openingsFor(line: Pick<Line, 'kind' | 'typologyIds'>): Set<OpeningKind> {
  const out = new Set<OpeningKind>()
  if (line.kind === 'sliding') return out
  for (const id of line.typologyIds ?? []) for (const opening of TYPOLOGY_OPENINGS[id as TypologyId] ?? []) out.add(opening)
  return out
}

function listJoin(parts: string[]): string {
  const unique = [...new Set(parts)]
  if (unique.length <= 1) return unique.join('')
  return `${unique.slice(0, -1).join(', ')} y ${unique[unique.length - 1]}`
}

function colorList(catalog: Pick<Catalog, 'colors'>, ids: Id[]): string {
  const names = ids.map((id) => (catalog.colors.find((color) => color.id === id)?.name ?? id).toLocaleLowerCase('es-CL'))
  return listJoin(names)
}

export interface ReadinessIndex {
  profiles: Map<Id, Profile>
  items: Map<Id, Item>
  lines: Map<Id, Line>
}

/** Índices para evaluar muchas líneas sin recorrer el catálogo cada vez. */
export function readinessIndex(catalog: Pick<Catalog, 'profiles' | 'items' | 'lines'>): ReadinessIndex {
  return {
    profiles: new Map(catalog.profiles.map((profile) => [profile.id, profile])),
    items: new Map(catalog.items.map((item) => [item.id, item])),
    lines: new Map(catalog.lines.map((line) => [line.id, line])),
  }
}

/**
 * Completitud honesta de una línea con los precios que tiene el catálogo (el de fábrica o el
 * efectivo del taller con sus precios propios). Nunca lanza.
 */
export function lineReadiness(catalog: Pick<Catalog, 'profiles' | 'items' | 'lines' | 'colors'>, line: Line, index: ReadinessIndex = readinessIndex(catalog)): LineReadiness {
  const required = requiredRolesFor(line)
  // Un color propio que hereda precios («Mismo precio», recargo) no es un faltante aparte: sus
  // huecos son los del color de referencia. Solo cuenta como color listo cuando tiene precio.
  const inherits = new Set((catalog.colors ?? []).filter((c) => c.priceFrom).map((c) => c.id))
  const offered = line.colorIds?.length ? line.colorIds : []
  const colors = offered.filter((id) => !inherits.has(id))
  const inherited = offered.filter((id) => inherits.has(id))
  const resolve = (role: ProfileRole): Profile | undefined => {
    for (const candidate of ROLE_FALLBACKS[role] ?? [role]) {
      const id = line.profiles?.[candidate]
      const profile = id ? index.profiles.get(id) : undefined
      if (profile) return profile
    }
    return undefined
  }

  const missingRoles: ProfileRole[] = []
  const unpricedRoles: RoleGap[] = []
  const assigned: { role: ProfileRole; profile: Profile }[] = []
  for (const role of required) {
    const profile = resolve(role)
    if (!profile) {
      missingRoles.push(role)
      continue
    }
    assigned.push({ role, profile })
    const lacking = colors.filter((colorId) => !((profile.priceByColor?.[colorId] ?? 0) > 0))
    if (lacking.length) unpricedRoles.push({ role, profileId: profile.id, colorIds: lacking })
  }
  const pricedIn = (colorId: Id) => assigned.every(({ profile }) => (profile.priceByColor?.[colorId] ?? 0) > 0)
  const readyBase = missingRoles.length ? [] : colors.filter(pricedIn)
  const readyColors = missingRoles.length ? [] : [...readyBase, ...inherited.filter(pricedIn)]

  // Acero de los perfiles requeridos (y de la hoja interior, si la línea la tiene).
  const steelOwners = [...assigned.map(({ profile }) => profile)]
  const sashIn = line.sashInProfileId ? index.profiles.get(line.sashInProfileId) : undefined
  if (sashIn) steelOwners.push(sashIn)
  const unpricedSteel = [
    ...new Set(
      steelOwners
        .map((profile) => profile.reinforcementId)
        .filter((id): id is Id => Boolean(id))
        .filter((id) => {
          const steel = index.profiles.get(id)
          return !steel || !Object.values(steel.priceByColor ?? {}).some((price) => price > 0)
        }),
    ),
  ]

  // Herrajes y accesorios de las reglas que aplican a las aperturas que fabrica la línea.
  const openings = openingsFor(line)
  const ruleItems = new Set<Id>()
  for (const rule of line.hardwareRules ?? []) {
    if (line.kind === 'sliding' ? rule.openings.length === 0 : rule.openings.length === 0 || rule.openings.some((opening) => openings.has(opening))) ruleItems.add(rule.itemId)
  }
  for (const rule of line.accessoryRules ?? []) ruleItems.add(rule.itemId)
  const unpricedItems: Id[] = []
  const referenceItems: Id[] = []
  for (const id of ruleItems) {
    const item = index.items.get(id)
    if (!item || !(item.price > 0)) unpricedItems.push(id)
    else if (id.startsWith('fz.')) referenceItems.push(id)
  }

  const sharedProfiles: LineReadiness['sharedProfiles'] = []
  for (const { role, profile } of assigned) {
    if (profile.lineId === line.id) continue
    const owner = index.lines.get(profile.lineId)
    // Una variante («PROSLD70 · monorriel») usa los perfiles de su línea madre: no es «prestado».
    if (owner && line.name.startsWith(`${owner.name} · `)) continue
    sharedProfiles.push({ role, profileId: profile.id, fromLineId: profile.lineId })
  }

  const factoryAdjusted = (line as Line & { factory?: unknown }).factory !== undefined
  const typicalPauta = !factoryAdjusted && (line.source ?? '').startsWith(TYPICAL_PAUTA_PREFIX)
  const evidence = VERIFIED_EVIDENCE_PATTERN.test(line.source ?? '')
  const anyProfilePrice = assigned.some(({ profile }) => Object.values(profile.priceByColor ?? {}).some((price) => price > 0))

  const provenance = lineProvenance(line)
  const unbackedCuts = Boolean(provenance && !provenance.automatic)
  const dataWarnings = provenanceWarnings(line)
  const complete = !missingRoles.length && readyColors.length > 0 && !unpricedSteel.length && !unpricedItems.length && !typicalPauta && !unbackedCuts
  const level: LineReadiness['level'] = complete ? (evidence ? 'verified' : 'complete') : 'partial'
  const state: ReadinessState = complete ? 'ready' : anyProfilePrice ? 'warnings' : 'geometry'

  // ── Frases ──
  const name = (role: ProfileRole) => READINESS_ROLE_NAME[role]
  // Roles sin precio que impiden la ventana completa: en todos los colores, o en todos los colores
  // en que el resto sí tiene precio.
  const blocking = readyBase.length ? [] : unpricedRoles.filter((gap) => gap.colorIds.length === colors.length || missingRoles.length === 0)
  const unpricedNames = blocking.map((gap) => name(gap.role))
  if (unpricedSteel.length) unpricedNames.push(unpricedSteel.length === 1 ? 'refuerzo' : 'refuerzos')
  const items = [...ruleItems].map((id) => index.items.get(id))
  const unpricedKinds = unpricedItems.map((id) => index.items.get(id)).map((item) => (item?.kind === 'hardware' ? 'herrajes' : 'accesorios'))
  unpricedNames.push(...new Set(unpricedKinds))

  const missingProfilesSentence = (prefix: string) =>
    missingRoles.length === 1
      ? `${prefix} el perfil de ${name(missingRoles[0])}: lo que lo necesita se cotiza sin él y te avisa.`
      : `${prefix} los perfiles de ${listJoin(missingRoles.map(name))}: lo que los necesita se cotiza sin ellos y te avisa.`
  const missing: string[] = []
  let headline: string
  const details: string[] = []
  if (state === 'geometry') {
    headline = 'Solo medidas'
    details.push(
      assigned.length
        ? 'Los perfiles de esta línea no traen precio: dibuja y corta con sus medidas, pero el costo sale en $0 hasta que cargues tus precios.'
        : 'Esta línea no trae perfiles con precio: dibuja con sus medidas y carga tus precios para cotizar con costo real.',
    )
    if (missingRoles.length) {
      missing.push(...missingRoles.map(name))
      details.push(missingProfilesSentence(missingRoles.length === 1 ? 'Le falta' : 'Le faltan'))
    }
  } else if (state === 'warnings') {
    if (unpricedNames.length) {
      missing.push(...unpricedNames)
      headline = `Cotiza con avisos: faltan precios de ${listJoin(unpricedNames)}`
    } else if (missingRoles.length) {
      missing.push(...missingRoles.map(name))
      headline = `Cotiza con avisos: ${missingRoles.length === 1 ? `falta el perfil de ${name(missingRoles[0])}` : `faltan perfiles de ${listJoin(missingRoles.map(name))}`}`
      details.push(missingRoles.length === 1 ? 'Lo que necesita ese perfil se cotiza sin él y la cotización te lo avisa.' : 'Lo que necesita esos perfiles se cotiza sin ellos y la cotización te lo avisa.')
    } else {
      missing.push('la pauta del fabricante')
      headline = 'Cotiza con avisos: falta la pauta del fabricante'
    }
    if (missingRoles.length && unpricedNames.length) {
      missing.push(...missingRoles.map(name))
      details.push(missingProfilesSentence(missingRoles.length === 1 ? 'También falta' : 'También faltan'))
    }
    if (!readyBase.length && unpricedRoles.length && !blocking.length) {
      details.push('Ningún color tiene todos sus perfiles con precio a la vez.')
    }
    for (const gap of unpricedRoles.filter((g) => !blocking.includes(g))) {
      details.push(`${READINESS_ROLE_SUBJECT[gap.role]} no tiene precio en ${colorList(catalog, gap.colorIds)}.`)
    }
    if (typicalPauta && headline.indexOf('pauta') < 0) {
      missing.push('la pauta del fabricante')
      details.push('Usa la pauta típica de DEKOPEN: confirma los descuentos con el fabricante antes de cortar.')
    }
    if (unbackedCuts && !typicalPauta) {
      if (headline.indexOf('pauta') < 0) missing.push('la pauta del fabricante')
      details.push('Sus cortes no están confirmados por el fabricante: revísalos antes de cortar.')
    }
  } else {
    headline = 'Lista para cotizar'
    if (readyBase.length < colors.length) {
      const notReady = colors.filter((colorId) => !readyBase.includes(colorId))
      const lacking = unpricedRoles.filter((gap) => gap.colorIds.some((colorId) => notReady.includes(colorId))).map((gap) => name(gap.role))
      details.push(`En ${colorList(catalog, notReady)} faltan precios de ${listJoin(lacking)}: ahí cotiza con avisos.`)
    } else details.push('Todos sus perfiles, refuerzos, herrajes y accesorios tienen precio en los colores que ofrece.')
  }
  if (evidence && state === 'ready') details.unshift('Cortes verificados contra una orden de trabajo real.')
  else if (evidence && !unbackedCuts) details.push('Sus cortes están verificados contra una orden de trabajo real; lo que falta son precios o perfiles.')
  if (sharedProfiles.length) {
    details.push(`Usa ${sharedProfiles.length === 1 ? 'un perfil' : 'perfiles'} de otra línea de la marca (${listJoin(sharedProfiles.map((shared) => name(shared.role)))}): revisa que calcen.`)
  }
  if (referenceItems.length && state !== 'geometry') {
    const kinds = items.filter((item) => item && referenceItems.includes(item.id)).map((item) => (item!.kind === 'hardware' ? 'herrajes' : 'accesorios'))
    details.push(`Algunos ${listJoin([...new Set(kinds)])} tienen precio de referencia de DEKOPEN: cámbialo por el de tu proveedor.`)
  }
  return {
    lineId: line.id,
    level,
    state,
    readyColors,
    requiredRoles: required,
    missingRoles,
    unpricedRoles,
    unpricedSteel,
    unpricedItems,
    referenceItems,
    sharedProfiles,
    typicalPauta,
    evidence,
    ...(provenance ? { cutOrigin: cutOrigin(line) } : {}),
    unbackedCuts,
    dataWarnings,
    missing: [...new Set(missing)],
    headline,
    details,
  }
}

/** Completitud de todas las líneas (por id). */
export function catalogReadiness(catalog: Pick<Catalog, 'profiles' | 'items' | 'lines' | 'colors'>): Map<Id, LineReadiness> {
  const index = readinessIndex(catalog)
  return new Map(catalog.lines.map((line) => [line.id, lineReadiness(catalog, line, index)]))
}

/** Cuántas líneas de una marca están listas, con avisos o solo con medidas. */
export function brandReadiness(catalog: Pick<Catalog, 'profiles' | 'items' | 'lines' | 'colors'>, brandId: Id): Record<ReadinessState, number> & { lines: number } {
  const out = { ready: 0, warnings: 0, geometry: 0, lines: 0 }
  const index = readinessIndex(catalog)
  for (const line of catalog.lines) {
    if (line.brandId !== brandId) continue
    out.lines++
    out[lineReadiness(catalog, line, index).state]++
  }
  return out
}
