/**
 * Pagos de cada taller. DEKOPEN no toca el dinero: publica los datos que el taller configuró, lleva
 * la cuenta de lo que él marca como recibido y, si conectó su cuenta Flow, crea el cobro con SUS
 * llaves para que el pago entre directo a su cuenta.
 *
 * Las llaves se guardan cifradas (lib/secret-box) y solo se abren aquí, para firmar la llamada a
 * Flow: no salen a ninguna respuesta ni a los logs. El monto lo calcula siempre el servidor, y lo
 * único que da un pago por hecho es la consulta firmada a Flow, nunca que el navegador haya vuelto.
 */
import { randomBytes } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import {
  hasPaymentMethods,
  isUsableAccount,
  paymentPlan,
  safePaymentUrl,
  type FlowKeysBody,
  type FlowKeysStatus,
  type OrgSettings,
  type PublicPayment,
  type QuotePayment,
} from '@dekopen/shared'
import type { AppDeps } from '../context'
import { orgPaymentKeys, quotePayments, type QuotePaymentStatus } from '../db/schema'
import { newId } from '../lib/crypto'
import { sealSecret, openSecret } from '../lib/secret-box'
import { logActivity } from './activity'
import { FLOW_PAYMENT, FLOW_PRODUCTION_URL, FLOW_SANDBOX_URL, FlowClient, FlowError } from './billing/flow'
import { quoteLabel } from './quotes'

/** Solo pruebas: reemplaza la red de Flow. */
const flowFetchOverride = new WeakMap<AppDeps, { fetch: typeof fetch; apiUrl?: string }>()
export function setPaymentFlowFetch(deps: AppDeps, fetchFn: typeof fetch, apiUrl?: string): void {
  flowFetchOverride.set(deps, { fetch: fetchFn, ...(apiUrl ? { apiUrl } : {}) })
}

// ── Llaves ───────────────────────────────────────────────────────────────────
export async function flowKeysStatus(deps: AppDeps, orgId: string): Promise<FlowKeysStatus> {
  const [row] = await deps.db.select({ sandbox: orgPaymentKeys.sandbox, updatedAt: orgPaymentKeys.updatedAt }).from(orgPaymentKeys).where(eq(orgPaymentKeys.orgId, orgId)).limit(1)
  const available = Boolean(deps.config.paymentKeysSecret)
  return { available, configured: available && Boolean(row), sandbox: row?.sandbox ?? false, ...(row ? { updatedAt: row.updatedAt.toISOString() } : {}) }
}

export async function saveFlowKeys(deps: AppDeps, orgId: string, body: FlowKeysBody): Promise<void> {
  const master = deps.config.paymentKeysSecret
  if (!master) throw new Error('Sin PAYMENT_KEYS_SECRET no se guardan llaves')
  const values = {
    apiKey: sealSecret(body.apiKey, master, orgId, 'flow.apiKey'),
    secretKey: sealSecret(body.secretKey, master, orgId, 'flow.secretKey'),
    sandbox: body.sandbox,
    updatedAt: deps.now(),
  }
  await deps.db.insert(orgPaymentKeys).values({ orgId, ...values }).onConflictDoUpdate({ target: orgPaymentKeys.orgId, set: values })
}

export async function removeFlowKeys(deps: AppDeps, orgId: string): Promise<void> {
  await deps.db.delete(orgPaymentKeys).where(eq(orgPaymentKeys.orgId, orgId))
}

async function orgFlowClient(deps: AppDeps, orgId: string): Promise<FlowClient | null> {
  const master = deps.config.paymentKeysSecret
  if (!master) return null
  const [row] = await deps.db.select().from(orgPaymentKeys).where(eq(orgPaymentKeys.orgId, orgId)).limit(1)
  if (!row) return null
  try {
    const override = flowFetchOverride.get(deps)
    return new FlowClient({
      apiKey: openSecret(row.apiKey, master, orgId, 'flow.apiKey'),
      secretKey: openSecret(row.secretKey, master, orgId, 'flow.secretKey'),
      apiUrl: override?.apiUrl ?? (row.sandbox ? FLOW_SANDBOX_URL : FLOW_PRODUCTION_URL),
      ...(override ? { fetch: override.fetch } : {}),
    })
  } catch {
    // Cambió la clave maestra o la fila se alteró. Sin detalles: nada de esto debe llegar a un log.
    deps.logger.error('No se pudieron abrir las llaves de Flow de un taller')
    return null
  }
}

