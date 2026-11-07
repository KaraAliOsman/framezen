/**
 * Intérprete local del panel sobre el motor de comandos multilingüe (`createNlu`, @dekopen/shared):
 * 7 idiomas, sin costo de API. Este archivo solo lo ata a los datos de la persona (catálogo,
 * clientes, cotizaciones, plantillas, asistentes, la cotización abierta y las estadísticas) y traduce
 * sus resultados al contrato del compositor (`LocalParse` / `Completion`).
 */
import { matchTypology, type TypologyId, type WindowDesign } from '@dekopen/engine'
import {
  createGlossaryHelpers,
  createNlu,
  type Locale,
  type LocalToolCall,
  type Nlu,
  type NluCatalog,
  type NluContext,
  type NluEntities,
  type NluParseResult,
  type NluStatsData,
  type NluSuggestion,
} from '@dekopen/shared'
import { preloadNamespace, webGlossary } from '../../../lib/i18n'
import type { QuoteEditorBridge } from '../bridge'
import { nluFrecency } from './nluFrecency'
import type { Completion, LocalInterpreter, LocalParse, Suggestion, SuggestionKind } from './interpreter'

export interface NluInterpreterContext {
  locale: Locale
  route: string
  bridge: QuoteEditorBridge | null
  catalog: NluCatalog
  entities: NluEntities
  stats?: NluStatsData
  /** Moneda de la empresa (respuestas de estadísticas). */
  currency?: string
  /** Ideas de la pantalla para la lista con la entrada vacía. */
  ideas: string[]
}

const MAX_ITEMS = 8
const EMPTY_PARSE: LocalParse = { plan: null, confidence: 0, interpretation: '', missing: [] }

const glossaryApi = createGlossaryHelpers(webGlossary)
let glossaryPreloaded = false

/** Tipología de un diseño, memoizada por objeto (el contexto se arma en cada tecla). */
const typologyCache = new WeakMap<WindowDesign, TypologyId | undefined>()
function typologyOf(design: WindowDesign): TypologyId | undefined {
  if (typologyCache.has(design)) return typologyCache.get(design)
  let id: TypologyId | undefined
  try {
    id = matchTypology(design) ?? undefined
  } catch {
    id = undefined
  }
  typologyCache.set(design, id)
  return id
}

/** Lo que el motor necesita saber de la pantalla en este instante. */
export function buildNluContext(input: Pick<NluInterpreterContext, 'route' | 'bridge' | 'stats'>, assistantNames: readonly string[]): NluContext {
  const { bridge } = input
  if (!bridge) return { route: input.route, quoteOpen: false, ...(input.stats ? { stats: input.stats } : {}), assistantNames }
  const quote = bridge.getQuote()
  const selectedId = bridge.selectedItemId()
  const selected = quote.items.find((i) => i.id === selectedId)
  return {
    route: input.route,
    quoteOpen: true,
    quoteId: bridge.quoteId,
    ...(selectedId ? { selectedItemId: selectedId } : {}),
    ...(selected?.ref ? { selectedRef: selected.ref } : {}),
    items: quote.items.map((i) => ({ id: i.id, ref: i.ref, typology: typologyOf(i.design), qty: i.qty, ...(i.location ? { location: i.location } : {}) })),
    ...(input.stats ? { stats: input.stats } : {}),
    assistantNames,
  }
}

const SUGGESTION_KINDS: Record<NluSuggestion['kind'], SuggestionKind | null> = {
  command: 'command',
  typology: 'typology',
  color: 'color',
  glass: 'glass',
  line: 'line',
  client: 'client',
  quote: 'quote',
  template: 'template',
  assistant: 'assistant',
  nav: 'navigation',
  locale: 'locale',
  theme: 'theme',
  mode: 'mode',
  accessory: 'accessory',
  period: 'period',
  value: 'value',
  hint: null,
}

