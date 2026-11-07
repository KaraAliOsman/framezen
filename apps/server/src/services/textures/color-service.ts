/**
 * Alta, cambios, archivo y restauración de colores propios (y texturas propias sobre colores del
 * catálogo base). Lo usan la ruta /api/catalog/colors y la confirmación de una textura subida
 * («crear color con esta textura»). Reglas:
 *
 * - Ids `custom-<nombre>` únicos frente a TODOS los ids existentes (base, propios, archivados).
 * - Líneas desconocidas se ignoran (nunca se bloquea por una línea que ya no existe).
 * - La textura debe existir: integrada válida o asset de la propia organización.
 * - Archivar nunca borra: las cotizaciones que usan el color se siguen dibujando y cotizando; solo
 *   deja de ofrecerse en las líneas. Restaurar lo devuelve tal cual.
 * - Cambios que mueven precios (factor, color de referencia, líneas) recalculan los borradores.
 */
import type { Color, Id } from '@dekopen/engine'
import {
  isCustomColorId,
  type CatalogColorMutationResponse,
  type CatalogColorsResponse,
  type CatalogColorView,
  type CustomColorCreateBody,
  type CustomColorPatchBody,
  type CustomColorSettings,
  type TextureRef,
} from '@dekopen/shared'
import type { AppDeps, AuthContext } from '../../context'
import { HttpError, badRequest, notFound } from '../../lib/errors'
import { firstName, logActivity } from '../activity'
import { refreshDraftTotals } from '../quotes'
import {
  colorSettingsOf,
  colorTexturesOf,
  customColorsOf,
  newCustomColorId,
  saveCustomCatalog,
  textureRefExists,
  toColorView,
  type CustomCatalogWithColors,
} from './custom-colors'

type Actor = Pick<AuthContext, 'org' | 'user'>

const restorePath = (id: string) => `/api/catalog/colors/${encodeURIComponent(id)}/restore`

export class CustomColorService {
  constructor(private readonly deps: AppDeps) {}

  private async state(orgId: string) {
    const [base, org] = await Promise.all([this.deps.catalogs.getBase(), this.deps.catalogs.getOrgState(orgId)])
    const custom = (org.custom ?? {}) as CustomCatalogWithColors
    return {
      base: base.data,
      custom,
      colors: customColorsOf(custom),
      settings: colorSettingsOf(custom),
      overrides: colorTexturesOf(custom),
      updatedAt: org.updatedAt,
    }
  }

