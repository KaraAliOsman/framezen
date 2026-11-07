/**
 * Una cláusula (un comando) con sus extractores de datos: medidas, porcentajes, ítems,
 * cotizaciones, cantidades, hojas, tipología, colores, vidrio, línea, ambiente, accesorios,
 * apertura y texto libre. Cada extractor devuelve los átomos que usó; el comando los marca como
 * explicados (`use`) para medir la cobertura (ninguna palabra con significado se ignora en silencio).
 */
import type { AssemblyPresetId, OpeningKind, TypologyId } from '@dekopen/engine'
import type { Locale } from '../i18n/locales'
import { rawSpan, type Analysis, type Atom } from './analyze'
import type { EntityEntry, EntityHit, EntityIndex, EntityType } from './entities'
import { conceptSurface, conceptSurfaces, LEXICON_LOCALES } from './lexicon'
import { nameKey, readNumeric } from './text'
import type { NluExtras } from './commands'

/** Conceptos que nunca cuentan como palabras sin explicar. */
const NEUTRAL = /^(fil|pol|trg\.to)$/
const CONJ = new Set(['y', 'e', 'and', 'et', 'und', 've', 'ed', 'poi', 'luego', 'despues', 'ademas', 'then', 'also', 'dann', 'puis', 'ensuite', 'sonra', 'inoltre', 'depois', 'tambien', 'plus', 'ayrica', 'au', 'ou'])
const MONEY_SYMBOLS = new Set(['$', '€', '₺', '£'])

export interface Measure {
  width?: number
  height?: number
  atoms: number[]
  /** Unidad supuesta por magnitud (sin unidad escrita). */
  inferred?: 'cm' | 'm'
  /** Lo que escribió la persona («60 × 120») para el aviso del supuesto. */
  written?: string
  /** Tercer número pegado («1500x1200x3»): ambiguo. */
  third?: boolean
  /** «1.500» leído como miles en metros… */
  ambiguous?: boolean
}

export interface ColorPick {
  id?: string
  name: string
  concept?: string
  /** Varias entradas del catálogo calzan (elige la persona). */
  choices?: EntityEntry[]
  atoms: number[]
}

export interface GlassPick {
  id?: string
  name: string
  concepts: string[]
  recipe?: string
  choices?: EntityEntry[]
  atoms: number[]
}

export interface TypologyPick {
  id?: TypologyId
  /** Familia reconocida (para pedir lo que falta). */
  family?: string
  /** Faltan hojas (plegables) o no existe la combinación. */
  missingPanels?: boolean
  /** Opciones válidas cuando falta un dato. */
  options?: TypologyId[]
  atoms: number[]
  /** Índice del primer átomo de la tipología (para cantidades «3 correderas»). */
  at: number
}

export interface TargetPick {
  ref?: string
  items?: string[]
  all?: boolean
  atoms: number[]
  found: boolean
}

export interface ParseEnv {
  locale: Locale
  entities: EntityIndex
  quoteOpen?: boolean
  selectedRef?: string
}

/** Superficies plegadas de cada concepto de color en todos los idiomas (para cruzar con el catálogo). */
const colorAliasCache = new Map<string, string[]>()
export function colorAliases(concept: string): string[] {
  let list = colorAliasCache.get(concept)
  if (!list) {
    const set = new Set<string>()
    for (const l of LEXICON_LOCALES) for (const s of conceptSurfaces(concept, l)) set.add(nameKey(s))
    list = [...set].filter((s) => s.length >= 3)
    colorAliasCache.set(concept, list)
  }
  return list
}

/** Texturas integradas que corresponden a cada concepto de color. */
export const COLOR_TEXTURES: Record<string, readonly string[]> = {
  'col.white': ['white_9016'],
  'col.cream': ['cream_9001'],
  'col.grey': ['grey_7035'],
  'col.quartz_grey': ['quartz_grey_7039'],
  'col.anthracite': ['anthracite_7016_smooth', 'anthracite_7016_woodgrain', 'anthracite_7016_sand'],
  'col.black': ['black_9005'],
  'col.black_brown': ['black_brown_8022'],
  'col.green': ['chartwell_green'],
  'col.golden_oak': ['golden_oak'],
  'col.walnut': ['nut_tree'],
  'col.mahogany': ['mahogany'],
  'col.winchester': ['winchester'],
  'col.sheffield_oak': ['sheffield_oak'],
  'col.irish_oak': ['irish_oak'],
  'col.silver': ['metbrush_silver'],
}

/** Nombre en español de un concepto de vidrio, como lo entiende el ejecutor v4. */
const GLASS_V4: Record<string, string> = {
  'gls.double': 'termopanel',
  'gls.low_e': 'low-e',
  'gls.laminated': 'laminado',
  'gls.tempered': 'templado',
  'gls.single': 'simple',
  'gls.triple': 'triple vidriado',
  'gls.acoustic': 'acústico',
  'gls.solar_control': 'control solar',
  'gls.reflective': 'reflectivo',
}
/** Prioridad de los conceptos de vidrio cuando hay varios (el más específico primero). */
const GLASS_PRIORITY = ['gls.low_e', 'gls.triple', 'gls.double', 'gls.laminated', 'gls.tempered', 'gls.frosted', 'gls.acoustic', 'gls.solar_control', 'gls.reflective', 'gls.single']

const SIMPLE_OPENING: Partial<Record<TypologyId, OpeningKind>> = {
  fixed: 'fixed',
  casement: 'casement',
  tilt_turn: 'tilt_turn',
  tilt: 'tilt',
  awning: 'awning',
  door: 'door',
  pivot_v: 'pivot_v',
  pivot_h: 'pivot_h',
}

export function simpleOpening(id: TypologyId | undefined): OpeningKind | undefined {
  return id ? SIMPLE_OPENING[id] : undefined
}

/** Concepto del léxico → plantilla del motor (`asm.coupled` se ajusta por cantidad: 2 o 3 ventanas). */
export type AssemblyPick = AssemblyPresetId
export const ASSEMBLY_CONCEPTS: readonly (readonly [string, AssemblyPick])[] = [
  ['asm.corner_variable', 'corner_variable'],
  ['asm.bow', 'bow'],
  ['asm.bay', 'bay'],
  ['asm.corner', 'corner_90'],
  ['asm.door_combo', 'coupled_mixed'],
  ['asm.stack', 'coupled_stack'],
  ['asm.coupled', 'coupled_2'],
]

/** Nombre del conjunto en un idioma: «bay window», «2 ventanas unidas». */
export function assemblyLabel(preset: AssemblyPick, locale: Locale): string {
  const coupled = preset === 'coupled_2' ? 2 : preset === 'coupled_3' ? 3 : 0
  const concept = coupled ? 'asm.coupled' : ASSEMBLY_CONCEPTS.find(([, id]) => id === preset)?.[0]
  const name = concept ? conceptSurface(concept, locale) : undefined
  return coupled && name ? `${coupled} ${name}` : (name ?? preset)
}

export class Clause {
  readonly used = new Set<number>()
  /** Átomos leídos como texto libre (títulos, nombres, recuerdos): sin correcciones de tipeo. */
  readonly textAtoms = new Set<number>()

  constructor(
    readonly an: Analysis,
    readonly from: number,
    readonly to: number,
    readonly env: ParseEnv,
    private readonly conceptCache = new Map<number, Set<string>>(),
  ) {}

  /** Misma cláusula sin átomos usados (cada gramática prueba desde cero; comparte la caché). */
  fresh(): Clause {
    return new Clause(this.an, this.from, this.to, this.env, this.conceptCache)
  }

  // ── Consultas básicas ──

  get atoms(): Atom[] {
    return this.an.atoms
  }

  *indices(): Generator<number> {
    for (let i = this.from; i < this.to; i++) yield i
  }

  concepts(i: number): Set<string> {
    let set = this.conceptCache.get(i)
    if (!set) {
      set = new Set(this.atoms[i].hits.map((h) => h.c))
      this.conceptCache.set(i, set)
    }
    return set
  }

  is(i: number, concept: string): boolean {
    return i >= this.from && i < this.to && this.concepts(i).has(concept)
  }

  isPrefix(i: number, prefix: string): boolean {
    if (i < this.from || i >= this.to) return false
    for (const c of this.concepts(i)) if (c.startsWith(prefix)) return true
    return false
  }

  /** Primer átomo con el concepto (o -1). */
  find(concept: string, from = this.from): number {
    for (let i = Math.max(from, this.from); i < this.to; i++) if (this.concepts(i).has(concept)) return i
    return -1
  }

