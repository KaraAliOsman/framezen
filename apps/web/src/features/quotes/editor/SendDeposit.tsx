/**
 * «Marcar abono recibido». DEKOPEN no ve las transferencias: el taller lo marca y el cliente lo ve
 * en su portal. Lo mal marcado se deshace con un toque.
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Undo2 } from 'lucide-react'
import { PAYMENT_METHODS, type PaymentMethod, type QuotePaymentBody, type QuotePaymentsResponse } from '@dekopen/shared'
import { humanError, request } from '../../../lib/api'
import { useFormat, useT } from '../../../lib/i18n'
import { Button, Dialog, DialogContent, Field, IconButton, Input, MoneyField, Select, Skeleton } from '../../../ui'
import es from '../i18n/es'
import { useEditorShallow, useEditorUi } from './context'
import { toast } from './toasts'

const paymentsKey = (quoteId: string) => ['quote-payments', quoteId] as const
const today = () => new Date().toLocaleDateString('en-CA')

export function SendDepositDialog() {
  const open = useEditorUi((s) => s.depositOpen)
  const set = useEditorUi((s) => s.set)
  return <Dialog open={open} onOpenChange={(o) => set({ depositOpen: o })}>{open ? <DepositContent onClose={() => set({ depositOpen: false })} /> : null}</Dialog>
}

function DepositContent({ onClose }: { onClose: () => void }) {
  const t = useT(es)
  const fmt = useFormat()
  const client = useQueryClient()
  const { quoteId, number } = useEditorShallow((s) => ({ quoteId: s.meta.id, number: s.meta.number }))
  const url = `/quotes/${encodeURIComponent(quoteId)}/payments`
  const payments = useQuery({ queryKey: paymentsKey(quoteId), queryFn: () => request<QuotePaymentsResponse>(url) })
  const [amount, setAmount] = useState<number | null>(null)
  const [method, setMethod] = useState<PaymentMethod | undefined>(undefined)
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(today)
  const [tried, setTried] = useState(false)
  const pending = payments.data?.due ?? null

  // El monto parte en lo que falta del abono configurado; sin abono, vacío.
  useEffect(() => {
    if (pending) setAmount((a) => a ?? pending)
  }, [pending])

  const onDone = (data: QuotePaymentsResponse) => client.setQueryData(paymentsKey(quoteId), data)
  const add = useMutation({
    mutationFn: (body: QuotePaymentBody) => request<QuotePaymentsResponse>(url, { method: 'POST', body }),
    onSuccess: (data) => {
      onDone(data)
      toast.success(t('deposit.saved'))
      onClose()
    },
    onError: (error) => toast.error(humanError(error)),
  })
  const remove = useMutation({
    mutationFn: (id: string) => request<QuotePaymentsResponse>(`${url}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onSuccess: onDone,
    onError: (error) => toast.error(humanError(error)),
  })

  const submit = () => {
    setTried(true)
    if (!amount || amount <= 0 || !method) return
    const reference_ = reference.trim()
    add.mutate({ amount, method, ...(reference_ ? { reference: reference_ } : {}), paidAt: new Date(`${date}T12:00:00`).toISOString() })
  }

  return (
    <DialogContent
      title={t('deposit.title')}
      description={t('deposit.description', { number: fmt.docNumber(number) })}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('deposit.cancel')}
          </Button>
          <Button variant="primary" onClick={submit} loading={add.isPending}>
            {t('deposit.submit')}
          </Button>
        </>
      }
    >
      {payments.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="space-y-4">
          {payments.data?.deposit != null ? (
            <p className="text-table text-fg-muted">{t('deposit.expected', { amount: fmt.money(payments.data.deposit) })}</p>
          ) : null}
          {payments.data?.payments.length ? (
            <ul className="space-y-1">
              {payments.data.payments.map((payment) => (
                <li key={payment.id} className="flex items-center justify-between gap-2 text-table">
                  <span className="min-w-0 truncate text-fg">
                    <span className="tabular font-medium">{fmt.money(payment.amount)}</span> · {t(`deposit.method.${payment.method}`)} · {fmt.date(payment.paidAt)}
                    {payment.reference ? ` · ${payment.reference}` : ''}
                  </span>
                  {payment.method !== 'flow' ? (
                    <IconButton icon={Undo2} size="sm" label={t('deposit.undo')} tooltip={false} onClick={() => remove.mutate(payment.id)} disabled={remove.isPending} />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <Field label={t('deposit.amount')} error={tried && !amount ? t('deposit.amountEmpty') : undefined}>
            <MoneyField value={amount ?? 0} onChange={setAmount} />
          </Field>
          <Field label={t('deposit.how')} error={tried && !method ? t('deposit.howEmpty') : undefined}>
            <Select<PaymentMethod>
              value={method}
              onValueChange={setMethod}
              placeholder={t('deposit.howPlaceholder')}
              options={PAYMENT_METHODS.filter((m) => m !== 'flow').map((value) => ({ value, label: t(`deposit.method.${value}`) }))}
            />
          </Field>
          <Field label={t('deposit.date')}>
            <Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t('deposit.reference')} optional>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
          </Field>
        </div>
      )}
    </DialogContent>
  )
}
