/**
 * Marco en el servidor: decide entre IA (plan con 'assistant', clave configurada y créditos) y
 * modo local (intérprete determinista), registra el consumo en ai_usage y nunca deja a la
 * persona sin respuesta: ante cualquier falla de la IA responde en modo local con un aviso amable.
 * Los créditos se reservan antes de llamar a la IA (ver credits.ts): sin reserva no hay llamada.
 *
 * Las herramientas no se ejecutan aquí: viajan al navegador, que las aplica sobre el estado real.
 */
import {
  ASSISTANT_TOOLS,
  PLANS,
  creditsForTokens,
  parseLocalCommand,
  type AssistantChatRequest,
  type AssistantChatResponse,
  type AssistantLocalReason,
  type AssistantMessage,
  type AssistantStatus,
  type LocalCommandContext,
} from '@framezen/shared'
import type { AppDeps, AuthContext } from '../../context'
import { aiUsage } from '../../db/schema'
import { newId } from '../../lib/crypto'
import { getBillingState } from '../billing'
import type { AiConfig } from './config'
import { creditsLeftOf, releaseCredits, reserveCredits, settleCredits, type CreditReservation } from './credits'
import { AiError, DEFAULT_MAX_TOKENS, chatCompletion, estimateTokens, toOpenAiMessages, type OpenAiMessage } from './openai'
import { buildContextMessage, buildSystemPrompt, chileDate } from './prompt'

export { creditsLeftOf }

export interface AssistantRuntime {
  /** Configuración de IA vigente (null = sin clave). */
  ai: AiConfig | null
  fetch?: typeof fetch
  signal?: AbortSignal
}

/** Las definiciones de herramientas viajan en cada llamada y también cuestan tokens. */
const TOOLS_TOKENS = Math.ceil(JSON.stringify(ASSISTANT_TOOLS).length / 4)

/** Costo probable de una llamada (entrada estimada + tope de respuesta): lo que se reserva. */
function estimateCredits(messages: readonly OpenAiMessage[]): number {
  return creditsForTokens(estimateTokens(messages) + TOOLS_TOKENS + DEFAULT_MAX_TOKENS)
}

const NOTICES: Record<'no_credits' | 'timeout' | 'rate_limit' | 'auth' | 'other', string> = {
  no_credits: 'Usaste todos los créditos de IA de este período. Sigo en modo local: entiendo frases como «agrega una corredera de 1500 x 1200».',
  timeout: 'La IA se demoró demasiado, así que lo resolví en modo local.',
  rate_limit: 'La IA está con mucha demanda en este momento; por ahora sigo en modo local.',
  auth: 'La conexión con la IA no está disponible; sigo en modo local mientras lo revisamos.',
  other: 'No pude conectar con la IA; lo resolví en modo local.',
}

function noticeFor(error: unknown): string {
  if (error instanceof AiError) {
    if (error.kind === 'timeout') return NOTICES.timeout
    if (error.kind === 'rate_limit') return NOTICES.rate_limit
    if (error.kind === 'auth') return NOTICES.auth
  }
  return NOTICES.other
}

async function recordUsage(deps: AppDeps, auth: AuthContext, entry: { credits: number; mode: 'ai' | 'local'; model?: string }): Promise<void> {
  try {
    await deps.db.insert(aiUsage).values({
      id: newId(),
      orgId: auth.org.id,
      userId: auth.user.id,
      credits: entry.credits,
      mode: entry.mode,
      model: entry.model ?? null,
    })
  } catch (error) {
    // El registro de uso nunca debe tumbar una respuesta.
    deps.logger.warn('No se pudo registrar el uso del asistente', error)
  }
}

/** Nombres del catálogo efectivo: mejoran el intérprete local («roble montaña», «PROSLD70»). */
async function localVocabulary(deps: AppDeps, orgId: string): Promise<Pick<LocalCommandContext, 'colors' | 'lines' | 'glasses'>> {
  try {
    const { catalog } = await deps.catalogs.effective(orgId, { onlyEnabled: true })
    return {
      colors: catalog.colors.map((c) => c.name),
      lines: catalog.lines.map((l) => l.name),
    }
  } catch {
    return {}
  }
}

function lastOf(messages: readonly AssistantMessage[]): AssistantMessage | undefined {
  return messages[messages.length - 1]
}

