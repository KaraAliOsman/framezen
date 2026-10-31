/**
 * Configuración de la IA de Marco (API compatible con OpenAI). Se lee del entorno en cada pedido,
 * así cambiar la clave no exige reiniciar y las pruebas pueden simularla.
 *   AI_API_KEY   clave del proveedor
 *   AI_BASE_URL  p. ej. https://api.openai.com/v1 (cualquier API compatible con /chat/completions)
 *   AI_MODEL     p. ej. gpt-4.1-mini
 *   AI_TIMEOUT_MS (opcional) tiempo máximo por respuesta, por defecto 25 s
 */
export interface AiConfig {
  apiKey: string
  baseUrl: string
  model: string
  timeoutMs: number
}

export const DEFAULT_AI_TIMEOUT_MS = 25_000

/** null si falta cualquiera de las tres variables: Marco trabaja en modo local. */
export function aiConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AiConfig | null {
  const apiKey = env.AI_API_KEY?.trim()
  const baseUrl = env.AI_BASE_URL?.trim()
  const model = env.AI_MODEL?.trim()
  if (!apiKey || !baseUrl || !model) return null
  const timeout = Number(env.AI_TIMEOUT_MS)
  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    model,
    timeoutMs: Number.isFinite(timeout) && timeout >= 2000 ? Math.min(timeout, 120_000) : DEFAULT_AI_TIMEOUT_MS,
  }
}
