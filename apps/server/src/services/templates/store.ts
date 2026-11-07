/**
 * Plantillas de documentos propias de cada organización (tabla `document_templates`).
 *
 * - Lo guardado siempre es un `DocTemplate` validado con el esquema compartido (DOCSCHEMA). Al leer
 *   se vuelve a validar: si una fila vieja o manipulada no calza, se repara con `repairDocTemplate`
 *   y, si ni así, se usa su diseño predefinido de origen. Nunca se entrega una plantilla inválida.
 * - El id de la fila es el id de la plantilla (`template.id`) y el nombre de la fila es el de la
 *   plantilla: se mantienen sincronizados aquí, no en la ruta.
 * - Control optimista: cada escritura exige la versión leída y la sube en 1.
 * - Borrado suave (deshacer): las filas borradas siguen sirviendo para dibujar documentos ya
 *   emitidos que las usaban (ver resolve.ts), pero no aparecen en la galería.
 */
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'
import {
  DEFAULT_CATALOG_PRESET_ID,
  DEFAULT_QUOTE_PRESET_ID,
  getDocPreset,
  presetForLegacyId,
  presetKind,
  repairDocTemplate,
  validateDocTemplate,
  type DocIssue,
  type DocPresetId,
  type DocTemplate,
  type DocTemplateKind,
} from '@dekopen/shared'
import type { Db } from '../../db/client'
import { documentTemplates } from '../../db/schema'
import { newId } from '../../lib/crypto'

/** Tope de plantillas vigentes por organización y tipo (evita abuso; ninguna persona real llega). */
export const MAX_TEMPLATES_PER_KIND = 60

export type TemplateRow = typeof documentTemplates.$inferSelect

export interface StoredTemplate {
  id: string
  kind: DocTemplateKind
  name: string
  presetId: DocPresetId | null
  template: DocTemplate
  version: number
  createdBy: string | null
  updatedBy: string | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  /** Avisos de la lectura (p. ej. se reparó algo de una versión anterior). */
  issues: DocIssue[]
}

const defaultPreset = (kind: DocTemplateKind): DocPresetId => (kind === 'quote' ? DEFAULT_QUOTE_PRESET_ID : DEFAULT_CATALOG_PRESET_ID)

/** Asegura id, tipo y nombre de la fila dentro de la plantilla. */
function withIdentity(template: DocTemplate, row: Pick<TemplateRow, 'id' | 'kind' | 'name'>): DocTemplate {
  if (template.id === row.id && template.kind === row.kind && template.name === row.name) return template
  return { ...template, id: row.id, kind: row.kind, name: template.name || row.name }
}

/** Fila → plantilla válida (repara si hace falta; nunca lanza). */
export function rowToStored(row: TemplateRow): StoredTemplate {
  const kind = row.kind
  // Diseños retirados en v6: la fila sigue apuntando al id viejo; vale su equivalente vigente.
  const current = presetForLegacyId(row.presetId)
  const presetId = current && presetKind(current) === kind ? current : null
  const raw = row.spec as unknown
  const spec = raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>), id: row.id, kind } : raw
  const checked = validateDocTemplate(spec, { kind })
  let template: DocTemplate
  let issues: DocIssue[] = []
  if (checked.ok) {
    template = checked.template
    issues = checked.issues
  } else {
    const base = getDocPreset(presetId ?? defaultPreset(kind))
    const repaired = repairDocTemplate(spec, { kind, id: row.id, name: row.name, base })
    const again = validateDocTemplate(repaired.template, { kind })
    if (again.ok) {
      template = again.template
      issues = [...repaired.issues, ...again.issues]
    } else {
      template = { ...base, id: row.id, name: row.name, presetId: base.presetId }
      issues = [...checked.issues.map((i) => ({ ...i, severity: 'warning' as const }))]
    }
  }
  template = withIdentity(template, row)
  return {
    id: row.id,
    kind,
    name: template.name,
    presetId,
    template,
    version: row.version,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    issues,
  }
}

export async function listTemplates(db: Db, orgId: string, kind?: DocTemplateKind): Promise<StoredTemplate[]> {
  const where = [eq(documentTemplates.orgId, orgId), isNull(documentTemplates.deletedAt)]
  if (kind) where.push(eq(documentTemplates.kind, kind))
  const rows = await db
    .select()
    .from(documentTemplates)
    .where(and(...where))
    .orderBy(desc(documentTemplates.updatedAt), asc(documentTemplates.id))
    .limit(MAX_TEMPLATES_PER_KIND * 2)
  return rows.map(rowToStored)
}

