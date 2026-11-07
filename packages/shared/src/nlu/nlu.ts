/**
 * Intérprete local de comandos (cero costo de API): `createNlu(options)` → `{ parse, complete }`.
 *
 * Tubería: análisis léxico memoizado por texto (tokens → átomos con conceptos del léxico de 7
 * idiomas, entidades del catálogo y de los datos, números con cifras o palabras, literales
 * protegidos) → vocativo → cláusulas → gramática por comando → compuertas (cobertura, negación,
 * contexto) → plan con «Entendí: …», slots faltantes, reparaciones y supuestos.
 *
 * Los índices de entidades se construyen una vez por versión de datos (`catalog.version`,
 * `entities.version`; sin versión, por identidad del objeto) y se comparten entre instancias.
 */
import glossarySource from '../i18n/glossary/es'
import { createGlossaryHelpers, type GlossaryApi } from '../i18n/glossary/helpers'
import { DEFAULT_CURRENCY, DEFAULT_TIME_ZONE, LOCALES, type Locale } from '../i18n/locales'
import { createTranslator, defineDictionary } from '../i18n/translator'
import { analyze, rawSpan, type Analysis } from './analyze'
import { Build } from './build'
import { Clause, type ParseEnv } from './clause'
import { planRisk, type NluCommandId, type NluToolCall, type NluToolName } from './commands'
import { createCompleter } from './complete'
import { buildEntityIndex, type EntityIndex } from './entities'
import { buildByName, capitalize, tr, type EntityBundle, type GEnv } from './env'
import { howToKey, MATCHERS, NEUTRAL_CONCEPTS } from './grammar'
import { lexiconIndex } from './lexicon'
import { nluMessages } from './messages'
import { splitClauses, type NameList } from './split'
import { MAX_COMMAND_LENGTH, nameKey } from './text'
import type { NluCatalog, NluClauseResult, NluCompletion, NluContext, NluEntities, NluOptions, NluParseResult, NluSpan, NluStatus } from './types'

export interface Nlu {
  /** Idioma de la interfaz con que se creó. */
  readonly locale: Locale
  /** Interpreta un texto completo (al enviar o para la vista previa «Entendí: …»). */
  parse(text: string, ctx?: NluContext): NluParseResult
  /** Sugerencias para el texto en el cursor: texto fantasma (si es claro) y lista. */
  complete(text: string, cursor?: number, ctx?: NluContext): NluCompletion
  /** Libera las cachés de esta instancia (los índices compartidos se quedan). */
  dispose(): void
}

// ── Índices compartidos por versión de datos ────────────────────────────────

const byVersion = new Map<string, EntityBundle>()
const byIdentity = new WeakMap<object, WeakMap<object, EntityBundle>>()
const EMPTY = {}

function bundleFor(catalog: NluCatalog | undefined, entities: NluEntities | undefined): EntityBundle {
  const build = (): EntityBundle => {
    const index: EntityIndex = buildEntityIndex(catalog, entities)
    return { index, byName: buildByName(index) }
  }
  if (catalog?.version !== undefined && entities?.version !== undefined) {
    const key = `${catalog.version}|${entities.version}`
    let b = byVersion.get(key)
    if (!b) {
      b = build()
      byVersion.set(key, b)
      if (byVersion.size > 8) byVersion.delete(byVersion.keys().next().value!)
    }
    return b
  }
  const a = catalog ?? EMPTY
  const e = entities ?? EMPTY
  let inner = byIdentity.get(a)
  if (!inner) {
    inner = new WeakMap()
    byIdentity.set(a, inner)
  }
  let b = inner.get(e)
  if (!b) {
    b = build()
    inner.set(e, b)
  }
  return b
}

