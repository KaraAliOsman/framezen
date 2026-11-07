/**
 * Gramática por comando: cada regla mira los conceptos de una cláusula (sin importar el idioma ni el
 * orden de las palabras), extrae sus datos, marca lo que explicó y devuelve un plan con su evidencia.
 * El intérprete prueba las reglas cuyo disparador aparece, descuenta las palabras con significado
 * que quedaron sin explicar y se queda con la mejor. Ninguna palabra se ignora en silencio: si sobra
 * algo con significado, no se ejecuta (va a la IA o se ofrece una reparación).
 */
import { TYPOLOGY_IDS, type TypologyId } from '@dekopen/engine'
import type { QuoteStatus } from '../api'
import type { AssistantMode, UiDialog, UiNavTarget } from '../assistant-v2'
import { LOCALES, type Locale } from '../i18n/locales'
import { Build } from './build'
import type { Clause } from './clause'
import type { NluCatalogSection, NluCommandId, NluSettingsSection, NluToolArgs } from './commands'
import { typologyInsert } from './complete'
import { appendChoice, capitalize, fmt, inline, languageName, slot, tr, type GEnv } from './env'
import { conceptSurface } from './lexicon'
import {
  at,
  clientChoices,
  itemChoices,
  cleanQuery,
  recentQuoteChoices,
  resolveAssistant,
  resolveClient,
  resolveItems,
  resolveQuote,
  resolveTemplate,
  surface,
  typologyFromPanels,
  useConcepts,
  windowSpec,
  type QuoteResolved,
  type WindowSpec,
} from './resolve'
import { answerStats, periodLabel, readPeriod, type Period, type StatKind } from './stats'
import type { NluSuggestion } from './types'

export type Matcher = (c: Clause, g: GEnv, inherit?: NluCommandId) => Build | null

/** Conceptos que nunca cuentan como palabras sin explicar (cortesía, saludo, «puedes…», «quiero…»). */
export const NEUTRAL_CONCEPTS: readonly string[] = ['pol', 'grt', 'thx', 'q.can', 'act.want']

const CHANGE_VERBS = ['act.change', 'act.put', 'act.set', 'act.use', 'act.apply']
const OPEN_VERBS = ['act.open', 'act.go', 'act.show', 'act.select']

function quoteSum(g: GEnv, key: string, q: QuoteResolved | null, params: Record<string, string | number> = {}): string {
  return tr(g, key, { quote: q?.label ?? tr(g, 'sum.quoteCurrent'), ...params })
}

function percentChoices(g: GEnv, values: readonly number[]): NluSuggestion[] {
  return values.map((v, i) => appendChoice(g, 'value', fmt.pct(g, v), g.inputLocale === 'tr' ? `%${v}` : `${v}%`, { id: String(v), score: 1 - i * 0.01 }))
}

function localeChoices(g: GEnv): NluSuggestion[] {
  return LOCALES.map((l, i) => appendChoice(g, 'locale', languageName(g.locale, l), surface(g, `lang.${l}`), { id: l, score: 1 - i * 0.01 }))
}

/** Idioma nombrado («inglés», «English», «İngilizce»). */
function readLocale(c: Clause): { locale: Locale; i: number } | null {
  for (const l of LOCALES) {
    const i = c.find(`lang.${l}`)
    if (i >= 0) return { locale: l, i }
  }
  return null
}

// ── Conversación: saludo, gracias, ayuda, deshacer ──────────────────────────

const greeting: Matcher = (c, g) => {
  const grt = at(c, 'grt')
  const thx = at(c, 'thx')
  if (grt < 0 && thx < 0) return null
  if (c.meaningful().some((i) => !c.is(i, 'grt') && !c.is(i, 'thx') && !c.is(i, 'pol'))) return null
  useConcepts(c, 'grt', 'thx', 'pol')
  if (grt >= 0) return new Build('greeting', 1).part(tr(g, 'sum.greeting')).answer(tr(g, 'reply.greeting'))
  return new Build('thanks', 1).part(tr(g, 'sum.thanks')).answer(tr(g, 'reply.thanks'))
}

const help: Matcher = (c, g) => {
  if (at(c, 'act.help') < 0 && !(c.has('obj.command') && (c.has('act.show') || c.has('q.what')))) return null
  useConcepts(c, 'act.help', 'obj.command', 'act.show', 'q.what', 'q.can')
  return new Build('help', 3).part(tr(g, 'sum.help')).answer(tr(g, 'reply.help'))
}

const history: Matcher = (c, g) => {
  const undo = at(c, 'act.undo')
  const redo = at(c, 'act.redo')
  if (undo < 0 && redo < 0) return null
  useConcepts(c, 'act.undo', 'act.redo', 'scp.last', 'obj.action', 'act.put')
  if (redo >= 0 && (undo < 0 || redo < undo)) return new Build('history.redo', 3.5).part(tr(g, 'sum.redo')).call('redo', {})
  return new Build('history.undo', 3.5).part(tr(g, 'sum.undo')).call('undo', {})
}

// ── Memoria ─────────────────────────────────────────────────────────────────

const COMPLEMENTIZERS = new Set(['que', 'that', 'dass', 'dab', 'che', 'ki', 'de', 'di', 'about', 'sobre', 'lo', 'of'])

