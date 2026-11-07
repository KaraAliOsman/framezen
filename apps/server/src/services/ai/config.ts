/**
 * Configuración de la IA: cualquier API compatible con OpenAI. Se lee del entorno en cada pedido:
 * cambiar la clave no exige reiniciar y las pruebas pueden simularla.
 *
 *   AI_API_KEY                    clave del proveedor. Sin clave: modo local.
 *   AI_BASE_URL                   dirección de la API (debe incluir /v1). Obligatoria con clave.
 *   AI_MODEL                      modelo a usar. Obligatorio con clave.
 *   AI_VISION_MODEL               modelo para imágenes (por defecto, AI_MODEL)
 *   AI_TIMEOUT_MS                 espera máxima sin recibir datos (primer byte y entre trozos);
 *                                 2.000–300.000, por defecto 45.000
 *   AI_MAX_DURATION_MS            duración máxima de una respuesta completa; por defecto 240.000
 *   AI_MAX_COMPLETION_TOKENS      tope de salida (razonamiento + respuesta); 4.096–131.072, por defecto 8.192
 *   AI_THINKING                   'disabled' (por defecto) | 'enabled': razonamiento de las llamadas
 *                                 auxiliares (documentos, títulos). El agente razona siempre.
 *   AGENT_THINKING                'enabled' (por defecto) | 'disabled', solo para modelos sin razonamiento
 *   AI_LEARNING                   'enabled' (por defecto) | 'disabled': aprendizaje automático del agente
 *
 * Lo propio de un proveedor en particular vive solo en `providerProfile`: el resto del código no
 * sabe con quién habla.
 *
 * La clave nunca se escribe en logs ni en mensajes de error (ver `redactSecret`).
 */
export interface AiConfig {
  apiKey: string
  baseUrl: string
  model: string
  visionModel: string
  /** Primer byte y silencio máximo entre trozos del flujo (ms). */
  timeoutMs: number
  /** Duración máxima total de una llamada (ms). */
  maxDurationMs: number
  maxCompletionTokens: number
  thinking: 'enabled' | 'disabled'
  /** El agente razona antes de responder y actuar. */
  agentThinking?: boolean
  /** Repaso automático de las conversaciones para aprender. */
  learning?: boolean
}

export const DEFAULT_AI_TIMEOUT_MS = 45_000
export const DEFAULT_AI_MAX_DURATION_MS = 240_000
export const DEFAULT_MAX_COMPLETION_TOKENS = 8192
/** Nunca topes diminutos: el razonamiento también consume salida y dejaría la respuesta vacía. */
export const MIN_COMPLETION_TOKENS = 4096
export const MAX_COMPLETION_TOKENS = 131_072

const first = (...values: (string | undefined)[]) => values.map((v) => v?.trim()).find((v) => Boolean(v))

