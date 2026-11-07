/**
 * Portal público del cliente (/api/public/quotes/:token). Sin sesión: el token del
 * enlace es la llave. El cliente siempre ve la última revisión enviada, nunca el
 * borrador en curso, y nunca ve costos ni notas internas.
 */
import { Hono, type Context } from 'hono'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { applyQuoteSelection, assemblyUnits, selectionTotals, type QuoteSelection, type QuoteTotals } from '@dekopen/engine'
import { planFeatures, type AcceptResult, type DocumentPrefs, type PublicExperience, type PublicQuoteDocument, type PublicQuoteMark, type PublicQuoteResponse, type Quote } from '@dekopen/shared'
import type { AppDeps, AppEnv } from '../context'
import type { Db } from '../db/client'
import { orgs, quotePayments, quoteRevisions, quotes, subscriptions, users } from '../db/schema'
import { HttpError, badRequest, conflict, notFound } from '../lib/errors'
import { emailSchema } from '../lib/schemas'
import { readBody } from '../lib/http'
import type { ServerLocale } from '../lib/i18n/locale'
import { formatRut, rutWarning } from '../lib/rut'
import { logActivity, resolveQuoteNotices } from '../services/activity'
import { AR_MODEL_MAX_BYTES, arModels, isGlb } from '../services/ar-models'
import { FlowError } from '../services/billing/flow'
import { publicCatalog } from '../services/catalog'
import { takeMailQuota } from '../services/outbound'
import { createFlowPayment, listQuotePayments, PaymentUnavailableError, publicPayment, settleFlowPayment, sumPayments, type FlowSettlement } from '../services/payments'
import { summaryNumbers, type ItemPrices } from '../services/pricing'
import { acceptedTotalOf, publicClient, quoteLabel, type QuoteRow } from '../services/quotes'
import { clientIp, resolveSession, toOrg } from '../services/session'
import { getSettings } from '../services/settings'
import { mailLocale, quoteAcceptedMail, quoteChangesMail, type MailContent } from '../services/mail'
import { nextDue, paymentPlan } from '@dekopen/shared'
import { quotePrefs } from '../services/pdf/data'
import { assetStore } from '../services/assets'
import { templateAssetDataUrls } from '../services/templates/assets'
import { resolveOrgQuoteDocument } from '../services/templates/resolve'
import { revisionLetter } from './quotes'

type Snapshot = Quote & { itemPrices?: ItemPrices; ivaPct?: number }

const hasChoices = (lines: readonly { role?: string }[] | undefined) => (lines ?? []).some((line) => line.role === 'optional' || line.role === 'alternative')

/** Solo decide qué cuenta: los montos salen siempre de la revisión enviada, nunca del navegador. */
const selectionSchema = z.object({
  optional: z.record(z.string().max(64), z.boolean()).optional(),
  alternatives: z.record(z.string().max(200), z.string().max(64)).optional(),
})

/** Totales de la elección con los precios congelados al enviar. */
function chosenTotals(snapshot: Snapshot, ivaPct: number, selection: QuoteSelection | undefined): QuoteTotals {
  const prices = snapshot.itemPrices ?? {}
  return selectionTotals(
    {
      lines: snapshot.items.map((item) => ({
        id: item.id,
        role: item.role,
        altGroup: item.altGroup,
        included: item.included,
        qty: Number.isFinite(item.qty) ? item.qty : 0,
        totalNet: prices[item.id]?.totalNet ?? 0,
        area: assemblyUnits(item.design).length ? assemblyUnits(item.design).reduce((sum, unit) => sum + (unit.design.width * unit.design.height) / 1_000_000, 0) : (item.design.width * item.design.height) / 1_000_000,
        pending: prices[item.id]?.pending,
      })),
      extras: snapshot.extras ?? [],
      discountPct: snapshot.discountPct ?? 0,
      ivaPct,
    },
    selection,
  )
}

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
  const { notes: _notes, pricing: _pricing, itemPrices: _prices, ivaPct: _iva, sentFormat: _format, client, ...rest } = snapshot
  void _notes
  void _pricing
  void _prices
  void _iva
  void _format
  return {
    ...rest,
    ...(client ? { client: publicClient(client) } : {}),
    status: live.status,
    ...(live.acceptedAt ? { acceptedAt: live.acceptedAt.toISOString() } : {}),
    ...(live.acceptedBy ? { acceptedBy: live.acceptedBy } : {}),
    ...(rest.totals ? { totals: { ...rest.totals, cost: 0, marginPct: 0 } } : {}),
  }
}

