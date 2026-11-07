/**
 * Datos del catálogo del taller: marcas con su resumen, precios propios, importación de
 * «MisPrecios» y edición de pautas. Los tipos que aún no están en `@dekopen/shared` se
 * declaran aquí con la forma exacta que devuelve el servidor (apps/server/src/routes/catalog.ts).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Brand, BrandSettings, Catalog, Id, Line, Pauta } from '@dekopen/engine'
import type { CatalogResponse, PriceOverride } from '@dekopen/shared'
import { request } from '../../lib/api'
import { qk } from '../../lib/queryClient'
import { applyOverridesToCatalog, overrideKey } from './model/prices'

/** GET /api/catalog/brands → items[] */
export interface CatalogBrandSummary {
  brand: Brand
  enabled: boolean
  settings: BrandSettings
  completeness: 'verified' | 'complete' | 'partial' | 'none'
  recommended: boolean
  counts: {
    lines: number
    profiles: number
    items: number
    glass: number
    priced: number
    unpriced: number
    overrides: number
  }
}

export interface BrandsResponse {
  items: CatalogBrandSummary[]
  total: number
  baseVersion: string
}

export interface BrandPatch {
  enabled?: boolean
  settings?: Partial<Pick<BrandSettings, 'trim' | 'kerf'>> & {
    discounts?: Partial<BrandSettings['discounts']>
    marginAdjust?: number | null
  }
}

export interface PricesResponse {
  overrides: PriceOverride[]
  updatedAt: string
}

export interface SavePricesBody {
  overrides: PriceOverride[]
  remove?: Omit<PriceOverride, 'price'>[]
  replace?: boolean
}

export interface SavePricesResponse extends PricesResponse {
  ignored: number
}

export interface ImportCsvResponse {
  rows: number
  matched: number
  unmatched: number
  skipped: number
  brands: string[]
  unmatchedSample: { code: string; description: string; brand: string }[]
  overridesTotal: number
  updatedAt: string
  message: string
}

/** Valores de pauta a cambiar: número = propio, null = vuelve al de fábrica. */
export type PautaPatchBody = { [K in keyof Pauta]?: Pauta[K] | null } | Record<string, unknown>

/** PATCH /api/catalog/lines/:id. Una pauta en null vuelve entera a la de fábrica. */
export interface LinePatch {
  pauta?: PautaPatchBody | null
  doorPauta?: PautaPatchBody | null
  sashInPauta?: PautaPatchBody | null
}

type FactoryLine = Line & { factory?: { pauta: Pauta; doorPauta?: Partial<Pauta>; sashInPauta?: Partial<Pauta> } }

/** Mezcla un cambio de pauta como lo hace el servidor (null = valor de fábrica). */
export function mergePautaPatch<P extends Partial<Pauta>>(base: P | undefined, patch: PautaPatchBody | null | undefined, factory: Partial<Pauta> | undefined): P | undefined {
  if (patch === undefined) return base
  if (patch === null) return factory as P | undefined
  const next: Record<string, unknown> = { ...(base ?? {}) }
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'reinforcement') {
      if (value === null) {
        if (factory?.reinforcement) next.reinforcement = { ...factory.reinforcement }
        else delete next.reinforcement
        continue
      }
      const steel: Record<string, unknown> = { ...((next.reinforcement as Record<string, unknown> | undefined) ?? {}) }
      for (const [sub, v] of Object.entries((value ?? {}) as Record<string, unknown>)) {
        const fv = (factory?.reinforcement as Record<string, unknown> | undefined)?.[sub]
        if (v === null) {
          if (fv !== undefined) steel[sub] = fv
          else delete steel[sub]
        } else if (typeof v === 'number') steel[sub] = v
      }
      next.reinforcement = steel
      continue
    }
    const fv = (factory as Record<string, unknown> | undefined)?.[key]
    if (value === null) {
      if (fv !== undefined) next[key] = fv
      else delete next[key]
    } else if (typeof value === 'number') next[key] = value
  }
  return next as P
}

export const catalogKeys = {
  brands: ['catalog', 'brands'] as const,
  prices: ['catalog', 'prices'] as const,
}

export const catalogApi = {
  brands: () => request<BrandsResponse>('/catalog/brands'),
  patchBrand: (id: Id, patch: BrandPatch) =>
    request<CatalogBrandSummary>(`/catalog/brands/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }),
  prices: () => request<PricesResponse>('/catalog/prices'),
  savePrices: (body: SavePricesBody) => request<SavePricesResponse>('/catalog/prices', { method: 'PUT', body }),
  importCsv: (csv: string, brandId?: Id) =>
    request<ImportCsvResponse>('/catalog/import-csv', { method: 'POST', body: { csv, ...(brandId ? { brandId } : {}) } }),
  patchLine: (id: Id, patch: LinePatch) =>
    request<{ line?: Line; updatedAt?: string }>(`/catalog/lines/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }),
}

export function useCatalogBrands() {
  return useQuery({ queryKey: catalogKeys.brands, queryFn: catalogApi.brands, staleTime: 60_000 })
}

export function usePriceOverrides() {
  return useQuery({ queryKey: catalogKeys.prices, queryFn: catalogApi.prices, staleTime: 60_000 })
}

