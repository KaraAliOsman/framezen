import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export interface AppConfig {
  /** URL pública de la app (enlaces de correo, portal del cliente). */
  appUrl: string
  production: boolean
  /** Cookies Secure (https). */
  secureCookies: boolean
  /** Carpeta de apps/web/dist para servir estáticos con fallback SPA (sólo producción). */
  webDist: string | null
  resendApiKey?: string
  mailFrom: string
  /** 'flow' si hay claves de Flow configuradas; 'dev' activa planes al instante. */
  billingProvider: 'flow' | 'dev'
  /** Claves de Flow.cl (FLOW_API_KEY, FLOW_SECRET_KEY) y su API (FLOW_API_URL; sandbox: https://sandbox.flow.cl/api). */
  flowApiKey?: string
  flowSecretKey?: string
  flowApiUrl?: string
  logRequests: boolean
  /**
   * Proxies de confianza delante del servidor que agregan su IP de origen al final de
   * X-Forwarded-For (TRUST_PROXY_HOPS). 0 = se usa la IP del socket y la cabecera se ignora.
   * Por defecto 1 en producción (Railway/Render/Fly) y 0 en desarrollo.
   */
  trustProxyHops: number
  /**
   * Cuentas nuevas por IP y hora (crear cuenta o aceptar una invitación sin sesión). Estricto en
   * producción; holgado en desarrollo, donde todo llega desde localhost (SIGNUP_LIMIT_PER_HOUR).
   */
  signupPerHour: number
}

/** Raíz del monorepo: la primera carpeta hacia arriba cuyo package.json declara workspaces. */
export function findRepoRoot(start = process.cwd()): string {
  let dir = resolve(start)
  for (;;) {
    const pkg = join(dir, 'package.json')
    if (existsSync(pkg)) {
      try {
        if (JSON.parse(readFileSync(pkg, 'utf8')).workspaces) return dir
      } catch {
        // package.json ilegible: seguimos subiendo
      }
    }
    const parent = dirname(dir)
    if (parent === dir) return resolve(start)
    dir = parent
  }
}

/** ¿Corre el bundle compilado (apps/server/dist/index.js, es decir `npm start`) y no tsx sobre src? */
export function runningFromBundle(moduleUrl: string = import.meta.url): boolean {
  return /[\\/]dist[\\/][^\\/]+\.js$/.test(moduleUrl)
}

/**
 * Producción = NODE_ENV=production, o el bundle compilado sin NODE_ENV (así `npm run build &&
 * npm start` sirve la web compilada sin configurar nada). Con NODE_ENV=development/test, no.
 */
export function isProduction(env: NodeJS.ProcessEnv, bundled = runningFromBundle()): boolean {
  return env.NODE_ENV === 'production' || (!env.NODE_ENV && bundled)
}

const flag = (value: string | undefined) => value === '1' || value === 'true'

/** Proxies de confianza (TRUST_PROXY_HOPS): entero ≥ 0; por defecto 1 en producción y 0 en desarrollo. */
export function trustProxyHopsFrom(env: NodeJS.ProcessEnv, production: boolean): number {
  const raw = env.TRUST_PROXY_HOPS?.trim()
  if (raw && /^\d{1,2}$/.test(raw)) return Number(raw)
  return production ? 1 : 0
}

/**
 * En producción, lo que falte no puede degradar en silencio a un modo inseguro (cobro 'dev' que
 * regala planes, cookie sin Secure, enlaces secretos en el log). Cada excepción exige un permiso
 * explícito: ALLOW_DEV_BILLING=1, ALLOW_HTTP_APP_URL=1 o MAIL_TO_CONSOLE=1 (demos locales).
 */
export function productionProblems(env: NodeJS.ProcessEnv): string[] {
  const problems: string[] = []
  const appUrl = env.APP_URL?.trim()
  if (!appUrl && !flag(env.ALLOW_HTTP_APP_URL)) problems.push('falta APP_URL (la URL pública https de la app)')
  else if (appUrl && !appUrl.startsWith('https://') && !flag(env.ALLOW_HTTP_APP_URL))
    problems.push(`APP_URL debe ser https (es ${appUrl}); para una demo local usa ALLOW_HTTP_APP_URL=1`)
  if (!(env.FLOW_API_KEY && env.FLOW_SECRET_KEY) && !flag(env.ALLOW_DEV_BILLING))
    problems.push('faltan FLOW_API_KEY y FLOW_SECRET_KEY (sin ellas cualquiera activaría un plan gratis); para una demo usa ALLOW_DEV_BILLING=1')
  if (!env.RESEND_API_KEY && !flag(env.MAIL_TO_CONSOLE))
    problems.push('falta RESEND_API_KEY (los correos no saldrían); para una demo sin correo usa MAIL_TO_CONSOLE=1')
  return problems
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, root = findRepoRoot(), bundled = runningFromBundle()): AppConfig {
  const production = isProduction(env, bundled)
  if (production) {
    const problems = productionProblems(env)
    if (problems.length) throw new Error(`Configuración de producción incompleta:\n- ${problems.join('\n- ')}`)
  }
  const appUrl = (env.APP_URL || (production ? `http://localhost:${env.PORT ?? 8787}` : 'http://localhost:5180')).replace(/\/+$/, '')
  const webDist = env.WEB_DIST ? resolve(env.WEB_DIST) : join(root, 'apps/web/dist')
  return {
    trustProxyHops: trustProxyHopsFrom(env, production),
    signupPerHour: /^\d{1,5}$/.test(env.SIGNUP_LIMIT_PER_HOUR ?? '') ? Number(env.SIGNUP_LIMIT_PER_HOUR) : production ? 10 : 200,
    appUrl,
    production,
    secureCookies: appUrl.startsWith('https://'),
    // La web compilada se sirve en producción (o si se indica WEB_DIST explícitamente).
    webDist: (production || Boolean(env.WEB_DIST)) && existsSync(join(webDist, 'index.html')) ? webDist : null,
    resendApiKey: env.RESEND_API_KEY || undefined,
    mailFrom: env.MAIL_FROM || 'Framezen <hola@framezen.cl>',
    billingProvider: env.FLOW_API_KEY && env.FLOW_SECRET_KEY ? 'flow' : 'dev',
    flowApiKey: env.FLOW_API_KEY || undefined,
    flowSecretKey: env.FLOW_SECRET_KEY || undefined,
    flowApiUrl: env.FLOW_API_URL || undefined,
    logRequests: env.NODE_ENV !== 'test',
  }
}

/** Configuración para pruebas y para createApp sin argumentos explícitos. */
export function defaultConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    appUrl: 'http://localhost:5180',
    production: false,
    secureCookies: false,
    webDist: null,
    mailFrom: 'Framezen <hola@framezen.cl>',
    billingProvider: 'dev',
    logRequests: false,
    trustProxyHops: 0,
    signupPerHour: 200,
    ...overrides,
  }
}
