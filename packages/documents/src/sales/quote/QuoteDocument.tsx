/**
 * Cotización para el cliente dibujada con una plantilla (`DocTemplate`): uno de los 10 diseños
 * predefinidos, una plantilla propia de la organización o la que se está editando. Los ids v4
 * (`esencial`, `galeria`, `compacta`, `editorial`) siguen funcionando: se traducen a su diseño
 * equivalente. Las cifras salen siempre del motor (`QuoteDocData`).
 */
import { useMemo } from 'react'
import {
  DOC_PRESET_TRAITS,
  QUOTE_PRESET_IDS,
  presetDescription,
  presetName,
  type DocTemplate,
  type Locale,
  type QuotePresetId,
} from '@dekopen/shared'
import { documentMessages } from '../../i18n'
import { translate } from '@dekopen/shared'
import { buildQuoteModel, type QuoteModel, type QuoteRenderOptions } from '../../templates/model'
import { MeasuredTemplateDocument, TemplateDocumentView } from '../../templates/Document'
import { themeFontIds } from '../../templates/theme'
import type { QuoteDocumentProps } from '../types'

export interface QuoteDocumentV5Props extends Omit<QuoteDocumentProps, 'template'> {
  /** Plantilla: objeto (editor), id de diseño (`luz`), id v4 (`esencial`) o nada (la de los datos). */
  template?: string | DocTemplate | null
  /** Idioma del documento (por defecto el de la cotización o la organización). */
  locale?: Locale
  /** Edición en el lugar de títulos y textos libres de secciones (editor de plantillas). */
  onSectionEdit?: QuoteRenderOptions['onSectionEdit']
  /** Sección elegida en el lienzo de edición. */
  selectedSectionId?: string
  editableFields?: QuoteRenderOptions['editableFields']
  onItemEdit?: QuoteRenderOptions['onItemEdit']
  guides?: QuoteRenderOptions['guides']
  /**
   * Medir en el DOM y repaginar con los altos reales (por defecto en el navegador). `false` deja la
   * paginación estimada (miniaturas de galería, impresión estática).
   */
  measure?: boolean
}

function canMeasure(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined' && typeof getComputedStyle === 'function'
}

function modelOptions(p: QuoteDocumentV5Props): QuoteRenderOptions {
  return {
    template: p.template ?? null,
    ...(p.locale ? { locale: p.locale } : {}),
    ...(p.editable ? { editable: true } : {}),
    ...(p.onEdit ? { onEdit: p.onEdit } : {}),
    ...(p.onSectionEdit ? { onSectionEdit: p.onSectionEdit } : {}),
    ...(p.selectedSectionId ? { selectedSectionId: p.selectedSectionId } : {}),
    ...(p.editableFields ? { editableFields: p.editableFields } : {}),
    ...(p.onItemEdit ? { onItemEdit: p.onItemEdit } : {}),
    ...(p.guides !== undefined ? { guides: p.guides } : {}),
  }
}

function MeasuredQuoteDocument(props: QuoteDocumentV5Props) {
  const { data, template, locale, editable, onEdit, onSectionEdit, selectedSectionId, editableFields, onItemEdit, guides } = props
  const model = useMemo(
    () => buildQuoteModel(data, modelOptions({ data, template, locale, editable, onEdit, onSectionEdit, selectedSectionId, editableFields, onItemEdit, guides })),
    [data, template, locale, editable, onEdit, onSectionEdit, selectedSectionId, editableFields, onItemEdit, guides],
  )
  return <MeasuredTemplateDocument model={model} withStyles={props.withStyles} className={props.className} />
}

/** Cotización con plantilla (vista previa, PDF y portal). */
export function QuoteDocument(props: QuoteDocumentV5Props) {
  if (props.measure !== false && canMeasure()) return <MeasuredQuoteDocument {...props} />
  const model = buildQuoteModel(props.data, modelOptions(props))
  return <TemplateDocumentView model={model} withStyles={props.withStyles} className={props.className} />
}

/** Datos para armar el HTML del PDF: idioma (`<html lang>`), fuentes a incrustar y plantilla resuelta. */
export interface PreparedQuoteDocument {
  model: QuoteModel
  lang: string
  /** Fuentes (lista cerrada) que usa la plantilla resuelta. */
  fonts: ReturnType<typeof themeFontIds>
  /** Título del documento en su idioma («Cotización N° 412 · Casa Muñoz»). */
  title: string
}

export function prepareQuoteDocument(props: Pick<QuoteDocumentV5Props, 'data' | 'template' | 'locale'>): PreparedQuoteDocument {
  const model = buildQuoteModel(props.data, modelOptions(props as QuoteDocumentV5Props))
  return {
    model,
    lang: model.kit.lang,
    fonts: themeFontIds(model.theme),
    title: [model.reference, model.title || model.data.org.name].filter(Boolean).join(' · '),
  }
}

export interface QuoteTemplateOption {
  id: QuotePresetId
  name: string
  description: string
  bestFor: string
}

/** Los 10 diseños de cotización con nombre, descripción y para quién sirve, en el idioma pedido. */
export function quoteTemplateOptions(locale: Locale = 'es'): QuoteTemplateOption[] {
  return QUOTE_PRESET_IDS.map((id) => ({
    id,
    name: presetName(id, locale),
    description: presetDescription(id, locale),
    bestFor: translate(documentMessages, `presets.audience.${DOC_PRESET_TRAITS[id].audience}` as Parameters<typeof translate<typeof documentMessages.es>>[1], undefined, locale),
  }))
}

/** Diseños de cotización (español). Para otro idioma: `quoteTemplateOptions(locale)`. */
export const QUOTE_TEMPLATES: QuoteTemplateOption[] = quoteTemplateOptions('es')
