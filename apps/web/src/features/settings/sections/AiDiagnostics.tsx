import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ASSISTANT_V2_PATHS, type AiDiagnostics as Diagnostics, type AiProviderState } from '@dekopen/shared'
import { humanError, request } from '../../../lib/api'
import { useFormat, useT } from '../../../lib/i18n'
import { Button, Notice, Skeleton, StatusDot, toast, type StatusTone } from '../../../ui'
import { FieldGroup } from '../components/SectionHeader'
import es from '../i18n/es'
import { apiPath, assistantStatusKey, isMissingRoute, useAssistantStatus } from '../lib/assistantsApi'
import { useCanManageSettings } from '../lib/region'

const diagnosticsKey = ['assistant-v2', 'diagnostics'] as const

const TONE: Record<AiProviderState, StatusTone> = {
  connected: 'success',
  no_key: 'warning',
  key_rejected: 'danger',
  no_balance: 'danger',
  model_unavailable: 'danger',
  token_plan: 'danger',
  no_network: 'warning',
  blocked: 'danger',
  busy: 'warning',
  misconfigured: 'danger',
  unknown: 'neutral',
}

/** Conexión real con la IA: solo para quien administra la cuenta. No muestra saldo ni la clave. */
export function AiDiagnostics() {
  const canManage = useCanManageSettings()
  return canManage ? <Panel /> : null
}

function Panel() {
  const t = useT(es)
  const fmt = useFormat()
  const client = useQueryClient()
  const query = useQuery({
    queryKey: diagnosticsKey,
    queryFn: () => request<Diagnostics>(apiPath(ASSISTANT_V2_PATHS.diagnostics), { retry: 0 }),
    retry: false,
    staleTime: 30_000,
  })
  // Un turno que falla cambia el estado general: el detalle no puede quedar contradiciéndolo.
  const provider = useAssistantStatus().data?.ai.provider
  const { data: shown, refetch } = query
  useEffect(() => {
    if (provider && shown && provider !== shown.state) void refetch()
  }, [provider, shown, refetch])
  const check = useMutation({
    mutationFn: () => request<Diagnostics>(apiPath(ASSISTANT_V2_PATHS.diagnostics), { method: 'POST', retry: 0 }),
    onSuccess: (data) => {
      client.setQueryData(diagnosticsKey, data)
      void client.invalidateQueries({ queryKey: assistantStatusKey })
    },
    onError: (error) => toast.error(humanError(error)),
  })
  if (query.isError && isMissingRoute(query.error)) return null
  const data = query.data

  return (
    <FieldGroup
      id="ai-diagnostics"
      title={t('ai.diagnostics.title')}
      description={t('ai.diagnostics.description')}
      aside={
        <Button size="sm" variant="secondary" loading={check.isPending} onClick={() => check.mutate()}>
          {t('ai.diagnostics.check')}
        </Button>
      }
    >
      {query.isPending ? (
        <Skeleton className="h-14" />
      ) : !data ? (
        <Notice tone="neutral" size="compact">
          {humanError(query.error)}
        </Notice>
      ) : (
        <div className="flex flex-col gap-3" data-testid="ai-diagnostics" data-state={data.state}>
          <div>
            <p className="font-medium text-fg-strong">
              <StatusDot tone={TONE[data.state]}>{t(`ai.diagnostics.states.${data.state}.title`)}</StatusDot>
            </p>
            <p className="mt-1 text-table text-fg-muted">{t(`ai.diagnostics.states.${data.state}.body`)}</p>
          </div>
          <dl className="grid gap-x-6 gap-y-2 text-table sm:grid-cols-3">
            {data.model ? (
              <div>
                <dt className="text-fg-muted">{t('ai.diagnostics.model')}</dt>
                <dd className="font-medium text-fg-strong">{data.model}</dd>
              </div>
            ) : null}
            {data.latencyMs !== undefined ? (
              <div>
                <dt className="text-fg-muted">{t(data.deep ? 'ai.diagnostics.latencyReal' : 'ai.diagnostics.latencyQuick')}</dt>
                <dd className="font-medium text-fg-strong tabular">{t('ai.diagnostics.ms', { value: fmt.number(data.latencyMs) })}</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-fg-muted">{t('ai.diagnostics.checkedAt')}</dt>
              <dd className="font-medium text-fg-strong">{fmt.time(data.checkedAt)}</dd>
            </div>
          </dl>
          {data.detail ? <p className="text-meta text-fg-muted">{data.detail}</p> : null}
        </div>
      )}
    </FieldGroup>
  )
}
