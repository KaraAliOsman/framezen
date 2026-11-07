/**
 * Textos derivados del diseño en el idioma de la interfaz: nombre de la apertura (con detalle para
 * lectores de pantalla), título y resumen de un paño u hoja, y la leyenda de una ventana
 * («Corredera 2 hojas · 1.500 × 1.200 mm»). El motor sigue en español por dentro: aquí se traduce
 * por id con el glosario.
 */
import { matchTypology, openingDirection, type Catalog, type Opening, type WindowDesign } from '@dekopen/engine'
import type { Locale } from '@dekopen/shared'
import { getFormatter, getGlossary, translate } from '../../../lib/i18n'
import es from '../i18n/es'
import { openingTokenName } from './undo'

/** Token estable de una apertura (ver `openingTokenName`). */
export function openingToken(opening: Opening | undefined): string {
  const kind = opening?.kind ?? 'fixed'
  const use = opening?.use
  if ((use === 'balcony' || use === 'entrance') && (kind === 'casement' || kind === 'tilt_turn' || kind === 'door')) return `${kind}@${use}`
  if ((kind === 'casement' || kind === 'door') && opening && openingDirection(opening) === 'out') return `${kind}:out`
  return kind
}

/** Nombre corto de la apertura: «Abatible», «Proyectante», «Puerta de acceso»… */
export function openingName(opening: Opening | undefined, locale?: Locale): string {
  return openingTokenName(openingToken(opening), locale)
}

/** Nombre con detalle (bisagras, secuencia, deslizamiento, eje), para accesibilidad. */
export function openingDetail(opening: Opening | undefined, locale?: Locale): string {
  const name = openingName(opening, locale)
  if (!opening) return name
  const t = (key: Parameters<typeof translate<typeof es>>[1], params: Record<string, string | number>) => translate(es, key, params, locale)
  const kind = opening.kind
  let text = name
  if (opening.hinge && (kind === 'casement' || kind === 'tilt_turn' || kind === 'door')) text = t('node.openingDetail.hinge', { opening: text, side: opening.hinge })
  if (kind === 'tilt_turn' && opening.sequence === 'tilt_first') text = t('node.openingDetail.tiltFirst', { opening: text })
  if ((kind === 'tilt_slide' || kind === 'parallel_slide') && opening.slide) text = t('node.openingDetail.slide', { opening: text, side: opening.slide })
  if (kind === 'folding' && opening.hinge) text = t('node.openingDetail.fold', { opening: text, side: opening.hinge })
  if (kind === 'pivot_v' || kind === 'pivot_h') {
    const r = typeof opening.pivot === 'number' ? opening.pivot : 0.5
    const axis = kind === 'pivot_v' ? 'vertical' : 'horizontal'
    text = Math.abs(r - 0.5) < 0.005 ? t('node.openingDetail.pivotCenter', { opening: text }) : t('node.openingDetail.pivotAt', { opening: text, axis, pct: getFormatter({ locale }).pct(Math.round(r * 100)) })
  }
  return text
}

/** Leyenda de la ventana: nombre de la tipología (o «Ventana») + medidas. */
export function designCaption(design: WindowDesign, locale?: Locale): string {
  const g = getGlossary(locale)
  const fmt = getFormatter({ locale })
  if (design.assembly) {
    const assembly = translate(es, `assembly.kind.${design.assembly.kind}`, undefined, locale)
    return translate(es, 'caption.design', { name: assembly, size: fmt.size(design.width, design.height) }, locale)
  }
  let id: string | undefined
  try {
    id = matchTypology(design)
  } catch {
    id = undefined
  }
  const name = id ? g.typology(id) : translate(es, 'caption.window', undefined, locale)
  return translate(es, 'caption.design', { name, size: fmt.size(design.width, design.height) }, locale)
}

/** Nombre del vidrio del catálogo (no se traduce: es dato del catálogo). */
export function glassLabel(catalog: Catalog | undefined, glassId: string | undefined): string | undefined {
  return glassId ? catalog?.glass.find((g) => g.id === glassId)?.name : undefined
}
