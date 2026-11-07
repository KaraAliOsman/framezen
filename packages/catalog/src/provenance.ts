/**
 * Procedencia de los datos técnicos del catálogo: de dónde sale cada medida y si alcanza para
 * cotizar y cortar sin revisión.
 *
 * Aquí viven solo las reglas (el repositorio es público). La evidencia de cada marca —medidas,
 * fuentes y notas— está en un archivo local que el importador lee (`CatalogEvidence`) y termina en
 * el catálogo base como `Line.provenance`.
 *
 * Tres orígenes, sin grises:
 *  - `fabricante`: se vio en un documento del fabricante o su distribuidor oficial (con fuente).
 *  - `lista_taller`: viene de las listas y pautas que entregó el taller o de una obra real.
 *  - `sin_verificar`: es un supuesto o un valor por defecto. Nunca se presenta como dato.
 *
 * Línea sin `provenance` (ejemplo o creada por un taller): es del taller y no se le exige nada.
 *
 * Puro y seguro para navegador.
 */
import type { Catalog, Id, Line, Pauta, Profile, ProfileRole, TypologyId } from '@dekopen/engine'

export type DataOrigin = 'fabricante' | 'lista_taller' | 'sin_verificar'

export const ORIGIN_LABEL: Record<DataOrigin, string> = {
  fabricante: 'Fabricante',
  lista_taller: 'Lista del taller',
  sin_verificar: 'Sin verificar',
}

/** Resultado de contrastar un dato: lo que muestra la matriz por línea. */
export type DataStatus = 'verificado' | 'corregido' | 'contradiccion' | 'sin_dato'

export interface DataSource {
  id: string
  title: string
  publisher: string
  url?: string
  /** Fecha o edición del documento, tal como la declara. */
  date?: string
  note?: string
}

export interface FieldProvenance {
  origin: DataOrigin
  status?: DataStatus
  /** Id de `DataSource` (exigido cuando `origin` es `fabricante`). */
  source?: string
  /** Página o sección dentro de la fuente. */
  ref?: string
  note?: string
}

/** Junquillo por espesor de vidrio. */
export interface BeadRange {
  code: string
  min: number
  max: number
  source?: string
}

/** Límite de hoja publicado por el fabricante, por apertura. */
export interface SizeLimit {
  opening: string
  width: [number, number]
  height: [number, number]
  /** Espesor de refuerzo recomendado (mm). */
  steel?: number
  maxKg?: number
  source?: string
}

export interface LineProvenance {
  /** Dato → procedencia (`pauta.frameDeduction`, `depth`, `corte.angulos`, `refuerzo.mapa`…). */
  fields: Record<string, FieldProvenance>
  /** Los cortes de esta línea tienen base para cotizar sin revisión. */
  automatic: boolean
  /** Motivo si no. */
  reason?: string
  /** Tipologías con una observación propia (el motor no reproduce la fuente, sin caso, etc.). */
  typologies?: Partial<Record<TypologyId, FieldProvenance>>
  /** Espesor de vidrio admitido (mm). */
  glazing?: { min: number; max: number; source?: string }
  beads?: BeadRange[]
  limits?: SizeLimit[]
  /** Fuentes citadas por esta línea. */
  sources?: DataSource[]
  notes?: string[]
}

/** Procedencia de los datos de un perfil. */
export type ProfileWithProvenance = Profile & { provenance?: Record<string, FieldProvenance> }

/** Línea con su respaldo completo (el motor solo lee vidrio, junquillos y límites). */
export type LineWithProvenance = Line & { provenance?: LineProvenance }

/** Cortes que deben tener respaldo para que una línea se cotice sin revisión. */
export const CUT_FIELDS = [
  'pauta.weld',
  'pauta.frameDeduction',
  'pauta.sashWidth',
  'pauta.sashDeduction',
  'pauta.sashOverlap',
  'pauta.glassGap',
  'pauta.mullionDeduction',
] as const