/** Texto libre de un recuerdo: lo que sigue al verbo (o lo que lo precede, si el verbo va al final). */
function memoryText(c: Clause, verb: number): { text: string; atoms: number[] } {
  let from = verb + 1
  while (from < c.to && (c.punct(from, ',:;') || (c.atoms[from].e - c.atoms[from].s === 1 && COMPLEMENTIZERS.has(c.an.tokens[c.atoms[from].s].fold)) || c.is(from, 'act.remember') || c.is(from, 'act.forget'))) from++
  let text = ''
  const atoms: number[] = []
  if (from < c.to) {
    text = c.rawRange(from, c.to)
    for (let k = from; k < c.to; k++) atoms.push(k)
  } else if (verb > c.from) {
    // Verbo al final (turco, japonés…): «… olduğunu hatırla».
    text = c.rawRange(c.from, verb)
    for (let k = c.from; k < verb; k++) atoms.push(k)
  }
  text = text
    .trim()
    .replace(/^["'«“„]+|["'»”“.!¡?¿]+$/g, '')
    .trim()
  return { text, atoms }
}

const memory: Matcher = (c, g) => {
  const rem = at(c, 'act.remember')
  const forget = at(c, 'act.forget')
  const recall = at(c, 'act.recall')
  if (recall >= 0) {
    c.use(recall)
    const rest = c.freeText(recall + 1, { maxWords: 6 })
    const b = new Build('memory.recall', 3.5)
    useConcepts(c, 'q.what', 'obj.memory')
    if (rest.text) {
      c.use(rest.atoms)
      const query = cleanQuery(rest.text.replace(/^(de|sobre|about|of|über|uber|su|di|hakkında)\s+/i, ''))
      return b.part(tr(g, 'sum.recallQuery', { query })).call('recall', { query })
    }
    return b.part(tr(g, 'sum.recall')).call('recall', {})
  }
  if (rem < 0 && forget < 0) {
    if (c.has('obj.memory') && c.has('act.show')) {
      useConcepts(c, 'obj.memory', 'act.show')
      return new Build('memory.recall', 2.5).part(tr(g, 'sum.recall')).call('recall', {})
    }
    return null
  }
  const verb = rem >= 0 && (forget < 0 || rem <= forget) ? rem : forget
  const isRemember = verb === rem
  // El verbo debe abrir o cerrar la frase: «¿recuerdas cuánto vendí?» no es un recuerdo.
  const meaningful = c.meaningful()
  if (verb !== meaningful[0] && verb !== meaningful[meaningful.length - 1]) return null
  c.use(verb)
  const { text, atoms } = memoryText(c, verb)
  c.use(atoms)
  for (const k of atoms) c.textAtoms.add(k)
  const b = new Build(isRemember ? 'memory.remember' : 'memory.forget', 4)
  if (!text || !/[\p{L}\p{N}]/u.test(text)) return b.need(slot(g, 'text'))
  const content = text.slice(0, 1000)
  b.fill('text')
  if (isRemember) return b.part(tr(g, 'sum.remember', { text: content })).call('remember', { content })
  return b.part(tr(g, 'sum.forget', { text: content })).call('forget', { query: content })
}

// ── Navegación, formularios y plantillas ────────────────────────────────────

const NAV: readonly [string, UiNavTarget, NluSettingsSection | NluCatalogSection | undefined, string][] = [
  ['nav.language', 'settings', 'idioma', 'language'],
  ['nav.ai', 'settings', 'ia', 'ai'],
  ['nav.textures', 'catalog', 'colores', 'textures'],
  ['nav.pricing', 'pricing', undefined, 'pricing'],
  ['nav.assistants', 'assistants', undefined, 'assistants'],
  ['nav.company', 'company', undefined, 'company'],
  ['nav.plan', 'plan', undefined, 'plan'],
  ['nav.team', 'team', undefined, 'team'],
  ['nav.quotes', 'quotes', undefined, 'quotes'],
  ['nav.clients', 'clients', undefined, 'clients'],
  ['nav.workshop', 'workshop', undefined, 'workshop'],
  ['nav.catalog', 'catalog', undefined, 'catalog'],
  ['nav.documents', 'documents', undefined, 'documents'],
  ['nav.settings', 'settings', undefined, 'settings'],
  ['nav.home', 'home', undefined, 'home'],
]

export function navChoices(g: GEnv): NluSuggestion[] {
  return NAV.map(([concept, , , label], i) => appendChoice(g, 'nav', tr(g, `nav.${label}`), surface(g, concept), { id: label, score: 1 - i * 0.01 }))
}

const navigate: Matcher = (c, g) => {
  const verb = at(c, 'act.go', 'act.open', 'act.show')
  // La más específica primero (idioma y región, precios… antes que ajustes).
  for (const [concept, to, section, label] of NAV) {
    const i = c.find(concept)
    if (i < 0) continue
    // «abre la cotización 123», «muéstrame el cliente Pérez»: referencias concretas, no la sección.
    if (c.findLiteral('hash') >= 0 || c.findLiteral('vref') >= 0 || c.findEntity('client', true) || c.findEntity('quote', true)) return null
    const bare = c.meaningful().length <= 2
    if (verb < 0 && !bare) return null
    c.use(i)
    useConcepts(c, 'act.go', 'act.open', 'act.show', 'obj.catalog', 'obj.settings', 'obj.workshop', 'obj.assistant', 'obj.quote', 'obj.client', 'obj.template', 'obj.price', 'obj.logo', 'obj.language', 'obj.texture', 'obj.color')
    const args: { to: UiNavTarget; section?: NluSettingsSection | NluCatalogSection } = { to }
    if (section) args.section = section
    const b = new Build('nav.go', verb >= 0 ? 3 : 2).fill('nav').part(tr(g, 'sum.nav', { place: tr(g, `nav.${label}`) }))
    return b.call('navigate', args)
  }
  if (c.is(c.meaningful()[0], 'act.go') && c.meaningful().length === 1) {
    c.use(c.meaningful()[0])
    return new Build('nav.go', 1.5).need(slot(g, 'nav', undefined, navChoices(g)))
  }
  return null
}

const dialog: Matcher = (c, g) => {
  let which: UiDialog | null = null
  let score = 2.8
  if (c.has('act.upload') && (c.has('obj.price') || c.has('nav.catalog') || c.has('nav.pricing') || c.has('obj.file'))) which = 'import_prices'
  else if (c.has('act.upload') && c.has('obj.texture')) which = 'texture_upload'
  else if (c.has('obj.assistant') && (c.has('act.create') || c.has('act.edit'))) which = 'assistant_editor'
  else if (c.has('obj.memory') && (c.has('act.open') || c.has('act.edit'))) which = 'memory_manager'
  else if (c.has('obj.client') && c.has('act.create') && c.findLiteral('quoted') < 0 && !c.hasPrefix('per.')) {
    // «crea un cliente» sin nombre: abre el formulario.
    const nameless = c.meaningful().every((i) => c.is(i, 'obj.client') || c.is(i, 'act.create'))
    if (!nameless) return null
    which = 'new_client'
    score = 2.5
  }
  if (!which) return null
  useConcepts(c, 'act.upload', 'act.create', 'act.edit', 'act.open', 'obj.price', 'nav.catalog', 'nav.pricing', 'obj.file', 'obj.texture', 'obj.assistant', 'obj.memory', 'obj.client', 'scp.')
  // «crea un cliente» abre el formulario y deja seguir escribiendo el nombre.
  const b = new Build(which === 'new_client' ? 'client.create' : 'dialog.open', score)
  return b.part(tr(g, 'sum.dialog', { dialog: tr(g, `dialog.${which}`) })).call('open_dialog', { dialog: which })
}

const templates: Matcher = (c, g) => {
  const ti = at(c, 'obj.template')
  if (ti < 0) return null
  c.use(ti)
  const edit = at(c, 'act.edit', 'act.open', 'act.create')
  const change = at(c, ...CHANGE_VERBS)
  if (edit >= 0 && (change < 0 || edit <= change) && !c.has('obj.quote')) {
    c.use(edit)
    const tpl = resolveTemplate(c, g, ti + 1)
    if (tpl?.templateId) return new Build('template.open', 3).fill('template').part(tr(g, 'sum.templateOpen', { template: tpl.name })).call('open_template_editor', { templateId: tpl.templateId })
    const all = g.bundle.index.lists.template
    if (tpl?.choices?.length) {
      return new Build('template.open', 2.5).ambiguous(slot(g, 'template', undefined, tpl.choices.map((e, i) => appendChoice(g, 'template', e.name, e.name, { id: e.id, score: 1 - i * 0.01 }))))
    }
    // «edita la plantilla» sin nombre: va a Documentos (y propone las plantillas para completar).
    const b = new Build('template.open', 2.5).part(tr(g, 'sum.nav', { place: tr(g, 'nav.documents') })).call('navigate', { to: 'documents' })
    if (!tpl && all.length && !c.has('act.create')) b.need(slot(g, 'template', undefined, all.map((e, i) => appendChoice(g, 'template', e.name, e.name, { id: e.id, score: 1 - i * 0.01 }))))
    return b
  }
  if (change < 0) return null
  useConcepts(c, ...CHANGE_VERBS)
  const b = new Build('quote.template', 3)
  const q = resolveQuote(c, g, b, { require: true })
  const tpl = resolveTemplate(c, g, ti + 1)
  if (!tpl) return b.need(slot(g, 'template', undefined, g.bundle.index.lists.template.map((e, i) => appendChoice(g, 'template', e.name, e.name, { id: e.id, score: 1 - i * 0.01 }))))
  b.fill('template')
  if (tpl.choices?.length && !tpl.templateId) b.ambiguous(slot(g, 'template', undefined, tpl.choices.map((e, i) => appendChoice(g, 'template', e.name, e.name, { id: e.id, score: 1 - i * 0.01 }))))
  if (!q) return b
  b.part(quoteSum(g, 'sum.template', q, { template: tpl.name }))
  return b.call('set_quote_template', { ...q.target, ...(tpl.templateId ? { templateId: tpl.templateId } : {}), template: tpl.name })
}

// ── Cotización: crear, abrir, renombrar, duplicar, eliminar ─────────────────

const quoteCreate: Matcher = (c, g) => {
  const qi = at(c, 'obj.quote')
  const create = at(c, 'act.create')
  if (qi < 0 || create < 0) return null
  // «crea un cliente», «nueva plantilla»: otro objeto manda.
  if (c.has('obj.client') && !c.has('trg.for') && c.find('obj.client') < qi) return null
  c.use(qi, create)
  useConcepts(c, 'act.create')
  const b = new Build('quote.create', 3.2)
  const args: { title?: string; client?: string; clientId?: string } = {}
  // Cliente: «para María Soto», «cliente "María Soto"».
  const forAt = c.findAny(['trg.for', 'obj.client'])
  let client: ReturnType<typeof resolveClient> = null
  if (forAt >= 0 && forAt > qi) {
    c.use(forAt)
    client = resolveClient(c, g, forAt + 1)
  }
  // Título: entre comillas, tras «llamada/named», o el resto después de «cotización».
  const named = c.find('trg.named')
  const quoted = c.findLiteral('quoted')
  if (quoted >= 0 && !c.used.has(quoted)) {
    args.title = c.atoms[quoted].lit!.raw
    c.use(quoted)
  } else {
    const start = named >= 0 ? named + 1 : qi + 1
    const text = c.freeText(start, { stop: (k) => (forAt > qi && k >= forAt) || c.used.has(k) || c.is(k, 'trg.for') || c.isPrefix(k, 'act.') || c.isPrefix(k, 'fam.') || c.is(k, 'obj.window') })
    if (text.text) {
      args.title = text.text
      c.use(text.atoms)
    }
  }
  if (named >= 0) c.use(named)
  if (client) {
    if (client.clientId) args.clientId = client.clientId
    args.client = client.name
    if (client.choices?.length && !client.clientId) b.ambiguous(slot(g, 'client', undefined, clientChoices(g, client.choices)))
    b.fill('client')
  }
  if (args.title) b.fill('title')
  b.part(args.title ? tr(g, 'sum.quoteCreateTitled', { title: args.title }) : tr(g, 'sum.quoteCreate'))
  if (client) b.part(tr(g, 'sum.forClient', { client: client.name }))
  b.call('create_quote', args)
  // «nueva cotización con una corredera de 1500x1200»: la ventana va en la misma cotización.
  if (c.hasPrefix('fam.')) {
    const spec = windowSpec(c, g, b, 'add')
    if (spec.args.typology) {
      b.call('add_window', spec.args)
      b.part(tr(g, 'sum.add', { what: inline(spec.typologyLabel ?? '', g.locale) }))
      for (const p of spec.parts) b.part(p)
      useConcepts(c, 'obj.window', 'obj.door')
    }
  }
  return b
}

const quoteOpen: Matcher = (c, g) => {
  const verb = at(c, 'act.open', 'act.go', 'act.show')
  const hasRef = c.findLiteral('hash') >= 0 || c.has('obj.quote') || !!c.findEntity('quote', true)
  if (!hasRef) return null
  if (verb < 0 && c.meaningful().length > 3) return null
  if (c.hasPrefix('act.') && verb < 0) return null
  if (verb >= 0) c.use(verb)
  const b = new Build('quote.open', verb >= 0 ? 3 : 2)
  const q = resolveQuote(c, g, b, { allowQuoted: true, allowQuery: true, require: false })
  if (!q || !q.explicit) {
    // «go to quotes», «ve a cotizaciones»: la sección.
    if (verb < 0 || (c.has('nav.quotes') && !c.has('obj.number'))) return null
    b.score = 2.5
    return b.need(slot(g, 'quote', undefined, recentQuoteChoices(g)))
  }
  b.fill('quote')
  if (q.query !== undefined && !q.target.quoteId) return b.part(tr(g, 'sum.quoteOpenQuery', { query: q.query })).call('open_quote', { query: q.query })
  if (q.current && q.entry) return b.part(tr(g, 'sum.quoteOpen', { quote: tr(g, 'sum.quoteCurrent') })).call('open_quote', { quoteId: q.entry.id })
  return b.part(tr(g, 'sum.quoteOpen', { quote: q.label })).call('open_quote', q.target)
}

const quoteRename: Matcher = (c, g) => {
  const verb = at(c, 'act.rename')
  if (verb < 0) return null
  c.use(verb)
  useConcepts(c, 'act.rename', 'obj.title', 'obj.name')
  // «renombra la V2 a Cocina» = ambiente del ítem.
  if (c.findLiteral('vref') >= 0) {
    const b = new Build('item.update', 3)
    const items = resolveItems(c, g, b, { allowAll: false, single: true })
    const title = renameText(c)
    if (!title) return b.need(slot(g, 'name'))
    if (!items) return b
    return b.part(tr(g, 'sum.update', { target: items.label })).part(tr(g, 'sum.location', { location: title })).call('update_window', { ...items.target, location: title })
  }
  const b = new Build('quote.rename', 3.2)
  const q = resolveQuote(c, g, b, { require: true })
  const title = renameText(c)
  if (!title) return b.need(slot(g, 'title'))
  b.fill('title')
  if (!q) return b
  return b.part(quoteSum(g, 'sum.quoteRename', q, { title })).call('set_title', { ...q.target, title })
}

function renameText(c: Clause): string {
  const quoted = c.findLiteral('quoted')
  if (quoted >= 0) {
    c.use(quoted)
    return c.atoms[quoted].lit!.raw
  }
  let last = -1
  for (const i of c.used) if (i > last) last = i
  let from = last + 1
  while (from < c.to && (c.is(from, 'trg.to') || c.isFiller(from) || c.punct(from, ':'))) from++
  const text = c.freeText(from, { stop: (k) => c.isPrefix(k, 'act.') })
  c.use(text.atoms)
  for (let k = last + 1; k < from; k++) c.use(k)
  return text.text
}

const quoteDupDel: Matcher = (c, g) => {
  const qi = at(c, 'obj.quote')
  if (qi < 0) return null
  const dup = at(c, 'act.duplicate')
  const del = at(c, 'act.remove')
  if (dup < 0 && del < 0) return null
  const isDup = dup >= 0 && (del < 0 || dup < del)
  c.use(isDup ? dup : del)
  const b = new Build(isDup ? 'quote.duplicate' : 'quote.delete', 3)
  const q = resolveQuote(c, g, b, { require: true })
  if (!q) return b
  b.fill('quote')
  b.part(quoteSum(g, isDup ? 'sum.quoteDuplicate' : 'sum.quoteDelete', q))
  const target = q.current && g.ctx.quoteId ? { quoteId: g.ctx.quoteId } : q.target
  return isDup ? b.call('duplicate_quote', target) : b.call('delete_quote', target)
}

// ── Clientes ────────────────────────────────────────────────────────────────

/** Correo, teléfono y RUT rotulados o sueltos. */
function contactInfo(c: Clause): { email?: string; phone?: string; rut?: string } {
  const out: { email?: string; phone?: string; rut?: string } = {}
  const email = c.findLiteral('email')
  if (email >= 0) {
    out.email = c.atoms[email].lit!.raw
    c.use(email)
  }
  const phone = c.findLiteral('phone')
  if (phone >= 0) {
    out.phone = c.atoms[phone].lit!.raw
    c.use(phone)
  }
  const rut = c.find('obj.rut')
  if (rut >= 0) {
    c.use(rut)
    let k = rut + 1
    while (k < c.to && c.punct(k, ':')) k++
    const start = k
    while (k < c.to && (c.atoms[k].num || c.punct(k, '-.') || /^[kK]$/.test(c.raw(k)))) k++
    if (k > start) {
      out.rut = c.rawRange(start, k).replace(/\s+/g, '')
      for (let j = start; j < k; j++) c.use(j)
    }
  }
  useConcepts(c, 'obj.phone', 'obj.email', 'chn.email')
  return out
}

const clientCreate: Matcher = (c, g) => {
  const ci = at(c, 'obj.client')
  const create = at(c, 'act.create')
  if (ci < 0 || create < 0) return null
  if (c.has('obj.quote') && c.find('obj.quote') < ci) return null
  c.use(ci, create)
  useConcepts(c, 'act.create', 'trg.named', 'obj.name')
  const b = new Build('client.create', 3.2)
  const contact = contactInfo(c)
  const who = resolveClient(c, g, ci + 1, { stop: (k) => c.punct(k, ',') })
  if (!who) {
    if (contact.email || contact.phone) return b.need(slot(g, 'name'))
    return null // sin nombre ni datos: el formulario (dialog) lo resuelve
  }
  b.fill('name')
  const name = who.name
  return b.part(tr(g, 'sum.clientCreate', { name })).call('create_client', { name, ...contact })
}

const clientFind: Matcher = (c, g) => {
  const search = at(c, 'act.search')
  const open = at(c, 'act.open', 'act.go', 'act.show', 'act.select')
  const ci = at(c, 'obj.client')
  const ent = c.findEntity('client')
  if (search < 0 && open < 0) return null
  if (ci < 0 && !ent && !(search >= 0 && c.findLiteral('quoted') >= 0)) return null
  if (c.has('obj.quote')) return null
  const isSearch = search >= 0 && (open < 0 || search < open)
  c.use(isSearch ? search : open)
  if (ci >= 0) c.use(ci)
  useConcepts(c, 'trg.named', 'obj.name')
  const b = new Build(isSearch ? 'client.search' : 'client.open', 3)
  const who = resolveClient(c, g, ci >= 0 ? ci + 1 : c.from)
  if (!who) {
    // «ve a clientes»: la sección, no un cliente (salvo «el cliente llamado…»).
    if (!isSearch && c.has('nav.clients') && !c.has('trg.named')) return null
    b.score = 2.5
    return b.need(slot(g, 'client', undefined, clientChoices(g, g.bundle.index.lists.client)))
  }
  b.fill('client')
  if (!isSearch && who.clientId && !who.choices) return b.part(tr(g, 'sum.clientOpen', { name: who.name })).call('open_client', { clientId: who.clientId })
  if (!isSearch && who.choices?.length) return b.ambiguous(slot(g, 'client', undefined, clientChoices(g, who.choices)))
  b.command = 'client.search'
  const query = who.partial ?? (who.clientId ? who.name : who.name)
  return b.part(tr(g, 'sum.searchClients', { query })).call('search', { query, kind: 'clients' })
}

const quoteClient: Matcher = (c, g) => {
  const ci = at(c, 'obj.client', 'trg.for')
  if (ci < 0) return null
  const remove = at(c, 'act.remove', 'mod.without')
  const verb = at(c, 'act.assign', ...CHANGE_VERBS)
  if (c.has('act.create') || c.has('act.search')) return null
  if (remove >= 0 && c.has('obj.client')) {
    useConcepts(c, 'act.remove', 'mod.without', 'obj.client')
    const b = new Build('quote.clear_client', 3)
    const q = resolveQuote(c, g, b, { require: true })
    if (!q) return b
    return b.part(quoteSum(g, 'sum.quoteClearClient', q)).call('set_client', { ...q.target, clear: true })
  }
  const verbless = verb < 0
  if (verbless && (!g.ctx.quoteOpen || !c.has('obj.client'))) return null
  if (!verbless) c.use(verb)
  useConcepts(c, 'act.assign')
  c.use(ci)
  const b = new Build('quote.assign_client', verbless ? 2 : 3)
  const contact = contactInfo(c)
  const q = resolveQuote(c, g, b, { require: true })
  const who = resolveClient(c, g, ci + 1)
  if (!who) return b.need(slot(g, 'client', undefined, clientChoices(g, g.bundle.index.lists.client)))
  b.fill('client')
  if (who.choices?.length && (!who.clientId || who.fuzzy)) {
    b.ambiguous(slot(g, 'client', undefined, clientChoices(g, who.choices)))
  } else if (who.partial) b.assume(tr(g, 'assume.partialClient', { word: who.partial, client: who.name }))
  else if (!who.clientId && g.bundle.index.lists.client.length) b.assume(tr(g, 'assume.newClient', { client: who.name }))
  if (!q) return b
  const args = { ...q.target, ...(who.clientId ? { clientId: who.clientId } : {}), name: who.name, ...contact }
  return b.part(quoteSum(g, 'sum.quoteClient', q, { client: who.name })).call('set_client', args)
}

// ── Descuento, margen, notas ────────────────────────────────────────────────

const pricing: Matcher = (c, g) => {
  const di = at(c, 'obj.discount')
  const mi = at(c, 'obj.margin', 'obj.markup')
  const lonePct = di < 0 && mi < 0 && g.ctx.quoteOpen && c.meaningful().length <= 2 ? c.percent() : null
  if (di < 0 && mi < 0 && !lonePct) return null
  const isMargin = mi >= 0 && (di < 0 || mi < di)
  const markup = isMargin && c.is(mi, 'obj.markup')
  const objAt = isMargin ? mi : di
  const command = isMargin ? 'quote.margin' : 'quote.discount'
  const verb = at(c, ...CHANGE_VERBS, 'act.add', 'act.remove')
  if (objAt >= 0) c.use(objAt)
  useConcepts(c, ...CHANGE_VERBS, 'act.add', 'unit.pct')
  const b = new Build(command, (verb >= 0 ? 3 : 2.4) + (lonePct ? -0.6 : 0))
  // «quita el descuento»
  if (!isMargin && c.has('act.remove')) {
    useConcepts(c, 'act.remove', 'mod.without')
    const q = resolveQuote(c, g, b, { require: true })
    if (!q) return b
    return b.part(quoteSum(g, 'sum.discountRemove', q)).call('set_discount', { ...q.target, percent: 0 })
  }
  if (c.has('act.remove')) return null
  const q = resolveQuote(c, g, b, { require: true })
  const pct = lonePct ?? c.percent()
  let value: number | undefined
  if (pct) {
    c.use(pct.atoms)
    value = pct.value
  } else {
    const loose = c.loosePercent(objAt >= 0 ? objAt : c.from - 1)
    if (loose) {
      c.use(loose.atoms)
      if ('amount' in loose) {
        b.fail(tr(g, 'reply.discountAmount'))
        return b.fill('percent')
      }
      value = loose.value
    }
  }
  if (value === undefined) return b.need(slot(g, 'percent', undefined, percentChoices(g, isMargin ? [25, 30, 35] : [5, 10, 15])))
  b.fill('percent')
  if (!(value >= 0) || value > (markup ? 1000 : 100) || (isMargin && !markup && value >= 100)) {
    return b.fail(tr(g, isMargin && !markup ? 'reply.marginRange' : 'reply.percentRange'))
  }
  if (!q) return b
  if (isMargin) return b.part(quoteSum(g, markup ? 'sum.markup' : 'sum.margin', q, { pct: fmt.pct(g, value) })).call('set_margin', { ...q.target, percent: value, mode: markup ? 'markup' : 'margin' })
  return b.part(quoteSum(g, 'sum.discount', q, { pct: fmt.pct(g, value) })).call('set_discount', { ...q.target, percent: value })
}

const notes: Matcher = (c, g) => {
  const ni = at(c, 'obj.notes')
  if (ni < 0) return null
  const verb = at(c, ...CHANGE_VERBS, 'act.add', 'act.create', 'act.remove')
  const first = c.meaningful()[0]
  if (verb < 0 && first !== ni) return null
  // «agrega una nota: …», «nota: …», turco «not ekle: …» (verbo y dos puntos tras el sustantivo).
  if (verb >= 0 && verb > ni && !c.punct(ni + 1, ':') && !c.punct(verb + 1, ':') && verb !== c.to - 1) return null
  c.use(ni)
  if (verb >= 0) c.use(verb)
  const b = new Build('quote.notes', 3)
  const q = resolveQuote(c, g, b, { require: true })
  if (c.has('act.remove')) {
    useConcepts(c, 'act.remove')
    if (!q) return b
    return b.part(quoteSum(g, 'sum.notes', q, { text: '' })).call('set_quote_notes', { ...q.target, text: '' })
  }
  let from = (verb > ni ? verb : ni) + 1
  while (from < c.to && (c.punct(from, ':,-') || (c.atoms[from].e - c.atoms[from].s === 1 && COMPLEMENTIZERS.has(c.an.tokens[c.atoms[from].s].fold)))) from++
  const quoted = c.findLiteral('quoted', from)
  let text = ''
  if (quoted >= 0) {
    text = c.atoms[quoted].lit!.raw
    c.use(quoted)
  } else if (from < c.to) {
    text = c.rawRange(from, c.to).trim().replace(/[.!]+$/, '')
    for (let k = from; k < c.to; k++) {
      c.use(k)
      c.textAtoms.add(k)
    }
  }
  for (let k = ni + 1; k < from; k++) c.use(k)
  if (!text) return b.need(slot(g, 'text'))
  b.fill('text')
  if (!q) return b
  return b.part(quoteSum(g, 'sum.notes', q, { text })).call('set_quote_notes', { ...q.target, text: text.slice(0, 4000) })
}

// ── Idioma, tema, moneda ────────────────────────────────────────────────────

const languages: Matcher = (c, g) => {
  const lang = readLocale(c)
  const li = at(c, 'obj.language')
  if (!lang && li < 0) return null
  const verb = at(c, ...CHANGE_VERBS, 'act.switch', 'act.go')
  const docAt = at(c, 'obj.document', 'obj.pdf', 'obj.quote', 'obj.template')
  const isDefault = c.has('scp.default')
  if (!lang) {
    if (verb < 0 && (li < 0 || (docAt < 0 && !isDefault))) return null
    c.use(li)
    if (verb >= 0) c.use(verb)
    const b = new Build(docAt >= 0 ? (isDefault ? 'settings.doc_locale' : 'quote.locale') : 'settings.ui_locale', 2.5)
    useConcepts(c, 'obj.document', 'obj.pdf', 'obj.quote', 'scp.default', 'obj.settings')
    return b.need(slot(g, 'locale', undefined, localeChoices(g)))
  }
  if (verb < 0 && li < 0 && docAt < 0) return null
  c.use(lang.i)
  if (li >= 0) c.use(li)
  if (verb >= 0) c.use(verb)
  useConcepts(c, ...CHANGE_VERBS, 'act.switch', 'act.go', 'obj.settings')
  const language = languageName(g.locale, lang.locale)
  if (docAt >= 0 && isDefault) {
    useConcepts(c, 'obj.document', 'obj.pdf', 'obj.quote', 'obj.template', 'scp.default')
    return new Build('settings.doc_locale', 3.2).fill('locale').part(tr(g, 'sum.defaultDocLocale', { language })).call('update_settings', { document_locale: lang.locale })
  }
  if (docAt >= 0) {
    useConcepts(c, 'obj.document', 'obj.pdf', 'obj.template')
    const b = new Build('quote.locale', 3.2).fill('locale')
    const q = resolveQuote(c, g, b, { require: true })
    if (!q) return b
    return b.part(quoteSum(g, 'sum.docLocale', q, { language })).call('set_quote_locale', { ...q.target, locale: lang.locale })
  }
  return new Build('settings.ui_locale', 3).fill('locale').part(tr(g, 'sum.uiLocale', { language })).call('set_ui_locale', { locale: lang.locale })
}

const THEMES = [
  ['thm.dark', 'dark'],
  ['thm.light', 'light'],
  ['thm.system', 'system'],
] as const

const theme: Matcher = (c, g) => {
  const obj = at(c, 'obj.theme', 'obj.mode')
  const verb = at(c, ...CHANGE_VERBS, 'act.switch', 'act.go')
  let pick: { i: number; theme: 'dark' | 'light' | 'system' } | null = null
  for (const [concept, value] of THEMES) {
    const i = c.find(concept)
    if (i >= 0) {
      pick = { i, theme: value }
      break
    }
  }
  if (c.hasPrefix('col.') || c.has('obj.color')) return null
  if (!pick) {
    if (!c.has('obj.theme') || verb < 0) return null
    useConcepts(c, 'obj.theme', ...CHANGE_VERBS, 'act.switch', 'act.go')
    const choices = THEMES.map(([concept, value], i) => appendChoice(g, 'theme', tr(g, `theme.${value}`), surface(g, concept), { id: value, score: 1 - i * 0.01 }))
    return new Build('settings.theme', 2.5).need(slot(g, 'theme', undefined, choices))
  }
  // «dark mode», «modo oscuro» (frase completa) bastan solos; «oscuro» suelto no (puede ser un color).
  if (obj < 0 && verb < 0 && c.atoms[pick.i].e - c.atoms[pick.i].s < 2) return null
  // «modo supervisado» es del asistente; «modo oscuro», del tema.
  if (obj >= 0 && c.is(obj, 'obj.mode') && c.hasPrefix('mde.')) return null
  c.use(pick.i)
  useConcepts(c, 'obj.theme', 'obj.mode', ...CHANGE_VERBS, 'act.switch', 'act.go')
  return new Build('settings.theme', 3).fill('theme').part(tr(g, 'sum.theme', { theme: tr(g, `theme.${pick.theme}`) })).call('set_theme', { theme: pick.theme })
}

const CURRENCIES: Record<string, string> = {
  clp: 'CLP',
  'pesos chilenos': 'CLP',
  'peso chileno': 'CLP',
  pesos: 'CLP',
  usd: 'USD',
  dolar: 'USD',
  dolares: 'USD',
  dollar: 'USD',
  dollars: 'USD',
  'dolares americanos': 'USD',
  eur: 'EUR',
  euro: 'EUR',
  euros: 'EUR',
  brl: 'BRL',
  real: 'BRL',
  reais: 'BRL',
  reales: 'BRL',
  try: 'TRY',
  lira: 'TRY',
  liras: 'TRY',
  'turk lirasi': 'TRY',
  tl: 'TRY',
  gbp: 'GBP',
  libras: 'GBP',
  pounds: 'GBP',
  mxn: 'MXN',
  ars: 'ARS',
  pen: 'PEN',
  soles: 'PEN',
  cop: 'COP',
  uyu: 'UYU',
  chf: 'CHF',
  franken: 'CHF',
  cad: 'CAD',
  aud: 'AUD',
}

const currency: Matcher = (c, g) => {
  const ci = at(c, 'obj.currency')
  if (ci < 0) return null
  const verb = at(c, ...CHANGE_VERBS)
  c.use(ci)
  if (verb >= 0) c.use(verb)
  useConcepts(c, ...CHANGE_VERBS, 'scp.default')
  const b = new Build('settings.currency', verb >= 0 ? 3 : 2.2)
  for (let i = ci + 1; i < c.to; i++) {
    const two = i + 1 < c.to ? `${c.fold(i)} ${c.fold(i + 1)}` : ''
    const code = CURRENCIES[two] ?? CURRENCIES[c.fold(i)]
    if (code) {
      c.use(i)
      if (CURRENCIES[two]) c.use(i + 1)
      return b.fill('text').part(tr(g, 'sum.currency', { currency: code })).call('update_settings', { currency: code })
    }
  }
  return b.need({ kind: 'text', label: tr(g, 'slot.text'), prompt: tr(g, 'prompt.currency') })
}

// ── Asistentes ──────────────────────────────────────────────────────────────

const MODES = [
  ['mde.chat', 'chat'],
  ['mde.supervised', 'supervised'],
  ['mde.full', 'full'],
] as const

const assistants: Matcher = (c, g) => {
  if (c.has('act.create') && c.has('obj.conversation')) {
    useConcepts(c, 'act.create', 'obj.conversation')
    return new Build('assistant.new_conversation', 3).part(tr(g, 'sum.newConversation')).call('new_conversation', {})
  }
  let mode: { i: number; mode: AssistantMode } | null = null
  for (const [concept, value] of MODES) {
    const i = c.find(concept)
    if (i >= 0) {
      mode = { i, mode: value }
      break
    }
  }
  const switchVerb = at(c, 'act.switch')
  const obj = at(c, 'obj.assistant')
  // «switch to the theme…», «cambia a inglés»: otro ajuste.
  if (c.has('obj.theme') || c.has('obj.language') || c.hasPrefix('lang.') || c.hasPrefix('thm.') || c.has('obj.currency')) return null
  if (mode) {
    const verb = at(c, ...CHANGE_VERBS, 'act.go', 'act.switch')
    const explicit = c.has('obj.mode') || c.atoms[mode.i].e - c.atoms[mode.i].s > 1 || verb >= 0
    if (!explicit) return null
    if (c.hasPrefix('thm.')) return null
    c.use(mode.i)
    useConcepts(c, 'obj.mode', 'obj.assistant', ...CHANGE_VERBS, 'act.go', 'act.switch')
    return new Build('assistant.mode', 3).fill('mode').part(tr(g, 'sum.assistantMode', { mode: tr(g, `mode.${mode.mode}`) })).call('set_assistant_mode', { mode: mode.mode })
  }
  if (c.has('obj.mode') && !c.hasPrefix('thm.') && at(c, ...CHANGE_VERBS, 'act.go', 'act.switch') >= 0) {
    useConcepts(c, 'obj.mode', 'obj.assistant', ...CHANGE_VERBS, 'act.go', 'act.switch')
    const choices = MODES.map(([concept, value], i) => appendChoice(g, 'mode', tr(g, `mode.${value}`), surface(g, concept), { id: value, score: 1 - i * 0.01 }))
    return new Build('assistant.mode', 2.5).need(slot(g, 'mode', undefined, choices))
  }
  if (switchVerb < 0 && !(obj >= 0 && at(c, ...CHANGE_VERBS, 'act.go') >= 0)) return null
  if (c.has('obj.mode')) {
    useConcepts(c, 'obj.mode', 'obj.assistant', ...CHANGE_VERBS, 'act.switch')
    const choices = MODES.map(([concept, value], i) => appendChoice(g, 'mode', tr(g, `mode.${value}`), surface(g, concept), { id: value, score: 1 - i * 0.01 }))
    return new Build('assistant.mode', 2.5).need(slot(g, 'mode', undefined, choices))
  }
  useConcepts(c, 'act.switch', 'obj.assistant', ...CHANGE_VERBS, 'act.go')
  const b = new Build('assistant.switch', switchVerb >= 0 ? 3 : 2.5)
  const who = resolveAssistant(c, g, Math.max(switchVerb, obj) + 1)
  const choices = g.bundle.index.lists.assistant.map((e, i) => appendChoice(g, 'assistant', e.name, e.name, { id: e.id, score: 1 - i * 0.01 }))
  if (!who) return b.need(slot(g, 'assistant', undefined, choices))
  b.fill('assistant')
  if (!who.assistantId) return b.ambiguous(slot(g, 'assistant', undefined, choices))
  return b.part(tr(g, 'sum.assistantSwitch', { name: who.name })).call('switch_assistant', { assistantId: who.assistantId })
}

// ── Estado, envío, documentos ───────────────────────────────────────────────

const STATUSES: readonly [string, QuoteStatus][] = [
  ['qst.accepted', 'accepted'],
  ['qst.rejected', 'rejected'],
  ['qst.sent', 'sent'],
  ['qst.draft', 'draft'],
]

const quoteStatus: Matcher = (c, g) => {
  let pick: { i: number; status: QuoteStatus } | null = null
  for (const [concept, status] of STATUSES) {
    const i = c.find(concept)
    if (i >= 0) {
      pick = { i, status }
      break
    }
  }
  const verb = at(c, 'act.mark', ...CHANGE_VERBS)
  if (verb < 0) return null
  if (!pick) {
    if (!c.is(verb, 'act.mark') || (!c.has('obj.status') && c.meaningful().length > 2)) return null
  }
  if (c.hasPrefix('stat.') || c.hasPrefix('col.') || c.hasPrefix('fam.')) return null
  c.use(verb)
  useConcepts(c, 'act.mark', 'obj.status', ...CHANGE_VERBS)
  const b = new Build('quote.status', 3)
  const q = resolveQuote(c, g, b, { require: true })
  if (!pick) {
    const choices = STATUSES.map(([, s], i) => appendChoice(g, 'value', g.glossary.quoteStatusLabel(s, g.locale), inline(g.glossary.quoteStatusLabel(s, g.inputLocale), g.inputLocale), { id: s, score: 1 - i * 0.01 }))
    return b.need(slot(g, 'status', undefined, choices))
  }
  c.use(pick.i)
  b.fill('status')
  if (!q) return b
  const target = q.current && g.ctx.quoteId ? { quoteId: g.ctx.quoteId } : q.target
  return b.part(quoteSum(g, 'sum.status', q, { status: inline(g.glossary.quoteStatusLabel(pick.status, g.locale), g.locale) })).call('set_quote_status', { ...target, status: pick.status })
}

const send: Matcher = (c, g) => {
  const verb = at(c, 'act.send')
  if (verb < 0) return null
  if (c.has('obj.workshop') || c.has('obj.work_order') || c.has('nav.workshop')) return null
  const hasObject = c.has('obj.quote') || c.hasPrefix('chn.') || c.findLiteral('email') >= 0 || c.findLiteral('phone') >= 0 || c.findLiteral('hash') >= 0 || c.has('obj.pdf') || c.has('obj.document') || c.has('scp.this')
  if (!hasObject && c.meaningful().length > 1) return null
  c.use(verb)
  const b = new Build('quote.send', 3)
  const q = resolveQuote(c, g, b, { require: true })
  const args: { channel?: 'email' | 'whatsapp' | 'link'; to?: string } = {}
  const email = c.findLiteral('email')
  const phone = c.findLiteral('phone')
  if (c.has('chn.whatsapp')) args.channel = 'whatsapp'
  else if (c.has('chn.link') || c.has('obj.link')) args.channel = 'link'
  else if (c.has('chn.email') || c.has('obj.email') || email >= 0) args.channel = 'email'
  else if (phone >= 0) args.channel = 'whatsapp'
  if (email >= 0 && args.channel === 'email') {
    args.to = c.atoms[email].lit!.raw
    c.use(email)
  } else if (phone >= 0 && args.channel === 'whatsapp') {
    args.to = c.atoms[phone].lit!.raw
    c.use(phone)
  }
  useConcepts(c, 'chn.', 'obj.email', 'obj.link', 'obj.pdf', 'obj.document')
  // «a su cliente», «a la clienta»: el destinatario es el cliente de la cotización.
  const client = useConcepts(c, 'obj.client')
  if (client.length) b.assume(tr(g, 'assume.quoteClient'))
  for (let i = c.from; i < c.to; i++) if (!c.used.has(i) && c.entityAt(i, 'client').length) c.use(i)
  // Documento en otro idioma: «envíala en inglés».
  const lang = readLocale(c)
  if (!q) return b
  b.fill('quote')
  if (lang) {
    c.use(lang.i)
    b.call('set_quote_locale', { ...q.target, locale: lang.locale }).part(quoteSum(g, 'sum.docLocale', q, { language: languageName(g.locale, lang.locale) }))
  }
  const channelText = args.channel === 'email' ? tr(g, 'sum.sendEmail') : args.channel === 'whatsapp' ? tr(g, 'sum.sendWhatsapp') : args.channel === 'link' ? tr(g, 'sum.sendLink') : ''
  b.part([quoteSum(g, 'sum.send', q), channelText, args.to ? tr(g, 'sum.sendTo', { to: args.to }) : ''].filter(Boolean).join(' '))
  const target = q.current && g.ctx.quoteId ? { quoteId: g.ctx.quoteId } : q.target
  return b.call('send_quote', { ...target, ...args })
}

const documents: Matcher = (c, g) => {
  const share = at(c, 'act.share')
  const print = at(c, 'act.print')
  const pdf = at(c, 'obj.pdf')
  const link = at(c, 'obj.link')
  const doc = at(c, 'obj.document')
  const design = at(c, 'obj.design')
  const download = at(c, 'act.download', 'act.export')
  const showVerb = at(c, 'act.show', 'act.open', 'act.go')
  let command: NluCommandId | null = null
  let score = 3
  if (share >= 0 || (link >= 0 && at(c, 'act.create', 'act.show', 'act.duplicate', 'act.send') >= 0)) command = 'quote.share'
  else if (print >= 0) command = 'quote.print'
  else if (pdf >= 0 && (download >= 0 || at(c, 'act.create', 'act.want') >= 0 || c.meaningful().length <= 2)) command = 'quote.pdf'
  else if (pdf >= 0 && showVerb >= 0) command = 'quote.preview'
  else if (doc >= 0 && (showVerb >= 0 || c.meaningful().length <= 2) && !c.has('obj.language') && !c.hasPrefix('lang.')) command = 'quote.preview'
  else if (design >= 0 && (showVerb >= 0 || at(c, 'act.change') >= 0 || c.meaningful().length <= 2)) command = 'quote.design'
  if (!command) return null
  if (c.has('obj.language') || c.hasPrefix('lang.')) return null
  // «va aux documents», «ve a documentos»: la sección Documentos, no la vista previa.
  if (command === 'quote.preview' && doc >= 0 && c.is(doc, 'nav.documents') && at(c, 'act.go') >= 0) return null
  if (pdf < 0 && doc < 0 && link < 0 && share < 0 && print < 0 && design < 0) score = 2
  useConcepts(c, 'act.share', 'act.print', 'obj.pdf', 'obj.link', 'obj.document', 'obj.design', 'act.download', 'act.export', 'act.show', 'act.open', 'act.go', 'act.create', 'act.change', 'obj.file')
  const b = new Build(command, score)
  if (command === 'quote.preview') return b.part(tr(g, 'sum.preview')).call('show_document', { view: 'document' })
  if (command === 'quote.design') return b.part(tr(g, 'sum.design')).call('show_document', { view: 'design' })
  const q = resolveQuote(c, g, b, { require: true })
  if (!q) return b
  b.fill('quote')
  const target = q.current && g.ctx.quoteId ? { quoteId: g.ctx.quoteId } : q.target
  if (command === 'quote.share') return b.part(quoteSum(g, 'sum.share', q)).call('share_quote_link', target)
  if (command === 'quote.print') return b.part(quoteSum(g, 'sum.print', q)).call('download_pdf', { ...target, print: true })
  return b.part(quoteSum(g, 'sum.pdf', q)).call('download_pdf', target)
}

const explain: Matcher = (c, g) => {
  const verb = at(c, 'act.explain')
  const why = at(c, 'q.why')
  const price = at(c, 'obj.price', 'obj.total')
  const howMuch = at(c, 'stat.how_much')
  // «precio de la V1», «dime el precio de la V1», «¿cuál es el precio de la V2?»: la ventana con su precio.
  const shorthand = verb < 0 && why < 0 && price >= 0 && c.findLiteral('vref') >= 0 && !c.hasPrefix('fam.') && !c.has('obj.window') && (at(c, 'act.show') >= 0 || at(c, 'q.what') >= 0 || c.meaningful().length <= 4)
  // «¿por qué sale tan cara?», «¿cuánto sale?», «explícame el precio».
  if (verb < 0 && !shorthand && !(why >= 0 && price >= 0) && !(howMuch >= 0 && price >= 0 && !c.hasPrefix('fam.') && !c.has('obj.window'))) return null
  if (howMuch >= 0) c.use(howMuch)
  if (verb >= 0 && price < 0 && !c.has('obj.quote') && c.findLiteral('vref') < 0 && c.meaningful().length > 1) return null
  useConcepts(c, 'act.explain', 'q.why', 'obj.price', 'obj.total', 'obj.quote', 'scp.this', ...(shorthand ? ['act.show', 'q.what'] : []))
  const b = new Build('quote.explain_price', 3)
  const ref = c.findLiteral('vref') >= 0 || c.has('obj.item') ? resolveItems(c, g, b, { allowAll: false, single: true }) : null
  if (ref?.target.ref) return b.part(tr(g, 'sum.explainItem', { item: ref.label })).call('explain_price', { ref: ref.target.ref })
  const q = resolveQuote(c, g, b, { require: true })
  if (!q) return b
  return b.part(quoteSum(g, 'sum.explain', q)).call('explain_price', { ...q.target })
}

const workshop: Matcher = (c, g) => {
  const wo = at(c, 'obj.work_order')
  const ws = at(c, 'obj.workshop', 'nav.workshop')
  if (wo < 0 && ws < 0) return null
  const verb = at(c, 'act.send', 'act.create', 'act.change', 'act.go')
  if (verb < 0) return null
  // «ve al taller» = navegar; «pasa esta cotización a taller», «manda a producción», «crea la OT» = orden.
  if (c.is(verb, 'act.go') && wo < 0 && !c.has('obj.quote') && !c.has('scp.this') && !c.has('act.send')) return null
  if (c.is(verb, 'act.create') && wo < 0) return null
  useConcepts(c, 'obj.work_order', 'obj.workshop', 'nav.workshop', 'act.send', 'act.create', 'act.change', 'act.go')
  const b = new Build('quote.to_workshop', 3.2)
  const q = resolveQuote(c, g, b, { require: true })
  if (!q) return b
  const target = q.current && g.ctx.quoteId ? { quoteId: g.ctx.quoteId } : q.target
  return b.part(quoteSum(g, 'sum.workshop', q)).call('create_work_order', target)
}

const search: Matcher = (c, g) => {
  const verb = at(c, 'act.search')
  if (verb < 0) return null
  if (c.has('obj.client')) return null
  c.use(verb)
  const qi = at(c, 'obj.quote')
  const b = new Build('quote.search', qi >= 0 ? 3 : 2.2)
  if (qi >= 0) c.use(qi)
  useConcepts(c, 'obj.quote', 'nav.quotes')
  const quoted = c.findLiteral('quoted')
  let query = ''
  if (quoted >= 0) {
    query = c.atoms[quoted].lit!.raw
    c.use(quoted)
  } else {
    let from = Math.max(verb, qi) + 1
    while (from < c.to && (c.isFiller(from) || c.is(from, 'trg.for'))) from++
    const text = c.freeText(from, { stop: (k) => c.isPrefix(k, 'act.') })
    if (text.text) {
      query = cleanQuery(text.text)
      c.use(text.atoms)
      for (let k = Math.max(verb, qi) + 1; k < from; k++) c.use(k)
    } else {
      // Verbo al final (turco): «Pérez teklifini ara».
      const end = Math.min(verb, qi >= 0 ? qi : verb)
      const before = c.freeText(c.from, { stop: (k) => k >= end || c.isPrefix(k, 'act.') })
      if (before.text) {
        query = cleanQuery(before.text)
        c.use(before.atoms)
      }
    }
  }
  if (!query) return b.need(slot(g, 'text'))
  b.fill('text')
  const kind = qi >= 0 ? 'quotes' : 'all'
  return b.part(tr(g, kind === 'quotes' ? 'sum.searchQuotes' : 'sum.searchAll', { query })).call('search', { query, kind })
}

// ── Ventanas de la cotización abierta ───────────────────────────────────────

function needOpenQuote(g: GEnv, b: Build): void {
  b.need(slot(g, 'quote', undefined, recentQuoteChoices(g)))
}

const itemAdd: Matcher = (c, g, inherit) => {
  const addVerb = at(c, 'act.add', 'act.want')
  const createVerb = at(c, 'act.create')
  const putVerb = at(c, 'act.put')
  const hasFam = c.hasPrefix('fam.') || c.hasPrefix('asm.')
  const product = at(c, 'obj.window', 'obj.door')
  if (!hasFam && product < 0 && addVerb < 0) return null
  // «agrega una V3»: la próxima ventana (la referencia es su nombre, no un ítem existente).
  const vref = c.findLiteral('vref')
  let newRef = -1
  if (vref >= 0) {
    const p = c.prev(vref, false)
    const article = p >= 0 && ((c.atoms[p].num?.weak && c.atoms[p].num?.value === 1) || c.is(p, 'scp.other'))
    if (addVerb < 0 || !article || c.has('scp.same')) return null
    newRef = vref
  }
  if (c.has('obj.quote') || c.has('obj.client') || c.has('obj.template') || c.has('obj.notes') || c.has('obj.discount')) return null
  const otherVerbs = c.withPrefix('act.').filter((v) => !['act.add', 'act.want', 'act.create', 'act.put', 'act.set'].includes(v.c))
  // «pon una corredera…» agrega; «ponle nogal» cambia (lo decide la gramática de cambios).
  const putAdds = putVerb >= 0 && hasFam && !c.has('scp.all')
  const createAdds = createVerb >= 0 && (hasFam || product >= 0)
  const verbal = addVerb >= 0 || putAdds || createAdds || inherit === 'item.add'
  const question = c.isQuestion()
  const shorthand = !verbal && hasFam && !otherVerbs.length && (!question || !!g.howTo) && !c.has('scp.all')
  if (!verbal && !shorthand) return null
  if (verbal && otherVerbs.length && addVerb < 0 && inherit !== 'item.add') return null
  if (question && !c.has('q.can') && !g.howTo) return null
  useConcepts(c, 'act.add', 'act.want', 'act.put', 'act.create', 'scp.other')
  if (newRef >= 0) c.use(newRef)
  const b = new Build('item.add', verbal ? 3.2 : 2)
  const spec = windowSpec(c, g, b, 'add')
  // «la hoja derecha abatible» habla de una ventana existente.
  if (spec.pane) return null
  useConcepts(c, 'obj.window', 'obj.door')
  if (!spec.hasTypology && !spec.changed && !hasFam && product < 0 && newRef < 0) {
    // «agrega una …» todavía sin producto: falta la tipología.
    if (addVerb < 0 || c.meaningful().some((i) => !c.used.has(i))) return null
    b.score = 2.4
  }
  if (spec.args.typology || spec.assembly) {
    b.part(tr(g, 'sum.add', { what: inline(spec.typologyLabel ?? '', g.locale) }))
  } else {
    b.part(tr(g, 'sum.addWindow'))
    // «una ventana de 120 x 150»: con medidas se arma con el tipo por defecto del catálogo (como en v4).
    if (spec.hasMeasure && !b.missing.some((m) => m.kind === 'panels')) b.assume(tr(g, 'assume.defaultTypology'))
    else if (!b.missing.some((m) => m.kind === 'panels')) b.need(slot(g, 'typology', undefined, typologyChoices(g)))
  }
  for (const p of spec.parts) b.part(p)
  b.score += Math.min(1, spec.parts.length * 0.15) + (spec.hasMeasure ? 0.3 : 0)
  if (!spec.hasMeasure && (spec.args.typology || spec.assembly)) {
    if (shorthand) b.need(slot(g, 'size', undefined, [appendChoice(g, 'hint', tr(g, 'prompt.sizeHint'), '')]))
    else b.assume(tr(g, 'assume.defaultSize'))
  }
  if (!g.ctx.quoteOpen) {
    if (shorthand) {
      needOpenQuote(g, b)
      b.repair(tr(g, 'repair.newQuote'), `${surface(g, 'act.add')} ${g.text.trim()}`)
      return b
    }
    b.assume(tr(g, 'assume.newQuote'))
    b.calls.unshift({ tool: 'create_quote', args: {} })
  }
  return spec.assembly ? b.call('add_assembly', assemblyArgs(spec)) : b.call('add_window', spec.args)
}

function assemblyArgs(spec: WindowSpec): NluToolArgs['add_assembly'] {
  const { preset, panes } = spec.assembly!
  const { width, height, line, lineId, color, colorId, glass, glassId, location, qty } = spec.args
  const faceted = preset === 'bay' || preset === 'bow'
  return compactArgs({ preset, panes: faceted ? panes : undefined, width, height, line, lineId, color, colorId, glass, glassId, location, qty })
}

function compactArgs<T extends object>(args: T): T {
  return Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined)) as T
}

