import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { BrandSettings, Catalog } from '@dekopen/engine'
import type {
  CatalogBrandsResponse,
  CatalogResponse,
  GlassPatchResponse,
  ImportCsvResult,
  LinePatchResponse,
  PriceOverride,
  PriceOverridesResponse,
} from '@dekopen/shared'
import type { AppDeps, AppEnv } from '../context'
import { orgCatalog } from '../db/schema'
import { badRequest, notFound } from '../lib/errors'
import { readBody } from '../lib/http'
import { requireManager, requireWritable } from '../middleware/auth'
import { redactCatalog, redactPriceOverrides, viewerFor } from '../services/access'
import { firstName, logActivity } from '../services/activity'
import {
  applyLineOverride,
  buildEffectiveCatalog,
  glassMinAreasOf,
  LINE_OVERRIDE_KEYS,
  lineOverridesOf,
  overrideKey,
  referencedByQuotes,
  summarizeBrands,
  type LineOverride,
  type LineOverrideKey,
  type OrgCatalogState,
  type PautaPatch,
} from '../services/catalog'
import type { CustomCatalog } from '../db/schema'
import { importMisPrecios } from '../services/csv-import'
import { CustomColorService } from '../services/textures/color-service'
import { customColorCreateSchema, customColorPatchSchema } from '@dekopen/shared'
import { refreshDraftTotals } from '../services/quotes'
import { getSettings } from '../services/settings'

const discountPct = z.number().min(0, 'El descuento no puede ser negativo.').max(100, 'El descuento no puede pasar de 100 %.')

const brandPatchSchema = z.object({
  enabled: z.boolean().optional(),
  settings: z
    .object({
      trim: z.number().min(0).max(500),
      kerf: z.number().min(0).max(20),
      discounts: z
        .object({ profiles: discountPct, reinforcement: discountPct, hardware: discountPct, glass: discountPct, accessories: discountPct })
        .partial(),
      marginAdjust: z.number().min(-50).max(50).nullable(),
    })
    .partial()
    .optional(),
})

const overrideSchema = z.object({
  kind: z.enum(['profile', 'item', 'glass'], { error: 'El tipo de precio debe ser perfil, herraje o vidrio.' }),
  id: z.string().min(1).max(200),
  colorId: z.string().max(100).optional(),
  price: z.number({ error: 'El precio debe ser un número.' }).min(0, 'El precio no puede ser negativo.').max(1_000_000_000),
})

const pricesSchema = z.object({
  overrides: z.array(overrideSchema).max(20_000, 'Son demasiados precios de una vez (máximo 20.000).').default([]),
  /** Precios propios a quitar (vuelven al precio de lista). */
  remove: z.array(overrideSchema.omit({ price: true })).max(20_000).optional(),
  /** true = reemplaza todos los precios propios por los enviados. */
  replace: z.boolean().optional(),
})

// ── Pauta propia por línea (PATCH /api/catalog/lines/:id) ───────────────────
const mm = (max: number) =>
  z
    .number({ error: 'Las medidas de la pauta van en milímetros (un número).' })
    .min(0, 'Las medidas de la pauta no pueden ser negativas.')
    .max(max, `Revisa la pauta: ese valor pasa de ${max} mm.`)
    .nullable()

/** Cada campo: número = valor propio; null = vuelve al de fábrica. */
const pautaPatchSchema = z
  .object({
    weld: mm(20),
    frameDeduction: mm(400),
    sashWidth: mm(400),
    sashDeduction: mm(400),
    sashOverlap: mm(100),
    glassGap: mm(50),
    mullionDeduction: mm(400),
    beadDeduction: mm(600),
    slidingHeightAdd: z.number({ error: 'Las medidas de la pauta van en milímetros (un número).' }).min(-200).max(400).nullable(),
    reinforcement: z.object({ frame: mm(600), sash: mm(600), mullion: mm(600) }).partial().nullable(),
  })
  .partial()

type PautaPatchBody = z.infer<typeof pautaPatchSchema>

/** null = toda esa pauta vuelve a la de fábrica. */
const linePatchSchema = z.object({
  pauta: pautaPatchSchema.nullable().optional(),
  doorPauta: pautaPatchSchema.nullable().optional(),
  sashInPauta: pautaPatchSchema.nullable().optional(),
})

const PAUTA_COPY: Record<LineOverrideKey, string> = { pauta: 'la pauta', doorPauta: 'la pauta de puertas', sashInPauta: 'la pauta de hoja interior' }

/**
 * Mezcla el ajuste guardado con lo enviado. Los valores iguales a los de fábrica no se
 * guardan (así «ajustada» significa que de verdad difiere).
 */