/** Lo que lleva cada dato en lenguaje de taller (para avisos). */
export const FIELD_LABEL: Record<string, string> = {
  depth: 'profundidad',
  chambers: 'cámaras',
  'pauta.weld': 'merma de soldadura',
  'pauta.frameDeduction': 'descuento de marco',
  'pauta.sashWidth': 'ancho de hoja',
  'pauta.sashDeduction': 'descuento de hoja',
  'pauta.sashOverlap': 'traslapo de hoja',
  'pauta.glassGap': 'holgura de vidrio',
  'pauta.mullionDeduction': 'descuento de travesaño',
  'pauta.beadDeduction': 'descuento de junquillo',
  'pauta.reinforcement': 'descuentos de refuerzo',
  'puerta.exterior': 'hoja de puerta exterior',
  'corte.angulos': 'ángulos de corte',
  'taller.kerf': 'corte de sierra',
  'taller.trim': 'despunte',
  'junquillo.porVidrio': 'junquillo por espesor de vidrio',
  'refuerzo.mapa': 'refuerzo de cada perfil',
  'barra.largo': 'largo de barra',
  'herrajes.reglas': 'herrajes por medida',
  'limites.tamano': 'límites de tamaño y peso',
  precios: 'precios',
}

/** Evidencia que lee el importador (archivo local, nunca versionado). */
export interface LineEvidence {
  verdict?: DataStatus
  /** Decide a mano si la línea se cotiza sin revisión; sin dato, se deduce de `fields`. */
  automatic?: boolean
  reason?: string
  fields?: Record<string, FieldProvenance>
  /** Correcciones con evidencia. `roles` y `reinforcement` usan el código del perfil. */
  set?: {
    depth?: number
    chambers?: number
    description?: string
    pauta?: Partial<Pauta>
    doorPauta?: Partial<Pauta>
    roles?: Partial<Record<ProfileRole, string>>
    /** Hoja de la puerta que abre hacia afuera (código) y su pauta. */
    doorOutProfile?: string
    doorOutPauta?: Partial<Pauta>
  }
  typologies?: LineProvenance['typologies']
  glazing?: LineProvenance['glazing']
  beads?: BeadRange[]
  limits?: SizeLimit[]
  notes?: string[]
}

export interface VariantEvidence extends LineEvidence {
  id: Id
  parent: Id
  name: string
  typologyIds: TypologyId[]
}

export interface ProfileEvidence {
  /** Cara vista (mm). En acoples es lo que suman al desarrollo de un conjunto. */
  face?: number
  /** De dónde sale `face`. Obligatorio con `face`: un acople sin fuente queda sin dato. */
  faceSource?: FieldProvenance
  weightKgM?: number
  /** Código del refuerzo que corresponde a este perfil. */
  reinforcement?: string
  /** Mueve el perfil a otra línea de la marca. */
  lineId?: Id
}

export interface CatalogEvidence {
  version: 1
  sources: Record<string, Omit<DataSource, 'id'>>
  /** Datos comunes a todas las líneas de una marca. */
  brands?: Record<
    Id,
    {
      fields?: Record<string, FieldProvenance>
      notes?: string[]
      /** Marca hermana cuya lista trae el precio de los mismos códigos (solo llena perfiles sin precio). */
      priceFrom?: Id
    }
  >
  lines?: Record<Id, LineEvidence>
  variants?: VariantEvidence[]
  /** `marca|código` → corrección de perfil. */
  profiles?: Record<string, ProfileEvidence>
}

export interface EvidenceReport {
  applied: string[]
  /** Lo que la evidencia pide y el catálogo no pudo cumplir (código inexistente, etc.). */
  skipped: string[]
}

const typical = (line: Line) => (line.source ?? '').startsWith('Pauta típica')
const workshopCase = (line: Line) => /verificada por DEKOPEN|\bOT N° ?\d+/i.test(line.source ?? '')