/** Glosario de respaldo: nombres en español para todos los idiomas (sin cargar los 7 glosarios). */
let fallbackGlossary: GlossaryApi | null = null
function spanishGlossary(): GlossaryApi {
  if (!fallbackGlossary) {
    const es = glossarySource
    fallbackGlossary = createGlossaryHelpers(defineDictionary({ es, en: es, pt: es, fr: es, de: es, it: es, tr: es }))
  }
  return fallbackGlossary
}

// ── Interpretación de una cláusula ──────────────────────────────────────────

export interface ClauseOutcome {
  build: Build | null
  clause: Clause
  unexplained: number[]
  value: number
  negated: boolean
}

const STATUS_RANK: Record<NluStatus, number> = { answer: 0, ready: 1, incomplete: 2, ambiguous: 3, invalid: 4, unmatched: 5 }

export function interpretClause(base: Clause, g: GEnv, inherit?: NluCommandId): ClauseOutcome {
  if (base.has('neg.not')) return { build: null, clause: base, unexplained: base.unexplained(NEUTRAL_CONCEPTS), value: 0, negated: true }
  // «¿cómo agrego…?» explica; «guárdalo como PDF» no es una pregunta.
  const howAt = base.find('q.how')
  const howTo = howAt >= 0 && (base.isQuestion() || howAt === base.meaningful()[0] || base.atoms.slice(base.from, howAt).every((a) => a.kind === 'punct'))
  const env: GEnv = howTo ? { ...g, howTo: true } : g
  let best: ClauseOutcome | null = null
  for (const matcher of MATCHERS) {
    const c = base.fresh()
    if (howTo) for (let i = c.from; i < c.to; i++) if (c.is(i, 'q.how')) c.use(i)
    const b = matcher(c, env, inherit)
    if (!b) continue
    const unexplained = c.unexplained(NEUTRAL_CONCEPTS)
    const value = b.score - 0.9 * unexplained.length - 0.3 * c.fuzzyUsed()
    if (!best || value > best.value + 1e-9) best = { build: b, clause: c, unexplained, value, negated: false }
  }
  if (best?.build && howTo) {
    const key = howToKey(best.build.command)
    if (key && !best.build.command.startsWith('stats.') && best.build.command !== 'catalog.lookup' && best.build.command !== 'memory.recall') {
      const b = new Build(best.build.command, best.build.score)
      b.part(tr(g, 'sum.howTo', { what: tr(g, `cmd.${key}`) }))
      b.answer(tr(g, 'reply.howTo', { example: tr(g, `example.${key}`) }))
      best = { ...best, build: b }
    }
  }
  return best ?? { build: null, clause: base, unexplained: base.unexplained(NEUTRAL_CONCEPTS), value: 0, negated: false }
}

/** Une dos cláusulas contiguas (la segunda ya explicada) en una sola para las compuertas. */
function mergeClauses(a: Clause, b: Clause): Clause {
  const merged = new Clause(a.an, a.from, b.to, a.env)
  for (const i of a.used) merged.used.add(i)
  for (const i of b.used) merged.used.add(i)
  for (let i = a.to; i < b.from; i++) merged.used.add(i)
  for (const i of a.textAtoms) merged.textAtoms.add(i)
  for (const i of b.textAtoms) merged.textAtoms.add(i)
  return merged
}

function confidence(out: ClauseOutcome): number {
  const b = out.build!
  const meaningful = out.clause.meaningful().length
  const coverage = meaningful ? (meaningful - out.unexplained.length) / meaningful : 1
  const value = 0.55 * Math.min(1, b.score / 3.5) + 0.35 * coverage + 0.1 - 0.06 * out.clause.fuzzyUsed() - 0.03 * b.guesses
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100
}

function dropWords(text: string, an: Analysis, atoms: readonly number[], clause: Clause): string {
  let out = text
  for (const i of [...atoms].sort((a, b) => b - a)) {
    const a = clause.atoms[i]
    const start = an.tokens[a.s].start
    const end = an.tokens[a.e - 1].end
    out = out.slice(0, start) + out.slice(end)
  }
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim()
}