/** Lo que el taller decide mostrar y su plan permite. El AR va montado sobre la vista 3D. */
export function portalExperience(sending: { portal3d?: boolean; portalAr?: boolean } | undefined, planHas3d: boolean): PublicExperience {
  const view3d = planHas3d && sending?.portal3d !== false
  return { view3d, ar: view3d && sending?.portalAr !== false }
}

/** Aceptada y sobre la revisión vigente: un reenvío la devuelve a «por aceptar». */
function acceptedNow(row: QuoteRow, revision: { revision: number }): boolean {
  return ACCEPTED.has(row.status) && Boolean(row.acceptedBy) && row.acceptedRevision === revision.revision
}

const PAY_RESULT: Record<FlowSettlement, string> = { paid: 'ok', pending: 'pendiente', rejected: 'rechazado', unknown: 'revisando' }

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
  function notifyTeam(row: QuoteRow, build: (locale: ServerLocale, url: string) => MailContent): void {
    void (async () => {
      if (!row.createdBy) return
      const [creator] = await deps.db.select({ email: users.email, locale: users.locale }).from(users).where(eq(users.id, row.createdBy)).limit(1)
      if (!creator) return
      if (!(await takeMailQuota(deps, row.orgId))) return
      const [org] = await deps.db.select({ locale: orgs.locale }).from(orgs).where(eq(orgs.id, row.orgId)).limit(1)
      const url = `${deps.config.appUrl}/cotizaciones/${row.id}`
      // En el idioma de quien creó la cotización (o el de la empresa): services/mail.
      await deps.mailer.send({ to: creator.email, ...build(mailLocale(creator.locale, org?.locale), url) })
    })().catch((error: unknown) => deps.logger.warn('No se pudo avisar por correo al taller', error instanceof Error ? error.message : error))
  }

  app.get('/quotes/:token', async (c) => {
    // Generoso para quien mira y recarga; un corte para quien recorre tokens o martilla la base.
    const allowed = deps.limits.keyed.take(`portal-view:${clientIp(c, deps.config.trustProxyHops)}`, { limit: 300, windowMs: 60_000 })
    if (!allowed.ok) throw new HttpError(429, 'too_many_attempts', 'Recibimos muchos intentos seguidos. Espera un momento y vuelve a intentarlo.', undefined, { retryAfter: allowed.retryAfterSec })
    const { row, revision } = await findByToken(c.req.param('token'))
    const [org] = await deps.db.select().from(orgs).where(eq(orgs.id, row.orgId)).limit(1)
    const [sub] = await deps.db.select({ plan: subscriptions.plan }).from(subscriptions).where(eq(subscriptions.orgId, row.orgId)).limit(1)
    const settings = await getSettings(deps.db, row.orgId)
    const snapshot = revision.snapshot as Snapshot
    // Solo preferencias conocidas y con el tipo correcto (lista blanca): lo guardado en la foto
    // puede venir de versiones antiguas o traer claves ajenas, y esto se publica sin sesión.
    const documents: DocumentPrefs = quotePrefs(settings, snapshot)
    const { catalog, updatedAt } = await deps.catalogs.effective(row.orgId, { onlyEnabled: false, kerf: settings.cut.kerf })
    const o = toOrg(org!)
    // Documento v5 (plantilla ⊕ empresa ⊕ cotización) resuelto y validado en el servidor: nunca la
    // mezcla cruda de ajustes guardados (services/templates › resolveOrgQuoteDocument).
    const resolved = await resolveOrgQuoteDocument(deps.db, row.orgId, { documents: settings.documents, quote: snapshot, org: o })
    // Fotos de la plantilla en línea (sólo las de esta empresa): la web del portal no sale a pedirlas.
    const prefs = settings.documents
    const assets = await templateAssetDataUrls(assetStore(deps), row.orgId, resolved.template, prefs)
    const logo = (id: string | undefined) => (id && assets[id]?.startsWith('data:image/') ? assets[id] : undefined)
    const marks: PublicQuoteMark[] = [
      ...(resolved.settings.brandProfile
        ? Object.entries(prefs.brandLogos ?? {}).flatMap(([brandId, id]) => {
            const src = logo(id)
            return src ? [{ kind: 'profile' as const, brandId, name: catalog.brands.find((b) => b.id === brandId)?.name ?? '', src }] : []
          })
        : []),
      ...(resolved.settings.brandHardware
        ? (prefs.hardwareLogos ?? []).flatMap((h) => {
            const src = logo(h.assetId)
            return src ? [{ kind: 'hardware' as const, name: h.name, src }] : []
          })
        : []),
    ]
    const document: PublicQuoteDocument = {
      template: resolved.template,
      texts: resolved.texts,
      ...(resolved.validityDays !== undefined ? { validityDays: resolved.validityDays } : {}),
      locale: resolved.locale,
      itemNotes: resolved.itemNotes,
      ...(Object.keys(assets).length ? { assets } : {}),
      ...(marks.length ? { marks, markPlacement: resolved.settings.brandPlacement } : {}),
    }
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
      document,
      catalog: publicCatalog(catalog, snapshot, updatedAt.toISOString()),
      features: planFeatures(sub?.plan ?? 'trial'),
      prices: snapshot.itemPrices ?? {},
      revisionLabel: revisionLetter(revision.revision),
      experience: portalExperience(settings.sending, planFeatures(sub?.plan ?? 'trial').includes('client3d')),
      ivaPct: snapshot.ivaPct ?? settings.pricing.ivaPct,
    }
    const accepted = acceptedNow(row, revision)
    const payment = await publicPayment(deps, {
      orgId: row.orgId,
      quoteId: row.id,
      settings,
      currency: org!.currency ?? 'CLP',
      total: accepted && row.acceptedTotal !== null ? row.acceptedTotal : summaryNumbers(snapshot, snapshot.totals).total,
      accepted,
    })
    if (payment) body.payment = payment

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
    c.header('Cache-Control', 'private, no-store')
    c.header('X-Robots-Tag', 'noindex, nofollow')
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
        /** Marcó que revisó medidas, colores, vidrio y apertura. */
        declared: z.boolean().optional(),
        /** Opcionales y alternativas que eligió. */
        selection: selectionSchema.optional(),
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
    const accept = (db: Db, total: number, chosen: Partial<typeof row.data>) =>
      db
        .update(quotes)
        .set({
          ...(keepStatus ? {} : { status: 'accepted' as const }),
          acceptedAt: row.acceptedAt ?? now,
          acceptedBy,
          acceptedRevision: revision.revision,
          // Lo vendido es lo que el cliente aceptó (la foto de esa revisión), no el documento vivo.
          acceptedTotal: total,
          ...(Object.keys(chosen).length ? { data: { ...row.data, ...chosen }, total, sentTotal: total } : {}),
          version: sql`${quotes.version} + 1`,
          updatedAt: now,
        })
        // Condicionado a la revisión leída: si entre medio se envió otra, no se acepta a ciegas.
        .where(and(eq(quotes.id, row.id), eq(quotes.revision, revision.revision), isNull(quotes.deletedAt)))
        .returning()
    let updated: QuoteRow | undefined
    if (hasChoices(snapshot.items) || hasChoices(snapshot.extras)) {
      // Lo elegido queda escrito en las líneas (lo único que mira el taller) y en la foto de esta
      // revisión: así el portal, el PDF y la orden de trabajo dicen lo mismo que se aceptó.
      const settings = await getSettings(deps.db, row.orgId)
      const fresh = chosenTotals(snapshot, snapshot.ivaPct ?? settings.pricing.ivaPct, body.selection)
      const totals: QuoteTotals = { ...fresh, cost: snapshot.totals?.cost ?? fresh.cost, marginPct: snapshot.totals?.marginPct ?? fresh.marginPct }
      const total = Math.round(fresh.total)
      const chosen = { items: applyQuoteSelection(row.data.items ?? [], body.selection), extras: applyQuoteSelection(row.data.extras ?? [], body.selection), totals }
      updated = await deps.db.transaction(async (raw) => {
        const tx = raw as unknown as Db
        const [saved] = await accept(tx, total, chosen)
        if (!saved) return undefined
        const fixed: Snapshot = { ...snapshot, items: applyQuoteSelection(snapshot.items, body.selection), extras: applyQuoteSelection(snapshot.extras ?? [], body.selection), totals }
        await tx.update(quoteRevisions).set({ snapshot: fixed }).where(eq(quoteRevisions.id, revision.id))
        return saved
      })
    } else {
      ;[updated] = await accept(deps.db, summaryNumbers(snapshot, snapshot.totals).total, {})
    }
    if (!updated) throw changed()
    // Aceptar reemplaza lo que el cliente pidió antes: «pidió cambios» ya no es una tarea abierta.
    await resolveQuoteNotices(deps.db, row.orgId, row.id, ['quote.changes_requested'])
    const text = `${body.name} aceptó ${quoteLabel(row.number)}${revision.revision > 1 ? ` (versión ${revisionLetter(revision.revision)})` : ''}`
    await logActivity(deps.db, {
      orgId: row.orgId,
      actor: { name: body.name },
      kind: 'quote.accepted',
      text,
      link: `/cotizaciones/${row.id}`,
      subject: { type: 'quote', id: row.id },
      meta: { revision: revision.revision, ...(body.rut ? { rut: acceptedBy.rut } : {}), ...(body.declared ? { declared: true } : {}) },
      pending: true,
    })
    const version = revision.revision > 1 ? revisionLetter(revision.revision) : undefined
    notifyTeam(row, (locale, url) => quoteAcceptedMail(locale, { who: body.name, number: row.number, version, url }))
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
    notifyTeam(row, (locale, url) => quoteChangesMail(locale, { who, number: row.number, message: body.message, url }))
    return c.json({ ok: true, message: 'Listo, le avisamos al taller. Te contactarán pronto con la cotización ajustada.' })
  })

  // ── Modelo de paso para Scene Viewer (Android) ─────────────────────────────
  // Solo con un token válido, si el taller tiene el AR encendido, y solo un GLB de verdad.
  app.post('/quotes/:token/ar-model', async (c) => {
    const token = c.req.param('token')
    const allowed = deps.limits.keyed.take(`portal-ar:${token.slice(0, 100)}|${clientIp(c, deps.config.trustProxyHops)}`, { limit: 12, windowMs: 60 * 60_000 })
    if (!allowed.ok) throw new HttpError(429, 'too_many_attempts', 'Recibimos muchos intentos seguidos. Espera un momento y vuelve a intentarlo.', undefined, { retryAfter: allowed.retryAfterSec })
    const { row } = await findByToken(token)
    const settings = await getSettings(deps.db, row.orgId)
    const [sub] = await deps.db.select({ plan: subscriptions.plan }).from(subscriptions).where(eq(subscriptions.orgId, row.orgId)).limit(1)
    if (!portalExperience(settings.sending, planFeatures(sub?.plan ?? 'trial').includes('client3d')).ar) throw notFound(MISSING)
    const bytes = new Uint8Array(await c.req.arrayBuffer())
    if (bytes.length > AR_MODEL_MAX_BYTES) throw new HttpError(413, 'too_large', 'Lo que intentas subir es demasiado grande.')
    if (!isGlb(bytes)) throw badRequest('Ese archivo no es un modelo válido.')
    const id = arModels(deps).put(bytes)
    return c.json({ url: `${deps.config.appUrl}/api/public/ar/${id}.glb` }, 201)
  })

  app.get('/ar/:file', (c) => {
    const allowed = deps.limits.keyed.take(`portal-ar-get:${clientIp(c, deps.config.trustProxyHops)}`, { limit: 120, windowMs: 60_000 })
    if (!allowed.ok) throw new HttpError(429, 'too_many_attempts', 'Recibimos muchos intentos seguidos. Espera un momento y vuelve a intentarlo.', undefined, { retryAfter: allowed.retryAfterSec })
    const id = /^([\w-]{1,64})\.glb$/.exec(c.req.param('file'))?.[1]
    const bytes = id ? arModels(deps).get(id) : undefined
    if (!bytes) throw notFound(MISSING)
    return c.body(new Uint8Array(bytes), 200, {
      'Content-Type': 'model/gltf-binary',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, max-age=600',
      'X-Robots-Tag': 'noindex, nofollow',
      // Lo descarga la app de Google, no esta página.
      'Cross-Origin-Resource-Policy': 'cross-origin',
    })
  })

  // ── Abono en línea con la cuenta Flow del taller ─────────────────────────────
  // El monto sale de la revisión aceptada y de Ajustes; el cliente no manda ninguna cifra.
  app.post('/quotes/:token/pay/flow', async (c) => {
    const token = c.req.param('token')
    limit(c, token)
    const body = await readBody(c, z.object({ email: emailSchema.optional() }))
    const { row, revision } = await findByToken(token)
    if (!acceptedNow(row, revision)) throw conflict('not_accepted', 'Primero acepta la cotización.')
    const [org] = await deps.db.select({ currency: orgs.currency, name: orgs.name }).from(orgs).where(eq(orgs.id, row.orgId)).limit(1)
    const settings = await getSettings(deps.db, row.orgId)
    const snapshot = revision.snapshot as Snapshot
    const plan = paymentPlan(settings.payments?.deposit, row.acceptedTotal ?? acceptedTotalOf(row))
    const unavailable = () => new HttpError(409, 'payment_unavailable', 'El pago en línea no está disponible. Usa otro medio o escríbele al taller.')
    if (!plan.length || (org?.currency ?? 'CLP') !== 'CLP') throw unavailable()
    const amount = nextDue(plan, sumPayments(await listQuotePayments(deps, row.orgId, row.id)))
    if (amount <= 0) throw conflict('already_paid', 'Este abono ya está registrado.')
    const email = body.email ?? snapshot.client?.email
    if (!email) throw badRequest('Escribe tu correo para recibir el comprobante.', 'email')
    try {
      const url = await createFlowPayment(deps, {
        orgId: row.orgId,
        quoteId: row.id,
        number: row.number,
        revision: revision.revision,
        amount,
        email,
        subject: `Abono ${quoteLabel(row.number)} · ${org?.name ?? ''}`,
      })
      return c.json({ url })
    } catch (error) {
      if (error instanceof PaymentUnavailableError) throw unavailable()
      throw error
    }
  })

  const flowToken = async (c: Context): Promise<string | undefined> => {
    const fromQuery = c.req.query('token')
    if (fromQuery) return fromQuery
    const form = await c.req.parseBody().catch(() => null)
    return typeof form?.token === 'string' ? form.token : undefined
  }

  // Flow, servidor a servidor. Sin la consulta firmada no pasa nada, venga lo que venga aquí.
  app.post('/pay/flow/confirm/:paymentId', async (c) => {
    const token = await flowToken(c)
    if (!token || token.length > 200) throw badRequest('Falta el token de Flow.', 'token')
    try {
      return c.json({ result: await settleFlowPayment(deps, c.req.param('paymentId').slice(0, 64), token) })
    } catch (error) {
      if (error instanceof FlowError) throw new HttpError(502, 'flow_unreachable', 'No pudimos consultar el pago.')
      throw error
    }
  })

  // Vuelve el navegador del cliente: se verifica igual, y su regreso no decide nada por sí solo.
  const payReturn = async (c: Context<AppEnv>) => {
    const paymentId = c.req.param('paymentId')!.slice(0, 64)
    const token = await flowToken(c)
    let result: FlowSettlement = 'unknown'
    if (token && token.length <= 200) {
      try {
        result = await settleFlowPayment(deps, paymentId, token)
      } catch {
        deps.logger.warn('Retorno de Flow sin poder verificar')
      }
    }
    const [target] = await deps.db
      .select({ shareToken: quotes.shareToken })
      .from(quotePayments)
      .innerJoin(quotes, eq(quotes.id, quotePayments.quoteId))
      .where(eq(quotePayments.id, paymentId))
      .limit(1)
    return c.redirect(target?.shareToken ? `${deps.config.appUrl}/c/${target.shareToken}?pago=${PAY_RESULT[result]}` : deps.config.appUrl, 303)
  }
  app.get('/pay/flow/return/:paymentId', payReturn)
  app.post('/pay/flow/return/:paymentId', payReturn)

  return app
}

