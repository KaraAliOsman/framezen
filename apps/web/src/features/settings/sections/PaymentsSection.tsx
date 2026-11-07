/**
 * Envío y pagos: cómo sale la cotización y cómo le pagan al taller. Nada viene prellenado: sin datos,
 * el cliente no ve ninguna sección de pago. El dinero va directo al taller; DEKOPEN no lo toca.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import {
  BANK_ACCOUNT_TYPES,
  DEFAULT_PAYMENTS,
  DEFAULT_SENDING,
  PAYMENT_LIMITS,
  safePaymentUrl,
  type BankAccountType,
  type DepositMode,
  type FlowKeysBody,
  type FlowKeysStatus,
  type PaymentAccount,
  type PaymentLink,
  type PaymentMilestone,
  type PaymentSettings,
  type PaymentShowWhen,
  type SendFormat,
  type SendingPrefs,
} from '@dekopen/shared'
import { humanError, request } from '../../../lib/api'
import { useSettings, useUpdateSettings } from '../../../lib/hooks'
import { useOrgCurrency, useT } from '../../../lib/i18n'
import { Button, Field, IconButton, Input, MoneyField, Notice, NumberField, SegmentedControl, Select, Skeleton, Switch, Textarea, toast } from '../../../ui'
import { LoadError } from '../components/LoadError'
import { FieldGroup, SaveError, SectionHeader } from '../components/SectionHeader'
import { SettingRow } from '../components/SettingRow'
import es from '../i18n/es'
import { useCanManageSettings } from '../lib/region'
import { combineStatus, useAutosave } from '../lib/useAutosave'

const newId = () => Math.random().toString(36).slice(2, 10)

/** Solo se guarda un enlace completo y válido: uno a medio escribir no debe frenar lo demás. */
function savable(payments: PaymentSettings): PaymentSettings {
  return { ...payments, links: payments.links.filter((link) => link.label.trim() && safePaymentUrl(link.url)).map((link) => ({ ...link, url: safePaymentUrl(link.url)! })) }
}

