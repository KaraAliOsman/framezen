import { SAMPLE_CATALOG } from '@dekopen/catalog'
import { TypologyIcon, WindowDrawing } from '@dekopen/documents'
import { useLocale } from '../../../lib/i18n'
import type { ExampleResult, HeroTypology } from './designerModel'
import { DrawingBoundary } from './DrawingBoundary'

interface SampleWindowProps {
  example: ExampleResult | null
  /** Para el pictograma de respaldo. */
  typology: HeroTypology
  /** Tamaño del dibujo en px. */
  boxWidth: number
  boxHeight: number
  dimensions?: 'all' | 'none'
}

/** Dibujo pequeño de una ventana del catálogo de ejemplo (miniaturas de documentos). */
export function SampleWindow({ example, typology, boxWidth, boxHeight, dimensions = 'none' }: SampleWindowProps) {
  const { locale } = useLocale()
  const fallback = (
    <div className="grid place-items-center text-paper-350" style={{ width: boxWidth, height: boxHeight }}>
      <span aria-hidden>
        <TypologyIcon typologyId={typology} size={40} strokeWidth={2} />
      </span>
    </div>
  )
  if (!example) return fallback
  return (
    <DrawingBoundary resetKey={`${typology}-${example.design.width}-${example.design.height}`} fallback={fallback}>
      <WindowDrawing
        layout={example.layout}
        design={example.design}
        catalog={SAMPLE_CATALOG}
        view="interior"
        locale={locale}
        dimensions={dimensions}
        width={boxWidth}
        height={boxHeight}
      />
    </DrawingBoundary>
  )
}
