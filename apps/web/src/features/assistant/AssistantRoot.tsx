/**
 * El asistente en el shell: el botón con su cara en la barra superior (⌘J) y el panel no modal,
 * montado en un portal. El controlador vive aquí (siempre montado), así una tarea sigue aunque
 * cierres el panel. También monta el editor de asistentes y la memoria.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useLocation } from 'react-router'
import { cn } from '../../lib/cn'
import { useT } from '../../lib/i18n'
import { useAssistantStore } from '../../lib/stores'
import { useShortcut } from '../../lib/useShortcut'
import { Notice, Tooltip, Button } from '../../ui'
import { Link } from 'react-router'
import { ApiRequestError } from '../../lib/api'
import { emitBotReaction } from './avatar/reactions'
import { getQuoteEditor, onQuoteEditorChange } from './bridge'
import { resolveApproval, undoReceipt } from './conversation'
import { displayFace, faceLabel } from './face'
import es from './i18n/es'
import { useLocalInterpreter } from './local/useInterpreter'
import { AssistantEditorDialog } from './panel/AssistantEditor'
import { AssistantPanel, MinimizedPill } from './panel/AssistantPanel'
import { BotFace } from './panel/BotFace'
import { MemorySheet } from './panel/MemorySheet'
import { useDockAnchor } from './placement'
import { useAssistantPanel } from './store'
import { suggestionsFor } from './suggestions'
import { useAssistantUi } from './uiState'
import { useAssistantController } from './useAssistant'
import { aiAvailable, assistantAvatar, assistantName, effectiveMode, pickAssistant, useAssistants, useAssistantStatus } from './v2/queries'

/** Ancho que el editor reserva a la derecha cuando el panel flota (400 + 12 de aire). */
export const DESKTOP_INSET = '412px'
/** Alto del pie de totales del editor (TotalsFooter, h-16). */
const EDITOR_FOOTER = 64
/** Aire del marco de la app alrededor de la hoja. */
const FRAME_GAP = 8
/** Estados del proveedor con frase propia en el panel (los que dejan sin IA con la clave ya puesta). */
const PROVIDER_NOTICES = ['key_rejected', 'no_balance', 'model_unavailable', 'token_plan', 'no_network', 'blocked', 'misconfigured'] as const
type ProviderNotice = (typeof PROVIDER_NOTICES)[number]
const hasProviderNotice = (state: string | undefined): state is ProviderNotice => PROVIDER_NOTICES.includes(state as ProviderNotice)

