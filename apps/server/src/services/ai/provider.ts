/**
 * Estado de la conexión con el proveedor de IA. Lo usan `npm run ai:check`, GET …/status y el
 * diagnóstico de Ajustes, siempre con el mismo vocabulario (`AiProviderState`).
 *
 * Dos niveles de comprobación:
 *
 * - Sin costo (`deep: false`): `GET /models` valida la clave y el modelo y, si el proveedor tiene
 *   una ruta de saldo (`providerProfile`), dice si queda. No consumen tokens: es lo que corre al
 *   cargar la app, con caché corta. Un compatible sin `/models` no se da por mal configurado: lo
 *   decide la primera llamada real.
 * - Real (`deep: true`): además, una llamada de chat mínima (sin razonamiento, tope de 8 tokens).
 *   Solo la piden `ai:check` y el botón del diagnóstico, con límite de frecuencia.
 *
 * El estado también aprende de las llamadas de verdad: si una respuesta falla con 402, el estado
 * pasa a «sin saldo» al tiro, sin esperar a que venza la caché.
 *
 * Nunca entrega saldo en dinero: el proveedor es uno solo y lo pagan los dueños de DEKOPEN, no cada
 * empresa cliente. Tampoco la clave, ni siquiera sus últimos caracteres.
 */
import { createHash } from 'node:crypto'
import type { AiDiagnostics, AiProviderState } from '@dekopen/shared'
import { aiEnvIssue, providerProfile, redactSecret, type AiConfig, type AiEnvIssue } from './config'
import { AiError, createAiClient, type AiErrorKind } from './client'

/** Cuánto vale un resultado antes de volver a preguntar (ms). */
export const PROVIDER_TTL_MS = { ok: 60_000, failed: 30_000 } as const
/** Lo máximo que la carga de la app espera al proveedor (ms): después sigue sin saberlo. */
const STATUS_WAIT_MS = 2500
const PROBE_TIMEOUT_MS = 8000

export interface ProviderProbe {
  state: AiProviderState
  model?: string
  /** Milisegundos de la llamada que confirmó el estado. */
  latencyMs?: number
  /** true si hubo una llamada de chat real; false si solo se consultó modelos y saldo. */
  deep: boolean
  /** Motivo técnico breve, sin secretos (p. ej. «HTTP 503»). */
  detail?: string
  checkedAt: number
}

export interface ProbeOptions {
  fetch?: typeof fetch
  deep?: boolean
  now?: () => number
  timeoutMs?: number
  retries?: number
}

/** Qué significa cada falla de una llamada real. */
export function providerStateOf(kind: AiErrorKind): AiProviderState {
  switch (kind) {
    case 'auth':
      return 'key_rejected'
    case 'forbidden':
      return 'blocked'
    case 'billing':
      return 'no_balance'
    case 'model':
      return 'model_unavailable'
    case 'network':
      return 'no_network'
    case 'rate_limit':
    case 'server':
    case 'timeout':
      return 'busy'
    default:
      return 'unknown'
  }
}

/** Estados en los que no sirve intentar: los pedidos pasan directo a comandos locales. */
export function providerBlocksTurns(state: AiProviderState): boolean {
  return state !== 'connected' && state !== 'unknown' && state !== 'busy'
}

export function issueState(issue: AiEnvIssue): AiProviderState {
  return issue
}

async function getJson(config: AiConfig, path: string, options: ProbeOptions): Promise<{ status: number; body: unknown; ms: number } | { failure: 'network' | 'timeout'; message: string; ms: number }> {
  const doFetch = options.fetch ?? globalThis.fetch
  const now = options.now ?? Date.now
  const started = now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? PROBE_TIMEOUT_MS)
  try {
    const response = await doFetch(`${config.baseUrl}${path}`, { headers: { Authorization: `Bearer ${config.apiKey}`, Accept: 'application/json' }, signal: controller.signal })
    const text = await response.text().catch(() => '')
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = null
    }
    return { status: response.status, body, ms: now() - started }
  } catch (error) {
    const timedOut = controller.signal.aborted
    return { failure: timedOut ? 'timeout' : 'network', message: redactSecret(error instanceof Error ? error.message : 'sin conexión', config.apiKey), ms: now() - started }
  } finally {
    clearTimeout(timer)
  }
}

