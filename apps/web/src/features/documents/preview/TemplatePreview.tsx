/**
 * Vista previa de una plantilla con datos reales (el mismo renderizador del PDF, @dekopen/documents):
 * cotización (TPL-CORE) o catálogo (TPL-CAT). Escala la página al ancho disponible o al zoom pedido.
 * La edición sobre la hoja la pone `DocCanvas`, que envuelve esta vista.
 */
import { memo, useMemo, type ReactNode } from 'react'
import { CatalogDocument, QuoteDocument, type CatalogDocData, type QuoteDocData, type QuoteDocDataV5, type QuoteDocField } from '@dekopen/documents'
import { PAGE_SIZE_MM, type DocLocale, type DocTemplate, type DocTemplateKind } from '@dekopen/shared'
import { ErrorBoundary, ZoneError } from '../../../ui'
import { useT } from '../../../lib/i18n'
import { ScaledDoc } from '../ScaledDoc'
import es from '../i18n/es'

/** Ancho de la hoja en px CSS (96 dpi): A4 ≈ 794, Carta 816. */
export function pageWidthPx(template: Pick<DocTemplate, 'page'>): number {
  const sheet = PAGE_SIZE_MM[template.page.size] ?? PAGE_SIZE_MM.A4
  return Math.round(((template.page.orientation === 'landscape' ? sheet.height : sheet.width) * 96) / 25.4)
}

export interface TemplatePreviewProps {
  template: DocTemplate
  kind: DocTemplateKind
  quote?: QuoteDocData | null
  catalog?: CatalogDocData | null
  locale: DocLocale
  currency?: string
  taxLabel?: string
  /** Imágenes subidas (assetId → data URL). */
  assets?: Readonly<Record<string, string>>
  selectedSectionId?: string | null
  /** Edición en el lugar de títulos y textos libres (si el renderizador la ofrece). */
  onSectionText?: (sectionId: string, slot: 'title' | 'subtitle' | 'content', value: string) => void
  /** Textos de la empresa escritos en la hoja. */
  onEdit?: (field: QuoteDocField, value: string) => void
  /** Campos que se pueden escribir en la hoja. */
  editableFields?: readonly QuoteDocField[]
  /** Miniatura: sólo la parte de arriba de la primera hoja, sin interacción. */
  thumbnail?: boolean
  /** Zoom fijo (1 = 100 %); sin él se ajusta al ancho. */
  scale?: number
  className?: string
}

type RendererProps = Omit<TemplatePreviewProps, 'thumbnail' | 'scale' | 'className'> & { measure?: boolean }

/**
 * Renderizador de cotizaciones con plantilla (TPL-CORE): `QuoteDocument` acepta la plantilla como
 * objeto, el idioma del documento y la edición en el lugar de las secciones.
 */
function QuoteRenderer({ template, quote, locale, currency, taxLabel, selectedSectionId, onSectionText, onEdit, editableFields, assets, measure }: RendererProps) {
  // Los recursos de la plantilla (fotos subidas, moneda, idioma) viajan en `data.document`.
  const data = useMemo(() => {
    if (!quote) return null
    // La plantilla se ve sola: los ajustes propios de la cotización de ejemplo no se le suman.
    const { overrides: _own, ...base } = (quote as QuoteDocDataV5).document ?? {}
    void _own
    return {
      ...quote,
      document: { ...base, locale, ...(currency ? { currency } : {}), ...(taxLabel ? { taxLabel } : {}), ...(assets && Object.keys(assets).length ? { assets: { ...(base.assets ?? {}), ...assets } } : {}) },
    } as QuoteDocDataV5
  }, [quote, locale, currency, taxLabel, assets])
  if (!data) return null
  return <QuoteDocument data={data} template={template} locale={locale} selectedSectionId={selectedSectionId ?? undefined} onSectionEdit={onSectionText} editable={Boolean(onEdit)} onEdit={onEdit} editableFields={editableFields} measure={measure} withStyles />
}

function CatalogRenderer({ template, catalog, locale, currency, taxLabel, assets, onSectionText }: RendererProps) {
  if (!catalog) return null
  return <CatalogDocument data={catalog} template={template.id} spec={template} locale={locale} currency={currency} taxLabel={taxLabel} assets={assets} onSectionEdit={onSectionText} />
}

const Renderer = memo(function Renderer(props: RendererProps) {
  return props.kind === 'catalog' ? <CatalogRenderer {...props} /> : <QuoteRenderer {...props} />
})

export function TemplatePreview({ thumbnail, scale, className, ...props }: TemplatePreviewProps) {
  const t = useT(es)
  const width = pageWidthPx(props.template)
  const body: ReactNode = (
    <ErrorBoundary fallback={({ reset }) => <ZoneError title={t('canvas.renderError')} onRetry={reset} />}>
      <Renderer {...props} measure={!thumbnail} />
    </ErrorBoundary>
  )

  return (
    <div className={className}>
      {/* Los documentos se imprimen siempre en claro: la vista previa no hereda el tema oscuro. */}
      <div data-theme="light" className="fz-tpl-preview">
        <ScaledDoc pageWidth={width} scale={scale} crop={thumbnail ? 1.294 : undefined} inert={thumbnail}>
          {body}
        </ScaledDoc>
      </div>
    </div>
  )
}
