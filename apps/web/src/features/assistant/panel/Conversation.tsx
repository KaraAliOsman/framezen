/**
 * La conversación, en el orden en que pasó: tus mensajes en burbuja suave a la derecha; las respuestas
 * sin burbuja, a todo el ancho, intercalando lo dicho con lo hecho (texto, herramientas, aprobaciones,
 * más texto). La cara del turno en curso está viva; las demás, quietas.
 */
import { Fragment, memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowDown, Check, CornerDownLeft, RotateCcw } from 'lucide-react'
import type { AvatarSpec, ToolRun } from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useFormat, useT } from '../../../lib/i18n'
import { Button, Notice } from '../../../ui'
import type { FaceState } from '../face'
import es from '../i18n/es'
import type { ActivityView, ChatEntry, NoticeView, QuickReply } from '../types'
import { PLAN_CODES } from '../v2/turn'
import { ActivityList } from './Activity'
import { ApprovalCard } from './ApprovalCard'
import { AttachmentList } from './Attachments'
import { BotFace } from './BotFace'
import { LocalApprovalCard, PriceBreakdown, Receipts, SearchResults, Steps } from './Cards'
import { MessageText } from './MessageText'
import { useStickToBottom } from './streaming'

export interface ConversationProps {
  entries: ChatEntry[]
  toolRuns: Record<string, ToolRun>
  name: string
  avatar: AvatarSpec
  face: FaceState
  busy: boolean
  hasMoreBefore?: boolean
  onLoadEarlier?(): void
  onUndoReceipt(receiptId: string): void
  onUndoRun(runId: string): Promise<void> | void
  onApprove(runId: string): Promise<void> | void
  onApproveAll(runIds: readonly string[]): void
  onReject(runId: string): Promise<void> | void
  onLocalApproval(entryId: string, ok: boolean): void
  onRetry(text: string): void
  /** Elegir una opción de «¿Qué vidrio?» ejecuta ese comando completo. */
  onQuickReply?(reply: QuickReply): void
  /** En el teléfono, al abrir un resultado se minimiza el panel. */
  onNavigate?(): void
}

/** Primera propuesta que sigue esperando una decisión. */
function pendingApproval(entries: ChatEntry[], runs: Record<string, ToolRun>): ToolRun | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    for (const id of entries[i].approvals ?? []) {
      const run = runs[id]
      if (run?.status === 'proposed' && (!run.expiresAt || Date.parse(run.expiresAt) > Date.now())) return run
    }
  }
  return null
}