  findAny(concepts: readonly string[], from = this.from): number {
    for (let i = Math.max(from, this.from); i < this.to; i++) for (const c of concepts) if (this.concepts(i).has(c)) return i
    return -1
  }

  has(...concepts: string[]): boolean {
    return this.findAny(concepts) >= 0
  }

  /** Conceptos con un prefijo, en orden de aparición. */
  withPrefix(prefix: string): { i: number; c: string }[] {
    const out: { i: number; c: string }[] = []
    for (let i = this.from; i < this.to; i++) for (const c of this.concepts(i)) if (c.startsWith(prefix)) out.push({ i, c })
    return out
  }

  hasPrefix(prefix: string): boolean {
    for (let i = this.from; i < this.to; i++) if (this.isPrefix(i, prefix)) return true
    return false
  }

  /** Átomos de puntuación o relleno puro. */
  isFiller(i: number): boolean {
    const a = this.atoms[i]
    if (a.kind === 'punct') return true
    if (a.kind !== 'concept' && a.kind !== 'number') return false
    if (a.kind === 'number' && !a.num?.weak) return false
    const cs = this.concepts(i)
    if (!cs.size) return false
    for (const c of cs) if (NEUTRAL.test(c)) return true
    return false
  }

  /** Siguiente átomo significativo (salta relleno). */
  next(i: number, skipFiller = true): number {
    for (let j = i + 1; j < this.to; j++) if (!skipFiller || !this.isFiller(j)) return j
    return -1
  }

  prev(i: number, skipFiller = true): number {
    for (let j = i - 1; j >= this.from; j--) if (!skipFiller || !this.isFiller(j)) return j
    return -1
  }

  lit(i: number, kind?: string): boolean {
    const a = this.atoms[i]
    return !!a && i >= this.from && i < this.to && a.kind === 'literal' && (!kind || a.lit!.kind === kind)
  }

  punct(i: number, chars?: string): boolean {
    const a = this.atoms[i]
    if (!a || i < this.from || i >= this.to || a.kind !== 'punct') return false
    return !chars || chars.includes(this.an.tokens[a.s].raw)
  }

  num(i: number): number | undefined {
    const a = this.atoms[i]
    return a && i >= this.from && i < this.to ? a.num?.value : undefined
  }

  /** Número «fuerte» (cifras o palabras que no son artículo). */
  strongNum(i: number): boolean {
    const a = this.atoms[i]
    return !!a && i >= this.from && i < this.to && !!a.num && !a.num.weak && !this.used.has(i)
  }

  raw(i: number): string {
    const a = this.atoms[i]
    return rawSpan(this.an, a.s, a.e)
  }

  fold(i: number): string {
    const a = this.atoms[i]
    return this.an.tokens
      .slice(a.s, a.e)
      .map((t) => t.fold)
      .join(' ')
  }

  /** Texto original entre dos átomos [i, j). */
  rawRange(i: number, j: number): string {
    if (j <= i) return ''
    return rawSpan(this.an, this.atoms[i].s, this.atoms[j - 1].e)
  }

  start(): number {
    return this.from < this.to ? this.an.tokens[this.atoms[this.from].s].start : 0
  }

  end(): number {
    return this.from < this.to ? this.an.tokens[this.atoms[this.to - 1].e - 1].end : 0
  }

  use(...list: (number | number[] | undefined)[]): void {
    for (const x of list) {
      if (x === undefined) continue
      if (Array.isArray(x)) for (const i of x) this.used.add(i)
      else if (x >= 0) this.used.add(x)
    }
  }

  /** Marca todos los átomos con alguno de los conceptos o prefijos dados. */
  useConcepts(...prefixes: string[]): void {
    for (let i = this.from; i < this.to; i++) {
      for (const c of this.concepts(i)) {
        if (prefixes.some((p) => (p.endsWith('.') ? c.startsWith(p) : c === p))) {
          this.used.add(i)
          break
        }
      }
    }
  }

  meaningful(): number[] {
    const out: number[] = []
    for (let i = this.from; i < this.to; i++) if (!this.isFiller(i)) out.push(i)
    return out
  }

  /** Átomos con significado que ningún extractor usó. */
  unexplained(extraNeutral: readonly string[] = []): number[] {
    const out: number[] = []
    for (let i = this.from; i < this.to; i++) {
      if (this.used.has(i) || this.isFiller(i)) continue
      const cs = this.concepts(i)
      if (cs.size && [...cs].some((c) => extraNeutral.some((p) => (p.endsWith('.') ? c.startsWith(p) : c === p)))) continue
      if (this.atoms[i].kind === 'number' && this.atoms[i].num?.weak) continue
      // Conjunciones sueltas («y», «and») no cuentan.
      if (this.atoms[i].e - this.atoms[i].s === 1 && CONJ.has(this.an.tokens[this.atoms[i].s].fold)) continue
      out.push(i)
    }
    return out
  }

  /** Átomos con corrección de tipeo usados. */
  fuzzyUsed(): number {
    let n = 0
    for (const i of this.used) if (this.atoms[i].fuzzy) n++
    return n
  }

  /** Pregunta: «¿…?», o empieza con una palabra interrogativa. */
  isQuestion(): boolean {
    const first = this.from < this.to ? this.an.tokens[this.atoms[this.from].s] : undefined
    const lastAtom = this.to - 1
    if (first?.raw === '¿' || this.punct(lastAtom, '?')) return true
    // Signos fuera del rango de la cláusula (la división los deja afuera).
    const before = this.atoms[this.from - 1]
    const after = this.atoms[this.to]
    if (before?.kind === 'punct' && this.an.tokens[before.s].raw === '¿') return true
    if (after?.kind === 'punct' && this.an.tokens[after.s].raw === '?') return true
    const m = this.meaningful()[0]
    return m !== undefined && this.isPrefix(m, 'q.')
  }

  // ── Entidades ──

  entityAt(i: number, type: EntityType, exactOnly = false): EntityHit[] {
    const a = this.atoms[i]
    if (!a || i < this.from || i >= this.to) return []
    return a.ents.filter((h) => h.type === type && (!exactOnly || h.exact))
  }

  findEntity(type: EntityType, exactOnly = false): { i: number; hits: EntityHit[] } | null {
    for (let i = this.from; i < this.to; i++) {
      if (this.used.has(i)) continue
      const hits = this.entityAt(i, type, exactOnly)
      if (hits.length) return { i, hits }
    }
    return null
  }

  entry(hit: EntityHit): EntityEntry {
    return this.env.entities.lists[hit.type][hit.idx]
  }

  // ── Medidas ──

  private unitAt(i: number): 'mm' | 'cm' | 'm' | 'in' | null {
    if (i < this.from || i >= this.to) return null
    const cs = this.concepts(i)
    if (cs.has('unit.mm')) return 'mm'
    if (cs.has('unit.cm')) return 'cm'
    if (cs.has('unit.m')) return 'm'
    if (cs.has('unit.in')) {
      // «in» también es preposición («1500x1200 in Nussbaum», «in walnut»): pulgadas solo al final.
      if (this.fold(i) === 'in') {
        const n = this.next(i, false)
        if (n >= 0 && this.atoms[n].kind !== 'punct' && !this.atoms[n].num) return null
      }
      return 'in'
    }
    return null
  }

  private isSep(i: number): boolean {
    return this.lit(i, 'x') || this.is(i, 'sep.x')
  }

  private readMeasure(i: number, unit: string | null): number | undefined {
    const a = this.atoms[i]
    if (!a.num) return undefined
    if (a.num.raw) {
      const r = readNumeric(a.num.raw, unit === 'm')
      return r?.value
    }
    return a.num.value
  }

  private static factor(unit: string | null): number | null {
    switch (unit) {
      case 'mm':
        return 1
      case 'cm':
        return 10
      case 'm':
        return 1000
      case 'in':
        return 25.4
      default:
        return null
    }
  }

  /** Sin unidad: < 10 son metros, < 400 centímetros, desde 400 milímetros (supuesto visible). */
  private static infer(max: number): { factor: number; unit?: 'cm' | 'm' } {
    if (max < 10) return { factor: 1000, unit: 'm' }
    if (max < 400) return { factor: 10, unit: 'cm' }
    return { factor: 1 }
  }

  private isMeasureNum(i: number): boolean {
    const a = this.atoms[i]
    return !!a && i >= this.from && i < this.to && !!a.num && !this.used.has(i) && (!a.num.words || !a.num.weak) && a.num.value > 0
  }

