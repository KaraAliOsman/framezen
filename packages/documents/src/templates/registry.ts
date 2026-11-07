/**
 * Registro de secciones de cotización: tipo → componente de confianza que entrega bloques paginables.
 * Las secciones de catálogo las dibuja `sales/catalog` (TPL-CAT); si una plantilla de cotización trae
 * un tipo sin renderizador (no debería: el esquema lo impide) simplemente no se imprime.
 */
import type { DocSectionType } from '@dekopen/shared'
import type { SectionRenderer } from './sections/common'
import { renderCover } from './sections/cover'
import { renderClientStrip, renderLetter, renderProjectSummary } from './sections/intro'
import { renderItems } from './sections/items'
import { renderPayment, renderTotals } from './sections/commercial'
import { renderFinishesBoard, renderOptionsComparison, renderTechnicalSpecs } from './sections/specs'
import { renderAboutUs, renderAcceptance, renderCustomText, renderGallery, renderPageBreak, renderTerms, renderWarranty } from './sections/closing'

export const QUOTE_SECTION_RENDERERS: Readonly<Partial<Record<DocSectionType, SectionRenderer>>> = {
  cover: renderCover,
  letter: renderLetter,
  client_strip: renderClientStrip,
  project_summary: renderProjectSummary,
  items: renderItems,
  options_comparison: renderOptionsComparison,
  technical_specs: renderTechnicalSpecs,
  finishes_board: renderFinishesBoard,
  totals: renderTotals,
  payment: renderPayment,
  terms: renderTerms,
  warranty: renderWarranty,
  about_us: renderAboutUs,
  gallery: renderGallery,
  acceptance: renderAcceptance,
  custom_text: renderCustomText,
  page_break: renderPageBreak,
}