/** Tipologías frecuentes como opciones cuando falta la tipología. */
const COMMON_TYPOLOGIES: readonly TypologyId[] = ['sliding_2', 'tilt_turn', 'fixed', 'casement', 'sliding_4', 'awning', 'french_tilt_turn', 'door', 'balcony_door', 'sliding_2_fixed']

export function typologyChoices(g: GEnv, list: readonly TypologyId[] = COMMON_TYPOLOGIES): NluSuggestion[] {
  return list.map((id, i) => appendChoice(g, 'typology', g.glossary.typologyName(id, g.locale), typologyInsert(id, g.inputLocale, g.glossary), { id, score: 1 - i * 0.01 }))
}

const itemUpdate: Matcher = (c, g, inherit) => {
  const verb = at(c, ...CHANGE_VERBS, 'act.add', 'act.remove', 'act.mark')
  const hasTarget = c.findLiteral('vref') >= 0 || c.has('scp.all') || c.has('obj.item') || c.hasPrefix('ord.') || c.has('scp.last') || c.has('scp.first')
  // Sin verbo ni referencia («nogal», «marco nogal», «la hoja derecha abatible»): solo con una ventana seleccionada.
  const onSelection = verb < 0 && !hasTarget && !!g.ctx.selectedRef && !c.hasPrefix('act.')
  if (verb < 0 && !hasTarget && !onSelection && inherit !== 'item.update' && inherit !== 'item.bulk') return null
  if (c.has('obj.quote') || c.has('obj.client') || c.has('obj.template') || c.has('obj.discount') || c.has('obj.margin') || c.has('obj.markup') || c.has('obj.notes') || c.has('obj.language') || c.hasPrefix('lang.') || c.has('obj.theme') || c.has('obj.currency')) return null
  if (c.isQuestion() && !c.has('q.can') && !g.howTo) return null
  const isAdd = verb >= 0 && c.is(verb, 'act.add')
  const isRemove = verb >= 0 && c.is(verb, 'act.remove')
  if ((isAdd || isRemove) && !hasTarget && !(isRemove && c.has('mod.without')) && !c.hasPrefix('acc.')) return null
  useConcepts(c, ...CHANGE_VERBS, 'act.add', 'act.mark')
  const b = new Build('item.update', verb >= 0 ? 3 : onSelection ? 2.1 : 2.4)
  const items = resolveItems(c, g, b, { allowAll: true })
  const spec = windowSpec(c, g, b, 'update')
  if (isRemove && !spec.args.extras) return null
  if (isRemove) useConcepts(c, 'act.remove', 'mod.without')
  if (items?.target.all || (items?.target.items?.length ?? 0) > 1) b.command = 'item.bulk'
  // «cambia la V2 a 3 hojas» con la V2 corredera → corredera 3 hojas.
  if (!spec.args.typology && spec.loosePanels && items?.target.ref) {
    const current = g.ctx.items?.find((i) => i.ref.toUpperCase() === items.target.ref!.toUpperCase())?.typology
    const id = typologyFromPanels(current, spec.loosePanels)
    if (id) {
      spec.args.typology = id
      spec.typologyLabel = g.glossary.typologyName(id, g.locale)
      spec.changed = true
    } else spec.args.typology = undefined
  }
  if (!spec.changed) {
    if (verb < 0 && !(c.has('scp.all') || c.findLiteral('vref') >= 0)) return null
    if (verb < 0 && c.meaningful().some((i) => !c.used.has(i))) return null
    b.score -= 1.2
    if (items) b.part(tr(g, 'sum.update', { target: items.label }))
    return b.need(slot(g, 'change'))
  }
  b.score += Math.min(1, spec.parts.length * 0.2)
  b.fill('change')
  if (!items?.explicit) {
    const design: Record<string, unknown> = { ...spec.args }
    delete design.opening
    delete design.pane
    b.merge = { args: design, parts: spec.typologyLabel ? [tr(g, 'sum.typologyTo', { typology: inline(spec.typologyLabel, g.locale) }), ...spec.parts] : spec.parts }
  }
  if (!g.ctx.quoteOpen) {
    needOpenQuote(g, b)
    return b
  }
  if (!items) return b
  b.fill('item')
  b.part(tr(g, 'sum.update', { target: items.label }))
  if (spec.args.typology) b.part(tr(g, 'sum.typologyTo', { typology: inline(spec.typologyLabel ?? spec.args.typology, g.locale) }))
  for (const p of spec.parts) b.part(p)
  const args = { ...items.target, ...spec.args }
  if (args.opening && args.pane === undefined) delete args.opening
  return b.call('update_window', args)
}

