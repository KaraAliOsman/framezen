/**
 * Autocompletado slot por slot (investigación 24 §6).
 *
 * 1. Se interpreta el texto ANTES de la palabra en curso (memoizado) y se toma la última cláusula.
 * 2. Si se reconoció un comando, se sugieren valores para sus próximos slots (los que faltan
 *    primero): tipología → medida → color → vidrio → cantidad; cliente, cotización, plantilla,
 *    idioma, destino… del catálogo y los datos reales. Si no, frases para empezar un comando.
 * 3. Orden por bandas estables (coincidencia al inicio > palabra interior > alias > corrección) y,
 *    dentro de cada banda, prioridad del slot, popularidad y uso reciente (frecency).
 * 4. Texto fantasma solo si el cursor está al final, la continuación es literal (sin cambiar tildes
 *    ni mayúsculas de lo escrito) y no hay ambigüedad; si varias opciones comparten un prefijo,
 *    se ofrece solo ese prefijo común.
 */
import { TYPOLOGY_IDS, type TypologyId } from '@dekopen/engine'
import type { GlossaryApi } from '../i18n/glossary/helpers'
import { LOCALES, type Locale } from '../i18n/locales'
import type { Translator } from '../i18n/translator'
import { NLU_COMMAND_IDS, type NluCommandId } from './commands'
import { entitiesByPrefix, type EntityEntry } from './entities'
import { inline, languageName, type EntityBundle, type GEnv, type NluMessages } from './env'
import type { NluFrecency } from './frecency'
import { osaDistance } from './fuzzy'
import { ASSEMBLY_CONCEPTS, colorAliases, COLOR_TEXTURES } from './clause'
import { conceptSurface, conceptSurfaces, lexiconIndex } from './lexicon'
import { nluMessages } from './messages'
import { foldText } from './text'
import type { NluCompletion, NluContext, NluSlotKind, NluSuggestion, NluSuggestionKind } from './types'
import type { ClauseOutcome } from './nlu'

interface Cand {
  kind: NluSuggestionKind
  id?: string
  label: string
  detail?: string
  insert: string
  /** Claves plegadas: la primera es el texto a insertar. */
  keys: string[]
  /** Palabras plegadas de todas las claves. */
  words: string[]
  /** Popularidad 0..0.2. */
  base: number
  canExecute?: boolean
}

export interface CompleterBase {
  locale: Locale
  t: Translator<NluMessages>
  glossary: GlossaryApi
  bundle: EntityBundle
  frecency?: NluFrecency
}

export interface CompleteHooks {
  ctx: NluContext
  /** Interpreta el texto anterior a la palabra en curso (última cláusula). */
  interpretHead(head: string): { g: GEnv; last: ClauseOutcome | null } | null
  languageOf(head: string): Locale | null
}

