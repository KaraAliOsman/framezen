/**
 * Vocativo y división en cláusulas.
 *
 * - Vocativo: el nombre de un asistente al inicio («Sofía, agrega…», «hola Marco: …») o al final
 *   («…, Marco») se ignora. Solo cuenta si va seguido de una pausa (coma, dos puntos), de un verbo o
 *   del fin del texto: «marco nogal» sigue siendo el marco (de la ventana) en nogal.
 * - Cláusulas: corte firme en `;`, salto de línea, `?`, `!` y punto final; corte suave en coma o
 *   conjunción («y», «and», «und», «ve»…, «luego», «then») solo cuando lo que sigue empieza otro
 *   comando («agrega una V3 y ponle nogal») o lo anterior termina en verbo (turco y alemán: «… ekle ve …»).
 *   «… y una oscilobatiente de 600x1200» tras agregar una ventana hereda el verbo. Después de
 *   «recuerda que…» o «nota: …» no se corta (es texto libre).
 */
import type { Clause } from './clause'

export interface ClauseRange {
  from: number
  to: number
  /** Sin verbo propio: hereda el comando de la cláusula anterior («y una oscilobatiente de 600x1200»). */
  inherit: boolean
}

export interface SplitResult {
  ranges: ClauseRange[]
  /** Átomos del vocativo (ignorados). */
  vocative: number[]
}

/** Conjunciones de corte suave, con sus tildes (la «é» portuguesa e italiana es «es», no «y»). */
const SOFT_CONJ = new Set(['y', 'e', 'and', 'et', 'und', 've', 'ed', 'luego', 'después', 'despues', 'then', 'dann', 'puis', 'ensuite', 'sonra', 'poi', 'depois', 'también', 'tambien', 'também', 'also', 'además', 'ademas', 'außerdem', 'ausserdem', 'inoltre', 'ayrıca', 'ayrica'])
const MAX_CLAUSES = 6

/** Nombres de asistentes como secuencias de tokens plegados. */
export type NameList = readonly (readonly string[])[]

function tokenFolds(c: Clause, i: number): string[] {
  const a = c.atoms[i]
  const out: string[] = []
  for (let t = a.s; t < a.e; t++) out.push(c.an.tokens[t].fold)
  return out
}

/** ¿Empieza en el átomo `i` alguno de los nombres? Devuelve el átomo siguiente al nombre. */
function matchName(c: Clause, i: number, names: NameList): number {
  if (i < c.from || i >= c.to) return -1
  for (const name of names) {
    let k = 0
    let j = i
    while (j < c.to && k < name.length) {
      const folds = tokenFolds(c, j)
      if (folds.length > name.length - k) break
      let ok = true
      for (const f of folds) {
        if (f !== name[k]) {
          ok = false
          break
        }
        k++
      }
      if (!ok) break
      j++
    }
    if (k === name.length && j > i) return j
  }
  return -1
}

function isActionAtom(c: Clause, i: number): boolean {
  if (i < c.from || i >= c.to || c.isFiller(i)) return false
  let action = false
  for (const concept of c.concepts(i)) {
    if (concept.startsWith('obj.') || concept.startsWith('fam.')) return false
    if (concept.startsWith('act.') || concept.startsWith('stat.') || concept === 'q.how' || concept === 'q.what' || concept === 'q.why') action = true
  }
  return action
}

/** El átomo `i` abre un comando nuevo (verbo, pregunta o estadística). */
function startsCommand(c: Clause, i: number): boolean {
  return isActionAtom(c, i)
}

function startsProduct(c: Clause, i: number): boolean {
  let k = i
  if (k >= 0 && c.atoms[k]?.num && k < c.to) k = c.next(k)
  return k >= 0 && (c.isPrefix(k, 'fam.') || c.is(k, 'obj.window') || c.is(k, 'obj.door'))
}

