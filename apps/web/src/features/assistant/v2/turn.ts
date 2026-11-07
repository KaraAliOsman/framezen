/**
 * Un turno con el asistente v2: el texto va al servidor (que es dueño de la conversación, del prompt
 * y de las herramientas) y vuelve como un flujo de `TurnEvent`. Aquí se aplican los eventos a la
 * vista: texto en streaming, línea de actividad, propuestas para aprobar, instrucciones de interfaz,
 * entidades a recargar, créditos, avisos. Nunca lanza: los problemas quedan como avisos en la
 * conversación, con «Reintentar» y sin perder lo escrito.
 */
import {
  messageText,
  parseUiAction,
  type AffectedEntity,
  type LocalTurnRequest,
  type LocalTurnResponse,
  type Message,
  type ToolRun,
  type TurnDoneReason,
  type TurnEvent,
  type TurnRequest,
  type UiAction,
} from '@dekopen/shared'
import { ApiRequestError } from '../../../lib/api'
import { emitBotReaction } from '../avatar/reactions'
import { translate } from '../../../lib/i18n'
import es from '../i18n/es'
import type { AttachmentView } from '../attachments/types'
import { DONE_HOLD_MS } from '../local/timing'
import { entryId, type AssistantPanelStore } from '../store'
import type { ChatEntry, NoticeView } from '../types'
import type { AssistantApi } from './client'
import { applyParts } from './messages'

export interface TurnDeps {
  store: { getState(): AssistantPanelStore }
  api: Pick<AssistantApi, 'turn' | 'approve' | 'reject' | 'localTurn'>
  /** Instrucción de interfaz validada (navegar, abrir, seleccionar, idioma, tema…). */
  onUi(action: UiAction): void
  /** Entidades que cambiaron en el servidor: recargar y reemplazar lo que se ve. */
  onAffected(entities: AffectedEntity[]): void | Promise<void>
  /** Antes de un turno con IA: guardar lo pendiente del editor (la IA trabaja sobre el servidor). */
  flush(): Promise<void>
  onCredits?(left: number): void
}

export type TurnOutcome = { reason: TurnDoneReason; conversationId?: string }

/** Avisos sin IA que tienen acción «Ver plan». */
export const PLAN_CODES = new Set(['no_credits', 'daily_limit', 'plan', 'plan_required'])
const FLUSH_TIMEOUT_MS = 4000

function isAbort(error: unknown): boolean {
  return (error instanceof DOMException && error.name === 'AbortError') || (error instanceof Error && error.name === 'AbortError')
}

function notice(level: NoticeView['level'], code: string, text: string): NoticeView {
  return { id: entryId('n'), level, code, text }
}

/** Texto visible de un mensaje del asistente (sin partes de herramientas). */
function visibleText(message: Message): string {
  return message.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { text: string }).text)
    .join('\n\n')
}

/** Estado de un flujo: a qué entradas escribe y los textos por mensaje (el turno se lee como uno). */
class StreamState {
  segments = new Map<string, string>()
  order: string[] = []
  constructor(
    public entry: string,
    public user?: string,
    /** Tramos que la entrada ya tenía (continuación tras aprobar o rechazar). */
    base: readonly string[] = [],
  ) {
    base.forEach((part, i) => {
      this.segments.set(`__base${i}`, part)
      this.order.push(`__base${i}`)
    })
    this.baseText = base.join('\n\n')
  }

  private baseText = ''

  append(messageId: string, text: string): string {
    if (!this.segments.has(messageId)) this.order.push(messageId)
    this.segments.set(messageId, (this.segments.get(messageId) ?? '') + text)
    return this.text()
  }

  replace(messageId: string, text: string): string {
    if (!this.segments.has(messageId)) {
      // Tras aprobar o rechazar, el servidor reenvía el mensaje original con la tarjeta ya actualizada:
      // su texto ya está en la base de la entrada y no se repite.
      const trimmed = text.trim()
      if (this.baseText && trimmed && this.baseText.includes(trimmed)) return this.text()
      this.order.push(messageId)
    }
    this.segments.set(messageId, text)
    return this.text()
  }

  parts(): string[] {
    return this.order.map((id) => this.segments.get(id)?.trim() ?? '').filter(Boolean)
  }

  text(): string {
    return this.parts().join('\n\n')
  }
}