function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {}
      const mql = window.matchMedia(query)
      mql.addEventListener?.('change', onChange)
      return () => mql.removeEventListener?.('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  )
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** ¿Hay red? Lo dice el navegador; un estado que falló sin respuesta del servidor también cuenta. */
function useOnline(statusError: unknown): boolean {
  const online = useSyncExternalStore(subscribeOnline, () => (typeof navigator === 'undefined' ? true : navigator.onLine), () => true)
  return online && !(statusError instanceof TypeError)
}

export function AssistantRoot({ className }: { className?: string }) {
  const t = useT(es)
  const open = useAssistantStore((s) => s.open)
  const setOpen = useAssistantStore((s) => s.setOpen)
  const pendingPrompt = useAssistantStore((s) => s.pendingPrompt)
  const takePrompt = useAssistantStore((s) => s.takePrompt)

  const entries = useAssistantPanel((s) => s.entries)
  const toolRuns = useAssistantPanel((s) => s.toolRuns)
  const draft = useAssistantPanel((s) => s.draft)
  const busy = useAssistantPanel((s) => s.busy)
  const storedFace = useAssistantPanel((s) => s.face)
  const minimized = useAssistantPanel((s) => s.minimized)
  const greeted = useAssistantPanel((s) => s.greeted)
  const chosenAssistant = useAssistantPanel((s) => s.assistantId)
  const chosenMode = useAssistantPanel((s) => s.mode)
  const conversationId = useAssistantPanel((s) => s.conversationId)
  const historyOpen = useAssistantPanel((s) => s.historyOpen)
  const opening = useAssistantPanel((s) => s.opening)
  const epoch = useAssistantPanel((s) => s.epoch)
  const hasMoreBefore = useAssistantPanel((s) => s.hasMoreBefore)
  const fullAccessAck = useAssistantPanel((s) => s.fullAccessAck)
  const panel = useAssistantPanel.getState()

  const editorTarget = useAssistantUi((s) => s.editor)
  const memoryOpen = useAssistantUi((s) => s.memoryOpen)

  const status = useAssistantStatus(true)
  const assistants = useAssistants(true)
  const profile = pickAssistant(assistants.data?.items, chosenAssistant)
  const name = assistantName(profile)
  const avatar = assistantAvatar(profile)
  const ai = aiAvailable(status.data, status.error)
  const mode = effectiveMode(chosenMode, profile, status.data)
  const interpreter = useLocalInterpreter(open, assistants.data?.items)

  const controller = useAssistantController({ interpreter, profile, mode, status: status.data, ai, name })

  const mobile = useMediaQuery('(max-width: 767px)')
  // Editor de escritorio bajo xl: no hay inspector que ceder, así que el panel se acopla en la columna
  // de ventanas (ver placement.ts). En la tableta el editor es una lista y el panel sigue flotando.
  const desktopEditor = useMediaQuery('(min-width: 1024px)')
  const wide = useMediaQuery('(min-width: 1280px)')
  const { pathname } = useLocation()
  const editor = useSyncExternalStore(onQuoteEditorChange, getQuoteEditor, () => null)
  const [focused, setFocused] = useState(false)
  const wantsDock = desktopEditor && !wide && !!editor
  const dockRect = useDockAnchor(open && !minimized && wantsDock, editor)
  const docked = dockRect !== null

  const online = useOnline(status.error instanceof ApiRequestError ? null : status.error)
  const shownFace = displayFace(storedFace, busy, focused && draft.trim().length > 0)
  const face = !online && !busy ? 'offline' : shownFace
  const lastEntry = entries[entries.length - 1]
  const step = lastEntry?.steps?.filter((s) => !s.done).at(-1)?.label ?? lastEntry?.steps?.at(-1)?.label
  const statusText = faceLabel(face, { step, localOnly: ai === false })

  const toggle = useCallback(() => {
    const state = useAssistantStore.getState()
    if (!state.open) {
      useAssistantPanel.getState().setMinimized(false)
      setOpen(true)
    } else if (useAssistantPanel.getState().minimized) useAssistantPanel.getState().setMinimized(false)
    else setOpen(false)
  }, [setOpen])

  useShortcut('mod+j', toggle, { allowInInputs: true })

  const nextAssistant = useCallback(() => {
    const items = assistants.data?.items ?? []
    if (items.length < 2) return
    const index = items.findIndex((a) => a.id === profile?.id)
    controller.setAssistant(items[(index + 1) % items.length].id)
    requestAnimationFrame(() => emitBotReaction('greet'))
  }, [assistants.data, profile?.id, controller])

  // Atajos del panel abierto. Por tecla física: en Mac, Alt cambia la letra que llega.
  const shortcuts = useRef({ nextAssistant, newConversation: controller.newConversation })
  shortcuts.current = { nextAssistant, newConversation: controller.newConversation }
  const panelShown = open && !minimized
  useEffect(() => {
    if (!panelShown) return
    const onKey = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const store = useAssistantPanel.getState()
      if (event.code === 'KeyJ') shortcuts.current.nextAssistant()
      else if (event.code === 'KeyN') shortcuts.current.newConversation()
      else if (event.code === 'KeyH') store.setHistoryOpen(!store.historyOpen)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panelShown])

  // Pregunta enviada desde la paleta ⌘K.
  useEffect(() => {
    if (!open || !pendingPrompt) return
    const prompt = takePrompt()
    if (prompt) {
      useAssistantPanel.getState().setMinimized(false)
      void controller.send(prompt)
    }
  }, [open, pendingPrompt, takePrompt, controller])

  // El editor puede reservar el espacio del panel: padding-right: var(--fz-assistant-inset, 0px).
  // Antes de pintar, para que el lienzo no se encoja un cuadro cuando el panel va a la columna de ventanas.
  useLayoutEffect(() => {
    const root = document.documentElement
    const state = !open ? 'closed' : minimized ? 'minimized' : 'open'
    const place = state !== 'open' || mobile ? 'none' : docked ? 'items' : 'right'
    root.dataset.assistant = state
    root.dataset.assistantPlace = place
    root.style.setProperty('--fz-assistant-inset', place === 'right' ? DESKTOP_INSET : '0px')
    return () => {
      root.style.setProperty('--fz-assistant-inset', '0px')
      delete root.dataset.assistant
      delete root.dataset.assistantPlace
    }
  }, [open, minimized, mobile, docked])

  const onDraft = useCallback((value: string) => {
    const s = useAssistantPanel.getState()
    s.setDraft(value)
    if (s.face === 'error' || s.face === 'done') s.setFace('idle')
  }, [])

  const suggestions = useMemo(() => suggestionsFor(pathname, editor), [pathname, editor, entries.length, busy]) // eslint-disable-line react-hooks/exhaustive-deps
  const lastAssistant = [...entries].reverse().find((e) => e.role === 'assistant')
  const preview = busy || face === 'approval' ? '' : (lastAssistant?.receipts?.at(-1)?.text ?? lastAssistant?.text ?? '')

  // Conexión caída con clave puesta: se dice exactamente qué pasa (el estado real del proveedor).
  const providerState = status.data?.ai.reason === 'provider' ? status.data.ai.provider : undefined
  const providerNotice = hasProviderNotice(providerState) ? (`providerNotices.${providerState}` as const) : null

  const offlineNote =
    ai === false && status.data?.ai.reason === 'no_key' ? (
      <p className="px-0 text-table text-fg-muted">{t('empty.noKey')}</p>
    ) : ai === false ? (
      <Notice
        tone="neutral"
        size="compact"
        action={
          status.data?.ai.reason === 'plan' || status.data?.ai.reason === 'no_credits' || status.data?.ai.reason === 'daily_limit' ? (
            <Button asChild size="xs" variant="ghost">
              <Link to="/ajustes/plan">{t('notices.seePlan')}</Link>
            </Button>
          ) : undefined
        }
      >
        {t(
          providerNotice ??
            (status.data?.ai.reason === 'plan' || status.data?.ai.reason === 'no_key' || status.data?.ai.reason === 'no_credits' || status.data?.ai.reason === 'daily_limit'
              ? `notices.${status.data.ai.reason}`
              : 'notices.unavailable'),
        )}
      </Notice>
    ) : undefined

  const close = () => setOpen(false)
  // Nunca encima de la barra de totales del editor (64 px) ni de la barra inferior del teléfono.
  const bottom = mobile ? `calc(${editor ? 136 : 68}px + env(safe-area-inset-bottom))` : editor ? `${EDITOR_FOOTER + 8}px` : `${FRAME_GAP}px`
  // Segunda hoja dentro del marco: de arriba abajo, con el mismo aire que la hoja principal.
  const panelReserve = FRAME_GAP + (editor && !mobile ? EDITOR_FOOTER + 8 : FRAME_GAP)
  const panelNode = (
    <AnimatePresence>
      {open && (
        <motion.div
          key={minimized ? 'min' : 'panel'}
          // Acoplado en la columna de ventanas entra desde la izquierda; flotando, desde abajo.
          initial={wantsDock && !minimized ? { opacity: 0, x: -8, y: 0 } : { opacity: 0, x: 0, y: mobile ? 24 : 8 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0, ...(docked ? { x: -6 } : { y: mobile ? 16 : 6 }), transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          style={
            dockRect
              ? { transformOrigin: 'left center', left: dockRect.left, top: dockRect.top, width: dockRect.width, height: dockRect.height }
              : { transformOrigin: 'bottom right', bottom: mobile && !minimized ? 0 : bottom }
          }
          className={cn('pointer-events-none fixed z-40 flex', !dockRect && cn('justify-end', mobile ? (minimized ? 'right-3' : 'inset-x-0') : 'right-2'))}
        >
          {minimized ? (
            <MinimizedPill
              name={name}
              avatar={avatar}
              face={face}
              statusText={statusText}
              preview={preview}
              mobile={mobile}
              onExpand={() => useAssistantPanel.getState().setMinimized(false)}
              onClose={close}
            />
          ) : (
            <AssistantPanel
              name={name}
              avatar={avatar}
              face={face}
              statusText={statusText}
              entries={entries}
              toolRuns={toolRuns}
              hasMoreBefore={hasMoreBefore}
              draft={draft}
              busy={busy}
              mobile={mobile}
              docked={docked}
              reserve={panelReserve}
              greet={!greeted}
              suggestions={suggestions}
              interpreter={interpreter}
              ai={ai}
              assistants={assistants.data}
              activeAssistantId={profile?.id ?? null}
              conversationId={conversationId}
              mode={mode}
              allowedModes={status.data?.modes}
              fullAccessAck={fullAccessAck}
              historyOpen={historyOpen}
              opening={opening}
              epoch={epoch}
              offlineNote={offlineNote}
              onDraft={onDraft}
              onSend={(text, options) => void controller.send(text, options)}
              onStop={controller.stop}
              onUndoReceipt={(id) => void undoReceipt(useAssistantPanel, id)}
              onUndoRun={controller.undoToolRun}
              onApprove={controller.approve}
              onApproveAll={(ids) => void controller.approveAll(ids)}
              onReject={controller.reject}
              onLocalApproval={resolveApproval}
              onRetry={(text) => void controller.retry(text)}
              onLoadEarlier={() => void controller.loadEarlier()}
              onMode={controller.setMode}
              onAckFullAccess={panel.ackFullAccess}
              onAssistant={(id) => {
                controller.setAssistant(id)
                requestAnimationFrame(() => emitBotReaction('greet'))
              }}
              onNextAssistant={nextAssistant}
              onCreateAssistant={() => useAssistantUi.getState().openEditor()}
              onEditAssistant={() => useAssistantUi.getState().openEditor(profile?.id)}
              onNewConversation={controller.newConversation}
              onHistory={panel.setHistoryOpen}
              onOpenConversation={(id) => void controller.openConversation(id)}
              onMemory={() => useAssistantUi.getState().setMemoryOpen(true)}
              onMinimize={() => useAssistantPanel.getState().setMinimized(true)}
              onClose={close}
              onFocusChange={setFocused}
              onGreeted={panel.setGreeted}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )

  const shownOpen = open && !minimized
  const label = shownOpen ? t('root.close', { name }) : t('root.open', { name })
  return (
    <>
      <Tooltip content={shownOpen ? t('root.close', { name }) : t('root.tooltip', { name })} shortcut="mod+j" side="bottom">
        <button
          type="button"
          onClick={toggle}
          aria-label={label}
          aria-pressed={shownOpen}
          aria-keyshortcuts="Control+J Meta+J"
          className={cn(
            'group relative inline-flex size-9 items-center justify-center rounded-full transition-colors duration-100 hover:bg-hover touch:size-10',
            shownOpen && 'bg-accent-subtle hover:bg-accent-subtle',
            className,
          )}
        >
          <span className="transition-transform duration-140 ease-out group-hover:scale-[1.04] group-active:scale-[0.96]">
            <BotFace spec={avatar} state={face === 'listening' && !shownOpen ? 'idle' : face} size={28} reactive sleepAfter={shownOpen ? false : 300} />
          </span>
          <span className="sr-only" aria-live="polite">
            {!open && storedFace === 'approval' ? t('root.waiting', { name }) : ''}
          </span>
        </button>
      </Tooltip>
      {typeof document !== 'undefined' ? createPortal(panelNode, document.body) : null}
      <AssistantEditorDialog
        open={editorTarget !== null}
        onOpenChange={(value) => !value && useAssistantUi.getState().closeEditor()}
        assistantId={editorTarget?.id}
        onSaved={(saved) => {
          if (!editorTarget?.id) controller.setAssistant(saved.id)
        }}
      />
      <MemorySheet
        open={memoryOpen}
        onOpenChange={(value) => useAssistantUi.getState().setMemoryOpen(value)}
        assistantId={profile?.id ?? null}
        name={name}
        memoryEnabled={profile?.memoryEnabled ?? true}
        mobile={mobile}
      />
    </>
  )
}
