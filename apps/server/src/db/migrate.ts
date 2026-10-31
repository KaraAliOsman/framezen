/**
 * Runner propio e idempotente de migraciones SQL versionadas (formato drizzle-kit:
 * migrations/NNNN_nombre.sql con sentencias separadas por "--> statement-breakpoint").
 * Cada archivo se aplica una sola vez, dentro de una transacción con candado consultivo,
 * así que dos instancias arrancando a la vez no chocan.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { rowsOf, type Db } from './client'

export interface Migration {
  id: string
  statements: string[]
}

const LOCK_KEY = 7_290_412

/** Busca la carpeta de migraciones tanto en desarrollo (src/db) como en el bundle (dist). */
export function findMigrationsDir(): string {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    safePath(new URL('../../migrations', import.meta.url)), // src/db/migrate.ts
    safePath(new URL('./migrations', import.meta.url)), // dist/index.js (build copia la carpeta)
    safePath(new URL('../migrations', import.meta.url)),
    join(process.cwd(), 'migrations'),
    join(process.cwd(), 'apps/server/migrations'),
  ].filter((p): p is string => Boolean(p))
  const found = candidates.find((dir) => existsSync(join(dir, 'meta')) || hasSql(dir))
  if (!found) throw new Error(`No encontré la carpeta de migraciones (busqué en: ${candidates.join(', ')})`)
  return found
}

function safePath(url: URL): string | undefined {
  try {
    return fileURLToPath(url)
  } catch {
    return undefined
  }
}

function hasSql(dir: string): boolean {
  try {
    return readdirSync(dir).some((f) => f.endsWith('.sql'))
  } catch {
    return false
  }
}

export function loadMigrations(dir = findMigrationsDir()): Migration[] {
  return readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort()
    .map((file) => ({
      id: file.replace(/\.sql$/, ''),
      statements: readFileSync(join(dir, file), 'utf8')
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter(Boolean),
    }))
}

/** Aplica las migraciones pendientes. Devuelve los ids aplicados en esta llamada. */
export async function runMigrations(db: Db, migrations: Migration[] = loadMigrations()): Promise<string[]> {
  return db.transaction(async (tx) => {
    // El candado va ANTES de crear la tabla de control: dos instancias arrancando a la vez contra
    // una base vacía chocaban en el CREATE TABLE IF NOT EXISTS (23505 en pg_type) y una se caía.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${LOCK_KEY})`)
    await tx.execute(sql`CREATE TABLE IF NOT EXISTS "_fz_migrations" (
      "id" text PRIMARY KEY NOT NULL,
      "applied_at" timestamp with time zone DEFAULT now() NOT NULL
    )`)
    const done = new Set(rowsOf<{ id: string }>(await tx.execute(sql`SELECT id FROM "_fz_migrations"`)).map((r) => r.id))
    const applied: string[] = []
    for (const migration of migrations) {
      if (done.has(migration.id)) continue
      for (const statement of migration.statements) await tx.execute(sql.raw(statement))
      await tx.execute(sql`INSERT INTO "_fz_migrations" ("id") VALUES (${migration.id})`)
      applied.push(migration.id)
    }
    return applied
  })
}
