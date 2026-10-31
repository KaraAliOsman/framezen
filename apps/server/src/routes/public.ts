/**
 * Portal público del cliente (/api/public/quotes/:token). Sin sesión: el token del
 * enlace es la llave. El cliente siempre ve la última revisión enviada, nunca el
 * borrador en curso, y nunca ve costos ni notas internas.
 */
import { Hono } from 'hono'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { planFeatures, type AcceptResult, type DocumentPrefs, type PublicQuoteResponse, type Quote } from '@framezen/shared'
import type { AppDeps, AppEnv } from '../context'
import { orgs, quoteRevisions, quotes, subscriptions, users } from '../db/schema'
import { HttpError, badRequest, conflict, notFound } from '../lib/errors'
import { readBody } from '../lib/http'
import { simpleHtml } from '../lib/mail'
import { formatRut, rutWarning } from '../lib/rut'
import { logActivity } from '../services/activity'
import { publicCatalog } from '../services/catalog'
import { takeMailQuota } from '../services/outbound'
import { summaryNumbers, type ItemPrices } from '../services/pricing'
import { publicClient, quoteLabel, type QuoteRow } from '../services/quotes'
import { clientIp, resolveSession, toOrg } from '../services/session'
import { getSettings } from '../services/settings'
import { revisionLetter } from './quotes'

type Snapshot = Quote & { itemPrices?: ItemPrices }

// Respuesta del portal (contrato): PublicQuote + precios por ítem calculados al enviar.
export type { PublicQuoteResponse }

const ACCEPTED = new Set(['accepted', 'workshop', 'installed', 'closed'])
/** Estados posteriores a la venta: aceptar en el portal registra quién aceptó sin hacerlos retroceder. */
const PAST_ACCEPTANCE = new Set(['workshop', 'installed', 'closed'])

/**
 * Quita lo interno de la foto enviada y le pone el estado vigente (aceptada, etc.). El cliente
 * va por lista blanca (las fotos antiguas guardaban sus notas internas del CRM).
 */
export function publicQuoteView(snapshot: Snapshot, live: QuoteRow): Quote {
  const { notes: _notes, pricing: _pricing, itemPrices: _prices, client, ...rest } = snapshot
  void _notes
  void _pricing
  void _prices
  return {
    ...rest,
    ...(client ? { client: publicClient(client) } : {}),
    status: live.status,
    ...(live.acceptedAt ? { acceptedAt: live.acceptedAt.toISOString() } : {}),
    ...(live.acceptedBy ? { acceptedBy: live.acceptedBy } : {}),
    ...(rest.totals ? { totals: { ...rest.totals, cost: 0, marginPct: 0 } } : {}),
  }
}