/** «une la V1 con la V2», «acopla V1, V2 y V3 arriba»: junta ventanas que ya están en la cotización. */
const itemJoin: Matcher = (c, g) => {
  const verb = at(c, 'act.join')
  if (verb < 0 || c.has('obj.quote') || c.has('obj.client')) return null
  c.use(verb)
  const b = new Build('item.join', 3)
  const pick = c.target({ allowAll: false })
  c.use(pick.atoms)
  const refs = pick.items ?? (pick.ref ? [pick.ref] : [])
  b.pickedItems = refs
  useConcepts(c, 'obj.item', 'obj.window', 'obj.door')
  const side = at(c, 'dir.top') >= 0 ? 'top' : at(c, 'dir.bottom') >= 0 ? 'bottom' : at(c, 'dir.left') >= 0 ? 'left' : undefined
  useConcepts(c, 'dir.top', 'dir.bottom', 'dir.left', 'dir.right')
  if (!g.ctx.quoteOpen) {
    needOpenQuote(g, b)
    return b
  }
  const known = g.ctx.items ? new Set(g.ctx.items.map((i) => i.ref.toUpperCase())) : null
  const missing = known ? refs.find((r) => !known.has(r.toUpperCase())) : undefined
  if (missing) {
    b.fail(tr(g, 'reply.itemMissing', { ref: missing }))
    b.ambiguous(slot(g, 'item', undefined, itemChoices(g, false)))
    return b
  }
  if (refs.length < 2) {
    const taken = new Set(refs.map((r) => r.toUpperCase()))
    b.need(slot(g, 'item', undefined, itemChoices(g, false).filter((choice) => !taken.has(choice.label.toUpperCase()))))
    return b
  }
  b.fill('item')
  b.part(tr(g, 'sum.join', { target: refs.join(', ') }))
  return b.call('join_windows', { items: refs, ...(side ? { side } : {}) })
}