// ── Lo recibido ──────────────────────────────────────────────────────────────
export async function listQuotePayments(deps: AppDeps, orgId: string, quoteId: string, recordedBy?: (id: string) => string | undefined): Promise<QuotePayment[]> {
  const rows = await deps.db
    .select()
    .from(quotePayments)
    .where(and(eq(quotePayments.orgId, orgId), eq(quotePayments.quoteId, quoteId), eq(quotePayments.status, 'received')))
    .orderBy(desc(quotePayments.paidAt))
  return rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    method: row.method,
    ...(row.reference ? { reference: row.reference } : {}),
    paidAt: (row.paidAt ?? row.createdAt).toISOString(),
    ...(row.recordedBy && recordedBy?.(row.recordedBy) ? { recordedBy: recordedBy(row.recordedBy) } : {}),
  }))
}

export function sumPayments(payments: Pick<QuotePayment, 'amount'>[]): number {
  return payments.reduce((acc, p) => acc + p.amount, 0)
}

// ── Lo que ve el cliente ─────────────────────────────────────────────────────
/**
 * Sección de pago del portal. Sin nada configurado no hay sección. Con «solo tras aceptar», antes de
 * aceptar no sale ningún dato de pago de este servidor: ni la cuenta, ni los enlaces.
 */
export async function publicPayment(
  deps: AppDeps,
  input: { orgId: string; quoteId: string; settings: Pick<OrgSettings, 'payments'>; currency: string; total: number; accepted: boolean },
): Promise<PublicPayment | undefined> {
  const { payments } = input.settings
  const deposit = paymentPlan(payments?.deposit, input.total)[0]?.amount ?? null
  const keys = await flowKeysStatus(deps, input.orgId)
  // Flow se cobra sobre un monto calculado aquí: sin abono configurado no hay qué cobrar.
  const flowReady = keys.configured && deposit !== null && input.currency === 'CLP'
  const anyMethod = hasPaymentMethods(payments, flowReady)
  const received = await listQuotePayments(deps, input.orgId, input.quoteId)
  if (!anyMethod && deposit === null && !received.length) return undefined
  const unlocked = input.accepted || payments?.showWhen === 'always'
  const accounts = (payments?.accounts ?? []).filter(isUsableAccount)
  const links = (payments?.links ?? []).flatMap((link) => {
    const url = safePaymentUrl(link.url)
    return url && link.label.trim() ? [{ id: link.id, label: link.label.trim(), url }] : []
  })
  const instructions = payments?.instructions.trim()
  return {
    unlocked,
    ...(deposit !== null && payments && payments.deposit.mode !== 'none'
      ? {
          deposit: {
            amount: deposit,
            mode: payments.deposit.mode,
            ...(payments.deposit.mode === 'percent' ? { pct: payments.deposit.value } : {}),
            ...(payments.deposit.mode === 'milestones' ? { milestones: payments.deposit.milestones ?? [] } : {}),
          },
        }
      : {}),
    ...(unlocked && accounts.length ? { accounts } : {}),
    ...(unlocked && instructions ? { instructions } : {}),
    ...(unlocked && links.length ? { links } : {}),
    ...(input.accepted && flowReady ? { flow: true } : {}),
    ...(received.length ? { received: { amount: sumPayments(received), at: received[0]!.paidAt } } : {}),
  }
}

// ── Cobro con la cuenta Flow del taller ──────────────────────────────────────
export class PaymentUnavailableError extends Error {}