  /** Ancho × alto: «1500x1200», «150 por 120 cm», «1,5 m x 120 cm», «ancho 1500 alto 1200», «mil quinientos por mil doscientos». */
  measure(): Measure | null {
    const round = (v: number) => Math.round(v * 10) / 10
    // Par: NUM [UNIT] SEP NUM [UNIT]
    for (let i = this.from; i < this.to; i++) {
      if (!this.isMeasureNum(i)) continue
      let j = i + 1
      const unitA = this.unitAt(j)
      if (unitA) j++
      if (!this.isSep(j)) continue
      const k = j + 1
      if (!this.isMeasureNum(k)) continue
      let l = k + 1
      const unitB = this.unitAt(l)
      if (unitB) l++
      const atoms = [i, j, k]
      if (unitA) atoms.push(i + 1)
      if (unitB) atoms.push(k + 1)
      const shared = unitB ?? unitA
      const a = this.readMeasure(i, unitA ?? shared)
      const b = this.readMeasure(k, unitB ?? shared)
      if (a === undefined || b === undefined) continue
      // «1500x1200x3» (pegado) es ambiguo; «1500x1200 x3» (con espacio) es una cantidad.
      const third = this.isSep(l) && this.isMeasureNum(l + 1) && l < this.to && !this.an.tokens[this.atoms[l].s].space
      const fa = Clause.factor(unitA ?? shared)
      const fb = Clause.factor(unitB ?? shared)
      const written = `${this.raw(i)} × ${this.raw(k)}`
      if (fa !== null && fb !== null) return { width: round(a * fa), height: round(b * fb), atoms, third }
      const inf = Clause.infer(Math.max(a, b))
      return { width: round(a * inf.factor), height: round(b * inf.factor), atoms, inferred: inf.unit, written, third }
    }
    // Rótulos: «ancho 1500», «1800 de ancho», «height 1200 width 1500 mm».
    const labeled = (label: string): { value: number; atoms: number[]; inferred?: 'cm' | 'm'; written: string } | null => {
      for (let i = this.from; i < this.to; i++) {
        if (!this.is(i, label)) continue
        // Después del rótulo (saltando «de», «:», «=»).
        let j = i + 1
        while (j < this.to && (this.isFiller(j) || this.punct(j, ':='))) {
          if (this.isMeasureNum(j)) break
          j++
        }
        let n = this.isMeasureNum(j) ? j : -1
        if (n < 0) {
          // Antes del rótulo: «1800 de ancho».
          let p = i - 1
          while (p >= this.from && this.isFiller(p) && !this.isMeasureNum(p)) p--
          if (p >= this.from && this.unitAt(p)) p--
          if (this.isMeasureNum(p)) n = p
        }
        if (n < 0) continue
        let unit = this.unitAt(n + 1)
        const atoms = [i, n]
        if (unit) atoms.push(n + 1)
        else {
          // Unidad compartida al final: «height 1200 width 1500 mm».
          for (let q = n + 1; q < this.to; q++) {
            const u = this.unitAt(q)
            if (u) {
              unit = u
              break
            }
            if (this.isPrefix(q, 'act.')) break
          }
        }
        const v = this.readMeasure(n, unit)
        if (v === undefined) continue
        const f = Clause.factor(unit)
        if (f !== null) return { value: round(v * f), atoms, written: this.raw(n) }
        const inf = Clause.infer(v)
        return { value: round(v * inf.factor), atoms, inferred: inf.unit, written: this.raw(n) }
      }
      return null
    }
    const w = labeled('lbl.width')
    if (w) w.atoms.forEach((x) => this.used.add(x))
    const h = labeled('lbl.height')
    if (w) w.atoms.forEach((x) => this.used.delete(x))
    if (w || h) {
      const inferred = w?.inferred ?? h?.inferred
      const written = [w?.written, h?.written].filter(Boolean).join(' · ')
      return { width: w?.value, height: h?.value, atoms: [...(w?.atoms ?? []), ...(h?.atoms ?? [])], inferred, written }
    }
    return null
  }

  /** «una corredera de 1500» → solo ancho (si no es cantidad, hojas ni porcentaje). */
  loneWidth(): Measure | null {
    for (let i = this.from; i < this.to; i++) {
      if (!this.isMeasureNum(i) || this.atoms[i].num!.words) continue
      const prev = this.prev(i, false)
      const prevFold = prev >= 0 ? this.fold(prev) : ''
      if (!['de', 'mide', 'medida', 'of', 'da', 'von', 'mit', 'avec'].includes(prevFold)) continue
      const nxt = this.next(i, false)
      if (nxt >= 0 && (this.isPrefix(nxt, 'pan.') || this.is(nxt, 'unit.pct') || this.lit(nxt, 'pct') || this.isPrefix(nxt, 'qty.') || this.isPrefix(nxt, 'obj.window') || this.isPrefix(nxt, 'fam.'))) continue
      const unit = this.unitAt(i + 1)
      const v = this.readMeasure(i, unit)
      if (v === undefined) continue
      const f = Clause.factor(unit)
      if (f === null && v < 30) continue
      const factor = f ?? Clause.infer(v).factor
      const atoms = unit ? [prev, i, i + 1] : [prev, i]
      return { width: Math.round(v * factor * 10) / 10, atoms }
    }
    return null
  }

  // ── Porcentajes ──

  /** Porcentaje explícito: «10%», «%10», «diez por ciento», «yüzde 10». */
  percent(): { value: number; atoms: number[] } | null {
    for (let i = this.from; i < this.to; i++) {
      const a = this.atoms[i]
      if (a.num && !this.used.has(i)) {
        const nxt = i + 1
        if (this.lit(nxt, 'pct') || this.is(nxt, 'unit.pct')) {
          const v = a.num.raw ? readNumeric(a.num.raw, true)?.value : a.num.value
          if (v !== undefined) return { value: v, atoms: [i, nxt] }
        }
      }
      if ((this.lit(i, 'pct') || this.is(i, 'unit.pct')) && this.atoms[i + 1]?.num && i + 1 < this.to) {
        const b = this.atoms[i + 1]
        const v = b.num!.raw ? readNumeric(b.num!.raw, true)?.value : b.num!.value
        if (v !== undefined) return { value: v, atoms: [i, i + 1] }
      }
    }
    return null
  }

  /**
   * Número suelto tras una palabra (descuento 12 · margen del 30): 'amount' si parece un monto
   * (separador de miles, «$», «pesos», «mil», «lucas» o más de 100).
   */
  loosePercent(afterAtom: number): { value: number; atoms: number[] } | { amount: true; atoms: number[] } | null {
    for (let i = afterAtom + 1; i < this.to; i++) {
      const a = this.atoms[i]
      if (this.punct(i) && MONEY_SYMBOLS.has(this.an.tokens[a.s].raw)) {
        if (this.atoms[i + 1]?.num) return { amount: true, atoms: [i, i + 1] }
        continue
      }
      if (!a.num || this.used.has(i)) {
        if (this.isPrefix(i, 'act.') || this.isPrefix(i, 'obj.')) break
        continue
      }
      if (a.num.words && a.num.weak) continue
      const atoms = [i]
      const nxt = i + 1
      if (nxt < this.to && (this.is(nxt, 'cur.money') || (this.punct(nxt) && MONEY_SYMBOLS.has(this.an.tokens[this.atoms[nxt].s].raw)))) return { amount: true, atoms: [i, nxt] }
      if (nxt < this.to && this.atoms[nxt].num?.words && this.atoms[nxt].num?.value === 1000) return { amount: true, atoms: [i, nxt] }
      if (a.num.raw) {
        const r = readNumeric(a.num.raw)
        if (!r) return { amount: true, atoms }
        if (r.ambiguous || /^\d{1,3}([.,]\d{3})+$/.test(a.num.raw)) return { amount: true, atoms }
        return r.value > 100 ? { amount: true, atoms } : { value: r.value, atoms }
      }
      return a.num.value > 100 ? { amount: true, atoms } : { value: a.num.value, atoms }
    }
    return null
  }

  // ── Ítems de la cotización ──

