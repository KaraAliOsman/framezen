import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { MARGIN_LIMITS } from '@dekopen/shared'
import { AssetIdSchema, BANK_ACCOUNT_TYPES, DocSettingsPatchSchema, DocTemplateRefSchema, PAYMENT_LIMITS, SEND_FORMATS, safePaymentUrl, type OrgSettings } from '@dekopen/shared'
import type { AppDeps, AppEnv } from '../context'
import { orgSettings, orgs } from '../db/schema'
import { currencySchema, localeSchema } from '../lib/i18n/locale'
import { readBody } from '../lib/http'
import { deepMerge } from '../lib/merge'
import { hexColor } from '../lib/schemas'
import { requireManager, requireWritable } from '../middleware/auth'
import { redactSettings, viewerFor } from '../services/access'
import { refreshDraftTotals } from '../services/quotes'
import { badRequest } from '../lib/errors'
import { defaultStoredSettings, getSettings, withDefaults } from '../services/settings'

const pct = (label: string, max = 100) =>
  z.number({ error: `${label} debe ser un número.` }).min(0, `${label} no puede ser negativo.`).max(max, `${label} no puede pasar de ${max} %.`)
const money = (label: string) => z.number({ error: `${label} debe ser un número.` }).min(0, `${label} no puede ser negativo.`)
const mm = (label: string, max = 20000) => z.number({ error: `${label} debe ser un número en mm.` }).min(0, `${label} no puede ser negativo.`).max(max)

const pricingPatch = z
  .object({
    marginMode: z.enum(['margin', 'markup'], { error: 'El modo de margen debe ser «margen» o «recargo».' }),
    marginPct: pct('La ganancia', MARGIN_LIMITS.markup),
    laborPerM2: money('La mano de obra'),
    installMode: z.enum(['none', 'per_m2', 'per_unit'], { error: 'Elige cómo se cobra la instalación.' }),
    installValue: money('El valor de instalación'),
    wastePct: pct('La merma', 50),
    roundTo: z.union([z.literal(1), z.literal(10), z.literal(100), z.literal(1000)], { error: 'El redondeo debe ser 1, 10, 100 o 1.000.' }),
    ivaPct: pct('El IVA', 50),
    chargeFullBars: z.boolean(),
  })
  .partial()
  .refine((p) => p.marginMode !== 'margin' || (p.marginPct ?? 0) <= MARGIN_LIMITS.margin, { message: 'Un margen sobre la venta llega hasta 95 %. Para más, usa recargo sobre el costo.', path: ['marginPct'] })

const cutPatch = z
  .object({
    barLength: mm('El largo de barra').min(500, 'El largo de barra parece muy corto (mínimo 500 mm).'),
    kerf: mm('El corte de sierra', 20),
    trimStart: mm('El despunte inicial', 500),
    trimEnd: mm('El despunte final', 500),
    minReusable: mm('El retazo mínimo'),
  })
  .partial()

const text = (max: number) => z.string().max(max, `Este texto admite hasta ${max.toLocaleString('es-CL')} caracteres.`)

/** Referencia a una plantilla de documento (contrato DOCSCHEMA: `DocTemplateRefSchema`). */
const templateRef = (message: string) => z.string().refine((value) => DocTemplateRefSchema.safeParse(value).success, { message })

const documentsPatch = z
  .object({
    // v5: diseño predefinido (`luz`), id v4 (`esencial`) o plantilla propia (/api/templates). Se
    // resuelve al dibujar (resolveDocTemplateRef); una plantilla propia borrada cae a su diseño.
    quoteTemplate: templateRef('Esa plantilla de cotización no existe.'),
    catalogTemplate: templateRef('Esa plantilla de catálogo no existe.'),
    font: z.enum(['instrument', 'serif', 'grotesk'], { error: 'Esa tipografía no existe.' }),
    accent: hexColor.nullable(),
    showUnitPrice: z.boolean(),
    showArea: z.boolean(),
    showGlass: z.boolean(),
    showLine: z.boolean(),
    showColorSwatch: z.boolean(),
    showExteriorView: z.boolean(),
    paper: z.enum(['letter', 'a4'], { error: 'El papel debe ser Carta o A4.' }),
    intro: text(4000),
    conditions: text(8000),
    paymentTerms: text(1000),
    warranty: text(2000),
    // 0 = sin definir: la cotización no imprime vigencia.
    validityDays: z.number().int('La validez se indica en días enteros.').min(0, 'La validez no puede ser negativa.').max(365, 'La validez no puede pasar de 365 días.'),
    leadTimeText: text(500),
    includes: text(2000),
    excludes: text(2000),
    signatureName: text(120).nullable(),
    footer: text(500).nullable(),
    settings: DocSettingsPatchSchema,
    brandLogos: z.record(z.string().max(120), AssetIdSchema.nullable()),
    hardwareLogos: z.array(z.strictObject({ id: z.string().min(1).max(40), name: z.string().trim().min(1).max(60), assetId: AssetIdSchema })).max(6),
  })
  .partial()