export function publicRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()

  async function findByToken(token: string) {
    if (!token || token.length > 100) throw notFound(MISSING)
    const [row] = await deps.db
      .select()
      .from(quotes)
      .where(and(eq(quotes.shareToken, token), isNull(quotes.deletedAt)))
      .limit(1)
    if (!row) throw notFound(MISSING)
    const [revision] = await deps.db
      .select()
      .from(quoteRevisions)
      .where(eq(quoteRevisions.quoteId, row.id))
      .orderBy(desc(quoteRevisions.revision))
      .limit(1)
    if (!revision) throw notFound(MISSING)
    return { row, revision }
  }

  function limit(c: Parameters<typeof clientIp>[0], token: string) {
    const wait = deps.limits.publicActions.hit(`${token}|${clientIp(c, deps.config.trustProxyHops)}`)
    if (wait) throw new HttpError(429, 'too_many_attempts', 'Recibimos muchos intentos seguidos. Espera un momento y vuelve a intentarlo.')
  }

  /**
   * Aviso por correo a quien creó la cotización, en segundo plano: el cliente recibe su respuesta
   * aunque el proveedor de correo tarde o falle (el aviso queda igual en la actividad). Cuenta para
   * el tope diario de correos de la organización.
   */
  function notifyTeam(row: QuoteRow, subject: string, text: string): void {
    void (async () => {
      if (!row.createdBy) return
      const [creator] = await deps.db.select({ email: users.email }).from(users).where(eq(users.id, row.createdBy)).limit(1)
      if (!creator) return
      if (!(await takeMailQuota(deps, row.orgId))) return
      const url = `${deps.config.appUrl}/cotizaciones/${row.id}`
      await deps.mailer.send({ to: creator.email, subject, text: `${text}\n\n${url}`, html: simpleHtml([text], { label: 'Abrir cotización', url }) })
    })().catch((error: unknown) => deps.logger.warn('No se pudo avisar por correo al taller', error instanceof Error ? error.message : error))
  }

  app.get('/quotes/:token', async (c) => {
    const { row, revision } = await findByToken(c.req.param('token'))
    const [org] = await deps.db.select().from(orgs).where(eq(orgs.id, row.orgId)).limit(1)
    const [sub] = await deps.db.select({ plan: subscriptions.plan }).from(subscriptions).where(eq(subscriptions.orgId, row.orgId)).limit(1)
    const settings = await getSettings(deps.db, row.orgId)
    const snapshot = revision.snapshot as Snapshot
    const documents: DocumentPrefs = { ...settings.documents, ...(snapshot.documentOverrides ?? {}) }
    const { catalog, updatedAt } = await deps.catalogs.effective(row.orgId, { onlyEnabled: false, kerf: settings.cut.kerf })
    const o = toOrg(org!)
    const body: PublicQuoteResponse = {
      quote: publicQuoteView(snapshot, row),
      org: {
        name: o.name,
        ...(o.legalName ? { legalName: o.legalName } : {}),
        ...(o.rut ? { rut: o.rut } : {}),
        ...(o.address ? { address: o.address } : {}),
        ...(o.city ? { city: o.city } : {}),
        ...(o.phone ? { phone: o.phone } : {}),
        ...(o.email ? { email: o.email } : {}),
        ...(o.website ? { website: o.website } : {}),
        ...(o.logo ? { logo: o.logo } : {}),
        ...(o.accent ? { accent: o.accent } : {}),
      },
      documents,
      catalog: publicCatalog(catalog, snapshot, updatedAt.toISOString()),
      features: planFeatures(sub?.plan ?? 'trial'),
      prices: snapshot.itemPrices ?? {},
      revisionLabel: revisionLetter(revision.revision),
    }

    // Primera apertura de esta versión por el cliente (no cuenta si la abre alguien del taller).
    if (!revision.viewedAt) {
      const viewer = await resolveSession(c, deps).catch(() => undefined)
      if (viewer?.org.id !== row.orgId) {
        const [marked] = await deps.db
          .update(quoteRevisions)
          .set({ viewedAt: deps.now() })
          .where(and(eq(quoteRevisions.id, revision.id), isNull(quoteRevisions.viewedAt)))
          .returning({ id: quoteRevisions.id })
        if (marked) {
          const who = snapshot.client?.name ?? 'Tu cliente'
          await logActivity(deps.db, {
            orgId: row.orgId,
            actor: { name: who },
            kind: 'quote.viewed',
            text: `${who} abrió ${quoteLabel(row.number)}`,
            link: `/cotizaciones/${row.id}`,
            subject: { type: 'quote', id: row.id },
            meta: { revision: revision.revision },
          })
        }
      }
    }
    return c.json(body)
  })

  app.post('/quotes/:token/accept', async (c) => {
    const token = c.req.param('token')
    limit(c, token)
    const body = await readBody(
      c,
      z.object({
        name: z.string({ error: 'Escribe tu nombre para aceptar.' }).trim().min(2, 'Escribe tu nombre completo para aceptar.').max(160, 'El nombre es demasiado largo.'),
        rut: z.string().trim().max(20).optional(),
        /** Revisión que el cliente tiene en pantalla: se acepta ESA, nunca una más nueva que no vio. */
        revision: z.number().int().min(1).optional(),
      }),
    )
    const { row, revision } = await findByToken(token)
    if (ACCEPTED.has(row.status) && row.acceptedBy) {
      const already: AcceptResult = { ok: true, alreadyAccepted: true, status: row.status, acceptedBy: row.acceptedBy, warnings: [] }
      return c.json(already)
    }
    const changed = () =>
      conflict('revision_changed', 'Hay una versión nueva de esta cotización. Recarga la página para verla antes de aceptar.', { revision: revision.revision })
    if (body.revision !== undefined && body.revision !== revision.revision) throw changed()
    const warnings = [rutWarning(body.rut)].filter((w): w is string => Boolean(w))
    const now = deps.now()
    const acceptedBy = { name: body.name, ...(body.rut ? { rut: formatRut(body.rut) } : {}), at: now.toISOString() }
    const snapshot = revision.snapshot as Snapshot
    // En taller, instalada o cerrada (p. ej. confirmó por teléfono y ya se pasó a taller) se
    // registra quién aceptó sin hacer retroceder el estado.
    const keepStatus = PAST_ACCEPTANCE.has(row.status)
    const [updated] = await deps.db
      .update(quotes)
      .set({
        ...(keepStatus ? {} : { status: 'accepted' as const }),
        acceptedAt: row.acceptedAt ?? now,
        acceptedBy,
        acceptedRevision: revision.revision,
        // Lo vendido es lo que el cliente aceptó (la foto de esa revisión), no el documento vivo.
        acceptedTotal: summaryNumbers(snapshot, snapshot.totals).total,
        version: sql`${quotes.version} + 1`,
        updatedAt: now,
      })
      // Condicionado a la revisión leída: si entre medio se envió otra, no se acepta a ciegas.
      .where(and(eq(quotes.id, row.id), eq(quotes.revision, revision.revision), isNull(quotes.deletedAt)))
      .returning()
    if (!updated) throw changed()
    const text = `${body.name} aceptó ${quoteLabel(row.number)}${revision.revision > 1 ? ` (versión ${revisionLetter(revision.revision)})` : ''}`
    await logActivity(deps.db, {
      orgId: row.orgId,
      actor: { name: body.name },
      kind: 'quote.accepted',
      text,
      link: `/cotizaciones/${row.id}`,
      subject: { type: 'quote', id: row.id },
      meta: { revision: revision.revision, ...(body.rut ? { rut: acceptedBy.rut } : {}) },
      pending: true,
    })
    notifyTeam(row, `¡${body.name} aceptó la cotización N° ${row.number}!`, `${text}. Ya puedes pasarla a taller.`)
    const result: AcceptResult = { ok: true, alreadyAccepted: false, status: updated.status, acceptedBy, warnings }
    return c.json(result)
  })

  app.post('/quotes/:token/request-changes', async (c) => {
    const token = c.req.param('token')
    limit(c, token)
    const body = await readBody(
      c,
      z.object({
        message: z.string({ error: 'Cuéntanos qué te gustaría cambiar.' }).trim().min(1, 'Cuéntanos qué te gustaría cambiar.').max(4000, 'El mensaje es demasiado largo (máximo 4.000 caracteres).'),
        name: z.string().trim().max(160).optional(),
      }),
    )
    const { row, revision } = await findByToken(token)
    const snapshot = revision.snapshot as Snapshot
    const who = body.name || snapshot.client?.name || 'Tu cliente'
    if (!body.message) throw badRequest('Cuéntanos qué te gustaría cambiar.', 'message')
    const text = `${who} pidió cambios en ${quoteLabel(row.number)}: «${body.message.length > 160 ? `${body.message.slice(0, 157)}…` : body.message}»`
    await logActivity(deps.db, {
      orgId: row.orgId,
      actor: { name: who },
      kind: 'quote.changes_requested',
      text,
      link: `/cotizaciones/${row.id}`,
      subject: { type: 'quote', id: row.id },
      meta: { message: body.message, revision: revision.revision, ...(body.name ? { name: body.name } : {}) },
      pending: true,
    })
    notifyTeam(row, `${who} pidió cambios en la cotización N° ${row.number}`, `${who} escribió: «${body.message}»`)
    return c.json({ ok: true, message: 'Listo, le avisamos al taller. Te contactarán pronto con la cotización ajustada.' })
  })

  return app
}

const MISSING = 'Este enlace de cotización no existe o fue reemplazado. Pide a quien te la envió un enlace nuevo.'
