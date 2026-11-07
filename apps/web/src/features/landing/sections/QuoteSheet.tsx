import { QuoteDocument, type QuoteDocData, type QuoteDocDataV5 } from '@dekopen/documents'
import type { DocTemplate } from '@dekopen/shared'
import { useLocale } from '../../../lib/i18n'
import { documentTemplateFontCss } from '../../documents/fonts'
import { DrawingBoundary } from '../designer/DrawingBoundary'

/**
 * Documento real: `QuoteDocument`, el mismo que imprime el PDF, sin interacción. Se carga aparte
 * (trae el renderizador y las fuentes de las plantillas). El tamaño y las hojas que se ven los
 * decide quien lo usa con `scale` y su CSS.
 */
export default function QuoteSheet({ doc, template, scale, className }: { doc: QuoteDocData; template: DocTemplate; scale: number; className?: string }) {
  const { locale } = useLocale()
  const data = doc as QuoteDocDataV5
  return (
    <div inert aria-hidden data-theme="light" className={className}>
      <style>{documentTemplateFontCss()}</style>
      <div className="w-max origin-top-left select-none" style={{ transform: `scale(${scale})` }}>
        <DrawingBoundary resetKey={`${template.id}-${locale}`} fallback={null}>
          <QuoteDocument key={template.id} data={{ ...data, document: { ...data.document, locale } } as QuoteDocDataV5} template={template} locale={locale} measure withStyles />
        </DrawingBoundary>
      </div>
    </div>
  )
}
