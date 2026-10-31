/**
 * Endurecimiento de acceso y robustez de la API: IP de confianza y límites (login por cuenta,
 * crear cuenta), CSRF, recuperar contraseña, logs sin tokens, entradas raras (byte nulo, offset
 * enorme), correo con tiempo máximo y migraciones con el candado antes de crear su tabla.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { Hono } from 'hono'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { SQL } from 'drizzle-orm'
import { bootstrap } from '../src/bootstrap'
import type { Db } from '../src/db/client'
import { runMigrations } from '../src/db/migrate'
import { createMailer } from '../src/lib/mail'
import { redactPath } from '../src/lib/redact'
import { clientIp } from '../src/services/session'
import { Agent, signup, startServer, type TestServer } from './helpers'

let server: TestServer

beforeAll(async () => {
  server = await startServer()
})
afterAll(async () => {
  await server?.close()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

/** Resuelve con 'colgado' si la promesa no termina en `ms`. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | 'colgado'> {
  return Promise.race([promise, new Promise<'colgado'>((resolve) => setTimeout(() => resolve('colgado'), ms))])
}

describe('IP de confianza y límite de intentos de entrada', () => {
  it('clientIp nunca usa el primer valor de X-Forwarded-For (lo escribe el cliente)', async () => {
    const app = new Hono()
    app.get('/ip/:hops', (c) => c.text(clientIp(c, Number(c.req.param('hops')))))
    const ask = async (hops: number, xff?: string) => (await app.request(`/ip/${hops}`, { headers: xff ? { 'x-forwarded-for': xff } : {} })).text()
    // Railway agrega la IP real al final: "lo que mandó el atacante, IP real".
    expect(await ask(1, '6.6.6.6, 203.0.113.7')).toBe('203.0.113.7')
    expect(await ask(2, '6.6.6.6, 203.0.113.7, 10.0.0.2')).toBe('203.0.113.7')
    // Sin proxies de confianza la cabecera se ignora (se usa el socket).
    expect(await ask(0, '6.6.6.6')).not.toBe('6.6.6.6')
    // Menos valores que proxies: tampoco se cree la cabecera.
    expect(await ask(2, '6.6.6.6')).not.toBe('6.6.6.6')
  })

  it('cambiar el primer valor de X-Forwarded-For no da intentos nuevos', async () => {
    const { credentials } = await signup(server)
    const attacker = server.agent()
    const statuses: number[] = []
    for (let i = 1; i <= 12; i++) {
      const res = await attacker.post('/api/auth/login', { email: credentials.email, password: `mala-${i}-0000` }, { 'x-forwarded-for': `10.9.${i}.1, 203.0.113.50` })
      statuses.push(res.status)
    }
    expect(statuses.slice(0, 8).every((s) => s === 401)).toBe(true)
    expect(statuses).toContain(429)
  })

  it('aunque cambie de IP real en cada intento, la cuenta se bloquea con espera creciente', async () => {
    const { credentials } = await signup(server)
    const statuses: number[] = []
    for (let i = 1; i <= 30; i++) {
      // Cada intento desde otra IP (botnet o proxy rotativo): el límite por correo+IP no alcanza.
      const res = await server.agent().post('/api/auth/login', { email: credentials.email, password: `mala-${i}-0000` })
      statuses.push(res.status)
    }
    const firstBlock = statuses.indexOf(429)
    expect(firstBlock).toBeGreaterThan(0)
    expect(firstBlock).toBeLessThanOrEqual(11)
    expect(statuses.filter((s) => s === 401).length).toBeLessThanOrEqual(11)
    // Bloqueada: ni la contraseña correcta entra hasta que pase la espera (o se restablezca).
    expect((await server.agent().post('/api/auth/login', credentials)).status).toBe(429)
  })

  it('crear cuenta tiene límite por IP (antes: altas sin fin para spam y enumeración)', async () => {
    const strict = await startServer({ config: { signupPerHour: 3 } })
    try {
      const sameIp = { 'x-forwarded-for': '198.51.100.9' }
      const statuses: number[] = []
      for (let i = 0; i < 5; i++) {
        const res = await strict
          .agent()
          .post('/api/auth/signup', { name: 'Spam', email: `spam${i}.${Date.now()}@example.com`, password: 'clave-segura-123', company: 'Banco Seguro' }, sameIp)
        statuses.push(res.status)
      }
      expect(statuses.slice(0, 3)).toEqual([201, 201, 201])
      expect(statuses.slice(3)).toEqual([429, 429])
      // Ni siquiera responde si el correo existe (no sirve para enumerar).
      const taken = await strict.agent().post('/api/auth/signup', { name: 'X', email: 'nadie@example.com', password: 'clave-segura-123', company: 'X' }, sameIp)
      expect(taken.status).toBe(429)
    } finally {
      await strict.close()
    }
  })
})

describe('CSRF: las escrituras deben venir de la propia app', () => {
  it('login con un formulario text/plain de otro sitio no entra (login CSRF)', async () => {
    const { credentials } = await signup(server)
    const victim = server.agent()
    const formBody = `{"email":"${credentials.email}","password":"${credentials.password}","pad":"=}"}`
    const plain = await victim.post('/api/auth/login', formBody, { 'content-type': 'text/plain', origin: 'https://evil.example' })
    expect(plain.status).toBe(403)
    expect(victim.cookie).toBeUndefined()
    // Aunque el sitio malicioso no mande Origin, text/plain ya no se acepta como JSON.
    const noOrigin = await victim.post('/api/auth/login', `{"email":"${credentials.email}","password":"${credentials.password}"}`, { 'content-type': 'text/plain' })
    expect(noOrigin.status).toBe(415)
    expect(victim.cookie).toBeUndefined()
  })

  it('rechaza Sec-Fetch-Site cross-site/same-site y Origin ajeno; acepta la propia app', async () => {
    const { agent } = await signup(server)
    expect((await agent.post('/api/clients', { name: 'Desde otro sitio' }, { 'sec-fetch-site': 'same-site' })).status).toBe(403)
    expect((await agent.post('/api/clients', { name: 'Desde otro sitio' }, { 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await agent.post('/api/clients', { name: 'Desde otro sitio' }, { origin: 'https://blog.app.test' })).status).toBe(403)
    expect((await agent.post('/api/clients', { name: 'Desde la app' }, { 'sec-fetch-site': 'same-origin', origin: 'http://app.test' })).status).toBe(201)
    expect((await agent.post('/api/clients', { name: 'Origin de la app' }, { origin: 'http://app.test' })).status).toBe(201)
    // Flow llama desde su dominio: el retorno y la confirmación no se bloquean por CSRF.
    const flow = await server.agent().request('POST', '/api/billing/flow/return', 'token=x', { 'content-type': 'application/x-www-form-urlencoded', 'sec-fetch-site': 'cross-site' })
    expect(flow.status).toBe(303)
  })
})

describe('recuperar contraseña', () => {
  it('responde sin esperar al proveedor de correo (el tiempo no delata qué correos tienen cuenta)', async () => {
    const { credentials } = await signup(server)
    const original = server.deps.mailer.send
    server.deps.mailer.send = () => new Promise(() => {}) // proveedor colgado
    try {
      const res = await within(server.agent().post('/api/auth/forgot', { email: credentials.email }), 2000)
      expect(res).not.toBe('colgado')
      expect((res as { status: number }).status).toBe(200)
    } finally {
      server.deps.mailer.send = original
    }
  })

  it('al restablecer, los demás enlaces pendientes dejan de servir y el canje es atómico', async () => {
    const { credentials } = await signup(server)
    const tokenOf = async () => {
      const before = server.mails.length
      await server.agent().post('/api/auth/forgot', { email: credentials.email })
      await vi.waitFor(() => expect(server.mails.length).toBeGreaterThan(before))
      const mail = server.mails.slice(before).find((m) => m.to === credentials.email)!
      return decodeURIComponent(mail.text.match(/\/restablecer\/(\S+)/)![1])
    }
    const t1 = await tokenOf()
    const t2 = await tokenOf()
    expect((await server.agent().post('/api/auth/reset', { token: t2, password: 'clave-del-dueno-1' })).status).toBe(200)
    // Un enlace anterior (buzón compartido, correo reenviado) ya no cambia la contraseña.
    const old = await server.agent().post('/api/auth/reset', { token: t1, password: 'clave-del-intruso' })
    expect(old.status).toBe(400)
    expect((await server.agent().post('/api/auth/login', { email: credentials.email, password: 'clave-del-dueno-1' })).status).toBe(200)

    // Dos envíos simultáneos con el mismo enlace: solo uno gana.
    const t3 = await tokenOf()
    const [a, b] = await Promise.all([
      server.agent().post('/api/auth/reset', { token: t3, password: 'clave-carrera-a' }),
      server.agent().post('/api/auth/reset', { token: t3, password: 'clave-carrera-b' }),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 400])
  })
})

describe('logs sin llaves secretas', () => {
  it('el log de cada request enmascara los tokens de invitación y del portal', async () => {
    const lines: string[] = []
    const capture = { info: (m: string) => void lines.push(m), warn: (m: string) => void lines.push(m), error: (m: string) => void lines.push(m) }
    const boot = await bootstrap({ database: { memory: true }, logger: capture, mailer: { send: async () => {} }, config: { appUrl: 'http://app.test', logRequests: true } })
    try {
      const agent = new Agent(boot.app)
      await agent.get('/api/invitations/SECRET-INVITE-TOKEN-abc123')
      await agent.post('/api/invitations/SECRET-INVITE-TOKEN-abc123/accept', { name: 'x', email: 'x@example.com', password: 'clave-segura-123' })
      await agent.get('/api/public/quotes/SHARE-TOKEN-xyz789')
      await agent.get('/api/public/quotes/SHARE-TOKEN-xyz789/pdf')
      const log = lines.join('\n')
      expect(log).toContain('/api/invitations/:token')
      expect(log).toContain('/api/public/quotes/:token/pdf')
      expect(log).not.toContain('SECRET-INVITE-TOKEN')
      expect(log).not.toContain('SHARE-TOKEN')
    } finally {
      await boot.database.close()
    }
    expect(redactPath('/api/quotes/abc')).toBe('/api/quotes/abc')
  })
})

describe('entradas raras: 404/400, nunca 500', () => {
  it('byte nulo en ids o consulta y offset gigante', async () => {
    const { agent } = await signup(server)
    for (const path of ['/api/quotes/%00', '/api/clients/%00', '/api/work-orders/%00', '/api/quotes?clientId=%00']) {
      expect((await agent.get(path)).status, path).toBe(404)
    }
    expect((await server.agent().get('/api/public/quotes/%00')).status).toBe(404)
    for (const path of ['/api/quotes?offset=1e30', '/api/quotes?offset=99999999999999999999', '/api/clients?offset=1e30', '/api/work-orders?offset=1e30']) {
      const res = await agent.get(path)
      expect(res.status, path).toBe(200)
      expect(res.body.items).toEqual([])
    }
    const nul = await agent.post('/api/clients', { name: 'Ana\u0000Pérez' })
    expect(nul.status).toBe(400)
  })
})

describe('correo con tiempo máximo', () => {
  it('si Resend no responde, el envío falla a tiempo en vez de quedar colgado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            // Servidor que acepta la conexión y nunca responde: solo termina si se aborta.
            init?.signal?.addEventListener('abort', () => reject(init.signal?.reason ?? new Error('abort')))
          }),
      ),
    )
    const mailer = createMailer({ resendApiKey: 'fake', from: 'x', logger: { info() {}, warn() {}, error() {} }, timeoutMs: 50 })
    const outcome = await within(
      mailer.send({ to: 'a@example.com', subject: 's', text: 't' }).then(
        () => 'ok',
        () => 'falló a tiempo',
      ),
      2000,
    )
    expect(outcome).toBe('falló a tiempo')
  })
})

describe('migraciones', () => {
  it('toma el candado consultivo ANTES de crear la tabla de control (dos instancias a la vez)', async () => {
    const dialect = new PgDialect()
    const log: string[] = []
    const render = (query: SQL) => dialect.sqlToQuery(query).sql.replace(/\s+/g, ' ').trim()
    const tx = {
      execute: async (query: SQL) => {
        log.push(`tx: ${render(query)}`)
        return []
      },
    }
    const fake = {
      execute: async (query: SQL) => {
        log.push(`db: ${render(query)}`)
        return []
      },
      transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    }
    await runMigrations(fake as unknown as Db, [])
    expect(log[0]).toMatch(/^tx: SELECT pg_advisory_xact_lock/)
    const create = log.findIndex((l) => l.includes('CREATE TABLE IF NOT EXISTS "_fz_migrations"'))
    expect(create).toBeGreaterThan(0)
    expect(log[create]).toMatch(/^tx:/)
    expect(log.some((l) => l.startsWith('db:'))).toBe(false)
  })
})