function mergeLinePatch(current: PautaPatch | undefined, patch: PautaPatchBody | null | undefined, factory: Record<string, unknown> | undefined): PautaPatch | undefined {
  if (patch === undefined) return current
  if (patch === null) return undefined
  const next: Record<string, unknown> = { ...(current ?? {}) }
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'reinforcement' || value === undefined) continue
    if (value === null || factory?.[key] === value) delete next[key]
    else next[key] = value
  }
  if (patch.reinforcement !== undefined) {
    const factoryR = (factory?.reinforcement ?? {}) as Record<string, unknown>
    const r: Record<string, unknown> = patch.reinforcement === null ? {} : { ...((current?.reinforcement as Record<string, unknown> | undefined) ?? {}) }
    for (const [key, value] of Object.entries(patch.reinforcement ?? {})) {
      if (value === undefined) continue
      if (value === null || factoryR[key] === value) delete r[key]
      else r[key] = value
    }
    if (Object.keys(r).length) next.reinforcement = r
    else delete next.reinforcement
  }
  return Object.keys(next).length ? (next as PautaPatch) : undefined
}

/** PATCH /api/catalog/glass/:id — área mínima en m² (null = la de fábrica). */
const glassPatchSchema = z.object({
  minArea: z
    .number({ error: 'El área mínima va en m² (un número).' })
    .min(0, 'El área mínima no puede ser negativa.')
    .max(20, 'Revisa el área mínima: pasa de 20 m².')
    .nullable(),
})

const truthy = (value: string | undefined) => value === '1' || value === 'true'

/** «1 precio», «1.234 precios». */
export function countLabel(n: number, one: string, many: string): string {
  return `${n.toLocaleString('es-CL')} ${n === 1 ? one : many}`
}

/** Mensaje humano de la importación (con plurales correctos y vista previa). */
export function importMessage(matched: number, unmatched: number, dryRun: boolean): string {
  const rest = unmatched ? ` ${unmatched === 1 ? '1 fila no calzó' : `${countLabel(unmatched, 'fila', 'filas')} no calzaron`} con tu catálogo.` : ''
  if (matched === 0) return 'No encontramos coincidencias con tu catálogo. Revisa que la marca del archivo esté en el catálogo.'
  if (dryRun) return `Vista previa: se ${matched === 1 ? 'actualizaría 1 precio' : `actualizarían ${countLabel(matched, 'precio', 'precios')}`}.${rest} Aún no guardamos nada.`
  return `Listo: actualizamos ${countLabel(matched, 'precio', 'precios')}.${rest}`
}

/** Ids que existen en el catálogo (para no guardar precios huérfanos). */
function knownIds(catalog: Catalog): Record<PriceOverride['kind'], Set<string>> {
  return {
    profile: new Set(catalog.profiles.map((p) => p.id)),
    item: new Set(catalog.items.map((i) => i.id)),
    glass: new Set(catalog.glass.map((g) => g.id)),
  }
}

