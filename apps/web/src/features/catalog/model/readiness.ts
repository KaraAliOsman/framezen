/**
 * Completitud de las líneas en lenguaje humano. La regla vive en @dekopen/catalog
 * (`lineReadiness`, la misma del importador); aquí están los textos (en el idioma de la
 * interfaz, armados desde los datos estructurados, no desde las frases en español del paquete),
 * los tonos y el puente hacia la pestaña Precios («Completar precios» abre justo lo que falta).
 * Se recalcula en vivo con los precios propios del taller: cargar un precio cambia el estado.
 */
import type { Catalog, Id, Line, ProfileRole } from '@dekopen/engine'
import { catalogReadiness, type LineReadiness, type ReadinessState } from '@dekopen/catalog'
import { formatList, type Locale } from '@dekopen/shared'
import { getLocale, translate } from '../../../lib/i18n'
import type { BadgeTone, StatusTone } from '../../../ui'
import es from '../i18n/es'
import { overrideKey, type PriceFocus } from './prices'

export type { LineReadiness, ReadinessState }

const READINESS_TONE: Record<ReadinessState, { tone: BadgeTone; dot: StatusTone }> = {
  ready: { tone: 'ok', dot: 'success' },
  warnings: { tone: 'warn', dot: 'warning' },
  geometry: { tone: 'neutral', dot: 'neutral' },
}

export interface ReadinessCopy {
  label: string
  tone: BadgeTone
  /** Tono del punto de estado (`StatusDot`). */
  dot: StatusTone
  help: string
}

/** Estado de una línea en palabras («Lista para cotizar», «Cotiza con avisos», «Solo medidas»). */
export function readinessCopy(state: ReadinessState, locale?: Locale): ReadinessCopy {
  return {
    label: translate(es, `readiness.${state}.label`, undefined, locale),
    help: translate(es, `readiness.${state}.help`, undefined, locale),
    ...READINESS_TONE[state],
  }
}

/** Completitud de todas las líneas del catálogo (por id). */
export function readinessByLine(catalog: Catalog | undefined): Map<Id, LineReadiness> {
  return catalog ? catalogReadiness(catalog) : new Map()
}

/**
 * Claves de las filas de la pestaña Precios que faltan para que la línea quede lista: cada
 * perfil requerido en los colores que ofrece la línea, los refuerzos y los herrajes de sus reglas.
 */
export function missingPriceKeys(readiness: LineReadiness): string[] {
  const keys = new Set<string>()
  for (const gap of readiness.unpricedRoles) for (const colorId of gap.colorIds) keys.add(overrideKey({ kind: 'profile', id: gap.profileId, colorId }))
  for (const id of readiness.unpricedSteel) keys.add(overrideKey({ kind: 'profile', id }))
  for (const id of readiness.unpricedItems) keys.add(overrideKey({ kind: 'item', id }))
  return [...keys]
}

/** Filtro «Lo que falta en …» para la pestaña Precios; null si no falta ningún precio. */
export function completePricesFocus(line: Pick<Line, 'name'>, readiness: LineReadiness, locale?: Locale): PriceFocus | null {
  const keys = missingPriceKeys(readiness)
  return keys.length ? { label: translate(es, 'readiness.focusLabel', { name: line.name }, locale), keys } : null
}

/** Texto del botón según cuánto falta. */
export function completePricesLabel(readiness: LineReadiness, locale?: Locale): string {
  return translate(es, 'readiness.completeLabel', { count: missingPriceKeys(readiness).length }, locale)
}

// ── Frases del estado ────────────────────────────────────────────────────────

export interface ReadinessText {
  headline: string
  details: string[]
}

/** Lista legible sin repetidos («hoja, riel y herrajes»), en el idioma indicado. */
function joinList(parts: readonly string[], locale: Locale): string {
  return formatList([...new Set(parts)], { locale })
}

/**
 * Titular y detalle de la completitud de una línea en el idioma de la interfaz. Sigue exactamente
 * la misma lógica que `lineReadiness` de @dekopen/catalog (que solo arma frases en español), a
 * partir de sus datos estructurados: en español, el resultado es idéntico al del paquete.
 */
