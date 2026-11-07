import type { Catalog, WindowDesign } from '@dekopen/engine'
import type { Me } from '@dekopen/shared'
import { bootstrap, type Bootstrapped } from '../src/bootstrap'
import { silentLogger } from '../src/lib/logger'
import type { AppConfig } from '../src/config'
import type { MailMessage } from '../src/lib/mail'

export interface TestServer extends Bootstrapped {
  mails: MailMessage[]
  agent: () => Agent
  close: () => Promise<void>
}

/** Servidor completo con PGlite en memoria, correo capturado y logs en silencio. */
export async function startServer(options: { catalog?: Catalog; now?: () => Date; config?: Partial<AppConfig> } = {}): Promise<TestServer> {
  const mails: MailMessage[] = []
  const boot = await bootstrap({
    database: { memory: true },
    logger: silentLogger,
    mailer: { send: async (m) => void mails.push(m) },
    catalog: options.catalog,
    now: options.now,
    // Como en producción: un proxy de confianza agrega la IP real al final de X-Forwarded-For.
    config: { appUrl: 'http://app.test', trustProxyHops: 1, ...options.config },
  })
  return { ...boot, mails, agent: () => new Agent(boot.app), close: () => boot.database.close() }
}

export interface Res<T = any> {
  status: number
  body: T
  headers: Headers
}

let agents = 0

/**
 * Cliente HTTP con cookie de sesión propia (como un navegador). Cada agente es una persona
 * distinta: su propia IP (la que agregaría el proxy de confianza al final de X-Forwarded-For).
 */
export class Agent {
  cookie: string | undefined
  readonly ip: string
  constructor(private readonly app: Bootstrapped['app']) {
    agents++
    this.ip = `10.${(agents >> 16) & 255}.${(agents >> 8) & 255}.${agents & 255}`
  }

  async request<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<Res<T>> {
    const init: RequestInit = { method, headers: { 'x-forwarded-for': this.ip, ...headers } }
    if (body !== undefined) {
      if (typeof body === 'string') init.body = body
      else {
        init.body = JSON.stringify(body)
        ;(init.headers as Record<string, string>)['content-type'] = 'application/json'
      }
    }
    if (this.cookie) (init.headers as Record<string, string>).cookie = `fz_session=${this.cookie}`
    const res = await this.app.request(path, init)
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) {
      const match = setCookie.match(/fz_session=([^;]*)/)
      if (match) this.cookie = match[1] && !/Max-Age=0/i.test(setCookie) ? match[1] : undefined
    }
    const text = await res.text()
    let parsed: unknown = text
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      // respuesta no JSON
    }
    return { status: res.status, body: parsed as T, headers: res.headers }
  }

  get<T = any>(path: string) {
    return this.request<T>('GET', path)
  }
  post<T = any>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>('POST', path, body ?? {}, headers)
  }
  put<T = any>(path: string, body: unknown) {
    return this.request<T>('PUT', path, body)
  }
  patch<T = any>(path: string, body: unknown) {
    return this.request<T>('PATCH', path, body)
  }
  delete<T = any>(path: string) {
    return this.request<T>('DELETE', path)
  }
}

let counter = 0
/** Crea una cuenta nueva (organización propia) y deja la sesión abierta en el agente. */
export async function signup(server: TestServer, overrides: Partial<{ name: string; email: string; password: string; company: string }> = {}) {
  const agent = server.agent()
  counter++
  const data = {
    name: overrides.name ?? `Ana Pérez ${counter}`,
    email: overrides.email ?? `ana${counter}.${Date.now()}@taller.cl`,
    password: overrides.password ?? 'clave-segura-123',
    company: overrides.company ?? `Ventanas del Sur ${counter}`,
  }
  const res = await agent.post<Me>('/api/auth/signup', data)
  if (res.status !== 201) throw new Error(`signup falló: ${res.status} ${JSON.stringify(res.body)}`)
  return { agent, me: res.body, credentials: data }
}

/** Ventana fija simple con la línea/color/vidrio por defecto de la organización. */
export async function sampleDesign(agent: Agent, size = { width: 1200, height: 1000 }): Promise<WindowDesign> {
  const settings = (await agent.get('/api/settings')).body
  const catalog = (await agent.get('/api/catalog')).body as Catalog
  const line = catalog.lines.find((l) => l.id === settings.defaults.lineId) ?? catalog.lines[0]
  const colorId = settings.defaults.colorId ?? line?.colorIds[0] ?? catalog.colors[0]?.id ?? 'blanco'
  const glassId = settings.defaults.glassId ?? catalog.glass[0]?.id ?? 'vidrio'
  return {
    version: 1,
    lineId: line?.id ?? 'linea',
    width: size.width,
    height: size.height,
    colorId,
    glassId,
    root: { id: 'root', type: 'leaf', opening: { kind: 'fixed' } },
  }
}

export function item(design: WindowDesign, extra: Record<string, unknown> = {}) {
  return { ref: '', qty: 1, design, ...extra }
}
