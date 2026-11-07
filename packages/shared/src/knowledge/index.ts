/**
 * Base de conocimiento del asistente: manual de DEKOPEN + oficio del PVC.
 *
 * - `knowledgeCapabilityMap()`: mapa compacto de capacidades para el prompt de sistema (inglés).
 * - `knowledgeTopic(id, locale)`: título y resumen visibles en el idioma pedido + cuerpo para el
 *   modelo (inglés; el modelo responde en el idioma de la persona).
 * - `searchKnowledge(text)`: búsqueda local sin IA (tolerante a tildes, mayúsculas y la «ı» turca).
 *
 * Lo usan la herramienta `help(topic)` del servidor, el intérprete local («ayuda con plantillas»)
 * y la web. Sin cifras de negocio: los precios los calcula siempre el motor.
 */
import { TYPOLOGIES, type TypologyGroup } from '@dekopen/engine'
import { DEFAULT_LOCALE, type Locale } from '../i18n/locales'
import de from './i18n/de'
import en from './i18n/en'
import es from './i18n/es'
import fr from './i18n/fr'
import it from './i18n/it'
import pt from './i18n/pt'
import tr from './i18n/tr'
import { CATALOG_PRESET_IDS, QUOTE_PRESET_IDS } from '../templates/preset-ids'
import { KNOWLEDGE_MANUAL } from './manual'
import { KNOWLEDGE_TOPIC_IDS, isKnowledgeTopicId, type KnowledgeTopicId } from './topics'
import type { KnowledgeCopy } from './types'

export { KNOWLEDGE_TOPIC_IDS, isKnowledgeTopicId, type KnowledgeTopicId } from './topics'
export type { KnowledgeCopy } from './types'
export { KNOWLEDGE_MANUAL, type KnowledgeEntry } from './manual'

/** Cambia cuando cambia el contenido (para cachés del prompt y pruebas). */
export const KNOWLEDGE_VERSION = '7.0.0'

export const KNOWLEDGE_COPY: Record<Locale, KnowledgeCopy> = { es, en, pt, fr, de, it, tr }

export interface KnowledgeTopic {
  id: KnowledgeTopicId
  /** Visible, en el idioma pedido. */
  title: string
  summary: string
  /** Para el modelo (inglés). */
  body: string
}

const GROUP_LABEL: Record<TypologyGroup, string> = {
  window: 'Windows',
  door: 'Doors',
  sliding: 'Sliding and special sliding systems',
  folding: 'Folding and pivot',
  shape: 'Shapes',
}

/** Lista de ids de tipología por grupo, derivada del motor (nunca desactualizada). */
function typologyAppendix(): string {
  const groups = new Map<TypologyGroup, string[]>()
  for (const t of TYPOLOGIES) {
    const list = groups.get(t.group) ?? []
    list.push(`${t.id} (${t.defaultSize.width}×${t.defaultSize.height})`)
    groups.set(t.group, list)
  }
  return [...groups.entries()].map(([group, ids]) => `${GROUP_LABEL[group] ?? group}: ${ids.join(', ')}.`).join('\n')
}

export function knowledgeTopic(id: KnowledgeTopicId, locale: Locale = DEFAULT_LOCALE): KnowledgeTopic {
  const copy = (KNOWLEDGE_COPY[locale] ?? KNOWLEDGE_COPY[DEFAULT_LOCALE])[id]
  const base = KNOWLEDGE_MANUAL[id].body
  const body = id === 'typologies' ? `${base}\nTypology ids with default size in mm:\n${typologyAppendix()}` : base
  return { id, title: copy.title, summary: copy.summary, body }
}

