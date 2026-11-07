/**
 * Lo que `npm run ai:check` le dice a la persona: una línea clara por estado y qué hacer.
 * También corre la prueba completa (`--full`), lo único que valida el contrato con la API real:
 * streaming, herramientas, razonamiento reenviado, modo JSON e imagen.
 */
import type { AiProviderState } from '@dekopen/shared'
import { aiConfigFromEnv, aiEnvIssue, providerProfile, type AiConfig, type ProviderProfile } from './config'
import { AiError, assistantMessageOf, chatJson, createAiClient, describeImage, parseToolArguments, type AiClient, type ChatMessageParam, type ChatResult, type ToolDefinition } from './client'
import { probeProvider, type ProviderProbe } from './provider'

function stateText(state: AiProviderState, provider: ProviderProfile): { title: string; next?: string } {
  const { name } = provider
  const newKey = provider.keysUrl ? `Crea otra en ${provider.keysUrl}` : 'Crea otra en la consola de tu proveedor'
  const topUp = provider.balanceUrl ? `Recarga en ${provider.balanceUrl}.` : 'Recarga en la consola de tu proveedor.'
  const texts: Record<AiProviderState, { title: string; next?: string }> = {
    connected: { title: 'Conectado' },
    no_key: { title: 'Sin clave', next: 'Corre npm run ai:setup: te pide la dirección de la API, la clave y el modelo.' },
    key_rejected: { title: 'Clave rechazada', next: `${name} no aceptó la clave. ${newKey} y corre npm run ai:setup.` },
    no_balance: { title: 'Sin saldo', next: `La clave es válida, pero la cuenta no tiene saldo. ${topUp}` },
    model_unavailable: { title: 'Modelo no disponible', next: `Revisa AI_MODEL y AI_VISION_MODEL: ${name} debe ofrecer ese modelo (la lista sale en GET /models).` },
    token_plan: { title: 'Token Plan no apto', next: `Esa clave solo vale en herramientas de programación: ${name} prohíbe usarla en un backend y puede bloquearla. Crea una de pago por uso${provider.keysUrl ? ` en ${provider.keysUrl}` : ''}.` },
    no_network: { title: 'Sin red', next: `Este equipo no logra llegar a ${name}. Revisa internet, el proxy o el firewall, y también AI_BASE_URL.` },
    blocked: { title: 'Clave o región bloqueada', next: `${name} respondió 403: región no disponible o clave restringida. ${newKey}; si sigue igual, prueba desde otra región del servidor.` },
    busy: { title: 'Proveedor saturado', next: `${name} respondió con un límite o un error temporal. Espera unos minutos y vuelve a correr npm run ai:check.` },
    misconfigured: { title: 'Configuración inválida', next: 'Revisa AI_BASE_URL (una URL que termina en /v1) y AI_MODEL: con clave, las dos son obligatorias.' },
    unknown: { title: 'Sin resultado claro', next: `${name} respondió algo inesperado. Vuelve a intentar en un momento.` },
  }
  return texts[state]
}

export interface CheckOptions {
  env?: NodeJS.ProcessEnv
  fetch?: typeof fetch
}

export async function runCheck(options: CheckOptions = {}): Promise<{ probe: ProviderProbe; config: AiConfig | null }> {
  const env = options.env ?? process.env
  const issue = aiEnvIssue(env)
  const config = aiConfigFromEnv(env)
  if (issue || !config) return { config: null, probe: { state: issue ?? 'no_key', deep: false, checkedAt: Date.now() } }
  return { config, probe: await probeProvider(config, { deep: true, retries: 1, ...(options.fetch ? { fetch: options.fetch } : {}) }) }
}

export function describeProbe(probe: ProviderProbe, baseUrl = process.env.AI_BASE_URL ?? ''): string {
  const text = stateText(probe.state, providerProfile(baseUrl))
  if (probe.state === 'connected') return `${text.title}: ${probe.model ?? 'modelo sin nombre'}, ${probe.latencyMs ?? '?'} ms.`
  return [`${text.title}.`, text.next, probe.detail ? `Detalle: ${probe.detail}.` : ''].filter(Boolean).join(' ')
}

// ── Prueba completa con el proveedor ─────────────────────────────────────────

