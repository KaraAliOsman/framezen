/**
 * Entorno de una consulta: idioma de la interfaz, traductor de los mensajes del intérprete,
 * glosario, índices de entidades (memoizados por versión de datos) y contexto de la pantalla.
 * Ayudas de formato que usan todas las gramáticas.
 */
import type { GlossaryApi } from '../i18n/glossary'
import { formatMm, formatMoney, formatPct, formatSize } from '../i18n/format'
import { LOCALE_META, intlTag, type Locale } from '../i18n/locales'
import type { MessageParams, Translator } from '../i18n/translator'
import type { EntityEntry, EntityIndex, EntityType } from './entities'
import type es from './messages/es'
import { nameKey } from './text'
import type { NluContext, NluSlot, NluSlotKind, NluSuggestion, NluSuggestionKind } from './types'

export type NluMessages = typeof es

/** Índice de entidades + nombres exactos por tipo (para «"María Soto"» entre comillas). */
export interface EntityBundle {
  index: EntityIndex
  byName: Record<EntityType, Map<string, number[]>>
}

export interface GEnv {
  /** Idioma de la interfaz: todo lo que se muestra sale en este idioma. */
  locale: Locale
  /** Idioma en que escribe la persona (detectado o el de la interfaz): frases propuestas para insertar. */
  inputLocale: Locale
  t: Translator<NluMessages>
  glossary: GlossaryApi
  bundle: EntityBundle
  ctx: NluContext
  currency: string
  timeZone: string
  now: Date
  /** Texto original completo. */
  text: string
  /** La cláusula es una pregunta «¿cómo…?»: se reconoce el comando para explicarlo, sin ejecutarlo. */
  howTo?: boolean
}

export function buildByName(index: EntityIndex): Record<EntityType, Map<string, number[]>> {
  const out = {} as Record<EntityType, Map<string, number[]>>
  for (const type of Object.keys(index.lists) as EntityType[]) {
    const map = new Map<string, number[]>()
    index.lists[type].forEach((entry, idx) => {
      const key = nameKey(entry.name)
      if (!key) return
      const arr = map.get(key)
      if (arr) arr.push(idx)
      else map.set(key, [idx])
    })
    out[type] = map
  }
  return out
}

/** Entradas cuyo nombre es exactamente `name` (sin tildes ni mayúsculas). */
export function entriesNamed(g: GEnv, type: EntityType, name: string): EntityEntry[] {
  const idx = g.bundle.byName[type].get(nameKey(name))
  return idx ? idx.map((i) => g.bundle.index.lists[type][i]) : []
}

/** Primera letra en minúscula para intercalar un nombre del glosario («Corredera 2 hojas» → «corredera 2 hojas»). En alemán los sustantivos van con mayúscula. */
export function inline(name: string, locale: Locale): string {
  if (locale === 'de' || name.length < 2) return name
  const second = name[1]
  if (second !== second.toLocaleLowerCase(intlTag(locale))) return name // siglas: «PSK», «DVH»
  return name[0].toLocaleLowerCase(intlTag(locale)) + name.slice(1)
}

export function capitalize(text: string, locale: Locale): string {
  return text ? text[0].toLocaleUpperCase(intlTag(locale)) + text.slice(1) : text
}

export const fmt = {
  size: (g: GEnv, w: number, h: number) => formatSize(w, h, { locale: g.locale }),
  mm: (g: GEnv, mm: number) => formatMm(mm, { locale: g.locale, unit: true }),
  pct: (g: GEnv, value: number) => formatPct(value, { locale: g.locale, maxDecimals: 2 }),
  money: (g: GEnv, amount: number) => formatMoney(amount, { currency: g.currency, locale: g.locale }),
}

const displayNames = new Map<Locale, Intl.DisplayNames | null>()

/** Nombre de un idioma en el idioma de la interfaz («inglés», «English», «Englisch»). */
export function languageName(locale: Locale, target: Locale): string {
  let dn = displayNames.get(locale)
  if (dn === undefined) {
    try {
      dn = new Intl.DisplayNames([intlTag(locale)], { type: 'language' })
    } catch {
      dn = null
    }
    displayNames.set(locale, dn)
  }
  const name = dn?.of(target)
  return name ? inline(name, locale) : LOCALE_META[target].label
}

const monthNames = new Map<Locale, Intl.DateTimeFormat>()

export function monthName(locale: Locale, month: number): string {
  let f = monthNames.get(locale)
  if (!f) {
    f = new Intl.DateTimeFormat(intlTag(locale), { month: 'long', timeZone: 'UTC' })
    monthNames.set(locale, f)
  }
  return f.format(new Date(Date.UTC(2000, month - 1, 15)))
}

/** Slot faltante con su etiqueta y pregunta localizadas. */
export function slot(g: GEnv, kind: NluSlotKind, prompt?: string, choices?: NluSuggestion[]): NluSlot {
  const out: NluSlot = { kind, label: g.t(`slot.${kind}`), prompt: prompt ?? g.t(`prompt.${kind}`) }
  if (choices?.length) out.choices = choices
  return out
}

/** Opción que se agrega al final del texto (para completar un slot faltante). */
export function appendChoice(g: GEnv, kind: NluSuggestionKind, label: string, insert: string, options: { id?: string; detail?: string; score?: number } = {}): NluSuggestion {
  const end = g.text.length
  const needsSpace = end > 0 && !/\s$/.test(g.text)
  const out: NluSuggestion = { kind, label, insertText: insert ? (needsSpace ? ' ' : '') + insert : '', replace: [end, end], key: `${kind}:${options.id ?? insert}`, score: options.score ?? 1 }
  if (options.id) out.id = options.id
  if (options.detail) out.detail = options.detail
  return out
}

export function tr(g: GEnv, key: string, params?: MessageParams): string {
  return (g.t as unknown as (k: string, p?: MessageParams) => string)(key, params)
}