export function createTurnRunner(deps: TurnDeps) {
  const s = () => deps.store.getState()

  function update(id: string, patch: Partial<ChatEntry> | ((e: ChatEntry) => Partial<ChatEntry>)) {
    s().updateEntry(id, patch)
  }

  function upsertActivity(id: string, run: ToolRun, status: ToolRun['status'], error?: string, at?: number) {
    update(id, (e) => {
      // Una propuesta aprobada se sigue viendo en su tarjeta (compacta): no se duplica en la actividad.
      if (e.approvals?.includes(run.id)) return {}
      const activity = [...(e.activity ?? [])]
      const key = run.toolCallId || run.id
      const index = activity.findIndex((a) => a.id === key || (a.toolRunId && a.toolRunId === run.id))
      const view = {
        id: key,
        toolRunId: run.id,
        tool: run.tool,
        risk: run.risk,
        status,
        ...(at !== undefined ? { at } : {}),
        ...(run.preview?.title ? { summary: run.preview.title } : {}),
        ...(error ? { error } : {}),
      }
      if (index >= 0) activity[index] = { ...activity[index], ...view, at: activity[index].at ?? view.at, summary: activity[index].summary ?? view.summary }
      else activity.push(view)
      return { activity }
    })
  }

  /** Aplica un evento del flujo. Devuelve el motivo de cierre cuando llega `done`. */
  function apply(state: StreamState, event: TurnEvent): TurnDoneReason | null {
    const store = s()
    switch (event.type) {
      case 'turn.started': {
        store.setConversation(event.conversation.id)
        if (state.user) {
          store.renameEntry(state.user, event.userMessage.id)
          state.user = event.userMessage.id
        }
        store.renameEntry(state.entry, event.assistantMessageId)
        state.entry = event.assistantMessageId
        return null
      }
      case 'message.delta': {
        const text = state.append(event.messageId, event.text)
        update(state.entry, { text, parts: state.parts(), status: 'streaming', source: 'ai' })
        if (store.face !== 'approval') store.setFace('speaking')
        emitBotReaction('token')
        return null
      }
      case 'message.done': {
        const message = event.message
        if (message.role === 'user') return null
        const text = state.replace(message.id, visibleText(message))
        const nonText = message.parts.filter((p) => p.type !== 'text')
        update(state.entry, (e) => {
          const next = applyParts({ ...e, parts: state.parts() }, nonText, s().toolRuns)
          return {
            ...next,
            text,
            parts: state.parts(),
            source: message.source,
            ...(message.credits ? { credits: (e.credits ?? 0) + message.credits } : {}),
          }
        })
        return null
      }
      case 'tool.proposed': {
        store.upsertToolRun(event.toolRun)
        update(state.entry, (e) => ({
          approvals: [...new Set([...(e.approvals ?? []), event.toolRun.id])],
          approvalAt: { [event.toolRun.id]: state.parts().length, ...e.approvalAt },
        }))
        store.setFace('approval')
        return null
      }
      case 'tool.executed': {
        store.upsertToolRun(event.toolRun)
        upsertActivity(state.entry, event.toolRun, event.toolRun.status === 'undone' ? 'undone' : 'executed', undefined, state.parts().length)
        if (store.face !== 'approval') store.setFace('working')
        emitBotReaction('tool_ok')
        return null
      }
      case 'tool.failed': {
        store.upsertToolRun({ ...event.toolRun, error: event.error })
        upsertActivity(state.entry, event.toolRun, 'failed', event.error.message, state.parts().length)
        emitBotReaction('tool_fail')
        return null
      }
      case 'ui': {
        const action = parseUiAction(event.action)
        if (action) deps.onUi(action)
        return null
      }
      case 'affected':
        void Promise.resolve(deps.onAffected(event.entities)).catch(() => undefined)
        return null
      case 'credits':
        store.setCredits({ left: event.left, lastTurn: event.turnTotal })
        deps.onCredits?.(event.left)
        return null
      case 'notice':
        store.addNotice(state.entry, notice(event.level, event.code, event.message))
        return null
      case 'error':
        // Sin IA la app sigue funcionando: es una advertencia, no un error de la persona.
        store.addNotice(state.entry, notice(event.code === 'ai_unavailable' || event.code === 'ai_filtered' ? 'warning' : 'error', event.code, event.message))
        update(state.entry, (e) => ({ status: 'error', ...(event.retryable && !e.retryText ? { retryText: lastUserText(state) } : {}) }))
        return null
      case 'done':
        return event.reason
    }
  }

  function lastUserText(state: StreamState): string | undefined {
    const entries = s().entries
    const userIndex = state.user ? entries.findIndex((e) => e.id === state.user) : -1
    return userIndex >= 0 ? entries[userIndex].text : undefined
  }

  function finish(state: StreamState, reason: TurnDoneReason | null, conversationId?: string): TurnOutcome {
    const store = s()
    const entry = store.entries.find((e) => e.id === state.entry)
    const pendingApproval = entry?.approvals?.some((id) => store.toolRuns[id]?.status === 'proposed') ?? false
    const final: TurnDoneReason = reason ?? 'completed'
    if (final === 'aborted') {
      update(state.entry, (e) => ({ status: 'stopped', text: e.text || translate(es, e.activity?.length ? 'conversation.stoppedPartial' : 'conversation.stopped') }))
      store.setFace('idle')
    } else if (final === 'error' || entry?.status === 'error') {
      update(state.entry, { status: 'error' })
      store.setFace('error')
    } else {
      update(state.entry, (e) => ({
        status: 'done',
        ...(final === 'limit' ? { text: [e.text, translate(es, 'conversation.limit')].filter(Boolean).join('\n\n'), parts: [...(e.parts ?? []), translate(es, 'conversation.limit')] } : {}),
      }))
      store.setFace(pendingApproval ? 'approval' : 'done')
      if (!pendingApproval) {
        setTimeout(() => {
          const now = s()
          if (now.face === 'done' && !now.busy) now.setFace('idle')
        }, DONE_HOLD_MS)
      }
    }
    return { reason: final, conversationId: conversationId ?? store.conversationId ?? undefined }
  }

  function fail(state: StreamState, error: unknown, retryText?: string): TurnOutcome {
    const store = s()
    if (isAbort(error)) return finish(state, 'aborted')
    const api = error instanceof ApiRequestError ? error : null
    const code = api?.code ?? 'network'
    const text = api ? api.message : translate(es, 'notices.network')
    const level: NoticeView['level'] = api && (PLAN_CODES.has(code) || code === 'no_key' || code === 'ai_unavailable' || code === 'rate_limited') ? 'warning' : 'error'
    store.addNotice(state.entry, notice(level, code, text))
    update(state.entry, (e) => ({ status: level === 'error' ? 'error' : 'done', ...(retryText && !PLAN_CODES.has(code) ? { retryText } : {}), text: e.text }))
    store.setFace(level === 'error' ? 'error' : 'idle')
    return { reason: 'error', conversationId: store.conversationId ?? undefined }
  }

  async function consume(state: StreamState, start: (onEvent: (event: TurnEvent) => void) => Promise<void>, retryText?: string): Promise<TurnOutcome> {
    const store = s()
    store.setBusy(true)
    let reason: TurnDoneReason | null = null
    let conversationId: string | undefined
    try {
      await start((event) => {
        const r = apply(state, event)
        if (event.type === 'done') conversationId = event.conversationId
        if (r) reason = r
      })
      return finish(state, reason, conversationId)
    } catch (error) {
      // Corte a mitad del flujo con texto ya recibido: queda lo que llegó y se avisa.
      return fail(state, error, retryText)
    } finally {
      s().setBusy(false)
    }
  }

  async function flushEditor(): Promise<void> {
    try {
      await Promise.race([deps.flush(), new Promise<void>((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS))])
    } catch {
      // El turno sigue: lo guardado es lo que el servidor ve.
    }
  }

  return {
    /** Turno con IA. Agrega la entrada de la persona y la respuesta pendiente; aplica el flujo. */
    async run(request: TurnRequest, signal?: AbortSignal, options: { userEntryId?: string; attachments?: AttachmentView[] } = {}): Promise<TurnOutcome> {
      const store = s()
      const now = Date.now()
      const userId = options.userEntryId ?? entryId('u')
      if (!store.entries.some((e) => e.id === userId)) store.addEntry({ id: userId, role: 'user', text: request.text, at: now, source: 'ai', ...(options.attachments?.length ? { attachments: options.attachments } : {}) })
      const assistantId = entryId('a')
      store.addEntry({ id: assistantId, role: 'assistant', text: '', at: now, status: 'pending', source: 'ai' })
      store.setFace('thinking')
      const state = new StreamState(assistantId, userId)
      await flushEditor()
      return consume(state, (onEvent) => deps.api.turn(request, onEvent, signal), request.text || request.attachments?.[0]?.name)
    },

    /** Aprueba una propuesta (con la huella de lo que la persona vio) y continúa el turno. */
    async approve(run: ToolRun, signal?: AbortSignal): Promise<TurnOutcome> {
      const target = findEntryWithApproval(run.id) ?? lastAssistantEntry()
      s().upsertToolRun({ ...run, status: 'approved' })
      s().setFace('working')
      const state = continuation(target)
      await flushEditor()
      return consume(state, (onEvent) => deps.api.approve(run.id, { argsHash: run.argsHash }, onEvent, signal))
    },

    /** Rechaza una propuesta; el asistente responde. */
    async reject(run: ToolRun, signal?: AbortSignal, reason?: string): Promise<TurnOutcome> {
      const target = findEntryWithApproval(run.id) ?? lastAssistantEntry()
      s().upsertToolRun({ ...run, status: 'rejected' })
      s().setFace('thinking')
      const state = continuation(target)
      return consume(state, (onEvent) => deps.api.reject(run.id, reason ? { reason } : {}, onEvent, signal))
    },

    /**
     * Registra un comando local en el historial (y, si el navegador no lo ejecutó, lo ejecuta el
     * servidor). La vista ya muestra lo hecho: solo se alinean ids y se aplican sus eventos.
     */
    async logLocal(request: LocalTurnRequest, ids: { user: string; assistant: string }, signal?: AbortSignal): Promise<LocalTurnResponse | null> {
      try {
        const res = await deps.api.localTurn(request, signal)
        const store = s()
        store.setConversation(res.conversation.id)
        const user = res.messages.find((m) => m.role === 'user')
        const assistant = [...res.messages].reverse().find((m) => m.role === 'assistant')
        if (user) store.renameEntry(ids.user, user.id)
        const entry = assistant?.id ?? ids.assistant
        if (assistant) store.renameEntry(ids.assistant, assistant.id)
        for (const run of res.toolRuns) store.upsertToolRun(run)
        // El navegador no lo resolvió (sin `reply`): lo que diga el servidor es la respuesta.
        if (assistant && request.reply === undefined) {
          const text = messageText(assistant.parts.filter((p) => p.type === 'text'))
          // Sin texto del servidor, lo hecho se ve en la línea de actividad (no queda el «lo hago en el servidor» de antes).
          store.updateEntry(entry, (e) => ({ ...applyParts({ ...e, text: '', parts: undefined }, assistant.parts, s().toolRuns), text: text || (res.toolRuns.length ? '' : e.text), status: 'done' }))
        }
        const state = new StreamState(entry)
        for (const event of res.events) {
          if (event.type === 'turn.started' || event.type === 'message.delta' || event.type === 'message.done') continue
          apply(state, event)
        }
        return res
      } catch (error) {
        if (!isAbort(error) && request.reply === undefined) {
          s().addNotice(ids.assistant, notice('warning', 'local_not_saved', translate(es, 'notices.network')))
          s().updateEntry(ids.assistant, { status: 'error', retryText: request.text })
        }
        return null
      }
    },
  }

  function findEntryWithApproval(runId: string): string | undefined {
    return s().entries.find((e) => e.approvals?.includes(runId))?.id
  }

  function lastAssistantEntry(): string | undefined {
    return [...s().entries].reverse().find((e) => e.role === 'assistant')?.id
  }

  function continuation(target: string | undefined): StreamState {
    const id = target ?? newAssistantEntry()
    const entry = s().entries.find((e) => e.id === id)
    return new StreamState(id, undefined, entry?.parts?.length ? entry.parts : entry?.text ? [entry.text] : [])
  }

  function newAssistantEntry(): string {
    const id = entryId('a')
    s().addEntry({ id, role: 'assistant', text: '', at: Date.now(), status: 'pending', source: 'ai' })
    return id
  }
}

export type TurnRunner = ReturnType<typeof createTurnRunner>
