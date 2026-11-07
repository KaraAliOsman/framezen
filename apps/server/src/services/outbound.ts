/**
 * Topes de correo saliente por organización y día. DEKOPEN envía desde su propio dominio
 * (MAIL_FROM) con textos que escribe el usuario (mensaje, nombre de la empresa): sin tope, una
 * cuenta recién creada serviría para mandar spam o phishing y dañar la reputación del dominio.
 * La prueba gratis tiene un tope más bajo que los planes pagados.
 */
import { eq } from 'drizzle-orm'
import type { AppDeps } from '../context'
import { subscriptions } from '../db/schema'
import { HttpError } from '../lib/errors'

export const TRIAL_MAILS_PER_DAY = 30
export const PAID_MAILS_PER_DAY = 300

async function dailyLimit(deps: AppDeps, orgId: string): Promise<number> {
  const [sub] = await deps.db.select({ plan: subscriptions.plan }).from(subscriptions).where(eq(subscriptions.orgId, orgId)).limit(1)
  return !sub || sub.plan === 'trial' ? TRIAL_MAILS_PER_DAY : PAID_MAILS_PER_DAY
}

/** Cuenta un correo saliente de la organización. false si ya llegó al tope del día. */
export async function takeMailQuota(deps: AppDeps, orgId: string): Promise<boolean> {
  return deps.limits.outboundMail.hit(orgId, await dailyLimit(deps, orgId)) === 0
}

export function mailQuotaError(): HttpError {
  return new HttpError(
    429,
    'mail_quota',
    'Llegaste al máximo de correos por hoy. El enlace sigue sirviendo: cópialo o compártelo por WhatsApp, y mañana podrás volver a enviar correos.',
  )
}