/** Opciones del primer dato que falta, como comandos completos (sin las pistas, que no se insertan). */
function choicesOf(result: NluParseResult, text: string): LocalParse['choices'] {
  const out: NonNullable<LocalParse['choices']> = []
  for (const slot of result.missing) {
    for (const c of slot.choices ?? []) {
      if (c.kind === 'hint' || !c.insertText) continue
      out.push({ label: c.label, ...(c.detail ? { detail: c.detail } : {}), text: `${text.slice(0, c.replace[0])}${c.insertText}${text.slice(c.replace[1])}`.trim() })
      if (out.length >= 8) return out
    }
    if (out.length) break
  }
  for (const r of result.repairs) {
    if (out.length >= 8) break
    out.push({ label: r.label, text: r.text })
  }
  return out.length ? out : undefined
}

function toLocalParse(result: NluParseResult, text: string): LocalParse {
  const choices = result.status === 'incomplete' || result.status === 'ambiguous' ? choicesOf(result, text) : undefined
  const base = { status: result.status, ...(result.command ? { command: result.command } : {}), risk: result.risk, repairs: result.repairs, ...(choices ? { choices } : {}) }
  if (result.status === 'unmatched') return { ...EMPTY_PARSE, ...base }
  const missing = result.missing.map((m) => m.prompt || m.label).filter(Boolean)
  const notes = result.assumptions.length ? result.assumptions : undefined
  if (result.status === 'ready' && result.plan?.length) {
    return {
      ...base,
      plan: result.plan.map((c): LocalToolCall => ({ id: c.id, tool: c.tool, args: c.args as Record<string, unknown> })),
      confidence: result.confidence,
      interpretation: result.summary,
      missing: [],
      ...(result.reply ? { reply: result.reply } : {}),
      ...(notes ? { notes } : {}),
    }
  }
  // answer / invalid: respuesta determinista sin herramientas. incomplete / ambiguous: falta algo.
  return {
    ...base,
    plan: null,
    confidence: result.confidence,
    interpretation: result.summary,
    missing,
    ...(result.reply ? { reply: result.reply } : {}),
    ...(notes ? { notes } : {}),
  }
}

export function createNluInterpreter(ctx: NluInterpreterContext): LocalInterpreter & { nlu: Nlu } {
  // Nombres del glosario en los 7 idiomas: completar y elegir en el idioma en que se escribe.
  if (!glossaryPreloaded) {
    glossaryPreloaded = true
    void preloadNamespace('glossary')
  }
  const nlu = createNlu({
    locale: ctx.locale,
    catalog: ctx.catalog,
    entities: ctx.entities,
    glossary: glossaryApi,
    frecency: nluFrecency(),
    ...(ctx.currency ? { currency: ctx.currency } : {}),
  })
  const assistantNames = (ctx.entities.assistants ?? []).map((a) => a.name)
  const context = () => buildNluContext(ctx, assistantNames)

  return {
    nlu,
    parse(raw: string): LocalParse {
      const text = raw.trim()
      if (!text) return EMPTY_PARSE
      try {
        return toLocalParse(nlu.parse(text, context()), text)
      } catch {
        // Un fallo del motor nunca bloquea al asistente: el mensaje va a la IA.
        return EMPTY_PARSE
      }
    },
    complete(text: string, cursor: number): Completion {
      try {
        const result = nlu.complete(text, cursor, context())
        const items: Suggestion[] = []
        for (const s of result.items) {
          const kind = SUGGESTION_KINDS[s.kind]
          if (!kind) continue
          const insert = `${text.slice(0, s.replace[0])}${s.insertText}${text.slice(s.replace[1])}`
          items.push({ id: s.key, kind, label: s.label, ...(s.detail ? { detail: s.detail } : {}), insert })
          if (items.length >= MAX_ITEMS) break
        }
        if (!text.trim()) {
          // Entrada vacía: lo que la persona más usa, y después ideas de esta pantalla.
          const ideas = ctx.ideas.filter((idea) => !items.some((i) => i.insert === idea)).map((idea, i): Suggestion => ({ id: `idea:${i}`, kind: 'command', label: idea, insert: idea }))
          return { items: [...items.slice(0, 3), ...ideas, ...items.slice(3)].slice(0, MAX_ITEMS) }
        }
        return { ...(result.ghost ? { ghost: result.ghost } : {}), items }
      } catch {
        return { items: [] }
      }
    },
  }
}
