/**
 * Memoria del asistente: lo que recuerda, con su alcance (asistente, tú, empresa), de dónde salió,
 * fijar, editar en línea y olvidar con deshacer. La memoria nunca cambia precios ni permisos.
 */
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import { MEMORY_LIMITS, MEMORY_SCOPES, type Memory, type MemoryScope } from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useFormat, useT } from '../../../lib/i18n'
import { humanError } from '../../../lib/api'
import { Badge, Button, IconButton, Notice, SegmentedControl, Sheet, SheetContent, SkeletonRows, Textarea, toast, toastUndo } from '../../../ui'
import es from '../i18n/es'
import { assistantApi } from '../v2/client'
import { assistantKeys, useMemories } from '../v2/queries'

export interface MemorySheetProps {
  open: boolean
  onOpenChange(open: boolean): void
  assistantId: string | null
  name: string
  memoryEnabled: boolean
  mobile?: boolean
}

type Filter = 'all' | MemoryScope

export function MemorySheet({ open, onOpenChange, assistantId, name, memoryEnabled, mobile }: MemorySheetProps) {
  const t = useT(es)
  const client = useQueryClient()
  const memories = useMemories(assistantId, open)
  const [filter, setFilter] = useState<Filter>('all')
  const [draft, setDraft] = useState('')
  const [scope, setScope] = useState<MemoryScope>('assistant')
  const [saving, setSaving] = useState(false)

  const refresh = () => client.invalidateQueries({ queryKey: assistantKeys.memoriesAll })
  const items = useMemo(() => {
    const list = memories.data?.items ?? []
    return list
      .filter((m) => filter === 'all' || m.scope === filter)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.updatedAt < b.updatedAt ? 1 : -1))
  }, [memories.data, filter])

  const add = async () => {
    const content = draft.trim()
    if (!content) return
    setSaving(true)
    try {
      await assistantApi.memories.create({ content: content.slice(0, MEMORY_LIMITS.contentMax), scope, kind: 'fact', ...(assistantId ? { assistantId } : {}) })
      setDraft('')
      void refresh()
    } catch (error) {
      toast.error(humanError(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={t('memory.title', { name })} description={t('memory.description')} side={mobile ? 'bottom' : 'right'} width={440}>
        <div className="space-y-4">
          {!memoryEnabled && <Notice tone="neutral" size="compact">{t('memory.off')}</Notice>}
          <div className="space-y-2">
            <label htmlFor="assistant-memory-new" className="text-table font-medium text-fg-muted">
              {t('memory.addLabel')}
            </label>
            <Textarea
              id="assistant-memory-new"
              rows={2}
              value={draft}
              maxLength={MEMORY_LIMITS.contentMax}
              placeholder={t('memory.addPlaceholder', { name })}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void add()
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SegmentedControl<MemoryScope>
                size="sm"
                value={scope}
                onValueChange={setScope}
                aria-label={t('memory.addLabel')}
                options={MEMORY_SCOPES.map((s) => ({ value: s, label: t(`memory.scope.${s}`) }))}
              />
              <Button size="sm" variant="subtle" onClick={() => void add()} disabled={!draft.trim()} loading={saving} shortcut="mod+enter">
                {t('memory.add')}
              </Button>
            </div>
            <p className="text-meta text-fg-muted">{t(`memory.scopeHint.${scope}`)}</p>
          </div>

          <div className="flex items-center justify-between gap-2 pt-2">
            <SegmentedControl<Filter>
              size="sm"
              value={filter}
              onValueChange={setFilter}
              aria-label={t('memory.title', { name })}
              options={[{ value: 'all', label: t('memory.all') }, ...MEMORY_SCOPES.map((s) => ({ value: s as Filter, label: t(`memory.scope.${s}`) }))]}
            />
            {memories.data && <span className="text-meta text-fg-muted tabular">{t('memory.count', { count: memories.data.total })}</span>}
          </div>

          {memories.isLoading ? (
            <SkeletonRows rows={4} columns={1} />
          ) : memories.isError ? (
            <Notice tone="neutral" size="compact">{t('memory.unavailable')}</Notice>
          ) : !items.length ? (
            <p className="text-table text-fg-muted">{t('memory.empty')}</p>
          ) : (
            <ul className="divide-y divide-divider">
              {items.map((memory) => (
                <MemoryRow key={memory.id} memory={memory} onChanged={refresh} />
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function MemoryRow({ memory, onChanged }: { memory: Memory; onChanged(): void }) {
  const t = useT(es)
  const fmt = useFormat()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(memory.content)

  const save = async () => {
    const content = text.trim()
    setEditing(false)
    if (!content || content === memory.content) return setText(memory.content)
    try {
      await assistantApi.memories.patch(memory.id, { content })
      onChanged()
    } catch {
      setText(memory.content)
    }
  }

  const togglePin = async () => {
    await assistantApi.memories.patch(memory.id, { pinned: !memory.pinned }).catch(() => undefined)
    onChanged()
  }

  const forget = async () => {
    try {
      await assistantApi.memories.remove(memory.id)
      onChanged()
      toastUndo(t('memory.deleted', { text: memory.content.length > 48 ? `${memory.content.slice(0, 47)}…` : memory.content }), () => {
        void assistantApi.memories
          .create({ content: memory.content, scope: memory.scope, kind: memory.kind, pinned: memory.pinned, ...(memory.assistantId ? { assistantId: memory.assistantId } : {}) })
          .then(onChanged, () => undefined)
      })
    } catch {
      onChanged()
    }
  }

  return (
    <li className="group py-2.5">
      {editing ? (
        <div className="space-y-2">
          <Textarea autoFocus rows={2} value={text} maxLength={MEMORY_LIMITS.contentMax} onChange={(e) => setText(e.target.value)} aria-label={t('memory.edit')} />
          <div className="flex justify-end gap-2">
            <Button size="xs" variant="ghost" onClick={() => (setText(memory.content), setEditing(false))}>
              {t('memory.cancel')}
            </Button>
            <Button size="xs" variant="primary" onClick={() => void save()}>
              {t('memory.save')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-base text-fg [overflow-wrap:anywhere]">{memory.content}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-meta text-fg-muted">
              <Badge size="sm" tone={memory.scope === 'org' ? 'info' : memory.scope === 'user' ? 'neutral' : 'accent'}>
                {t(`memory.scope.${memory.scope}`)}
              </Badge>
              <span>{memory.source === 'auto' ? t('memory.auto') : t('memory.explicit')}</span>
              <span aria-hidden>·</span>
              <span>{fmt.relative(memory.updatedAt)}</span>
              {memory.pinned && (
                <>
                  <span aria-hidden>·</span>
                  <span>{t('memory.pinned')}</span>
                </>
              )}
            </div>
          </div>
          {memory.canEdit ? (
            <div className="flex shrink-0 items-center opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
              <IconButton icon={memory.pinned ? PinOff : Pin} label={memory.pinned ? t('memory.unpin') : t('memory.pin')} size="xs" onClick={() => void togglePin()} />
              <IconButton icon={Pencil} label={t('memory.edit')} size="xs" onClick={() => setEditing(true)} />
              <IconButton icon={Trash2} label={t('memory.delete')} size="xs" onClick={() => void forget()} />
            </div>
          ) : (
            <span className="shrink-0 text-meta text-fg-muted">{t('memory.readOnly')}</span>
          )}
        </div>
      )}
    </li>
  )
}
