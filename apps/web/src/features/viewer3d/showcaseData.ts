import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { computeLayout, createDesign, TYPOLOGIES, type Catalog, type Layout, type Line, type TypologyId, type WindowDesign } from '@dekopen/engine'
import { FIXTURE_TYPOLOGIES, type FixtureTypologyId, fixtureWindow } from './fixtures'

/** Datos de la ruta /dev/3d: el motor real con el catálogo de ejemplo. */

export interface ShowcaseTypology {
  id: TypologyId
  label: string
}

export interface ShowcaseWindow {
  design: WindowDesign
  layout: Layout
  catalog: Catalog
  line?: Line
  /** true si el motor falló y se muestra la geometría de ejemplo del visor. */
  fallback: boolean
}

export const SHOWCASE_CATALOG: Catalog = SAMPLE_CATALOG

export const SHOWCASE_TYPOLOGIES: ShowcaseTypology[] = TYPOLOGIES.map((typology) => ({ id: typology.id, label: typology.name }))

/** Primera línea del catálogo que fabrica la tipología (si ninguna la declara, la primera del tipo). */
export function lineFor(catalog: Catalog, typologyId: TypologyId): Line | undefined {
  const typology = TYPOLOGIES.find((item) => item.id === typologyId)
  const kind = typology?.kind ?? 'casement'
  return (
    catalog.lines.find((line) => line.kind === kind && line.typologyIds.includes(typologyId)) ??
    catalog.lines.find((line) => line.kind === kind) ??
    catalog.lines[0]
  )
}

export function showcaseWindow(typologyId: TypologyId, options: { colorId: string; colorInId?: string }): ShowcaseWindow {
  const catalog = SHOWCASE_CATALOG
  const line = lineFor(catalog, typologyId)
  const glass = catalog.glass.find((item) => item.kind === 'dvh') ?? catalog.glass[0]
  try {
    const design = createDesign(typologyId, { lineId: line?.id ?? '', colorId: options.colorId, glassId: glass?.id ?? '' })
    if (options.colorInId) design.colorInId = options.colorInId
    return { design, layout: computeLayout(design, catalog), catalog, line, fallback: false }
  } catch (error) {
    console.warn('[viewer3d] El motor no pudo calcular la tipología; se muestra la geometría de ejemplo.', error)
    const id = (FIXTURE_TYPOLOGIES.some((item) => item.id === typologyId) ? typologyId : 'fixed') as FixtureTypologyId
    const fixture = fixtureWindow(id, options)
    return { ...fixture, line: fixture.catalog.lines.find((item) => item.id === fixture.design.lineId), fallback: true }
  }
}