export function Conversation(props: ConversationProps) {
  const { entries } = props
  const t = useT(es)
  const reduced = useReducedMotion()
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const { detached, toBottom } = useStickToBottom(scroller, content)
  // Las entradas que ya estaban al montar no se animan (abrir el panel no «redibuja» la charla).
  const mounted = useRef<Set<string> | null>(null)
  if (mounted.current === null) mounted.current = new Set(entries.map((e) => e.id))

  // Enviar un mensaje te devuelve abajo, aunque estuvieras releyendo.
  const lastUser = [...entries].reverse().find((e) => e.role === 'user')?.id
  const seenUser = useRef(lastUser)
  useEffect(() => {
    if (lastUser !== seenUser.current) {
      seenUser.current = lastUser
      toBottom()
    }
    // toBottom solo usa refs
  }, [lastUser]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar lo anterior no mueve lo que estás leyendo.
  const firstId = entries[0]?.id
  const heightBefore = useRef<number | null>(null)
  useLayoutEffect(() => {
    const el = scroller.current
    if (el && heightBefore.current !== null) {
      el.scrollTop += el.scrollHeight - heightBefore.current
      heightBefore.current = null
    }
  }, [firstId])

  const loadEarlier = () => {
    heightBefore.current = scroller.current?.scrollHeight ?? null
    props.onLoadEarlier?.()
  }

  const pending = pendingApproval(entries, props.toolRuns)
  const [cardVisible, setCardVisible] = useState(true)
  useEffect(() => {
    if (!pending) return
    const card = scroller.current?.querySelector(`[data-approval="${CSS.escape(pending.id)}"]`)
    if (!card || typeof IntersectionObserver !== 'function') return
    const observer = new IntersectionObserver((list) => setCardVisible(list[0]?.isIntersecting ?? true), { root: scroller.current, threshold: 0.4 })
    observer.observe(card)
    return () => observer.disconnect()
  }, [pending?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const review = () => {
    const card = scroller.current?.querySelector<HTMLElement>(`[data-approval="${CSS.escape(pending?.id ?? '')}"]`)
    if (!card) return
    card.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })
    card.focus({ preventScroll: true })
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scroller}
        className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-2 [overflow-anchor:none] @max-xs:px-3"
        role="log"
        aria-label={t('conversation.label', { name: props.name })}
        aria-live="polite"
        aria-relevant="additions"
        aria-busy={props.busy}
      >
        <div ref={content}>
          {props.hasMoreBefore && props.onLoadEarlier && (
            <div className="mb-3 flex justify-center">
              <Button size="xs" variant="ghost" onClick={loadEarlier}>
                {t('conversation.loadEarlier')}
              </Button>
            </div>
          )}
          <div className="flex flex-col gap-5">
            {entries.map((entry, index) => {
              const prev = entries[index - 1]
              const turnStart = entry.role === 'assistant' && prev?.role !== 'assistant'
              const animate = !reduced && !mounted.current!.has(entry.id)
              return (
                <motion.div
                  key={entry.id}
                  initial={animate ? { opacity: 0, y: 4 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
                  className={cn('flex', entry.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  {entry.role === 'user' ? <UserBubble entry={entry} /> : <AssistantMessage entry={entry} showFace={turnStart} last={index === entries.length - 1} {...props} />}
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Lo que no se puede perder: una propuesta esperando, aunque esté fuera de la vista. */}
      {pending && !cardVisible ? (
        <div className="absolute inset-x-3 bottom-2 z-10 flex items-center gap-2 rounded-panel bg-raised py-1.5 pr-1.5 pl-2.5 shadow-float" role="status">
          <BotFace spec={props.avatar} state="approval" size={24} animated={false} />
          <p className="min-w-0 flex-1 truncate text-table text-fg">
            <span className="font-medium text-fg-strong">{t('approval.waitingName', { name: props.name })}</span> · {pending.preview?.title ?? pending.tool.replace(/_/g, ' ')}
          </p>
          <Button size="xs" variant="secondary" onClick={review}>
            {t('approval.review')}
          </Button>
        </div>
      ) : detached ? (
        <button
          type="button"
          onClick={() => toBottom()}
          className="absolute bottom-2 left-1/2 z-10 inline-flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full bg-raised px-3 text-table text-fg shadow-float transition-[background-color,transform] duration-100 hover:bg-hover active:scale-[0.97] touch:h-10"
        >
          <ArrowDown aria-hidden strokeWidth={2} className="size-3.5" />
          {t('conversation.toLatest')}
        </button>
      ) : null}
    </div>
  )
}

function UserBubble({ entry }: { entry: ChatEntry }) {
  const fmt = useFormat()
  const t = useT(es)
  return (
    <div className="flex max-w-[85%] flex-col items-end gap-1">
      {entry.attachments?.length ? <AttachmentList files={entry.attachments} /> : null}
      {entry.text ? (
        <p
          className="rounded-panel bg-hover px-3 py-1.5 text-base whitespace-pre-wrap text-fg [overflow-wrap:anywhere]"
          title={entry.at ? t('conversation.time', { time: fmt.time(new Date(entry.at)) }) : undefined}
        >
          {entry.text}
        </p>
      ) : null}
    </div>
  )
}

function restingFace(entry: ChatEntry): FaceState {
  if (entry.status === 'error') return 'error'
  if (entry.receipts?.length || entry.activity?.length) return 'done'
  return 'idle'
}

function NoticeLine({ notice, retryText, onRetry }: { notice: NoticeView; retryText?: string; onRetry(text: string): void }) {
  const t = useT(es)
  const plan = PLAN_CODES.has(notice.code)
  const tone = notice.level === 'error' ? 'danger' : notice.level === 'warning' ? 'warning' : 'neutral'
  return (
    <Notice
      tone={tone}
      size="compact"
      className="mt-2"
      action={
        plan ? (
          <Button asChild size="xs" variant="ghost">
            <Link to="/ajustes/plan">{t('notices.seePlan')}</Link>
          </Button>
        ) : retryText && notice.level !== 'info' ? (
          <Button size="xs" variant="ghost" icon={RotateCcw} onClick={() => onRetry(retryText)}>
            {t('notices.retry')}
          </Button>
        ) : undefined
      }
    >
      {notice.text}
    </Notice>
  )
}

/** Lo dicho y lo hecho, intercalados en el orden en que pasaron. */
function useTimeline(entry: ChatEntry) {
  const parts = entry.parts?.length && entry.parts.join('\n\n') === entry.text ? entry.parts : entry.text ? [entry.text] : []
  const last = parts.length
  const bucket = (at: number | undefined) => (at === undefined || at > last ? last : at)
  const tools: ActivityView[][] = Array.from({ length: last + 1 }, () => [])
  for (const row of entry.activity ?? []) tools[bucket(row.at)].push(row)
  const approvals: string[][] = Array.from({ length: last + 1 }, () => [])
  for (const id of entry.approvals ?? []) approvals[bucket(entry.approvalAt?.[id])].push(id)
  return { parts, tools, approvals }
}

type MessageProps = ConversationProps & { entry: ChatEntry; showFace: boolean; last: boolean }

/** Una entrada ya cerrada no se vuelve a dibujar con cada fragmento de la que está en curso. */
const AssistantMessage = memo(
  function AssistantMessage({ entry, showFace, last, ...props }: MessageProps) {
    const t = useT(es)
    const pending = entry.status === 'pending'
    const streaming = entry.status === 'streaming'
    const live = pending || streaming || (last && props.busy)
    const empty = !entry.text && !entry.receipts?.length && !entry.cards?.length && !entry.approval && !entry.activity?.length && !entry.approvals?.length
    const retryNotice = entry.retryText && !entry.notices?.length
    const { parts, tools, approvals } = useTimeline(entry)

    const waiting = (entry.approvals ?? []).filter((id) => props.toolRuns[id]?.status === 'proposed')
    const flow: ReactNode[] = []
    for (let i = 0; i <= parts.length; i++) {
      const runs = approvals[i].map((id) => props.toolRuns[id]).filter((r): r is ToolRun => Boolean(r))
      for (const run of runs) flow.push(<ApprovalCard key={run.id} run={run} onApprove={props.onApprove} onReject={props.onReject} busy={props.busy} />)
      if (tools[i].length) flow.push(<ActivityList key={`a${i}`} rows={tools[i]} runs={props.toolRuns} live={live} onUndo={props.onUndoRun} />)
      if (i < parts.length) {
        flow.push(
          <div key={`t${i}`} className={cn(i > 0 && 'mt-2', entry.status === 'stopped' && 'text-fg-muted')}>
            <MessageText text={parts[i]} streaming={streaming && i === parts.length - 1} />
          </div>,
        )
      }
    }

    return (
      <div className="flex w-full min-w-0 gap-2.5">
        <div className="w-5.5 shrink-0 pt-px">{showFace && <BotFace spec={props.avatar} state={live ? props.face : restingFace(entry)} size={22} animated={live} lookAt="none" />}</div>
        <div className="min-w-0 flex-1 text-base text-fg [overflow-wrap:anywhere]">
          {entry.interpretation && (
            <p className="mb-1 flex max-w-full items-center gap-1 text-table text-fg-muted">
              <CornerDownLeft aria-hidden strokeWidth={1.75} className="size-3.5 shrink-0" />
              <span className="truncate">{t('composer.understood', { text: entry.interpretation })}</span>
            </p>
          )}
          {pending && empty && !entry.steps?.length && <p className="fz-breathe text-fg-muted">{t('conversation.thinking')}</p>}
          {entry.steps && entry.steps.length > 0 && <Steps steps={entry.steps} />}
          {flow}
          {waiting.length > 1 ? (
            <Button variant="primary" size="sm" icon={Check} className="mt-2" disabled={props.busy} onClick={() => props.onApproveAll(waiting)}>
              {t('approval.approveAll', { count: waiting.length })}
            </Button>
          ) : null}
          {entry.receipts && entry.receipts.length > 0 && <Receipts receipts={entry.receipts} onUndo={props.onUndoReceipt} />}
          {entry.cards?.map((card, i) => (
            <Fragment key={i}>{card.kind === 'price' ? <PriceBreakdown card={card} /> : <SearchResults card={card} onOpen={props.onNavigate} />}</Fragment>
          ))}
          {entry.approval && <LocalApprovalCard approval={entry.approval} onAnswer={(ok) => props.onLocalApproval(entry.id, ok)} />}
          {entry.notes && entry.notes.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-table text-fg-muted">
              {[...new Set(entry.notes)].map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          {entry.notices?.map((notice) => (
            <NoticeLine key={notice.id} notice={notice} retryText={entry.retryText} onRetry={props.onRetry} />
          ))}
          {retryNotice && (
            <Button size="xs" variant="ghost" icon={RotateCcw} className="mt-1.5" onClick={() => props.onRetry(entry.retryText!)}>
              {t('conversation.retry')}
            </Button>
          )}
          {entry.quickReplies && entry.quickReplies.length > 0 && props.onQuickReply && !props.busy && last && (
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={t('conversation.options')}>
              {entry.quickReplies.map((reply) => (
                <button
                  key={reply.text}
                  type="button"
                  onClick={() => props.onQuickReply?.(reply)}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-sm border border-divider-strong bg-surface px-2 py-1 text-table text-fg transition-colors duration-100 hover:bg-hover touch:min-h-10"
                >
                  <span className="truncate">{reply.label}</span>
                  {reply.detail ? <span className="truncate text-meta text-fg-muted">{reply.detail}</span> : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  },
  (a, b) =>
    a.entry === b.entry &&
    a.last === b.last &&
    a.showFace === b.showFace &&
    a.toolRuns === b.toolRuns &&
    a.avatar === b.avatar &&
    (a.last ? a.busy === b.busy && a.face === b.face : (a.busy === b.busy || !(a.entry.approvals?.length || a.entry.quickReplies?.length))),
)
