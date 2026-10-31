import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { AppDeps, AppEnv } from '../context'
import { orgSettings } from '../db/schema'
import { readBody } from '../lib/http'
import { deepMerge } from '../lib/merge'
import { hexColor } from '../lib/schemas'
import { requireManager, requireWritable } from '../middleware/auth'
import { redactSettings, viewerFor } from '../services/access'
import { refreshDraftTotals } from '../services/quotes'
import { defaultStoredSettings, getSettings, withDefaults } from '../services/settings'

const pct = (label: string, max = 100) =>
  z.number({ error: `${label} debe ser un número.` }).min(0, `${label} no puede ser negativo.`).max(max, `${label} no puede pasar de ${max} %.`)
const money = (label: string) => z.number({ error: `${label} debe ser un número.` }).min(0, `${label} no puede ser negativo.`)
const mm = (label: string, max = 20000) => z.number({ error: `${label} debe ser un número en mm.` }).min(0, `${label} no puede ser negativo.`).max(max)

const pricingPatch = z
  .object({
    marginMode: z.enum(['margin', 'markup'], { error: 'El modo de margen debe ser «margen» o «recargo».' }),
    marginPct: pct('El margen', 95),
    laborPerM2: money('La mano de obra'),
    installMode: z.enum(['none', 'per_m2', 'per_unit'], { error: 'Elige cómo se cobra la instalación.' }),
    installValue: money('El valor de instalación'),
    wastePct: pct('La merma', 50),
    roundTo: z.union([z.literal(1), z.literal(10), z.literal(100), z.literal(1000)], { error: 'El redondeo debe ser 1, 10, 100 o 1.000.' }),
    ivaPct: pct('El IVA', 50),
    chargeFullBars: z.boolean(),
  })
  .partial()

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

const documentsPatch = z
  .object({
    quoteTemplate: z.enum(['esencial', 'galeria', 'compacta', 'editorial'], { error: 'Esa plantilla de cotización no existe.' }),
    catalogTemplate: z.enum(['vitrina', 'ficha', 'lookbook'], { error: 'Esa plantilla de catálogo no existe.' }),
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
    validityDays: z.number().int('La validez se indica en días enteros.').min(1, 'La validez debe ser de al menos 1 día.').max(365, 'La validez no puede pasar de 365 días.'),
    leadTimeText: text(500),
    signatureName: text(120).nullable(),
    footer: text(500).nullable(),
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
  nextQuoteNumber: counter('El próximo número de cotización').optional(),
  nextWorkOrderNumber: counter('El próximo número de OT').optional(),
})

export function settingsRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()

  // Margen, mano de obra e instalación solo para quien calcula precios (services/access.ts).
  app.get('/', async (c) => c.json(redactSettings(await getSettings(deps.db, c.get('auth').org.id), await viewerFor(c, deps))))

  app.patch('/', requireWritable(deps), requireManager(deps), async (c) => {
    const { nextQuoteNumber, nextWorkOrderNumber, ...patch } = await readBody(c, settingsPatchSchema)
    const orgId = c.get('auth').org.id
    const [row] = await deps.db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)).limit(1)
    const data = deepMerge(withDefaults(row?.data), patch)
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
    return c.json(await getSettings(deps.db, orgId))
  })

  return app
}