export async function findTemplateRow(db: Db, orgId: string, id: string, options: { includeDeleted?: boolean } = {}): Promise<TemplateRow | undefined> {
  const where = [eq(documentTemplates.orgId, orgId), eq(documentTemplates.id, id)]
  if (!options.includeDeleted) where.push(isNull(documentTemplates.deletedAt))
  const [row] = await db
    .select()
    .from(documentTemplates)
    .where(and(...where))
    .limit(1)
  return row
}

export async function getTemplate(db: Db, orgId: string, id: string, options: { includeDeleted?: boolean } = {}): Promise<StoredTemplate | null> {
  const row = await findTemplateRow(db, orgId, id, options)
  return row ? rowToStored(row) : null
}

export async function countTemplates(db: Db, orgId: string, kind: DocTemplateKind): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(documentTemplates)
    .where(and(eq(documentTemplates.orgId, orgId), eq(documentTemplates.kind, kind), isNull(documentTemplates.deletedAt)))
  return Number(row?.n ?? 0)
}

export interface InsertTemplateInput {
  orgId: string
  userId: string | null
  /** Plantilla ya validada (su id y nombre se reemplazan por los de la fila). */
  template: DocTemplate
  now: Date
}

export async function insertTemplate(db: Db, input: InsertTemplateInput): Promise<StoredTemplate> {
  const id = newId()
  const template: DocTemplate = { ...input.template, id }
  const presetId = template.presetId && presetKind(template.presetId) === template.kind ? template.presetId : null
  const [row] = await db
    .insert(documentTemplates)
    .values({
      id,
      orgId: input.orgId,
      kind: template.kind,
      name: template.name,
      presetId,
      spec: template,
      schemaVersion: template.schemaVersion,
      version: 1,
      createdBy: input.userId,
      updatedBy: input.userId,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning()
  return rowToStored(row!)
}

export type UpdateResult = { ok: true; stored: StoredTemplate } | { ok: false; reason: 'not_found' } | { ok: false; reason: 'conflict'; current: StoredTemplate }

/** Reemplaza la plantilla si la versión coincide (optimista). */
export async function updateTemplate(
  db: Db,
  input: { orgId: string; id: string; userId: string | null; template: DocTemplate; expectedVersion: number; now: Date },
): Promise<UpdateResult> {
  const template: DocTemplate = { ...input.template, id: input.id }
  const [row] = await db
    .update(documentTemplates)
    .set({
      name: template.name,
      spec: template,
      schemaVersion: template.schemaVersion,
      version: sql`${documentTemplates.version} + 1`,
      updatedBy: input.userId,
      updatedAt: input.now,
    })
    .where(
      and(
        eq(documentTemplates.orgId, input.orgId),
        eq(documentTemplates.id, input.id),
        eq(documentTemplates.version, input.expectedVersion),
        isNull(documentTemplates.deletedAt),
      ),
    )
    .returning()
  if (row) return { ok: true, stored: rowToStored(row) }
  const current = await getTemplate(db, input.orgId, input.id)
  return current ? { ok: false, reason: 'conflict', current } : { ok: false, reason: 'not_found' }
}

export async function softDeleteTemplate(db: Db, orgId: string, id: string, now: Date): Promise<StoredTemplate | null> {
  const [row] = await db
    .update(documentTemplates)
    .set({ deletedAt: now, updatedAt: now, version: sql`${documentTemplates.version} + 1` })
    .where(and(eq(documentTemplates.orgId, orgId), eq(documentTemplates.id, id), isNull(documentTemplates.deletedAt)))
    .returning()
  return row ? rowToStored(row) : null
}

export async function restoreTemplate(db: Db, orgId: string, id: string, now: Date): Promise<StoredTemplate | null> {
  const [row] = await db
    .update(documentTemplates)
    .set({ deletedAt: null, updatedAt: now, version: sql`${documentTemplates.version} + 1` })
    .where(and(eq(documentTemplates.orgId, orgId), eq(documentTemplates.id, id), sql`${documentTemplates.deletedAt} is not null`))
    .returning()
  return row ? rowToStored(row) : null
}