const itemDuplicate: Matcher = (c, g) => {
  const verb = at(c, 'act.duplicate')
  // «otra igual», «agrega una igual a la V1»: duplicar.
  const same = at(c, 'scp.same')
  const sameAdds = same >= 0 && (at(c, 'act.add', 'act.want', 'scp.other') >= 0) && !c.hasPrefix('fam.') && !c.measure()
  if ((verb < 0 && !sameAdds) || c.has('obj.quote') || c.has('obj.link')) return null
  if (verb >= 0) c.use(verb)
  if (sameAdds) useConcepts(c, 'scp.same', 'act.add', 'act.want', 'scp.other', 'obj.window')
  const b = new Build('item.duplicate', 3)
  const items = resolveItems(c, g, b, { allowAll: false, single: true })
  // Copias: «3 veces», «x3», «3 copias».
  let copies: number | undefined
  for (let i = c.from; i < c.to; i++) {
    if (c.used.has(i)) continue
    const v = c.num(i)
    if (v !== undefined && Number.isInteger(v) && v >= 1 && v <= 99 && (c.is(i + 1, 'qty.copies') || c.is(i + 1, 'qty.label') || c.lit(i - 1, 'x'))) {
      copies = v
      c.use(i, c.is(i + 1, 'qty.copies') || c.is(i + 1, 'qty.label') ? i + 1 : i - 1)
      break
    }
  }
  // «twice», «zweimal», «dos veces».
  const twice = at(c, 'qty.twice')
  if (copies === undefined && twice >= 0) {
    copies = 2
    c.use(twice)
  }
  if (!g.ctx.quoteOpen) {
    needOpenQuote(g, b)
    return b
  }
  if (!items) return b
  b.fill('item')
  const target = copies && copies > 1 ? `${items.label} (${tr(g, 'sum.copies', { count: copies })})` : items.label
  b.part(tr(g, 'sum.duplicate', { target }))
  const args: { ref?: string; copies?: number } = {}
  if (items.target.ref) args.ref = items.target.ref
  if (copies && copies > 1) args.copies = copies
  return b.call('duplicate_window', args)
}