export function PaymentsSection() {
  const t = useT(es)
  const settings = useSettings()
  const update = useUpdateSettings()
  const canManage = useCanManageSettings()
  const sendingSave = useAutosave<{ sending: SendingPrefs }>((patch) => update.mutateAsync(patch), { key: 'settings:sending' })
  const paymentsSave = useAutosave<{ payments: PaymentSettings }>((patch) => update.mutateAsync(patch), { key: 'settings:payments' })
  const [sending, setSending] = useState<SendingPrefs | null>(null)
  const [payments, setPayments] = useState<PaymentSettings | null>(null)

  useEffect(() => {
    if (!settings.data) return
    setSending((s) => s ?? sendingSave.unsaved()?.sending ?? settings.data.sending ?? DEFAULT_SENDING)
    setPayments((p) => p ?? paymentsSave.unsaved()?.payments ?? settings.data.payments ?? DEFAULT_PAYMENTS)
  }, [settings.data, sendingSave.unsaved, paymentsSave.unsaved])

  if (settings.isError && !settings.data) return <LoadError title={t('payments.title')} error={settings.error} onRetry={() => void settings.refetch()} />
  if (!sending || !payments) return <Skeleton className="h-96 w-full" />

  const changeSending = (patch: Partial<SendingPrefs>) => {
    const next = { ...sending, ...patch }
    setSending(next)
    sendingSave.queue({ sending: next })
  }
  const changePayments = (patch: Partial<PaymentSettings>) => {
    const next = { ...payments, ...patch }
    setPayments(next)
    paymentsSave.queue({ payments: savable(next) })
  }
  const status = combineStatus(sendingSave.status, paymentsSave.status)
  const savedAt = paymentsSave.savedAt ?? sendingSave.savedAt

  return (
    <div className="@container">
      <SectionHeader title={t('payments.title')} description={t('payments.description')} status={status} savedAt={savedAt} />
      <SaveError message={sendingSave.error ?? paymentsSave.error} />
      {!canManage ? (
        <Notice tone="neutral" size="compact" className="mb-6">
          {t('payments.ownerOnly')}
        </Notice>
      ) : null}
      <fieldset disabled={!canManage} className="flex min-w-0 flex-col gap-10">
        <FieldGroup title={t('payments.send.title')}>
          <SettingRow title={t('payments.send.format')} description={t('payments.send.formatHint')} wide>
            <SegmentedControl<SendFormat>
              aria-label={t('payments.send.format')}
              block
              value={sending.format}
              onValueChange={(format) => changeSending({ format })}
              options={(['pdf', 'link', 'both'] as const).map((value) => ({ value, label: t(`payments.send.options.${value}`) }))}
            />
          </SettingRow>
          <SettingRow title={t('payments.send.view3d')} description={t('payments.send.view3dHint')}>
            <Switch aria-label={t('payments.send.view3d')} checked={sending.portal3d} onCheckedChange={(portal3d) => changeSending({ portal3d })} />
          </SettingRow>
          <SettingRow title={t('payments.send.ar')} description={t('payments.send.arHint')}>
            <Switch aria-label={t('payments.send.ar')} checked={sending.portal3d && sending.portalAr} disabled={!sending.portal3d} onCheckedChange={(portalAr) => changeSending({ portalAr })} />
          </SettingRow>
        </FieldGroup>

        <FieldGroup title={t('payments.accounts.title')} description={t('payments.accounts.description')}>
          <div className="flex flex-col gap-6">
            {payments.accounts.map((account, index) => (
              <AccountForm
                key={account.id}
                account={account}
                index={index}
                onChange={(patch) => changePayments({ accounts: payments.accounts.map((a) => (a.id === account.id ? { ...a, ...patch } : a)) })}
                onRemove={() => changePayments({ accounts: payments.accounts.filter((a) => a.id !== account.id) })}
              />
            ))}
            {payments.accounts.length < PAYMENT_LIMITS.accounts ? (
              <div>
                <Button
                  icon={Plus}
                  onClick={() => changePayments({ accounts: [...payments.accounts, { id: newId(), holder: '', rut: '', bank: '', type: 'corriente', number: '', email: '' }] })}
                >
                  {t('payments.accounts.add')}
                </Button>
              </div>
            ) : null}
          </div>
        </FieldGroup>

        <FieldGroup title={t('payments.links.title')} description={t('payments.links.description')}>
          <div className="flex flex-col gap-4">
            {payments.links.map((link) => (
              <LinkForm
                key={link.id}
                link={link}
                onChange={(patch) => changePayments({ links: payments.links.map((l) => (l.id === link.id ? { ...l, ...patch } : l)) })}
                onRemove={() => changePayments({ links: payments.links.filter((l) => l.id !== link.id) })}
              />
            ))}
            {payments.links.length < PAYMENT_LIMITS.links ? (
              <div>
                <Button icon={Plus} onClick={() => changePayments({ links: [...payments.links, { id: newId(), label: '', url: '' }] })}>
                  {t('payments.links.add')}
                </Button>
              </div>
            ) : null}
          </div>
        </FieldGroup>

        <FieldGroup title={t('payments.instructions.title')} description={t('payments.instructions.description')}>
          <Textarea
            rows={4}
            value={payments.instructions}
            maxLength={PAYMENT_LIMITS.instructions}
            aria-label={t('payments.instructions.title')}
            onChange={(e) => changePayments({ instructions: e.target.value })}
          />
        </FieldGroup>

        <FieldGroup title={t('payments.deposit.title')} description={t('payments.deposit.description')}>
          <SettingRow title={t('payments.deposit.mode')} wide>
            <Select<DepositMode>
              aria-label={t('payments.deposit.mode')}
              value={payments.deposit.mode}
              onValueChange={(mode) => changePayments({ deposit: { mode, value: 0, milestones: [] } })}
              options={(['none', 'percent', 'amount', 'milestones'] as const).map((value) => ({ value, label: t(`payments.deposit.modes.${value}`) }))}
            />
          </SettingRow>
          {payments.deposit.mode === 'percent' ? (
            <SettingRow title={t('payments.deposit.percent')}>
              <NumberField
                aria-label={t('payments.deposit.percent')}
                value={payments.deposit.value}
                min={0}
                max={100}
                unit="%"
                onChange={(value) => changePayments({ deposit: { mode: 'percent', value: value ?? 0 } })}
              />
            </SettingRow>
          ) : payments.deposit.mode === 'amount' ? (
            <DepositAmount value={payments.deposit.value} label={t('payments.deposit.amount')} onChange={(value) => changePayments({ deposit: { mode: 'amount', value } })} />
          ) : payments.deposit.mode === 'milestones' ? (
            <Milestones list={payments.deposit.milestones ?? []} onChange={(milestones) => changePayments({ deposit: { mode: 'milestones', value: 0, milestones } })} />
          ) : null}
        </FieldGroup>

        <FieldGroup title={t('payments.when.title')} description={t('payments.when.description')}>
          <SegmentedControl<PaymentShowWhen>
            aria-label={t('payments.when.title')}
            block
            value={payments.showWhen}
            onValueChange={(showWhen) => changePayments({ showWhen })}
            options={[
              { value: 'after_accept', label: t('payments.when.afterAccept') },
              { value: 'always', label: t('payments.when.always') },
            ]}
          />
          <SettingRow className="mt-4" title={t('payments.when.pdf')} description={t('payments.when.pdfHint')}>
            <Switch aria-label={t('payments.when.pdf')} checked={payments.showInPdf} onCheckedChange={(showInPdf) => changePayments({ showInPdf })} />
          </SettingRow>
        </FieldGroup>

        {canManage ? <FlowGroup /> : null}
      </fieldset>
    </div>
  )
}

