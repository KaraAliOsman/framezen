/**
 * Idioma de los documentos (PDF, vista previa, portal): diccionario propio en 7 idiomas + glosario de
 * dominio de `@dekopen/shared` + formateador del idioma con la moneda de la empresa. Puro y síncrono
 * (sirve igual en el servidor y en el navegador).
 *
 * Reglas: los nombres de catálogo (líneas, colores, vidrios, herrajes, clientes) nunca se traducen;
 * los ids del motor (tipologías, aperturas, accesorios) se nombran con el glosario.
 */
import type { DesignNode, LeafNode, Opening, WindowDesign, WindowExtras } from '@dekopen/engine'
import { assemblyUnits } from '@dekopen/engine'
import {
  DEFAULT_LOCALE,
  createFormatter,
  createTranslator,
  defineDictionary,
  formatList,
  glossaryTerm,
  intlTag,
  isLocale,
  openingName,
  typologyName,
  type Formatter,
  type Locale,
  type MessageKey,
  type MessageParams,
  type Translator,
} from '@dekopen/shared'
import es from './es'
import en from './en'
import pt from './pt'
import fr from './fr'
import de from './de'
import it from './it'
import tr from './tr'

export type DocMessages = typeof es
export type DocMessageKey = MessageKey<DocMessages>

/** Diccionario completo de los documentos (7 idiomas en memoria: el PDF se arma sin esperas). */
export const documentMessages = defineDictionary<DocMessages>({ es, en, pt, fr, de, it, tr })

export type DocTranslator = Translator<DocMessages>

/** Idioma de documento válido (cualquier otra cosa → español). */
export function docLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE
}

/** Etiqueta BCP 47 del idioma para `<html lang>` (`es-CL`, `en-US`, `pt-BR`…). */
export function docLang(locale: Locale): string {
  return intlTag(locale)
}

export interface DocLocaleOptions {
  /** Moneda ISO 4217 de la empresa (CLP por defecto). */
  currency?: string
  /** Nombre del impuesto («IVA», «VAT», «MwSt.»). Por defecto el del glosario en el idioma. */
  taxLabel?: string
}

/** Todo lo que un documento necesita para hablar un idioma. */
export interface DocLocaleKit {
  locale: Locale
  lang: string
  t: DocTranslator
  fmt: Formatter
  /** Nombre del impuesto para rótulos («IVA 19 %»). */
  taxLabel: string
  /** Término del glosario (`business.vat`, `accessory.sill`…). */
  term: (key: Parameters<typeof glossaryTerm>[0], params?: MessageParams) => string
}

const kits = new Map<string, DocLocaleKit>()

/**
 * Kit del idioma (memorizado por idioma + moneda + impuesto). Las fechas de documento ya son días de
 * Chile (`yyyy-mm-dd`): se formatean en UTC para no correr el día por la zona horaria.
 */
export function docLocaleKit(localeInput: unknown, options: DocLocaleOptions = {}): DocLocaleKit {
  const locale = docLocale(localeInput)
  const currency = (options.currency || 'CLP').toUpperCase()
  const customTax = typeof options.taxLabel === 'string' ? options.taxLabel.trim().slice(0, 24) : ''
  const key = `${locale}|${currency}|${customTax}`
  const cached = kits.get(key)
  if (cached) return cached
  const term = (k: Parameters<typeof glossaryTerm>[0], params?: MessageParams) => glossaryTerm(k, locale, params)
  const kit: DocLocaleKit = {
    locale,
    lang: docLang(locale),
    t: createTranslator(documentMessages, locale),
    fmt: createFormatter(locale, { currency, timeZone: 'UTC' }),
    taxLabel: customTax || glossaryTerm('business.vat', locale),
    term,
  }
  kits.set(key, kit)
  return kit
}

// ── Textos por defecto ──────────────────────────────────────────────────────

