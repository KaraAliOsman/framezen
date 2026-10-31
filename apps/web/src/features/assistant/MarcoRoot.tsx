/**
 * Marco en el shell: el botón con su cara en la barra superior (⌘J) y el panel no modal, montado en
 * un portal. El controlador vive aquí (siempre montado), así una tarea sigue aunque cierres el panel.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import type { AssistantStatus } from '@framezen/shared'
import { request } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useAssistantStore } from '../../lib/stores'
import { useShortcut } from '../../lib/useShortcut'
import { Tooltip } from '../../ui'
import { MarcoAvatar, type MarcoState } from './avatar'
import { getQuoteEditor, onQuoteEditorChange } from './bridge'
import { MarcoMinimized, MarcoPanel, statusLine, type ModeInfo } from './panel/MarcoPanel'
import { useDockAnchor } from './placement'
import { useMarcoStore } from './store'
import { suggestionsFor } from './suggestions'
import { useMarco } from './useMarco'

const DESKTOP_INSET = '380px'
/** Alto del pie de totales del editor (TotalsFooter, h-16). */
const EDITOR_FOOTER = 64

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

/** Estado visible del avatar: escuchando mientras escribes, salvo que esté ocupado o esperando. */
export function displayFace(marco: MarcoState, busy: boolean, typing: boolean): MarcoState {
  if (busy || marco === 'approval' || marco === 'thinking' || marco === 'working') return marco
  if (typing) return 'listening'
  return marco
}