/** Respuesta en modo local para el último mensaje. */
async function localReply(
  deps: AppDeps,
  auth: AuthContext,
  request: AssistantChatRequest,
  creditsLeft: number,
  reason: AssistantLocalReason,
  notice?: string,
): Promise<AssistantChatResponse> {
  const last = lastOf(request.messages)
  const base = { creditsUsed: 0, creditsLeft, mode: 'local' as const, reason, ...(notice ? { notice } : {}) }
  // Tras ejecutar herramientas el navegador arma el resumen con sus recibos.
  if (!last || last.role !== 'user') return { ...base, message: { role: 'assistant', content: '' } }
  const vocabulary = await localVocabulary(deps, auth.org.id)
  const result = parseLocalCommand(last.content, {
    route: request.context.route,
    quoteOpen: Boolean(request.context.quoteId),
    selectedRef: request.context.selectedRef,
    refs: request.context.refs,
    ...vocabulary,
  })
  await recordUsage(deps, auth, { credits: 0, mode: 'local' })
  if ('toolCalls' in result) {
    return {
      ...base,
      message: { role: 'assistant', content: '', toolCalls: result.toolCalls },
      ...(result.notes?.length ? { notes: result.notes } : {}),
    }
  }
  return { ...base, message: { role: 'assistant', content: result.reply } }
}

/** Modo vigente y saldo (para el indicador del panel). */
export async function assistantStatus(deps: AppDeps, auth: AuthContext, ai: AiConfig | null): Promise<AssistantStatus> {
  const billing = await getBillingState(deps.db, auth.org.id, deps.config.billingProvider, deps.now())
  const creditsLeft = creditsLeftOf(billing)
  const planHasAi = billing.features.includes('assistant') && billing.status !== 'expired'
  const reason: AssistantLocalReason | undefined = !planHasAi ? 'plan' : !ai ? 'no_key' : creditsLeft <= 0 ? 'no_credits' : undefined
  return {
    mode: reason ? 'local' : 'ai',
    ...(reason ? { reason } : {}),
    creditsLeft,
    creditsIncluded: billing.aiCredits.included + billing.aiCredits.extra,
  }
}

export async function runAssistant(deps: AppDeps, auth: AuthContext, request: AssistantChatRequest, runtime: AssistantRuntime): Promise<AssistantChatResponse> {
  const now = deps.now()
  const billing = await getBillingState(deps.db, auth.org.id, deps.config.billingProvider, now)
  const creditsLeft = creditsLeftOf(billing)
  const planHasAi = billing.features.includes('assistant') && billing.status !== 'expired'

  if (request.context.prefer === 'local') return localReply(deps, auth, request, creditsLeft, 'forced')
  if (!planHasAi) return localReply(deps, auth, request, creditsLeft, 'plan')
  if (!runtime.ai) return localReply(deps, auth, request, creditsLeft, 'no_key')
  if (creditsLeft <= 0) return localReply(deps, auth, request, 0, 'no_credits', NOTICES.no_credits)

  const messages: OpenAiMessage[] = [
    {
      role: 'system',
      content: buildSystemPrompt({
        orgName: auth.org.name,
        userName: auth.user.name,
        planName: billing.plan === 'trial' ? 'Prueba Pro' : PLANS[billing.plan].name,
        today: chileDate(now),
      }),
    },
    { role: 'system', content: buildContextMessage(request.context) },
    ...toOpenAiMessages(request.messages),
  ]

  // Reserva atómica: con pedidos simultáneos, solo llaman a la IA los que alcanzan a apartar saldo.
  let reservation: CreditReservation | null
  try {
    reservation = await reserveCredits(deps, auth, estimateCredits(messages))
  } catch (error) {
    deps.logger.warn('Marco: no se pudo reservar créditos; respondo en modo local', error instanceof Error ? error.message : error)
    return localReply(deps, auth, request, creditsLeft, 'ai_error', NOTICES.other)
  }
  if (!reservation) return localReply(deps, auth, request, 0, 'no_credits', NOTICES.no_credits)
  const leftBefore = reservation.left + reservation.credits

  try {
    const result = await chatCompletion({ config: runtime.ai, messages, tools: ASSISTANT_TOOLS, fetch: runtime.fetch, signal: runtime.signal })
    const settled = await settleCredits(deps, auth, reservation, creditsForTokens(result.totalTokens), result.model)
    const content = result.content || (result.toolCalls.length ? '' : 'Listo.')
    const message: AssistantMessage = { role: 'assistant', content }
    if (result.toolCalls.length) message.toolCalls = result.toolCalls
    return { message, creditsUsed: settled.credits, creditsLeft: settled.left, mode: 'ai' }
  } catch (error) {
    await releaseCredits(deps, reservation)
    if (error instanceof AiError && error.kind === 'aborted') {
      return { message: { role: 'assistant', content: '' }, creditsUsed: 0, creditsLeft: leftBefore, mode: 'ai' }
    }
    deps.logger.warn(`Marco: la IA falló (${error instanceof AiError ? error.kind : 'desconocido'}); respondo en modo local`, error instanceof Error ? error.message : error)
    return localReply(deps, auth, request, leftBefore, 'ai_error', noticeFor(error))
  }
}