/** Crea el cobro del abono pendiente. Devuelve la dirección de pago de Flow. */
export async function createFlowPayment(
  deps: AppDeps,
  input: { orgId: string; quoteId: string; number: number; revision: number; amount: number; email: string; subject: string },
): Promise<string> {
  const client = await orgFlowClient(deps, input.orgId)
  if (!client) throw new PaymentUnavailableError('flow_off')
  const id = newId()
  const commerceOrder = `D${input.number}-${input.revision}-${randomBytes(6).toString('hex')}`
  await deps.db.insert(quotePayments).values({
    id,
    orgId: input.orgId,
    quoteId: input.quoteId,
    revision: input.revision,
    amount: input.amount,
    method: 'flow',
    status: 'pending',
    providerOrder: commerceOrder,
    createdAt: deps.now(),
  })
  const base = `${deps.config.appUrl}/api/public/pay/flow`
  try {
    const created = await client.createPayment({
      commerceOrder,
      subject: input.subject.slice(0, 120),
      amount: input.amount,
      email: input.email,
      urlConfirmation: `${base}/confirm/${id}`,
      urlReturn: `${base}/return/${id}`,
    })
    const url = safePaymentUrl(`${created.url}?token=${encodeURIComponent(created.token)}`)
    if (!url) throw new FlowError(502, undefined, 'Dirección de pago inválida')
    return url
  } catch (error) {
    await deps.db.update(quotePayments).set({ status: 'rejected' }).where(eq(quotePayments.id, id))
    // Solo el código: el mensaje de un proveedor no se copia a los logs.
    deps.logger.warn('Flow no creó el cobro de un taller', error instanceof FlowError ? `${error.status} ${String(error.code ?? '')}` : 'error')
    await logActivity(deps.db, {
      orgId: input.orgId,
      kind: 'quote.payment_failed',
      text: `Flow no pudo crear el cobro de ${quoteLabel(input.number)}. Revisa tus llaves en Ajustes › Envío y pagos.`,
      link: `/ajustes/pagos`,
      subject: { type: 'quote', id: input.quoteId },
      pending: true,
    })
    throw new PaymentUnavailableError('flow_failed')
  }
}

export type FlowSettlement = 'paid' | 'pending' | 'rejected' | 'unknown'

/**
 * Consulta el estado a Flow con las llaves del taller y lo registra una sola vez. Se llama desde la
 * confirmación y desde el retorno; el orden en que lleguen da lo mismo. Exige que la orden y el monto
 * calcen con lo que se creó aquí.
 */
export async function settleFlowPayment(deps: AppDeps, paymentId: string, token: string): Promise<FlowSettlement> {
  const [payment] = await deps.db.select().from(quotePayments).where(eq(quotePayments.id, paymentId)).limit(1)
  if (!payment || payment.method !== 'flow') return 'unknown'
  const client = await orgFlowClient(deps, payment.orgId)
  if (!client) return 'unknown'
  const status = await client.getPaymentStatus(token)
  if (status.commerceOrder !== payment.providerOrder) {
    deps.logger.warn('Flow devolvió una orden que no corresponde a este cobro')
    return 'unknown'
  }
  const setStatus = async (next: QuotePaymentStatus, extra: { paidAt?: Date } = {}) => {
    const [updated] = await deps.db
      .update(quotePayments)
      .set({ status: next, ...extra })
      .where(and(eq(quotePayments.id, payment.id), eq(quotePayments.status, 'pending')))
      .returning({ id: quotePayments.id })
    return Boolean(updated)
  }
  if (status.status === FLOW_PAYMENT.paid) {
    if (Math.round(Number(status.amount)) !== payment.amount) {
      deps.logger.warn('Flow confirmó un monto distinto al del cobro')
      return 'unknown'
    }
    if (await setStatus('received', { paidAt: deps.now() })) {
      await logActivity(deps.db, {
        orgId: payment.orgId,
        kind: 'quote.deposit_received',
        text: 'Tu cliente pagó el abono con Flow',
        link: `/cotizaciones/${payment.quoteId}`,
        subject: { type: 'quote', id: payment.quoteId },
        meta: { amount: payment.amount, method: 'flow', revision: payment.revision },
        pending: true,
      })
    }
    return payment.status === 'rejected' ? 'unknown' : 'paid'
  }
  if (status.status === FLOW_PAYMENT.rejected || status.status === FLOW_PAYMENT.canceled) {
    await setStatus('rejected')
    return 'rejected'
  }
  return 'pending'
}