const MAX_ITEMS = 8
const WORD_CHAR = /[\p{L}\p{M}\p{N}#%_]/u

function cand(kind: NluSuggestionKind, label: string, insert: string, keys: readonly string[], extra: Partial<Cand> = {}): Cand {
  const folded = [foldText(insert), ...keys.map((k) => foldText(k))].filter(Boolean)
  const words: string[] = []
  for (const k of folded) for (const w of k.split(/[\s+\-/]+/)) if (w && !words.includes(w)) words.push(w)
  return { kind, label, insert, keys: [...new Set(folded)], words, base: 0, ...extra }
}

/** Familias del léxico de cada tipología (para que «corr», «sliding» o «Schiebe» la encuentren). */
function familyConcepts(id: TypologyId): string[] {
  if (id === 'vertical_sliding') return ['fam.vertical_sliding']
  if (id === 'vertical_sliding_double') return ['fam.vertical_sliding_double', 'fam.vertical_sliding']
  if (id === 'louver_fixed') return ['fam.louver']
  if (id === 'door_panel') return ['fam.door_panel', 'fam.door']
  if (id.startsWith('lift_slide')) return ['fam.lift_slide', 'fam.sliding']
  if (id.startsWith('tilt_slide')) return ['fam.tilt_slide']
  if (id === 'parallel_slide') return ['fam.parallel_slide']
  if (id.startsWith('sliding')) return ['fam.sliding']
  if (id.startsWith('folding')) return ['fam.folding']
  if (id.startsWith('pivot')) return ['fam.pivot']
  if (id.startsWith('french')) return ['fam.french', id.includes('tilt') ? 'fam.tilt_turn' : 'fam.casement']
  if (id.startsWith('balcony')) return ['fam.balcony_door', 'fam.door']
  if (id.startsWith('entrance')) return ['fam.entrance_door', 'fam.door']
  if (id.startsWith('door')) return ['fam.door']
  if (id === 'arch_segmental') return ['fam.arch_segmental']
  if (id.startsWith('arch')) return ['fam.arch']
  if (['round', 'oval', 'pentagon', 'octagon', 'gable', 'triangle', 'trapezoid'].includes(id)) return [`fam.${id}`]
  const out: string[] = []
  if (id.includes('tilt_turn')) out.push('fam.tilt_turn')
  else if (id.includes('casement')) out.push('fam.casement')
  if (id.includes('awning')) out.push('fam.awning')
  if (id === 'tilt' || id === 'fixed_tilt') out.push('fam.tilt')
  if (id.includes('fixed')) out.push('fam.fixed')
  return out
}

/**
 * Frases para insertar cuando el nombre del glosario se presta a otra lectura («tres paños fijos»
 * tras «agrega una» se leería como cantidad). Las pruebas verifican que cada frase vuelve a la misma
 * tipología en su idioma.
 */
const TYPOLOGY_INSERTS: Partial<Record<Locale, Partial<Record<TypologyId, string>>>> = {
  es: { fixed_3: 'fijo de 3 paños' },
  en: { fixed_3: 'fixed window with 3 panes' },
  pt: { fixed_3: 'fixa de 3 painéis' },
  fr: { fixed_3: 'fixe 3 panneaux', casement_double: 'ouvrant 2 vantaux', casement_double_bottom_fixed: 'ouvrant 2 vantaux avec allège vitrée', casement_double_mullion: 'ouvrant 2 vantaux avec meneau' },
  de: { fixed_3: 'Festfenster mit 3 Feldern' },
  it: { fixed_3: 'fisso a 3 campi' },
  tr: {
    fixed_3: 'sabit 3 bölmeli',
    fixed_awning_bottom: 'sabit + altta üstten açılır',
    casement_double_bottom_fixed: 'alt sabit camlı çift kanat açılır',
    casement_double_mullion: 'kayıtlı çift kanat açılır',
    awning_transom: 'alt sabitli üstten açılır',
  },
}

/** Texto que se inserta para una tipología en el idioma de entrada. */
export function typologyInsert(id: TypologyId, lang: Locale, glossary: GlossaryApi): string {
  return TYPOLOGY_INSERTS[lang]?.[id] ?? inline(glossary.typologyName(id, lang), lang)
}

const COLOR_CONCEPTS = Object.keys(COLOR_TEXTURES)

/** Conceptos de color del léxico que corresponden a un color del catálogo (por textura o por nombre). */
function colorConcepts(e: EntityEntry): string[] {
  const key = e.words.join(' ')
  const out: string[] = []
  for (const concept of COLOR_CONCEPTS) {
    if (e.textureId && COLOR_TEXTURES[concept].includes(e.textureId)) out.push(concept)
    else if (colorAliases(concept).some((al) => key === al || key.startsWith(`${al} `) || key.endsWith(` ${al}`))) out.push(concept)
  }
  return out
}

/** Conceptos de vidrio de un vidrio del catálogo (por tipo y por nombre). */
function glassConcepts(e: EntityEntry): string[] {
  const out: string[] = []
  const kind = e.kind
  const text = `${e.words.join(' ')} ${foldText(e.detail ?? '')}`
  if (kind === 'dvh' || /dvh|termo|doble|double/.test(text)) out.push('gls.double')
  if (kind === 'laminated' || /lamin/.test(text)) out.push('gls.laminated')
  if (kind === 'tempered' || /templ/.test(text)) out.push('gls.tempered')
  if (kind === 'mono' || /simple|mono/.test(text)) out.push('gls.single')
  if (/low ?e|emisiv/.test(text)) out.push('gls.low_e')
  return out
}

const POPULAR: readonly TypologyId[] = ['sliding_2', 'tilt_turn', 'fixed', 'casement', 'sliding_4', 'awning', 'french_tilt_turn', 'sliding_3', 'door', 'balcony_door']

/** Comandos que se proponen con el campo vacío, según haya o no una cotización abierta. */
const STARTERS_QUOTE: readonly NluCommandId[] = ['item.add', 'item.update', 'item.bulk', 'quote.discount', 'quote.send', 'quote.pdf', 'quote.assign_client', 'history.undo']
const STARTERS_HOME: readonly NluCommandId[] = ['quote.create', 'quote.open', 'nav.go', 'client.create', 'stats.sales', 'stats.pending', 'help', 'quote.search']

export function createCompleter(base: CompleterBase) {
  const { glossary, bundle } = base
  const t = (key: string) => (base.t as unknown as (k: string) => string)(key)
  const pools = new Map<string, Cand[]>()
  const pool = (name: string, build: () => Cand[]): Cand[] => {
    let p = pools.get(name)
    if (!p) {
      p = build()
      pools.set(name, p)
    }
    return p
  }

  const starters = (lang: Locale) =>
    pool(`starters:${lang}`, () => {
      const say = nluMessages[lang].say as Record<string, string>
      const example = nluMessages[lang].example as Record<string, string>
      const out: Cand[] = []
      for (const id of NLU_COMMAND_IDS) {
        const key = id.replace('.', '_')
        const insert = say[key]
        if (!insert) continue
        out.push(cand('command', t(`cmd.${key}`), insert, [example[key] ?? '', t(`cmd.${key}`)], { id, detail: example[key], canExecute: !/\s$/.test(insert) && !insert.endsWith(': ') }))
      }
      return out
    })

  const typologies = (lang: Locale) =>
    pool(`typology:${lang}`, () =>
      [...TYPOLOGY_IDS.map((id) => {
        const surfaces = familyConcepts(id).flatMap((c) => conceptSurfaces(c, lang))
        const popular = POPULAR.indexOf(id)
        return cand('typology', glossary.typologyName(id, base.locale), typologyInsert(id, lang, glossary), [inline(glossary.typologyName(id, lang), lang), ...surfaces], { id, base: popular >= 0 ? 0.2 - popular * 0.015 : 0 })
      }),
      ...ASSEMBLY_CONCEPTS.map(([concept, preset]) => {
        const insert = conceptSurface(concept, lang) ?? preset
        return cand('typology', conceptSurface(concept, base.locale) ?? insert, insert, conceptSurfaces(concept, lang), { id: `assembly:${preset}` })
      })],
    )

  const lexConcepts = (prefix: string, kind: NluSuggestionKind, lang: Locale) =>
    pool(`lex:${prefix}:${lang}`, () => {
      const out: Cand[] = []
      const seen = new Set<string>()
      for (const concept of ['col.white', 'col.anthracite', 'col.golden_oak', 'col.walnut', 'col.black', 'col.grey', 'col.cream', 'col.oak', 'col.mahogany', 'col.silver', 'gls.double', 'gls.triple', 'gls.laminated', 'gls.tempered', 'gls.low_e', 'gls.frosted', 'gls.acoustic', 'gls.solar_control', 'gls.single']) {
        if (!concept.startsWith(prefix) || seen.has(concept)) continue
        seen.add(concept)
        const insert = conceptSurface(concept, lang)
        if (!insert) continue
        out.push(cand(kind, conceptSurface(concept, base.locale) ?? insert, insert, conceptSurfaces(concept, lang), { id: concept, base: 0.1 - out.length * 0.005 }))
      }
      return out
    })

  const entityCands = (type: 'color' | 'glass' | 'line' | 'template' | 'assistant', kind: NluSuggestionKind, lang: Locale) =>
    pool(`ent:${type}:${type === 'color' || type === 'glass' ? lang : ''}`, () =>
      bundle.index.lists[type].map((e) => {
        // Un color o vidrio del catálogo también se encuentra por su nombre en el idioma de quien escribe
        // («white» → «Blanco», «double glazing» → «Termopanel 4+12+4»).
        const aliases = type === 'color' ? colorConcepts(e).flatMap((c) => conceptSurfaces(c, lang)) : type === 'glass' ? glassConcepts(e).flatMap((c) => conceptSurfaces(c, lang)) : []
        return cand(kind, e.name, e.name, [...(e.words.length > 1 ? [e.words.join(' ')] : []), ...aliases], { id: e.id, detail: e.detail })
      }),
    )

  const nav = (lang: Locale) =>
    pool(`nav:${lang}`, () => {
      const list: [string, string][] = [
        ['nav.quotes', 'quotes'],
        ['nav.clients', 'clients'],
        ['nav.catalog', 'catalog'],
        ['nav.workshop', 'workshop'],
        ['nav.documents', 'documents'],
        ['nav.home', 'home'],
        ['nav.settings', 'settings'],
        ['nav.pricing', 'pricing'],
        ['nav.company', 'company'],
        ['nav.team', 'team'],
        ['nav.plan', 'plan'],
        ['nav.assistants', 'assistants'],
        ['nav.language', 'language'],
        ['nav.ai', 'ai'],
        ['nav.textures', 'textures'],
      ]
      return list.map(([concept, label], i) => cand('nav', t(`nav.${label}`), conceptSurface(concept, lang) ?? label, [...conceptSurfaces(concept, lang), t(`nav.${label}`)], { id: label, base: 0.15 - i * 0.008, canExecute: true }))
    })

  const fixed = (name: string, items: readonly { concept: string; id: string; label: string; kind: NluSuggestionKind }[], lang: Locale) =>
    pool(`${name}:${lang}`, () => items.map((it, i) => cand(it.kind, it.label, conceptSurface(it.concept, lang) ?? it.id, conceptSurfaces(it.concept, lang), { id: it.id, base: 0.1 - i * 0.01 })))

  const locales = (lang: Locale) => fixed('locale', LOCALES.map((l) => ({ concept: `lang.${l}`, id: l, label: languageName(base.locale, l), kind: 'locale' as const })), lang)
  const themes = (lang: Locale) =>
    fixed(
      'theme',
      (['dark', 'light', 'system'] as const).map((v) => ({ concept: `thm.${v}`, id: v, label: t(`theme.${v}`), kind: 'theme' as const })),
      lang,
    )
  const modes = (lang: Locale) =>
    fixed(
      'mode',
      (['chat', 'supervised', 'full'] as const).map((v) => ({ concept: `mde.${v}`, id: v, label: t(`mode.${v}`), kind: 'mode' as const })),
      lang,
    )
  const statuses = (lang: Locale) =>
    pool(`status:${lang}`, () =>
      (['accepted', 'rejected', 'sent', 'draft'] as const).map((s, i) => cand('value', glossary.quoteStatusLabel(s, base.locale), inline(glossary.quoteStatusLabel(s, lang), lang), conceptSurfaces(`qst.${s}`, lang), { id: s, base: 0.1 - i * 0.01 })),
    )

  const quoteCand = (e: EntityEntry): Cand => cand('quote', e.number !== undefined ? `N° ${e.number}` : e.name, e.number !== undefined ? `#${e.number}` : `"${e.name}"`, [e.name, String(e.number ?? '')], { id: e.id, detail: [e.name, e.detail].filter(Boolean).join(' · ') })
  const clientCand = (e: EntityEntry): Cand => cand('client', e.name, e.name, [e.words.join(' ')], { id: e.id, detail: e.detail })

  /** Candidatos de un slot (los de entidades se filtran por prefijo con el índice). */
  const slotCands = (kind: NluSlotKind, lang: Locale, p: string, ctx: NluContext): Cand[] => {
    const lists = bundle.index.lists
    switch (kind) {
      case 'typology':
      case 'panels':
        return typologies(lang)
      case 'color':
        return lists.color.length ? entityCands('color', 'color', lang) : lexConcepts('col.', 'color', lang)
      case 'glass':
        return lists.glass.length ? entityCands('glass', 'glass', lang) : lexConcepts('gls.', 'glass', lang)
      case 'line':
        return entityCands('line', 'line', lang)
      case 'change':
        return pool(`change:${lang}`, () => [
          ...slotCands('color', lang, p, ctx).map((x) => ({ ...x, base: x.base + 0.3 })),
          ...slotCands('glass', lang, p, ctx).map((x) => ({ ...x, base: x.base + 0.2 })),
          ...typologies(lang),
        ])
      case 'template':
        return entityCands('template', 'template', lang)
      case 'assistant':
        return entityCands('assistant', 'assistant', lang)
      case 'nav':
        return nav(lang)
      case 'locale':
        return locales(lang)
      case 'theme':
        return themes(lang)
      case 'mode':
        return modes(lang)
      case 'status':
        return statuses(lang)
      case 'client':
        return (p ? entitiesByPrefix(bundle.index, p, ['client'], 24).map((h) => lists.client[h.idx]) : lists.client.slice(0, 6)).map(clientCand)
      case 'quote': {
        const digits = p.replace(/^#/, '')
        if (/^\d+$/.test(digits)) return lists.quote.filter((q) => q.number !== undefined && String(q.number).startsWith(digits)).slice(0, 24).map(quoteCand)
        if (p) return entitiesByPrefix(bundle.index, p, ['quote'], 24).map((h) => quoteCand(lists.quote[h.idx]))
        return [...lists.quote].sort((a, b) => (b.number ?? 0) - (a.number ?? 0)).slice(0, 6).map(quoteCand)
      }
      case 'item':
        return (ctx.items ?? []).slice(0, 40).map((it, i) => cand('value', it.ref, it.ref, [it.location ?? ''], { id: it.id, detail: [it.typology ? glossary.typologyName(it.typology, base.locale) : '', it.location ?? ''].filter(Boolean).join(' · '), base: 0.1 - i * 0.002 }))
      case 'percent':
        return [5, 10, 15, 20, 25, 30].map((v, i) => cand('value', `${v} %`, lang === 'tr' ? `%${v}` : `${v}%`, [String(v)], { id: String(v), base: 0.1 - i * 0.01 }))
      default:
        return []
    }
  }

  const hint = (kind: NluSlotKind, partial: string, width: number | null = null): Cand | null => {
    if (kind === 'size' || kind === 'width' || kind === 'height') {
      const typed = partial.replace(/[xX×]$/, '')
      // «1500 por 1…»: se está escribiendo el alto.
      const label = width !== null && /^\d/.test(partial) ? `${width} × ${typed}… mm` : /^\d/.test(partial) ? `${typed} × ___ mm` : t('prompt.sizeHint')
      return cand('hint', label, '', [])
    }
    if (kind === 'title' || kind === 'name' || kind === 'text' || kind === 'quantity') return cand('hint', t(`slot.${kind}`), '', [])
    return null
  }

  function band(c: Cand, p: string): number {
    if (!p) return 4
    if (c.keys[0]?.startsWith(p)) return 9
    // Tipologías: «sli» encuentra «2-panel slider» igual que «slider, sash + fixed» (decide la popularidad).
    if (c.kind === 'typology' && p.length >= 2 && c.keys[0]?.split(/[\s,+\-]+/).some((w) => w.startsWith(p))) return 9
    for (let i = 1; i < c.keys.length; i++) if (c.keys[i].startsWith(p)) return 7
    for (const w of c.words) if (w.startsWith(p)) return 6
    if (p.length >= 4) {
      for (const w of c.words) if (w.length >= p.length && osaDistance(p, w.slice(0, p.length), 1) <= 1) return 2
    }
    return 0
  }

  function rank(cands: readonly Cand[], p: string, bonus: number, now: number, out: Map<string, NluSuggestion>, replace: [number, number]): void {
    for (const c of cands) {
      const b = band(c, p)
      if (!b) continue
      const key = `${c.kind}:${c.id ?? c.insert}`
      const boost = base.frecency ? base.frecency.boost(key, now) * 0.15 : 0
      const score = b + bonus + c.base + boost
      const prev = out.get(key)
      if (prev && prev.score >= score) continue
      const s: NluSuggestion = { kind: c.kind, label: c.label, insertText: c.insert, replace, key, score: Math.round(score * 1000) / 1000 }
      if (c.id) s.id = c.id
      if (c.detail && c.detail !== c.label) s.detail = c.detail
      if (c.canExecute) s.canExecute = true
      out.set(key, s)
    }
  }

  function rootCands(lang: Locale, p: string, ctx: NluContext): Cand[] {
    const all = starters(lang)
    if (!p) {
      const order = ctx.quoteOpen ? STARTERS_QUOTE : STARTERS_HOME
      return order.map((id) => all.find((s) => s.id === id)).filter((s): s is Cand => !!s).map((s, i) => ({ ...s, base: 0.2 - i * 0.02 }))
    }
    // Con la misma coincidencia gana el comando más común de la pantalla («agr» → «Agregar ventana» antes que «Agregar una nota»).
    const order: readonly NluCommandId[] = ctx.quoteOpen ? STARTERS_QUOTE : STARTERS_HOME
    const out = [...all.map((s) => (s.id && order.indexOf(s.id as NluCommandId) >= 0 ? { ...s, base: 0.12 - order.indexOf(s.id as NluCommandId) * 0.01 } : s)), ...nav(lang)]
    if (ctx.quoteOpen) out.push(...typologies(lang))
    if (p.length >= 2) {
      const lists = bundle.index.lists
      for (const h of entitiesByPrefix(bundle.index, p.replace(/^#/, ''), ['client', 'quote'], 12)) {
        if (h.type === 'client') out.push({ ...clientCand(lists.client[h.idx]), base: -0.1 })
        else out.push({ ...quoteCand(lists.quote[h.idx]), base: -0.1, canExecute: true })
      }
      const digits = p.replace(/^#/, '')
      if (/^\d+$/.test(digits)) for (const q of lists.quote) if (q.number !== undefined && String(q.number).startsWith(digits)) out.push({ ...quoteCand(q), canExecute: true })
    }
    return out
  }

  /**
   * Frase a medio escribir que abarca palabras anteriores: «tilt and tur» → «tilt and turn»
   * (tipologías, colores y vidrios); la sugerencia reemplaza la frase entera más larga que calza.
   */
  function rankPhrases(text: string, ws: number, we: number, p: string, lang: Locale, now: number, out: Map<string, NluSuggestion>): void {
    if (!p || !/\p{L}/u.test(p)) return
    const starts: number[] = []
    let i = ws
    while (starts.length < 4) {
      let e = i
      while (e > 0 && !WORD_CHAR.test(text[e - 1])) e--
      if (e === 0 || e === i || /[,.;:!?]/.test(text.slice(e, i))) break
      let s = e
      while (s > 0 && WORD_CHAR.test(text[s - 1])) s--
      starts.push(s)
      i = s
    }
    if (!starts.length) return
    const lists = bundle.index.lists
    const pools = [typologies(lang), lists.color.length ? entityCands('color', 'color', lang) : lexConcepts('col.', 'color', lang), lists.glass.length ? entityCands('glass', 'glass', lang) : lexConcepts('gls.', 'glass', lang)]
    for (let k = starts.length - 1; k >= 0; k--) {
      const phrase = foldText(text.slice(starts[k], ws)).replace(/\s+/g, ' ').trim() + ' ' + p
      const hits: Cand[] = []
      for (const list of pools) for (const c of list) if (c.keys.some((key) => key.startsWith(phrase))) hits.push({ ...c, keys: [phrase, ...c.keys] })
      if (!hits.length) continue
      rank(hits, phrase, 1.5, now, out, [starts[k], we])
      return
    }
  }

  /** Medida en curso: «… 1500 por 1» → el ancho ya escrito (o null). */
  function pendingWidth(last: ClauseOutcome | null | undefined): number | null {
    const c = last?.clause
    if (!c) return null
    let k = c.to - 1
    while (k >= c.from && c.atoms[k].kind === 'punct') k--
    if (k < c.from || !(c.is(k, 'sep.x') || c.atoms[k].lit?.kind === 'x')) return null
    const n = c.atoms[k - 1]
    return k - 1 >= c.from && n?.num && !n.num.words ? n.num.value : null
  }

  function literalPrefix(insert: string, partial: string, locale: Locale): boolean {
    return insert.length > partial.length && insert.slice(0, partial.length).toLocaleLowerCase(locale) === partial.toLocaleLowerCase(locale)
  }

  /** «la», «the», «die»: palabra de relleno ya completa, no el comienzo de otra. */
  function isFillerWord(fold: string): boolean {
    return !!lexiconIndex().root.next?.get(fold)?.hits?.some((h) => h.c === 'fil')
  }

  return function complete(text: string, cursor: number, hooks: CompleteHooks): NluCompletion {
    let ws = cursor
    while (ws > 0 && WORD_CHAR.test(text[ws - 1])) ws--
    let we = cursor
    while (we < text.length && WORD_CHAR.test(text[we])) we++
    const replace: [number, number] = [ws, we]
    const head = text.slice(0, ws)
    // Dentro de comillas (título, nombre): sin sugerencias.
    let quotes = 0
    for (const ch of head) if (ch === '"' || ch === '«' || ch === '»' || ch === '“' || ch === '”') quotes++
    if (quotes % 2 === 1) return { items: [], replace }
    const partial = text.slice(ws, cursor)
    const p = foldText(partial)
    const ctx = hooks.ctx
    const now = Date.now()
    const interp = hooks.interpretHead(head)
    const lang: Locale = (head.trim() ? hooks.languageOf(head) : null) ?? (p ? hooks.languageOf(partial) : null) ?? base.locale
    const out = new Map<string, NluSuggestion>()
    const build = interp?.last?.build
    let slots = build ? build.next() : []
    // «ponle …»: primero el cambio (color, vidrio…), después a qué ventana.
    const change = slots.indexOf('change')
    if (change > 0 && slots[0] === 'item') slots = ['change', 'item', ...slots.filter((k) => k !== 'change' && k !== 'item')]
    const taken = new Set((build?.pickedItems ?? []).map((r) => r.toUpperCase()))
    const itemCands = (partialFold: string) => slotCands('item', lang, partialFold, ctx).filter((c) => !taken.has(c.insert.toUpperCase()))
    // «une la»: falta una ventana y lo escrito es un artículo. Se ofrece la ventana después de él,
    // no palabras que por casualidad empiezan igual.
    if (slots[0] === 'item' && p && we === cursor && isFillerWord(p)) {
      const after: [number, number] = [we, we]
      rank(itemCands('').map((c) => ({ ...c, insert: ` ${c.insert}` })), '', 0.3, now, out, after)
      return { items: [...out.values()].sort((x, y) => y.score - x.score || x.label.localeCompare(y.label)).slice(0, MAX_ITEMS), replace: after }
    }
    let hintCand: Cand | null = null
    rankPhrases(text, ws, we, p, lang, now, out)
    if (build && slots.length && !out.size) {
      // Cifras mientras falta la medida: se está escribiendo la medida, no un vidrio «4/16/4».
      const dimension = /^\d/.test(partial) && (slots[0] === 'size' || slots[0] === 'width' || slots[0] === 'height')
      const limit = dimension ? 1 : p ? 3 : 1
      slots.slice(0, limit).forEach((kind, i) => {
        if (!hintCand && i === 0) hintCand = hint(kind, partial, pendingWidth(interp?.last))
        if (!dimension) rank(kind === 'item' ? itemCands(p) : slotCands(kind, lang, p, ctx), p, i === 0 ? 0.3 : i === 1 ? 0.15 : 0, now, out, replace)
      })
    }
    if (!out.size && (!build || !slots.length || p)) {
      if (!build || !slots.length || !hintCand) rank(rootCands(lang, p, ctx), p, 0, now, out, replace)
    }
    const items = [...out.values()].sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, MAX_ITEMS)
    const hc = hintCand as Cand | null
    if (hc && items.length < MAX_ITEMS && (!p || /^\d/.test(partial))) items.push({ kind: 'hint', label: hc.label, insertText: '', replace, key: `hint:${hc.label}`, score: 0 })
    const result: NluCompletion = { items, replace }
    // Texto fantasma: cursor al final, continuación literal y clara.
    if (cursor === text.length && partial && items.length && items[0].kind !== 'hint') {
      const top = items[0]
      // Lo escrito que reemplaza la sugerencia (una frase entera si abarca palabras anteriores).
      const typed = text.slice(top.replace[0], cursor)
      const lit = items.filter((s) => s.kind !== 'hint' && s.replace[0] === top.replace[0] && literalPrefix(s.insertText, typed, lang))
      if (literalPrefix(top.insertText, typed, lang)) {
        const second = items[1]
        const clear = !second || second.kind === 'hint' || second.score <= top.score - 0.75 || lit.length === 1
        if (clear) result.ghost = top.insertText.slice(typed.length).replace(/\s+$/, '')
        else {
          let lcp = top.insertText
          for (const s of lit) {
            let k = 0
            while (k < lcp.length && k < s.insertText.length && lcp[k].toLocaleLowerCase(lang) === s.insertText[k].toLocaleLowerCase(lang)) k++
            lcp = lcp.slice(0, k)
          }
          const ghost = lcp.slice(typed.length).replace(/\s+$/, '')
          if (ghost) result.ghost = ghost
        }
        if (result.ghost === '') delete result.ghost
      }
    }
    return result
  }
}