function intIn(raw: string | undefined, min: number, max: number, fallback: number): number {
  const n = Number(raw)
  if (!raw || !Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

const baseUrlOf = (env: NodeJS.ProcessEnv) => (first(env.AI_BASE_URL) ?? '').replace(/\/+$/, '')

/** Lo que cambia según el proveedor. Un compatible cualquiera no tiene nada de esto. */
export interface ProviderProfile {
  /** Nombre para los mensajes: el del proveedor o el host de la dirección. */
  name: string
  /** Ruta de saldo sin costo, si el proveedor tiene una. */
  balancePath?: string
  /** Páginas de su consola, para decirle a la persona dónde resolver. */
  keysUrl?: string
  balanceUrl?: string
  /** Rechaza las claves de suscripción para herramientas de programación (no valen en un backend). */
  rejectsCodingPlanKeys?: boolean
}

const hostOf = (baseUrl: string) => {
  try {
    return new URL(baseUrl).hostname.toLowerCase()
  } catch {
    return ''
  }
}

const isMimo = (baseUrl: string) => /(^|\.)xiaomimimo\.com$/.test(hostOf(baseUrl))

export function providerProfile(baseUrl: string): ProviderProfile {
  if (isMimo(baseUrl)) {
    return {
      name: 'MiMo',
      balancePath: '/platform/balance',
      keysUrl: 'https://platform.xiaomimimo.com/console/api-keys',
      balanceUrl: 'https://platform.xiaomimimo.com/console/balance',
      rejectsCodingPlanKeys: true,
    }
  }
  return { name: hostOf(baseUrl) || 'el proveedor' }
}

/** Clave o host de Token Plan: solo existe en MiMo; en otro proveedor un `tp-` es una clave más. */
export function isTokenPlanCredential(apiKey: string, baseUrl: string): boolean {
  if (!providerProfile(baseUrl).rejectsCodingPlanKeys) return false
  return /^t?tp-/i.test(apiKey.trim()) || /\/\/token-plan-[^/]*\.xiaomimimo\.com/i.test(baseUrl)
}

export type AiEnvIssue = 'no_key' | 'token_plan' | 'misconfigured'

/** Lo que impide usar la IA sin siquiera llamar al proveedor (null = se puede intentar). */
export function aiEnvIssue(env: NodeJS.ProcessEnv = process.env): AiEnvIssue | null {
  const apiKey = first(env.AI_API_KEY)
  if (!apiKey) return 'no_key'
  const baseUrl = baseUrlOf(env)
  if (!/^https?:\/\/[^\s]+$/i.test(baseUrl) || !first(env.AI_MODEL)) return 'misconfigured'
  return isTokenPlanCredential(apiKey, baseUrl) ? 'token_plan' : null
}

export const AI_ISSUE_LOG: Record<AiEnvIssue, string> = {
  no_key: 'sin clave. Los asistentes usan comandos locales; conéctala con `npm run ai:setup`',
  token_plan: 'la clave es de Token Plan y ese proveedor no permite usarla en un backend; no se usará. Crea una de pago por uso',
  misconfigured: 'con clave también hacen falta AI_BASE_URL (una URL válida) y AI_MODEL',
}

/** null si no se puede usar la IA: el asistente trabaja en modo local (comandos sin costo). */
export function aiConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AiConfig | null {
  if (aiEnvIssue(env)) return null
  const apiKey = first(env.AI_API_KEY)!
  const baseUrl = baseUrlOf(env)
  const model = first(env.AI_MODEL)!
  const thinkingRaw = first(env.AI_THINKING)?.toLowerCase()
  const timeoutMs = intIn(env.AI_TIMEOUT_MS, 2000, 300_000, DEFAULT_AI_TIMEOUT_MS)
  return {
    apiKey,
    baseUrl,
    model,
    visionModel: first(env.AI_VISION_MODEL) ?? model,
    timeoutMs,
    maxDurationMs: Math.max(timeoutMs, intIn(env.AI_MAX_DURATION_MS, 5000, 900_000, DEFAULT_AI_MAX_DURATION_MS)),
    maxCompletionTokens: intIn(env.AI_MAX_COMPLETION_TOKENS, MIN_COMPLETION_TOKENS, MAX_COMPLETION_TOKENS, DEFAULT_MAX_COMPLETION_TOKENS),
    thinking: thinkingRaw === 'enabled' || thinkingRaw === 'on' || thinkingRaw === '1' ? 'enabled' : 'disabled',
    agentThinking: first(env.AGENT_THINKING)?.toLowerCase() !== 'disabled',
    learning: first(env.AI_LEARNING)?.toLowerCase() !== 'disabled',
  }
}

/** Quita la clave (y cualquier «Bearer …») de un texto antes de registrarlo o mostrarlo. */
export function redactSecret(text: string, secret?: string): string {
  let out = text
  if (secret && secret.length >= 4) out = out.split(secret).join('***')
  return out.replace(/Bearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer ***').replace(/\b(sk|tp|ttp)-[A-Za-z0-9_-]{12,}/g, '$1-***')
}
