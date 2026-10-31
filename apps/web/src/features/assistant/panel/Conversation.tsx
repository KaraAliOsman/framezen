/**
 * Lista de mensajes: los tuyos en burbuja suave a la derecha; los de Marco sin burbuja, con su cara
 * pequeña al comienzo de cada grupo, recibos, tarjetas y avisos.
 */
import { Fragment, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Info } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { MarcoAvatar, type MarcoState } from '../avatar'
import type { ChatEntry } from '../types'
import { ApprovalCard, PriceBreakdown, Receipts, SearchResults, Steps } from './Cards'

/** Texto de Marco: párrafos y listas con guion; nada de markdown pesado. */
export function RichReply({ text }: { text: string }) {
  const blocks: ReactNode[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`l${blocks.length}`} className="my-1 list-disc space-y-0.5 pl-4 marker:text-paper-350">
          {list.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>,
      )
      list = []
    }
  }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const bullet = /^\s*[-•*]\s+(.*)$/.exec(line)
    if (bullet) {
      list.push(bullet[1].replace(/\*\*/g, ''))
      continue
    }
    flush()
    if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{line.replace(/\*\*/g, '')}</p>)
  }
  flush()
  return <div className="space-y-1.5">{blocks}</div>
}

function faceFor(entry: ChatEntry): MarcoState {
  if (entry.status === 'error') return 'error'
  if (entry.receipts?.length) return 'done'
  return 'idle'
}

export interface ConversationProps {
  entries: ChatEntry[]
  thinking: boolean
  onUndo: (receiptId: string) => void
  onApproval: (entryId: string, ok: boolean) => void
  onNavigate?: () => void
}

export function Conversation({ entries, thinking, onUndo, onApproval, onNavigate }: ConversationProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  // Las entradas que ya estaban al montar no se animan (abrir el panel no «redibuja» la charla).
  const mounted = useRef<Set<string> | null>(null)
  if (mounted.current === null) mounted.current = new Set(entries.map((e) => e.id))

  const last = entries[entries.length - 1]
  const signature = last ? `${entries.length}:${last.text.length}:${last.receipts?.length ?? 0}:${last.cards?.length ?? 0}:${last.steps?.length ?? 0}:${last.approval?.status ?? ''}` : ''

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [signature, thinking])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onScroll = () => {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div ref={scroller} className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-2 @max-xs:px-3" role="log" aria-label="Conversación con Marco" aria-live="polite" aria-relevant="additions">
      <div className="flex flex-col gap-3.5">
        {entries.map((entry, index) => {
          const prev = entries[index - 1]
          const groupStart = entry.role === 'assistant' && prev?.role !== 'assistant'
          const animate = !mounted.current!.has(entry.id)
          return (
            <motion.div
              key={entry.id}
              initial={animate ? { opacity: 0, y: 4 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
              className={cn('flex', entry.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              {entry.role === 'user' ? (
                <p className="group relative max-w-[85%] rounded-[14px] rounded-br-[4px] bg-paper-100 px-3 py-[7px] text-[14px] leading-[21px] whitespace-pre-wrap text-paper-900 [overflow-wrap:anywhere]" title={new Date(entry.at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}>
                  {entry.text}
                </p>
              ) : (
                <AssistantMessage entry={entry} showFace={groupStart} onUndo={onUndo} onApproval={onApproval} onNavigate={onNavigate} />
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

function AssistantMessage({
  entry,
  showFace,
  onUndo,
  onApproval,
  onNavigate,
}: {
  entry: ChatEntry
  showFace: boolean
  onUndo: (id: string) => void
  onApproval: (entryId: string, ok: boolean) => void
  onNavigate?: () => void
}) {
  const pending = entry.status === 'pending'
  const empty = !entry.text && !entry.receipts?.length && !entry.cards?.length && !entry.approval
  return (
    <div className="flex w-full min-w-0 gap-2.5">
      <div className="w-5 shrink-0 pt-[1px]">{showFace && <MarcoAvatar state={pending ? 'thinking' : faceFor(entry)} size={20} animated={false} />}</div>
      <div className="min-w-0 flex-1 text-[14px] leading-[21px] text-paper-900 [overflow-wrap:anywhere]">
        {pending && empty && !entry.steps?.length && <p className="fz-breathe text-paper-600">Pensando…</p>}
        {entry.text && (
          <div className={cn(entry.status === 'error' && 'text-paper-900', entry.status === 'stopped' && 'text-paper-600')}>
            <RichReply text={entry.text} />
          </div>
        )}
        {entry.steps && entry.steps.length > 0 && <Steps steps={entry.steps} />}
        {entry.receipts && entry.receipts.length > 0 && <Receipts receipts={entry.receipts} onUndo={onUndo} />}
        {entry.cards?.map((card, i) => (
          <Fragment key={i}>{card.kind === 'price' ? <PriceBreakdown card={card} /> : <SearchResults card={card} onOpen={onNavigate} />}</Fragment>
        ))}
        {entry.approval && <ApprovalCard approval={entry.approval} onAnswer={(ok) => onApproval(entry.id, ok)} />}
        {entry.notes && entry.notes.length > 0 && (
          <ul className="mt-2 space-y-0.5 border-l-2 border-paper-200 pl-2.5 text-[12.5px] leading-[18px] text-paper-600">
            {[...new Set(entry.notes)].map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
        {entry.notice && (
          <p className="mt-2 flex gap-1.5 text-[12px] leading-[17px] text-paper-600">
            <Info aria-hidden strokeWidth={2} className="mt-[1.5px] size-3.5 shrink-0" />
            {entry.notice}
          </p>
        )}
      </div>
    </div>
  )
}