const itemRemove: Matcher = (c, g) => {
  const verb = at(c, 'act.remove')
  if (verb < 0) return null
  if (c.has('obj.quote') || c.has('obj.client') || c.has('obj.discount') || c.has('obj.notes') || c.hasPrefix('acc.') || c.has('obj.memory')) return null
  c.use(verb)
  const b = new Build('item.remove', 3)
  const items = resolveItems(c, g, b, { allowAll: true })
  if (!g.ctx.quoteOpen) {
    needOpenQuote(g, b)
    return b
  }
  if (!items) return b
  if (!items.explicit && !g.ctx.selectedRef && !g.ctx.items) {
    return b.need(slot(g, 'item'))
  }
  b.fill('item')
  b.part(tr(g, 'sum.remove', { target: items.label }))
  return b.call('remove_window', items.target)
}

const itemSelect: Matcher = (c, g) => {
  const verb = at(c, ...OPEN_VERBS)
  const select = at(c, 'act.select')
  const bareSelect = select >= 0 && c.meaningful().length === 1
  if (verb < 0 || (c.findLiteral('vref') < 0 && !bareSelect)) return null
  if (c.has('obj.price') || c.has('obj.total')) return null
  c.use(verb)
  if (bareSelect) return new Build('item.select', 2.4).need(slot(g, 'item', undefined, itemChoices(g, false)))
  useConcepts(c, ...OPEN_VERBS)
  const b = new Build('item.select', 2.8)
  const items = resolveItems(c, g, b, { allowAll: false, single: true })
  if (!items?.target.ref) return b
  b.fill('item')
  return b.part(tr(g, 'sum.select', { target: items.label })).call('select_item', { ref: items.target.ref })
}

