/**
 * Un turno con Marco: mensaje → servidor (IA o modo local) → herramientas en el navegador →
 * resultados al servidor → … hasta la respuesta final. Si el servidor no responde, el intérprete
 * local corre aquí mismo: Marco nunca deja a la persona esperando sin salida.
 */
import {
  parseLocalCommand,
  type AssistantChatRequest,
  type AssistantChatResponse,
  type AssistantContext,
  type LocalCommandContext,
} from '@framezen/shared'
import { ApiRequestError, humanError } from '../../lib/api'
import { STEP_LABELS, createExecutor, type ExecutorEnv, type ToolOutcome } from './executor'
import { entryId, type MarcoStore } from './store'
import type { ApprovalRequest, ChatEntry, ReceiptView, StepView } from './types'

export const MAX_ROUNDS = 6
export const DONE_HOLD_MS = 2600

export interface ConversationDeps {
  transport(request: AssistantChatRequest, signal: AbortSignal): Promise<AssistantChatResponse>
  /** Entorno del ejecutor; `approve` lo provee el turno (tarjeta en el panel). */
  env(approve: (request: ApprovalRequest) => Promise<boolean>): ExecutorEnv
  context(): AssistantContext
  localContext(): LocalCommandContext
  store: { getState(): MarcoStore }
  /** Tras gastar créditos (para refrescar el plan en la interfaz). */
  onCredits?(): void
}

/** Deshacer de cada recibo (en memoria; no sobrevive a recargar). */
export const undoRegistry = new Map<string, () => boolean>()
const approvals = new Map<string, (ok: boolean) => void>()

export function resolveApproval(entry: string, ok: boolean): void {
  const resolve = approvals.get(entry)
  if (resolve) {
    approvals.delete(entry)
    resolve(ok)
  }
}

/** Rechaza cualquier aprobación pendiente (p. ej. al escribir algo nuevo). */
export function declinePendingApprovals(): void {
  for (const id of [...approvals.keys()]) resolveApproval(id, false)
}

export function hasPendingApproval(): boolean {
  return approvals.size > 0
}

/** Deshace un recibo. Devuelve false si ya no se puede. */
export function undoReceipt(store: { getState(): MarcoStore }, receiptId: string): boolean {
  const fn = undoRegistry.get(receiptId)
  if (!fn) return false
  let ok = false
  try {
    ok = fn()
  } catch {
    ok = false
  }
  undoRegistry.delete(receiptId)
  store.getState().markReceipt(receiptId, ok ? { undone: true, undoable: false } : { undoable: false })
  return ok
}

/** El recibo deshacible más reciente (para «deshacer» escrito). */
export function lastUndoable(entries: readonly ChatEntry[]): ReceiptView | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const receipts = entries[i].receipts ?? []
    for (let j = receipts.length - 1; j >= 0; j--) {
      const r = receipts[j]
      if (r.undoable && !r.undone && undoRegistry.has(r.id)) return r
    }
  }
  return undefined
}

function isAbort(error: unknown): boolean {
  return (error instanceof DOMException && error.name === 'AbortError') || (error instanceof Error && error.name === 'AbortError')
}

/** Sin conexión, servidor caído o demasiado lento: se resuelve en el navegador. */
function canRunLocally(error: unknown): boolean {
  if (error instanceof ApiRequestError) return error.isNetwork || error.status >= 500 || error.status === 408
  return error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError')
}

export function offlineResponse(text: string, context: LocalCommandContext, creditsLeft: number): AssistantChatResponse {
  const parsed = parseLocalCommand(text, context)
  const base = {
    creditsUsed: 0,
    creditsLeft,
    mode: 'local' as const,
    reason: 'offline' as const,
    notice: 'Sin conexión con el servidor: lo resolví aquí mismo, en modo local.',
  }
  if ('toolCalls' in parsed) return { ...base, message: { role: 'assistant', content: '', toolCalls: parsed.toolCalls }, ...(parsed.notes ? { notes: parsed.notes } : {}) }
  return { ...base, message: { role: 'assistant', content: parsed.reply } }
}

/** Respuesta del modo local a partir de lo que hizo cada herramienta. */
export function composeLocalReply(outcomes: readonly ToolOutcome[]): string {
  const says: string[] = []
  for (const o of outcomes) {
    const say = o.say?.trim()
    if (say && !says.includes(say)) says.push(say)
  }
  if (!says.length) return outcomes.length ? 'Listo.' : 'No hice cambios.'
  const rest = says.filter((s) => s !== 'Listo.')
  if (rest.length === says.length) return says.join(' ')
  // Un solo «Listo.» y al comienzo, salvo que otra frase ya empiece así.
  return rest.some((s) => /^listo\b/i.test(s)) ? rest.join(' ') : ['Listo.', ...rest].join(' ')
}

/**
 * Corre un turno completo y va actualizando el store (estado del avatar, pasos, recibos, tarjetas,
 * texto final). Nunca lanza.
 */