/** Aplica las compuertas a una cláusula y la convierte al resultado público (sin ids de llamadas). */
function finishClause(out: ClauseOutcome, g: GEnv, an: Analysis): NluClauseResult & { planned: { tool: NluToolName; args: Record<string, unknown> }[] } {
  const c = out.clause
  const base = { start: c.start(), end: c.end(), calls: [] as NluToolCall[], planned: [] as { tool: NluToolName; args: Record<string, unknown> }[] }
  const unmatched = { ...base, status: 'unmatched' as NluStatus, confidence: 0, summary: '', missing: [], repairs: [], assumptions: [] }
  const b = out.build
  if (!b || out.negated) return unmatched
  let status = b.status
  const repairs = [...b.repairs]
  const assumptions = [...b.assumptions]
  if (out.unexplained.length) {
    const meaningful = c.meaningful().length
    const lone = out.unexplained.length === 1 && c.atoms[out.unexplained[0]].kind === 'unknown'
    if ((status === 'ready' || status === 'incomplete') && b.score >= 3 && lone && meaningful >= 4) {
      status = 'ambiguous'
      const word = c.raw(out.unexplained[0])
      repairs.push({ label: tr(g, 'repair.dropWord', { word }), text: dropWords(g.text, an, out.unexplained, c) })
    } else return { ...unmatched, command: b.command }
  }
  // Correcciones de tipeo: cortas → confirmar; largas → supuesto visible.
  let fixedText = g.text
  let shortFix = false
  for (const i of [...c.used].sort((x, y) => y - x)) {
    const a = c.atoms[i]
    if (!a.fuzzy || !a.fix || c.textAtoms.has(i)) continue
    const word = c.raw(i)
    if (word.length <= 5 || a.partial) shortFix = true
    const start = an.tokens[a.s].start
    const end = an.tokens[a.e - 1].end
    fixedText = fixedText.slice(0, start) + a.fix + fixedText.slice(end)
    assumptions.push(tr(g, 'assume.fuzzy', { from: word, to: a.fix }))
  }
  if (shortFix && (status === 'ready' || status === 'answer')) {
    status = 'ambiguous'
    repairs.push({ label: tr(g, 'repair.fixTypo', { text: fixedText }), text: fixedText })
  }
  const summary = capitalize(b.parts.join(' · '), g.locale)
  const result = {
    ...base,
    status,
    command: b.command,
    confidence: status === 'unmatched' ? 0 : confidence(out),
    summary,
    missing: b.missing,
    repairs,
    assumptions,
    planned: status === 'ready' || status === 'answer' ? b.calls : [],
  }
  if (b.reply) (result as NluClauseResult).reply = b.reply
  return result
}

function spanKind(c: Clause, i: number): NluSpan['kind'] {
  const a = c.atoms[i]
  if (a.kind === 'literal') return 'literal'
  if (a.kind === 'entity') return 'entity'
  if (a.kind === 'number') return 'number'
  if (a.kind === 'unknown') return 'unknown'
  if (c.isFiller(i)) return 'filler'
  if (c.isPrefix(i, 'act.')) return 'action'
  if (c.isPrefix(i, 'obj.') || c.isPrefix(i, 'nav.')) return 'object'
  return 'value'
}

// ── Fábrica ─────────────────────────────────────────────────────────────────