  /** «V2», «ítem 2», «Position 2», «2. kalem», «V1 a V4», «todas», «la última», «la segunda». */
  target(options: { allowAll?: boolean } = {}): TargetPick {
    const atoms: number[] = []
    const refs: string[] = []
    const add = (n: number) => {
      const r = `V${n}`
      if (!refs.includes(r)) refs.push(r)
    }
    for (let i = this.from; i < this.to; i++) {
      if (this.used.has(i)) continue
      if (this.lit(i, 'vref')) {
        // Rango: «V1 a V4», «de la V1 a la V3».
        const n = this.atoms[i].lit!.value!
        let j = i + 1
        let range = false
        while (j < this.to && (this.isFiller(j) || this.punct(j, '-')) && !this.lit(j, 'vref')) {
          if (['a', 'al', 'hasta', 'to', 'through', 'bis', 'ate', 'fino', 'kadar', 'au', 'jusqu', 'alla', 'al', '-'].includes(this.fold(j))) range = true
          j++
        }
        if (this.lit(j, 'vref') && range) {
          const m = this.atoms[j].lit!.value!
          if (m >= n && m - n < 60) {
            for (let k = n; k <= m; k++) add(k)
            atoms.push(i, j)
            i = j
            continue
          }
        }
        add(n)
        atoms.push(i)
        continue
      }
      // «ítem 2», «ventana 2», «item #2», «Position 2»
      if (this.is(i, 'obj.item') || this.is(i, 'obj.window')) {
        const j = i + 1
        const n = this.atoms[j]?.num?.raw ? Number(this.atoms[j].num!.raw) : this.atoms[j]?.lit?.kind === 'hash' ? this.atoms[j].lit!.value : undefined
        if (j < this.to && n !== undefined && Number.isInteger(n) && n > 0 && n < 1000) {
          const after = j + 1
          // «ventana 2 hojas», «ítem 2 x 3», «2 mm»: no es una referencia. «in»/«par»/«auf» sin número detrás sí lo es.
          const unit = this.isPrefix(after, 'unit.') && !this.isFiller(after) && !this.is(after, 'trg.to')
          const nextNum = this.atoms[after + 1]?.num
          const sep = this.isSep(after) && after + 1 < this.to && !!nextNum && !nextNum.weak && !this.isPrefix(after + 2, 'qty.')
          const blocked = after < this.to && (this.isPrefix(after, 'pan.') || unit || sep || this.lit(after, 'pct') || this.is(after, 'qty.copies'))
          if (!blocked) {
            add(n)
            atoms.push(i, j)
            continue
          }
        }
      }
      // Turco: «2. kalemi»
      if (this.atoms[i].num?.raw && this.punct(i + 1, '.') && this.is(i + 2, 'obj.item')) {
        add(Number(this.atoms[i].num!.raw))
        atoms.push(i, i + 1, i + 2)
        i += 2
        continue
      }
    }
    if (refs.length) return { ref: refs.length === 1 ? refs[0] : undefined, items: refs.length > 1 ? refs : undefined, atoms, found: true }
    if (options.allowAll !== false) {
      const all = this.find('scp.all')
      if (all >= 0) return { all: true, atoms: [all], found: true }
    }
    const nextIsPane = (i: number) => {
      const n = this.next(i)
      return n >= 0 && this.isPrefix(n, 'pan.')
    }
    const last = this.find('scp.last')
    if (last >= 0 && !nextIsPane(last) && !this.has('obj.action')) return { ref: '#-1', atoms: [last], found: true }
    const first = this.find('scp.first')
    if (first >= 0 && !nextIsPane(first) && !this.hasPrefix('pan.')) return { ref: '#1', atoms: [first], found: true }
    for (const { i, c } of this.withPrefix('ord.')) {
      if (nextIsPane(i)) continue
      return { ref: `#${c.slice(4)}`, atoms: [i], found: true }
    }
    return { atoms: [], found: false }
  }

  // ── Cotizaciones ──

  /** «#123», «cotización 412», «N° 38», una cotización por su título, o «de los Pérez» (texto). */
  quoteRef(): { number?: number; quoteId?: string; query?: string; atoms: number[] } | null {
    for (let i = this.from; i < this.to; i++) {
      if (this.lit(i, 'hash')) return { number: this.atoms[i].lit!.value, atoms: [i] }
    }
    const qi = this.find('obj.quote')
    for (let i = this.from; i < this.to; i++) {
      if (!(this.is(i, 'obj.quote') || this.is(i, 'obj.number'))) continue
      let j = i + 1
      if (this.is(j, 'obj.number')) j++
      const a = this.atoms[j]
      if (j < this.to && a?.num?.raw && /^\d{1,7}$/.test(a.num.raw)) {
        const after = j + 1
        if (after < this.to && (this.isSep(after) || this.isPrefix(after, 'unit.') || this.isPrefix(after, 'pan.'))) continue
        return { number: Number(a.num.raw), atoms: j > i + 1 ? [i, i + 1, j] : [i, j] }
      }
    }
    const ent = this.findEntity('quote', true)
    if (ent && ent.hits.length === 1) return { quoteId: this.entry(ent.hits[0]).id, atoms: [ent.i] }
    if (qi >= 0) {
      // «la cotización de los Pérez», «el presupuesto para Soto»
      const de = qi + 1
      if (de < this.to && ['de', 'del', 'para', 'of', 'for', 'do', 'da', 'von', 'für', 'di', 'per', 'du'].includes(this.fold(de))) {
        const text = this.freeText(de + 1)
        if (text.text) return { query: text.text, atoms: [qi, de, ...text.atoms] }
      }
      const quoted = this.findLiteral('quoted', qi)
      if (quoted >= 0) return { query: this.atoms[quoted].lit!.raw, atoms: [qi, quoted] }
    }
    return null
  }

  // ── Cantidad y hojas ──

  /** Hojas, paños y rieles por separado: «3 hojas, 3 rieles», «2-panel», «2 Flügeln», «2 kanatlı», «doble hoja». */
  panelSpecs(): Partial<Record<'leaf' | 'pane' | 'rail', { count: number; atoms: number[] }>> {
    const out: Partial<Record<'leaf' | 'pane' | 'rail', { count: number; atoms: number[] }>> = {}
    for (let i = this.from; i < this.to; i++) {
      const a = this.atoms[i]
      // «un ouvrant», «una hoja»: el artículo no es una cantidad de hojas.
      if (!a.num || a.num.weak || this.used.has(i)) continue
      let j = i + 1
      if (this.punct(j, '-')) j++
      for (const noun of ['leaf', 'pane', 'rail'] as const) {
        if (out[noun] || !this.is(j, `pan.${noun}`)) continue
        const v = a.num.value
        if (Number.isInteger(v) && v >= 1 && v <= 8) out[noun] = { count: v, atoms: j > i + 1 ? [i, i + 1, j] : [i, j] }
      }
    }
    if (!out.leaf) {
      const dbl = this.find('mod.double')
      if (dbl >= 0) out.leaf = { count: 2, atoms: [dbl] }
    }
    return out
  }

  /** Primera especificación de hojas/paños/rieles (compatibilidad). */
  panels(): { count: number; atoms: number[]; noun: 'leaf' | 'pane' | 'rail' } | null {
    const specs = this.panelSpecs()
    for (const noun of ['leaf', 'pane', 'rail'] as const) {
      const spec = specs[noun]
      if (spec) return { ...spec, noun }
    }
    return null
  }

  /** Cantidad de unidades: «3 ventanas», «cantidad 4», «x3», «5 Stück», «que sean 3». */
  quantity(typologyAt = -1): { qty: number; atoms: number[]; conflict?: boolean } | null {
    const found: { qty: number; atoms: number[] }[] = []
    const valid = (v: number | undefined) => v !== undefined && Number.isInteger(v) && v >= 1 && v <= 999
    for (let i = this.from; i < this.to; i++) {
      if (this.used.has(i)) continue
      // «cantidad 4», «qty 3», «Menge 5»
      if (this.is(i, 'qty.label')) {
        let j = i + 1
        while (j < this.to && this.isFiller(j) && !this.atoms[j].num) j++
        if (valid(this.num(j)) && !this.used.has(j)) {
          found.push({ qty: this.num(j)!, atoms: [i, j] })
          continue
        }
        // «5 unidades», «3 adet», «5 Stück»
        const p = this.prev(i, false)
        if (p >= 0 && valid(this.num(p)) && !this.used.has(p)) found.push({ qty: this.num(p)!, atoms: [p, i] })
        continue
      }
      // «x3» (no entre dos medidas)
      if (this.lit(i, 'x') && valid(this.num(i + 1)) && !this.used.has(i + 1) && !(this.atoms[i - 1]?.num && i - 1 >= this.from && !this.used.has(i - 1))) {
        found.push({ qty: this.num(i + 1)!, atoms: [i, i + 1] })
      }
    }
    // Número antes del producto o la tipología: «3 ventanas correderas», «dos oscilobatientes», «3 weiße Schiebefenster».
    const productAt = (i: number) => this.isPrefix(i, 'fam.') || this.isPrefix(i, 'asm.') || this.is(i, 'obj.window') || this.is(i, 'obj.door')
    for (let i = this.from; i < this.to; i++) {
      const a = this.atoms[i]
      if (!a.num || this.used.has(i) || !valid(a.num.value)) continue
      // Salta relleno, colores, vidrios y especificaciones de hojas («3 white 2-panel sliding windows»).
      let j = i + 1
      let hops = 0
      while (j < this.to && hops < 6 && !productAt(j)) {
        const panelSpec = !!this.atoms[j].num && (this.isPrefix(j + 1, 'pan.') || (this.punct(j + 1, '-') && this.isPrefix(j + 2, 'pan.')))
        const skippable = this.isFiller(j) || this.isPrefix(j, 'col.') || this.isPrefix(j, 'gls.') || this.isPrefix(j, 'pan.') || this.isPrefix(j, 'mod.') || panelSpec
        if (!skippable) break
        if (panelSpec) j += this.punct(j + 1, '-') ? 2 : 1
        j++
        hops++
      }
      if (j < this.to && productAt(j) && (typologyAt < 0 || j <= typologyAt + 1 || productAt(j))) {
        // «2 hojas» después de la tipología no es cantidad (lo atrapa `panels`).
        if (this.isPrefix(i + 1, 'pan.')) continue
        if (a.num.weak && a.num.value === 1) {
          found.push({ qty: 1, atoms: [i] })
          continue
        }
        found.push({ qty: a.num.value, atoms: [i] })
      }
    }
    if (!found.length) return null
    const distinct = [...new Set(found.map((f) => f.qty).filter((q) => q !== 1))]
    const best = found.find((f) => f.qty !== 1) ?? found[0]
    return { qty: best.qty, atoms: found.flatMap((f) => f.atoms), conflict: distinct.length > 1 }
  }