function separatorIsHard(c: Clause, i: number): boolean {
  const a = c.atoms[i]
  if (a.kind !== 'punct') return false
  const raw = c.an.tokens[a.s].raw
  if (raw === ';' || raw === '?' || raw === '!' || raw === '¿' || raw === '¡') return raw === ';' || raw === '?' || raw === '!'
  if (raw === '.') {
    const prevNum = i > c.from && !!c.atoms[i - 1].num
    const nxt = c.next(i)
    if (nxt < 0) return false
    // «2. kalemi sil» (ordinal turco): no corta.
    if (prevNum && !startsCommand(c, nxt)) return false
    return true
  }
  return false
}

function newlineBefore(c: Clause, i: number): boolean {
  if (i <= c.from) return false
  const prevEnd = c.an.tokens[c.atoms[i - 1].e - 1].end
  const start = c.an.tokens[c.atoms[i].s].start
  return c.an.text.slice(prevEnd, start).includes('\n')
}

function isSoftSeparator(c: Clause, i: number): boolean {
  const a = c.atoms[i]
  if (a.kind === 'punct') return c.an.tokens[a.s].raw === ','
  return a.e - a.s === 1 && SOFT_CONJ.has(c.an.tokens[a.s].raw.toLowerCase())
}

/** El texto desde aquí es libre: no se corta (recuerdos, notas, títulos). */
function opensFreeText(c: Clause, i: number): boolean {
  if (c.is(i, 'act.remember') || c.is(i, 'act.forget')) return true
  if (c.is(i, 'obj.notes')) {
    const p = c.prev(i)
    return c.punct(i + 1, ':') || (p >= 0 && (c.is(p, 'act.add') || c.is(p, 'act.put') || c.is(p, 'act.change') || c.is(p, 'act.set')))
  }
  return false
}

export function splitClauses(whole: Clause, names: NameList): SplitResult {
  const vocative: number[] = []
  let greetingRange: ClauseRange | null = null
  let start = whole.from
  let end = whole.to
  while (start < end && whole.atoms[start].kind === 'punct') start++
  while (end > start && whole.atoms[end - 1].kind === 'punct') end--

  if (names.length && start < end) {
    // Al inicio, con o sin saludo antes: «Sofía, …», «hola Marco: …».
    const at = whole.is(start, 'grt') && !whole.punct(start + 1) ? start + 1 : start
    const after = matchName(whole, at, names)
    if (after > 0) {
      const nxt = after < end ? after : -1
      const pause = nxt >= 0 && whole.punct(nxt, ',:!.')
      const meaningful = nxt >= 0 ? (whole.isFiller(nxt) ? whole.next(nxt) : nxt) : -1
      const verb = meaningful >= 0 && (startsCommand(whole, meaningful) || whole.is(meaningful, 'grt') || whole.is(meaningful, 'thx') || whole.is(meaningful, 'act.help'))
      // «Sofía ile konuş», «Marco a la V2…»: una posposición o preposición pegada al nombre lo vuelve argumento.
      const argument = nxt >= 0 && !pause && (whole.is(nxt, 'trg.to') || whole.is(nxt, 'trg.for') || (meaningful >= 0 && whole.is(meaningful, 'act.switch')))
      if (!argument && (nxt < 0 || pause || verb)) {
        for (let k = at; k < after; k++) vocative.push(k)
        // «hola Marco: …»: el saludo queda como su propia cláusula y el nombre se salta.
        if (at > start) greetingRange = { from: start, to: at, inherit: false }
        start = after
        while (start < end && whole.atoms[start].kind === 'punct') start++
      }
    }
    // Al final: «…, Marco».
    for (let k = Math.max(start, end - 3); k < end; k++) {
      if (k <= start || !whole.punct(k - 1, ',')) continue
      if (matchName(whole, k, names) === end) {
        for (let j = k; j < end; j++) vocative.push(j)
        end = k - 1
        break
      }
    }
  }

  const ranges: ClauseRange[] = greetingRange ? [greetingRange] : []
  if (start >= end) return { ranges, vocative }
  let from = start
  let inherit = false
  let free = false
  let hasContent = false
  let lastMeaningful = -1
  const close = (to: number, nextFrom: number, nextInherit: boolean) => {
    if (to > from) ranges.push({ from, to, inherit })
    from = nextFrom
    inherit = nextInherit
    hasContent = false
    lastMeaningful = -1
  }
  for (let i = start; i < end; i++) {
    if (!free && opensFreeText(whole, i)) free = true
    if (free || ranges.length >= MAX_CLAUSES - 1) continue
    if (i > from && newlineBefore(whole, i) && hasContent) {
      close(i, i, false)
    }
    if (separatorIsHard(whole, i)) {
      if (hasContent) close(i, i + 1, false)
      else from = i + 1
      continue
    }
    if (hasContent && isSoftSeparator(whole, i)) {
      let k = i + 1
      while (k < end && (isSoftSeparator(whole, k) || (whole.isFiller(k) && !whole.atoms[k].num && !startsCommand(whole, k)))) k++
      if (k < end) {
        const leftVerbFinal = lastMeaningful >= 0 && isActionAtom(whole, lastMeaningful) && i - from > 1 && hasActionAhead(whole, k, end)
        if (startsCommand(whole, k) || leftVerbFinal) {
          close(i, i + 1, false)
          continue
        }
        // «… y descuento 5 %», «… and a 10% discount»: comandos que se reconocen por su objeto.
        if (objectCommandAhead(whole, i + 1, end) && !objectCommandIn(whole, from, i)) {
          close(i, i + 1, false)
          continue
        }
        // «agrega una corredera … y una oscilobatiente …»: otra ventana con el mismo verbo.
        const leftAdds = (hasAddVerb(whole, from, i) || inherit) && hasProduct(whole, from, i)
        let p = i + 1
        while (p < end && (isSoftSeparator(whole, p) || (whole.isFiller(p) && !whole.atoms[p].num))) p++
        if (leftAdds && startsProduct(whole, p) && hasMeasureAhead(whole, p, end)) {
          close(i, i + 1, true)
          continue
        }
      }
    }
    if (!whole.isFiller(i)) {
      hasContent = true
      lastMeaningful = i
    }
  }
  close(end, end, false)
  return { ranges, vocative }
}

