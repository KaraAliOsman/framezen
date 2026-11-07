/**
 * Archivos binarios por organización (migración 0004_assets). Se reexporta desde schema.ts.
 * Nunca seleccionar `bytes` en listados: usar `assetColumns` (services/assets) para no traer
 * megabytes por fila.
 */
import { sql } from 'drizzle-orm'
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core'
import type { AssetKind, AssetMimeType, TextureAssetMeta } from '@dekopen/shared'
import { bytea } from './bytea'
import { orgs, users } from './schema'

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

/** Metadatos por tipo: texturas (TextureAssetMeta), miniaturas y otras imágenes. */
export type AssetMeta = Partial<TextureAssetMeta> & Record<string, unknown>

export const assets = pgTable(
  'assets',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id').notNull().references(() => orgs.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<AssetKind>().notNull(),
    name: text('name'),
    mime: text('mime').$type<AssetMimeType>().notNull(),
    bytes: bytea('bytes').notNull(),
    byteSize: integer('byte_size').notNull(),
    width: integer('width'),
    height: integer('height'),
    sha256: text('sha256').notNull(),
    meta: jsonb('meta').$type<AssetMeta>().notNull().default(sql`'{}'::jsonb`),
    /** Miniatura → textura de la que sale (se borra con ella). */
    parentId: text('parent_id').references((): AnyPgColumn => assets.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: ts('created_at').notNull().defaultNow(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    deletedAt: ts('deleted_at'),
  },
  (t) => [
    uniqueIndex('assets_org_kind_sha_uq').on(t.orgId, t.kind, t.sha256),
    index('assets_org_kind_created_idx').on(t.orgId, t.kind, t.createdAt),
    index('assets_org_parent_idx').on(t.orgId, t.parentId),
  ],
)
