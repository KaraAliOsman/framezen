/**
 * Idioma y formatos de los documentos de taller. En español la salida es idéntica byte a byte a la
 * de siempre (los formateadores deterministas de `format.ts`); en los demás idiomas se usan los
 * separadores del idioma pero con las mismas reglas de taller: miles siempre agrupados (también
 * 1.200), decimales fijos donde importan y vidrios redondeados hacia abajo al 0,5 mm.
 *
 * Los textos que vienen del motor en español (lados de corte «arr/aba», rótulos de paño «Hoja izq.»,
 * avisos) se traducen por su forma conocida o por código; los nombres del catálogo (perfiles,
 * colores, vidrios, artículos) no se traducen nunca.
 */
import type { ReactNode } from 'react'
import { createElement, Fragment } from 'react'
import {
  createTranslator,
  formatMoney,
  glossaryTerm,
  intlTag,
  isDocLocale,
  stationLabel,
  warningMessage,
  type DocLocale,
  type LocalizableWarning,
  type MessageParams,
  type Translator,
} from '@dekopen/shared'
import {
  floorHalfMm,
  fmtAngle,
  fmtDate,
  fmtGlassMm,
  fmtInt,
  fmtM2,
  fmtMeters,
  fmtMm,
  fmtMoney,
  fmtNumber,
  fmtPct,
  fmtQty,
  fmtShortDate,
  fmtSize,
  roundTenth,
} from './format'
import { WORKSHOP_MESSAGES, type WorkshopMessages } from './i18n'

const NBSP = ' '
const NNBSP = ' '
const MINUS = '−'

interface Separators {
  group: string
  decimal: string
}

const SEPARATORS: Record<DocLocale, Separators> = {
  es: { group: '.', decimal: ',' },
  en: { group: ',', decimal: '.' },
  pt: { group: '.', decimal: ',' },
  fr: { group: NNBSP, decimal: ',' },
  de: { group: '.', decimal: ',' },
  it: { group: '.', decimal: ',' },
  tr: { group: '.', decimal: ',' },
}

export interface WorkshopFormat {
  readonly locale: DocLocale
  number(value: number, decimals?: number): string
  int(value: number): string
  mm(value: number, opts?: { fixed?: boolean }): string
  glassMm(value: number): string
  money(value: number): string
  pct(value: number, decimals?: number): string
  m2(value: number, decimals?: number): string
  meters(value: number, decimals?: number): string
  angle(value: number): string
  qty(value: number): string
  size(width: number, height: number): string
  date(iso: string): string
  shortDate(iso: string): string
}

function makeNumber(sep: Separators) {
  return (value: number, decimals = 0): string => {
    if (!Number.isFinite(value)) return '—'
    const negative = value < 0
    const fixed = Math.abs(value).toFixed(decimals)
    const [intPart, decPart] = fixed.split('.')
    const body = (intPart ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, sep.group) + (decPart ? `${sep.decimal}${decPart}` : '')
    return negative && Number(fixed) !== 0 ? `${MINUS}${body}` : body
  }
}

function isoParts(iso: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return undefined
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
  return Number.isNaN(d.getTime()) ? undefined : d
}

const ES_FORMAT: WorkshopFormat = {
  locale: 'es',
  number: fmtNumber,
  int: fmtInt,
  mm: fmtMm,
  glassMm: fmtGlassMm,
  money: fmtMoney,
  pct: fmtPct,
  m2: fmtM2,
  meters: fmtMeters,
  angle: fmtAngle,
  qty: fmtQty,
  size: fmtSize,
  date: fmtDate,
  shortDate: fmtShortDate,
}