export const DOC_DEFAULT_TEXT_FIELDS = ['intro', 'conditions', 'paymentTerms', 'warranty', 'leadTimeText'] as const
export type DocDefaultTextField = (typeof DOC_DEFAULT_TEXT_FIELDS)[number]

const squash = (text: string) => text.replace(/\s+/g, ' ').trim()

/**
 * El taller escribe sus textos en su idioma. Pero si un texto es exactamente el que sembró DEKOPEN en
 * español (nunca lo editaron), en un documento en otro idioma se usa su traducción: el cliente no recibe
 * condiciones en un idioma que no pidió. Cualquier texto propio se respeta tal cual.
 */
export function localizedDefaultText(field: DocDefaultTextField, value: string | undefined, locale: Locale): string | undefined {
  if (value === undefined || locale === 'es') return value
  if (squash(value) !== squash(es.defaults[field])) return value
  return createTranslator(documentMessages, locale)(`defaults.${field}`)
}

export const DOC_SUGGESTED_FIELDS = ['paymentTerms', 'warranty', 'leadTimeText', 'conditions', 'includes', 'excludes'] as const
export type DocSuggestedField = (typeof DOC_SUGGESTED_FIELDS)[number]

/** Ayuda para redactar, solo si el taller la pide: los compromisos vienen en blanco para completarlos. */
export function suggestedDocText(field: DocSuggestedField, locale: Locale): string {
  return createTranslator(documentMessages, locale)(`suggested.${field}`)
}

// ── Descripción de la apertura ──────────────────────────────────────────────

function leaves(node: DesignNode | null | undefined, out: LeafNode[] = [], depth = 0): LeafNode[] {
  if (!node || typeof node !== 'object' || depth > 64) return out
  if (node.type === 'leaf') out.push(node)
  else if (node.type === 'split' && Array.isArray(node.children)) node.children.forEach((c) => leaves(c, out, depth + 1))
  return out
}

function leafPhrase(leaf: LeafNode, t: DocTranslator): string {
  const o: Partial<Opening> = leaf.opening ?? { kind: 'fixed' }
  const side = t(o.hinge === 'right' ? 'opening.right' : 'opening.left')
  const out = o.direction === 'out'
  switch (o.kind) {
    case 'casement':
      return t(out ? 'opening.casementOut' : 'opening.casementIn', { side })
    case 'tilt_turn':
      return t(o.sequence === 'tilt_first' ? 'opening.tiltTurnTiltFirst' : 'opening.tiltTurn', { side })
    case 'tilt':
      return t('opening.tilt')
    case 'awning':
      return t('opening.awning')
    case 'door':
      return t(out ? 'opening.doorOut' : 'opening.doorIn', { side })
    case 'pivot_v':
      return t('opening.pivotV')
    case 'pivot_h':
      return t('opening.pivotH')
    case 'tilt_slide':
      return t('opening.tiltSlide')
    case 'parallel_slide':
      return t('opening.parallelSlide')
    case 'folding':
      return t('opening.folding')
    default:
      return leaf.fill === 'panel' ? t('opening.fixedPanel') : t('opening.fixed')
  }
}

function capitalize(text: string, locale: Locale): string {
  return text ? text.charAt(0).toLocaleUpperCase(intlTag(locale)) + text.slice(1) : text
}

