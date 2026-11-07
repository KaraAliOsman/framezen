/**
 * Conversaciones: columna desplegable dentro del panel con búsqueda, fijadas arriba y el resto por
 * fecha; renombrar en línea, fijar y borrar con deshacer. La conversación activa se marca por tono.
 * Si el servidor no responde, se dice y lo escrito no se pierde.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { useQueryClient } from '@tanstack/react-query'
import { MoreHorizontal, Pencil, Pin, PinOff, Search, Trash2, X } from 'lucide-react'
import type { AssistantProfile, ConversationSummary } from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useFormat, useT } from '../../../lib/i18n'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, IconButton, Input, Notice, SkeletonRows, toastUndo } from '../../../ui'
import es from '../i18n/es'
import { assistantApi } from '../v2/client'
import { assistantKeys, useConversations } from '../v2/queries'
import { BotFace } from './BotFace'

export interface HistoryDrawerProps {
  open: boolean
  activeId: string | null
  onClose(): void
  onOpen(id: string): void
  /** La conversación activa se borró. */
  onActiveDeleted(): void
  /** Con más de un asistente, cada conversación muestra con quién fue. */
  assistants?: readonly AssistantProfile[]
}

type Group = 'pinned' | 'today' | 'yesterday' | 'week' | 'older'

function groupOf(c: ConversationSummary, now: Date): Group {
  if (c.pinned) return 'pinned'
  const t = new Date(c.lastMessageAt || c.updatedAt)
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (t.getTime() >= start) return 'today'
  if (t.getTime() >= start - 86_400_000) return 'yesterday'
  if (t.getTime() >= start - 7 * 86_400_000) return 'week'
  return 'older'
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

export function HistoryDrawer({ open, activeId, onClose, onOpen, onActiveDeleted, assistants }: HistoryDrawerProps) {
  const t = useT(es)
  const reduced = useReducedMotion()
  const [q, setQ] = useState('')
  const query = useDebounced(q.trim(), 200)
  const list = useConversations(query, open)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) requestAnimationFrame(() => searchRef.current?.focus())
  }, [open])

  const groups = useMemo(() => {
    const now = new Date()
    const out: Record<Group, ConversationSummary[]> = { pinned: [], today: [], yesterday: [], week: [], older: [] }
    for (const c of list.data?.items ?? []) out[groupOf(c, now)].push(c)
    return out
  }, [list.data])

  if (!open) return null
  const items = list.data?.items ?? []
  return (
    <div className="absolute inset-0 z-10 flex" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onClose())}>
      <motion.aside
        aria-label={t('history.title')}
        initial={reduced ? false : { opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
        className="flex h-full w-[min(300px,88%)] flex-col bg-canvas shadow-float"
      >
        <div className="flex h-14 shrink-0 items-center gap-2 pr-2 pl-4">
          <p className="min-w-0 flex-1 truncate font-display text-h3 font-medium text-fg-strong">{t('history.title')}</p>
          <IconButton icon={X} label={t('history.close')} size="sm" onClick={onClose} tooltip={false} />
        </div>
        <div className="shrink-0 px-3 pb-2">
          <Input
            ref={searchRef}
            size="sm"
            icon={Search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              // Enter abre el primer resultado: buscar y abrir sin tocar el mouse
              if (e.key === 'Enter' && items[0]) onOpen(items[0].id)
            }}
            placeholder={t('history.search')}
            aria-label={t('history.search')}
          />
        </div>
        <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {list.isLoading ? (
            <div className="px-1.5">
              <SkeletonRows rows={5} columns={1} />
            </div>
          ) : list.isError ? (
            <Notice tone="neutral" size="compact" className="mx-1.5">
              {t('history.unavailable')}
            </Notice>
          ) : !items.length ? (
            <p className="px-2 py-3 text-table text-fg-muted">{query ? t('history.noResults', { query }) : t('history.empty')}</p>
          ) : (
            (['pinned', 'today', 'yesterday', 'week', 'older'] as Group[]).map((group) =>
              groups[group].length ? (
                <section key={group} className="mt-2 first:mt-0">
                  <h3 className="px-2 pb-1 text-meta font-medium text-fg-muted">{t(`history.${group}`)}</h3>
                  <ul>
                    {groups[group].map((c) => (
                      <ConversationRow key={c.id} conversation={c} active={c.id === activeId} onOpen={onOpen} onDeleted={() => c.id === activeId && onActiveDeleted()} bot={assistants && assistants.length > 1 ? assistants.find((a) => a.id === c.assistantId) : undefined} />
                    ))}
                  </ul>
                </section>
              ) : null,
            )
          )}
        </div>
      </motion.aside>
      <button type="button" aria-label={t('history.close')} tabIndex={-1} onClick={onClose} className="flex-1 bg-scrim/40" />
    </div>
  )
}

