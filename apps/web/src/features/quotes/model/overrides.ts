/**
 * Ajustes del documento por cotización (v2, `Quote.documentOverrides`). El editor siempre trabaja
 * con v2: lo que llega en v1 (cotizaciones de antes, borradores de este equipo) se migra al leer con
 * `migrateQuoteDocOverrides` de @dekopen/shared y se guarda en v2.
 *
 * Todo es puro e inmutable (entra al historial de deshacer). La fusión ante un conflicto (409) es
 * por llave: un texto cambiado en otra pestaña no pisa la plantilla que elegiste aquí.
 */
import {
  compactQuoteDocOverrides,
  migrateQuoteDocOverrides,
  type DocLocale,
  type DocTextField,
  type QuoteDocOverridesV2,
} from '@dekopen/shared'

export type DocOverrides = QuoteDocOverridesV2

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** Igualdad profunda para JSON (las claves con undefined cuentan como ausentes). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a)) {
    const bb = b as unknown[]
    return a.length === bb.length && a.every((v, i) => jsonEqual(v, bb[i]))
  }
  const ra = a as Record<string, unknown>
  const rb = b as Record<string, unknown>
  for (const key of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
    if (ra[key] === undefined && rb[key] === undefined) continue
    if (!jsonEqual(ra[key], rb[key])) return false
  }
  return true
}

/** ¿No queda nada propio de la cotización? (solo la marca de versión). */
export function isEmptyOverrides(value: DocOverrides | undefined | null): boolean {
  if (!value) return true
  return Object.entries(value).every(([key, v]) => key === 'v' || v === undefined)
}

/**
 * Cualquier forma guardada (v1 plano, v2 o basura) → v2 compacto, o `undefined` si no queda nada.
 * Un v2 no se revalida aquí (el servidor es quien valida y descarta): así nunca se pierde en
 * silencio un texto que la persona está escribiendo.
 */
export function toOverridesV2(value: unknown): DocOverrides | undefined {
  if (value === null || value === undefined) return undefined
  if (!isRecord(value)) return undefined
  const out = value.v === 2 ? compactQuoteDocOverrides(value as unknown as DocOverrides) : migrateQuoteDocOverrides(value, { source: 'quote' }).overrides
  return isEmptyOverrides(out) ? undefined : out
}

/** Cambio puntual de ajustes (`null` o `undefined` = volver al de la plantilla o la organización). */
export interface DocOverridesPatch {
  /** Diseño predefinido, id v4 o plantilla propia. */
  templateId?: string | null
  /** Idioma del documento (PDF, portal, mensajes). */
  locale?: DocLocale | null
  validityDays?: number | null
  texts?: Partial<Record<DocTextField, string | null | undefined>>
  /** Nota para el cliente bajo cada ítem (por id de ítem). */
  itemNotes?: Record<string, string | null | undefined>
}

/** Un texto vacío es una decisión («sin condiciones»); `null`/`undefined` vuelven al de la plantilla. */
function setTexts(record: Record<string, string> | undefined, patch: Record<string, string | null | undefined>): Record<string, string> | undefined {
  const next: Record<string, string> = { ...(record ?? {}) }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined) delete next[key]
    else next[key] = value
  }
  return Object.keys(next).length ? next : undefined
}

