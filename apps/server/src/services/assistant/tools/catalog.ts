/**
 * Catálogo: resumen de líneas, colores y vidrios (redactado por rol por la propia ruta), precios
 * propios (sensibles: siempre con confirmación), texturas y colores propios (rutas de TEXUP).
 */
import {
  BUILTIN_TEXTURES,
  type AgentToolArgs,
  type CatalogColorMutationResponse,
  type CatalogResponse,
  type PriceOverride,
  type PriceOverridesResponse,
  type TextureAsset,
  type TextureListResponse,
} from '@dekopen/shared'
import { closestNames, fold, resolveLine } from '../resolve'
import { ensureOk } from './common'
import { ToolFailure, type ToolHandler, type UndoCheck } from './types'

/** Todas las palabras de la consulta deben estar en el nombre (en cualquier orden). */
const matches = (name: string, query?: string) => {
  if (!query) return true
  const folded = fold(name)
  return fold(query)
    .split(' ')
    .every((word) => folded.includes(word))
}

const configureBrand: ToolHandler<'configure_brand'> = async (ctx, args) => {
  const { items } = ensureOk(await ctx.call<{ items: { brand: { id: string; name: string } }[] }>('brandsGet'))
  const found = items.map((row) => row.brand).filter((b) => matches(b.name, args.brand))
  const brand = found.find((b) => fold(b.name) === fold(args.brand)) ?? found[0]
  if (!brand) throw new ToolFailure('not_found', `There is no brand called ${args.brand} in the catalogue. Nothing was changed.`)
  const title = ctx.text.t('propose.configure_brand', { name: brand.name })
  if (ctx.dryRun) return { ok: true, summary: title, preview: { title, lines: [] }, affected: [{ type: 'catalog' }] }
  const settings = { ...(args.discounts ? { discounts: args.discounts } : {}), ...(args.trim !== undefined ? { trim: args.trim } : {}), ...(args.kerf !== undefined ? { kerf: args.kerf } : {}) }
  ensureOk(await ctx.call('brandPatch', { params: { id: brand.id }, body: { ...(args.enabled !== undefined ? { enabled: args.enabled } : {}), ...(Object.keys(settings).length ? { settings } : {}) } }))
  return { ok: true, summary: ctx.text.t('done.configure_brand', { name: brand.name }), affected: [{ type: 'catalog' }] }
}

const updateLineCuts: ToolHandler<'update_line_cuts'> = async (ctx, args) => {
  if (!args.reset && !Object.keys(args.changes ?? {}).length) throw new ToolFailure('invalid_args', 'Say which values to change, or reset=true.')
  const catalog = ensureOk(await ctx.call<CatalogResponse>('catalogGet'))
  const lines = catalog.lines ?? []
  const line = lines.find((l) => fold(l.name) === fold(args.line)) ?? lines.find((l) => matches(l.name, args.line))
  if (!line) throw new ToolFailure('not_found', `There is no line called ${args.line}. Nothing was changed.`)
  const title = ctx.text.t('propose.update_line_cuts', { name: line.name })
  if (ctx.dryRun) return { ok: true, summary: title, preview: { title, lines: Object.entries(args.changes ?? {}).map(([field, value]) => `${field}: ${value}`) }, affected: [{ type: 'catalog' }] }
  ensureOk(await ctx.call('linePatch', { params: { id: line.id }, body: { [args.target ?? 'pauta']: args.reset ? null : args.changes } }))
  return { ok: true, summary: ctx.text.t('done.update_line_cuts', { name: line.name }), affected: [{ type: 'catalog' }] }
}

const getCatalog: ToolHandler<'get_catalog'> = async (ctx, args) => {
  const catalog = ensureOk(await ctx.call<CatalogResponse>('catalogGet'))
  const section = args.section ?? 'all'
  const colorName = new Map(catalog.colors.map((c) => [c.id, c.name]))
  const data: Record<string, unknown> = {}
  if (section === 'all' || section === 'lines') {
    data.lines = catalog.lines
      .filter((l) => matches(l.name, args.query))
      .slice(0, 40)
      .map((l) => ({
        id: l.id,
        name: l.name,
        kind: l.kind,
        typologies: l.typologyIds.length ? l.typologyIds : 'all of its kind',
        colors: l.colorIds.slice(0, 30).map((id) => colorName.get(id) ?? id),
        ...(l.completeness ? { data: l.completeness } : {}),
      }))
  }
  if (section === 'all' || section === 'colors') {
    data.colors = catalog.colors.filter((c) => matches(c.name, args.query)).slice(0, 80).map((c) => ({ id: c.id, name: c.name, hex: c.hex, ...(c.texture ? { texture: c.texture.kind === 'builtin' ? c.texture.id : 'upload' } : {}) }))
  }
  if (section === 'all' || section === 'glass') {
    data.glass = catalog.glass
      .filter((g) => matches(`${g.name} ${g.composition ?? ''}`, args.query))
      .slice(0, 20)
      .map((g) => ({ id: g.id, name: g.name, kind: g.kind, ...(g.pricePerM2 > 0 ? { pricePerM2: g.pricePerM2 } : {}) }))
  }
  const empty = Object.values(data).every((list) => Array.isArray(list) && !list.length)
  if (empty && args.query) {
    const pool = [
      ...(section === 'all' || section === 'lines' ? catalog.lines : []),
      ...(section === 'all' || section === 'colors' ? catalog.colors : []),
      ...(section === 'all' || section === 'glass' ? catalog.glass : []),
    ].map((n) => n.name)
    const closest = closestNames(pool, args.query)
    data.note = `Nothing matches "${args.query}": it does not exist in the catalogue. Do not search again with other words.${closest.length ? '' : ' Nothing similar exists: do not suggest a specific alternative.'}`
    if (closest.length) data.closest = closest
  }
  return { ok: true, summary: ctx.text.t('done.get_catalog'), data }
}