/** Activa/desactiva una marca o guarda sus ajustes («Mis precios»), con respuesta optimista. */
export function usePatchBrand() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: Id; patch: BrandPatch }) => catalogApi.patchBrand(id, patch),
    onMutate: async ({ id, patch }) => {
      await client.cancelQueries({ queryKey: catalogKeys.brands })
      const previous = client.getQueryData<BrandsResponse>(catalogKeys.brands)
      if (previous) {
        client.setQueryData<BrandsResponse>(catalogKeys.brands, {
          ...previous,
          items: previous.items.map((item) => (item.brand.id === id ? mergeBrandPatch(item, patch) : item)),
        })
      }
      return { previous }
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) client.setQueryData(catalogKeys.brands, context.previous)
    },
    onSuccess: (summary, { patch }) => {
      if (summary) {
        client.setQueryData<BrandsResponse>(catalogKeys.brands, (current) =>
          current ? { ...current, items: current.items.map((item) => (item.brand.id === summary.brand.id ? summary : item)) } : current,
        )
      }
      // Activar o desactivar cambia las líneas disponibles; los ajustes cambian los precios del motor.
      void client.invalidateQueries({ queryKey: qk.catalog, exact: true, refetchType: patch.enabled !== undefined ? 'active' : 'none' })
    },
  })
}

export function mergeBrandPatch(item: CatalogBrandSummary, patch: BrandPatch): CatalogBrandSummary {
  const settings: BrandSettings = { ...item.settings }
  if (patch.settings) {
    const { discounts, marginAdjust, ...rest } = patch.settings
    Object.assign(settings, rest)
    if (discounts) settings.discounts = { ...settings.discounts, ...discounts }
    if (marginAdjust === null) delete settings.marginAdjust
    else if (marginAdjust !== undefined) settings.marginAdjust = marginAdjust
  }
  const enabled = patch.enabled ?? item.enabled
  return { ...item, enabled, settings: { ...settings, enabled } }
}

/**
 * Guarda precios propios. Actualiza al instante el catálogo en caché (la tabla y el motor ven
 * el precio nuevo sin esperar) y luego toma la lista de precios propios que devuelve el servidor.
 */
export function useSavePrices() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: SavePricesBody) => catalogApi.savePrices(body),
    onMutate: async (body) => {
      await client.cancelQueries({ queryKey: qk.catalog, exact: true })
      const previousCatalog = client.getQueryData<CatalogResponse>(qk.catalog)
      const previousPrices = client.getQueryData<PricesResponse>(catalogKeys.prices)
      if (previousCatalog) client.setQueryData<CatalogResponse>(qk.catalog, applyOverridesToCatalog(previousCatalog, body.overrides) as CatalogResponse)
      if (previousPrices) {
        const map = new Map(body.replace ? [] : previousPrices.overrides.map((o) => [overrideKey(o), o]))
        for (const r of body.remove ?? []) map.delete(overrideKey(r))
        for (const o of body.overrides) map.set(overrideKey(o), o)
        client.setQueryData<PricesResponse>(catalogKeys.prices, { ...previousPrices, overrides: [...map.values()] })
      }
      return { previousCatalog, previousPrices }
    },
    onError: (_error, _body, context) => {
      if (context?.previousCatalog) client.setQueryData(qk.catalog, context.previousCatalog)
      if (context?.previousPrices) client.setQueryData(catalogKeys.prices, context.previousPrices)
    },
    onSuccess: (result, body) => {
      client.setQueryData<PricesResponse>(catalogKeys.prices, { overrides: result.overrides, updatedAt: result.updatedAt })
      // Quitar un precio propio vuelve al de lista, que solo conoce el servidor.
      void client.invalidateQueries({ queryKey: qk.catalog, exact: true, refetchType: body.remove?.length || body.replace ? 'active' : 'none' })
      void client.invalidateQueries({ queryKey: catalogKeys.brands })
    },
  })
}

export function useImportCsv() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ csv, brandId }: { csv: string; brandId?: Id }) => catalogApi.importCsv(csv, brandId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.catalog, exact: true })
      void client.invalidateQueries({ queryKey: catalogKeys.prices })
      void client.invalidateQueries({ queryKey: catalogKeys.brands })
    },
  })
}

export function usePatchLine() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: Id; patch: LinePatch }) => catalogApi.patchLine(id, patch),
    onSuccess: (data, { id, patch }) => {
      client.setQueryData<CatalogResponse>(qk.catalog, (current) => {
        if (!current) return current
        // El servidor devuelve la línea ya ajustada; si no, la armamos con la misma regla.
        if (data?.line?.id === id) return { ...current, lines: current.lines.map((l) => (l.id === id ? (data.line as Line) : l)) }
        return patchLineInCatalog(current, id, patch) as CatalogResponse
      })
      void client.invalidateQueries({ queryKey: qk.catalog, exact: true, refetchType: 'none' })
    },
  })
}

/** Aplica una edición de pauta sobre una copia del catálogo (para ver el cambio sin recargar). */
export function patchLineInCatalog<C extends Catalog>(catalog: C, id: Id, patch: LinePatch): C {
  return {
    ...catalog,
    lines: catalog.lines.map((line) => {
      if (line.id !== id) return line
      const factory = (line as FactoryLine).factory ?? { pauta: line.pauta, doorPauta: line.doorPauta, sashInPauta: line.sashInPauta }
      const next: FactoryLine = { ...line, factory }
      next.pauta = mergePautaPatch(line.pauta, patch.pauta, factory.pauta) ?? line.pauta
      const door = mergePautaPatch(line.doorPauta, patch.doorPauta, factory.doorPauta)
      if (door) next.doorPauta = door
      else delete next.doorPauta
      const sashIn = mergePautaPatch(line.sashInPauta, patch.sashInPauta, factory.sashInPauta)
      if (sashIn) next.sashInPauta = sashIn
      else delete next.sashInPauta
      return next
    }),
  }
}
