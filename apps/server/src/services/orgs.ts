import type { Catalog, Glass, Id, Line } from '@dekopen/engine'
import type { Defaults } from '@dekopen/shared'
import type { AppDeps } from '../context'
import type { Db } from '../db/client'
import { memberships, orgCatalog, orgSettings, orgs, subscriptions, users } from '../db/schema'
import { newId } from '../lib/crypto'
import { trialSubscription } from './billing'
import { defaultBrandIds } from './catalog'
import { defaultStoredSettings } from './settings'

/** La línea practicable de referencia (pauta verificada al 0,1 mm contra la OT 385). */
export const PREFERRED_LINE = /^PRO\s*-?\s*6004$/i
const COMPLETENESS_RANK = { verified: 0, complete: 1, partial: 2 } as const

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Perfiles con precio de una línea (más perfiles con precio = datos más completos). */
function pricedProfiles(catalog: Catalog, lineId: Id): number {
  return catalog.profiles.filter((p) => p.lineId === lineId && Object.values(p.priceByColor ?? {}).some((v) => v > 0)).length
}

/**
 * Línea por defecto: PRO6004 de Proline si existe; si no, la practicable más completa
 * (pauta verificada > completa > parcial; después la que trae más perfiles con precio).
 * Si no hay practicables, la línea más completa de cualquier tipo.
 */
export function pickDefaultLine(catalog: Catalog, brandIds: Id[] = []): Line | undefined {
  const preferred = catalog.lines.find((l) => PREFERRED_LINE.test(l.name.trim()) || /(^|[.\-_])pro6004$/i.test(l.id))
  if (preferred) return preferred
  const brandOrder = new Map(brandIds.map((id, i) => [id, i]))
  const score = (l: Line) => [
    Number(l.kind !== 'casement'),
    // Una línea de puertas no es la ventana de todos los días.
    Number(/puerta|door/i.test(l.name)),
    COMPLETENESS_RANK[l.completeness ?? 'partial'],
    -pricedProfiles(catalog, l.id),
    brandOrder.get(l.brandId) ?? brandIds.length,
  ]
  return [...catalog.lines].sort((a, b) => {
    const sa = score(a)
    const sb = score(b)
    for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return sa[i] - sb[i]
    return a.name.localeCompare(b.name, 'es')
  })[0]
}

/**
 * Composición «4+12+4» de un DVH (por nombre o, si no, por composición). undefined si no se
 * reconoce o si no es un doble vidriado simple (p. ej. un triple «4+12+4+12+4»).
 */
export function dvhComposition(glass: Pick<Glass, 'name' | 'composition'>): string | undefined {
  for (const text of [glass.name, glass.composition ?? '']) {
    // Cadena de cifras unidas por «+» (admite «12 cámara», «12br»…).
    const chain = text.match(/\d+(?:[.,]\d+)?(?:\s*[a-zá-ú]*\s*\+\s*\d+(?:[.,]\d+)?)+/i)?.[0]
    if (!chain) continue
    const parts = chain.split('+').map((p) => p.match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(',', '.'))
    return parts.length === 3 && parts.every(Boolean) ? parts.join('+') : undefined
  }
  return undefined
}

/** Palabras que indican un vidrio especial (no el incoloro de todos los días). */
const SPECIAL = /low-?e|bronce|gris|verde|azul|reflect|lamin|templad|acust|empavon|satin|saten|semilla|morisco|palillad|argon|control|toloza|trump|fijo|proyect|seguridad|tint|color/

/** ¿DVH incoloro corriente? (sin capas, colores ni terminaciones). */
export function isPlainDvh(glass: Pick<Glass, 'name' | 'composition'>): boolean {
  const text = fold(`${glass.name} ${glass.composition ?? ''}`).replace(/incoloro/g, '')
  return !SPECIAL.test(text)
}

/**
 * Vidrio por defecto: DVH 4+12+4 incoloro (con precio, si hay); si no existe, el DVH incoloro
 * de la composición más común del catálogo; si no hay DVH, el primero con precio.
 */
