/**
 * Intérprete local del panel (cero créditos): entiende comandos y completa lo que escribes.
 *
 * Contrato con el motor de comandos multilingüe (equipo NLU, `@dekopen/shared` › nlu): `parse` →
 * plan + confianza + «Entendí: …» + lo que falta; `complete` → texto fantasma + lista. Este archivo
 * es el único punto de contacto: mientras ese motor no esté, el respaldo usa el intérprete v4
 * (`parseLocalCommand`) y un completado por plantillas traducidas + valores del catálogo.
 */
import { matchTypology } from '@dekopen/engine'
import {
  isUndoCommand,
  parseLocalCommand,
  TYPOLOGY_IDS,
  type AssistantToolCall,
  type Locale,
  type LocalToolCall,
  type MessageKey,
  type MessageParams,
  type NluStatus,
  type ToolRisk,
} from '@dekopen/shared'
import { getGlossary, translate } from '../../../lib/i18n'
import type { QuoteEditorBridge } from '../bridge'
import es from '../i18n/es'
import { describePlan } from './describe'
import { frecencyBoost, topUsed } from './frecency'
import { commonPrefix, fold } from './text'

export type SuggestionKind =
  | 'command'
  | 'typology'
  | 'color'
  | 'glass'
  | 'line'
  | 'client'
  | 'quote'
  | 'navigation'
  | 'recent'
  | 'ref'
  | 'template'
  | 'assistant'
  | 'locale'
  | 'theme'
  | 'mode'
  | 'accessory'
  | 'period'
  | 'value'

export interface Suggestion {
  /** Identidad estable (para frecuencia y para no reordenar bajo el cursor). */
  id: string
  kind: SuggestionKind
  label: string
  /** Pista secundaria («[ancho × alto]», N°, ciudad…). */
  detail?: string
  /** Texto completo que queda en el compositor al elegirla. */
  insert: string
}

export interface Completion {
  /** Continuación literal tras el cursor (solo si es clara). */
  ghost?: string
  items: Suggestion[]
}

export interface LocalParse {
  /** Plan ejecutable en el navegador (o en el servidor, sin IA); null = no es un comando local. */
  plan: LocalToolCall[] | null
  /** 0..1 */
  confidence: number
  /** «Entendí: …» sin el prefijo, ya localizado. */
  interpretation: string
  /** Datos que faltan (localizados) para que el plan quede listo. */
  missing: string[]
  /** Respuesta determinista sin herramientas (ayuda, saludo). */
  reply?: string
  /** Supuestos («Tomé 60 × 120 como centímetros»). */
  notes?: string[]
  /** Estado del motor de comandos (sin motor: undefined). */
  status?: NluStatus
  /** Comando principal reconocido («item.add»). */
  command?: string
  /** Lecturas alternativas completas cuando hay duda o falta algo. */
  repairs?: { label: string; text: string }[]
  /** Riesgo del plan (el mayor de sus llamadas). */
  risk?: ToolRisk
  /** Opciones para el dato que falta o la duda (cada una, un comando completo). */
  choices?: { label: string; detail?: string; text: string }[]
}

export interface InterpreterEntities {
  clients: { id: string; name: string; detail?: string }[]
  quotes: { id: string; number: number; title?: string; clientName?: string }[]
  colors: string[]
  lines: string[]
  glass: string[]
}

export interface InterpreterContext {
  locale: Locale
  route: string
  bridge: QuoteEditorBridge | null
  entities: InterpreterEntities
  /** Ideas de la pantalla (frases completas) para la lista con la entrada vacía. */
  ideas: string[]
}

export interface LocalInterpreter {
  parse(text: string): LocalParse
  complete(text: string, cursor: number): Completion
}

/** Umbral para ejecutar con Enter sin pasar por la IA. */
export const LOCAL_CONFIDENCE = 0.7
const MAX_ITEMS = 7

const EMPTY_PARSE: LocalParse = { plan: null, confidence: 0, interpretation: '', missing: [] }

