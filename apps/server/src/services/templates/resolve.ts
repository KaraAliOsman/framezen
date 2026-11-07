/**
 * Resolución de la plantilla con que se dibuja un documento (contrato para el PDF, el portal y el
 * asistente). Una referencia guardada (`DocumentPrefs.quoteTemplate`, `overrides.templateId`) puede
 * ser un diseño predefinido (`luz`), un id v4 (`esencial` → `luz`) o el id de una plantilla propia.
 *
 * Reglas:
 * - Diseño predefinido / id v4 → copia del diseño.
 * - Plantilla propia → la fila de la organización, aunque esté borrada (un documento ya emitido no
 *   cambia de aspecto porque alguien limpió la galería). Si no existe o es de otro tipo → el diseño
 *   del que se duplicó, y si no, el diseño por defecto del tipo.
 * - Nunca lanza ni devuelve una plantilla inválida; nunca busca fuera de la organización.
 */
import {
  getDocPreset,
  pickQuoteTemplateRef,
  resolveDocTemplateRef,
  resolveQuoteDocument,
  type DocLocale,
  type DocTemplate,
  type DocTemplateKind,
  type DocumentPrefs,
  type Org,
  type Quote,
  type ResolvedQuoteDocument,
} from '@dekopen/shared'
import type { Db } from '../../db/client'
import { findTemplateRow, rowToStored } from './store'

export type TemplateSource = 'preset' | 'legacy' | 'org' | 'default' | 'fallback'

export interface LoadedTemplate {
  template: DocTemplate
  /** De dónde salió: diseño, id v4 traducido, plantilla propia, por defecto o respaldo. */
  source: TemplateSource
  /** Id pedido (tal cual estaba guardado). */
  requested?: string
}

/** Plantilla para una referencia guardada (ver reglas arriba). */
export async function loadDocTemplate(db: Db, orgId: string, ref: unknown, kind: DocTemplateKind): Promise<LoadedTemplate> {
  const resolved = resolveDocTemplateRef(ref, kind)
  const requested = typeof ref === 'string' ? ref : undefined
  if (resolved.source !== 'org') {
    return { template: getDocPreset(resolved.id as Parameters<typeof getDocPreset>[0]), source: resolved.source, requested }
  }
  try {
    const row = await findTemplateRow(db, orgId, resolved.id, { includeDeleted: true })
    if (row && row.kind === kind) return { template: rowToStored(row).template, source: 'org', requested }
    if (row?.presetId) {
      const fromPreset = resolveDocTemplateRef(row.presetId, kind)
      if (fromPreset.source === 'preset') return { template: getDocPreset(fromPreset.id as Parameters<typeof getDocPreset>[0]), source: 'fallback', requested }
    }
  } catch {
    // Un id raro (o la base caída) no tumba el documento: se usa el diseño por defecto.
  }
  return { template: getDocPreset(resolved.fallbackPresetId), source: 'fallback', requested }
}

export interface ResolveOrgQuoteDocumentInput {
  /** `OrgSettings.documents` (capa de organización v4: textos, validez, papel, acento). */
  documents: Partial<DocumentPrefs> | null | undefined
  /** La cotización (o la foto enviada): sólo se lee `documentOverrides`. */
  quote: Pick<Quote, 'documentOverrides'>
  org: Pick<Org, 'accent' | 'locale'>
}

export interface OrgQuoteDocument extends ResolvedQuoteDocument {
  source: TemplateSource
}

/**
 * Todo lo que necesita el renderizador de una cotización: plantilla elegida (cotización › empresa
 * › por defecto) ⊕ capa de la empresa ⊕ ajustes de la cotización, textos efectivos, validez, idioma
 * del documento y notas por ítem. Para `GET /api/quotes/:id/pdf`, el portal y el asistente.
 */
export async function resolveOrgQuoteDocument(db: Db, orgId: string, input: ResolveOrgQuoteDocumentInput): Promise<OrgQuoteDocument> {
  const ref = pickQuoteTemplateRef(input.documents, input.quote.documentOverrides)
  const loaded = await loadDocTemplate(db, orgId, ref.id, 'quote')
  const resolved = resolveQuoteDocument({
    template: loaded.template,
    orgPrefs: input.documents,
    overrides: input.quote.documentOverrides,
    brandAccent: input.org.accent ?? null,
    orgLocale: (input.org.locale as DocLocale | undefined) ?? null,
  })
  return { ...resolved, source: loaded.source }
}

/**
 * Plantilla con que se imprime una cotización (PDF y portal): la pedida a mano (`?template=`), si no
 * la elegida en la cotización, si no la predeterminada de la empresa. Nunca lanza.
 */
export async function loadQuoteTemplateForRender(
  db: Db,
  orgId: string,
  input: { requested?: string | null; documents: Partial<DocumentPrefs> | null | undefined; overrides: unknown },
): Promise<LoadedTemplate> {
  const asked = input.requested ? resolveDocTemplateRef(input.requested, 'quote') : undefined
  if (asked && asked.source !== 'default') {
    const loaded = await loadDocTemplate(db, orgId, asked.id, 'quote')
    // Un id que no existe (o ajeno) no se imprime como el diseño por defecto: se usa la elección normal.
    if (loaded.source !== 'fallback') return loaded
  }
  return loadDocTemplate(db, orgId, pickQuoteTemplateRef(input.documents, input.overrides).id, 'quote')
}

/** Plantilla de catálogo de la empresa (o la pedida por la ruta del PDF). */
export async function resolveOrgCatalogTemplate(db: Db, orgId: string, documents: Partial<DocumentPrefs> | null | undefined, requested?: unknown): Promise<LoadedTemplate> {
  const ref = requested ?? documents?.catalogTemplate
  return loadDocTemplate(db, orgId, ref, 'catalog')
}
