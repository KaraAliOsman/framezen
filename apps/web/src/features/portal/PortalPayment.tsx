/**
 * Cómo pagar, después del total. Sale solo si el taller configuró algo y el dinero va directo a él.
 * En el teléfono lo importante es copiar sin errores: cada dato se copia con un toque, y también todo
 * junto para pegarlo en la app del banco.
 */
import { useState } from 'react'
import { ArrowUpRight, Check, CircleCheck, Copy } from 'lucide-react'
import { nextDue, safePaymentUrl, type PaymentAccount, type PaymentPlanStep, type PublicPayment } from '@dekopen/shared'
import { ApiRequestError, humanError, request } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useFormat, useT } from '../../lib/i18n'
import { buttonClass } from '../../ui/Button'
import { Field } from '../../ui/Field'
import { Input } from '../../ui/Input'
import { Spinner } from '../../ui/Spinner'
import es from './i18n/es'
import { brandButton } from './PortalDialogs'
import { accountCopyText, copyToClipboard } from './portalModel'

export function PortalPayment({
  payment,
  plan,
  token,
  orgName,
  reference,
  currency,
  needsEmail,
}: {
  payment: PublicPayment
  /** Pagos sobre el total de ahora (con los opcionales elegidos). */
  plan: readonly PaymentPlanStep[]
  token: string
  orgName: string
  /** «Cotización 412»: lo que conviene poner en la transferencia. */
  reference: string
  currency?: string
  /** El cliente no tiene correo guardado: Flow lo exige para el comprobante. */
  needsEmail: boolean
}) {
  const t = useT(es)
  const fmt = useFormat({ locale: t.locale, currency })
  const { deposit, received } = payment
  const pending = plan.length ? nextDue(plan, received?.amount ?? 0) : null
  const links = (payment.links ?? []).filter((link) => safePaymentUrl(link.url))
  const methods = Boolean(payment.accounts?.length || links.length || payment.instructions || payment.flow)

  return (
    <div id="portal-payment" className="mt-8 scroll-mt-6">
      <h3 className="text-table font-medium text-fg-strong">{t('payment.heading')}</h3>
      {plan.length > 1 ? (
        <ul className="mt-1.5 flex flex-col gap-1 text-base">
          {plan.map((step, index) => (
            <li key={index} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 text-fg-muted">{t('payment.stepPct', { pct: fmt.pct(step.pct ?? 0, 1), label: step.label ?? t('payment.step', { n: index + 1 }) })}</span>
              <span className="tabular shrink-0 font-medium text-fg-strong">{fmt.money(step.amount)}</span>
            </li>
          ))}
        </ul>
      ) : deposit ? (
        <div className="mt-1.5 flex items-baseline justify-between gap-3 text-base">
          <span className="text-fg-muted">{deposit.pct ? t('payment.depositPct', { pct: fmt.pct(deposit.pct, 1) }) : t('payment.deposit')}</span>
          <span className="tabular font-medium text-fg-strong">{fmt.money(deposit.amount)}</span>
        </div>
      ) : null}
      {received ? (
        <p className="mt-2 flex items-start gap-2 text-base text-success">
          <CircleCheck aria-hidden strokeWidth={1.75} className="mt-0.5 size-4 shrink-0" />
          {t('payment.received', { amount: fmt.money(received.amount), date: fmt.date(received.at, 'long') })}
        </p>
      ) : null}
      {!payment.unlocked ? <p className="mt-1.5 text-table text-fg-muted">{t('payment.afterAccept')}</p> : null}

      {methods && pending !== 0 ? (
        <div className="mt-4 flex flex-col gap-5">
          {payment.flow && pending ? <FlowButton token={token} amount={pending} currency={currency} needsEmail={needsEmail} /> : null}
          {links.length ? (
            <ul className="flex flex-col gap-2">
              {links.map((link, index) => (
                <li key={link.id}>
                  <a
                    href={safePaymentUrl(link.url)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(index === 0 && !payment.flow ? `${brandButton} h-12 w-full text-base` : buttonClass('secondary', 'lg', 'w-full'))}
                  >
                    <span className="truncate">{link.label}</span>
                    <ArrowUpRight aria-hidden strokeWidth={1.75} className="size-4 shrink-0" />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {payment.accounts?.map((account) => <AccountBlock key={account.id} account={account} reference={reference} />)}
          {payment.instructions ? <p className="text-base whitespace-pre-line text-fg-muted">{payment.instructions}</p> : null}
        </div>
      ) : null}
      {methods && pending !== 0 ? <p className="mt-3 text-meta text-fg-muted">{t('payment.direct', { org: orgName })}</p> : null}
    </div>
  )
}

function useCopied() {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = async (key: string, text: string) => {
    if (await copyToClipboard(text)) {
      setCopied(key)
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600)
    }
  }
  return { copied, copy }
}

function AccountBlock({ account, reference }: { account: PaymentAccount; reference: string }) {
  const t = useT(es)
  const { copied, copy } = useCopied()
  const type = t(`payment.types.${account.type}`)
  const rows = [
    { key: 'bank', label: t('payment.bank'), value: account.bank },
    { key: 'type', label: t('payment.type'), value: type },
    { key: 'number', label: t('payment.number'), value: account.number },
    { key: 'holder', label: t('payment.holder'), value: account.holder },
    { key: 'rut', label: t('payment.rut'), value: account.rut },
    { key: 'email', label: t('payment.email'), value: account.email },
    { key: 'reference', label: t('payment.reference'), value: reference },
  ].filter((row) => row.value.trim())
  const all = accountCopyText(rows)
  return (
    <div className="rounded-panel bg-sunken px-4 py-2">
      <ul className="flex flex-col">
        {rows.map((row) => (
          <li key={row.key} className="border-b border-divider last:border-b-0">
            <button
              type="button"
              onClick={() => void copy(row.key, row.value)}
              aria-label={t('payment.copyField', { label: row.label, value: row.value })}
              className="-mx-2 flex min-h-12 w-[calc(100%+16px)] items-center justify-between gap-3 rounded-control px-2 py-1.5 text-left transition-colors duration-100 hover:bg-hover active:bg-hover"
            >
              <span className="min-w-0">
                <span className="block text-meta text-fg-muted">{row.label}</span>
                <span className="tabular block text-base break-words text-fg-strong">{row.value}</span>
              </span>
              {copied === row.key ? (
                <Check aria-hidden strokeWidth={2} className="size-4 shrink-0 text-success" />
              ) : (
                <Copy aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-fg-muted" />
              )}
            </button>
          </li>
        ))}
      </ul>
      <button type="button" onClick={() => void copy('all', all)} className={buttonClass('secondary', 'md', 'my-2 w-full')}>
        {copied === 'all' ? <Check aria-hidden strokeWidth={2} /> : <Copy aria-hidden strokeWidth={1.75} />}
        {copied === 'all' ? t('payment.copied') : t('payment.copyAll')}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? t('payment.copied') : ''}
      </span>
    </div>
  )
}

/** Abono con la cuenta Flow del taller. El monto lo decide el servidor; aquí solo se muestra. */
function FlowButton({ token, amount, currency, needsEmail }: { token: string; amount: number; currency?: string; needsEmail: boolean }) {
  const t = useT(es)
  const fmt = useFormat({ locale: t.locale, currency })
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pay = async () => {
    setBusy(true)
    setError(null)
    try {
      const { url } = await request<{ url: string }>(`/public/quotes/${encodeURIComponent(token)}/pay/flow`, { method: 'POST', body: email.trim() ? { email: email.trim() } : {} })
      if (!safePaymentUrl(url)) throw new ApiRequestError(502, 'payment_unavailable', t('payment.flowFailed'))
      window.location.assign(url)
    } catch (err) {
      setError(humanError(err))
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-3">
      {needsEmail ? (
        <Field label={t('payment.flowEmail')} hint={t('payment.flowEmailHint')}>
          <Input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      ) : null}
      <button type="button" onClick={() => void pay()} disabled={busy || (needsEmail && !email.trim())} aria-busy={busy || undefined} className={cn(brandButton, 'h-12 w-full text-base')}>
        {busy ? <Spinner /> : null}
        {t('payment.flowPay', { amount: fmt.money(amount) })}
      </button>
      {error ? (
        <p role="alert" className="text-table text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}
