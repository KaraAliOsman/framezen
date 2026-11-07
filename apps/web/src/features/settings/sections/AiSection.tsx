import { useMemo } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ClipboardCheck, MessageCircle, Zap, type LucideIcon } from 'lucide-react'
import {
  ASSISTANT_MODES,
  TOOL_RISKS,
  creditsForUsage,
  planLimits,
  toolDecision,
  type AssistantMode,
  type AssistantProfile,
  type AssistantStatus,
  type AssistantV2AiReason,
  type ToolDecision,
} from '@dekopen/shared'
import { humanError, request } from '../../../lib/api'
import { useSession } from '../../../lib/auth'
import { cn } from '../../../lib/cn'
import { useFormat, useT } from '../../../lib/i18n'
import { describePlan } from '../../../lib/plan'
import { Meter, Notice, SegmentedControl, Skeleton, StatusDot, toast, UPGRADE_PATH, useShortcutText, type StatusTone } from '../../../ui'
import { AiDiagnostics } from './AiDiagnostics'
import { FieldGroup, SectionHeader } from '../components/SectionHeader'
import es from '../i18n/es'
import { notifyAssistantsChanged } from '../lib/assistantBridge'
import { isMissingRoute, useAssistants, useAssistantStatus, usePatchAssistant } from '../lib/assistantsApi'
import { useBilling } from '../lib/accountApi'
import { useCanManageSettings } from '../lib/region'

const MODE_ICONS: Record<AssistantMode, LucideIcon> = { chat: MessageCircle, supervised: ClipboardCheck, full: Zap }

/** Ejemplos de consumo calculados con la fórmula real del plan (créditos por tokens). */
export const CREDIT_EXAMPLES = {
  question: creditsForUsage({ inputTokens: 6_000, cachedInputTokens: 4_000, outputTokens: 400 }),
  quote: creditsForUsage({ inputTokens: 40_000, cachedInputTokens: 30_000, outputTokens: 3_000 }),
} as const

type AiState = 'available' | AssistantV2AiReason | 'unknown'

/** Estado de la IA: primero el contrato v2 y, si aún no responde, el v1 (`/api/assistant/status`). */
function useAiState(hasAiFeature: boolean): { state: AiState; loading: boolean } {
  const v2 = useAssistantStatus()
  const v1 = useQuery({
    queryKey: ['assistant', 'status'],
    queryFn: () => request<AssistantStatus>('/assistant/status', { retry: 0 }),
    enabled: v2.isError,
    retry: false,
    staleTime: 30_000,
  })
  if (v2.data?.ai) return { state: v2.data.ai.available ? 'available' : (v2.data.ai.reason ?? 'unknown'), loading: false }
  if (v1.data) {
    if (v1.data.mode === 'ai') return { state: 'available', loading: false }
    const reason = v1.data.reason
    return { state: reason === 'plan' || reason === 'no_key' || reason === 'no_credits' ? reason : 'unknown', loading: false }
  }
  if (v2.isPending || (v2.isError && v1.isPending)) return { state: hasAiFeature ? 'unknown' : 'plan', loading: true }
  return { state: hasAiFeature ? 'unknown' : 'plan', loading: false }
}

const STATE_TONE: Record<AiState, StatusTone> = { available: 'success', plan: 'neutral', no_key: 'warning', no_credits: 'warning', daily_limit: 'warning', provider: 'danger', unknown: 'neutral' }