const CLOCK_TOOL: ToolDefinition = {
  type: 'function',
  function: {
    name: 'ver_hora',
    description: 'Devuelve la hora actual en UTC.',
    parameters: { type: 'object', properties: { zona: { type: 'string', description: 'Zona horaria' } }, required: ['zona'], additionalProperties: false },
  },
}

/** PNG real de 32 × 32 (gris), mínimo que el modelo acepta como imagen. */
const SAMPLE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR4nO3NMQEAAAgDIM3+nZ3hBwXoJKfPvsMBAAAAAAAAAAAAAPwNDaweAUwVaKnVAAAAAElFTkSuQmCC'

async function toolRound(client: AiClient, thinking: 'enabled' | 'disabled'): Promise<void> {
  const messages: ChatMessageParam[] = [
    { role: 'system', content: 'Usa la herramienta ver_hora una vez y luego responde con una frase corta.' },
    { role: 'user', content: 'Llama a ver_hora con zona UTC y dime la hora.' },
  ]
  const tools = [CLOCK_TOOL]
  const first = await client.chat({ messages, tools, thinking, maxCompletionTokens: 1024, tinyOutput: true })
  const call = first.toolCalls[0]
  if (!call) throw new Error(`no llamó la herramienta (terminó con ${first.finishReason})`)
  const args = parseToolArguments(call)
  if (!args.ok) throw new Error('los argumentos no eran JSON válido')
  messages.push(assistantMessageOf(first), { role: 'tool', tool_call_id: call.id, content: JSON.stringify({ utc: new Date().toISOString() }) })
  const second = await client.chat({ messages, tools, thinking, maxCompletionTokens: 1024, tinyOutput: true })
  if (!second.content && !second.toolCalls.length) throw new Error('la segunda vuelta llegó vacía')
}

export interface SmokeStep {
  name: string
  ok: boolean
  ms: number
  detail?: string
}

/** Si el proveedor no informa el uso sigue funcionando: los créditos salen de la estimación. */
function streamNote(result: ChatResult): string {
  if (!result.usage.reported) return 'el proveedor no informa el uso: los créditos se estiman por caracteres'
  const { inputTokens, outputTokens, reasoningTokens, costUsd } = result.usage
  const reasoned = reasoningTokens ? `, ${reasoningTokens} de razonamiento aunque va apagado` : ''
  return `uso informado: ${inputTokens} de entrada, ${outputTokens} de salida${reasoned}${costUsd !== undefined ? ', con costo real' : ''}`
}

/** Ejercita lo que el contrato no garantiza por escrito. Gasta unos cientos de tokens. */
export async function runFullCheck(config: AiConfig, options: CheckOptions = {}): Promise<SmokeStep[]> {
  const client = createAiClient(config, { retries: 1, ...(options.fetch ? { fetch: options.fetch } : {}) })
  const steps: [string, () => Promise<unknown>][] = [
    ['Streaming de texto', () => client.chat({ messages: [{ role: 'user', content: 'Responde solo: ok' }], thinking: 'disabled', maxCompletionTokens: 16, tinyOutput: true }).then(streamNote)],
    ['Herramientas sin razonamiento', () => toolRound(client, 'disabled')],
    ['Herramientas con razonamiento reenviado', () => toolRound(client, 'enabled')],
    ['Modo JSON', () => chatJson(client, { messages: [{ role: 'user', content: 'Responde solo con un objeto JSON: {"ok": true}' }], thinking: 'disabled', maxCompletionTokens: 64, tinyOutput: true }).then(() => undefined)],
    ['Imagen', () => describeImage(client, { prompt: 'Responde con una palabra: ¿de qué color es esta imagen?', dataUrl: SAMPLE_PNG, maxCompletionTokens: 256 }).then(() => undefined)],
  ]
  const results: SmokeStep[] = []
  for (const [name, step] of steps) {
    const started = Date.now()
    try {
      const note = await step()
      results.push({ name, ok: true, ms: Date.now() - started, ...(typeof note === 'string' ? { detail: note } : {}) })
    } catch (error) {
      const detail = error instanceof AiError ? `${error.kind}${error.status ? ` (HTTP ${error.status})` : ''}` : error instanceof Error ? error.message : 'falló'
      results.push({ name, ok: false, ms: Date.now() - started, detail })
    }
  }
  return results
}
