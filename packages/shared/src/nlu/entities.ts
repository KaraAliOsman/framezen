/**
 * Índice de entidades dinámicas: catálogo (líneas, colores incl. propios, vidrios) y datos de la
 * organización (clientes, cotizaciones, plantillas, asistentes). Se construye una vez por versión
 * de datos y se reutiliza en cada tecla.
 *
 * - Trie de frases con los nombres completos («Roble montaña», «SOFTLINE 70», «DVH 4+12+4»).
 * - Palabras sueltas de nombres de personas, obras, plantillas y asistentes (coincidencia parcial:
 *   «busca a Pérez»), nunca asignadas solas: solo sugieren y desambiguan.
 * - Índice de borrados para errores de tipeo en nombres.
 */
import { deletionKeys, lexiconIndex, lowerBound } from './lexicon'
import { tokenize } from './text'
import type { NluCatalog, NluEntities } from './types'

export const ENTITY_TYPES = ['line', 'color', 'glass', 'client', 'quote', 'template', 'assistant'] as const
export type EntityType = (typeof ENTITY_TYPES)[number]

export interface EntityHit {
  type: EntityType
  /** Índice en `EntityIndex.lists[type]`. */
  idx: number
  /** Coincide el nombre completo. */
  exact: boolean
  /** Solo una palabra del nombre (o corrección de tipeo). */
  partial?: boolean
}

export interface EntityEntry {
  type: EntityType
  id: string
  name: string
  /** Palabras plegadas del nombre. */
  words: string[]
  /** Datos extra para etiquetas y filtros (n° de cotización, cliente, tipo de plantilla…). */
  detail?: string
  number?: number
  kind?: string
  typologyIds?: readonly string[]
  colorIds?: readonly string[]
  textureId?: string
}

interface Node {
  next?: Map<string, Node>
  hits?: EntityHit[]
}

export interface EntityIndex {
  root: Node
  words: { fold: string; hits: EntityHit[] }[]
  deletions: Map<string, number[]>
  lists: Record<EntityType, EntityEntry[]>
  byNumber: Map<number, number>
}

const PARTIAL_TYPES = new Set<EntityType>(['client', 'quote', 'template', 'assistant', 'color'])

function nameTokens(name: string): string[] {
  return tokenize(name)
    .filter((t) => t.kind !== 'punct')
    .map((t) => t.fold)
}

function insert(root: Node, keys: readonly string[], hit: EntityHit): void {
  let node = root
  for (const key of keys) {
    if (!node.next) node.next = new Map()
    let child = node.next.get(key)
    if (!child) {
      child = {}
      node.next.set(key, child)
    }
    node = child
  }
  const hits = (node.hits ??= [])
  if (!hits.some((h) => h.type === hit.type && h.idx === hit.idx)) hits.push(hit)
}

/** Construye el índice de entidades (lineal en la cantidad de nombres). */
export function buildEntityIndex(catalog: NluCatalog | undefined, entities: NluEntities | undefined): EntityIndex {
  const lists: Record<EntityType, EntityEntry[]> = { line: [], color: [], glass: [], client: [], quote: [], template: [], assistant: [] }
  for (const l of catalog?.lines ?? []) lists.line.push({ type: 'line', id: l.id, name: l.name, words: nameTokens(l.name), detail: l.brand, kind: l.kind, typologyIds: l.typologyIds, colorIds: l.colorIds })
  for (const c of catalog?.colors ?? []) lists.color.push({ type: 'color', id: c.id, name: c.name, words: nameTokens(c.name), detail: c.code, textureId: c.textureId })
  for (const g of catalog?.glass ?? []) lists.glass.push({ type: 'glass', id: g.id, name: g.name, words: nameTokens(g.name), detail: g.composition, kind: g.kind })
  for (const c of entities?.clients ?? []) lists.client.push({ type: 'client', id: c.id, name: c.name, words: nameTokens(c.name), detail: c.email ?? c.phone ?? c.city })
  for (const q of entities?.quotes ?? []) {
    const label = q.title || q.clientName || ''
    lists.quote.push({ type: 'quote', id: q.id, name: label, words: nameTokens(label), detail: q.clientName, number: q.number, kind: q.status })
  }
  for (const t of entities?.templates ?? []) lists.template.push({ type: 'template', id: t.id, name: t.name, words: nameTokens(t.name), kind: t.kind })
  for (const a of entities?.assistants ?? []) lists.assistant.push({ type: 'assistant', id: a.id, name: a.name, words: nameTokens(a.name) })

  const lex = lexiconIndex()
  const isLexWord = (w: string) => {
    const i = lowerBound(lex.words, w)
    return i < lex.words.length && lex.words[i].fold === w
  }
  const root: Node = {}
  const wordMap = new Map<string, EntityHit[]>()
  const byNumber = new Map<number, number>()
  for (const type of Object.keys(lists) as EntityType[]) {
    lists[type].forEach((entry, idx) => {
      if (entry.words.length) insert(root, entry.words, { type, idx, exact: true })
      if (type === 'quote' && entry.number !== undefined) byNumber.set(entry.number, idx)
      for (const w of entry.words) {
        if (w.length < 3 || /^\d+$/.test(w)) continue
        const hits = wordMap.get(w) ?? []
        hits.push({ type, idx, exact: entry.words.length === 1, partial: entry.words.length > 1 })
        wordMap.set(w, hits)
        // Palabras sueltas distintivas de nombres (no del léxico): «Pérez», «Montaña».
        if (PARTIAL_TYPES.has(type) && entry.words.length > 1 && !isLexWord(w)) insert(root, [w], { type, idx, exact: false, partial: true })
      }
    })
  }
  const words = [...wordMap].map(([fold, hits]) => ({ fold, hits })).sort((a, b) => (a.fold < b.fold ? -1 : a.fold > b.fold ? 1 : 0))
  const deletions = new Map<string, number[]>()
  words.forEach((w, i) => {
    if (w.fold.length < 4 || isLexWord(w.fold)) return
    for (const key of deletionKeys(w.fold)) {
      const arr = deletions.get(key)
      if (arr) arr.push(i)
      else deletions.set(key, [i])
    }
  })
  return { root, words, deletions, lists, byNumber }
}

/** Entradas cuyo nombre tiene una palabra que empieza con `prefix` (plegado). Sin repetir. */
export function entitiesByPrefix(index: EntityIndex, prefix: string, types: readonly EntityType[], limit = 40): EntityHit[] {
  if (!prefix) return []
  const out: EntityHit[] = []
  const seen = new Set<string>()
  for (let i = lowerBound(index.words, prefix); i < index.words.length && out.length < limit; i++) {
    const w = index.words[i]
    if (!w.fold.startsWith(prefix)) break
    for (const h of w.hits) {
      const key = `${h.type}:${h.idx}`
      if (!types.includes(h.type) || seen.has(key)) continue
      seen.add(key)
      out.push({ ...h, exact: w.fold === prefix })
    }
  }
  return out
}