  // ── Tipología ──

  /** Familias + modificadores + hojas → id de tipología del motor. */
  typology(): TypologyPick | null {
    const fams = this.withPrefix('fam.').filter((f) => !this.used.has(f.i))
    if (!fams.length) return null
    // «Fija el margen», «Fixe la marge»: «fija» al inicio que también es verbo es el verbo, no la familia.
    const firstMeaningful = this.meaningful()[0]
    const famAtoms = new Map<number, string[]>()
    for (const f of fams) {
      if (f.c === 'fam.fixed' && f.i === firstMeaningful && this.is(f.i, 'act.set')) continue
      // «puerta» es a la vez objeto y familia; con «balconera/de acceso» manda la más específica.
      famAtoms.set(f.i, [...(famAtoms.get(f.i) ?? []), f.c])
    }
    if (!famAtoms.size) return null
    const ordered: { i: number; c: string }[] = []
    for (const [i, cs] of famAtoms) {
      const pick = cs.find((c) => c !== 'fam.door' && c !== 'fam.fixed') ?? cs.find((c) => c === 'fam.door') ?? cs[0]
      ordered.push({ i, c: pick })
    }
    ordered.sort((a, b) => a.i - b.i)
    const set = new Set(ordered.map((o) => o.c))
    const atoms = ordered.map((o) => o.i)
    const at = ordered[0].i
    const specs = this.panelSpecs()
    const n = specs.leaf?.count
    const rails = specs.rail?.count
    const panes = specs.pane?.count
    const mod = (m: string) => {
      const i = this.find(m)
      if (i >= 0) atoms.push(i)
      return i >= 0
    }
    const usePanels = () => {
      for (const spec of [specs.leaf, specs.pane, specs.rail]) if (spec) atoms.push(...spec.atoms)
    }
    const done = (id: TypologyId): TypologyPick => ({ id, atoms, at, family: ordered[0].c })
    const has = (c: string) => set.has(c)
    const outward = () => {
      const i = this.findAny(['dir.out', 'side.out'])
      if (i >= 0 && ordered.some((o) => o.c === 'fam.casement' && Math.abs(o.i - i) <= 3)) {
        atoms.push(i)
        return true
      }
      return false
    }

    // Formas
    if (has('fam.arch_segmental')) return done('arch_segmental')
    if (has('fam.arch')) {
      if (has('fam.casement') || has('fam.tilt_turn') || specs.leaf || this.has('pan.leaf')) {
        mod('mod.transom')
        const leaf = this.find('pan.leaf')
        if (leaf >= 0) atoms.push(leaf)
        return done('arch_casement')
      }
      return done('arch')
    }
    for (const [c, id] of [
      ['fam.round', 'round'],
      ['fam.oval', 'oval'],
      ['fam.pentagon', 'pentagon'],
      ['fam.octagon', 'octagon'],
      ['fam.gable', 'gable'],
      ['fam.triangle', 'triangle'],
      ['fam.trapezoid', 'trapezoid'],
    ] as const) {
      if (has(c)) return done(id)
    }
    if (has('fam.louver')) return done('louver_fixed')
    // Guillotina: corredera vertical
    if (has('fam.vertical_sliding_double')) return done('vertical_sliding_double')
    if (has('fam.vertical_sliding')) {
      usePanels()
      return done(mod('mod.double') || n === 2 ? 'vertical_sliding_double' : 'vertical_sliding')
    }
    // Sistemas deslizantes especiales
    if (has('fam.lift_slide')) {
      usePanels()
      return done(n === 3 ? 'lift_slide_3' : n === 4 ? 'lift_slide_4' : 'lift_slide_2')
    }
    if (has('fam.tilt_slide')) {
      usePanels()
      return done(n !== undefined && n >= 2 ? 'tilt_slide_2' : 'tilt_slide')
    }
    if (has('fam.parallel_slide') && !has('fam.folding')) return done('parallel_slide')
    if (has('fam.folding')) {
      usePanels()
      if (n !== undefined && n >= 3 && n <= 7) return done(`folding_${n}` as TypologyId)
      return { family: 'fam.folding', missingPanels: true, options: ['folding_3', 'folding_4', 'folding_5', 'folding_6', 'folding_7'], atoms, at }
    }
    if (has('fam.mono_rail')) return done('sliding_mono')
    if (has('fam.triple_rail')) return done('sliding_3_rail')
    if (has('fam.sliding')) {
      usePanels()
      // «hoja + fijo», «fixed center panels»: los sustantivos de hojas sin número también quedan explicados.
      for (let k = this.from; k < this.to; k++) if (this.isPrefix(k, 'pan.') && !this.used.has(k)) atoms.push(k)
      if (rails === 3) return done('sliding_3_rail')
      if (rails === 1) return done('sliding_mono')
      const center = mod('mod.center_fixed')
      if (n === 1 || mod('mod.with_fixed') || has('fam.fixed')) return done('sliding_2_fixed')
      if (n === 3) return done(center ? 'sliding_3_center_fixed' : 'sliding_3')
      if (n === 4) return done(center ? 'sliding_4_center_fixed' : 'sliding_4')
      if (n === 6) return done('sliding_6')
      if (n === 5 || n === 7 || n === 8) return { family: 'fam.sliding', missingPanels: true, options: ['sliding_2', 'sliding_3', 'sliding_4', 'sliding_6'], atoms, at }
      return done('sliding_2')
    }
    if (has('fam.pivot')) {
      if (mod('mod.horizontal')) return done('pivot_h')
      mod('mod.vertical')
      return done('pivot_v')
    }
    // Puertas
    if (has('fam.entrance_door')) return done(mod('mod.sidelight') ? 'entrance_door_sidelights' : 'entrance_door')
    if (has('fam.balcony_door')) {
      usePanels()
      return done(n === 2 || has('fam.french') ? 'balcony_door_double' : 'balcony_door')
    }
    if (has('fam.door_panel')) return done('door_panel')
    if (has('fam.door')) {
      mod('mod.with_fixed')
      const side = mod('mod.sidelight')
      const transom = mod('mod.transom')
      const zocalo = mod('mod.zocalo')
      usePanels()
      const double = n === 2
      if (zocalo) return done(double ? 'door_double_zocalo' : 'door_zocalo')
      if (double && side) return done('door_double_sidelights')
      if (side || (has('fam.fixed') && !transom)) return done('door_sidelight')
      if (transom) return done('door_transom')
      if (double || has('fam.french')) return done('door_double')
      const out = this.findAny(['dir.out'])
      if (out >= 0) {
        atoms.push(out)
        return done('door_out')
      }
      return done('door')
    }
    // Ventanas compuestas
    const count = (c: string) => ordered.filter((o) => o.c === c).length + (c === 'fam.fixed' ? this.withPrefix('mod.with_fixed').length : 0)
    if (has('fam.tilt_turn')) {
      usePanels()
      if (count('fam.tilt_turn') >= 2 && count('fam.fixed') >= 1) {
        mod('mod.with_fixed')
        return done('tilt_turn_fixed_tilt_turn')
      }
      if (mod('mod.bottom_fixed')) return done('tilt_turn_bottom_fixed')
      if (count('fam.fixed') >= 2 || (has('fam.fixed') && (mod('mod.sidelight') || panes === 3))) {
        mod('mod.with_fixed')
        return done('fixed_tilt_turn_fixed')
      }
      if (has('fam.fixed') || mod('mod.with_fixed')) return done('fixed_tilt_turn')
      if ((n === 2 || has('fam.french')) && mod('mod.transom')) return done('tilt_turn_double_transom')
      if (n === 2 || has('fam.french')) return done('french_tilt_turn')
      if (mod('mod.transom')) return done('tilt_turn_transom')
      return done('tilt_turn')
    }
    if (has('fam.casement')) {
      usePanels()
      if (mod('mod.bottom_fixed')) return done(n === 2 ? 'casement_double_bottom_fixed' : 'casement_bottom_fixed')
      // Un parante separa dos hojas: decirlo basta aunque no se cuenten.
      if (mod('mod.mullion')) return done('casement_double_mullion')
      if (count('fam.casement') >= 2 && (has('fam.fixed') || this.has('mod.with_fixed'))) {
        mod('mod.with_fixed')
        return done('casement_fixed_casement')
      }
      if (has('fam.fixed') || mod('mod.with_fixed')) return done('fixed_casement')
      if (mod('mod.transom')) return done('casement_transom')
      if (outward()) return done('casement_out')
      if (has('fam.french')) return done(n === 2 || n === undefined ? 'french_casement' : 'casement_double')
      if (n === 2) return done('casement_double')
      return done('casement')
    }
    if (has('fam.awning')) {
      // «Proyectante con fijo abajo» y «proyectante arriba con fijo»: el fijo va debajo.
      if (mod('mod.bottom_fixed')) return done('awning_transom')
      if (has('fam.fixed') || this.has('dir.bottom') || this.has('mod.with_fixed')) {
        if (mod('mod.sidelight')) {
          mod('mod.with_fixed')
          return done('fixed_awning_side')
        }
        const awningFirst = ordered[0].c === 'fam.awning'
        const low = mod('dir.bottom')
        mod('dir.top')
        mod('mod.with_fixed')
        return done(awningFirst && !low ? 'awning_transom' : 'fixed_awning_bottom')
      }
      return done('awning')
    }
    if (has('fam.tilt')) {
      if (has('fam.fixed') || mod('mod.with_fixed')) {
        mod('dir.top')
        return done('fixed_tilt')
      }
      return done('tilt')
    }
    if (has('fam.french')) {
      usePanels()
      return done('french_casement')
    }
    if (has('fam.fixed')) {
      if (panes === 3 || n === 3) {
        usePanels()
        return done('fixed_3')
      }
      return done('fixed')
    }
    return null
  }

