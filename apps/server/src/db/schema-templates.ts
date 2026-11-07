/**
 * Plantillas de documentos por organización (migración 0006_document_templates). Se reexporta
 * desde schema.ts. `spec` es un DocTemplate de @dekopen/shared/templates: se valida con su esquema
 * zod al leer y al escribir (services/templates, TPL-EDITOR); aquí se guarda como JSON opaco.
 */
import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core'
import type { DocTemplate } from '@dekopen/shared'
import { orgs, users } from './schema'

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

export type DocumentTemplateKind = 'quote' | 'catalog'

/**
 * JSON del DocTemplate. El tipo es el de la versión vigente; lo guardado puede venir de una
 * versión anterior, así que se valida/migra al leer (services/templates) antes de usarlo.
 */
export type DocumentTemplateSpecJson = DocTemplate

export const documentTemplates = pgTable(
  'document_templates',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<DocumentTemplateKind>().notNull(),
    name: text('name').notNull(),
    /** Diseño predefinido del que se duplicó (null = desde cero o generado con IA). */
    presetId: text('preset_id'),
    spec: jsonb('spec').$type<DocumentTemplateSpecJson>().notNull(),
    schemaVersion: integer('schema_version').notNull().default(1),
    /** Control optimista del editor. */
    version: integer('version').notNull().default(1),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [index('document_templates_org_kind_idx').on(t.orgId, t.kind, t.updatedAt)],
)