// ── Catálogo ────────────────────────────────────────────────────────────────

const AVAILABILITY = new Set(['tengo', 'tenemos', 'tienes', 'tiene', 'tienen', 'hay', 'existen', 'manejo', 'manejamos', 'ofrecemos', 'disponibles', 'disponible', 'have', 'got', 'available', 'there', 'offer', 'tenho', 'temos', 'tem', 'ha', 'existem', 'disponiveis', 'ai', 'avons', 'as', 'avez', 'disponible', 'habe', 'haben', 'hast', 'gibt', 'verfugbar', 'ho', 'abbiamo', 'hai', 'ci', 'sono', 'disponibili', 'var', 'mevcut', 'elimde', 'neler'])

const catalogLookup: Matcher = (c, g) => {
  const ask = c.isQuestion() || c.has('act.show') || c.has('act.search')
  if (!ask) return null
  if (c.findLiteral('vref') >= 0 || c.has('obj.quote') || c.hasPrefix('stat.')) return null
  const kinds = [
    ['obj.color', 'colors', 'color'],
    ['obj.glass', 'glass', 'glass'],
    ['obj.line', 'lines', 'line'],
    ['obj.typology', 'typologies', null],
  ] as const
  const lists = g.bundle.index.lists
  for (const [concept, what, type] of kinds) {
    const i = c.find(concept)
    if (i < 0) continue
    c.use(i)
    useConcepts(c, 'q.what', 'act.show', 'act.search', 'obj.catalog', 'nav.catalog', 'q.where')
    for (let k = c.from; k < c.to; k++) if (c.atoms[k].e - c.atoms[k].s === 1 && AVAILABILITY.has(c.an.tokens[c.atoms[k].s].fold)) c.use(k)
    const b = new Build('catalog.lookup', 2.6)
    b.part(tr(g, 'sum.catalog', { what: tr(g, `what.${what}`) }))
    let names: string[]
    if (type) names = lists[type].map((e) => e.name)
    else {
      const ids = new Set<string>()
      for (const l of lists.line) for (const id of l.typologyIds ?? []) ids.add(id)
      names = (ids.size ? [...ids] : [...TYPOLOGY_IDS]).map((id) => g.glossary.typologyName(id, g.locale))
    }
    if (!names.length) return b.answer(capitalize(tr(g, 'reply.catalogEmpty', { what: tr(g, `what.${what}`) }), g.locale))
    const shown = names.slice(0, 12)
    const rest = names.length - shown.length
    const text = rest > 0 ? `${shown.join(', ')} ${tr(g, 'reply.more', { count: rest })}` : shown.join(', ')
    const key = what === 'colors' ? 'reply.catalogColors' : what === 'glass' ? 'reply.catalogGlass' : what === 'lines' ? 'reply.catalogLines' : 'reply.catalogTypologies'
    return b.answer(tr(g, key, { list: text }))
  }
  // «¿tienes nogal?»: un color del léxico o del catálogo, en pregunta y sin nada más.
  if (!c.isQuestion()) return null
  const colorAt = c.withPrefix('col.')[0]
  const colorEnt = c.findEntity('color')
  const idx = colorAt?.i ?? colorEnt?.i
  if (idx === undefined) return null
  c.use(idx)
  for (let k = c.from; k < c.to; k++) if (c.atoms[k].e - c.atoms[k].s === 1 && AVAILABILITY.has(c.an.tokens[c.atoms[k].s].fold)) c.use(k)
  useConcepts(c, 'q.what', 'obj.catalog', 'nav.catalog')
  const b = new Build('catalog.lookup', 2.2).part(tr(g, 'sum.catalog', { what: c.raw(idx) }))
  const found = colorEnt?.hits.length ? colorEnt.hits.map((h) => c.entry(h).name) : []
  if (!found.length && colorAt) {
    const all = lists.color
    const surfaces = new Set<string>()
    for (const l of LOCALES) for (const s of [conceptSurface(colorAt.c, l)]) if (s) surfaces.add(s.toLowerCase())
    for (const e of all) if ([...surfaces].some((s) => e.name.toLowerCase().includes(s))) found.push(e.name)
  }
  if (found.length) return b.answer(tr(g, 'reply.catalogHas', { name: found.slice(0, 4).join(', ') }))
  return b.answer(tr(g, 'reply.catalogHasNot', { name: c.raw(idx) }))
}

