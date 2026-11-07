/**
 * Ejecuta un plan local (cero créditos): las herramientas del editor y de la interfaz corren aquí
 * mismo, a través del puente del editor (se ve el cambio y entra a su deshacer); recordar va a la
 * memoria del servidor; lo que solo sabe hacer el servidor se le pide sin IA (local-turns).
 */
import { type AssistantToolCall, type LocalToolCall } from '@dekopen/shared'
import { getFormatter, translate } from '../../../lib/i18n'
import { composeLocalReply, lastUndoable, registerApproval, resolveApproval, undoReceipt, undoRegistry } from '../conversation'
import { createExecutor, stepLabel, type ExecutorEnv, type ToolOutcome } from '../executor'
import es from '../i18n/es'
import { entryId, type AssistantPanelStore } from '../store'
import type { ApprovalRequest, ChatEntry, QuickReply, ReceiptView, StepView } from '../types'
import { routeOf, runPanelCall, runUiCall, type LocalToolEnv, type UiCallResult } from './route'
import { DONE_HOLD_MS } from './timing'

export interface LocalRunDeps {
  store: { getState(): AssistantPanelStore }
  /** Entorno del ejecutor; `approve` lo provee el turno (tarjeta en el panel). */
  env(approve: (request: ApprovalRequest) => Promise<boolean>): ExecutorEnv
  /** Guarda un recuerdo explícito («recuerda que…»). */
  remember(content: string): Promise<void>
  /** Deshace la última acción del asistente hecha en el servidor (si no hay recibo local). */
  undoLastServerRun(): Promise<string | null>
  /** Interfaz, panel y margen: lo que no es del editor ni del servidor. */
  tools: LocalToolEnv
}

/** «Ajustes y precios» a la vez: el servidor las recibe como dos llamadas. */
function splitServerCall(call: LocalToolCall): LocalToolCall[] {
  const a = call.args ?? {}
  if (call.tool === 'update_settings' && typeof a.currency === 'string' && (typeof a.document_locale === 'string' || typeof a.locale === 'string')) {
    const { currency, ...rest } = a
    return [
      { ...call, args: rest },
      { id: `${call.id}c`, tool: 'update_settings', args: { currency } },
    ]
  }
  return [call]
}

const NAV_PLACES = ['home', 'quotes', 'clients', 'workshop', 'catalog', 'documents', 'settings', 'pricing', 'plan', 'team'] as const
const SECTIONS = ['empresa', 'precios', 'taller', 'equipo', 'plan', 'idioma', 'asistentes', 'ia', 'plantillas', 'texturas', 'colores'] as const

/** Frase de lo que pasó con una instrucción de interfaz. */
function uiSay(call: LocalToolCall, result: UiCallResult): string {
  if (!result.ok) {
    if (result.problem === 'no_quote') return translate(es, 'local.noQuote')
    if (result.problem === 'no_item') return translate(es, 'local.noItem')
    if (result.problem === 'pdf_failed') return translate(es, 'local.pdfFailed')
    return translate(es, 'local.couldNot')
  }
  if (call.tool === 'navigate' || call.tool === 'open_client') {
    const [to, section] = (result.place ?? '').split(':')
    if (section && (SECTIONS as readonly string[]).includes(section)) return translate(es, 'local.wentTo', { place: translate(es, `nav.sections.${section as (typeof SECTIONS)[number]}`) })
    if ((NAV_PLACES as readonly string[]).includes(to)) return translate(es, 'local.wentTo', { place: translate(es, `nav.${to as (typeof NAV_PLACES)[number]}`) })
    return translate(es, 'local.done')
  }
  if (call.tool === 'download_pdf') return translate(es, call.args?.print === true ? 'local.printing' : 'local.pdfReady')
  return translate(es, 'local.done')
}

export interface LocalRunResult {
  userEntry: string
  assistantEntry: string
  /** Respuesta ya armada (todo se resolvió en el navegador) o undefined si queda para el servidor. */
  reply?: string
  /** Llamadas que solo el servidor sabe hacer (se envían en local-turns sin `reply`). */
  serverCalls: LocalToolCall[]
}

function toAssistantCall(call: LocalToolCall): AssistantToolCall {
  return { id: call.id, name: call.tool, arguments: JSON.stringify(call.args ?? {}) } as AssistantToolCall
}

