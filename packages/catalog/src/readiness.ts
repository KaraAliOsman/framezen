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
 *    sus reglas tienen precio y la pauta viene del fabricante (no la típica).
 *  - «verified» = «complete» + evidencia de taller (pauta verificada contra una obra real). La
 *    evidencia nunca se salta la comprobación.
 *  - «partial» en cualquier otro caso. Se cotiza igual y se avisa qué falta: nada bloquea.
 *
 * Puro y seguro para navegador.
 */
import type { Catalog, Id, Item, Line, OpeningKind, Profile, ProfileRole, TypologyId } from '@framezen/engine'

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
  /** Herrajes de referencia de Framezen (precio estimado, no de un proveedor). */
  referenceItems: Id[]
  /** Perfiles que la línea toma de otra línea de la marca. */
  sharedProfiles: { role: ProfileRole; profileId: Id; fromLineId: Id }[]
  /** La pauta es la típica de Framezen, no la del fabricante. */
  typicalPauta: boolean
  /** Hay evidencia de taller (pauta verificada contra una obra real). */
  evidence: boolean
  /** Lo que falta en palabras cortas («hoja», «riel», «herrajes», «la pauta del fabricante»). */
  missing: string[]
  /** «Lista para cotizar», «Cotiza con avisos: faltan precios de hoja y riel», «Solo medidas». */
  headline: string
  /** Detalle legible, una idea por frase. */
  details: string[]
}

/** La pauta típica de Framezen (sin productos del fabricante) se declara con este prefijo en `source`. */
export const TYPICAL_PAUTA_PREFIX = 'Pauta típica'
/**
 * Evidencia de taller declarada en `source`. `source` se muestra tal cual a cada taller, así que
 * dice «verificada por Framezen» y nunca cita la orden de trabajo de un tercero.
 */
export const VERIFIED_SOURCE_MARK = 'verificada por Framezen'
/**
 * Reconoce la evidencia en `source`. También acepta el texto de catálogos generados antes
 * («… + OT N° 385 …») para no bajar de nivel una línea que ya estaba verificada.
 */
export const VERIFIED_EVIDENCE_PATTERN = /verificada por Framezen|\bOT N° ?\d+/i

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

const SLIDING_ROLES: ProfileRole[] =['sliding_frame', 'sliding_sash', 'interlock', 'guide', 'bead']

/** Roles que necesita cada tipología practicable. */
const TYPOLOGY_ROLES: Partial<Record<TypologyId, ProfileRole[]>> = {
  fixed: ['frame', 'bead'],
  arch: ['frame', 'bead'],
  trapezoid: ['frame', 'bead'],
  triangle: ['frame', 'bead'],
  fixed_3: ['frame', 'bead', 'mullion'],
  casement: ['frame', 'sash', 'bead'],
  casement_out: ['frame', 'sash', 'bead'],
  tilt_turn: ['frame', 'sash', 'bead'],
  tilt: ['frame', 'sash', 'bead'],
  awning: ['frame', 'sash', 'bead'],
  casement_double: ['frame', 'sash', 'bead', 'french_mullion'],
  fixed_casement: ['frame', 'sash', 'bead', 'mullion'],
  fixed_tilt_turn: ['frame', 'sash', 'bead', 'mullion'],
  casement_transom: ['frame', 'sash', 'bead', 'mullion'],
  fixed_awning_bottom: ['frame', 'sash', 'bead', 'mullion'],
  casement_fixed_casement: ['frame', 'sash', 'bead', 'mullion'],
  door: ['frame', 'door_sash', 'bead'],
  door_double: ['frame', 'door_sash', 'bead', 'french_mullion'],
  door_sidelight: ['frame', 'door_sash', 'bead', 'mullion'],
  door_transom: ['frame', 'door_sash', 'bead', 'mullion'],
}