export function readinessText(
  readiness: LineReadiness,
  line: Pick<Line, 'colorIds'>,
  catalog: Pick<Catalog, 'colors' | 'items'>,
  locale: Locale = getLocale(),
): ReadinessText {
  const t = (key: Parameters<typeof translate<typeof es>>[1], params?: Record<string, string | number>) => translate(es, key, params, locale)
  const name = (role: ProfileRole) => t(`readiness.role.${role}`)
  const list = (parts: readonly string[]) => joinList(parts, locale)
  const colorNames = (ids: readonly Id[]) =>
    list(
      ids.map((id) => {
        const label = catalog.colors.find((color) => color.id === id)?.name ?? id
        // En español los colores van en minúscula dentro de la frase («en nogal y negro»); en los
        // demás idiomas el nombre (dato del catálogo, en español) queda tal cual.
        return locale === 'es' ? label.toLocaleLowerCase('es-CL') : label
      }),
    )
  const kindOf = (id: Id) => (catalog.items.find((item) => item.id === id)?.kind === 'hardware' ? t('readiness.kindHardware') : t('readiness.kindAccessory'))

  const { state, missingRoles, unpricedRoles, unpricedSteel, unpricedItems, readyColors, typicalPauta, evidence, sharedProfiles, referenceItems } = readiness
  const colors = line.colorIds ?? []
  const assigned = readiness.requiredRoles.length - missingRoles.length

  const blocking = readyColors.length ? [] : unpricedRoles.filter((gap) => gap.colorIds.length === colors.length || missingRoles.length === 0)
  const unpricedNames = blocking.map((gap) => name(gap.role))
  if (unpricedSteel.length) unpricedNames.push(t('readiness.steel', { count: unpricedSteel.length }))
  unpricedNames.push(...new Set(unpricedItems.map(kindOf)))
  const missingNames = missingRoles.map(name)

  let headline: string
  const details: string[] = []
  if (state === 'geometry') {
    headline = t('readiness.headlineGeometry')
    details.push(assigned > 0 ? t('readiness.geometryPriced') : t('readiness.geometryEmpty'))
    if (missingRoles.length) details.push(t('readiness.missingProfiles', { count: missingRoles.length, list: list(missingNames) }))
  } else if (state === 'warnings') {
    if (unpricedNames.length) headline = t('readiness.headlinePrices', { list: list(unpricedNames) })
    else if (missingRoles.length) {
      headline = t('readiness.headlineProfiles', { count: missingRoles.length, list: list(missingNames) })
      details.push(t('readiness.profilesQuotedWithout', { count: missingRoles.length }))
    } else headline = t('readiness.headlinePauta')
    if (missingRoles.length && unpricedNames.length) details.push(t('readiness.alsoMissingProfiles', { count: missingRoles.length, list: list(missingNames) }))
    if (!readyColors.length && unpricedRoles.length && !blocking.length) details.push(t('readiness.noColorComplete'))
    for (const gap of unpricedRoles.filter((g) => !blocking.includes(g))) {
      details.push(t('readiness.roleNoPrice', { subject: t(`readiness.subject.${gap.role}`), colors: colorNames(gap.colorIds) }))
    }
    if (typicalPauta && (unpricedNames.length || missingRoles.length)) details.push(t('readiness.typicalPauta'))
  } else {
    headline = t('readiness.headlineReady')
    if (readyColors.length < colors.length) {
      const notReady = colors.filter((colorId) => !readyColors.includes(colorId))
      const lacking = unpricedRoles.filter((gap) => gap.colorIds.some((colorId) => notReady.includes(colorId))).map((gap) => name(gap.role))
      details.push(t('readiness.readyPartial', { colors: colorNames(notReady), list: list(lacking) }))
    } else details.push(t('readiness.readyAll'))
  }
  if (evidence && state === 'ready') details.unshift(t('readiness.evidenceReady'))
  else if (evidence) details.push(t('readiness.evidencePartial'))
  if (sharedProfiles.length) details.push(t('readiness.shared', { count: sharedProfiles.length, list: list(sharedProfiles.map((shared) => name(shared.role))) }))
  if (referenceItems.length && state !== 'geometry') details.push(t('readiness.reference', { list: list(referenceItems.map(kindOf)) }))
  return { headline, details }
}
