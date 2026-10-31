/**
 * Permisos por rol aplicados en el servidor (no solo en la interfaz). Misma regla que los
 * documentos de taller (`workshopDocumentAccess` / `canSeeWorkshopCosts`): sin la función
 * «roles» del plan todos ven y hacen todo (una persona o un equipo chico); con roles:
 *
 * - Costo interno y margen real (totals.cost, totals.marginPct): solo el dueño (documento «costs»).
 * - Precios de compra del catálogo: dueño, jefe de taller (materiales con costo) y cotizador.
 * - Margen, mano de obra e instalación (ajustes y margen propio de la cotización): dueño y
 *   cotizador, porque el motor calcula el precio en su navegador (SPEC §1.4).
 * - Operario e instalador no reciben ninguno de esos datos.
 * - Cambiar el margen propio de una cotización: solo quien ve costos.
 * - Crear, editar, enviar, cambiar de estado y borrar cotizaciones y clientes: dueño y cotizador.
 * - Pasar a taller: dueño, cotizador y jefe de taller. Avance de OT: dueño, jefe de taller,
 *   operario e instalador (marca lo instalado).
 * - Facturación y tarjeta: solo el dueño (ver routes/billing.ts y services/session.ts).
 */
import { eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import { canSeeWorkshopCosts, workshopDocumentAccess } from '@framezen/documents'
import type { Catalog } from '@framezen/engine'
import { planFeatures, type Feature, type OrgSettings, type PriceOverride, type Quote, type Role } from '@framezen/shared'
import type { AppDeps, AppEnv, AuthContext } from '../context'
import { subscriptions } from '../db/schema'
import { forbidden } from '../lib/errors'

export interface Viewer {
  role: Role
  features: readonly Feature[]
}

/** Quién mira: rol de la sesión y funciones del plan (para saber si los roles están activos). */
export async function viewerOf(deps: Pick<AppDeps, 'db'>, auth: Pick<AuthContext, 'role' | 'org'>): Promise<Viewer> {
  // El dueño ve y hace todo, con o sin roles: no hace falta consultar el plan.
  if (auth.role === 'owner') return { role: 'owner', features: [] }
  const [sub] = await deps.db.select({ plan: subscriptions.plan }).from(subscriptions).where(eq(subscriptions.orgId, auth.org.id)).limit(1)
  return { role: auth.role, features: planFeatures(sub?.plan ?? 'trial') }
}

/** Igual que viewerOf, pero una sola consulta por petición. */
export async function viewerFor(c: Context<AppEnv>, deps: Pick<AppDeps, 'db'>): Promise<Viewer> {
  const cached = c.get('viewer')
  if (cached) return cached
  const viewer = await viewerOf(deps, c.get('auth'))
  c.set('viewer', viewer)
  return viewer
}

const rolesOn = (viewer: Viewer) => viewer.role !== 'owner' && viewer.features.includes('roles')
const allowed = (viewer: Viewer, roles: readonly Role[]) => !rolesOn(viewer) || roles.includes(viewer.role)

/** Costo interno y margen real (como el documento de taller «costs»). */
export function canSeeMargins(viewer: Viewer): boolean {
  return viewer.role === 'owner' || workshopDocumentAccess('costs', viewer).visible
}

/** ¿Recibe margen, mano de obra e instalación (para calcular el precio de venta en vivo)? */
export function receivesPricingInputs(viewer: Viewer): boolean {
  return canSeeMargins(viewer) || allowed(viewer, ['owner', 'estimator'])
}

/** ¿Recibe los precios de compra del catálogo? (materiales con costo o precio en vivo). */
export function receivesPurchasePrices(viewer: Viewer): boolean {
  return receivesPricingInputs(viewer) || viewer.role === 'owner' || canSeeWorkshopCosts(viewer)
}

export const canWriteQuotes = (viewer: Viewer) => allowed(viewer, ['owner', 'estimator'])
export const canCreateWorkOrders = (viewer: Viewer) => allowed(viewer, ['owner', 'estimator', 'workshop'])
export const canUpdateWorkOrders = (viewer: Viewer) => allowed(viewer, ['owner', 'workshop', 'operator', 'installer'])

/** Corta la petición con 403 si el rol no puede hacerlo (solo con roles activos en el plan). */
export const requirePermission = (deps: AppDeps, check: (viewer: Viewer) => boolean, message: string) =>
  createMiddleware<AppEnv>(async (c, next) => {
    if (!check(await viewerFor(c, deps))) throw forbidden(message)
    await next()
  })

export const QUOTE_WRITE_DENIED = 'Tu rol no permite crear, editar, enviar ni borrar cotizaciones o clientes. Pídeselo al dueño o a un cotizador.'

// ── Lo que se quita de las respuestas ───────────────────────────────────────

/** Cotización sin costo ni margen real (y sin el margen propio si no calcula precios). */
export function redactQuote<T extends Quote>(quote: T, viewer: Viewer): T {
  if (canSeeMargins(viewer)) return quote
  const out: T = { ...quote }
  if (out.totals) out.totals = { ...out.totals, cost: 0, marginPct: 0 }
  if (!receivesPricingInputs(viewer)) delete out.pricing
  return out
}

/** Ajustes sin margen, mano de obra, instalación ni merma para quien no calcula precios. */
export function redactSettings(settings: OrgSettings, viewer: Viewer): OrgSettings {
  if (receivesPricingInputs(viewer)) return settings
  const wastePct = receivesPurchasePrices(viewer) ? settings.pricing.wastePct : 0
  return { ...settings, pricing: { ...settings.pricing, marginPct: 0, laborPerM2: 0, installValue: 0, wastePct } }
}

/** Catálogo sin precios de compra, descuentos ni ajustes de margen por marca. */
export function redactCatalog<T extends Catalog>(catalog: T, viewer: Viewer): T {
  if (receivesPurchasePrices(viewer)) return catalog
  return {
    ...catalog,
    profiles: catalog.profiles.map((p) => ({ ...p, priceByColor: {} })),
    items: catalog.items.map((i) => ({ ...i, price: 0 })),
    glass: catalog.glass.map((g) => ({ ...g, pricePerM2: 0 })),
    brandSettings: catalog.brandSettings.map(({ marginAdjust: _margin, ...s }) => {
      void _margin
      return { ...s, discounts: { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 } }
    }),
  }
}

export function redactPriceOverrides(overrides: PriceOverride[], viewer: Viewer): PriceOverride[] {
  return receivesPurchasePrices(viewer) ? overrides : []
}