function Milestones({ list, onChange }: { list: PaymentMilestone[]; onChange: (list: PaymentMilestone[]) => void }) {
  const t = useT(es)
  const sum = list.reduce((acc, m) => acc + m.pct, 0)
  const patch = (id: string, next: Partial<PaymentMilestone>) => onChange(list.map((m) => (m.id === id ? { ...m, ...next } : m)))
  return (
    <div className="flex flex-col gap-3 pt-3">
      {list.map((milestone, index) => (
        <div key={milestone.id} className="grid grid-cols-[minmax(0,1fr)_96px_auto] items-center gap-2">
          <Input aria-label={t('payments.deposit.milestoneLabel', { number: index + 1 })} placeholder={t('payments.deposit.milestoneLabel', { number: index + 1 })} maxLength={PAYMENT_LIMITS.label} value={milestone.label} onChange={(e) => patch(milestone.id, { label: e.target.value })} />
          <NumberField aria-label={t('payments.deposit.percent')} value={milestone.pct} min={0} max={100} unit="%" onChange={(pct) => patch(milestone.id, { pct: pct ?? 0 })} />
          <IconButton icon={Trash2} size="sm" label={t('payments.deposit.milestoneRemove')} tooltip={false} onClick={() => onChange(list.filter((m) => m.id !== milestone.id))} />
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {list.length < PAYMENT_LIMITS.milestones ? (
          <Button icon={Plus} onClick={() => onChange([...list, { id: newId(), label: '', pct: 0 }])}>
            {t('payments.deposit.milestoneAdd')}
          </Button>
        ) : (
          <span />
        )}
        {list.length ? <span className={sum === 100 ? 'text-table text-fg-muted' : 'text-table text-warning'}>{t('payments.deposit.milestoneSum', { pct: sum })}</span> : null}
      </div>
    </div>
  )
}

function DepositAmount({ value, label, onChange }: { value: number; label: string; onChange: (value: number) => void }) {
  const currency = useOrgCurrency()
  return (
    <SettingRow title={label}>
      <MoneyField aria-label={label} value={value} currency={currency ?? undefined} onChange={(amount) => onChange(amount ?? 0)} />
    </SettingRow>
  )
}

function AccountForm({ account, index, onChange, onRemove }: { account: PaymentAccount; index: number; onChange: (patch: Partial<PaymentAccount>) => void; onRemove: () => void }) {
  const t = useT(es)
  return (
    <fieldset className="grid min-w-0 grid-cols-1 gap-3 @xl:grid-cols-2">
      <legend className="mb-3 flex w-full items-center justify-between gap-3 text-table font-medium text-fg-strong">
        {t('payments.accounts.item', { number: index + 1 })}
        <IconButton icon={Trash2} size="sm" label={t('payments.accounts.remove')} tooltip={false} onClick={onRemove} />
      </legend>
      <Field label={t('payments.accounts.holder')}>
        <Input value={account.holder} maxLength={120} autoComplete="off" onChange={(e) => onChange({ holder: e.target.value })} />
      </Field>
      <Field label={t('payments.accounts.rut')}>
        <Input value={account.rut} maxLength={20} autoComplete="off" onChange={(e) => onChange({ rut: e.target.value })} />
      </Field>
      <Field label={t('payments.accounts.bank')}>
        <Input value={account.bank} maxLength={80} autoComplete="off" onChange={(e) => onChange({ bank: e.target.value })} />
      </Field>
      <Field label={t('payments.accounts.type')}>
        <Select<BankAccountType>
          value={account.type}
          onValueChange={(type) => onChange({ type })}
          options={BANK_ACCOUNT_TYPES.map((value) => ({ value, label: t(`payments.accounts.types.${value}`) }))}
        />
      </Field>
      <Field label={t('payments.accounts.number')}>
        <Input value={account.number} maxLength={40} inputMode="numeric" autoComplete="off" onChange={(e) => onChange({ number: e.target.value })} />
      </Field>
      <Field label={t('payments.accounts.email')} optional>
        <Input type="email" value={account.email} maxLength={254} autoComplete="off" onChange={(e) => onChange({ email: e.target.value })} />
      </Field>
    </fieldset>
  )
}

function LinkForm({ link, onChange, onRemove }: { link: PaymentLink; onChange: (patch: Partial<PaymentLink>) => void; onRemove: () => void }) {
  const t = useT(es)
  const [touched, setTouched] = useState(false)
  const invalid = touched && link.url.trim() !== '' && !safePaymentUrl(link.url)
  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-3 @xl:grid-cols-[minmax(0,200px)_minmax(0,1fr)_auto]">
      <Field label={t('payments.links.label')}>
        <Input value={link.label} maxLength={PAYMENT_LIMITS.label} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <Field label={t('payments.links.url')} error={invalid ? t('payments.links.invalid') : undefined}>
        <Input
          type="url"
          inputMode="url"
          value={link.url}
          maxLength={PAYMENT_LIMITS.url}
          placeholder="https://"
          autoComplete="off"
          onBlur={() => setTouched(true)}
          onChange={(e) => onChange({ url: e.target.value })}
        />
      </Field>
      <IconButton icon={Trash2} size="sm" label={t('payments.links.remove')} tooltip={false} onClick={onRemove} className="@xl:mt-7" />
    </div>
  )
}

// ── Flow con la cuenta del taller ────────────────────────────────────────────
const FLOW_KEY = ['payment-keys', 'flow'] as const

function FlowGroup() {
  const t = useT(es)
  const client = useQueryClient()
  const status = useQuery({ queryKey: FLOW_KEY, queryFn: () => request<FlowKeysStatus>('/settings/payments/flow') })
  const [apiKey, setApiKey] = useState('')
  const [secretKey, setSecretKey] = useState('')
  const [sandbox, setSandbox] = useState(false)
  const done = (next: FlowKeysStatus) => {
    client.setQueryData(FLOW_KEY, next)
    // Las llaves no se quedan en pantalla ni en memoria del formulario.
    setApiKey('')
    setSecretKey('')
  }
  const save = useMutation({
    mutationFn: (body: FlowKeysBody) => request<FlowKeysStatus>('/settings/payments/flow', { method: 'PUT', body }),
    onSuccess: (next) => {
      done(next)
      toast.success(t('payments.flow.saved'))
    },
    onError: (error) => toast.error(humanError(error)),
  })
  const remove = useMutation({
    mutationFn: () => request<FlowKeysStatus>('/settings/payments/flow', { method: 'DELETE' }),
    onSuccess: done,
    onError: (error) => toast.error(humanError(error)),
  })
  const data = status.data
  return (
    <FieldGroup title={t('payments.flow.title')} description={t('payments.flow.description')}>
      {!data ? (
        status.isError ? null : <Skeleton className="h-16 w-full" />
      ) : !data.available ? (
        <Notice tone="neutral" size="compact">
          {t('payments.flow.unavailable')}
        </Notice>
      ) : data.configured ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-fg">{t(data.sandbox ? 'payments.flow.connectedSandbox' : 'payments.flow.connected')}</p>
          <Button variant="secondary" onClick={() => remove.mutate()} loading={remove.isPending}>
            {t('payments.flow.disconnect')}
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate({ apiKey: apiKey.trim(), secretKey: secretKey.trim(), sandbox })
          }}
        >
          <Field label={t('payments.flow.apiKey')}>
            <Input value={apiKey} autoComplete="off" spellCheck={false} onChange={(e) => setApiKey(e.target.value)} />
          </Field>
          <Field label={t('payments.flow.secretKey')}>
            <Input type="password" value={secretKey} autoComplete="new-password" spellCheck={false} onChange={(e) => setSecretKey(e.target.value)} />
          </Field>
          <Switch label={t('payments.flow.sandbox')} description={t('payments.flow.sandboxHint')} checked={sandbox} onCheckedChange={setSandbox} />
          <div>
            <Button type="submit" variant="primary" disabled={!apiKey.trim() || !secretKey.trim()} loading={save.isPending}>
              {t('payments.flow.connect')}
            </Button>
          </div>
        </form>
      )}
    </FieldGroup>
  )
}