/** «recuerda que …» en los 7 idiomas (respaldo; el motor NLU tiene su propia gramática). */
const REMEMBER = /^\s*(?:recuerda(?:te)?\s+que|anota\s+que|remember\s+(?:that\s+)?|note\s+that|lembre(?:-se)?\s+(?:de\s+)?que|souviens-toi\s+que|rappelle-toi\s+que|merk(?:e)?\s+dir(?:,)?\s*(?:dass)?|ricorda\s+che|unutma(?:,)?|hatırla(?:,)?)\s*(.+)$/i
const HELP = /^\s*(ayuda|help|ajuda|aide|hilfe|aiuto|yardım|\?|que puedes hacer|qué puedes hacer|what can you do)\s*[?!.]*\s*$/i
const GREETING = /^\s*(hola|buenas|hello|hi|hey|olá|oi|bonjour|salut|hallo|ciao|merhaba)\b[\s,.!¡]*$/i

function toLocal(call: AssistantToolCall): LocalToolCall {
  let args: Record<string, unknown> = {}
  try {
    args = typeof call.arguments === 'string' ? (JSON.parse(call.arguments) as Record<string, unknown>) : ((call.arguments as Record<string, unknown>) ?? {})
  } catch {
    args = {}
  }
  return { id: call.id, tool: call.name, args }
}

let callCounter = 0
const callId = () => `l${Date.now().toString(36)}${(++callCounter).toString(36)}`

interface Template {
  key: keyof typeof es.commands
  slot?: SuggestionKind
}

const TEMPLATES: Template[] = [
  { key: 'addWindow', slot: 'typology' },
  { key: 'addSliding' },
  { key: 'addTiltTurn' },
  { key: 'addDoor' },
  { key: 'newQuote', slot: 'client' },
  { key: 'openQuote', slot: 'quote' },
  { key: 'search', slot: 'client' },
  { key: 'goTo', slot: 'navigation' },
  { key: 'discount' },
  { key: 'colorAll', slot: 'color' },
  { key: 'duplicate', slot: 'ref' },
  { key: 'remove', slot: 'ref' },
  { key: 'explain', slot: 'ref' },
  { key: 'document' },
  { key: 'client', slot: 'client' },
  { key: 'title' },
  { key: 'remember' },
  { key: 'undo' },
  { key: 'help' },
]

const NAV_KEYS = ['home', 'quotes', 'clients', 'workshop', 'catalog', 'documents', 'settings', 'pricing', 'plan', 'team'] as const

interface SlotValue {
  id: string
  label: string
  detail?: string
}

/** Valor con sus formas plegadas precalculadas (el completado corre en cada tecla). */
interface IndexedValue extends SlotValue {
  folded: string
  words: string[]
  foldedDetail: string
  order: number
}

function indexValues(values: SlotValue[]): IndexedValue[] {
  return values
    .map((v) => ({ ...v, folded: fold(v.label), words: fold(v.label).split(/\s+/), foldedDetail: fold(v.detail ?? '') }))
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((v, order) => ({ ...v, order }))
}