function modelIds(body: unknown): string[] {
  const data = (body as { data?: unknown } | null)?.data
  return Array.isArray(data) ? data.map((m) => (m as { id?: unknown })?.id).filter((id): id is string => typeof id === 'string') : []
}

/** Comprueba la conexión. Nunca lanza: cualquier problema se vuelve un estado. */
export async function probeProvider(config: AiConfig, options: ProbeOptions = {}): Promise<ProviderProbe> {
  const now = options.now ?? Date.now
  const deep = options.deep ?? false
  const done = (state: AiProviderState, extra: Partial<ProviderProbe> = {}): ProviderProbe => ({ state, deep: false, model: config.model, checkedAt: now(), ...extra })

  const models = await getJson(config, '/models', options)
  if ('failure' in models) return done('no_network', { detail: models.failure === 'timeout' ? 'sin respuesta a tiempo' : models.message.slice(0, 120) })
  if (models.status === 401) return done('key_rejected', { detail: 'HTTP 401' })
  if (models.status === 402) return done('no_balance', { detail: 'HTTP 402' })
  if (models.status === 403) return done('blocked', { detail: 'HTTP 403' })
  if (models.status === 429 || models.status >= 500) return done('busy', { detail: `HTTP ${models.status}` })
  const listed = modelIds(models.body)
  if (models.status === 200 && listed.length) {
    const missing = [config.model, config.visionModel].filter((m) => !listed.includes(m))
    if (missing.length) return done('model_unavailable', { detail: `no aparece: ${[...new Set(missing)].join(', ')}`, latencyMs: models.ms })
  }

  // Solo si este proveedor tiene ruta de saldo: el resto simplemente no lo informa.
  const { balancePath } = providerProfile(config.baseUrl)
  if (balancePath) {
    const balance = await getJson(config, balancePath, options)
    if (!('failure' in balance) && balance.status === 200 && (balance.body as { is_available?: unknown } | null)?.is_available === false) {
      return done('no_balance', { latencyMs: balance.ms })
    }
  }

  if (!deep) return done(models.status === 200 ? 'connected' : 'unknown', { latencyMs: models.ms, ...(models.status === 200 ? {} : { detail: `HTTP ${models.status}` }) })

  const client = createAiClient(config, { fetch: options.fetch, retries: options.retries ?? 0 })
  try {
    const result = await client.chat({ messages: [{ role: 'user', content: 'Responde solo: ok' }], thinking: 'disabled', maxCompletionTokens: 8, tinyOutput: true })
    return done('connected', { deep: true, model: result.model, latencyMs: result.durationMs })
  } catch (error) {
    const kind = error instanceof AiError ? error.kind : 'bad_response'
    const status = error instanceof AiError && error.status ? `HTTP ${error.status}` : kind
    // Ni /models ni el chat existen en esa dirección: lo que está mal es la dirección.
    if (models.status === 404 && kind === 'model') return done('misconfigured', { deep: true, detail: 'HTTP 404: revisa AI_BASE_URL' })
    return done(providerStateOf(kind), { deep: true, detail: status })
  }
}

// ── Caché por proceso ────────────────────────────────────────────────────────

interface Slot {
  probe?: ProviderProbe
  inFlight?: Promise<ProviderProbe>
}

/** Por app (`deps`): cada instancia lleva su cuenta y las pruebas no se contaminan entre sí. */
const slotsByApp = new WeakMap<object, Map<string, Slot>>()

