import { PGlite } from '@electric-sql/pglite'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { openSafePglite } from './pglite-safe'
import * as schema from './schema'

export type Schema = typeof schema
/** Base común de PGlite y postgres-js: el resto del servidor sólo conoce este tipo. */
export type Db = PgDatabase<PgQueryResultHKT, Schema>

export interface Database {
  db: Db
  kind: 'pglite' | 'postgres'
  /** Descripción legible para los logs (sin credenciales). */
  label: string
  close: () => Promise<void>
}

export type DatabaseOptions =
  | { url: string }
  | { dataDir: string }
  | { memory: true }

export async function createDatabase(options: DatabaseOptions): Promise<Database> {
  if ('url' in options) {
    const client = postgres(options.url, { max: 10, onnotice: () => {} })
    const db = drizzlePostgres(client, { schema }) as unknown as Db
    return { db, kind: 'postgres', label: describeUrl(options.url), close: () => client.end({ timeout: 5 }) }
  }
  if ('dataDir' in options) {
    const safe = await openSafePglite(options.dataDir)
    const db = drizzlePglite(safe.client, { schema }) as unknown as Db
    const note = safe.restored === 'snapshot' ? ' (restaurada desde la copia de seguridad)' : safe.restored === 'fresh' ? ' (nueva)' : ''
    return { db, kind: 'pglite', label: `PGlite en ${options.dataDir}${note}`, close: safe.close }
  }
  const client = await PGlite.create()
  const db = drizzlePglite(client, { schema }) as unknown as Db
  return { db, kind: 'pglite', label: 'PGlite en memoria', close: () => client.close() }
}

function describeUrl(url: string): string {
  try {
    const u = new URL(url)
    return `Postgres en ${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`
  } catch {
    return 'Postgres'
  }
}

/** Filas de un db.execute() crudo: PGlite devuelve { rows }, postgres-js un arreglo. */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  const rows = (result as { rows?: unknown }).rows
  return Array.isArray(rows) ? (rows as T[]) : []
}