const key = (o: Pick<PriceOverride, 'kind' | 'id' | 'colorId'>) => `${o.kind}:${o.id}:${o.colorId ?? ''}`

const updatePrices: ToolHandler<'update_prices'> = async (ctx, args) => {
  const current = ensureOk(await ctx.call<PriceOverridesResponse>('pricesGet')).overrides
  const byKey = new Map(current.map((o) => [key(o), o]))
  const t = ctx.text
  const changes = args.changes.map((c) => ({
    field: key(c),
    label: `${c.id}${c.colorId ? ` · ${c.colorId}` : ''}`,
    before: byKey.has(key(c)) ? t.fmt.money(byKey.get(key(c))!.price) : '—',
    after: t.fmt.money(c.price),
  }))
  if (ctx.dryRun) {
    const title = t.t('propose.update_prices', { count: args.changes.length })
    return { ok: true, summary: title, preview: { title, lines: [], changes: changes.slice(0, 20), irreversible: t.t('irreversible.prices') }, affected: [{ type: 'catalog' }] }
  }
  const overrides = args.changes.map((c) => ({ kind: c.kind, id: c.id, ...(c.colorId ? { colorId: c.colorId } : {}), price: c.price }))
  const res = ensureOk(await ctx.call<PriceOverridesResponse>('pricesPut', { body: { overrides } }))
  const restore = args.changes.filter((c) => byKey.has(key(c))).map((c) => byKey.get(key(c))!)
  const remove = args.changes.filter((c) => !byKey.has(key(c))).map((c) => ({ kind: c.kind, id: c.id, ...(c.colorId ? { colorId: c.colorId } : {}) }))
  return {
    ok: true,
    summary: t.t('done.update_prices', { count: args.changes.length - (res.ignored ?? 0) }),
    data: { saved: args.changes.length - (res.ignored ?? 0), ignored: res.ignored ?? 0 },
    affected: [{ type: 'catalog' }],
    undo: {
      method: 'PUT',
      path: '/api/catalog/prices',
      route: 'pricesPut',
      body: { overrides: restore, remove },
      entity: { type: 'catalog' },
      // Solo si nadie cambió después estos mismos precios (el resto del catálogo no bloquea).
      expect: {
        route: 'pricesGet',
        checks: args.changes.map((c) => {
          const match = { kind: c.kind, id: c.id, colorId: c.colorId ?? null }
          const saved = res.overrides.find((o) => o.kind === c.kind && o.id === c.id && (o.colorId ?? null) === match.colorId)
          return { path: ['overrides', match, 'price'], value: saved?.price ?? null }
        }),
      },
    },
  }
}

const listTextures: ToolHandler<'list_textures'> = async (ctx) => {
  const res = await ctx.call<TextureListResponse>('texturesList')
  const own = res.ok ? res.data!.items : []
  return {
    ok: true,
    summary: ctx.text.t('done.list_textures'),
    data: {
      builtin: Object.values(BUILTIN_TEXTURES).map((b) => ({ id: b.id, name: b.names[ctx.text.locale] ?? b.names.es, finish: b.finish, hex: b.hex })),
      own: own.map((tx: TextureAsset) => ({ id: tx.id, name: tx.name, finish: tx.meta?.finish, scaleMm: tx.meta?.scaleMm })),
      ...(res.ok ? {} : { note: 'Own textures are not available right now.' }),
    },
  }
}

/** Giro guardado de la textura (no está en el contrato público de `meta`). */
const angleOf = (texture: TextureAsset): number | undefined => {
  const angle = (texture.meta as { angleDeg?: unknown } | undefined)?.angleDeg
  return typeof angle === 'number' ? angle : undefined
}