/** Plegado para buscar: minúsculas sin tildes; la «ı»/«İ» turcas cuentan como i. */
export function foldKnowledgeText(text: string): string {
  return text
    .replace(/[ıİ]/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

let searchIndex: { id: KnowledgeTopicId; keywords: string[]; titles: string; body: string }[] | null = null

function index() {
  if (!searchIndex) {
    searchIndex = KNOWLEDGE_TOPIC_IDS.map((id) => ({
      id,
      keywords: KNOWLEDGE_MANUAL[id].keywords.map(foldKnowledgeText),
      titles: foldKnowledgeText(Object.values(KNOWLEDGE_COPY).map((c) => `${c[id].title} ${c[id].summary}`).join(' ')),
      body: foldKnowledgeText(KNOWLEDGE_MANUAL[id].body),
    }))
  }
  return searchIndex
}

/**
 * Temas más relevantes para un texto en cualquiera de los 7 idiomas (palabras clave > títulos >
 * cuerpo). Determinista, sin IA. Devuelve [] si nada calza.
 */
export function searchKnowledge(text: string, limit = 3): KnowledgeTopicId[] {
  const words = foldKnowledgeText(text)
    .split(/[^a-z0-9+]+/)
    .filter((w) => w.length >= 3)
  if (!words.length) return []
  const scored = index()
    .map((entry) => {
      let score = 0
      for (const w of words) {
        if (entry.keywords.some((k) => k === w || k.startsWith(w) || (w.length >= 5 && w.startsWith(k)))) score += 5
        else if (entry.keywords.some((k) => k.includes(' ') && k.split(' ').includes(w))) score += 3
        if (entry.titles.includes(w)) score += 2
        if (entry.body.includes(w)) score += 1
      }
      return { id: entry.id, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || KNOWLEDGE_TOPIC_IDS.indexOf(a.id) - KNOWLEDGE_TOPIC_IDS.indexOf(b.id))
  return scored.slice(0, Math.max(1, limit)).map((s) => s.id)
}

/** Tema para `help(topic?, query?)`: el pedido, el mejor para la consulta o la guía de inicio. */
export function resolveKnowledgeTopic(input: { topic?: unknown; query?: string }): KnowledgeTopicId {
  if (isKnowledgeTopicId(input.topic)) return input.topic
  if (input.query) return searchKnowledge(input.query, 1)[0] ?? 'getting_started'
  return 'getting_started'
}

/**
 * Mapa compacto de lo que hay en la app y lo que el asistente puede hacer, para el prompt de
 * sistema (≈ 350 tokens). Los detalles se piden con `help(topic)`.
 */
export function knowledgeCapabilityMap(): string {
  return [
    'DEKOPEN app map (details on demand with the help tool):',
    '- Quotes: list, read, create, edit header (title, client, discount, profit of that quote alone as margin or markup, notes, validity, document language, template), duplicate, trash/restore, status, deliver as PDF (default) or web link by email/WhatsApp.',
    '- Windows in a quote: add/update/duplicate/remove, every typology (windows, doors, sliding, lift-slide HST, tilt-slide PSK, parallel, folding, pivot, shapes), windows joined as one unit (coupled, corner, bay, bow), openings per pane (hinge side seen from inside), accessories (roller shutter, insect screen, sill, threshold), bicolour, glass, bulk changes with all=true, engine price breakdown, price of a hypothetical window without saving.',
    '- Clients: list, search, read with quotes, create, update, trash and restore.',
    '- Catalogue: lines, colours/foils, glass, own purchase prices (sensitive), textures and own colours.',
    `- Documents: ${QUOTE_PRESET_IDS.length} quote + ${CATALOG_PRESET_IDS.length} catalogue presets, own templates (create from preset, edit with DocOps, AI design), per-quote document edits, default templates. The total appears once, in the closing: never on the cover, header, index or intro. Conditions, warranty, payment and acceptance go after it by default.`,
    '- Settings: company data (name, tax id, address, phone, email, website, brand colour), defaults (line, colour, glass), document texts, languages, tax label; pricing (margin, labour, install, waste, rounding, tax %, currency) is sensitive.',
    '- Inside a window: every pane with its size and opening (inspect_window), and pane sizes without changing the outer size (set_pane_sizes).',
    '- Cuts: the cut list of any quote or work order, whole or by part, on screen or as PDF; it needs no work order. Cut settings of a line (update_line_cuts), brands on or off, purchase discounts, trim and saw width (configure_brand).',
    '- Workshop: work orders (read, status, notes, due date; creating one starts production); moving windows between stations cut, weld, assembly, hardware, glazing, qc, ready and installed, in bulk or across every order (move_windows_to_station); every workshop PDF (export_work_order_doc).',
    '- Money on a quote: extras that are not windows (set_quote_extras), deposits received (get_quote_payments, record_quote_payment), manual price, line discount, optional and alternative lines (update_window_line), window order (reorder_windows), sent versions (get_quote_versions).',
    '- Trash: quotes, clients, templates, own colours and textures can be archived and restored.',
    '- Activity: what happened and what is pending (get_activity, resolve_activity).',
    '- Stats: sales, pipeline, conversion, top typologies, quotes created, average ticket.',
    '- Memory that grows on its own, search in earlier conversations, undo of your last change, help topics, follow-up reminders, and screen actions (navigate, open document/template editor, select/highlight, language, theme, zoom, downloads).',
    `Help topics: ${KNOWLEDGE_TOPIC_IDS.join(', ')}.`,
    'Not available to the assistant: the DEKOPEN subscription and plan, bank accounts and payment keys, team members and roles, passwords, sessions.',
  ].join('\n')
}
