/**
 * Panel del asistente: no modal. En escritorio es una segunda hoja dentro del marco, a la derecha
 * (400 px, el editor le reserva el espacio), se acopla en la columna de ventanas del editor cuando la
 * pantalla es angosta, y en el teléfono es una hoja inferior casi completa. Se minimiza a una
 * píldora con su cara y su estado.
 */
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ChevronUp, X } from 'lucide-react'
import type { AssistantListResponse, AssistantMode, AvatarSpec, ToolRun, TurnAttachment } from '@dekopen/shared'
import type { AttachmentView } from '../attachments/types'
import { cn } from '../../../lib/cn'
import { useT } from '../../../lib/i18n'
import { IconButton, SkeletonRows } from '../../../ui'
import type { FaceState } from '../face'
import es from '../i18n/es'
import type { LocalInterpreter, LocalParse } from '../local/interpreter'
import type { ChatEntry } from '../types'
import { BotFace } from './BotFace'
import { Composer, type ComposerHandle } from './Composer'
import { Conversation } from './Conversation'
import { HistoryDrawer } from './HistoryDrawer'
import { ModeSwitch } from './ModeSwitch'
import { PanelHeader } from './PanelHeader'
import { EffortSwitch } from './EffortSwitch'
import { Welcome } from './Welcome'

export interface AssistantPanelProps {
  name: string
  avatar: AvatarSpec
  face: FaceState
  statusText: string
  entries: ChatEntry[]
  toolRuns: Record<string, ToolRun>
  hasMoreBefore: boolean
  draft: string
  busy: boolean
  mobile: boolean
  docked?: boolean
  reserve?: number
  greet: boolean
  suggestions: string[]
  interpreter: LocalInterpreter
  ai: boolean | undefined
  assistants?: AssistantListResponse
  activeAssistantId: string | null
  conversationId: string | null
  mode: AssistantMode
  allowedModes?: readonly AssistantMode[]
  fullAccessAck: boolean
  historyOpen: boolean
  /** Trayendo una conversación del historial. */
  opening: boolean
  /** Cambia al reemplazar la conversación que se ve. */
  epoch: number
  /** Aviso del modo sin IA (en la bienvenida). */
  offlineNote?: ReactNode
  onDraft(value: string): void
  onSend(text: string, options?: { parse?: LocalParse; forceAi?: boolean; display?: string; attachments?: TurnAttachment[]; attachmentViews?: AttachmentView[] }): void
  onStop(): void
  onUndoReceipt(id: string): void
  onUndoRun(runId: string): Promise<void> | void
  onApprove(runId: string): Promise<void> | void
  onApproveAll(runIds: readonly string[]): void
  onReject(runId: string): Promise<void> | void
  onLocalApproval(entryId: string, ok: boolean): void
  onRetry(text: string): void
  onLoadEarlier(): void
  onMode(mode: AssistantMode): void
  onAckFullAccess(): void
  onAssistant(id: string): void
  onNextAssistant(): void
  onCreateAssistant(): void
  onEditAssistant(): void
  onNewConversation(): void
  onHistory(open: boolean): void
  onOpenConversation(id: string): void
  onMemory(): void
  onMinimize(): void
  onClose(): void
  onFocusChange(focused: boolean): void
  onGreeted(): void
}

/** Alto del teclado del teléfono: `dvh` no lo descuenta en iOS, y taparía el campo. */
function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const viewport = window.visualViewport
    if (!active || !viewport) return
    const sync = () => setInset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)))
    sync()
    viewport.addEventListener('resize', sync)
    viewport.addEventListener('scroll', sync)
    return () => {
      viewport.removeEventListener('resize', sync)
      viewport.removeEventListener('scroll', sync)
    }
  }, [active])
  return inset
}

