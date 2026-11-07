import { useState } from 'react'
import { Link } from 'react-router'
import { Archive, ArrowRight, MoreHorizontal, Pencil, Plus, Star } from 'lucide-react'
import { LOCALE_META, PLANS, TOOL_SCOPES, planLimits, type AssistantProfile } from '@dekopen/shared'
import { humanError } from '../../../lib/api'
import { useFormat, useGlossary, useT } from '../../../lib/i18n'
import { usePlan } from '../../../lib/plan'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Meter,
  Notice,
  Skeleton,
  toast,
  toastUndo,
  UPGRADE_PATH,
  useShortcutText,
} from '../../../ui'
import { AssistantMark } from '../components/AssistantMark'
import { FieldGroup, SectionHeader } from '../components/SectionHeader'
import es from '../i18n/es'
import { notifyAssistantsChanged, requestAssistantEditor } from '../lib/assistantBridge'
import { assistantsApi, isMissingRoute, useAssistants, usePatchAssistant } from '../lib/assistantsApi'
import { useCanManageSettings } from '../lib/region'
import { AssistantEditorSheet } from './AssistantEditorSheet'

/** Asistentes: quiénes son, cuántos permite el plan y acceso a su editor (BOT-UI). */
export function AssistantsSection() {
  const t = useT(es)
  const panelKeys = useShortcutText('mod+j')
  const g = useGlossary()
  const fmt = useFormat()
  const plan = usePlan()
  const assistants = useAssistants()
  const patch = usePatchAssistant()
  const canManage = useCanManageSettings()
  const [editing, setEditing] = useState<{ id?: string } | null>(null)
  const [limitNotice, setLimitNotice] = useState(false)

  const code = plan?.code ?? 'trial'
  const limit = assistants.data?.limit ?? planLimits(code).assistants
  const used = assistants.data?.used ?? assistants.data?.items.length ?? 0
  const atLimit = assistants.data ? used >= limit : false
  const hasAi = plan?.has('assistant') ?? false
  const nextPlan = code === 'taller' ? 'pro' : code === 'pro' || code === 'trial' ? 'empresa' : code === 'empresa' ? 'empresa2x' : null

  const openEditor = (id?: string) => {
    if (!id && atLimit) {
      setLimitNotice(true)
      return
    }
    setLimitNotice(false)
    // El editor completo vive en el panel del asistente; si no responde, usamos el de Ajustes.
    if (!requestAssistantEditor({ assistantId: id })) setEditing({ id })
  }

  const makeDefault = (assistant: AssistantProfile) =>
    patch.mutate(
      { id: assistant.id, patch: { version: assistant.version, isDefault: true } },
      {
        onSuccess: () => {
          notifyAssistantsChanged()
          toast.success(t('assistants.madeDefault', { name: assistant.name }))
        },
        onError: (error) => toast.error(humanError(error)),
      },
    )

  const archive = async (assistant: AssistantProfile) => {
    try {
      await assistantsApi.archive(assistant.id)
      notifyAssistantsChanged()
      toastUndo(t('assistants.archived', { name: assistant.name }), () => {
        assistantsApi
          .restore(assistant.id)
          .then(() => notifyAssistantsChanged())
          .catch((error) => toast.error(humanError(error)))
      })
    } catch (error) {
      toast.error(humanError(error))
    }
  }

  const scopeSummary = (assistant: AssistantProfile) =>
    assistant.scopes.length >= TOOL_SCOPES.length
      ? t('assistants.scopesAll')
      : assistant.scopes.length === 0
        ? t('assistants.scopesNone')
        : t('assistants.scopesSome', { count: assistant.scopes.length, total: TOOL_SCOPES.length })

  const languageLabel = (assistant: AssistantProfile) => (assistant.language === 'auto' ? t('assistants.languageAuto') : LOCALE_META[assistant.language].label)

  return (
    <div>
      <SectionHeader
        title={t('assistants.title')}
        description={t('assistants.description')}
        aside={
          canManage ? (
            <Button variant="primary" icon={Plus} onClick={() => openEditor()}>
              {t('assistants.create')}
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-10">
        <section aria-label={t('assistants.usage.title')}>
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1 basis-64">
              <Meter
                value={used}
                max={Math.max(1, limit)}
                tone="auto"
                size="md"
                label={t('assistants.usage.title')}
                valueLabel={assistants.data ? t('assistants.usage.value', { used: fmt.number(used), limit: fmt.number(limit) }) : t('assistants.usage.limitOnly', { count: limit })}
              />
              <p className="mt-2 text-table text-fg-muted">{hasAi ? t('assistants.usage.withAi', { plan: g.plan(code) }) : t('assistants.usage.localOnly', { plan: g.plan(code) })}</p>
            </div>
            {nextPlan ? (
              <Link to={UPGRADE_PATH} className="inline-flex shrink-0 items-center gap-1.5 text-table font-medium text-accent-ink hover:underline">
                {t('assistants.usage.more', { plan: g.plan(nextPlan), count: PLANS[nextPlan].limits.assistants })}
                <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            ) : null}
          </div>
          {limitNotice ? (
            <Notice
              tone="warning"
              className="mt-4"
              title={t('assistants.limit.title', { count: limit })}
              action={
                nextPlan ? (
                  <Link to={UPGRADE_PATH} className="text-table font-medium text-accent-ink hover:underline">
                    {t('assistants.limit.upgrade', { plan: g.plan(nextPlan) })}
                  </Link>
                ) : undefined
              }
            >
              {t('assistants.limit.body')}
            </Notice>
          ) : null}
        </section>

        {assistants.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-18" />
            <Skeleton className="h-18" />
          </div>
        ) : assistants.isError ? (
          <Notice
            tone={isMissingRoute(assistants.error) ? 'neutral' : 'warning'}
            title={isMissingRoute(assistants.error) ? t('assistants.unavailable.title') : t('assistants.loadError')}
            action={
              <Button size="sm" variant="secondary" onClick={() => void assistants.refetch()}>
                {t('common.retry')}
              </Button>
            }
          >
            {isMissingRoute(assistants.error) ? t('assistants.unavailable.body', { keys: panelKeys }) : humanError(assistants.error)}
          </Notice>
        ) : assistants.data.items.length === 0 ? (
          <EmptyState
            size="compact"
            title={t('assistants.empty.title')}
            description={t('assistants.empty.body')}
            action={
              canManage ? (
                <Button variant="primary" icon={Plus} onClick={() => openEditor()}>
                  {t('assistants.create')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <FieldGroup id="assistants-list" title={t('assistants.list.title')} description={t('assistants.list.description', { keys: panelKeys })} footer={t('assistants.list.footer')}>
            <ul className="divide-y divide-divider">
              {assistants.data.items.map((assistant) => (
                <li key={assistant.id} data-assistant={assistant.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3 first:pt-0">
                  <AssistantMark spec={assistant.avatar} size={40} />
                  <div className="min-w-0 flex-1 basis-48">
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                      <p className="truncate font-medium text-fg-strong">{assistant.name}</p>
                      {assistant.isDefault ? <span className="text-table text-fg">{t('assistants.badge.default')}</span> : null}
                      <span className="text-table text-fg-muted">{assistant.visibility === 'private' ? t('assistants.badge.private') : t('assistants.badge.shared')}</span>
                    </div>
                    <p className="mt-0.5 truncate text-table text-fg-muted">
                      {t('assistants.meta', {
                        mode: t(`modes.${assistant.defaultMode}.name`),
                        tone: t(`tones.${assistant.personality.tone}`),
                        language: languageLabel(assistant),
                        scopes: scopeSummary(assistant),
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {assistant.canEdit ? (
                      <Button size="sm" variant="secondary" icon={Pencil} onClick={() => openEditor(assistant.id)}>
                        {t('assistants.edit')}
                      </Button>
                    ) : (
                      <span className="text-table text-fg-muted">{t('assistants.readOnly')}</span>
                    )}
                    {assistant.canEdit ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton size="sm" variant="ghost" icon={MoreHorizontal} label={t('assistants.more', { name: assistant.name })} tooltip={false} />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem icon={Star} disabled={assistant.isDefault} onSelect={() => makeDefault(assistant)}>
                            {t('assistants.makeDefault')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            icon={Archive}
                            danger
                            disabled={assistant.isDefault}
                            hint={assistant.isDefault ? t('assistants.archiveDefaultHint') : undefined}
                            onSelect={() => void archive(assistant)}
                          >
                            {t('assistants.archive')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </FieldGroup>
        )}

        <div className="flex max-w-xl flex-col gap-3 text-table">
          <p className="text-fg-muted">
            <Link to="/ajustes/ia" className="inline-flex items-center gap-1 font-medium text-accent-ink hover:underline">
              {t('assistants.links.ai.title')}
              <ArrowRight aria-hidden className="size-3.5" />
            </Link>
            <span className="block">{t('assistants.links.ai.body')}</span>
          </p>
          <p className="text-fg-muted">
            <span className="block font-medium text-fg-strong">{t('assistants.links.memory.title')}</span>
            {t('assistants.links.memory.body')}
          </p>
        </div>
      </div>

      <AssistantEditorSheet
        open={editing !== null}
        assistant={editing?.id ? assistants.data?.items.find((a) => a.id === editing.id) : undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      />
    </div>
  )
}
