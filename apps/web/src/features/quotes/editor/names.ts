/**
 * Nombres y etiquetas derivados de los datos en el idioma de la interfaz: nombre de una ventana
 * (tipología por id con el glosario), impuesto de la empresa y muestra realista de un color.
 * El motor sigue en español por dentro; aquí se traduce por id o código.
 */
import { useCallback, useMemo } from 'react'
import { assemblyUnits, collectLeaves, designName, matchTypology, type Catalog, type Color, type WindowDesign } from '@dekopen/engine'
import { assemblyTitleIn } from '@dekopen/documents'
import type { QuoteItem } from '@dekopen/shared'
import { useGlossary, type GlossaryHelpers } from '../../../lib/i18n'
import { swatchAppearance } from '../../designer/lib/appearance'
import { undoText as designerUndoText } from '../../designer/lib/undo'
import type { UndoLabelDescriptor } from '../model/history'
import { useEditorState } from './context'

/** Nombre de la tipología de un diseño («Oscilobatiente», «Tilt and turn»…). */
export function designLabel(design: WindowDesign, g: Pick<GlossaryHelpers, 'locale' | 'typology' | 'opening' | 'shape'>): string {
  const assembly = assemblyTitleIn(design, g.locale)
  if (assembly) return assembly
  let id: string | undefined
  try {
    id = matchTypology(design)
  } catch {
    id = undefined
  }
  if (id) return g.typology(id)
  // En español el motor ya describe las composiciones libres («Fijo + abatible», «Corredera 3 hojas»).
  if (g.locale === 'es') return designName(design)
  const root = design?.root
  if (!root || typeof root !== 'object') return g.opening('fixed')
  if (root.type === 'sliding') return g.opening('sliding')
  const kinds = [...new Set(collectLeaves(root).map((leaf) => leaf.opening?.kind ?? 'fixed'))]
  const body = kinds.length ? kinds.map((kind) => g.opening(kind)).join(' + ') : g.opening('fixed')
  const shape = design.shape?.kind
  return shape && shape !== 'rect' ? `${g.shape(shape)} · ${body}` : body
}

/** `(item) => nombre visible`: el que escribiste o el de su tipología. */
export function useItemName(): (item: Pick<QuoteItem, 'name' | 'design'>) => string {
  const g = useGlossary()
  return useCallback((item) => item.name?.trim() || designLabel(item.design, g), [g])
}

/**
 * Nombre del impuesto de la empresa («IVA», «MwSt.»…), el del glosario si no hay uno propio.
 * `label` va al inicio de un rótulo («IVA 19 %»); `inline`, dentro de una frase («Total con IVA»,
 * «Total incl. tax»): en minúscula salvo siglas o abreviaturas.
 */
export function useTax(): { label: string; inline: string } {
  const g = useGlossary()
  const own = useEditorState((s) => s.settings.taxLabel)
  const label = own?.trim() || g.term('business.vat')
  const acronym = label === label.toLocaleUpperCase(g.locale) || label.includes('.')
  return { label, inline: own?.trim() || acronym ? label : label.toLocaleLowerCase(g.locale) }
}

/** Nombre del impuesto para usar dentro de una frase (ver `useTax`). */
export function useTaxLabel(): string {
  return useTax().inline
}

export interface SwatchLook {
  hex: string
  /** Tesela de la textura (foliado) para `ColorSwatch.image`; sin textura, color liso. */
  image?: string
}

/** Muestra realista de un color del catálogo (foliado con veta, metalizado, liso). */
export function colorSwatch(color: Color | undefined): SwatchLook | undefined {
  if (!color) return undefined
  const look = swatchAppearance(color)
  return { hex: look.hex, image: look.image }
}

/** Muestras de un catálogo por id de color (memorizadas por catálogo). */
export function useSwatches(catalog: Catalog): Map<string, SwatchLook> {
  return useMemo(() => new Map(catalog.colors.map((color) => [color.id, colorSwatch(color)!])), [catalog])
}

/**
 * Etiqueta de deshacer de un cambio del diseñador con la referencia de la ventana: «Cambiar ancho
 * (V1)». Si el diseñador manda su paso por clave (`onChange(next, label, undo)` con `undo = { key,
 * params }` de su espacio), se guarda esa clave y se traduce al mostrarse; si no, se usa su texto.
 */
export function designUndoLabel(label: unknown, undo: unknown, ref: string): UndoLabelDescriptor | undefined {
  const change = designerStep(undo) ?? (typeof label === 'string' && label.trim() ? label : undefined)
  return change ? { key: 'history.designChange', params: { change, ref } } : undefined
}

function designerStep(undo: unknown): UndoLabelDescriptor | undefined {
  const u = undo as { key?: unknown; params?: Record<string, string | number> } | null | undefined
  if (!u || typeof u.key !== 'string') return undefined
  const step = { key: u.key, params: u.params } as Parameters<typeof designerUndoText>[0]
  return {
    key: `designer:${u.key}`,
    params: u.params,
    render: (locale) => {
      try {
        return designerUndoText(step, locale)
      } catch {
        return String(u.key)
      }
    },
  }
}

/** Unidades que cuentan en el total, igual que el documento: un conjunto suma cada ventana que trae. */
export function countedUnits(items: readonly { id: string; qty: number; design: WindowDesign }[], evaluated: readonly { id: string; included?: boolean }[]): number {
  const out = new Set(evaluated.filter((item) => item.included === false).map((item) => item.id))
  return items.reduce((sum, item) => (out.has(item.id) ? sum : sum + item.qty * Math.max(1, assemblyUnits(item.design).length)), 0)
}