/** Arrastrar la manija hacia abajo baja la hoja; la soltada decide por distancia y velocidad. */
function useSheetDrag(onDismiss: () => void) {
  const sheet = useRef<HTMLElement>(null)
  const drag = useRef<{ y: number; t: number; dy: number } | null>(null)
  return {
    sheet,
    handle: {
      onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { y: event.clientY, t: event.timeStamp, dy: 0 }
        if (sheet.current) sheet.current.style.transition = 'none'
      },
      onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
        if (!drag.current || !sheet.current) return
        drag.current.dy = Math.max(0, event.clientY - drag.current.y)
        sheet.current.style.transform = `translateY(${drag.current.dy}px)`
      },
      onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
        const state = drag.current
        drag.current = null
        const el = sheet.current
        if (!state || !el) return
        const speed = state.dy / Math.max(event.timeStamp - state.t, 1)
        // un toque sin arrastre también la baja
        if (state.dy < 4 || state.dy > 120 || speed > 0.6) {
          el.style.transform = ''
          onDismiss()
          return
        }
        el.style.transition = 'transform 220ms cubic-bezier(.32,.72,0,1)'
        el.style.transform = ''
      },
    },
  }
}

const hasFiles = (event: DragEvent<HTMLElement>) => Array.from(event.dataTransfer.types).includes('Files')

export function AssistantPanel(props: AssistantPanelProps) {
  const { entries, busy, face, mobile, docked = false } = props
  const t = useT(es)
  const composer = useRef<ComposerHandle>(null)
  const [inputEl, setInputEl] = useState<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    // Al abrir, el foco va a la entrada (sin desplazar la página).
    const id = requestAnimationFrame(() => {
      composer.current?.focus()
      setInputEl(composer.current?.element() ?? null)
    })
    return () => cancelAnimationFrame(id)
  }, [])

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && !event.defaultPrevented) {
      if (props.historyOpen) {
        event.stopPropagation()
        props.onHistory(false)
        return
      }
      event.stopPropagation()
      props.onMinimize()
    }
  }

  const [dropping, setDropping] = useState(false)
  const onDrag = (event: DragEvent<HTMLElement>) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    setDropping(true)
  }

  const empty = entries.length === 0
  // Mira lo que importa: el campo mientras le escriben, la tarjeta mientras espera el visto bueno.
  const approvalCard = useRef<Element | null>(null)
  useEffect(() => {
    approvalCard.current = face === 'approval' ? document.querySelector('[data-approval]') : null
  }, [face, entries])
  const lookAt = face === 'listening' && inputEl ? inputEl : face === 'approval' ? approvalCard : 'pointer'
  const inset = useKeyboardInset(mobile)
  const { sheet, handle } = useSheetDrag(props.onMinimize)

  return (
    <section
      ref={sheet}
      role="complementary"
      aria-label={t('panel.label', { name: props.name })}
      onKeyDown={onKeyDown}
      onDragEnter={onDrag}
      onDragOver={onDrag}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropping(false)
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        setDropping(false)
        composer.current?.addFiles(Array.from(event.dataTransfer.files))
      }}
      data-docked={docked ? '' : undefined}
      className={cn(
        '@container pointer-events-auto relative flex flex-col overflow-hidden bg-canvas text-fg',
        mobile ? 'h-dvh w-full pt-[env(safe-area-inset-top)]' : docked ? 'h-full w-full shadow-float' : 'w-[400px] rounded-dialog shadow-pop',
      )}
      style={mobile ? { height: `calc(100dvh - ${inset}px)`, marginBottom: inset } : docked ? undefined : { height: `calc(100dvh - ${props.reserve ?? 16}px)` }}
    >
      {dropping ? (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-panel border border-dashed border-accent bg-canvas/90 p-6 text-center text-lead text-fg-strong">
          {t('attachments.drop', { name: props.name })}
        </div>
      ) : null}
      {mobile && (
        <button type="button" {...handle} aria-label={t('panel.grabber', { name: props.name })} className="flex h-6 w-full shrink-0 touch-none items-center justify-center">
          <span aria-hidden className="block h-1 w-9 rounded-full bg-divider-strong" />
        </button>
      )}
      <PanelHeader
        name={props.name}
        avatar={props.avatar}
        face={face}
        statusText={props.statusText}
        lookAt={lookAt}
        assistants={props.assistants}
        activeId={props.activeAssistantId}
        mode={props.mode}
        showModes={props.ai !== false}
        fullAccessAck={props.fullAccessAck}
        canReset={!empty || busy}
        historyOpen={props.historyOpen}
        mobile={mobile}
        onAckFullAccess={props.onAckFullAccess}
        onAssistant={props.onAssistant}
        onNextAssistant={props.onNextAssistant}
        onCreateAssistant={props.onCreateAssistant}
        onEditAssistant={props.onEditAssistant}
        onNewConversation={props.onNewConversation}
        onHistory={() => props.onHistory(!props.historyOpen)}
        onMemory={props.onMemory}
        onMinimize={props.onMinimize}
        onClose={props.onClose}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {props.opening ? (
          <div className="min-h-0 flex-1 px-4 pt-6" role="status" aria-label={t('conversation.opening')}>
            <SkeletonRows rows={5} columns={1} />
          </div>
        ) : empty ? (
          <Welcome
            name={props.name}
            avatar={props.avatar}
            greet={props.greet}
            onGreeted={props.onGreeted}
            suggestions={props.ai === false ? props.suggestions : []}
            onPick={(text) => props.onSend(text)}
            compact={docked}
            footer={props.offlineNote}
            face={face}
            assistants={props.assistants?.items}
            activeId={props.activeAssistantId}
            onAssistant={props.onAssistant}
          />
        ) : (
          <Conversation
            key={props.epoch}
            face={face}
            entries={entries}
            toolRuns={props.toolRuns}
            name={props.name}
            avatar={props.avatar}
            busy={busy}
            hasMoreBefore={props.hasMoreBefore}
            onLoadEarlier={props.onLoadEarlier}
            onUndoReceipt={props.onUndoReceipt}
            onUndoRun={props.onUndoRun}
            onApprove={props.onApprove}
            onApproveAll={props.onApproveAll}
            onReject={props.onReject}
            onLocalApproval={props.onLocalApproval}
            onRetry={props.onRetry}
            onQuickReply={(reply) => props.onSend(reply.text, { display: reply.label })}
            onNavigate={mobile ? props.onMinimize : undefined}
          />
        )}

        <Composer
          ref={composer}
          value={props.draft}
          onChange={props.onDraft}
          onSubmit={(text, options) => props.onSend(text, options)}
          onStop={props.onStop}
          busy={busy}
          interpreter={props.interpreter}
          name={props.name}
          avatar={props.avatar}
          ai={props.ai}
          modeControl={
            props.ai === false ? undefined : (
              <>
                <ModeSwitch value={props.mode} onChange={props.onMode} allowed={props.allowedModes} />
                <EffortSwitch />
              </>
            )
          }
          compact={docked}
          onFocusChange={props.onFocusChange}
        />

        <HistoryDrawer
          open={props.historyOpen}
          activeId={props.conversationId}
          onClose={() => props.onHistory(false)}
          onOpen={props.onOpenConversation}
          onActiveDeleted={props.onNewConversation}
        />
      </div>
    </section>
  )
}