/** Intérprete de respaldo (sin el motor NLU). */
export function createFallbackInterpreter(ctx: InterpreterContext): LocalInterpreter {
  const t = (key: MessageKey<typeof es>, params?: MessageParams) => translate(es, key, params, ctx.locale)
  const templates = TEMPLATES.map((tpl) => {
    const text = t(`commands.${tpl.key}.text`)
    const hint = t(`commands.${tpl.key}.hint`)
    return { ...tpl, text, hint, folded: fold(text), foldedAll: fold(`${text} ${hint}`) }
  })
  const glossary = getGlossary(ctx.locale)
  let typologies: SlotValue[] | null = null

  const localContext = () => {
    const bridge = ctx.bridge
    const quote = bridge?.getQuote()
    const selected = bridge?.selectedItemId()
    return {
      route: ctx.route,
      quoteOpen: Boolean(bridge),
      selectedRef: quote?.items.find((i) => i.id === selected)?.ref,
      refs: quote?.items.map((i) => i.ref) ?? [],
      colors: ctx.entities.colors,
      lines: ctx.entities.lines,
      glasses: ctx.entities.glass,
    }
  }

  function slotValues(kind: SuggestionKind): SlotValue[] {
    switch (kind) {
      case 'typology':
        typologies ??= TYPOLOGY_IDS.map((id) => ({ id: `typology:${id}`, label: glossary.typology(id).toLocaleLowerCase(ctx.locale) }))
        return typologies
      case 'client':
        return ctx.entities.clients.map((c) => ({ id: `client:${c.id}`, label: c.name, detail: c.detail }))
      case 'quote':
        return ctx.entities.quotes.map((q) => ({ id: `quote:${q.id}`, label: String(q.number), detail: [q.title, q.clientName].filter(Boolean).join(' · ') }))
      case 'color':
        return ctx.entities.colors.map((name) => ({ id: `color:${name}`, label: name.toLocaleLowerCase(ctx.locale) }))
      case 'line':
        return ctx.entities.lines.map((name) => ({ id: `line:${name}`, label: name }))
      case 'glass':
        return ctx.entities.glass.map((name) => ({ id: `glass:${name}`, label: name }))
      case 'navigation':
        return NAV_KEYS.map((key) => ({ id: `nav:${key}`, label: t(`nav.${key}`) }))
      case 'ref':
        return (ctx.bridge?.getQuote().items ?? []).map((i) => {
          let detail: string | undefined
          try {
            const id = matchTypology(i.design)
            detail = id ? glossary.typology(id) : undefined
          } catch {
            detail = undefined
          }
          return { id: `ref:${i.ref}`, label: i.ref, detail }
        })
      default:
        return []
    }
  }

  const indexed = new Map<SuggestionKind, IndexedValue[]>()
  const indexedValues = (kind: SuggestionKind): IndexedValue[] => {
    // Los ítems de la cotización abierta cambian sin rehacer el intérprete: esos no se guardan.
    if (kind === 'ref') return indexValues(slotValues(kind))
    let list = indexed.get(kind)
    if (!list) {
      list = indexValues(slotValues(kind))
      indexed.set(kind, list)
    }
    return list
  }

  function rank(values: IndexedValue[], partial: string): IndexedValue[] {
    const q = fold(partial.trim())
    const scored: { v: IndexedValue; band: number; boost: number }[] = []
    for (const v of values) {
      const band = !q ? 1 : v.folded === q ? 4 : v.folded.startsWith(q) ? 3 : v.words.some((w) => w.startsWith(q)) ? 2 : v.folded.includes(q) || v.foldedDetail.includes(q) ? 1 : 0
      if (band > 0) scored.push({ v, band, boost: 0 })
    }
    // Frecuencia solo para lo que calzó, y nunca por encima de una banda mejor.
    for (const s of scored) s.boost = frecencyBoost(s.v.id)
    return scored.sort((a, b) => b.band - a.band || b.boost - a.boost || a.v.order - b.v.order).map((s) => s.v)
  }

  return {
    parse(raw: string): LocalParse {
      const text = raw.trim()
      if (!text) return EMPTY_PARSE
      if (isUndoCommand(text) || fold(text) === fold(t('commands.undo.text'))) {
        const plan = [{ id: callId(), tool: 'undo', args: {} }]
        return { plan, confidence: 1, interpretation: describePlan(plan), missing: [] }
      }
      const remember = REMEMBER.exec(text)
      if (remember?.[1]?.trim()) {
        const plan = [{ id: callId(), tool: 'remember', args: { content: remember[1].trim() } }]
        return { plan, confidence: 0.95, interpretation: describePlan(plan), missing: [] }
      }
      if (HELP.test(text) || fold(text) === fold(t('commands.help.text'))) return { ...EMPTY_PARSE, confidence: 1, interpretation: t('plan.help'), reply: t('local.help') }
      if (GREETING.test(text)) return { ...EMPTY_PARSE, confidence: 1, interpretation: t('plan.help'), reply: t('local.help') }
      const result = parseLocalCommand(text, localContext())
      if ('toolCalls' in result && result.toolCalls.length) {
        const plan = result.toolCalls.map(toLocal)
        return { plan, confidence: result.notes?.length ? 0.75 : 0.9, interpretation: describePlan(plan), missing: [], ...(result.notes ? { notes: result.notes } : {}) }
      }
      return EMPTY_PARSE
    },

    complete(text: string, cursor: number): Completion {
      if (cursor !== text.length) return { items: [] }
      const q = fold(text)
      if (!q.trim()) {
        const recent = topUsed('cmd:', 3)
          .map((id) => templates.find((tpl) => `cmd:${tpl.key}` === id))
          .filter((tpl): tpl is (typeof templates)[number] => Boolean(tpl))
          .map((tpl) => ({ id: `cmd:${tpl.key}`, kind: 'recent' as const, label: tpl.text.trim(), detail: tpl.hint || undefined, insert: tpl.text }))
        const ideas = ctx.ideas.map((idea, i) => ({ id: `idea:${i}`, kind: 'command' as const, label: idea, insert: idea }))
        return { items: [...recent, ...ideas].slice(0, MAX_ITEMS) }
      }

      // 1. ¿Estamos dentro del espacio de un comando conocido? (después de «Cambia todo a », etc.)
      for (const tpl of templates) {
        if (!tpl.slot) continue
        const prefix = tpl.folded
        if (!prefix.trim() || !q.startsWith(prefix) || q.length < prefix.length) continue
        const start = tpl.text.length
        const partial = text.slice(start)
        const values = rank(indexedValues(tpl.slot), partial)
        if (!values.length) continue
        const items = values.slice(0, MAX_ITEMS).map((v) => ({ id: v.id, kind: tpl.slot!, label: v.label, detail: v.detail, insert: text.slice(0, start) + v.label }))
        const foldedPartial = fold(partial)
        const literal = partial ? values.filter((v) => v.folded.startsWith(foldedPartial)) : []
        const continuation = commonPrefix(literal.map((v) => v.label.slice(partial.length)))
        return { ...(partial && continuation ? { ghost: continuation } : {}), items }
      }

      // 2. Comandos cuyo texto empieza como lo escrito (fantasma = prefijo común de sus continuaciones).
      const prefixed = templates.filter((tpl) => q.length >= 2 && tpl.folded.startsWith(q) && tpl.folded !== q)
      const continuation = commonPrefix(prefixed.map((tpl) => tpl.text.slice(text.length)))
      const words = q.split(/\s+/).filter(Boolean)
      const contains = templates.filter((tpl) => !prefixed.includes(tpl) && words.length > 0 && words.every((w) => tpl.foldedAll.includes(w)))
      const items = [...prefixed, ...contains]
        .map((tpl) => ({ tpl, boost: frecencyBoost(`cmd:${tpl.key}`) }))
        .sort((a, b) => (prefixed.includes(a.tpl) === prefixed.includes(b.tpl) ? b.boost - a.boost : prefixed.includes(a.tpl) ? -1 : 1))
        .slice(0, MAX_ITEMS)
        .map(({ tpl }) => ({ id: `cmd:${tpl.key}`, kind: 'command' as const, label: tpl.text.trim(), detail: tpl.hint || undefined, insert: tpl.text }))
      return { ...(continuation ? { ghost: continuation } : {}), items }
    },
  }
}

/** ¿Se ejecuta aquí, gratis? (si no, es un pedido libre y va a la IA). */
export function isConfident(parse: LocalParse): boolean {
  if (parse.reply) return true
  if (!parse.plan || !parse.plan.length) return false
  return parse.status ? parse.status === 'ready' : parse.confidence >= LOCAL_CONFIDENCE
}

export { EMPTY_PARSE }
