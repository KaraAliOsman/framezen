/**
 * Etiquetas de deshacer del diseñador por **clave**: la clave es la identidad estable del paso
 * (agrupa el historial aunque cambie el idioma) y el texto se traduce al mostrarlo.
 *
 *   onChange(next, label, undo)   label = texto ya traducido (compatibilidad) · undo = { key, params }
 *   undoText(undo, locale?)       vuelve a traducir el paso (menú de deshacer en otro idioma)
 *
 * Los parámetros guardan datos crudos (milímetros, ids de apertura y forma, nombres del catálogo) y
 * se formatean al traducir, así el texto sigue al idioma de quien lo mira.
 */
import type { Locale } from '@dekopen/shared'
import { getFormatter, getGlossary, translate } from '../../../lib/i18n'
import es from '../i18n/es'

export type UndoKey = keyof (typeof es)['undo']

export interface UndoLabel {
  key: UndoKey
  params?: Record<string, string | number>
}

/** Parámetros en milímetros (se formatean con unidad: «1.200 mm», «1,200 mm»). */
const MM_PARAMS = new Set(['width', 'height', 'rise', 'mm'])

/**
 * Token de apertura para guardar en el historial: `kind`, `kind:out` (abatible o puerta exterior) o
 * `kind@balcony|entrance` (hoja que llega al piso). Se resuelve con `openingTokenName`.
 */
export function openingTokenName(token: string, locale?: Locale): string {
  const g = getGlossary(locale)
  const [kindPart, use] = token.split('@')
  const [kind, dir] = kindPart.split(':')
  if (use === 'balcony' || use === 'entrance') {
    const base = g.term(`leafUse.${use}` as Parameters<typeof g.term>[0])
    return kind === 'tilt_turn' ? translate(es, 'node.openingDetail.useTiltTurn', { use: base }, locale) : base
  }
  const name = g.opening(kind)
  return dir === 'out' ? translate(es, 'node.openingDetail.outward', { opening: name }, locale) : name
}

function shapeTokenName(token: string, locale?: Locale): string {
  const g = getGlossary(locale)
  return token === 'arch_segmental' ? g.shape('arch', { segmental: true }) : g.shape(token)
}

/** Parámetros listos para el mensaje en el idioma pedido. */
export function undoParams(params: UndoLabel['params'], locale?: Locale): Record<string, string | number> | undefined {
  if (!params) return undefined
  const fmt = getFormatter({ locale })
  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'number' && MM_PARAMS.has(k)) out[k] = fmt.mm(v, { unit: true })
    else if (k === 'opening' && typeof v === 'string') out[k] = openingTokenName(v, locale)
    else if (k === 'shape' && typeof v === 'string') out[k] = shapeTokenName(v, locale).toLowerCase()
    else out[k] = v
  }
  return out
}

/** Texto del paso de deshacer en el idioma actual (o el indicado). */
export function undoText(undo: UndoLabel, locale?: Locale): string {
  return translate(es, `undo.${undo.key}`, undoParams(undo.params, locale), locale)
}

/** Atajo: `{ label, undo }` para armar un cambio. */
export function undoLabel(key: UndoKey, params?: UndoLabel['params']): { label: string; undo: UndoLabel } {
  const undo: UndoLabel = params ? { key, params } : { key }
  return { label: undoText(undo), undo }
}