/** Píldora minimizada: la cara del asistente, su estado y lo último que dijo. */
export function MinimizedPill({
  name,
  avatar,
  face,
  statusText,
  preview,
  onExpand,
  onClose,
  mobile,
}: {
  name: string
  avatar: AvatarSpec
  face: FaceState
  statusText: string
  preview: string
  onExpand(): void
  onClose(): void
  mobile: boolean
}) {
  const t = useT(es)
  if (mobile) {
    // En el teléfono, solo su cara: no tapa la barra de totales ni la navegación.
    return (
      <button
        type="button"
        onClick={onExpand}
        aria-label={`${t('panel.expand', { name })} · ${preview || statusText}`}
        className="pointer-events-auto inline-flex size-14 items-center justify-center rounded-full border border-divider bg-raised shadow-float transition-transform duration-100 active:scale-[0.96]"
      >
        <BotFace spec={avatar} state={face} size={40} reactive />
      </button>
    )
  }
  return (
    <div className="pointer-events-auto flex h-12 max-w-[340px] items-center gap-1 rounded-full border border-divider bg-raised pr-1.5 pl-1.5 shadow-float">
      <button type="button" onClick={onExpand} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full py-1 pr-2 text-left outline-offset-2" aria-label={t('panel.expand', { name })}>
        <BotFace spec={avatar} state={face} size={32} reactive />
        <span className="min-w-0">
          <span className="block text-table font-medium text-fg-strong">{name}</span>
          <span className="block max-w-[220px] truncate text-meta text-fg-muted" aria-live="polite">
            {preview || statusText}
          </span>
        </span>
      </button>
      <IconButton icon={ChevronUp} label={t('panel.expand', { name })} size="sm" onClick={onExpand} tooltip={false} />
      <IconButton icon={X} label={t('root.close', { name })} size="sm" onClick={onClose} tooltip={false} />
    </div>
  )
}