function slotOf(owner: object, config: AiConfig): Slot {
  let slots = slotsByApp.get(owner)
  if (!slots) slotsByApp.set(owner, (slots = new Map()))
  // Huella en memoria: cambiar la clave o el modelo invalida lo sabido.
  const key = createHash('sha256').update(`${config.apiKey}|${config.baseUrl}|${config.model}`).digest('hex')
  let slot = slots.get(key)
  if (!slot) slots.set(key, (slot = {}))
  return slot
}

const isFresh = (probe: ProviderProbe, at: number) => at - probe.checkedAt < (probe.state === 'connected' ? PROVIDER_TTL_MS.ok : PROVIDER_TTL_MS.failed)

function refresh(slot: Slot, config: AiConfig, options: ProbeOptions): Promise<ProviderProbe> {
  slot.inFlight ??= probeProvider(config, options)
    .then((probe) => {
      // Una llamada real que llegó mientras tanto sabe más que la consulta sin costo.
      if (!slot.probe?.deep || !isFresh(slot.probe, options.now?.() ?? Date.now())) slot.probe = probe
      return slot.probe
    })
    .finally(() => {
      slot.inFlight = undefined
    })
  return slot.inFlight
}

/** Estado para la carga de la app: caché, o una consulta sin costo que no la frena más de 2,5 s. */
export async function providerStatus(owner: object, ai: AiConfig | null, options: ProbeOptions & { env?: NodeJS.ProcessEnv } = {}): Promise<ProviderProbe> {
  const now = options.now ?? Date.now
  if (!ai) return { state: issueState(aiEnvIssue(options.env ?? process.env) ?? 'no_key'), deep: false, checkedAt: now() }
  const slot = slotOf(owner, ai)
  if (slot.probe && isFresh(slot.probe, now())) return slot.probe
  let timer: ReturnType<typeof setTimeout> | undefined
  const waited = await Promise.race([
    refresh(slot, ai, { ...options, deep: false }),
    new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), STATUS_WAIT_MS)
    }),
  ])
  if (timer) clearTimeout(timer)
  return waited ?? slot.probe ?? { state: 'unknown', deep: false, model: ai.model, checkedAt: now() }
}

/** Comprobación pedida a mano (botón del diagnóstico): siempre real. */
export async function checkProviderNow(owner: object, ai: AiConfig | null, options: ProbeOptions & { env?: NodeJS.ProcessEnv } = {}): Promise<ProviderProbe> {
  if (!ai) return providerStatus(owner, ai, options)
  const probe = await probeProvider(ai, { ...options, deep: true, retries: 1 })
  slotOf(owner, ai).probe = probe
  return probe
}

/** Lo que dejó una llamada real (éxito o falla) vale más que cualquier consulta. */
export function noteProviderOutcome(owner: object, ai: AiConfig, outcome: { ok: true; durationMs: number; model: string } | { ok: false; error: AiError }, now = Date.now()): void {
  const slot = slotOf(owner, ai)
  if (outcome.ok) {
    slot.probe = { state: 'connected', deep: true, model: outcome.model, latencyMs: outcome.durationMs, checkedAt: now }
    return
  }
  const state = providerStateOf(outcome.error.kind)
  // Una respuesta rara no dice nada de la conexión.
  if (state === 'unknown') return
  slot.probe = { state, deep: true, model: ai.model, detail: outcome.error.status ? `HTTP ${outcome.error.status}` : outcome.error.kind, checkedAt: now }
}

/** Respuesta del diagnóstico de Ajustes (solo quien administra la cuenta). */
export function toDiagnostics(probe: ProviderProbe, ai: AiConfig | null): AiDiagnostics {
  return {
    state: probe.state,
    available: !providerBlocksTurns(probe.state),
    ...(probe.model ?? ai?.model ? { model: probe.model ?? ai?.model } : {}),
    ...(ai ? { visionModel: ai.visionModel, thinking: ai.thinking } : {}),
    ...(probe.latencyMs !== undefined ? { latencyMs: probe.latencyMs } : {}),
    deep: probe.deep,
    ...(probe.detail ? { detail: probe.detail } : {}),
    checkedAt: new Date(probe.checkedAt).toISOString(),
  }
}