function ConversationRow({ conversation, active, onOpen, onDeleted, bot }: { conversation: ConversationSummary; active: boolean; onOpen(id: string): void; onDeleted(): void; bot?: AssistantProfile }) {
  const t = useT(es)
  const fmt = useFormat()
  const client = useQueryClient()
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(conversation.title)
  const shownTitle = conversation.title || t('history.untitled')

  const refresh = () => client.invalidateQueries({ queryKey: assistantKeys.conversationsAll })

  const saveTitle = async () => {
    setRenaming(false)
    const next = title.trim()
    if (!next || next === conversation.title) return setTitle(conversation.title)
    try {
      await assistantApi.conversations.patch(conversation.id, { title: next.slice(0, 120) })
      void refresh()
    } catch {
      setTitle(conversation.title)
    }
  }

  const togglePin = async () => {
    await assistantApi.conversations.patch(conversation.id, { pinned: !conversation.pinned }).catch(() => undefined)
    void refresh()
  }

  const remove = async () => {
    try {
      await assistantApi.conversations.remove(conversation.id)
      onDeleted()
      void refresh()
      toastUndo(t('history.deleted', { title: shownTitle }), () => {
        void assistantApi.conversations.restore(conversation.id).then(refresh, () => undefined)
      })
    } catch {
      void refresh()
    }
  }

  if (renaming) {
    return (
      <li className="px-1 py-0.5">
        <Input
          size="sm"
          autoFocus
          value={title}
          maxLength={120}
          aria-label={t('history.renameLabel')}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void saveTitle()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void saveTitle()
            if (e.key === 'Escape') {
              e.stopPropagation()
              setTitle(conversation.title)
              setRenaming(false)
            }
          }}
        />
      </li>
    )
  }

  return (
    <li className={cn('group relative flex items-center rounded-xs', active ? 'bg-accent-subtle' : 'hover:bg-hover')}>
      <button
        type="button"
        onClick={() => onOpen(conversation.id)}
        onDoubleClick={() => setRenaming(true)}
        aria-current={active ? 'true' : undefined}
        className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-2 py-1.5 text-left"
      >
        <span className={cn('flex w-full min-w-0 items-center gap-1 text-table', active ? 'font-medium text-accent-ink' : 'text-fg')}>
          {bot ? <BotFace spec={bot.avatar} state="idle" size={16} animated={false} title={bot.name} /> : null}
          {conversation.pinned && <Pin aria-hidden strokeWidth={2} className="size-3 shrink-0 text-fg-muted" />}
          <span className="truncate">{shownTitle}</span>
        </span>
        <span className="w-full truncate text-meta text-fg-muted">{conversation.snippet || fmt.relative(conversation.lastMessageAt || conversation.updatedAt)}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            icon={MoreHorizontal}
            label={t('history.actions', { title: shownTitle })}
            size="xs"
            tooltip={false}
            className="mr-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 touch:opacity-100"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-48">
          <DropdownMenuItem icon={Pencil} onSelect={() => setRenaming(true)}>
            {t('history.rename')}
          </DropdownMenuItem>
          <DropdownMenuItem icon={conversation.pinned ? PinOff : Pin} onSelect={() => void togglePin()}>
            {conversation.pinned ? t('history.unpin') : t('history.pin')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={Trash2} danger onSelect={() => void remove()}>
            {t('history.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