export function pickDefaultGlass(pool: Glass[]): Glass | undefined {
  const dvh = pool.filter((g) => g.kind === 'dvh')
  const plain = dvh.filter(isPlainDvh)
  const priced = (list: Glass[]) => list.find((g) => g.pricePerM2 > 0) ?? list[0]
  const of = (composition: string) => plain.filter((g) => dvhComposition(g) === composition)
  const standard = priced(of('4+12+4'))
  if (standard) return standard
  const counts = new Map<string, number>()
  for (const g of dvh) {
    const c = dvhComposition(g)
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  for (const [composition] of [...counts].sort((a, b) => b[1] - a[1])) {
    const found = priced(of(composition))
    if (found) return found
  }
  return priced(plain) ?? priced(dvh) ?? pool.find((g) => g.pricePerM2 > 0) ?? pool[0]
}

/** Línea, color y vidrio por defecto para que la primera ventana salga con un Enter. */
export function pickDefaults(catalog: Catalog, brandIds: Id[]): Defaults {
  const line = pickDefaultLine(catalog, brandIds)
  if (!line) return {}
  const colors = catalog.colors.filter((c) => line.colorIds.includes(c.id))
  const color = colors.find((c) => fold(c.name).trim() === 'blanco') ?? colors.find((c) => /blanc/i.test(fold(c.name))) ?? colors[0]
  // Vidrio visible para la organización: sin marca o de una marca activa (si no hay, todos).
  const active = new Set([...brandIds, line.brandId])
  const visible = catalog.glass.filter((g) => !g.brandId || active.has(g.brandId))
  const glass = pickDefaultGlass(visible.length ? visible : catalog.glass)
  return {
    lineId: line.id,
    ...(color ? { colorId: color.id } : {}),
    ...(glass ? { glassId: glass.id } : {}),
  }
}

/** Marcas activas al crear la cuenta: las de datos más completos, siempre con la de la línea por defecto. */
export function initialBrandIds(catalog: Catalog): Id[] {
  const ids = defaultBrandIds(catalog)
  const line = pickDefaultLine(catalog, ids)
  return line && !ids.includes(line.brandId) ? [line.brandId, ...ids.slice(0, Math.max(0, ids.length - 1))] : ids
}

export interface NewOrgInput {
  user: { id: string; name: string; email: string; passwordHash: string } | { existingUserId: string }
  company: string
}

/**
 * Crea la organización completa: empresa, membresía de dueño, prueba de 14 días, ajustes
 * por defecto (PRO6004 o la practicable más completa, Blanco, DVH 4+12+4) y las marcas con
 * datos más completos activas. Todo se puede cambiar después; nada es obligatorio.
 */
export async function createOrgWithOwner(deps: AppDeps, input: NewOrgInput): Promise<{ userId: string; orgId: string }> {
  const base = await deps.catalogs.getBase()
  const brandIds = initialBrandIds(base.data)
  const settings = defaultStoredSettings()
  settings.defaults = pickDefaults(base.data, brandIds)
  const now = deps.now()
  const orgId = newId()
  const userId = 'existingUserId' in input.user ? input.user.existingUserId : input.user.id
  await deps.db.transaction(async (tx) => {
    const db = tx as unknown as Db
    if (!('existingUserId' in input.user)) {
      await db.insert(users).values({ ...input.user, createdAt: now, updatedAt: now })
    }
    await db.insert(orgs).values({ id: orgId, name: input.company, createdAt: now, updatedAt: now })
    await db.insert(memberships).values({ id: newId(), orgId, userId, role: 'owner', createdAt: now })
    await db.insert(subscriptions).values(trialSubscription(orgId, now, deps.config.billingProvider))
    await db.insert(orgSettings).values({ orgId, data: settings, nextQuoteNumber: 1, nextWorkOrderNumber: 1, updatedAt: now })
    await db.insert(orgCatalog).values({ orgId, enabledBrandIds: brandIds, updatedAt: now })
  })
  return { userId, orgId }
}
