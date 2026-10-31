/**
 * POST /api/assistant/chat — Marco (AssistantRequest → AssistantResponse, contrato extendido en
 * @framezen/shared/assistant) y GET /api/assistant/status (modo y saldo). Exige sesión (se monta con `authed` en app.ts).
 */
import { Hono } from 'hono'
import { z } from 'zod'
import type { AssistantChatRequest } from '@framezen/shared'
import type { AppDeps, AppEnv } from '../context'
import { HttpError } from '../lib/errors'
import { readBody } from '../lib/http'
import { RateLimiter } from '../lib/rate-limit'
import { assistantStatus, runAssistant } from '../services/ai/assistant'
import { aiConfigFromEnv, type AiConfig } from '../services/ai/config'

const toolCallSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(64),
  arguments: z.string().max(20_000).default('{}'),
})

const messageSchema = z.object({
  role: z.enum(['user', 'assistant', 'tool']),
  content: z.string().max(16_000).default(''),
  toolCalls: z.array(toolCallSchema).max(24).optional(),
  toolCallId: z.string().max(200).optional(),
})

const chatSchema = z.object({
  messages: z.array(messageSchema).min(1, 'Escribe un mensaje para Marco.').max(120),
  context: z
    .object({
      route: z.string().max(300).default('/'),
      quoteId: z.string().max(64).optional(),
      itemId: z.string().max(64).optional(),
      summary: z.string().max(8000).optional(),
      selectedRef: z.string().max(20).optional(),
      refs: z.array(z.string().max(20)).max(500).optional(),
      prefer: z.enum(['auto', 'local']).optional(),
    })
    .default({ route: '/' }),
})

export interface AssistantRouteOptions {
  /** Configuración de IA por pedido (por defecto, variables de entorno AI_*). */
  ai?: () => AiConfig | null
  /** fetch para la API de IA (las pruebas lo simulan). */
  fetch?: typeof fetch
}

export function assistantRoutes(deps: AppDeps, options: AssistantRouteOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>()
  // Un mensaje puede encadenar varias vueltas de herramientas: límite holgado por persona.
  const limiter = new RateLimiter(90, 60_000, () => deps.now().getTime())

  const aiConfig = () => (options.ai ?? (() => aiConfigFromEnv(process.env)))()

  app.get('/status', async (c) => c.json(await assistantStatus(deps, c.get('auth'), aiConfig())))

  app.post('/chat', async (c) => {
    const auth = c.get('auth')
    const wait = limiter.hit(`${auth.org.id}:${auth.user.id}`)
    if (wait > 0) throw new HttpError(429, 'too_many_requests', `Vamos muy rápido. Espera ${wait} s y sigo contigo.`)
    const body = (await readBody(c, chatSchema)) as AssistantChatRequest
    const response = await runAssistant(deps, auth, body, {
      ai: aiConfig(),
      fetch: options.fetch,
      signal: c.req.raw.signal,
    })
    return c.json(response)
  })

  return app
}