export function createNlu(options: NluOptions): Nlu {
  const locale: Locale = LOCALES.includes(options.locale) ? options.locale : 'es'
  const t = createTranslator(nluMessages, locale)
  const glossary = options.glossary ?? spanishGlossary()
  const bundle = bundleFor(options.catalog, options.entities)
  lexiconIndex()
  const analyses = new Map<string, { an: Analysis; cache: Map<number, Set<string>> }>()
  let seq = 0
  const completer = createCompleter({ locale, t, glossary, bundle, frecency: options.frecency })

  const analysisOf = (text: string) => {
    let hit = analyses.get(text)
    if (hit) {
      analyses.delete(text)
      analyses.set(text, hit)
      return hit
    }
    hit = { an: analyze(text, { entities: bundle.index, prior: locale }), cache: new Map() }
    analyses.set(text, hit)
    if (analyses.size > 64) analyses.delete(analyses.keys().next().value!)
    return hit
  }

  const namesOf = (ctx: NluContext): NameList => {
    const out: string[][] = []
    const seen = new Set<string>()
    const add = (name: string) => {
      const key = nameKey(name)
      if (!key || seen.has(key) || key.length > 40) return
      seen.add(key)
      out.push(key.split(' '))
    }
    for (const n of ctx.assistantNames ?? []) add(n)
    for (const a of bundle.index.lists.assistant) add(a.name)
    return out
  }

  const envFor = (text: string, ctx: NluContext, language: Locale | null): GEnv => {
    const now = ctx.now !== undefined ? new Date(ctx.now) : new Date()
    return {
      locale,
      inputLocale: language ?? locale,
      t,
      glossary,
      bundle,
      ctx,
      currency: options.currency ?? DEFAULT_CURRENCY,
      timeZone: options.timeZone ?? DEFAULT_TIME_ZONE,
      now: Number.isNaN(now.getTime()) ? new Date() : now,
      text,
    }
  }

  /** Cláusulas interpretadas de un texto (compartido por `parse` y `complete`). */
  const interpret = (text: string, ctx: NluContext) => {
    const { an, cache } = analysisOf(text)
    const g = envFor(text, ctx, an.language)
    const penv: ParseEnv = { locale, entities: bundle.index, quoteOpen: ctx.quoteOpen, selectedRef: ctx.selectedRef }
    const whole = new Clause(an, 0, an.atoms.length, penv, cache)
    const split = splitClauses(whole, namesOf(ctx))
    const outcomes: ClauseOutcome[] = []
    let prev: NluCommandId | undefined
    for (const r of split.ranges) {
      const base = new Clause(an, r.from, r.to, penv, cache)
      const out = interpretClause(base, g, r.inherit ? prev : undefined)
      const last = outcomes[outcomes.length - 1]
      // «agrega una corredera … y ponle nogal»: el cambio sin destino va en la ventana nueva.
      if (out.build?.merge && last?.build?.command === 'item.add' && !out.unexplained.length) {
        const add = last.build
        const call = add.calls.find((c) => c.tool === 'add_window')
        if (call) {
          Object.assign(call.args, out.build.merge.args)
          for (const p of out.build.merge.parts) add.part(p)
          for (const k of out.build.filled) add.fill(k)
          last.clause = mergeClauses(last.clause, out.clause)
          continue
        }
      }
      if (out.build) prev = out.build.command
      outcomes.push(out)
    }
    return { an, g, whole, split, outcomes }
  }

  const unmatchedResult = (language: Locale | null, ignored: string[] = []): NluParseResult => ({
    status: 'unmatched',
    plan: null,
    confidence: 0,
    interpretation: '',
    summary: '',
    missing: [],
    repairs: [],
    assumptions: [],
    language,
    clauses: [],
    spans: [],
    ignored,
    risk: 'read',
  })

  const parse = (input: string, ctx: NluContext = {}): NluParseResult => {
    const text = typeof input === 'string' ? input : ''
    if (!text.trim() || text.length > MAX_COMMAND_LENGTH) return unmatchedResult(null)
    const { an, g, whole, split, outcomes } = interpret(text, ctx)
    // Solo el nombre del asistente: «Sofía» → saludo.
    if (!split.ranges.length) {
      if (!split.vocative.length) return unmatchedResult(an.language)
      const reply = tr(g, 'reply.greeting')
      return { ...unmatchedResult(an.language), status: 'answer', command: 'greeting', plan: [], confidence: 0.9, summary: tr(g, 'sum.greeting'), interpretation: tr(g, 'understood', { summary: tr(g, 'sum.greeting') }), reply }
    }
    let clauses = outcomes.map((o) => finishClause(o, g, an))
    // Saludos y gracias junto a un comando no cuentan («hola, agrega…»).
    if (clauses.some((c) => c.command !== 'greeting' && c.command !== 'thanks' && c.status !== 'unmatched')) {
      clauses = clauses.filter((c) => c.command !== 'greeting' && c.command !== 'thanks')
    }
    const ignored: string[] = []
    outcomes.forEach((o) => {
      for (const i of o.unexplained) ignored.push(rawSpan(an, o.clause.atoms[i].s, o.clause.atoms[i].e))
    })
    let status: NluStatus = 'answer'
    for (const c of clauses) if (STATUS_RANK[c.status] > STATUS_RANK[status]) status = c.status
    if (!clauses.length) status = 'unmatched'
    const spans: NluSpan[] = whole.atoms.map((a, i) => {
      const s: NluSpan = { start: an.tokens[a.s].start, end: an.tokens[a.e - 1].end, kind: spanKind(whole, i) }
      const concept = a.hits.find((h) => !h.c.startsWith('fil'))?.c
      if (concept) s.concept = concept
      return s
    })
    const language = an.language
    if (status === 'unmatched') {
      const res = unmatchedResult(language, ignored)
      res.spans = spans
      const first = clauses.find((c) => c.command)
      if (first?.command) res.command = first.command
      res.clauses = clauses.map(stripPlanned)
      return res
    }
    // Ids de las llamadas (únicos en la instancia).
    const calls: NluToolCall[] = []
    for (const c of clauses) {
      c.calls = c.planned.map((p) => ({ id: `nlu_${(++seq).toString(36)}`, tool: p.tool, args: p.args }) as NluToolCall)
      if (status === 'ready' || status === 'answer') calls.push(...c.calls)
    }
    const summary = clauses
      .map((c) => c.summary)
      .filter(Boolean)
      .join('; ')
    const replies = clauses.map((c) => c.reply).filter((r): r is string => !!r)
    const result: NluParseResult = {
      status,
      command: clauses[0]?.command,
      plan: status === 'ready' ? calls : status === 'answer' ? [] : null,
      confidence: Math.min(...clauses.map((c) => c.confidence)),
      interpretation: summary ? tr(g, 'understood', { summary }) : '',
      summary,
      missing: clauses.flatMap((c) => c.missing),
      repairs: clauses.flatMap((c) => c.repairs),
      assumptions: clauses.flatMap((c) => c.assumptions),
      language,
      clauses: clauses.map(stripPlanned),
      spans,
      ignored,
      risk: planRisk(calls),
    }
    if (status === 'ready' && calls.length === 0) result.status = 'answer'
    if (replies.length && (status === 'answer' || status === 'ready' || status === 'invalid')) result.reply = replies.map((r) => capitalize(r, locale)).join('\n')
    return result
  }

  const complete = (text: string, cursor?: number, ctx: NluContext = {}): NluCompletion => {
    const value = typeof text === 'string' ? text : ''
    const at = Math.max(0, Math.min(value.length, cursor ?? value.length))
    if (value.length > MAX_COMMAND_LENGTH) return { items: [], replace: [at, at] }
    return completer(value, at, {
      ctx,
      interpretHead: (head) => {
        if (!head.trim()) return null
        const { g, outcomes } = interpret(head, ctx)
        return { g, last: outcomes[outcomes.length - 1] ?? null }
      },
      languageOf: (head) => (head.trim() ? analysisOf(head).an.language : null),
    })
  }

  return {
    locale,
    parse,
    complete,
    dispose() {
      analyses.clear()
    },
  }
}

function stripPlanned(c: NluClauseResult & { planned?: unknown }): NluClauseResult {
  const out: NluClauseResult & { planned?: unknown } = { ...c }
  delete out.planned
  return out
}