/** IA: estado, créditos del mes, topes diarios, modos y modo por defecto de cada asistente. */
export function AiSection() {
  const t = useT(es)
  const fmt = useFormat()
  const me = useSession()
  const billing = useBilling().data ?? me.billing
  const info = describePlan(billing)
  const status = useAssistantStatus()
  const { state, loading } = useAiState(info.has('assistant'))
  const limits = planLimits(billing.plan)
  const used = billing.aiCredits.used
  const included = billing.aiCredits.included + billing.aiCredits.extra
  const turnsLeft = status.data?.turnsLeftToday
  const dailyLeft = status.data?.credits?.dailyLeft

  return (
    <div>
      <SectionHeader title={t('ai.title')} description={t('ai.description')} />
      <div className="flex flex-col gap-10">
        <section aria-label={t('ai.overview')} className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-3">
          <div className="min-w-0">
            <p className="text-table text-fg-muted">{t('ai.state.title')}</p>
            {loading ? (
              <Skeleton className="mt-2 h-6 w-32" />
            ) : (
              <p className="mt-1.5 text-h4 font-medium text-fg-strong">
                <StatusDot tone={STATE_TONE[state]}>{t(`ai.state.${state}.title`)}</StatusDot>
              </p>
            )}
            <p className="mt-1.5 text-table text-fg-muted">{t(`ai.state.${state}.body`)}</p>
            {state === 'plan' || state === 'no_credits' ? (
              <Link to={UPGRADE_PATH} className="mt-2 inline-flex text-table font-medium text-accent-ink hover:underline">
                {t('ai.state.seePlan')}
              </Link>
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="text-table text-fg-muted">{t('ai.credits.title')}</p>
            {included > 0 ? (
              <>
                <p className="figure mt-1 text-h3 font-medium text-fg-strong">
                  {t.rich('ai.credits.of', { used: fmt.number(used), included: fmt.number(included), muted: <span className="text-base font-normal text-fg-muted" /> })}
                </p>
                <Meter className="mt-3" value={used} max={included} tone="auto" aria-label={t('ai.credits.title')} />
                <p className="mt-2 text-meta text-fg-muted">
                  {billing.aiCredits.resetsAt
                    ? t(info.isTrial ? 'ai.credits.trialEnds' : 'ai.credits.resets', { date: fmt.date(billing.aiCredits.resetsAt, 'dayMonth') })
                    : info.isTrial
                      ? t('ai.credits.duringTrial')
                      : t('ai.credits.monthly')}
                  {billing.aiCredits.extra > 0 ? ` · ${t('ai.credits.extra', { count: fmt.number(billing.aiCredits.extra) })}` : ''}
                </p>
              </>
            ) : (
              <p className="mt-1 text-table text-fg-muted">{t('ai.credits.none')}</p>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-table text-fg-muted">{t('ai.daily.title')}</p>
            {limits.aiTurnsPerUserDay > 0 ? (
              <div className="mt-2 flex flex-col gap-3">
                <Meter
                  value={turnsLeft === undefined ? 0 : Math.max(0, limits.aiTurnsPerUserDay - turnsLeft)}
                  max={limits.aiTurnsPerUserDay}
                  tone="auto"
                  label={t('ai.daily.turns')}
                  valueLabel={
                    turnsLeft === undefined
                      ? t('ai.daily.upTo', { count: fmt.number(limits.aiTurnsPerUserDay) })
                      : t('ai.daily.left', { left: fmt.number(turnsLeft), max: fmt.number(limits.aiTurnsPerUserDay) })
                  }
                />
                <Meter
                  value={dailyLeft === undefined ? 0 : Math.max(0, limits.aiCreditsPerOrgDay - dailyLeft)}
                  max={limits.aiCreditsPerOrgDay}
                  tone="auto"
                  label={t('ai.daily.orgCredits')}
                  valueLabel={
                    dailyLeft === undefined
                      ? t('ai.daily.upTo', { count: fmt.number(limits.aiCreditsPerOrgDay) })
                      : t('ai.daily.left', { left: fmt.number(dailyLeft), max: fmt.number(limits.aiCreditsPerOrgDay) })
                  }
                />
              </div>
            ) : (
              <p className="mt-1 text-table text-fg-muted">{t('ai.daily.none')}</p>
            )}
          </div>
        </section>

        <AiDiagnostics />
        <ModesPanel />
        <DefaultModesPanel allowed={status.data?.modes} />

        <FieldGroup title={t('ai.howCredits.title')} description={t('ai.howCredits.description')}>
          <dl className="divide-y divide-divider">
            {(
              [
                ['local', 0],
                ['question', CREDIT_EXAMPLES.question],
                ['quote', CREDIT_EXAMPLES.quote],
              ] as const
            ).map(([key, credits]) => (
              <div key={key} className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0">
                <dt className="text-fg">{t(`ai.howCredits.examples.${key}`)}</dt>
                <dd className="shrink-0 text-fg-muted tabular">
                  {key === 'local' ? t('ai.howCredits.free') : t('ai.howCredits.approx', { count: credits })}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-table text-fg-muted">{t('ai.howCredits.note')}</p>
        </FieldGroup>
      </div>
    </div>
  )
}

const DECISION_STYLE: Record<ToolDecision, string> = {
  execute: 'text-success',
  approve: 'text-accent-ink',
  deny: 'text-fg-faint',
}

/** Qué hace cada modo con cada tipo de acción (sale de la política real, `toolDecision`). */
function ModesPanel() {
  const t = useT(es)
  return (
    <FieldGroup title={t('ai.modes.title')} description={t('ai.modes.description')} footer={t('ai.modes.footer')} bodyClassName="flex flex-col gap-5">
      <div className="grid gap-x-10 gap-y-4 md:grid-cols-3">
        {ASSISTANT_MODES.map((mode) => {
          const Icon = MODE_ICONS[mode]
          return (
            <div key={mode} className="min-w-0">
              <p className="flex items-center gap-2 font-medium text-fg-strong">
                <Icon aria-hidden strokeWidth={1.75} className="size-4 text-fg-muted" />
                {t(`modes.${mode}.name`)}
              </p>
              <p className="mt-0.5 text-table font-medium text-fg">{t(`modes.${mode}.short`)}</p>
              <p className="mt-1.5 text-table text-fg-muted">{t(`modes.${mode}.description`)}</p>
            </div>
          )
        })}
      </div>
      <div className="scrollbar-quiet overflow-x-auto">
        <table className="w-full min-w-xl border-collapse text-table">
          <caption className="sr-only">{t('ai.modes.tableCaption')}</caption>
          <thead>
            <tr className="border-b border-divider text-left text-table text-fg-muted">
              <th scope="col" className="py-2 pr-3 font-normal">
                {t('ai.modes.action')}
              </th>
              {ASSISTANT_MODES.map((mode) => (
                <th key={mode} scope="col" className="px-3 py-2 font-normal">
                  {t(`modes.${mode}.name`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {TOOL_RISKS.map((risk) => (
              <tr key={risk} data-risk={risk}>
                <th scope="row" className="py-2.5 pr-3 text-left font-normal text-fg">
                  {t(`ai.risks.${risk}`)}
                </th>
                {ASSISTANT_MODES.map((mode) => {
                  const decision = toolDecision(mode, risk)
                  return (
                    <td key={mode} data-decision={decision} className={cn('px-3 py-2.5 font-medium', DECISION_STYLE[decision])}>
                      {t(`ai.decision.${decision}`)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FieldGroup>
  )
}

/** Modo con el que abre cada asistente (se puede cambiar en cada conversación). */
function DefaultModesPanel({ allowed }: { allowed?: readonly AssistantMode[] }) {
  const t = useT(es)
  const panelKeys = useShortcutText('mod+j')
  const assistants = useAssistants()
  const patch = usePatchAssistant()
  const canManage = useCanManageSettings()
  const modes = allowed?.length ? allowed : ASSISTANT_MODES

  const setMode = (assistant: AssistantProfile, defaultMode: AssistantMode) =>
    patch.mutate(
      { id: assistant.id, patch: { version: assistant.version, defaultMode } },
      {
        onSuccess: () => {
          notifyAssistantsChanged()
          toast.success(t('ai.defaults.saved', { name: assistant.name, mode: t(`modes.${defaultMode}.name`) }))
        },
        onError: (error) => toast.error(humanError(error)),
      },
    )

  const options = useMemo(() => ASSISTANT_MODES.map((mode) => ({ value: mode, label: t(`modes.${mode}.name`), disabled: !modes.includes(mode) })), [modes, t])

  return (
    <FieldGroup id="ai-defaults" title={t('ai.defaults.title')} description={t('ai.defaults.description')}>
      {assistants.isPending ? (
        <Skeleton className="h-14" />
      ) : assistants.isError ? (
        <Notice tone="neutral" size="compact">
          {isMissingRoute(assistants.error) ? t('assistants.unavailable.body', { keys: panelKeys }) : humanError(assistants.error)}
        </Notice>
      ) : assistants.data.items.length === 0 ? (
        <p className="text-table text-fg-muted">{t('ai.defaults.empty')}</p>
      ) : (
        <ul className="divide-y divide-divider">
          {assistants.data.items.map((assistant) => (
            <li key={assistant.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0">
              <p className="min-w-0 flex-1 basis-32 truncate font-medium text-fg-strong">{assistant.name}</p>
              <SegmentedControl
                aria-label={t('ai.defaults.aria', { name: assistant.name })}
                size="sm"
                value={assistant.defaultMode}
                onValueChange={(mode) => setMode(assistant, mode)}
                options={options.map((o) => ({ ...o, disabled: o.disabled || !assistant.canEdit || !canManage }))}
              />
            </li>
          ))}
        </ul>
      )}
    </FieldGroup>
  )
}