/** Formatos de taller para un idioma (y moneda: CLP por defecto). */
export function workshopFormat(locale: DocLocale = 'es', currency = 'CLP'): WorkshopFormat {
  const cur = (currency || 'CLP').toUpperCase()
  if (locale === 'es' && cur === 'CLP') return ES_FORMAT
  if (locale === 'es') return { ...ES_FORMAT, money: (v) => (Number.isFinite(v) ? formatMoney(v, { currency: cur, locale }) : '—') }
  const num = makeNumber(SEPARATORS[locale] ?? SEPARATORS.en)
  const mm = (value: number, opts: { fixed?: boolean } = {}) => {
    const r = roundTenth(value)
    if (opts.fixed) return num(r, 1)
    return Number.isInteger(r) ? num(r, 0) : num(r, 1)
  }
  const pctSpace = locale === 'fr' ? NNBSP : locale === 'de' ? NBSP : ''
  const qty = (value: number) => {
    const r = Math.round(value * 100) / 100
    if (Number.isInteger(r)) return num(r, 0)
    const text = num(r, 2)
    return text.endsWith('0') ? text.slice(0, -1) : text
  }
  const tag = intlTag(locale)
  return {
    locale,
    number: num,
    int: (v) => num(Math.round(v), 0),
    mm,
    glassMm: (v) => num(floorHalfMm(v), 1),
    money: (v) => (Number.isFinite(v) ? formatMoney(v, { currency: cur, locale }) : '—'),
    pct: (v, decimals = 1) => (locale === 'tr' ? `%${num(v, decimals)}` : `${num(v, decimals)}${pctSpace}%`),
    m2: (v, decimals = 2) => `${num(v, decimals)}${NBSP}m²`,
    meters: (v, decimals = 2) => `${num(v, decimals)}${NBSP}m`,
    angle: (v) => {
      const r = Math.round(v * 10) / 10
      return `${Number.isInteger(r) ? num(r, 0) : num(r, 1)}°`
    },
    qty,
    size: (w, h) => `${mm(w)} × ${mm(h)}${NBSP}mm`,
    date: (iso) => {
      const d = isoParts(iso)
      return d ? new Intl.DateTimeFormat(tag, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d) : iso
    },
    shortDate: (iso) => {
      const d = isoParts(iso)
      return d ? new Intl.DateTimeFormat(tag, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(d) : iso
    },
  }
}

export interface WorkshopLocaleOptions {
  /** Idioma del documento (por defecto español). */
  locale?: DocLocale
  /** Moneda de los montos internos (por defecto CLP). */
  currency?: string
  /** Rótulo del impuesto (por defecto el del idioma: IVA, VAT, MwSt.…). */
  taxLabel?: string
}

export interface WorkshopI18n {
  readonly locale: DocLocale
  readonly t: Translator<WorkshopMessages>
  readonly f: WorkshopFormat
  /** Rótulo del impuesto. */
  readonly tax: string
  /** Etiqueta `lang` del documento. */
  readonly lang: string
  /** Lados de corte del motor («arr · aba») en palabras del idioma. */
  side(label: string): string
  /** Rótulo de paño del motor («Paño fijo sup. izq.») en el idioma. */
  cell(label: string): string
  /** Referencia «V1 · Hoja izq.» con el rótulo de paño en el idioma. */
  ref(text: string): string
  /** Aviso del motor en el idioma (en español, su texto tal cual). */
  warning(w: LocalizableWarning): string
  /** Estación de producción. */
  station(id: string): string
  /** Unidad de compra del catálogo (u, kit, caja…) en el idioma; desconocidas tal cual. */
  unit(unit: string): string
  /** Texto con <b>…</b> → nodos React (solo para mensajes propios con parámetros numéricos). */
  rich(key: Parameters<Translator<WorkshopMessages>>[0], params?: MessageParams): ReactNode
}

const SIDE_KEYS: Record<string, keyof WorkshopMessages['side']> = {
  arr: 'arr',
  aba: 'aba',
  izq: 'izq',
  der: 'der',
  trav: 'trav',
  'incl.': 'incl',
  incl: 'incl',
  mont: 'mont',
  tras: 'tras',
  traslapo: 'traslapo',
  guia: 'guia',
  'guía': 'guia',
  inversor: 'inversor',
  umbral: 'umbral',
  arco: 'arco',
}

/** Separa «arr · aba», «arr;aba» o «izq/der» en sus partes. */
export function sideTokens(label: string): string[] {
  return label
    .split(/\s*(?:[;·,/]|\sy\s)\s*/)
    .map((t) => t.trim())
    .filter(Boolean)
}

const CELL = /^(Paño fijo|Hoja|Puerta)(?: (sup\.|inf\.|medio))?(?: (izq\.|der\.|centro))?(?: (\d+))?$/
const CELL_NAME: Record<string, 'fixed' | 'sash' | 'door'> = { 'Paño fijo': 'fixed', Hoja: 'sash', Puerta: 'door' }
const CELL_V: Record<string, 'top' | 'bottom' | 'middle'> = { 'sup.': 'top', 'inf.': 'bottom', medio: 'middle' }
const CELL_H: Record<string, 'left' | 'right' | 'center'> = { 'izq.': 'left', 'der.': 'right', centro: 'center' }

const UNIT_KEYS = new Set(['u', 'kit', 'm', 'm2', 'caja', 'cartucho', 'par'])

/** Divide «Texto <b>valor</b> más» en nodos React (sin interpretar nada más). */
export function richNodes(text: string): ReactNode {
  const parts = text.split(/(<b>[\s\S]*?<\/b>)/g).filter((p) => p !== '')
  if (parts.length === 1 && !parts[0]?.startsWith('<b>')) return text
  return createElement(
    Fragment,
    null,
    ...parts.map((p, i) => (p.startsWith('<b>') && p.endsWith('</b>') ? createElement('strong', { key: i }, p.slice(3, -4)) : createElement(Fragment, { key: i }, p))),
  )
}

const cache = new Map<string, WorkshopI18n>()

/** Textos y formatos de taller para un idioma (memorizado por idioma, moneda e impuesto). */
export function workshopI18n(options: WorkshopLocaleOptions = {}): WorkshopI18n {
  const locale: DocLocale = isDocLocale(options.locale) ? options.locale : 'es'
  const currency = (options.currency || 'CLP').toUpperCase()
  const tax = options.taxLabel?.trim() || glossaryTerm('business.vat', locale)
  const key = `${locale}|${currency}|${tax}`
  const hit = cache.get(key)
  if (hit) return hit
  const t = createTranslator(WORKSHOP_MESSAGES, locale)
  const sideWord = (token: string): string => {
    const m = /^(.*?)(\s*\d+)?$/.exec(token)
    const base = (m?.[1] ?? token).toLowerCase()
    const k = SIDE_KEYS[base]
    return k ? `${t(`side.${k}`)}${m?.[2] ?? ''}` : token
  }
  const api: WorkshopI18n = {
    locale,
    t,
    f: workshopFormat(locale, currency),
    tax,
    lang: intlTag(locale),
    side(label) {
      const tokens = sideTokens(label)
      if (tokens.length === 0) return label
      return tokens.map(sideWord).join(' · ')
    },
    cell(label) {
      if (locale === 'es') return label
      const m = CELL.exec(label.trim())
      if (!m) return label
      const parts = [t(`cell.${CELL_NAME[m[1]]}`)]
      if (m[2]) parts.push(t(`cell.${CELL_V[m[2]]}`))
      if (m[3]) parts.push(t(`cell.${CELL_H[m[3]]}`))
      if (m[4]) parts.push(m[4])
      return parts.join(' ')
    },
    ref(text) {
      if (locale === 'es') return text
      const at = text.indexOf(' · ')
      return at < 0 ? api.cell(text) : `${text.slice(0, at)} · ${api.cell(text.slice(at + 3))}`
    },
    warning(w) {
      return warningMessage(w, locale)
    },
    station(id) {
      return stationLabel(id, locale)
    },
    unit(unit) {
      const u = unit.trim()
      if (locale === 'es' || !UNIT_KEYS.has(u)) return u === 'm2' ? 'm²' : u
      return glossaryTerm(`hardwareUnit.${u}` as never, locale)
    },
    rich(k, params) {
      return richNodes(t(k, params))
    },
  }
  cache.set(key, api)
  return api
}

/** Idioma/moneda/impuesto efectivos: props primero, después los datos de la OT. */
export function resolveWorkshopLocale(props: WorkshopLocaleOptions, data: WorkshopLocaleOptions): WorkshopI18n {
  return workshopI18n({
    locale: props.locale ?? data.locale,
    currency: props.currency ?? data.currency,
    taxLabel: props.taxLabel ?? data.taxLabel,
  })
}
