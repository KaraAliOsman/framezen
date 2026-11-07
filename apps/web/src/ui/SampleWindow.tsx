/**
 * Ventana real dibujada por el motor con el catálogo de ejemplo (no son datos de nadie): la misma
 * que recibe un cliente, sin cotas. Para estados vacíos y acceso; se carga aparte porque arrastra el
 * motor y los dibujos.
 */
import { useMemo } from 'react'
import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { WindowDrawing } from '@dekopen/documents'
import { computeLayout, createDesign, type TypologyId } from '@dekopen/engine'
import { useLocale } from '../lib/i18n'
import { useTheme } from '../lib/theme'

export interface SampleWindowSpec {
  typology: TypologyId
  width: number
  height: number
  /** Color del catálogo de ejemplo: 'blanco' | 'nogal' | 'roble-dorado' | 'antracita' | 'negro'. */
  colorId?: string
}

export function sampleWindow(spec: SampleWindowSpec) {
  const catalog = SAMPLE_CATALOG
  const sliding = /^(sliding|lift_slide|tilt_slide|parallel)/.test(spec.typology)
  const line =
    catalog.lines.find((l) => l.typologyIds.includes(spec.typology)) ??
    catalog.lines.find((l) => l.kind === (sliding ? 'sliding' : 'casement')) ??
    catalog.lines[0]
  const glass = catalog.glass.find((g) => g.kind === 'dvh') ?? catalog.glass[0]
  const color = catalog.colors.find((c) => c.id === spec.colorId) ?? catalog.colors[0]
  const design = createDesign(spec.typology, {
    lineId: line?.id ?? '',
    width: spec.width,
    height: spec.height,
    colorId: color?.id ?? '',
    glassId: glass?.id ?? '',
  })
  return { design, layout: computeLayout(design, catalog), catalog }
}

/** Sobre la hoja clara manda el antracita; sobre la oscura, el blanco: la ventana siempre se recorta del fondo. */
export default function SampleWindow({ spec, height }: { spec: SampleWindowSpec; height: number }) {
  const { locale } = useLocale()
  const { resolved } = useTheme()
  const colorId = spec.colorId ?? (resolved === 'dark' ? 'blanco' : 'antracita')
  const sample = useMemo(() => {
    try {
      return sampleWindow({ ...spec, colorId })
    } catch {
      return null
    }
  }, [spec, colorId])
  if (!sample) return null
  return <WindowDrawing layout={sample.layout} design={sample.design} catalog={sample.catalog} dimensions="none" symbols={false} detail="high" height={height} locale={locale} />
}
