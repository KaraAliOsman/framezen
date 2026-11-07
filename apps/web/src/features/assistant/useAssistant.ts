/**
 * Controlador del panel del asistente. Decide por cada mensaje:
 * - con IA: siempre un turno en el servidor (flujo SSE), con aprobaciones, deshacer y recargas. El
 *   modelo tiene la conversación completa, así que nada se resuelve por fuera de él;
 * - sin IA (plan básico o IA no disponible): el intérprete del navegador resuelve los comandos.
 * Expone enviar, detener, aprobar/rechazar, deshacer, reintentar, conversación nueva/abrir, modo y
 * asistente.
 */
import { useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import type { AssistantMode, AssistantProfile, AssistantV2Status, Client, LocalToolCall, OrgSettings, Quote, ToolRun, TurnAttachment } from '@dekopen/shared'
import type { AttachmentView } from './attachments/types'
import { api, ApiRequestError, request } from '../../lib/api'
import { useOptionalSession } from '../../lib/auth'
import { getLocale, setLocale, translate } from '../../lib/i18n'
import { describePlan as describePlanInfo } from '../../lib/plan'
import { qk } from '../../lib/queryClient'
import { useOptionalTheme } from '../../lib/theme'
import { setZoom } from '../../lib/zoom'
import { toast } from '../../ui'
import { getOpenTemplate } from '../documents/openTemplate'
import { downloadPdf, fileSlug } from '../documents/output'
import { docFromQuote, saveBody } from '../quotes/model/doc'
import { getQuoteEditor, waitForEditor } from './bridge'
import { declinePendingApprovals } from './conversation'
import type { ExecutorEnv } from './executor'
import es from './i18n/es'
import { isConfident, type LocalInterpreter, type LocalParse } from './local/interpreter'
import { runLocalPlan, type LocalRunDeps } from './local/run'
import { DONE_HOLD_MS } from './local/timing'
import type { LocalToolEnv } from './local/route'
import { storedEffort } from './panel/EffortSwitch'
import { useAssistantSession } from './session'
import { entryId, useAssistantPanel } from './store'
import { useAssistantUi } from './uiState'
import { assistantApi } from './v2/client'
import { refreshAffected, runUiAction } from './v2/effects'
import { entriesFromMessages } from './v2/messages'
import { assistantKeys } from './v2/queries'
import { createTurnRunner, PLAN_CODES } from './v2/turn'

async function downloadCuts(url: string, fileName: string): Promise<void> {
  const ok = await downloadPdf(url, fileName)
  if (!ok) toast.error(translate(es, 'cuts.downloadFailed'))
}

export interface AssistantControllerOptions {
  interpreter: LocalInterpreter
  profile: AssistantProfile | null
  mode: AssistantMode
  status: AssistantV2Status | undefined
  /** ¿Hay IA? undefined = se intenta (el servidor decide). */
  ai: boolean | undefined
  name: string
}

export interface SendOptions {
  /** Ir a la IA aunque el texto parezca un comando («Preguntar a …»). */
  forceAi?: boolean
  /** Interpretación ya calculada por el compositor (la misma que se vio). */
  parse?: LocalParse
  /** Lo que se muestra como mensaje de la persona (una opción elegida muestra su nombre, no el comando completo). */
  display?: string
  /** Archivos ya leídos: siempre van a la IA. */
  attachments?: TurnAttachment[]
  attachmentViews?: AttachmentView[]
}

function uiState(selected?: string | null) {
  const bridge = getQuoteEditor()
  const route = typeof window !== 'undefined' ? window.location.pathname.slice(0, 300) : '/'
  const search = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
  const templateId = (getOpenTemplate()?.id ?? (route.startsWith('/documentos') ? search?.get('plantilla') : undefined))?.slice(0, 64)
  const workOrderId = /^\/taller\/([^/?#]+)/.exec(route)?.[1]?.slice(0, 64)
  const quoteView = bridge?.currentView?.()
  return {
    route,
    ...(bridge ? { quoteId: bridge.quoteId } : {}),
    ...(bridge && (selected ?? bridge.selectedItemId()) ? { selectedItemId: (selected ?? bridge.selectedItemId()) as string } : {}),
    ...(quoteView ? { quoteView } : {}),
    ...(templateId ? { templateId } : {}),
    ...(workOrderId ? { workOrderId } : {}),
    locale: getLocale(),
  }
}

export function useAssistantController(options: AssistantControllerOptions) {
  const navigate = useNavigate()
  const client = useQueryClient()
  const me = useOptionalSession()
  const theme = useOptionalTheme()
  const controller = useRef<AbortController | null>(null)
  const running = useRef<Promise<unknown> | null>(null)
  const latest = useRef(options)
  latest.current = options
  const meRef = useRef(me)
  meRef.current = me

  const settings = useCallback(
    () => client.fetchQuery<OrgSettings>({ queryKey: qk.settings, queryFn: api.settings.get, staleTime: 5 * 60_000 }),
    [client],
  )

  const uiEnv = useMemo(
    () => ({
      navigate: (path: string) => navigate(path),
      getEditor: getQuoteEditor,
      waitForEditor,
      setLocale: (locale: Parameters<typeof setLocale>[0]) => void setLocale(locale),
      setTheme: (value: Parameters<NonNullable<typeof theme>['setTheme']>[0]) => theme?.setTheme(value),
      setZoom,
      downloadCuts,
      openAssistantEditor: () => useAssistantUi.getState().openEditor(latest.current.profile?.id),
      openMemory: () => useAssistantUi.getState().setMemoryOpen(true),
    }),
    [navigate, theme],
  )

  const runner = useMemo(
    () =>
      createTurnRunner({
        store: useAssistantPanel,
        api: assistantApi,
        flush: async () => {
          await getQuoteEditor()?.flush?.()
        },
        onUi: (action) => void runUiAction(action, uiEnv),
        onAffected: (entities) => refreshAffected(entities, { client, getEditor: getQuoteEditor, assistantName: () => latest.current.name }),
        onCredits: () => {
          void client.invalidateQueries({ queryKey: qk.me })
          void client.invalidateQueries({ queryKey: assistantKeys.status })
        },
      }),
    [client, uiEnv],
  )

  const executorEnv = useCallback(
    (approve: ExecutorEnv['approve']): ExecutorEnv => ({
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
        return session.role === 'owner' || !describePlanInfo(session.billing).has('roles')
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
    }),
    [client, navigate, settings],
  )

  const stop = useCallback(() => {
    controller.current?.abort()
    controller.current = null
    declinePendingApprovals()
  }, [])

  // La conversación es de esta persona en esta empresa: otra sesión en la pestaña no la ve ni la reenvía.
  useAssistantSession(me, stop)

  const undoRun = useCallback(
    async (run: ToolRun): Promise<boolean> => {
      const store = useAssistantPanel.getState()
      try {
        const res = await assistantApi.toolRuns.undo(run.id)
        store.upsertToolRun(res.toolRun)
        await refreshAffected(res.affected, { client, getEditor: getQuoteEditor, assistantName: () => latest.current.name })
        return true
      } catch (error) {
        const conflict = error instanceof ApiRequestError && (error.status === 409 || error.code === 'undo_conflict')
        toast.error(conflict ? translate(es, 'activity.undoConflict') : translate(es, 'activity.undoFailed', { reason: error instanceof Error ? error.message : '' }).trim())
        return false
      }
    },
    [client],
  )

  const newConversation = useCallback(() => {
    stop()
    useAssistantPanel.getState().reset()
  }, [stop])

  const setMode = useCallback((mode: AssistantMode) => {
    const store = useAssistantPanel.getState()
    store.setMode(mode)
    if (store.conversationId) void assistantApi.conversations.patch(store.conversationId, { mode }).catch(() => undefined)
  }, [])

  const setAssistant = useCallback(
    (id: string) => {
      const store = useAssistantPanel.getState()
      if (store.assistantId === id) return
      stop()
      store.setAssistant(id)
      // Cambiar de asistente empieza una conversación nueva (su memoria y su personalidad son otras).
      store.reset()
    },
    [stop],
  )

  const tools = useMemo<LocalToolEnv>(
    () => ({
      ...uiEnv,
      panel: { switchAssistant: setAssistant, setMode, newConversation },
      downloadQuotePdf: async (quoteId, number) => downloadPdf(`/api/quotes/${encodeURIComponent(quoteId)}/pdf`, `${fileSlug(`${translate(es, 'local.pdfName')} ${number || ''}`)}.pdf`),
      printQuotePdf: (quoteId) => {
        window.open(`/api/quotes/${encodeURIComponent(quoteId)}/pdf`, '_blank', 'noopener,noreferrer')
      },
      setQuoteMargin: async (target, margin) => {
        const bridge = getQuoteEditor()
        let id = target.quoteId
        if (!id && target.number !== undefined) {
          if (bridge && bridge.getQuote().number === target.number) id = bridge.quoteId
          else id = (await api.quotes.list({ q: String(target.number) })).find((q) => q.number === target.number)?.id
        }
        if (!id && target.number === undefined) id = bridge?.quoteId
        if (!id) return { ok: false, message: translate(es, 'executor.needQuote') }
        const open = bridge?.quoteId === id
        try {
          if (open) await bridge?.flush?.()
          const quote = await api.quotes.get(id)
          const doc = docFromQuote(quote)
          const saved = await api.quotes.save(id, saveBody({ ...doc, pricing: { ...doc.pricing, marginMode: margin.mode, marginPct: margin.percent } }, { status: quote.status, version: quote.version }))
          client.setQueryData<Quote>(qk.quote(id), saved)
          void client.invalidateQueries({ queryKey: ['quotes'] })
          if (open) await bridge?.refreshFromServer?.(latest.current.name)
          return { ok: true }
        } catch (error) {
          return { ok: false, message: error instanceof Error ? error.message : undefined }
        }
      },
    }),
    [uiEnv, setAssistant, setMode, newConversation, client],
  )

  const localDeps = useMemo<LocalRunDeps>(
    () => ({
      store: useAssistantPanel,
      env: executorEnv,
      remember: async (content) => {
        await assistantApi.memories.create({ content, scope: 'assistant', kind: 'fact', ...(latest.current.profile ? { assistantId: latest.current.profile.id } : {}) })
        void client.invalidateQueries({ queryKey: assistantKeys.memoriesAll })
      },
      undoLastServerRun: async () => {
        const runs = Object.values(useAssistantPanel.getState().toolRuns)
          .filter((r) => r.status === 'executed' && r.undoable)
          .sort((a, b) => ((a.executedAt ?? a.createdAt) < (b.executedAt ?? b.createdAt) ? 1 : -1))
        const last = runs[0]
        if (!last) return null
        const ok = await undoRun(last)
        return ok ? (last.preview?.title ?? last.tool.replace(/_/g, ' ')) : null
      },
      tools,
    }),
    [client, executorEnv, undoRun, tools],
  )

  /** Para que «Reintentar» vuelva a mandar los archivos, no solo el texto. */
  const lastFiles = useRef<{ text: string; attachments: TurnAttachment[]; views: AttachmentView[] } | null>(null)

  const send = useCallback(
    async (raw: string, sendOptions: SendOptions = {}) => {
      const text = raw.trim()
      const files = sendOptions.attachments?.length ? sendOptions.attachments : undefined
      if (!text && !files) return
      lastFiles.current = files ? { text, attachments: files, views: sendOptions.attachmentViews ?? [] } : null
      const shown = sendOptions.display?.trim() || text
      const store = useAssistantPanel.getState()
      store.setDraft('')
      // Escribir algo nuevo responde «no» a una aprobación del ejecutor y corta el turno anterior.
      if (store.busy) {
        stop()
        await running.current?.catch(() => undefined)
      }
      const opts = latest.current
      const parse = sendOptions.parse ?? opts.interpreter.parse(text)
      const ctrl = new AbortController()
      controller.current = ctrl
      const base = {
        ...(useAssistantPanel.getState().conversationId ? { conversationId: useAssistantPanel.getState().conversationId! } : {}),
        ...(opts.profile ? { assistantId: opts.profile.id } : {}),
        text: shown.slice(0, 4000),
        ...(files ? { attachments: files } : {}),
        mode: opts.mode,
        effort: storedEffort(),
        ui: uiState(),
        clientTurnId: entryId('t'),
      }

      const job = (async () => {
        // Los comandos del intérprete son para las cuentas sin IA. Con IA responde siempre el modelo.
        const localOnly = opts.ai === false && !sendOptions.forceAi
        // 1. Comando local seguro: se ejecuta aquí, gratis.
        if (localOnly && !files && isConfident(parse)) {
          const plan = { calls: parse.plan ?? [], interpretation: parse.interpretation, reply: parse.reply, notes: parse.notes }
          const result = await runLocalPlan(shown, plan, localDeps, ctrl.signal)
          // Sin asistente v2 en el servidor: el comando ya quedó hecho; no hay historial que alimentar.
          if (opts.ai === false && !opts.status && !result.serverCalls.length) return
          // El servidor solo ejecuta lo que el navegador no pudo hacer; lo demás (ya hecho aquí) solo se anota en el historial.
          const logged = runner.logLocal(
            {
              ...base,
              // Los comandos locales son órdenes directas de la persona (como un clic): el modo limita a la IA, no a ellas.
              mode: 'full',
              plan: { interpretation: parse.interpretation.slice(0, 500), calls: result.serverCalls.slice(0, 24), confidence: parse.confidence },
              ...(result.reply !== undefined ? { reply: result.reply.slice(0, 4000) } : {}),
            },
            { user: result.userEntry, assistant: result.assistantEntry },
            result.serverCalls.length ? ctrl.signal : undefined,
          )
          if (result.serverCalls.length) {
            useAssistantPanel.getState().setBusy(true)
            const response = await logged
            const state = useAssistantPanel.getState()
            state.setBusy(false)
            state.updateEntry(result.assistantEntry, (e) => (e.status === 'pending' ? { status: 'done' } : {}))
            // El servidor termina con la cara «trabajando»: queda «listo» (o esperando una aprobación) y vuelve a reposo.
            const waiting = response?.toolRuns.some((r) => r.status === 'proposed') ?? false
            const failedRun = response?.toolRuns.some((r) => r.status === 'failed') ?? false
            state.setFace(waiting ? 'approval' : failedRun ? 'error' : 'done')
            if (!waiting) {
              setTimeout(() => {
                const now = useAssistantPanel.getState()
                if ((now.face === 'done' || now.face === 'error') && !now.busy) now.setFace('idle')
              }, DONE_HOLD_MS)
            }
          }
          return
        }

        // 1b. Entendí el comando pero falta un dato (o hay dudas): pregunto aquí, gratis, sin gastar IA.
        // Una lectura dudosa (palabra a medio escribir, coincidencia de otro idioma) muestra «Entendí: …» y
        // pregunta con las lecturas alternativas: nunca se ejecuta ni se manda a la IA sin confirmar.
        const doubtful = parse.status === 'ambiguous' && !parse.missing.length && !!parse.repairs?.length
        if (localOnly && (parse.status === 'incomplete' || parse.status === 'ambiguous') && (parse.missing.length || doubtful)) {
          // Los avisos del motor ya son preguntas completas («¿Qué tipología? Por ejemplo…»).
          const reply = parse.missing.length ? parse.missing.join(' ') : parse.repairs!.map((r) => r.label).join(' ')
          const result = await runLocalPlan(
            shown,
            { calls: [], interpretation: parse.interpretation, reply, ...(parse.notes ? { notes: parse.notes } : {}), ...(parse.choices ? { quickReplies: parse.choices } : {}) },
            localDeps,
            ctrl.signal,
          )
          if (opts.status) void runner.logLocal({ ...base, mode: 'full', plan: { interpretation: parse.interpretation.slice(0, 500), calls: [], confidence: parse.confidence }, reply }, { user: result.userEntry, assistant: result.assistantEntry })
          return
        }

        // 2. Sin IA: respuesta local honesta (qué entiendo) con el motivo y la salida.
        if (opts.ai === false) {
          const reason = opts.status?.ai.reason ?? 'unavailable'
          const reply = `${translate(es, 'composer.noMatch')} ${translate(es, 'local.help')}`
          const result = await runLocalPlan(text, { calls: [], interpretation: '', reply }, localDeps, ctrl.signal)
          const code = PLAN_CODES.has(reason) || reason === 'no_key' ? reason : 'ai_unavailable'
          const noticeKey = (reason === 'plan' || reason === 'no_key' || reason === 'no_credits' || reason === 'daily_limit' ? reason : 'unavailable') as
            | 'plan'
            | 'no_key'
            | 'no_credits'
            | 'daily_limit'
            | 'unavailable'
          useAssistantPanel.getState().addNotice(result.assistantEntry, { id: entryId('n'), level: 'warning', code, text: translate(es, `notices.${noticeKey}`) })
          if (opts.status) void runner.logLocal({ ...base, plan: { interpretation: '', calls: [], confidence: 0 }, reply }, { user: result.userEntry, assistant: result.assistantEntry })
          return
        }

        // 3. Turno con IA en el servidor.
        await runner.run(base, ctrl.signal, sendOptions.attachmentViews?.length ? { attachments: sendOptions.attachmentViews } : {})
        void client.invalidateQueries({ queryKey: assistantKeys.status })
        void client.invalidateQueries({ queryKey: assistantKeys.conversationsAll })
      })()
      running.current = job
      try {
        await job
      } finally {
        if (controller.current === ctrl) controller.current = null
      }
    },
    [client, localDeps, runner, stop],
  )

  const approve = useCallback(
    async (runId: string) => {
      const run = useAssistantPanel.getState().toolRuns[runId]
      if (!run || run.status !== 'proposed') return
      const ctrl = new AbortController()
      controller.current = ctrl
      const job = runner.approve(run, ctrl.signal)
      running.current = job
      await job
      if (controller.current === ctrl) controller.current = null
    },
    [runner],
  )

  /** Una lista de ventanas llega como varias propuestas: se aprueban en orden, de una vez. */
  const approveAll = useCallback(
    async (runIds: readonly string[]) => {
      for (const id of runIds) await approve(id)
    },
    [approve],
  )

  const reject = useCallback(
    async (runId: string) => {
      const run = useAssistantPanel.getState().toolRuns[runId]
      if (!run || run.status !== 'proposed') return
      const ctrl = new AbortController()
      controller.current = ctrl
      const job = runner.reject(run, ctrl.signal)
      running.current = job
      await job
      if (controller.current === ctrl) controller.current = null
    },
    [runner],
  )

  const undoToolRun = useCallback(
    async (runId: string) => {
      const run = useAssistantPanel.getState().toolRuns[runId]
      if (run) await undoRun(run)
    },
    [undoRun],
  )

  const retry = useCallback(
    (text: string) => {
      const files = lastFiles.current
      return files ? send(files.text, { forceAi: true, attachments: files.attachments, attachmentViews: files.views }) : send(text, { forceAi: true })
    },
    [send],
  )

  const openConversation = useCallback(
    async (id: string) => {
      stop()
      const store = useAssistantPanel.getState()
      store.setHistoryOpen(false)
      store.setOpening(true)
      try {
        const detail = await assistantApi.conversations.get(id)
        useAssistantPanel.getState().loadConversation({
          conversationId: detail.conversation.id,
          mode: detail.conversation.mode,
          entries: entriesFromMessages(detail.messages, detail.toolRuns),
          toolRuns: detail.toolRuns,
          hasMoreBefore: detail.hasMoreBefore,
        })
        if (detail.conversation.assistantId) useAssistantPanel.getState().setAssistant(detail.conversation.assistantId)
      } catch {
        toast.error(translate(es, 'notices.resumeFailed'))
      } finally {
        useAssistantPanel.getState().setOpening(false)
      }
    },
    [stop],
  )

  const loadEarlier = useCallback(async () => {
    const store = useAssistantPanel.getState()
    const id = store.conversationId
    if (!id) return
    const seqs = store.entries.map((e) => e.seq).filter((n): n is number => typeof n === 'number')
    try {
      const page = await assistantApi.conversations.messages(id, seqs.length ? Math.min(...seqs) : undefined)
      useAssistantPanel.getState().prependEntries(entriesFromMessages(page.messages, Object.values(store.toolRuns)), page.hasMoreBefore)
    } catch {
      toast.error(translate(es, 'notices.resumeFailed'))
    }
  }, [])

  return { send, stop, approve, approveAll, reject, undoToolRun, retry, newConversation, openConversation, loadEarlier, setMode, setAssistant }
}

export type AssistantController = ReturnType<typeof useAssistantController>
