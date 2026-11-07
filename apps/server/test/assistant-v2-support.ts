/**
 * Apoyo para las pruebas del asistente v2: IA simulada (createMockAi) instalada como proveedor
 * vía entorno + fetch global (la ruta lee la configuración en cada pedido), lectura de flujos SSE y
 * atajos para turnos, aprobaciones y datos de prueba.
 */
import { vi } from 'vitest'
import { ASSISTANT_V2_PATHS, TurnEventStreamParser, type AssistantMode, type TurnEvent, type TurnRequest } from '@dekopen/shared'
import { createMockAi, type MockAi, type MockTurn } from '../src/services/ai/mock'
import type { Agent } from './helpers'

export const P = ASSISTANT_V2_PATHS

/** Instala MiMo simulado: clave por entorno y fetch global con el guion. */
export function withMockAi(turns: MockTurn[] = []): MockAi {
  const mock = createMockAi(turns)
  vi.stubEnv('AI_API_KEY', 'sk-prueba-asistente-v2-000000')
  vi.stubEnv('MIMO_API_KEY', '')
  vi.stubEnv('AI_BASE_URL', 'https://proveedor.mock/v1')
  vi.stubEnv('AI_MODEL', 'modelo-simulado')
  vi.stubEnv('AI_THINKING', 'enabled')
  vi.stubGlobal('fetch', mock.fetch)
  return mock
}

/** Sin clave de IA (modo local). */
export function withoutAi() {
  vi.stubEnv('AI_API_KEY', '')
  vi.stubEnv('MIMO_API_KEY', '')
}

export function parseSse(text: string): TurnEvent[] {
  const parser = new TurnEventStreamParser()
  return [...parser.push(text), ...parser.end()]
}

export interface StreamResult {
  status: number
  events: TurnEvent[]
  body: any
  headers: Headers
}

async function stream(agent: Agent, path: string, body: unknown): Promise<StreamResult> {
  const res = await agent.post(path, body)
  const text = typeof res.body === 'string' ? res.body : ''
  return { status: res.status, events: res.status === 200 ? parseSse(text) : [], body: res.body, headers: res.headers }
}

export function turnBody(text: string, extra: Partial<TurnRequest> & { mode?: AssistantMode } = {}): TurnRequest {
  return { text, mode: extra.mode ?? 'supervised', ui: extra.ui ?? { route: '/inicio', locale: 'es' }, ...extra }
}

export const sendTurn = (agent: Agent, text: string, extra: Partial<TurnRequest> = {}) => stream(agent, P.turns, turnBody(text, extra))
export const approve = (agent: Agent, id: string, argsHash: string) => stream(agent, P.toolRunApprove(id), { argsHash })
export const reject = (agent: Agent, id: string, reason?: string) => stream(agent, P.toolRunReject(id), reason ? { reason } : {})

export function ofType<T extends TurnEvent['type']>(events: TurnEvent[], type: T): Extract<TurnEvent, { type: T }>[] {
  return events.filter((e): e is Extract<TurnEvent, { type: T }> => e.type === type)
}

export function lastDone(events: TurnEvent[]) {
  return ofType(events, 'done').at(-1)
}

/** Cotización con una ventana fija simple (por la API, como en la web). */
export async function createQuote(agent: Agent, extra: Record<string, unknown> = {}) {
  const res = await agent.post('/api/quotes', { title: 'Casa Lagos', ...extra })
  if (res.status !== 201) throw new Error(`no se pudo crear la cotización: ${res.status} ${JSON.stringify(res.body)}`)
  return res.body as { id: string; number: number; version: number; title: string }
}

/** Mensajes enviados al proveedor en el pedido n (0 = primero). */
export function sentMessages(mock: MockAi, n: number): any[] {
  return mock.requests[n]?.body.messages ?? []
}

/** Contexto del turno que el servidor antepuso al último mensaje de la persona. */
export function sentContext(mock: MockAi, n: number): string {
  const users = sentMessages(mock, n).filter((m) => m.role === 'user')
  return String(users.at(-1)?.content ?? '')
}

export function sentToolNames(mock: MockAi, n: number): string[] {
  return (mock.requests[n]?.body.tools ?? []).map((t: any) => t.function.name)
}