/**
 * Primera descarga del PDF desde el portal: es la señal que queda cuando el cliente no acepta ni
 * responde. No cuenta si la descarga alguien del taller.
 */
export async function notePortalPdf(c: Context<AppEnv>, deps: AppDeps, row: QuoteRow, revision: { id: string; revision: number; pdfDownloadedAt: Date | null }, clientName?: string): Promise<void> {
  if (revision.pdfDownloadedAt) return
  const viewer = await resolveSession(c, deps).catch(() => undefined)
  if (viewer?.org.id === row.orgId) return
  const [marked] = await deps.db
    .update(quoteRevisions)
    .set({ pdfDownloadedAt: deps.now() })
    .where(and(eq(quoteRevisions.id, revision.id), isNull(quoteRevisions.pdfDownloadedAt)))
    .returning({ id: quoteRevisions.id })
  if (!marked) return
  const who = clientName ?? 'Tu cliente'
  await logActivity(deps.db, {
    orgId: row.orgId,
    actor: { name: who },
    kind: 'quote.pdf_downloaded',
    text: `${who} descargó el PDF de ${quoteLabel(row.number)}`,
    link: `/cotizaciones/${row.id}`,
    subject: { type: 'quote', id: row.id },
    meta: { revision: revision.revision },
  })
}

const MISSING = 'Este enlace de cotización no existe o fue reemplazado. Pide a quien te la envió un enlace nuevo.'
