/**
 * Arranque reutilizable: base de datos → migraciones → catálogo base → app. Lo usan
 * index.ts (servidor real) y las pruebas (PGlite en memoria).
 */
import { join } from 'node:path'
import { SAMPLE_CATALOG } from '@dekopen/catalog'
import type { Catalog } from '@dekopen/engine'
import type { Hono } from 'hono'
import { buildDeps, createApp, type CreateAppOptions } from './app'
import { findRepoRoot, type AppConfig } from './config'
import type { AppDeps, AppEnv } from './context'
import { createDatabase, type Database, type DatabaseOptions } from './db/client'
import { runMigrations } from './db/migrate'
import type { Logger } from './lib/logger'
import { latestBaseId, seedCatalogBase } from './services/catalog'
import { repriceAllDrafts } from './services/quotes'

export interface BootstrapOptions {
  database: DatabaseOptions
  config?: Partial<AppConfig>
  logger?: Logger
  mailer?: CreateAppOptions['mailer']
  now?: () => Date
  /** Ruta de base.json (si existe y catalog_base está vacío, se siembra desde ahí). */
  catalogSource?: string
  /** Catálogo explícito para sembrar (pruebas). */
  catalog?: Catalog
}

export interface Bootstrapped {
  app: Hono<AppEnv>
  deps: AppDeps
  database: Database
  migrations: string[]
}

/** Opciones de base de datos según el entorno: Postgres con DATABASE_URL; si no, PGlite en .data/pg. */
export function databaseFromEnv(env: NodeJS.ProcessEnv = process.env, root = findRepoRoot()): DatabaseOptions {
  if (env.DATABASE_URL) return { url: env.DATABASE_URL }
  return { dataDir: env.PGLITE_DIR || join(root, '.data/pg') }
}

export function catalogSourceFromEnv(env: NodeJS.ProcessEnv = process.env, root = findRepoRoot()): string {
  return env.CATALOG_SOURCE_JSON || join(root, '.data/catalog/base.json')
}

export async function bootstrap(options: BootstrapOptions): Promise<Bootstrapped> {
  const database = await createDatabase(options.database)
  try {
    const migrations = await runMigrations(database.db)
    const deps = buildDeps({ db: database.db, config: options.config, logger: options.logger, mailer: options.mailer, now: options.now })
    const source = { sourcePath: options.catalogSource, fallback: () => SAMPLE_CATALOG, logger: deps.logger }
    // Una versión nueva del catálogo base (al arrancar o con el servidor andando) cambia los precios
    // de los borradores: se recalculan en segundo plano, igual que tras cambiar precios propios.
    deps.catalogs.onBaseChange(() => void repriceAllDrafts(deps))
    const before = await latestBaseId(database.db)
    const seeded = await seedCatalogBase(database.db, { ...source, catalog: options.catalog })
    if (before && seeded.id !== before) deps.catalogs.baseChanged()
    else deps.catalogs.invalidate()
    // Si base.json cambia con el servidor andando, se re-siembra solo (los ajustes de cada taller no se tocan).
    if (options.catalogSource && !options.catalog) deps.catalogs.watchSource(source)
    return { app: createApp(deps), deps, database, migrations }
  } catch (error) {
    await database.close().catch(() => {})
    throw error
  }
}