/** Aplica un cambio puntual. Devuelve la misma referencia si nada cambia. */
export function patchOverrides(current: DocOverrides | undefined, patch: DocOverridesPatch): DocOverrides | undefined {
  const next: DocOverrides = { ...(current ?? { v: 2 }), v: 2 }
  if ('templateId' in patch) {
    if (patch.templateId) next.templateId = patch.templateId
    else delete next.templateId
  }
  if ('locale' in patch) {
    if (patch.locale) next.locale = patch.locale
    else delete next.locale
  }
  if ('validityDays' in patch) {
    const days = patch.validityDays
    if (typeof days === 'number' && Number.isFinite(days)) next.validityDays = Math.min(365, Math.max(1, Math.round(days)))
    else delete next.validityDays
  }
  if (patch.texts) {
    const texts = setTexts(next.texts as Record<string, string> | undefined, patch.texts)
    if (texts) next.texts = texts
    else delete next.texts
  }
  if (patch.itemNotes) {
    const items: NonNullable<DocOverrides['items']> = { ...(next.items ?? {}) }
    for (const [id, note] of Object.entries(patch.itemNotes)) {
      if (note && note.trim()) items[id] = { ...(items[id] ?? {}), note }
      else {
        const { note: _drop, ...rest } = items[id] ?? {}
        if (Object.keys(rest).length) items[id] = rest
        else delete items[id]
      }
    }
    if (Object.keys(items).length) next.items = items
    else delete next.items
  }
  const out = isEmptyOverrides(next) ? undefined : next
  return jsonEqual(out, current) ? current : out
}

/** Quita lo que la cotización ya no necesita (notas de ítems que ya no existen). */
export function pruneItemNotes(current: DocOverrides | undefined, itemIds: readonly string[]): DocOverrides | undefined {
  if (!current?.items) return current
  const keep = new Set(itemIds)
  const stale = Object.keys(current.items).filter((id) => !keep.has(id))
  if (!stale.length) return current
  return patchOverrides(current, { itemNotes: Object.fromEntries(stale.map((id) => [id, null])) })
}

// ── Fusión a tres bandas por llave ──────────────────────────────────────────

/** Claves cuyo valor es un mapa: se fusionan entrada por entrada. */
const RECORD_KEYS = new Set(['texts', 'items', 'sections'])

export interface OverridesMerge {
  value: DocOverrides | undefined
  /** false = la misma llave cambió de forma distinta en ambos lados. */
  clean: boolean
  remoteChanged: boolean
}

function pick(base: unknown, local: unknown, remote: unknown): { value: unknown; clean: boolean; remoteChanged: boolean } {
  const lc = !jsonEqual(base, local)
  const rc = !jsonEqual(base, remote)
  return { value: lc ? local : remote, clean: !(lc && rc && !jsonEqual(local, remote)), remoteChanged: rc }
}

/**
 * Fusión de ajustes: `base` es lo último que guardó el servidor, `local` lo que hay en pantalla y
 * `remote` la versión nueva del servidor. Cada llave (y cada texto, nota o sección) se toma del lado
 * que la cambió.
 */
export function mergeOverrides(baseIn: unknown, localIn: unknown, remoteIn: unknown): OverridesMerge {
  const base = (toOverridesV2(baseIn) ?? { v: 2 }) as Record<string, unknown>
  const local = (toOverridesV2(localIn) ?? { v: 2 }) as Record<string, unknown>
  const remote = (toOverridesV2(remoteIn) ?? { v: 2 }) as Record<string, unknown>
  let clean = true
  let remoteChanged = false
  const out: Record<string, unknown> = { v: 2 }
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])
  keys.delete('v')
  for (const key of keys) {
    if (RECORD_KEYS.has(key)) {
      const b = (isRecord(base[key]) ? base[key] : {}) as Record<string, unknown>
      const l = (isRecord(local[key]) ? local[key] : {}) as Record<string, unknown>
      const r = (isRecord(remote[key]) ? remote[key] : {}) as Record<string, unknown>
      const merged: Record<string, unknown> = {}
      for (const sub of new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)])) {
        const res = pick(b[sub], l[sub], r[sub])
        clean &&= res.clean
        remoteChanged ||= res.remoteChanged
        if (res.value !== undefined) merged[sub] = res.value
      }
      if (Object.keys(merged).length) out[key] = merged
      continue
    }
    const res = pick(base[key], local[key], remote[key])
    clean &&= res.clean
    remoteChanged ||= res.remoteChanged
    if (res.value !== undefined) out[key] = res.value
  }
  const value = out as unknown as DocOverrides
  return { value: isEmptyOverrides(value) ? undefined : value, clean, remoteChanged }
}