/** Hay un verbo más adelante (antes del próximo corte firme): «… ekle ve rengini ceviz yap». */
function hasActionAhead(c: Clause, from: number, to: number): boolean {
  for (let i = from; i < to; i++) {
    if (separatorIsHard(c, i)) return false
    if (isActionAtom(c, i)) return true
  }
  return false
}

function isObjectCommand(c: Clause, i: number): boolean {
  return c.is(i, 'obj.discount') || c.is(i, 'obj.margin') || c.is(i, 'obj.markup') || (c.is(i, 'obj.notes') && c.punct(i + 1, ':'))
}

/** El tramo hasta el próximo corte nombra un descuento, margen o nota («y un 10 % de descuento»). */
function objectCommandAhead(c: Clause, from: number, to: number): boolean {
  for (let i = from; i < to; i++) {
    if (isSoftSeparator(c, i) || separatorIsHard(c, i) || isActionAtom(c, i)) return false
    if (isObjectCommand(c, i)) return true
  }
  return false
}

function objectCommandIn(c: Clause, from: number, to: number): boolean {
  for (let i = from; i < to; i++) if (isObjectCommand(c, i)) return true
  return false
}

function hasAddVerb(c: Clause, from: number, to: number): boolean {
  for (let i = from; i < to; i++) if (c.is(i, 'act.add') || c.is(i, 'act.want')) return true
  return false
}

function hasProduct(c: Clause, from: number, to: number): boolean {
  for (let i = from; i < to; i++) if (c.isPrefix(i, 'fam.') || c.is(i, 'obj.window') || c.is(i, 'obj.door')) return true
  return false
}

function hasMeasureAhead(c: Clause, from: number, to: number): boolean {
  for (let i = from; i < Math.min(to, from + 8); i++) {
    if (c.atoms[i].num && !c.atoms[i].num!.weak && (c.lit(i + 1, 'x') || c.is(i + 1, 'sep.x'))) return true
    if (isSoftSeparator(c, i)) return false
  }
  return false
}