  /** Conjunto de ventanas nombrado («bow window de 5 paños», «dos ventanas unidas»). */
  assembly(): { concept: string; preset: AssemblyPick; panes?: number; atoms: number[] } | null {
    for (const [concept, preset] of ASSEMBLY_CONCEPTS) {
      const i = this.find(concept)
      if (i < 0) continue
      const atoms = [i]
      const specs = this.panelSpecs()
      const spec = specs.pane ?? specs.leaf
      if (spec) atoms.push(...spec.atoms)
      return { concept, preset, ...(spec ? { panes: spec.count } : {}), atoms }
    }
    return null
  }

  // ── Colores ──

  private resolveColorAtom(i: number): ColorPick | null {
    const a = this.atoms[i]
    const entHits = a.ents.filter((h) => h.type === 'color')
    const exact = entHits.filter((h) => h.exact)
    if (exact.length === 1) {
      const e = this.entry(exact[0])
      return { id: e.id, name: e.name, atoms: [i] }
    }
    const concept = a.hits.find((h) => h.c.startsWith('col.'))?.c
    const colors = this.env.entities.lists.color
    if (concept) {
      const es = conceptSurfaces(concept, 'es')[0] ?? concept.slice(4)
      if (!colors.length) return { name: es, concept, atoms: [i] }
      const aliases = colorAliases(concept)
      const textures = COLOR_TEXTURES[concept] ?? []
      const matches = colors.filter((c) => {
        const key = c.words.join(' ')
        if (c.textureId && textures.includes(c.textureId)) return true
        return aliases.some((al) => key === al || key.startsWith(`${al} `) || key.endsWith(` ${al}`) || key.includes(` ${al} `))
      })
      // El nombre exacto del concepto (o su alias exacto) gana sobre variantes («Nogal» antes que «Nogal oscuro»).
      const exactName = matches.filter((c) => aliases.includes(c.words.join(' ')))
      const pool = exactName.length ? exactName : matches
      if (pool.length === 1) return { id: pool[0].id, name: pool[0].name, concept, atoms: [i] }
      if (pool.length > 1) return { name: es, concept, choices: pool, atoms: [i] }
      return { name: es, concept, atoms: [i] }
    }
    if (entHits.length) {
      const entries = entHits.map((h) => this.entry(h))
      if (entries.length === 1) return { id: entries[0].id, name: entries[0].name, atoms: [i] }
      return { name: entries[0].name, choices: entries, atoms: [i] }
    }
    return null
  }

  /** Color exterior e interior: «nogal por fuera y blanco por dentro», «bicolor antracita/blanco», «außen anthrazit». */
  colors(): { color?: ColorPick; colorIn?: ColorPick; atoms: number[] } {
    const found: { pick: ColorPick; side?: 'out' | 'in'; i: number }[] = []
    // El lado va antes del color en turco y alemán («dışı ceviz», «außen Nussbaum») y después en
    // español («nogal por fuera»): lo decide el primer lado respecto del primer color.
    const firstSide = this.findAny(['side.out', 'side.in'])
    let firstColor = -1
    for (let i = this.from; i < this.to && firstColor < 0; i++) if (!this.used.has(i) && (this.isPrefix(i, 'col.') || this.entityAt(i, 'color').length)) firstColor = i
    const preposed = firstSide >= 0 && firstColor >= 0 && firstSide < firstColor
    for (let i = this.from; i < this.to; i++) {
      if (this.used.has(i)) continue
      const isColor = this.isPrefix(i, 'col.') || this.entityAt(i, 'color').length > 0
      if (!isColor) continue
      // «mate» solo acompaña a otro color.
      if (this.is(i, 'col.matte') && found.length) continue
      const pick = this.resolveColorAtom(i)
      if (!pick) continue
      let side: 'out' | 'in' | undefined
      const n = this.next(i)
      const p = this.prev(i)
      const sideAt = (j: number) => (j >= 0 ? (this.is(j, 'side.out') ? 'out' : this.is(j, 'side.in') ? 'in' : undefined) : undefined)
      const free = (j: number) => !found.some((f) => f.pick.atoms.includes(j))
      const [first, second] = preposed ? [p, n] : [n, p]
      side = sideAt(first)
      if (side && free(first)) pick.atoms.push(first)
      else {
        side = sideAt(second)
        if (side && free(second)) pick.atoms.push(second)
        else side = undefined
      }
      found.push({ pick, side, i })
    }
    const atoms = found.flatMap((f) => f.pick.atoms)
    const bicolor = this.find('side.bicolor')
    if (bicolor >= 0) atoms.push(bicolor)
    if (!found.length) return { atoms }
    if (found.length === 1) {
      const f = found[0]
      return f.side === 'in' ? { colorIn: f.pick, atoms } : { color: f.pick, atoms }
    }
    const [a, b] = found
    const slash = this.an.tokens.slice(this.atoms[a.i].e, this.atoms[b.i].s).some((t) => t.raw === '/')
    if (a.side === 'in' || b.side === 'out') return { color: b.pick, colorIn: a.pick, atoms }
    if (a.side === 'out' || b.side === 'in' || bicolor >= 0 || slash) return { color: a.pick, colorIn: b.pick, atoms }
    // Dos colores sin lado: el primero manda (el segundo queda sin usar y se nota en la cobertura).
    return { color: a.pick, atoms: a.pick.atoms }
  }

  // ── Vidrio ──