export async function runTurn(text: string, deps: ConversationDeps, signal: AbortSignal): Promise<void> {
  const s = () => deps.store.getState()
  const now = Date.now()
  s().addEntry({ id: entryId('u'), role: 'user', text, at: now })
  const id = entryId('a')
  s().addEntry({ id, role: 'assistant', text: '', at: now, status: 'pending' })
  s().setBusy(true)
  s().setMarco('thinking')
  s().pushHistory({ role: 'user', content: text })

  const approve = (request: ApprovalRequest) =>
    new Promise<boolean>((resolve) => {
      s().setApproval(id, { ...request, id: entryId('ok'), status: 'pending' })
      s().setMarco('approval')
      approvals.set(id, (ok) => {
        const current = s().entries.find((e) => e.id === id)?.approval
        if (current) s().setApproval(id, { ...current, status: ok ? 'approved' : 'declined' })
        s().setMarco('working')
        resolve(ok)
      })
      signal.addEventListener('abort', () => resolveApproval(id, false), { once: true })
    })
  const executor = createExecutor(deps.env(approve))
  const update = (patch: Partial<ChatEntry> | ((e: ChatEntry) => Partial<ChatEntry>)) => s().updateEntry(id, patch)

  let finished = false
  let anyReceipt = false
  try {
    for (let round = 0; round < MAX_ROUNDS && !finished; round++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      s().setMarco('thinking')
      let res: AssistantChatResponse
      try {
        res = await deps.transport({ messages: s().history, context: deps.context() }, signal)
      } catch (error) {
        if (signal.aborted || isAbort(error)) throw error
        if (round === 0 && canRunLocally(error)) res = offlineResponse(text, deps.localContext(), s().credits ?? 0)
        else if (round > 0 && canRunLocally(error)) {
          update((e) => ({ text: e.text || 'Hice los cambios, pero se cortó la conexión antes de poder comentarlos.', status: 'done' }))
          finished = true
          break
        } else throw error
      }

      s().setMode(res.mode, res.reason ?? null, res.creditsLeft)
      if (res.creditsUsed > 0) deps.onCredits?.()
      update((e) => ({
        mode: res.mode,
        ...(res.notice ? { notice: res.notice } : {}),
        ...(res.notes?.length ? { notes: [...(e.notes ?? []), ...res.notes] } : {}),
      }))
      const calls = res.message.toolCalls ?? []
      s().pushHistory({ role: 'assistant', content: res.message.content ?? '', ...(calls.length ? { toolCalls: calls } : {}) })

      if (!calls.length) {
        const reply = res.message.content?.trim()
        update((e) => ({ text: reply || e.text || (anyReceipt ? 'Listo.' : 'Aquí estoy. ¿Qué hacemos?'), status: 'done' }))
        finished = true
        break
      }

      s().setMarco('working')
      if (res.message.content) update({ text: res.message.content })
      const outcomes = await executor.run(calls, {
        signal,
        onStep: (call, outcome) => {
          const stepId = `${id}:${call.id}`
          update((e) => {
            const steps: StepView[] = [...(e.steps ?? [])]
            const index = steps.findIndex((st) => st.id === stepId)
            if (!outcome) {
              if (index < 0) steps.push({ id: stepId, label: labelFor(call.name), done: false })
            } else if (index >= 0) steps[index] = { ...steps[index], done: true }
            return { steps }
          })
          if (outcome) applyOutcome(outcome)
        },
      })
      for (const o of outcomes) s().pushHistory({ role: 'tool', toolCallId: o.callId, content: JSON.stringify(o.result).slice(0, 6000) })

      if (res.mode === 'local') {
        const reply = composeLocalReply(outcomes)
        const notes = outcomes.flatMap((o) => o.notes)
        update((e) => ({ text: reply, status: 'done', ...(notes.length ? { notes: [...(e.notes ?? []), ...notes] } : {}) }))
        // El servidor no necesita comentar el modo local: el resumen lo arma el navegador.
        s().pushHistory({ role: 'assistant', content: reply })
        finished = true
        break
      }
    }
    if (!finished) update((e) => ({ text: e.text || 'Hice varios pasos seguidos y me detuve para no pasarme. ¿Sigo?', status: 'done' }))
    update({ steps: undefined })
    s().setMarco('done')
    const at = Date.now()
    setTimeout(() => {
      const state = s()
      if (state.marco === 'done' && !state.busy && at <= Date.now()) state.setMarco('idle')
    }, DONE_HOLD_MS)
  } catch (error) {
    if (signal.aborted || isAbort(error)) {
      update((e) => ({ status: 'stopped', steps: undefined, text: e.text || (anyReceipt ? 'Me detuve. Lo que alcancé a hacer quedó, con su «Deshacer».' : 'Me detuve.') }))
      s().setMarco('idle')
    } else {
      const message = humanError(error)
      update({ status: 'error', steps: undefined, text: `${message}${/a salvo/.test(message) ? '' : ' Tu cotización está a salvo.'}` })
      s().setMarco('error')
    }
  } finally {
    s().setBusy(false)
  }

  function applyOutcome(outcome: ToolOutcome) {
    if (outcome.receipts.length) {
      anyReceipt = true
      for (const r of outcome.receipts) if (r.undo) undoRegistry.set(r.id, r.undo)
      const views: ReceiptView[] = outcome.receipts.map((r) => ({ id: r.id, text: r.text, undoable: Boolean(r.undo) }))
      update((e) => ({ receipts: [...(e.receipts ?? []), ...views] }))
    }
    const card = outcome.card
    if (card) update((e) => ({ cards: [...(e.cards ?? []), card] }))
  }
}

function labelFor(name: string): string {
  return (STEP_LABELS as Record<string, string>)[name] ?? 'Trabajando…'
}
