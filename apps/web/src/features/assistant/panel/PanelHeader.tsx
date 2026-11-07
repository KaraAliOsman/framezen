/**
 * Cabecera del panel: cara del asistente (estado vivo) + selector de asistente con su estado, y las
 * acciones (conversación nueva, conversaciones, más, cerrar). El modo vive junto al campo.
 */
import { ArrowLeftRight, Check, ChevronDown, History, Lock, Minus, MoreHorizontal, Pencil, Plus, SquarePen, X, BookMarked } from 'lucide-react'
import type { AssistantListResponse, AssistantMode, AssistantProfile, AvatarSpec } from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useT } from '../../../lib/i18n'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Notice,
  Button,
} from '../../../ui'
import type { AvatarLookAt } from '../avatar'
import type { FaceState } from '../face'
import es from '../i18n/es'
import { BotFace } from './BotFace'

export interface PanelHeaderProps {
  name: string
  avatar: AvatarSpec
  face: FaceState
  statusText: string
  lookAt?: AvatarLookAt
  assistants?: AssistantListResponse
  activeId: string | null
  mode: AssistantMode
  /** Hay modos: hay IA o todavía no se sabe. */
  showModes: boolean
  fullAccessAck: boolean
  canReset: boolean
  historyOpen: boolean
  mobile: boolean
  onAckFullAccess(): void
  onAssistant(id: string): void
  onNextAssistant(): void
  onCreateAssistant(): void
  onEditAssistant(): void
  onNewConversation(): void
  onHistory(): void
  onMemory(): void
  onMinimize(): void
  onClose(): void
}

export function PanelHeader(props: PanelHeaderProps) {
  const t = useT(es)
  const list = props.assistants?.items ?? []
  const limit = props.assistants?.limit
  const used = props.assistants?.used ?? list.length
  const atLimit = limit !== undefined && used >= limit
  const active = list.find((a) => a.id === props.activeId) ?? list.find((a) => a.isDefault) ?? list[0]
  const canEdit = active?.canEdit ?? false

  return (
    <div className="shrink-0">
      <header className={cn('flex items-center gap-2.5 pr-2 pl-4', props.mobile ? 'h-14' : 'h-14')}>
        <BotFace spec={props.avatar} state={props.face} size={32} title={props.name} lookAt={props.lookAt} reactive pokeable />
        <div className="min-w-0 flex-1">
          {list.length ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={t('switcher.label')}
                  className="-ml-1 inline-flex max-w-full items-center gap-1 rounded-xs px-1 text-base font-medium text-fg-strong transition-colors duration-100 hover:bg-hover data-[state=open]:bg-hover"
                >
                  <span className="truncate">{props.name}</span>
                  <ChevronDown aria-hidden strokeWidth={2} className="size-3.5 shrink-0 text-fg-muted" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="flex items-center justify-between px-2 py-1.5 text-meta font-medium text-fg-muted">
                  <span>{t('switcher.heading')}</span>
                  {limit !== undefined && <span className="tabular">{t('switcher.usage', { used, limit })}</span>}
                </DropdownMenuLabel>
                {list.map((assistant: AssistantProfile) => (
                  <DropdownMenuItem key={assistant.id} onSelect={() => props.onAssistant(assistant.id)}>
                    {/* El ítem envuelve a sus hijos en un solo texto truncado: los alineamos en una fila propia. */}
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="inline-flex shrink-0">
                        <BotFace spec={assistant.avatar} state="idle" size={24} animated={false} />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{assistant.name}</span>
                      {assistant.visibility === 'private' && <Lock aria-label={t('switcher.private')} strokeWidth={1.75} className="size-3.5 shrink-0 text-fg-muted" />}
                      {assistant.isDefault && <span className="shrink-0 text-meta text-fg-muted">{t('switcher.isDefault')}</span>}
                      <Check aria-hidden strokeWidth={2} className={cn('size-4 shrink-0 text-accent-ink', assistant.id === active?.id ? 'opacity-100' : 'opacity-0')} />
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                {list.length > 1 && (
                  <DropdownMenuItem icon={ArrowLeftRight} shortcut="alt+j" onSelect={props.onNextAssistant}>
                    {t('panel.nextAssistant')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem icon={Plus} disabled={atLimit} onSelect={props.onCreateAssistant} hint={atLimit ? t('switcher.limitReached', { limit: limit ?? 0 }) : undefined}>
                  {t('switcher.create')}
                </DropdownMenuItem>
                {canEdit && (
                  <DropdownMenuItem icon={Pencil} onSelect={props.onEditAssistant}>
                    {t('switcher.edit', { name: props.name })}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <p className="truncate text-base font-medium text-fg-strong">{props.name}</p>
          )}
          <p className="truncate text-meta text-fg-muted" aria-live="polite">
            {props.statusText}
          </p>
        </div>
        <IconButton icon={SquarePen} label={t('panel.newConversation')} shortcut="alt+n" size="sm" onClick={props.onNewConversation} disabled={!props.canReset} tooltipSide="bottom" />
        <IconButton icon={History} label={t('panel.history')} shortcut="alt+h" size="sm" onClick={props.onHistory} aria-pressed={props.historyOpen} tooltipSide="bottom" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton icon={MoreHorizontal} label={t('panel.more')} size="sm" tooltipSide="bottom" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56">
            <DropdownMenuItem icon={BookMarked} onSelect={props.onMemory}>
              {t('panel.memory')}
            </DropdownMenuItem>
            {canEdit && (
              <DropdownMenuItem icon={Pencil} onSelect={props.onEditAssistant}>
                {t('panel.editAssistant')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem icon={Plus} disabled={atLimit || !list.length} onSelect={props.onCreateAssistant}>
              {t('switcher.create')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={Minus} shortcut="escape" onSelect={props.onMinimize}>
              {t('panel.minimize')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <IconButton icon={X} label={t('panel.close')} shortcut="mod+j" size="sm" onClick={props.onClose} tooltipSide="bottom" />
      </header>
      {props.showModes && props.mode === 'full' && !props.fullAccessAck && (
        <div className="px-3 pb-2">
          <Notice
            tone="warning"
            size="compact"
            action={
              <Button size="xs" variant="ghost" onClick={props.onAckFullAccess}>
                {t('modes.understood')}
              </Button>
            }
          >
            {t('modes.fullNotice')}
          </Notice>
        </div>
      )}
    </div>
  )
}