  /** Vidrio por concepto, receta («DVH 4/16/4», «laminado 3+3») o nombre del catálogo. */
  glass(): GlassPick | null {
    const atoms: number[] = []
    const concepts: string[] = []
    let recipe: string | undefined
    let entity: EntityHit[] = []
    let generic: string | undefined
    for (let i = this.from; i < this.to; i++) {
      if (this.used.has(i)) continue
      const ent = this.entityAt(i, 'glass')
      if (ent.length) {
        entity = ent
        atoms.push(i)
        continue
      }
      let isGlass = false
      for (const c of this.concepts(i)) {
        if (c.startsWith('gls.')) {
          if (!concepts.includes(c)) concepts.push(c)
          isGlass = true
        }
      }
      if (isGlass) atoms.push(i)
      if (this.lit(i, 'recipe') && (concepts.length || this.is(i - 1, 'obj.glass') || atoms.length)) {
        recipe = this.atoms[i].lit!.raw
        atoms.push(i)
      }
      // «vidrio catedral», «vidrio bronce»: genérico tras «vidrio» (si no es otra cosa).
      if (!isGlass && this.is(i, 'obj.glass')) {
        const n = i + 1
        if (n < this.to && this.atoms[n].kind === 'unknown') {
          generic = this.raw(n)
          atoms.push(i, n)
        }
      }
    }
    // Una receta suelta después de «dvh/termopanel» o al final: «DVH 5+12+5».
    if (!recipe && concepts.length) {
      for (let i = this.from; i < this.to; i++) if (this.lit(i, 'recipe') && !this.used.has(i)) {
        recipe = this.atoms[i].lit!.raw
        atoms.push(i)
        break
      }
    }
    if (!atoms.length) return null
    const glassList = this.env.entities.lists.glass
    if (entity.length) {
      const exact = entity.filter((h) => h.exact)
      const pool = (exact.length ? exact : entity).map((h) => this.entry(h))
      if (pool.length === 1) return { id: pool[0].id, name: pool[0].name, concepts, recipe, atoms }
      return { name: pool[0].name, concepts, recipe, choices: pool, atoms }
    }
    const sorted = [...concepts].sort((a, b) => GLASS_PRIORITY.indexOf(a) - GLASS_PRIORITY.indexOf(b))
    if (glassList.length && (concepts.length || recipe)) {
      const best = this.bestGlass(glassList, concepts, recipe)
      if (best.length === 1) return { id: best[0].id, name: best[0].name, concepts, recipe, atoms }
      if (best.length > 1) return { name: best[0].name, concepts, recipe, choices: best, atoms }
    }
    // Sin catálogo: el término que entiende el ejecutor v4.
    let name: string
    const main = sorted[0]
    if (recipe && (!main || main === 'gls.double' || main === 'gls.triple')) name = `${main === 'gls.triple' ? 'TVH' : 'DVH'} ${recipe.replace(/\//g, '+')}`
    else if (main === 'gls.laminated' && recipe) name = `laminado ${recipe}`
    else if (main === 'gls.frosted') name = this.raw(atoms.find((i) => this.is(i, 'gls.frosted'))!).toLowerCase()
    else if (main === 'gls.single') {
      const i = atoms.find((x) => this.is(x, 'gls.single'))!
      const mm = this.atoms[i + 1]?.num && this.is(i + 2, 'unit.mm') ? this.num(i + 1) : undefined
      if (mm !== undefined) atoms.push(i + 1, i + 2)
      name = mm !== undefined ? `simple ${mm} mm` : 'simple'
    } else if (main) name = GLASS_V4[main] ?? conceptSurfaces(main, 'es')[0] ?? main.slice(4)
    else name = generic ?? (recipe ? `DVH ${recipe}` : '')
    if (!name) return null
    return { name, concepts, recipe, atoms }
  }

