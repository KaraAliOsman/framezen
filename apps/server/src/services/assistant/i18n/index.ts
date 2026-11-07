/**
 * Textos del agente en el idioma de la persona (UI) + formatos (moneda de la empresa).
 *
 *   const tx = assistantText('de', 'EUR')
 *   tx.t('done.add_window', { ref: 'V3', ... })
 *   tx.fmt.size(1500, 1200)
 */
import {
  createFormatter,
  createTranslator,
  defineDictionary,
  formatDocNumber,
  glossaryTerm,
  LOCALE_META,
  openingName,
  quoteStatusLabel,
  typologyName,
  type Formatter,
  type Locale,
  type Station,
  type Translator,
} from '@dekopen/shared'
import de from './de'
import en from './en'
import es from './es'
import fr from './fr'
import it from './it'
import pt from './pt'
import tr from './tr'

export const ASSISTANT_TEXT = defineDictionary({ es, en, pt, fr, de, it, tr })

export type AssistantMessages = typeof es

export interface AssistantText {
  locale: Locale
  t: Translator<AssistantMessages>
  fmt: Formatter
  /** «N° 412» / «No. 412». */
  quoteNo: (n: number) => string
  typology: (id: string) => string
  opening: (kind: string) => string
  status: (status: string) => string
  /** Nombre de una estación de taller. */
  station: (station: string) => string
  /** Nombre nativo de un idioma («English», «Deutsch»). */
  language: (locale: Locale) => string
  accessory: (key: 'rollerShutter' | 'insectScreen' | 'sill' | 'threshold') => string
  list: (items: readonly string[]) => string
}

const cache = new Map<string, AssistantText>()

export function assistantText(locale: Locale, currency = 'CLP'): AssistantText {
  const key = `${locale}:${currency}`
  let text = cache.get(key)
  if (!text) {
    const fmt = createFormatter(locale, { currency })
    // En alemán los sustantivos van con mayúscula; en turco «I» → «ı» (minúsculas por idioma).
    const lower = (s: string) => (locale === 'de' ? s : s.toLocaleLowerCase(LOCALE_META[locale]?.intl ?? locale))
    text = {
      locale,
      t: createTranslator(ASSISTANT_TEXT, locale),
      fmt,
      quoteNo: (n) => formatDocNumber(n, { locale }),
      typology: (id) => typologyName(id, locale),
      opening: (kind) => openingName(kind, locale),
      status: (status) => lower(quoteStatusLabel(status, locale)),
      station: (station) => lower(glossaryTerm(`station.${station as Station}`, locale)),
      language: (l) => LOCALE_META[l]?.label ?? l,
      accessory: (k) => lower(glossaryTerm(`accessory.${k}`, locale)),
      list: (items) => (items.length ? fmt.list(items) : ''),
    }
    cache.set(key, text)
  }
  return text
}