/**
 * Lo que se sabe de una línea sin evidencia: descuentos de marco y hoja de la pauta que entregó el
 * taller (si la hay), precios de su lista, y todo lo demás sin verificar. Las constantes
 * (soldadura, traslapo, holgura, travesaño) las rellena el importador cuando faltan: no son datos.
 */
export function defaultProvenance(line: Line): LineProvenance {
  const pauta: FieldProvenance = typical(line)
    ? { origin: 'sin_verificar', status: 'sin_dato', note: 'Pauta típica, no de la línea.' }
    : { origin: 'lista_taller', status: 'sin_dato', note: 'Pauta entregada con las listas; sin contrastar con el fabricante.' }
  const assumed: FieldProvenance = workshopCase(line)
    ? { origin: 'lista_taller', status: 'sin_dato', note: 'Ajustado a una obra real.' }
    : { origin: 'sin_verificar', status: 'sin_dato', note: 'Valor por defecto del importador.' }
  const unknown: FieldProvenance = { origin: 'sin_verificar', status: 'sin_dato' }
  const fields: Record<string, FieldProvenance> = {
    'pauta.frameDeduction': pauta,
    'pauta.sashWidth': pauta,
    'pauta.sashDeduction': pauta,
    'pauta.weld': assumed,
    'pauta.sashOverlap': assumed,
    'pauta.glassGap': assumed,
    'pauta.mullionDeduction': assumed,
    precios: { origin: 'lista_taller' },
    depth: unknown,
    chambers: unknown,
    'pauta.reinforcement': unknown,
    'corte.angulos': unknown,
    'taller.kerf': unknown,
    'taller.trim': unknown,
    'junquillo.porVidrio': unknown,
    'refuerzo.mapa': unknown,
    'barra.largo': unknown,
    'herrajes.reglas': unknown,
    'limites.tamano': unknown,
  }
  const provenance: LineProvenance = { fields, automatic: false }
  return settle(provenance, line)
}

/** Datos de corte que una línea necesita (la corredera no descuenta travesaño). */
function requiredCuts(line: Line): string[] {
  return CUT_FIELDS.filter((field) => field !== 'pauta.mullionDeduction' || line.kind !== 'sliding')
}

/** Cortes sin respaldo de una línea (etiquetas de taller). */
export function unverifiedCuts(line: Line, provenance: LineProvenance): string[] {
  return requiredCuts(line).filter((field) => (provenance.fields[field]?.origin ?? 'sin_verificar') === 'sin_verificar')
}

function settle(provenance: LineProvenance, line: Line, decided?: boolean, reason?: string): LineProvenance {
  const missing = unverifiedCuts(line, provenance)
  const automatic = decided ?? missing.length === 0
  const why = automatic ? undefined : (reason ?? `Sin respaldo: ${missing.map((field) => FIELD_LABEL[field] ?? field).join(', ')}.`)
  return { ...provenance, automatic, ...(why ? { reason: why } : { reason: undefined }) }
}

/** Procedencia de una línea, o `undefined` si la línea no viene del catálogo base. */
export function lineProvenance(line: Line): LineProvenance | undefined {
  return (line as LineWithProvenance).provenance
}

/**
 * Peor origen entre los cortes de una línea. Es lo que debe mostrar la app junto a la línea:
 * `fabricante` solo si todos los cortes lo son.
 */
export function cutOrigin(line: Line): DataOrigin | undefined {
  const provenance = lineProvenance(line)
  if (!provenance) return undefined
  const origins = requiredCuts(line).map((field) => provenance.fields[field]?.origin ?? 'sin_verificar')
  if (origins.includes('sin_verificar')) return 'sin_verificar'
  return origins.includes('lista_taller') ? 'lista_taller' : 'fabricante'
}