  private bestGlass(list: readonly EntityEntry[], concepts: readonly string[], recipe?: string): EntityEntry[] {
    const digits = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).join('+')
    const want = recipe ? digits(recipe) : undefined
    let top = 0
    let out: EntityEntry[] = []
    for (const g of list) {
      const key = g.words.join(' ')
      const desc = nameKey(`${g.name} ${g.detail ?? ''}`)
      let s = 0
      if (want && digits(g.name) === want) s += 5
      else if (want && digits(g.detail ?? '').includes(want)) s += 3
      else if (want) s -= 2
      for (const c of concepts) {
        if (c === 'gls.double' && (g.kind === 'dvh' || /dvh|termo|doble|double|insul/.test(key))) s += 2
        else if (c === 'gls.triple' && /tvh|triple|tripl/.test(desc)) s += 2
        else if (c === 'gls.laminated' && (g.kind === 'laminated' || /lamin|vsg|segur/.test(desc))) s += 2
        else if (c === 'gls.tempered' && (g.kind === 'tempered' || /templ|tempe|esg/.test(desc))) s += 2
        else if (c === 'gls.single' && (g.kind === 'mono' || /simple|mono|incolor/.test(desc))) s += 2
        else if (c === 'gls.low_e' && /low ?e|lowe|emisiv|emissiv/.test(desc)) s += 3
        else if (c === 'gls.low_e') s -= 1
        else if (c === 'gls.frosted' && /satin|esmeril|empav|opac|frost|catedral/.test(desc)) s += 2
        else if (c === 'gls.acoustic' && /acust|acoust|fono|schall/.test(desc)) s += 2
        else if (c === 'gls.solar_control' && /solar/.test(desc)) s += 2
      }
      if (!concepts.includes('gls.low_e') && /low ?e|lowe|emisiv/.test(desc)) s -= 0.5
      if (s > top) {
        top = s
        out = [g]
      } else if (s === top && s > 0) out.push(g)
    }
    return top > 0 ? out : []
  }

  // ── Línea ──

  /**
   * Línea por nombre del catálogo, o «línea/serie/perfil X» (hasta 4 palabras, o entre comillas).
   * Salta lo ya usado entre la palabra y el nombre («la línea de perfil del ítem 2 a "SOFTLINE 70"»).
   */
  line(): { id?: string; name: string; atoms: number[] } | null {
    const ent = this.findEntity('line')
    if (ent) {
      const pool = ent.hits.filter((h) => h.exact).length ? ent.hits.filter((h) => h.exact) : ent.hits
      const e = this.entry(pool[0])
      const atoms = [ent.i]
      for (let k = this.from; k < this.to; k++) if (this.is(k, 'obj.line') && !this.used.has(k)) atoms.push(k)
      return { id: e.id, name: e.name, atoms }
    }
    for (let i = this.from; i < this.to; i++) {
      if (!this.is(i, 'obj.line') || this.used.has(i)) continue
      let j = i + 1
      const skipped: number[] = []
      while (j < this.to && (this.used.has(j) || this.is(j, 'trg.to') || (this.isFiller(j) && !this.atoms[j].num))) {
        if (!this.used.has(j)) skipped.push(j)
        j++
      }
      if (j >= this.to) continue
      if (this.lit(j, 'quoted')) return { name: this.atoms[j].lit!.raw, atoms: [i, ...skipped, j] }
      const parts: number[] = []
      for (let k = j; k < this.to && parts.length < 4; k++) {
        const a = this.atoms[k]
        if (this.used.has(k) || a.kind === 'punct' || a.kind === 'literal') break
        if (parts.length && (this.isPrefix(k, 'col.') || this.isPrefix(k, 'gls.') || this.isPrefix(k, 'fam.') || this.isPrefix(k, 'act.') || this.isPrefix(k, 'obj.') || this.isPrefix(k, 'room') || this.isSep(k))) break
        if (!parts.length && a.kind !== 'unknown' && !a.num) break
        if (this.isFiller(k) && !a.num) break
        if (a.num && parts.length && this.isSep(k + 1)) break
        if (a.num && !parts.length && (this.isSep(k + 1) || this.isPrefix(k + 1, 'unit.'))) break
        parts.push(k)
      }
      if (!parts.length) continue
      let name = this.rawRange(parts[0], parts[parts.length - 1] + 1)
      if (/^\d/.test(name) && this.fold(i) === 'serie') name = `Serie ${name}`
      for (const k of parts) this.textAtoms.add(k)
      return { name, atoms: [i, ...skipped, ...parts] }
    }
    return null
  }

  // ── Ambiente ──

  location(): { name: string; atoms: number[] } | null {
    for (let i = this.from; i < this.to; i++) {
      if (this.used.has(i)) continue
      if (this.is(i, 'room')) {
        let end = i + 1
        if (this.is(end, 'roomq') || (this.atoms[end]?.num && !this.isSep(end + 1) && end < this.to && !this.isPrefix(end + 1, 'unit.'))) end++
        const raw = this.rawRange(i, end).replace(/\s+/g, ' ').trim()
        const atoms: number[] = []
        for (let k = i; k < end; k++) atoms.push(k)
        return { name: raw.charAt(0).toLocaleUpperCase(this.env.locale) + raw.slice(1), atoms }
      }
    }
    const li = this.find('obj.location')
    if (li >= 0) {
      const text = this.freeText(li + 1, { maxWords: 4 })
      if (text.text) return { name: text.text.charAt(0).toLocaleUpperCase(this.env.locale) + text.text.slice(1), atoms: [li, ...text.atoms] }
    }
    return null
  }

  // ── Accesorios ──

  extras(): { extras: NluExtras; atoms: number[] } | null {
    const out: NluExtras = {}
    const atoms: number[] = []
    const removing = (i: number) => {
      const p = this.prev(i)
      return (p >= 0 && (this.is(p, 'mod.without') || this.is(p, 'act.remove'))) || this.has('act.remove')
    }
    for (let i = this.from; i < this.to; i++) {
      if (this.used.has(i)) continue
      if (this.is(i, 'acc.roller_shutter')) {
        atoms.push(i)
        if (removing(i)) {
          out.rollerShutter = null
          continue
        }
        const rs: { type?: 'monoblock' | 'exterior' | 'integrated'; operation?: 'strap' | 'crank' | 'motor' } = {}
        for (let k = i + 1; k < Math.min(this.to, i + 6); k++) {
          if (this.is(k, 'accx.monoblock')) rs.type = 'monoblock'
          else if (this.is(k, 'accx.exterior_box')) rs.type = 'exterior'
          else if (this.is(k, 'accx.integrated')) rs.type = 'integrated'
          else if (this.is(k, 'accx.strap')) rs.operation = 'strap'
          else if (this.is(k, 'accx.crank')) rs.operation = 'crank'
          else if (this.is(k, 'accx.motor')) rs.operation = 'motor'
          else if (!this.isFiller(k)) break
          atoms.push(k)
        }
        out.rollerShutter = rs
      } else if (this.is(i, 'acc.insect_screen')) {
        atoms.push(i)
        if (removing(i)) {
          out.insectScreen = null
          continue
        }
        const sc: { type?: 'fixed' | 'hinged' | 'sliding' | 'roller' | 'pleated' } = {}
        const n = this.next(i)
        if (n >= 0) {
          if (this.is(n, 'fam.fixed')) sc.type = 'fixed'
          else if (this.is(n, 'fam.casement')) sc.type = 'hinged'
          else if (this.is(n, 'fam.sliding') || this.is(n, 'accx.sliding')) sc.type = 'sliding'
          else if (this.is(n, 'accx.roller')) sc.type = 'roller'
          else if (this.is(n, 'accx.pleated') || this.is(n, 'fam.folding')) sc.type = 'pleated'
          if (sc.type) atoms.push(n)
        }
        out.insectScreen = sc
      } else if (this.is(i, 'acc.sill')) {
        atoms.push(i)
        out.sill = !removing(i)
      } else if (this.is(i, 'acc.threshold')) {
        atoms.push(i)
        out.threshold = !removing(i)
      }
    }
    if (!atoms.length) return null
    const w = this.find('mod.without')
    if (w >= 0 && atoms.some((a) => this.prev(a) === w)) atoms.push(w)
    return { extras: out, atoms }
  }

  // ── Apertura ──

  /** Bisagras, sentido, secuencia y paño: «bisagras a la izquierda», «abre hacia afuera», «la hoja derecha», «paño 2». */
  opening(): { hinge?: 'left' | 'right'; direction?: 'in' | 'out'; sequence?: 'turn_first' | 'tilt_first'; pane?: number; atoms: number[] } {
    const atoms: number[] = []
    const out: { hinge?: 'left' | 'right'; direction?: 'in' | 'out'; sequence?: 'turn_first' | 'tilt_first'; pane?: number } = {}
    const dirIn = this.find('dir.in')
    const dirOut = this.find('dir.out')
    if (dirOut >= 0) {
      out.direction = 'out'
      atoms.push(dirOut)
    } else if (dirIn >= 0) {
      out.direction = 'in'
      atoms.push(dirIn)
    }
    const seq = this.findAny(['seq.tilt_first', 'seq.turn_first'])
    if (seq >= 0) {
      out.sequence = this.is(seq, 'seq.tilt_first') ? 'tilt_first' : 'turn_first'
      atoms.push(seq)
    }
    const hinge = this.find('obj.hinge')
    const handle = this.find('obj.handle')
    const opens = this.findAny(['act.open'])
    const side = (from: number) => {
      for (let k = from + 1; k < Math.min(this.to, from + 5); k++) {
        if (this.is(k, 'dir.left')) return { k, v: 'left' as const }
        if (this.is(k, 'dir.right')) return { k, v: 'right' as const }
        if (!this.isFiller(k)) break
      }
      return null
    }
    const hs = hinge >= 0 ? side(hinge) : null
    if (hs) {
      out.hinge = hs.v
      atoms.push(hinge, hs.k)
    } else if (handle >= 0) {
      const s = side(handle)
      if (s) {
        out.hinge = s.v === 'left' ? 'right' : 'left'
        atoms.push(handle, s.k)
      }
    } else if (opens >= 0) {
      const s = side(opens)
      if (s) {
        out.hinge = s.v
        atoms.push(opens, s.k)
      }
    }
    // Paño: «paño 2», «hoja derecha», «el paño de arriba», «segunda hoja».
    for (let i = this.from; i < this.to; i++) {
      if (!(this.is(i, 'pan.pane') || this.is(i, 'pan.leaf')) || this.used.has(i)) continue
      const prevNum = this.atoms[i - 1]?.num
      if (prevNum && i - 1 >= this.from && !this.atoms[i - 1].num?.weak) continue // «2 hojas» = cantidad de hojas
      const n = this.atoms[i + 1]?.num
      if (n && i + 1 < this.to && Number.isInteger(n.value) && n.value >= 1 && n.value <= 8 && !this.isPrefix(i + 2, 'pan.')) {
        out.pane = n.value
        atoms.push(i, i + 1)
        break
      }
      const nx = this.next(i)
      const hingeTalk = hinge >= 0 || handle >= 0
      if (nx >= 0 && !hingeTalk) {
        const map: [string, number][] = [
          ['dir.left', 1],
          ['dir.right', -1],
          ['dir.center', 2],
          ['dir.top', 1],
          ['dir.bottom', -1],
        ]
        const hit = map.find(([c]) => this.is(nx, c))
        if (hit) {
          out.pane = hit[1]
          atoms.push(i, nx)
          break
        }
      }
      const pv = this.prev(i)
      if (pv >= 0) {
        const ord = this.withPrefix('ord.').find((o) => o.i === pv)
        if (ord) {
          out.pane = Number(ord.c.slice(4))
          atoms.push(pv, i)
          break
        }
        if (this.is(pv, 'scp.first')) {
          out.pane = 1
          atoms.push(pv, i)
          break
        }
        if (this.is(pv, 'scp.last')) {
          out.pane = -1
          atoms.push(pv, i)
          break
        }
      }
    }
    return { ...out, atoms }
  }

  // ── Texto libre ──

  findLiteral(kind: string, from = this.from): number {
    for (let i = Math.max(from, this.from); i < this.to; i++) if (this.lit(i, kind) && !this.used.has(i)) return i
    return -1
  }

  /**
   * Texto libre desde el átomo `start` (título, nombre, consulta, nota, recuerdo). Una cita entre
   * comillas manda. Se corta en `stop` (p. ej. el inicio de una ventana o un correo).
   */
  freeText(start: number, options: { stop?: (i: number) => boolean; maxWords?: number; keepFillers?: boolean } = {}): { text: string; atoms: number[] } {
    let i = Math.max(start, this.from)
    while (i < this.to && (this.punct(i, ':=,-') || (this.isFiller(i) && !options.keepFillers && this.atoms[i].kind !== 'number'))) i++
    if (i >= this.to || options.stop?.(i)) return { text: '', atoms: [] }
    if (this.lit(i, 'quoted')) return { text: this.atoms[i].lit!.raw, atoms: [i] }
    let end = i
    let words = 0
    for (let k = i; k < this.to; k++) {
      if (options.stop?.(k)) break
      if (this.punct(k, ',;')) break
      if (this.lit(k, 'email') || this.lit(k, 'phone')) break
      if (options.maxWords && words >= options.maxWords) break
      end = k + 1
      words++
    }
    const atoms: number[] = []
    for (let k = i; k < end; k++) {
      atoms.push(k)
      this.textAtoms.add(k)
    }
    const text = this.rawRange(i, end)
      .trim()
      .replace(/^["'«“]+|["'»”.,;:!?¿¡]+$/g, '')
      .trim()
    return { text, atoms }
  }
}