export function MarcoRoot({ className }: { className?: string }) {
  const open = useAssistantStore((s) => s.open)
  const setOpen = useAssistantStore((s) => s.setOpen)
  const pendingPrompt = useAssistantStore((s) => s.pendingPrompt)
  const takePrompt = useAssistantStore((s) => s.takePrompt)

  const entries = useMarcoStore((s) => s.entries)
  const draft = useMarcoStore((s) => s.draft)
  const busy = useMarcoStore((s) => s.busy)
  const marco = useMarcoStore((s) => s.marco)
  const minimized = useMarcoStore((s) => s.minimized)
  const storeMode = useMarcoStore((s) => s.mode)
  const storeReason = useMarcoStore((s) => s.reason)
  const storeCredits = useMarcoStore((s) => s.credits)
  const greeted = useMarcoStore((s) => s.greeted)
  const { setDraft, setMinimized, setMarco, setGreeted } = useMarcoStore.getState()

  const marcoApi = useMarco()
  const mobile = useMediaQuery('(max-width: 767px)')
  // Editor de escritorio bajo xl: no hay inspector que ceder, así que Marco se acopla en la columna
  // de ventanas (ver placement.ts). En la tableta el editor es una lista y el panel sigue flotando.
  const desktopEditor = useMediaQuery('(min-width: 1024px)')
  const wide = useMediaQuery('(min-width: 1280px)')
  const { pathname } = useLocation()
  const editor = useSyncExternalStore(onQuoteEditorChange, getQuoteEditor, () => null)
  const [focused, setFocused] = useState(false)
  const wantsDock = desktopEditor && !wide && !!editor
  const dockRect = useDockAnchor(open && !minimized && wantsDock, editor)
  const docked = dockRect !== null

  const status = useQuery({
    queryKey: ['assistant-status'],
    queryFn: () => request<AssistantStatus>('/assistant/status'),
    enabled: open,
    staleTime: 60_000,
    retry: false,
  })

  const face = displayFace(marco, busy, focused && draft.trim().length > 0)
  const statusText = statusLine(face, entries)
  const mode: ModeInfo = {
    mode: storeMode ?? status.data?.mode ?? null,
    reason: storeMode ? storeReason : (status.data?.reason ?? null),
    credits: storeCredits ?? status.data?.creditsLeft ?? null,
  }

  const toggle = useCallback(() => {
    const state = useAssistantStore.getState()
    if (!state.open) {
      setMinimized(false)
      setOpen(true)
    } else if (useMarcoStore.getState().minimized) setMinimized(false)
    else setOpen(false)
  }, [setMinimized, setOpen])

  useShortcut('mod+j', toggle, { allowInInputs: true })

  // Pregunta enviada desde la paleta ⌘K.
  useEffect(() => {
    if (!open || !pendingPrompt) return
    const prompt = takePrompt()
    if (prompt) {
      setMinimized(false)
      void marcoApi.send(prompt)
    }
  }, [open, pendingPrompt, takePrompt, marcoApi, setMinimized])

  // El editor puede reservar el espacio del panel: padding-right: var(--fz-assistant-inset, 0px).
  // Antes de pintar, para que el lienzo no se encoja un cuadro cuando Marco va a la columna de ventanas.
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

  const onDraft = useCallback(
    (value: string) => {
      setDraft(value)
      const current = useMarcoStore.getState().marco
      if (current === 'error' || current === 'done') setMarco('idle')
    },
    [setDraft, setMarco],
  )

  const suggestions = useMemo(() => suggestionsFor(pathname, editor), [pathname, editor, entries.length, busy])
  const lastAssistant = [...entries].reverse().find((e) => e.role === 'assistant')
  const preview = busy || face === 'approval' ? '' : (lastAssistant?.receipts?.at(-1)?.text ?? lastAssistant?.text ?? '')

  const close = () => setOpen(false)
  // Nunca encima de la barra de totales del editor (64 px) ni de la barra inferior del teléfono.
  const bottom = mobile
    ? `calc(${editor ? 136 : 68}px + env(safe-area-inset-bottom))`
    : editor
      ? `${EDITOR_FOOTER + 12}px`
      : '12px'
  const panelReserve = 48 + 16 + (editor && !mobile ? EDITOR_FOOTER + 12 : 12)
  const panel = (
    <AnimatePresence>
      {open && (
        <motion.div
          key={minimized ? 'min' : 'panel'}
          // Acoplado en la columna de ventanas entra desde la izquierda; flotando, desde abajo.
          initial={wantsDock && !minimized ? { opacity: 0, x: -8, y: 0, scale: 1 } : { opacity: 0, x: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          exit={{
            opacity: 0,
            ...(docked ? { x: -6 } : { y: 6, scale: 0.98 }),
            transition: { duration: 0.16, ease: [0.4, 0, 1, 1] },
          }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          style={
            dockRect
              ? { transformOrigin: 'left center', left: dockRect.left, top: dockRect.top, width: dockRect.width, height: dockRect.height }
              : { transformOrigin: 'bottom right', bottom: mobile && !minimized ? 0 : bottom }
          }
          className={cn(
            'pointer-events-none fixed z-40 flex',
            !dockRect && cn('justify-end', mobile ? (minimized ? 'right-3' : 'inset-x-0') : 'right-3'),
          )}
        >
          {minimized ? (
            <MarcoMinimized face={face} statusText={statusText} preview={preview} mobile={mobile} onExpand={() => setMinimized(false)} onClose={close} />
          ) : (
            <MarcoPanel
              entries={entries}
              draft={draft}
              busy={busy}
              face={face}
              statusText={statusText}
              mode={mode}
              suggestions={suggestions}
              mobile={mobile}
              docked={docked}
              reserve={panelReserve}
              greet={!greeted}
              onDraft={onDraft}
              onSend={(text) => void marcoApi.send(text)}
              onStop={marcoApi.stop}
              onUndo={(id) => {
                marcoApi.undo(id)
              }}
              onApproval={marcoApi.answerApproval}
              onMinimize={() => setMinimized(true)}
              onClose={close}
              onReset={marcoApi.newConversation}
              onFocusChange={setFocused}
              onGreeted={setGreeted}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )

  const label = open && !minimized ? 'Cerrar a Marco' : 'Abrir a Marco'
  return (
    <>
      <Tooltip content={open && !minimized ? 'Cerrar a Marco' : 'Marco, tu asistente'} shortcut="mod+j" side="bottom">
        <button
          type="button"
          onClick={toggle}
          aria-label={label}
          aria-pressed={open && !minimized}
          aria-keyshortcuts="Control+J Meta+J"
          className={cn(
            'group relative inline-flex size-9 items-center justify-center rounded-full transition-colors duration-120 hover:bg-paper-100 touch:size-10',
            open && !minimized && 'bg-ink-50 hover:bg-ink-50',
            className,
          )}
        >
          <span className="transition-transform duration-160 ease-out group-hover:scale-[1.04] group-active:scale-[0.96]">
            <MarcoAvatar state={open && !minimized ? face : marco === 'listening' ? 'idle' : marco} size={28} />
          </span>
          <span className="sr-only" aria-live="polite">
            {!open && marco === 'approval' ? 'Marco espera tu visto bueno' : ''}
          </span>
        </button>
      </Tooltip>
      {typeof document !== 'undefined' ? createPortal(panel, document.body) : null}
    </>
  )
}