// ── Estadísticas ────────────────────────────────────────────────────────────

const stats: Matcher = (c, g) => {
  const sales = at(c, 'stat.sales')
  const howMany = at(c, 'stat.how_many')
  const conversion = at(c, 'stat.conversion')
  const pending = at(c, 'stat.pending')
  const top = at(c, 'stat.top')
  const average = at(c, 'stat.average')
  const howMuch = at(c, 'stat.how_much')
  let kind: StatKind | null = null
  if (conversion >= 0) kind = 'conversion'
  else if (average >= 0) kind = 'average'
  else if (top >= 0 && (c.has('obj.typology') || c.has('obj.window') || c.has('obj.client') || c.hasPrefix('fam.') || c.has('obj.item') || sales >= 0 || c.has('qst.accepted'))) kind = 'top'
  // «open quote 123»: «open» es el verbo, no «pendientes».
  else if (pending >= 0 && !(c.isPrefix(pending, 'act.') && c.atoms.slice(c.from, pending).every((a) => a.kind === 'punct') && !c.isQuestion())) kind = 'pending'
  else if (howMany >= 0 && (c.has('obj.quote') || c.has('obj.client') || c.hasPrefix('qst.') || c.has('stat.made') || c.has('obj.window'))) kind = 'count'
  else if (sales >= 0 && (howMuch >= 0 || c.isQuestion() || c.hasPrefix('per.') || c.meaningful().length <= 2 || c.has('act.show'))) kind = 'sales'
  if (!kind) return null
  useConcepts(c, 'stat.', 'q.what', 'act.show', 'obj.quote', 'nav.quotes', 'obj.total', 'obj.price', 'obj.typology', 'qst.', 'obj.window', 'obj.item')
  for (let k = c.from; k < c.to; k++) if (c.atoms[k].e - c.atoms[k].s === 1 && AVAILABILITY.has(c.an.tokens[c.atoms[k].s].fold)) c.use(k)
  const period: Period = readPeriod(c) ?? { key: kind === 'pending' || kind === 'top' ? 'all' : 'this_month' }
  const b = new Build(`stats.${kind}` as NluCommandId, 3.4)
  // Clientes: «¿cuántos clientes tengo?» se responde con las entidades.
  if (kind === 'count' && c.has('obj.client') && !c.has('obj.quote')) {
    useConcepts(c, 'obj.client', 'nav.clients')
    b.part(tr(g, 'sum.stats', { what: tr(g, 'what.clients'), period: tr(g, 'period.all') }))
    return b.answer(tr(g, 'reply.statsClients', { count: g.bundle.index.lists.client.length }))
  }
  if (!g.ctx.stats) return null
  const clients = kind === 'top' && c.has('obj.client')
  if (clients) useConcepts(c, 'obj.client', 'nav.clients')
  let status: string | undefined
  for (const [concept, s] of STATUSES) if (c.has(concept)) status = s
  b.part(tr(g, 'sum.stats', { what: tr(g, `what.${kind}`), period: periodLabel(g, period) }))
  // «más vendida», «best selling», «meistverkauft»: ranking solo de lo vendido.
  const soldWords = top >= 0 && /vend|sold|sell|verkauf|satan|satil/.test(c.fold(top))
  return b.answer(answerStats(g, { kind, period, status: kind === 'count' ? status : undefined, clients, sold: kind === 'top' && (sales >= 0 || c.has('qst.accepted') || soldWords) }))
}

// ── Registro ────────────────────────────────────────────────────────────────

/** Todas las reglas, en orden de prioridad para empates. */
export const MATCHERS: readonly Matcher[] = [
  history,
  memory,
  stats,
  pricing,
  notes,
  languages,
  theme,
  currency,
  assistants,
  quoteCreate,
  clientCreate,
  dialog,
  templates,
  quoteRename,
  quoteDupDel,
  quoteStatus,
  send,
  workshop,
  documents,
  explain,
  quoteClient,
  clientFind,
  quoteOpen,
  itemAdd,
  itemJoin,
  itemDuplicate,
  itemUpdate,
  itemRemove,
  itemSelect,
  navigate,
  search,
  catalogLookup,
  help,
  greeting,
]

/** Comando que una pregunta «¿cómo…?» explicaría con un ejemplo (sin ejecutar nada). */
export function howToKey(command: NluCommandId): string | null {
  switch (command) {
    case 'greeting':
    case 'thanks':
    case 'help':
      return null
    default:
      return command.replace('.', '_')
  }
}