  async list(orgId: string): Promise<CatalogColorsResponse> {
    const s = await this.state(orgId)
    const items = s.colors.map((c) => toColorView(c, s.settings[c.id])).sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, 'es'))
    return { items, overrides: s.overrides, updatedAt: s.updatedAt.toISOString() }
  }

  async create(actor: Actor, body: CustomColorCreateBody): Promise<CatalogColorMutationResponse> {
    const s = await this.state(actor.org.id)
    const lineIds = this.knownLines(s.base.lines.map((l) => l.id), body.lineIds)
    const taken = new Set<Id>([...s.base.colors.map((c) => c.id), ...s.colors.map((c) => c.id)])
    if (body.priceBaseColorId && !taken.has(body.priceBaseColorId)) throw badRequest('Ese color de referencia no está en tu catálogo.', 'priceBaseColorId')
    if (body.texture && !(await textureRefExists(this.deps, actor.org.id, body.texture))) throw badRequest('Esa textura ya no existe. Elige otra o súbela de nuevo.', 'texture')
    const id = newCustomColorId(body.name, taken)
    const now = this.deps.now().toISOString()
    const color: Color = {
      id,
      name: body.name,
      hex: body.hex.toUpperCase(),
      ...(body.code ? { code: body.code } : {}),
      ...(body.texture ? { texture: body.texture } : {}),
    }
    const settings: CustomColorSettings = {
      lineIds,
      ...(body.priceFactor !== undefined ? { priceFactor: round3(body.priceFactor) } : {}),
      ...(body.priceBaseColorId ? { priceBaseColorId: body.priceBaseColorId } : {}),
      createdAt: now,
      updatedAt: now,
      createdBy: actor.user.id,
    }
    const updatedAt = await saveCustomCatalog(this.deps, actor.org.id, {
      ...s.custom,
      colors: [...s.colors, color],
      colorSettings: { ...s.settings, [id]: settings },
    })
    await logActivity(this.deps.db, {
      orgId: actor.org.id,
      actor: { userId: actor.user.id, name: actor.user.name },
      kind: 'catalog.color_created',
      text: `${firstName(actor.user.name)} creó el color ${color.name}`,
      link: '/catalogo?tab=colores',
      meta: { colorId: id, lines: lineIds.length, texture: color.texture?.kind ?? null },
    })
    return { color: toColorView(color, settings), updatedAt: updatedAt.toISOString() }
  }

  async patch(actor: Actor, id: string, body: CustomColorPatchBody): Promise<CatalogColorMutationResponse> {
    const s = await this.state(actor.org.id)
    const own = s.colors.find((c) => c.id === id)
    if (!own) return this.patchBase(actor, id, body, s)

    if (body.texture && !(await textureRefExists(this.deps, actor.org.id, body.texture))) throw badRequest('Esa textura ya no existe. Elige otra o súbela de nuevo.', 'texture')
    const allIds = new Set<Id>([...s.base.colors.map((c) => c.id), ...s.colors.map((c) => c.id)])
    if (body.priceBaseColorId && (!allIds.has(body.priceBaseColorId) || body.priceBaseColorId === id)) {
      throw badRequest('Ese color de referencia no está en tu catálogo.', 'priceBaseColorId')
    }
    const current = s.settings[id] ?? { lineIds: [], createdAt: this.deps.now().toISOString(), updatedAt: this.deps.now().toISOString() }
    const color: Color = { ...own }
    if (body.name !== undefined) color.name = body.name
    if (body.hex !== undefined) color.hex = body.hex.toUpperCase()
    if (body.code === null) delete color.code
    else if (body.code !== undefined) color.code = body.code
    if (body.texture === null) delete color.texture
    else if (body.texture !== undefined) color.texture = body.texture

    const settings: CustomColorSettings = { ...current, updatedAt: this.deps.now().toISOString() }
    if (body.lineIds !== undefined) settings.lineIds = this.knownLines(s.base.lines.map((l) => l.id), body.lineIds)
    if (body.priceFactor === null) delete settings.priceFactor
    else if (body.priceFactor !== undefined) settings.priceFactor = round3(body.priceFactor)
    if (body.priceBaseColorId === null) delete settings.priceBaseColorId
    else if (body.priceBaseColorId !== undefined) settings.priceBaseColorId = body.priceBaseColorId

    const pricesMoved =
      settings.priceFactor !== current.priceFactor ||
      settings.priceBaseColorId !== current.priceBaseColorId ||
      settings.lineIds.join('|') !== current.lineIds.join('|')
    const updatedAt = await saveCustomCatalog(this.deps, actor.org.id, {
      ...s.custom,
      colors: s.colors.map((c) => (c.id === id ? color : c)),
      colorSettings: { ...s.settings, [id]: settings },
    })
    if (pricesMoved) await refreshDraftTotals(this.deps, actor.org.id)
    if (pricesMoved || body.name !== undefined || body.texture !== undefined) {
      await logActivity(this.deps.db, {
        orgId: actor.org.id,
        actor: { userId: actor.user.id, name: actor.user.name },
        kind: 'catalog.color_updated',
        text: `${firstName(actor.user.name)} ajustó el color ${color.name}`,
        link: '/catalogo?tab=colores',
        meta: { colorId: id, fields: Object.keys(body) },
      })
    }
    return { color: toColorView(color, settings), updatedAt: updatedAt.toISOString() }
  }

  /** Colores del catálogo base: solo se les puede poner (o quitar) una textura propia. */
  private async patchBase(actor: Actor, id: string, body: CustomColorPatchBody, s: Awaited<ReturnType<CustomColorService['state']>>): Promise<CatalogColorMutationResponse> {
    const base = s.base.colors.find((c) => c.id === id)
    if (!base) throw notFound('Ese color no está en tu catálogo.')
    const keys = Object.keys(body).filter((k) => (body as Record<string, unknown>)[k] !== undefined)
    if (keys.some((k) => k !== 'texture') || body.texture === undefined) {
      throw new HttpError(400, 'invalid', 'En los colores del catálogo solo puedes cambiar la textura. Para otro nombre o precio, crea un color propio.', 'texture')
    }
    if (body.texture && !(await textureRefExists(this.deps, actor.org.id, body.texture))) throw badRequest('Esa textura ya no existe. Elige otra o súbela de nuevo.', 'texture')
    const overrides = { ...s.overrides }
    if (body.texture === null) delete overrides[id]
    else overrides[id] = body.texture
    const updatedAt = await saveCustomCatalog(this.deps, actor.org.id, { ...s.custom, colorTextures: overrides })
    await logActivity(this.deps.db, {
      orgId: actor.org.id,
      actor: { userId: actor.user.id, name: actor.user.name },
      kind: 'catalog.color_texture',
      text:
        body.texture === null
          ? `${firstName(actor.user.name)} volvió a la textura de fábrica de ${base.name}`
          : `${firstName(actor.user.name)} puso una textura propia a ${base.name}`,
      link: '/catalogo?tab=colores',
      meta: { colorId: id, texture: body.texture?.kind ?? null },
    })
    const view: CatalogColorView = {
      id: base.id,
      name: base.name,
      hex: base.hex,
      ...(base.code ? { code: base.code } : {}),
      ...((overrides[id] ?? base.texture) ? { texture: (overrides[id] ?? base.texture) as TextureRef } : {}),
      ...(base.texture ? { factoryTexture: base.texture as TextureRef } : {}),
      textureOverridden: Boolean(overrides[id]),
      source: 'base',
      lineIds: s.base.lines.filter((l) => l.colorIds.includes(id)).map((l) => l.id),
      archived: false,
    }
    return { color: view, updatedAt: updatedAt.toISOString() }
  }

  async archive(actor: Actor, id: string): Promise<CatalogColorMutationResponse> {
    return this.setArchived(actor, id, true)
  }

  async restore(actor: Actor, id: string): Promise<CatalogColorMutationResponse> {
    return this.setArchived(actor, id, false)
  }

  private async setArchived(actor: Actor, id: string, archived: boolean): Promise<CatalogColorMutationResponse> {
    if (!isCustomColorId(id)) throw new HttpError(400, 'invalid', 'Los colores del catálogo no se archivan: desactiva su marca o quítale la textura propia.')
    const s = await this.state(actor.org.id)
    const color = s.colors.find((c) => c.id === id)
    if (!color) throw notFound('Ese color no está en tu catálogo.')
    const now = this.deps.now().toISOString()
    const current = s.settings[id] ?? { lineIds: [], createdAt: now, updatedAt: now }
    const settings: CustomColorSettings = { ...current, updatedAt: now }
    if (archived) settings.archivedAt = now
    else delete settings.archivedAt
    const updatedAt = await saveCustomCatalog(this.deps, actor.org.id, { ...s.custom, colorSettings: { ...s.settings, [id]: settings } })
    await logActivity(this.deps.db, {
      orgId: actor.org.id,
      actor: { userId: actor.user.id, name: actor.user.name },
      kind: archived ? 'catalog.color_archived' : 'catalog.color_restored',
      text: `${firstName(actor.user.name)} ${archived ? 'archivó' : 'restauró'} el color ${color.name}`,
      link: '/catalogo?tab=colores',
      meta: { colorId: id },
    })
    return {
      color: toColorView(color, settings),
      updatedAt: updatedAt.toISOString(),
      ...(archived ? { undo: { method: 'POST' as const, path: restorePath(id) } } : {}),
    }
  }

  private knownLines(known: Id[], wanted: readonly string[] | undefined): Id[] {
    if (!wanted?.length) return []
    const set = new Set(known)
    return [...new Set(wanted)].filter((id) => set.has(id))
  }
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