const TYPOLOGY_OPENINGS: Partial<Record<TypologyId, OpeningKind[]>> = {
  casement: ['casement'],
  casement_out: ['casement'],
  casement_double: ['casement'],
  fixed_casement: ['casement'],
  casement_transom: ['casement'],
  casement_fixed_casement: ['casement'],
  tilt_turn: ['tilt_turn'],
  fixed_tilt_turn: ['tilt_turn'],
  tilt: ['tilt'],
  awning: ['awning'],
  fixed_awning_bottom: ['awning'],
  door: ['door'],
  door_double: ['door'],
  door_sidelight: ['door'],
  door_transom: ['door'],
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
  if (line.kind === 'sliding') return [...SLIDING_ROLES]
  const roles = new Set<ProfileRole>()
  for (const id of line.typologyIds as TypologyId[]) for (const role of TYPOLOGY_ROLES[id] ?? []) roles.add(role)
  if (!roles.size) for (const role of ['frame', 'sash', 'bead'] as ProfileRole[]) roles.add(role)
  const order: ProfileRole[] = ['frame', 'sash', 'door_sash', 'mullion', 'french_mullion', 'bead']
  return order.filter((role) => roles.has(role))
}

function openingsFor(line: Pick<Line, 'kind' | 'typologyIds'>): Set<OpeningKind> {
  const out = new Set<OpeningKind>()
  if (line.kind === 'sliding') return out
  for (const id of line.typologyIds as TypologyId[]) for (const opening of TYPOLOGY_OPENINGS[id] ?? []) out.add(opening)
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
  const colors = line.colorIds?.length ? line.colorIds : []
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
  const readyColors = missingRoles.length
    ? []
    : colors.filter((colorId) => assigned.every(({ profile }) => (profile.priceByColor?.[colorId] ?? 0) > 0))

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

  const complete = !missingRoles.length && readyColors.length > 0 && !unpricedSteel.length && !unpricedItems.length && !typicalPauta
  const level: LineReadiness['level'] = complete ? (evidence ? 'verified' : 'complete') : 'partial'
  const state: ReadinessState = complete ? 'ready' : anyProfilePrice ? 'warnings' : 'geometry'

  // ── Frases ──
  const name = (role: ProfileRole) => READINESS_ROLE_NAME[role]
  // Roles sin precio que impiden la ventana completa: en todos los colores, o en todos los colores
  // en que el resto sí tiene precio.
  const blocking = readyColors.length ? [] : unpricedRoles.filter((gap) => gap.colorIds.length === colors.length || missingRoles.length === 0)
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
    if (!readyColors.length && unpricedRoles.length && !blocking.length) {
      details.push('Ningún color tiene todos sus perfiles con precio a la vez.')
    }
    for (const gap of unpricedRoles.filter((g) => !blocking.includes(g))) {
      details.push(`${READINESS_ROLE_SUBJECT[gap.role]} no tiene precio en ${colorList(catalog, gap.colorIds)}.`)
    }
    if (typicalPauta && headline.indexOf('pauta') < 0) {
      missing.push('la pauta del fabricante')
      details.push('Usa la pauta típica de Framezen: confirma los descuentos con el fabricante antes de cortar.')
    }
  } else {
    headline = 'Lista para cotizar'
    if (readyColors.length < colors.length) {
      const notReady = colors.filter((colorId) => !readyColors.includes(colorId))
      const lacking = unpricedRoles.filter((gap) => gap.colorIds.some((colorId) => notReady.includes(colorId))).map((gap) => name(gap.role))
      details.push(`En ${colorList(catalog, notReady)} faltan precios de ${listJoin(lacking)}: ahí cotiza con avisos.`)
    } else details.push('Todos sus perfiles, refuerzos, herrajes y accesorios tienen precio en los colores que ofrece.')
  }
  if (evidence && state === 'ready') details.unshift('Cortes verificados contra una orden de trabajo real.')
  else if (evidence) details.push('Sus cortes están verificados contra una orden de trabajo real; lo que falta son precios o perfiles.')
  if (sharedProfiles.length) {
    details.push(`Usa ${sharedProfiles.length === 1 ? 'un perfil' : 'perfiles'} de otra línea de la marca (${listJoin(sharedProfiles.map((shared) => name(shared.role)))}): revisa que calcen.`)
  }
  if (referenceItems.length && state !== 'geometry') {
    const kinds = items.filter((item) => item && referenceItems.includes(item.id)).map((item) => (item!.kind === 'hardware' ? 'herrajes' : 'accesorios'))
    details.push(`Algunos ${listJoin([...new Set(kinds)])} tienen precio de referencia de Framezen: cámbialo por el de tu proveedor.`)
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