const updateTexture: ToolHandler<'update_texture'> = async (ctx, args) => {
  const texture = ensureOk(await ctx.call<TextureAsset>('textureGet', { params: { id: args.textureId } }))
  const t = ctx.text
  const body = {
    ...(args.name !== undefined && args.name !== texture.name ? { name: args.name } : {}),
    ...(args.scale_mm !== undefined ? { scaleMm: args.scale_mm } : {}),
    ...(args.angle_deg !== undefined ? { angleDeg: args.angle_deg } : {}),
  }
  if (!Object.keys(body).length) return { ok: true, summary: t.t('done.update_texture', { name: texture.name }), data: { changed: false } }
  const changes = [
    ...('name' in body ? [{ field: 'name', label: t.t('field.name'), before: texture.name, after: body.name! }] : []),
    ...('scaleMm' in body ? [{ field: 'scale', label: t.t('field.scale'), before: texture.meta?.scaleMm ? `${texture.meta.scaleMm} mm` : '—', after: `${body.scaleMm} mm` }] : []),
    ...('angleDeg' in body ? [{ field: 'angle', label: t.t('field.angle'), after: `${body.angleDeg}°` }] : []),
  ]
  if (ctx.dryRun) {
    const title = t.t('propose.update_texture', { name: texture.name })
    return { ok: true, summary: title, preview: { title, lines: [], changes }, affected: [{ type: 'texture', id: texture.id }] }
  }
  const after = ensureOk(await ctx.call<TextureAsset>('texturePatch', { params: { id: texture.id }, body }))
  const previous = {
    ...('name' in body ? { name: texture.name } : {}),
    ...('scaleMm' in body && texture.meta?.scaleMm ? { scaleMm: texture.meta.scaleMm } : {}),
    ...('angleDeg' in body ? { angleDeg: angleOf(texture) ?? 0 } : {}),
  }
  // Solo si nadie cambió después estos mismos campos de la textura.
  const checks: UndoCheck[] = [
    ...('name' in body ? [{ path: ['name'], value: after.name ?? null }] : []),
    ...('scaleMm' in body ? [{ path: ['meta', 'scaleMm'], value: after.meta?.scaleMm ?? null }] : []),
    ...('angleDeg' in body && angleOf(after) !== undefined ? [{ path: ['meta', 'angleDeg'], value: angleOf(after) }] : []),
  ]
  return {
    ok: true,
    summary: t.t('done.update_texture', { name: after.name ?? texture.name }),
    data: { id: texture.id, changed: Object.keys(body) },
    affected: [{ type: 'texture', id: texture.id }],
    undo: Object.keys(previous).length
      ? {
          method: 'PATCH',
          path: `/api/textures/${texture.id}`,
          route: 'texturePatch',
          params: { id: texture.id },
          body: previous,
          entity: { type: 'texture', id: texture.id },
          ...(checks.length ? { expect: { route: 'textureGet' as const, params: { id: texture.id }, checks } } : {}),
        }
      : null,
  }
}

const createCustomColor: ToolHandler<'create_custom_color'> = async (ctx, args) => {
  const t = ctx.text
  if (args.builtin_texture && args.texture_id) throw new ToolFailure('invalid', 'Use either builtin_texture or texture_id, not both.')
  const texture = args.builtin_texture
    ? { kind: 'builtin' as const, id: args.builtin_texture, ...(args.scale_mm ? { scaleMm: args.scale_mm } : {}) }
    : args.texture_id
      ? { kind: 'upload' as const, assetId: args.texture_id, ...(args.scale_mm ? { scaleMm: args.scale_mm } : {}) }
      : undefined
  let lineIds: string[] | undefined
  if (args.lines?.length) {
    const catalog = ensureOk(await ctx.call<CatalogResponse>('catalogGet'))
    lineIds = args.lines.map((name) => resolveLine(catalog as never, name)).filter((c) => c.line && !c.missed).map((c) => c.line!.id)
  }
  const body = {
    name: args.name,
    hex: args.hex.toUpperCase(),
    ...(args.code ? { code: args.code } : {}),
    ...(texture ? { texture } : {}),
    ...(args.price_factor ? { priceFactor: args.price_factor } : {}),
    ...(lineIds?.length ? { lineIds } : {}),
  }
  if (ctx.dryRun) {
    const title = t.t('propose.create_custom_color', { name: args.name })
    return {
      ok: true,
      summary: title,
      preview: {
        title,
        lines: [
          `${t.t('field.color')}: ${body.hex}`,
          ...(texture ? [`${t.t('field.texture')}: ${texture.kind === 'builtin' ? (BUILTIN_TEXTURES[texture.id]?.names[t.locale] ?? texture.id) : texture.assetId}`] : []),
          ...(args.lines?.length ? [args.lines.join(', ')] : []),
        ],
      },
    }
  }
  const res = ensureOk(await ctx.call<CatalogColorMutationResponse>('customColorCreate', { body }))
  return {
    ok: true,
    summary: t.t('done.create_custom_color', { name: res.color.name }),
    data: { id: res.color.id, name: res.color.name, lines: res.color.lineIds },
    affected: [{ type: 'catalog' }],
    undo: { method: 'DELETE', path: `/api/catalog/colors/${res.color.id}`, route: 'customColorDelete', params: { id: res.color.id }, entity: { type: 'catalog' } },
  }
}

export const CATALOG_HANDLERS = {
  configure_brand: configureBrand,
  update_line_cuts: updateLineCuts,
  get_catalog: getCatalog,
  update_prices: updatePrices,
  list_textures: listTextures,
  update_texture: updateTexture,
  create_custom_color: createCustomColor,
} satisfies { [K in keyof AgentToolArgs]?: ToolHandler<K> }