export function catalogRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()
  const manage = [requireWritable(deps), requireManager(deps)] as const

  async function saveState(orgId: string, patch: Partial<Omit<OrgCatalogState, 'updatedAt'>>): Promise<Date> {
    const now = deps.now()
    await deps.db
      .insert(orgCatalog)
      .values({ orgId, enabledBrandIds: [], ...patch, updatedAt: now })
      .onConflictDoUpdate({ target: orgCatalog.orgId, set: { ...patch, updatedAt: now } })
    return now
  }

  /**
   * Mezcla precios propios (misma clave = reemplaza). Con `dryRun` sólo calcula el resultado,
   * sin guardar (vista previa de la importación).
   */
  async function mergeOverrides(
    orgId: string,
    incoming: PriceOverride[],
    options: { remove?: Omit<PriceOverride, 'price'>[]; replace?: boolean; dryRun?: boolean } = {},
  ) {
    const state = await deps.catalogs.getOrgState(orgId)
    const base = await deps.catalogs.getBase()
    const known = knownIds(buildEffectiveCatalog(base.data, state, { onlyEnabled: false }))
    const map = new Map<string, PriceOverride>(options.replace ? [] : state.priceOverrides.map((o) => [overrideKey(o), o]))
    for (const r of options.remove ?? []) map.delete(overrideKey(r))
    let ignored = 0
    for (const o of incoming) {
      if (!known[o.kind].has(o.id)) {
        ignored++
        continue
      }
      const clean: PriceOverride = { kind: o.kind, id: o.id, ...(o.colorId ? { colorId: o.colorId } : {}), price: Math.round(o.price) }
      map.set(overrideKey(clean), clean)
    }
    const overrides = [...map.values()]
    const updatedAt = options.dryRun ? state.updatedAt : await saveState(orgId, { priceOverrides: overrides })
    return { overrides, ignored, updatedAt }
  }

  /**
   * Catálogo efectivo (marcas activas + lo que ya usan las cotizaciones) con los precios de la
   * organización. Es el que usa el motor del editor: debe calcular lo mismo que el servidor.
   */
  app.get('/', async (c) => {
    const orgId = c.get('auth').org.id
    const settings = await getSettings(deps.db, orgId)
    const include = await referencedByQuotes(deps.db, orgId)
    const { catalog, updatedAt } = await deps.catalogs.effective(orgId, { onlyEnabled: true, kerf: settings.cut.kerf, include })
    // Precios de compra solo para quien los usa (services/access.ts).
    const body: CatalogResponse = { ...redactCatalog(catalog, await viewerFor(c, deps)), updatedAt: updatedAt.toISOString() }
    return c.json(body)
  })

  app.get('/brands', async (c) => {
    const orgId = c.get('auth').org.id
    const settings = await getSettings(deps.db, orgId)
    const base = await deps.catalogs.getBase()
    const state = await deps.catalogs.getOrgState(orgId)
    const items = summarizeBrands(base.data, state, settings.cut.kerf).sort(
      (a, b) => Number(b.enabled) - Number(a.enabled) || Number(b.recommended) - Number(a.recommended) || a.brand.name.localeCompare(b.brand.name, 'es'),
    )
    const body: CatalogBrandsResponse = { items, total: items.length, baseVersion: base.version }
    return c.json(body)
  })

  app.patch('/brands/:id', ...manage, async (c) => {
    const body = await readBody(c, brandPatchSchema)
    const { org, user } = c.get('auth')
    const brandId = c.req.param('id')
    const base = await deps.catalogs.getBase()
    const brand = base.data.brands.find((b) => b.id === brandId)
    if (!brand) throw notFound('Esa marca no está en el catálogo.')
    const state = await deps.catalogs.getOrgState(org.id)
    const enabled = new Set(state.enabledBrandIds)
    if (body.enabled === true) enabled.add(brandId)
    if (body.enabled === false) enabled.delete(brandId)
    let brandSettings = state.brandSettings
    if (body.settings) {
      const current = state.brandSettings.find((s) => s.brandId === brandId)
      const { marginAdjust, discounts, ...rest } = body.settings
      const next = {
        ...(current ?? {}),
        ...rest,
        brandId,
        enabled: enabled.has(brandId),
        discounts: { ...(current?.discounts ?? {}), ...(discounts ?? {}) },
      } as BrandSettings
      if (marginAdjust === null) delete next.marginAdjust
      else if (marginAdjust !== undefined) next.marginAdjust = marginAdjust
      brandSettings = [...state.brandSettings.filter((s) => s.brandId !== brandId), next]
    }
    await saveState(org.id, { enabledBrandIds: [...enabled], brandSettings })
    // Descuentos, despunte o margen de la marca cambian los precios de los borradores.
    if (body.settings) await refreshDraftTotals(deps, org.id)
    if (body.enabled !== undefined && body.enabled !== state.enabledBrandIds.includes(brandId)) {
      await logActivity(deps.db, {
        orgId: org.id,
        actor: { userId: user.id, name: user.name },
        kind: body.enabled ? 'catalog.brand_enabled' : 'catalog.brand_disabled',
        text: `${firstName(user.name)} ${body.enabled ? 'activó' : 'desactivó'} la marca ${brand.name}`,
        link: '/catalogo',
      })
    }
    const settings = await getSettings(deps.db, org.id)
    const summary = summarizeBrands(base.data, await deps.catalogs.getOrgState(org.id), settings.cut.kerf).find((s) => s.brand.id === brandId)
    return c.json(summary)
  })

  /**
   * Ajusta la pauta de una línea para esta organización (sólo lo enviado; null en un campo
   * o en una pauta completa = vuelve a la de fábrica). Se aplica en el catálogo efectivo.
   */
  app.patch('/lines/:id', ...manage, async (c) => {
    const body = await readBody(c, linePatchSchema)
    const { org, user } = c.get('auth')
    const lineId = c.req.param('id')
    const base = await deps.catalogs.getBase()
    const line = base.data.lines.find((l) => l.id === lineId)
    if (!line) throw notFound('Esa línea no está en el catálogo.')
    const state = await deps.catalogs.getOrgState(org.id)
    const all: Record<string, LineOverride> = { ...lineOverridesOf(state.custom) }
    const current = all[lineId] ?? {}
    const next: LineOverride = {}
    for (const key of LINE_OVERRIDE_KEYS) {
      const merged = mergeLinePatch(current[key], body[key], line[key] as Record<string, unknown> | undefined)
      if (merged) next[key] = merged
    }
    const touched = LINE_OVERRIDE_KEYS.filter((k) => JSON.stringify(current[k] ?? null) !== JSON.stringify(next[k] ?? null))
    const now = deps.now()
    if (LINE_OVERRIDE_KEYS.some((k) => next[k])) all[lineId] = { ...next, updatedAt: touched.length ? now.toISOString() : (current.updatedAt ?? now.toISOString()) }
    else delete all[lineId]
    let updatedAt = state.updatedAt
    if (touched.length) {
      updatedAt = await saveState(org.id, { custom: { ...state.custom, lines: all } as CustomCatalog })
      await refreshDraftTotals(deps, org.id)
      const reset = !all[lineId]
      await logActivity(deps.db, {
        orgId: org.id,
        actor: { userId: user.id, name: user.name },
        kind: 'catalog.pauta_updated',
        text: reset
          ? `${firstName(user.name)} volvió a la pauta de fábrica de ${line.name}`
          : `${firstName(user.name)} ajustó ${touched.map((k) => PAUTA_COPY[k]).join(' y ')} de ${line.name}`,
        link: '/catalogo',
        meta: { lineId, fields: touched },
      })
    }
    const response: LinePatchResponse = {
      line: applyLineOverride(line, all[lineId]),
      override: all[lineId] ?? null,
      factory: {
        pauta: line.pauta,
        ...(line.doorPauta ? { doorPauta: line.doorPauta } : {}),
        ...(line.sashInPauta ? { sashInPauta: line.sashInPauta } : {}),
      },
      updatedAt: updatedAt.toISOString(),
    }
    return c.json(response)
  })

  /**
   * Área mínima cobrada propia de un vidrio (m²) para esta organización: número = propia
   * (0 = sin mínimo), null = vuelve a la de fábrica. El motor cobra max(área, mínima).
   */
  app.patch('/glass/:id', ...manage, async (c) => {
    const { minArea } = await readBody(c, glassPatchSchema)
    const { org, user } = c.get('auth')
    const glassId = c.req.param('id')
    const base = await deps.catalogs.getBase()
    const state = await deps.catalogs.getOrgState(org.id)
    const glass = [...base.data.glass, ...(state.custom?.glass ?? [])].find((g) => g.id === glassId)
    if (!glass) throw notFound('Ese vidrio no está en el catálogo.')
    const factoryMinArea = typeof glass.minArea === 'number' ? glass.minArea : null
    const areas = { ...glassMinAreasOf(state.custom) }
    const previous = areas[glassId] ?? null
    // Igual al de fábrica (o 0 cuando fábrica no tiene mínimo) = no es propio: «ajustado» significa que difiere.
    const sameAsFactory = minArea === factoryMinArea || (minArea === 0 && factoryMinArea === null)
    const next = minArea === null || sameAsFactory ? null : Math.round(minArea * 1000) / 1000
    if (next === null) delete areas[glassId]
    else areas[glassId] = next
    let updatedAt = state.updatedAt
    if (next !== previous) {
      updatedAt = await saveState(org.id, { custom: { ...state.custom, glassMinArea: areas } })
      await refreshDraftTotals(deps, org.id)
      await logActivity(deps.db, {
        orgId: org.id,
        actor: { userId: user.id, name: user.name },
        kind: 'catalog.glass_min_area',
        text:
          next === null
            ? `${firstName(user.name)} volvió al área mínima de fábrica de ${glass.name}`
            : `${firstName(user.name)} fijó un mínimo de ${next.toLocaleString('es-CL')} m² para ${glass.name}`,
        link: '/catalogo',
        meta: { glassId, minArea: next },
      })
    }
    const effectiveMin = next ?? factoryMinArea
    const response: GlassPatchResponse = {
      glass: { ...glass, ...(effectiveMin === null ? {} : { minArea: effectiveMin }) },
      minArea: next,
      factoryMinArea,
      updatedAt: updatedAt.toISOString(),
    }
    return c.json(response)
  })

  app.get('/prices', async (c) => {
    const state = await deps.catalogs.getOrgState(c.get('auth').org.id)
    const overrides = redactPriceOverrides(state.priceOverrides, await viewerFor(c, deps))
    const body: PriceOverridesResponse = { overrides, updatedAt: state.updatedAt.toISOString() }
    return c.json(body)
  })

  /** Guarda precios propios. Por defecto mezcla con los existentes (misma clave = reemplaza). */
  app.put('/prices', ...manage, async (c) => {
    const body = await readBody(c, pricesSchema)
    const orgId = c.get('auth').org.id
    const result = await mergeOverrides(orgId, body.overrides, { remove: body.remove, replace: body.replace })
    await refreshDraftTotals(deps, orgId)
    const response: PriceOverridesResponse = { overrides: result.overrides, ignored: result.ignored, updatedAt: result.updatedAt.toISOString() }
    return c.json(response)
  })

  /**
   * Importa un CSV «MisPrecios». Acepta el texto directo (text/csv o text/plain) o
   * JSON { csv, brandId?, dryRun? }. Los precios que calzan se guardan como precios propios.
   * Con ?dryRun=1 (o dryRun: true) sólo devuelve la vista previa: no guarda nada.
   */
  app.post('/import-csv', ...manage, async (c) => {
    const type = c.req.header('content-type') ?? ''
    let csv: string
    let brandId: string | undefined
    let dryRun = truthy(c.req.query('dryRun'))
    if (type.includes('application/json')) {
      const body = await readBody(
        c,
        z.object({
          csv: z.string({ error: 'Falta el contenido del CSV.' }).min(1, 'El archivo está vacío.'),
          brandId: z.string().optional(),
          dryRun: z.boolean().optional(),
        }),
      )
      csv = body.csv
      brandId = body.brandId
      dryRun ||= body.dryRun === true
    } else {
      csv = await c.req.text()
      brandId = c.req.query('brandId') || undefined
    }
    if (!csv.trim()) throw badRequest('El archivo está vacío. Exporta tu lista «MisPrecios» y vuelve a subirla.', 'csv')
    if (csv.length > 15 * 1024 * 1024) throw badRequest('El archivo es demasiado grande (máximo 15 MB).', 'csv')
    const { org, user } = c.get('auth')
    const base = await deps.catalogs.getBase()
    const state = await deps.catalogs.getOrgState(org.id)
    const result = importMisPrecios(csv, buildEffectiveCatalog(base.data, state, { onlyEnabled: false }), { brandId })
    if (result.rows === 0) throw badRequest('No encontramos filas con precios en el archivo. Revisa que sea la exportación «MisPrecios» (separada por punto y coma).', 'csv', 'empty_csv')
    const saved = result.overrides.length
      ? await mergeOverrides(org.id, result.overrides, { dryRun })
      : { overrides: state.priceOverrides, updatedAt: state.updatedAt }
    if (result.overrides.length && !dryRun) await refreshDraftTotals(deps, org.id)
    if (result.matched && !dryRun) {
      await logActivity(deps.db, {
        orgId: org.id,
        actor: { userId: user.id, name: user.name },
        kind: 'catalog.prices_imported',
        text: `${firstName(user.name)} importó ${countLabel(result.matched, 'precio', 'precios')}${result.brands.length ? ` de ${result.brands.slice(0, 3).join(', ')}` : ''}`,
        link: '/catalogo',
      })
    }
    const response: ImportCsvResult = {
      dryRun,
      rows: result.rows,
      matched: result.matched,
      unmatched: result.unmatched,
      skipped: result.skipped,
      brands: result.brands,
      unmatchedSample: result.unmatchedSample,
      overridesTotal: saved.overrides.length,
      updatedAt: saved.updatedAt.toISOString(),
      message: importMessage(result.matched, result.unmatched, dryRun),
    }
    return c.json(response)
  })

  // ── Colores propios y texturas propias sobre colores base (TEXUP; services/textures) ──
  //   GET /colors → CatalogColorsResponse · POST /colors → CatalogColorMutationResponse (201)
  //   PATCH /colors/:id (en colores base solo `texture`) · DELETE /colors/:id = archivar (deshacer)
  //   POST /colors/:id/restore
  const customColors = new CustomColorService(deps)
  app.get('/colors', async (c) => c.json(await customColors.list(c.get('auth').org.id)))
  app.post('/colors', ...manage, async (c) => c.json(await customColors.create(c.get('auth'), await readBody(c, customColorCreateSchema)), 201))
  app.patch('/colors/:id', ...manage, async (c) => c.json(await customColors.patch(c.get('auth'), c.req.param('id'), await readBody(c, customColorPatchSchema))))
  app.delete('/colors/:id', ...manage, async (c) => c.json(await customColors.archive(c.get('auth'), c.req.param('id'))))
  app.post('/colors/:id/restore', ...manage, async (c) => c.json(await customColors.restore(c.get('auth'), c.req.param('id'))))

  return app
}