/** Plantilla del mensaje de envío por idioma; vacía vuelve a la que trae DEKOPEN. */
const templatesByLocale = z.partialRecord(localeSchema, text(2000))

const sendingPatch = z
  .object({
    format: z.enum(SEND_FORMATS, { error: 'Elige PDF, enlace web o ambos.' }),
    templates: z.object({ whatsapp: templatesByLocale, email: templatesByLocale }).partial(),
    portal3d: z.boolean(),
    portalAr: z.boolean(),
  })
  .partial()

const paymentId = z.string().trim().min(1).max(40)
const paymentAccount = z.object({
  id: paymentId,
  holder: text(120),
  rut: text(20),
  bank: text(80),
  type: z.enum(BANK_ACCOUNT_TYPES, { error: 'Ese tipo de cuenta no existe.' }),
  number: text(40),
  email: text(254),
})
// Solo https: nada de javascript:, data: ni http. El cliente final lo abre con un toque.
const paymentLink = z.object({
  id: paymentId,
  label: z.string().trim().min(1, 'Escribe qué dirá el botón de pago.').max(PAYMENT_LIMITS.label, `El botón admite hasta ${PAYMENT_LIMITS.label} caracteres.`),
  url: z.string().transform((value, ctx) => {
    const safe = safePaymentUrl(value)
    if (!safe) {
      ctx.addIssue({ code: 'custom', message: 'El enlace de pago debe empezar con https:// y ser una dirección válida.' })
      return z.NEVER
    }
    return safe
  }),
})
const paymentsPatch = z
  .object({
    accounts: z.array(paymentAccount).max(PAYMENT_LIMITS.accounts, `Puedes publicar hasta ${PAYMENT_LIMITS.accounts} cuentas.`),
    instructions: text(PAYMENT_LIMITS.instructions),
    links: z.array(paymentLink).max(PAYMENT_LIMITS.links, `Puedes publicar hasta ${PAYMENT_LIMITS.links} enlaces.`),
    deposit: z
      .object({
        mode: z.enum(['none', 'percent', 'amount', 'milestones'], { error: 'Elige cómo se calcula el abono.' }),
        value: z.number({ error: 'El abono debe ser un número.' }).min(0, 'El abono no puede ser negativo.').max(1_000_000_000_000),
        milestones: z
          .array(z.object({ id: paymentId, label: text(PAYMENT_LIMITS.label), pct: z.number({ error: 'El hito debe ser un porcentaje.' }).min(0, 'El hito no puede ser negativo.').max(100, 'El hito no puede pasar de 100 %.') }))
          .max(PAYMENT_LIMITS.milestones, `Puedes tener hasta ${PAYMENT_LIMITS.milestones} hitos.`)
          .optional(),
      })
      .refine((d) => d.mode !== 'percent' || d.value <= 100, { message: 'El abono no puede pasar de 100 %.' })
      .refine((d) => d.mode !== 'milestones' || (d.milestones ?? []).reduce((sum, m) => sum + m.pct, 0) <= 100, { message: 'Los hitos suman más de 100 %.' }),
    showWhen: z.enum(['after_accept', 'always'], { error: 'Elige cuándo se muestran los datos de pago.' }),
    showInPdf: z.boolean(),
  })
  .partial()

