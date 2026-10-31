/**
 * Controlador del panel de Marco: arma el entorno real del ejecutor (puente del editor, API,
 * navegación) y expone enviar, detener, deshacer, aprobar y empezar de nuevo.
 */
import { useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { isUndoCommand, type AssistantChatRequest, type AssistantChatResponse, type Client, type OrgSettings, type Quote } from '@framezen/shared'
import { api, request } from '../../lib/api'
import { useOptionalSession } from '../../lib/auth'
import { describePlan } from '../../lib/plan'
import { qk } from '../../lib/queryClient'
import { getQuoteEditor, onQuoteEditorChange, type QuoteEditorBridge } from './bridge'
import { declinePendingApprovals, lastUndoable, resolveApproval, runTurn, undoReceipt, type ConversationDeps } from './conversation'
import type { ExecutorEnv } from './executor'
import { useMarcoSession } from './session'
import { entryId, useMarcoStore } from './store'
import { buildAssistantContext, buildLocalContext } from './summary'

export const CHAT_TIMEOUT_MS = 45_000

export function waitForEditor(quoteId: string, timeoutMs: number): Promise<QuoteEditorBridge> {
  return new Promise((resolve, reject) => {
    const now = getQuoteEditor()
    if (now?.quoteId === quoteId) return resolve(now)
    const timer = setTimeout(() => {
      off()
      reject(new Error('El editor no respondió a tiempo.'))
    }, timeoutMs)
    const off = onQuoteEditorChange((bridge) => {
      if (bridge?.quoteId === quoteId) {
        clearTimeout(timer)
        off()
        resolve(bridge)
      }
    })
  })
}

/** POST /api/assistant/chat con tiempo máximo propio (el servidor ya acota la IA). */
export async function chatTransport(body: AssistantChatRequest, signal: AbortSignal): Promise<AssistantChatResponse> {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, CHAT_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    return await request<AssistantChatResponse>('/assistant/chat', { method: 'POST', body, signal: controller.signal, retry: 0 })
  } catch (error) {
    if (timedOut && !signal.aborted) {
      const timeout = new Error('Marco tardó demasiado en responder.')
      timeout.name = 'TimeoutError'
      throw timeout
    }
    throw error
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
}

export function useMarco() {
  const navigate = useNavigate()
  const client = useQueryClient()
  const me = useOptionalSession()
  const controller = useRef<AbortController | null>(null)
  const running = useRef<Promise<void> | null>(null)
  const meRef = useRef(me)
  meRef.current = me

  const settings = useCallback(
    () => client.fetchQuery<OrgSettings>({ queryKey: qk.settings, queryFn: api.settings.get, staleTime: 5 * 60_000 }),
    [client],
  )

  const deps = useMemo<ConversationDeps>(() => {
    const env = (approve: ExecutorEnv['approve']): ExecutorEnv => ({
      getEditor: getQuoteEditor,
      waitForEditor,
      navigate: (path) => navigate(path),
      currentPath: () => window.location.pathname,
      defaults: async () => (await settings()).defaults ?? {},
      pricing: async () => {
        const s = await settings()
        return { pricing: s.pricing, cut: s.cut }
      },
      canSeeCosts: () => {
        const session = meRef.current
        if (!session) return false
        return session.role === 'owner' || !describePlan(session.billing).has('roles')
      },
      api: {
        createQuote: async (body) => {
          const quote = await api.quotes.create(body)
          client.setQueryData<Quote>(qk.quote(quote.id), quote)
          void client.invalidateQueries({ queryKey: ['quotes'] })
          return quote
        },
        getQuote: (id) => api.quotes.get(id),
        removeQuote: async (id) => {
          await api.quotes.remove(id)
          void client.invalidateQueries({ queryKey: ['quotes'] })
        },
        listQuotes: (q) => api.quotes.list({ q }),
        listClients: (q) => api.clients.list(q),
        createClient: async (input) => {
          const created: Client = await api.clients.create(input)
          void client.invalidateQueries({ queryKey: ['clients'] })
          return created
        },
        sendQuote: async (id, body) => {
          const res = await request<{ url?: string; revisionLabel?: string }>(`/quotes/${encodeURIComponent(id)}/send`, { method: 'POST', body })
          void client.invalidateQueries({ queryKey: ['quotes'] })
          void client.invalidateQueries({ queryKey: qk.quote(id) })
          return res
        },
      },
      approve,
      copyText: async (text) => {
        await navigator.clipboard?.writeText(text)
      },
      openUrl: (url) => {
        window.open(url, '_blank', 'noopener,noreferrer')
      },
    })
    return {
      transport: chatTransport,
      env,
      context: () => {
        const cached = client.getQueryData<OrgSettings>(qk.settings)
        return buildAssistantContext(window.location.pathname, getQuoteEditor(), { defaults: cached?.defaults, pricing: cached?.pricing, cut: cached?.cut })
      },
      localContext: () => buildLocalContext(window.location.pathname, getQuoteEditor()),
      store: useMarcoStore,
      onCredits: () => void client.invalidateQueries({ queryKey: qk.me }),
    }
  }, [client, navigate, settings])

  const stop = useCallback(() => {
    controller.current?.abort()
    declinePendingApprovals()
  }, [])

  // La conversación es de esta persona en esta empresa: otra sesión en la pestaña no la ve ni la reenvía.
  useMarcoSession(me, stop)

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim()
      if (!text) return
      const store = useMarcoStore.getState()
      store.setDraft('')
      // Escribir algo nuevo responde «no» a una aprobación pendiente y corta el turno anterior.
      if (store.busy) {
        stop()
        await running.current?.catch(() => {})
      }
      if (isUndoCommand(text)) {
        const last = lastUndoable(useMarcoStore.getState().entries)
        const s = useMarcoStore.getState()
        s.addEntry({ id: entryId('u'), role: 'user', text, at: Date.now() })
        const ok = last ? undoReceipt(useMarcoStore, last.id) : false
        s.addEntry({
          id: entryId('a'),
          role: 'assistant',
          text: ok && last ? `Deshice: ${last.text.charAt(0).toLowerCase()}${last.text.slice(1)}.` : 'No tengo nada reciente que deshacer. En el editor también funciona Ctrl+Z.',
          at: Date.now(),
          status: 'done',
        })
        s.setMarco(ok ? 'done' : 'idle')
        return
      }
      const ctrl = new AbortController()
      controller.current = ctrl
      const turn = runTurn(text, deps, ctrl.signal)
      running.current = turn
      await turn
      if (controller.current === ctrl) controller.current = null
    },
    [deps, stop],
  )

  const undo = useCallback((receiptId: string) => undoReceipt(useMarcoStore, receiptId), [])
  const answerApproval = useCallback((entry: string, ok: boolean) => resolveApproval(entry, ok), [])
  const newConversation = useCallback(() => {
    stop()
    useMarcoStore.getState().reset()
  }, [stop])

  return { send, stop, undo, answerApproval, newConversation }
}