/** Contradicciones y faltantes de una línea, una frase por idea, para avisar en la app. */
export function provenanceWarnings(line: Line): string[] {
  const provenance = lineProvenance(line)
  if (!provenance) return []
  const out: string[] = []
  if (!provenance.automatic && provenance.reason) out.push(provenance.reason)
  for (const [field, data] of Object.entries(provenance.fields)) {
    if (data.status === 'contradiccion') out.push(`${FIELD_LABEL[field] ?? field}: ${data.note ?? 'las fuentes no coinciden.'}`)
  }
  for (const [typology, data] of Object.entries(provenance.typologies ?? {})) {
    if (data?.note) out.push(`${typology}: ${data.note}`)
  }
  return out
}

function byCode(profiles: Profile[], brandId: Id, code: string): Profile | undefined {
  const prefix = `${brandId}.`
  return profiles.find((profile) => profile.lineId.startsWith(prefix) && profile.code === code)
}

function mergeLine(line: Line, evidence: LineEvidence, profiles: Profile[], sources: CatalogEvidence['sources'], report: EvidenceReport): void {
  const { set } = evidence
  if (set?.depth !== undefined) line.depth = set.depth
  if (set?.chambers !== undefined) line.chambers = set.chambers
  if (set?.description) line.description = set.description
  if (set?.pauta) line.pauta = { ...line.pauta, ...set.pauta, ...(set.pauta.reinforcement ? { reinforcement: { ...line.pauta.reinforcement, ...set.pauta.reinforcement } } : {}) }
  if (set?.doorPauta) line.doorPauta = { ...line.doorPauta, ...set.doorPauta }
  if (set?.doorOutProfile) {
    const target = byCode(profiles, line.brandId, set.doorOutProfile)
    if (target) line.doorOutProfileId = target.id
    else report.skipped.push(`${line.id}: el perfil ${set.doorOutProfile} no está en la lista (puerta exterior).`)
  }
  if (set?.doorOutPauta) line.doorOutPauta = { ...line.doorOutPauta, ...set.doorOutPauta }
  for (const [role, code] of Object.entries(set?.roles ?? {}) as [ProfileRole, string][]) {
    const target = byCode(profiles, line.brandId, code)
    if (target) line.profiles[role] = target.id
    else report.skipped.push(`${line.id}: el perfil ${code} no está en la lista (${role}).`)
  }
  const current = (line as LineWithProvenance).provenance ?? defaultProvenance(line)
  const merged: LineProvenance = {
    ...current,
    fields: { ...current.fields, ...evidence.fields },
    ...(evidence.typologies ? { typologies: evidence.typologies } : {}),
    ...(evidence.glazing ? { glazing: evidence.glazing } : {}),
    ...(evidence.beads ? { beads: evidence.beads } : {}),
    ...(evidence.limits ? { limits: evidence.limits } : {}),
    ...(evidence.notes ? { notes: [...(current.notes ?? []), ...evidence.notes] } : {}),
  }
  const cited = new Set<string>()
  const collect = (entry?: { source?: string }) => {
    if (entry?.source) cited.add(entry.source)
  }
  Object.values(merged.fields).forEach(collect)
  Object.values(merged.typologies ?? {}).forEach(collect)
  collect(merged.glazing)
  merged.beads?.forEach(collect)
  merged.limits?.forEach(collect)
  for (const [field, data] of Object.entries(merged.fields)) {
    if (data.origin === 'fabricante' && !(data.source && sources[data.source])) {
      report.skipped.push(`${line.id}: ${field} dice «fabricante» sin una fuente registrada.`)
      merged.fields[field] = { ...data, origin: 'sin_verificar', note: data.note ?? 'Fuente no registrada.' }
    }
  }
  merged.sources = [...cited].filter((id) => sources[id]).map((id) => ({ id, ...sources[id]! }))
  ;(line as LineWithProvenance).provenance = settle(merged, line, evidence.automatic, evidence.reason)
}

/**
 * Aplica la evidencia al catálogo importado y deja `provenance` en cada línea. Debe correr antes de
 * calcular la completitud. Sin evidencia, cada línea queda con lo que se sabe de ella: nada se
 * presenta como verificado por defecto. Muta `catalog`.
 */