const defaultsPatch = z.object({ lineId: z.string().nullable(), colorId: z.string().nullable(), glassId: z.string().nullable() }).partial()

const counter = (label: string) =>
  z.number({ error: `${label} debe ser un número.` }).int(`${label} debe ser un número entero.`).min(1, `${label} debe ser 1 o más.`).max(99_999_999)

export const settingsPatchSchema = z.object({
  pricing: pricingPatch.optional(),
  cut: cutPatch.optional(),
  documents: documentsPatch.optional(),
  defaults: defaultsPatch.optional(),
  sending: sendingPatch.optional(),
  payments: paymentsPatch.optional(),
  nextQuoteNumber: counter('El próximo número de cotización').optional(),
  nextWorkOrderNumber: counter('El próximo número de OT').optional(),
  /** Idioma por defecto de los documentos (orgs.locale). */
  locale: localeSchema.optional(),
  /** Moneda ISO 4217 de los precios (orgs.currency). */
  currency: currencySchema.optional(),
  /** Nombre del impuesto en documentos («IVA», «VAT»…); la tasa es pricing.ivaPct. */
  taxLabel: z.string().trim().min(1, 'Escribe el nombre del impuesto (por ejemplo IVA).').max(20, 'El nombre del impuesto admite hasta 20 caracteres.').optional(),
})

/** Nombre del impuesto si la empresa no eligió otro. */
export const DEFAULT_TAX_LABEL = 'IVA'

/** Ajustes + idioma, moneda e impuesto de la empresa (estos dos primeros viven en `orgs`). */
async function regionalSettings(deps: AppDeps, orgId: string, settings: OrgSettings): Promise<OrgSettings> {
  const [org] = await deps.db.select({ locale: orgs.locale, currency: orgs.currency }).from(orgs).where(eq(orgs.id, orgId)).limit(1)
  return { ...settings, locale: localeSchema.safeParse(org?.locale).data ?? 'es', currency: org?.currency || 'CLP', taxLabel: settings.taxLabel || DEFAULT_TAX_LABEL, mailProvider: Boolean(deps.config.resendApiKey) }
}

export function settingsRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()

  // Margen, mano de obra e instalación solo para quien calcula precios (services/access.ts).
  app.get('/', async (c) => {
    const orgId = c.get('auth').org.id
    return c.json(redactSettings(await regionalSettings(deps, orgId, await getSettings(deps.db, orgId)), await viewerFor(c, deps)))
  })

  app.patch('/', requireWritable(deps), requireManager(deps), async (c) => {
    const { nextQuoteNumber, nextWorkOrderNumber, locale, currency, ...patch } = await readBody(c, settingsPatchSchema)
    const orgId = c.get('auth').org.id
    if (locale !== undefined || currency !== undefined) {
      await deps.db
        .update(orgs)
        .set({ ...(locale !== undefined ? { locale } : {}), ...(currency !== undefined ? { currency } : {}), updatedAt: deps.now() })
        .where(eq(orgs.id, orgId))
    }
    const [row] = await deps.db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)).limit(1)
    const data = deepMerge(withDefaults(row?.data), patch)
    // El tope depende del modo guardado: un cambio que solo trae la cifra también se revisa.
    if (data.pricing.marginMode === 'margin' && data.pricing.marginPct > MARGIN_LIMITS.margin) throw badRequest('Un margen sobre la venta llega hasta 95 %. Para más, usa recargo sobre el costo.', 'pricing.marginPct')
    const values = {
      data,
      updatedAt: deps.now(),
      ...(nextQuoteNumber !== undefined ? { nextQuoteNumber } : {}),
      ...(nextWorkOrderNumber !== undefined ? { nextWorkOrderNumber } : {}),
    }
    if (row) await deps.db.update(orgSettings).set(values).where(eq(orgSettings.orgId, orgId))
    else await deps.db.insert(orgSettings).values({ orgId, ...values, data: deepMerge(defaultStoredSettings(), patch) })
    // Precios o taller cambian las cifras: los borradores guardados quedan al día con el editor.
    if (patch.pricing || patch.cut) await refreshDraftTotals(deps, orgId)
    return c.json(await regionalSettings(deps, orgId, await getSettings(deps.db, orgId)))
  })

  return app
}
