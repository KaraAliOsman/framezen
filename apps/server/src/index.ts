import { envFile } from './env-bootstrap'
import { createServer } from 'node:net'
import { serve } from '@hono/node-server'
import { bootstrap, catalogSourceFromEnv, databaseFromEnv } from './bootstrap'
import { findRepoRoot, loadConfig, type AppConfig } from './config'
import { createLogger } from './lib/logger'
import { AI_ISSUE_LOG, aiEnvIssue } from './services/ai/config'

const root = findRepoRoot()
const logger = createLogger(true)
let config: AppConfig
try {
  config = loadConfig(process.env, root)
} catch (error) {
  // En producción, una configuración que dejaría el servidor inseguro detiene el arranque.
  logger.error(error instanceof Error ? error.message : 'Configuración inválida')
  process.exit(1)
}
const port = Number(process.env.PORT ?? 8787)

/** Comprueba el puerto ANTES de abrir la base: un segundo proceso no debe tocar los datos. */
function portIsFree(p: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.once('error', () => resolve(false))
    probe.once('listening', () => probe.close(() => resolve(true)))
    probe.listen(p)
  })
}

if (!(await portIsFree(port))) {
  logger.error(`El puerto ${port} ya está en uso: probablemente DEKOPEN ya está corriendo. Ciérralo o usa otro PORT.`)
  process.exit(1)
}

try {
  const { app, database, migrations } = await bootstrap({
    database: databaseFromEnv(process.env, root),
    catalogSource: catalogSourceFromEnv(process.env, root),
    config,
    logger,
  })
  if (envFile.loaded) logger.info('Variables: se cargó .env de la raíz (las del entorno tienen prioridad)')
  else if (envFile.reason === 'unreadable') logger.warn('No se pudo leer .env de la raíz: sigo solo con las variables del entorno')
  logger.info(`Base de datos: ${database.label}${migrations.length ? ` · migraciones aplicadas: ${migrations.join(', ')}` : ''}`)
  if (config.webDist) logger.info(`Sirviendo la web desde ${config.webDist}`)
  if (!config.resendApiKey)
    logger.info(
      config.production
        ? 'Correo: sin RESEND_API_KEY (MAIL_TO_CONSOLE=1): los correos no salen y su contenido no se escribe en el log'
        : 'Correo: sin RESEND_API_KEY, los enlaces se muestran aquí en la consola',
    )
  logger.info(`Cobros: proveedor ${config.billingProvider === 'flow' ? 'Flow.cl' : 'dev (activa planes al instante)'}`)

  const aiIssue = aiEnvIssue(process.env)
  logger.info(aiIssue ? `IA: ${AI_ISSUE_LOG[aiIssue]}` : 'IA: clave configurada. Comprueba la conexión con `npm run ai:check`')

  const server = serve({ fetch: app.fetch, port }, () => logger.info(`DEKOPEN API lista en http://localhost:${port}`))

  let closing = false
  const shutdown = (signal: string) => {
    if (closing) return
    closing = true
    logger.info(`Cerrando (${signal})…`)
    server.close(() => {
      database
        .close()
        .catch(() => {})
        .finally(() => process.exit(0))
    })
    setTimeout(() => process.exit(0), 5000).unref()
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
} catch (error) {
  logger.error('No se pudo arrancar el servidor', error)
  process.exit(1)
}