export function applyEvidence(catalog: Pick<Catalog, 'lines' | 'profiles'>, evidence?: CatalogEvidence | null): EvidenceReport {
  const report: EvidenceReport = { applied: [], skipped: [] }
  for (const line of catalog.lines) (line as LineWithProvenance).provenance = defaultProvenance(line)
  if (!evidence) return report

  for (const [key, patch] of Object.entries(evidence.profiles ?? {})) {
    const [brandId, code] = key.split('|') as [Id, string]
    const profile = byCode(catalog.profiles, brandId, code)
    if (!profile) {
      report.skipped.push(`${key}: el perfil no está en la lista.`)
      continue
    }
    if (patch.face !== undefined) {
      const origin = patch.faceSource
      const backed = origin && (origin.origin === 'lista_taller' || (origin.origin === 'fabricante' && origin.source && evidence.sources[origin.source]))
      if (backed) {
        profile.face = patch.face
        ;(profile as ProfileWithProvenance).provenance = { face: origin }
      } else report.skipped.push(`${key}: cara vista sin fuente, queda sin dato.`)
    }
    if (patch.weightKgM !== undefined) profile.weightKgM = patch.weightKgM
    if (patch.lineId) profile.lineId = patch.lineId
    if (patch.reinforcement) {
      const steel = byCode(catalog.profiles, brandId, patch.reinforcement)
      if (steel) profile.reinforcementId = steel.id
      else report.skipped.push(`${key}: el refuerzo ${patch.reinforcement} no está en la lista.`)
    }
    report.applied.push(key)
  }

  for (const [brandId, { priceFrom }] of Object.entries(evidence.brands ?? {})) {
    if (!priceFrom) continue
    const prices = new Map(catalog.profiles.filter((profile) => profile.lineId.startsWith(`${priceFrom}.`)).map((profile) => [profile.code, profile]))
    for (const profile of catalog.profiles) {
      if (!profile.lineId.startsWith(`${brandId}.`) || Object.values(profile.priceByColor).some((price) => price > 0)) continue
      const sister = prices.get(profile.code)
      if (!sister || sister.name !== profile.name || !Object.values(sister.priceByColor).some((price) => price > 0)) continue
      profile.priceByColor = { ...sister.priceByColor }
      ;(profile as ProfileWithProvenance).provenance = { precio: { origin: 'lista_taller', status: 'corregido', note: `Precio de ${sister.id}: mismo código y nombre.` } }
      report.applied.push(`${brandId}|${profile.code} (precio)`)
    }
  }

  const brandFields = (line: Line) => evidence.brands?.[line.brandId]
  for (const line of catalog.lines) {
    const brand = brandFields(line)
    if (brand) mergeLine(line, { fields: brand.fields, notes: brand.notes }, catalog.profiles, evidence.sources, report)
    const own = evidence.lines?.[line.id]
    if (own) {
      mergeLine(line, own, catalog.profiles, evidence.sources, report)
      report.applied.push(line.id)
    }
  }

  for (const variant of evidence.variants ?? []) {
    const parent = catalog.lines.find((line) => line.id === variant.parent)
    if (!parent) {
      report.skipped.push(`${variant.id}: no existe la línea madre ${variant.parent}.`)
      continue
    }
    if (catalog.lines.some((line) => line.id === variant.id)) continue
    const clone = structuredClone(parent) as LineWithProvenance
    clone.id = variant.id
    clone.name = variant.name
    clone.typologyIds = [...variant.typologyIds]
    delete clone.sashInProfileId
    delete clone.sashInPauta
    catalog.lines.splice(catalog.lines.indexOf(parent) + 1, 0, clone)
    mergeLine(clone, variant, catalog.profiles, evidence.sources, report)
    report.applied.push(variant.id)
  }
  return report
}