/** Cómo abre la ventana, en palabras de cliente y en el idioma del documento (vista interior). */
export function describeOpeningIn(design: WindowDesign | undefined, locale: Locale): string {
  const t = createTranslator(documentMessages, locale)
  const root = design?.root
  if (!root || typeof root !== 'object') return capitalize(t('opening.fixed'), locale)
  if (root.type === 'sliding') {
    const panels = Array.isArray(root.panels) ? root.panels.filter((p) => p && typeof p === 'object') : []
    const moving = panels.filter((p) => p.kind === 'moving').length
    const fixed = panels.length - moving
    const base = fixed > 0 ? t('opening.slidingFixed', { moving, fixed }) : t('opening.sliding', { moving })
    const rails = Number.isFinite(root.rails) ? t('opening.rails', { count: root.rails }) : ''
    const text = root.system === 'lift_slide' ? t('opening.liftSlide', { panels: base }) : base
    return capitalize(rails ? `${text}, ${rails}` : text, locale)
  }
  const list = leaves(root)
  if (list.length === 0) return capitalize(t('opening.fixed'), locale)
  if (list.every((l) => (l.opening?.kind ?? 'fixed') === 'fixed')) return t('opening.fixedAll', { count: list.length })
  if (root.type === 'split' && root.joint === 'fold' && list.every((l) => l.opening?.kind === 'folding')) {
    return capitalize(t('opening.foldingSet', { count: list.length }), locale)
  }
  const phrases = list.map((l) => leafPhrase(l, t))
  const text = phrases.length > 3 ? t('opening.more', { list: phrases.slice(0, 3).join(', '), count: phrases.length - 3 }) : phrases.join(' + ')
  return capitalize(text, locale)
}

/** Nombre comercial de la tipología en el idioma (o el nombre del motor si no está en el glosario). */
export function typologyLabel(typologyId: string | undefined, fallback: string, locale: Locale): string {
  if (!typologyId) return fallback
  return typologyName(typologyId, locale, fallback)
}

/** Apertura principal como sustantivo (`Oscilobatiente`, `Tilt and turn`…). */
export function openingLabel(kind: string, locale: Locale): string {
  return openingName(kind, locale)
}

/** Nombre de un conjunto, el mismo en editor, portal y documento. Fuera de un conjunto, undefined. */
export function assemblyTitleIn(design: WindowDesign | undefined | null, locale: Locale): string | undefined {
  const assembly = design?.assembly
  if (!assembly) return undefined
  const count = assemblyUnits(design).length
  return createTranslator(documentMessages, locale)(`assembly.${assembly.kind}`, { count })
}

/** Accesorios de la ventana en palabras de cliente: «Persiana enrollable: monoblock, motor», «Alféizar». */
export function accessoriesIn(extras: WindowExtras | undefined | null, locale: Locale): string[] {
  if (!extras || typeof extras !== 'object') return []
  const t = createTranslator(documentMessages, locale)
  const g = (key: Parameters<typeof glossaryTerm>[0]) => glossaryTerm(key, locale)
  const out: string[] = []
  const shutter = extras.rollerShutter
  if (shutter && typeof shutter === 'object') {
    const type = shutter.type ? g(`accessory.rollerShutterType.${shutter.type}` as Parameters<typeof glossaryTerm>[0]) : ''
    const operation = shutter.operation ? g(`accessory.rollerShutterOperation.${shutter.operation}` as Parameters<typeof glossaryTerm>[0]) : ''
    out.push(type || operation ? t('accessory.shutter', { name: g('accessory.rollerShutter'), type: lowerFirst(type, locale), operation: lowerFirst(operation, locale) }).replace(/,\s*$/, '') : g('accessory.rollerShutter'))
  }
  const screenType = extras.insectScreen?.type ?? (extras.screen ? 'fixed' : undefined)
  if (screenType) {
    const type = g(`accessory.insectScreenType.${screenType}` as Parameters<typeof glossaryTerm>[0])
    out.push(t('accessory.screen', { name: g('accessory.insectScreen'), type: lowerFirst(type, locale) }))
  }
  if (extras.sill) out.push(g('accessory.sill'))
  if (extras.threshold) out.push(g('accessory.threshold'))
  return out
}

function lowerFirst(text: string, locale: Locale): string {
  // En alemán los sustantivos van con mayúscula: no se toca.
  if (!text || locale === 'de') return text
  return text.charAt(0).toLocaleLowerCase(intlTag(locale)) + text.slice(1)
}

/** Lista legible en el idioma («a, b y c»). */
export function listIn(items: readonly string[], locale: Locale): string {
  return items.length ? formatList(items, { locale }) : ''
}

export { es as documentMessagesEs }