/** Corre el plan y deja en la conversación la entrada de la persona y la respuesta. Nunca lanza. */
export async function runLocalPlan(
  text: string,
  plan: { calls: LocalToolCall[]; interpretation: string; reply?: string; notes?: string[]; quickReplies?: QuickReply[] },
  deps: LocalRunDeps,
  signal?: AbortSignal,
): Promise<LocalRunResult> {
  const s = () => deps.store.getState()
  const now = Date.now()
  const userEntry = entryId('u')
  const assistantEntry = entryId('a')
  s().addEntry({ id: userEntry, role: 'user', text, at: now, source: 'local' })
  s().addEntry({ id: assistantEntry, role: 'assistant', text: '', at: now, status: 'pending', source: 'local', interpretation: plan.interpretation, credits: 0 })
  const update = (patch: Partial<ChatEntry> | ((e: ChatEntry) => Partial<ChatEntry>)) => s().updateEntry(assistantEntry, patch)

  if (plan.reply !== undefined && !plan.calls.length) {
    update({ text: plan.reply, status: 'done', ...(plan.quickReplies?.length ? { quickReplies: plan.quickReplies } : {}), ...(plan.notes?.length ? { notes: plan.notes } : {}) })
    return { userEntry, assistantEntry, reply: plan.reply, serverCalls: [] }
  }

  s().setBusy(true)
  s().setFace('working')
  const approve = (request: ApprovalRequest) =>
    new Promise<boolean>((resolve) => {
      s().setApproval(assistantEntry, { ...request, id: entryId('ok'), status: 'pending' })
      s().setFace('approval')
      registerApproval(assistantEntry, (ok) => {
        const current = s().entries.find((e) => e.id === assistantEntry)?.approval
        if (current) s().setApproval(assistantEntry, { ...current, status: ok ? 'approved' : 'declined' })
        s().setFace('working')
        resolve(ok)
      })
      signal?.addEventListener('abort', () => resolveApproval(assistantEntry, false), { once: true })
    })
  const executor = createExecutor(deps.env(approve))
  const says: string[] = []
  const outcomes: ToolOutcome[] = []
  const serverCalls: LocalToolCall[] = []
  const deferred: (() => void)[] = []
  let failed = false

  try {
    for (const call of plan.calls) {
      if (signal?.aborted) break
      const bridge = deps.tools.getEditor()
      const route = routeOf(call, bridge ? { id: bridge.quoteId, number: bridge.getQuote().number } : null)
      if (route === 'undo') {
        const last = lastUndoable(s().entries)
        if (last && undoReceipt(deps.store, last.id)) says.push(translate(es, 'local.undone', { text: `${last.text.charAt(0).toLocaleLowerCase()}${last.text.slice(1)}` }))
        else {
          const undone = await deps.undoLastServerRun()
          says.push(undone ? translate(es, 'local.undone', { text: undone }) : translate(es, 'local.nothingToUndo'))
        }
        continue
      }
      if (route === 'redo') {
        says.push(translate(es, 'local.redo'))
        continue
      }
      if (route === 'remember') {
        const content = typeof call.args?.content === 'string' ? call.args.content.trim() : ''
        if (!content) continue
        try {
          await deps.remember(content)
          says.push(translate(es, 'local.remembered', { text: content }))
        } catch {
          failed = true
          says.push(translate(es, 'local.rememberFailed'))
        }
        continue
      }
      if (route === 'help') {
        says.push(translate(es, 'local.help'))
        continue
      }
      if (route === 'ui') {
        const result = await runUiCall(call, deps.tools)
        if (!result.ok) failed = true
        says.push(uiSay(call, result))
        continue
      }
      if (route === 'panel') {
        // Cambiar de asistente o empezar otra conversación limpia la vista: se hace al final.
        if (call.tool === 'set_assistant_mode') {
          if (runPanelCall(call, deps.tools)) says.push(translate(es, 'local.modeSet', { mode: translate(es, `modes.${String(call.args?.mode) as 'chat' | 'supervised' | 'full'}`) }))
        } else deferred.push(() => runPanelCall(call, deps.tools))
        continue
      }
      if (route === 'margin') {
        const percent = typeof call.args?.percent === 'number' ? call.args.percent : NaN
        const mode = call.args?.mode === 'markup' ? 'markup' : 'margin'
        const target = { ...(typeof call.args?.quoteId === 'string' ? { quoteId: call.args.quoteId } : {}), ...(typeof call.args?.number === 'number' ? { number: call.args.number } : {}) }
        const result = Number.isFinite(percent) ? await deps.tools.setQuoteMargin(target, { percent, mode }) : { ok: false }
        if (!result.ok) failed = true
        says.push(result.ok ? translate(es, 'local.marginSet', { pct: getFormatter().pct(percent) }) : (result.message ?? translate(es, 'local.couldNot')))
        continue
      }
      if (route === 'server') {
        serverCalls.push(...splitServerCall(call))
        continue
      }
      const [outcome] = await executor.run([toAssistantCall(call)], {
        signal,
        onStep: (c, result) => {
          const stepId = `${assistantEntry}:${c.id}`
          update((e) => {
            const steps: StepView[] = [...(e.steps ?? [])]
            const index = steps.findIndex((st) => st.id === stepId)
            if (!result) {
              if (index < 0) steps.push({ id: stepId, label: stepLabel(c.name), done: false })
            } else if (index >= 0) steps[index] = { ...steps[index], done: true }
            return { steps }
          })
        },
      })
      if (!outcome) continue
      outcomes.push(outcome)
      if (!outcome.ok) failed = true
      if (outcome.receipts.length) {
        for (const r of outcome.receipts) if (r.undo) undoRegistry.set(r.id, r.undo)
        const views: ReceiptView[] = outcome.receipts.map((r) => ({ id: r.id, text: r.text, undoable: Boolean(r.undo) }))
        update((e) => ({ receipts: [...(e.receipts ?? []), ...views] }))
      }
      const card = outcome.card
      if (card) update((e) => ({ cards: [...(e.cards ?? []), card] }))
    }

    const executed = outcomes.length ? composeLocalReply(outcomes) : ''
    const reply = [...says, executed].filter(Boolean).join(' ')
    const notes = [...(plan.notes ?? []), ...outcomes.flatMap((o) => o.notes)]
    const pendingServer = serverCalls.length > 0
    update((e) => ({
      text: reply || (pendingServer ? translate(es, 'local.serverOnly') : e.text),
      status: signal?.aborted ? 'stopped' : pendingServer ? 'pending' : 'done',
      steps: undefined,
      ...(notes.length ? { notes: [...new Set([...(e.notes ?? []), ...notes])] } : {}),
    }))
    s().setFace(signal?.aborted ? 'idle' : failed ? 'error' : 'done')
    const at = Date.now()
    setTimeout(() => {
      const state = s()
      if ((state.face === 'done' || state.face === 'error') && !state.busy && at <= Date.now()) state.setFace('idle')
    }, DONE_HOLD_MS)
    for (const run of deferred) run()
    return { userEntry, assistantEntry, reply: pendingServer ? undefined : reply, serverCalls }
  } finally {
    s().setBusy(false)
  }
}
