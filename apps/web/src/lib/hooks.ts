/**
 * Hooks de datos (TanStack Query) sobre `api`. Las páginas consumen solo estos hooks.
 */
import { useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { localizeCatalogColors, type CatalogResponse, type Client, type Locale, type Me, type OrgSettings, type Quote, type QuoteSaveBody } from '@dekopen/shared'
import { api, ApiRequestError, type ClientInput, type QuoteListParams } from './api'
import { useLocale } from './i18n'
import { qk } from './queryClient'

/** Sesión actual. `null` = sin sesión (401). Otros errores se propagan (p. ej. sin conexión). */
export function useMe() {
  return useQuery<Me | null>({
    queryKey: qk.me,
    queryFn: async () => {
      try {
        return await api.me()
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 401) return null
        throw error
      }
    },
    staleTime: 5 * 60_000,
  })
}

const localizedCatalogs = new Map<Locale, WeakMap<CatalogResponse, CatalogResponse>>()

/**
 * Catálogo con los nombres conocidos de colores en el idioma de la interfaz («Nogal» → «Walnut»);
 * los colores propios y los nombres que no se reconocen quedan como se escribieron. Memoizado por
 * respuesta e idioma (todas las pantallas comparten el mismo objeto).
 */
export function localizedCatalog(data: CatalogResponse, locale: Locale): CatalogResponse {
  let byData = localizedCatalogs.get(locale)
  if (!byData) localizedCatalogs.set(locale, (byData = new WeakMap()))
  let out = byData.get(data)
  if (!out) byData.set(data, (out = localizeCatalogColors(data, locale)))
  return out
}

/** `select` de TanStack para el catálogo en el idioma actual. */
export function useCatalogSelect(): (data: CatalogResponse) => CatalogResponse {
  const { locale } = useLocale()
  return useCallback((data: CatalogResponse) => localizedCatalog(data, locale), [locale])
}

export function useCatalog() {
  const select = useCatalogSelect()
  return useQuery({ queryKey: qk.catalog, queryFn: api.catalog.get, staleTime: 5 * 60_000, select })
}

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: api.settings.get, staleTime: 5 * 60_000 })
}

/**
 * Mezcla optimista de ajustes: las secciones (pricing, cut, documents, defaults) se mezclan por
 * clave, así un parche parcial (p. ej. solo documents.intro) no borra el resto mientras responde
 * el servidor.
 */
export function mergeSettings(previous: OrgSettings, patch: Partial<OrgSettings>): OrgSettings {
  const next = { ...previous } as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const current = next[key]
    const isPlain = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
    next[key] = isPlain(current) && isPlain(value) ? { ...current, ...value } : value
  }
  return next as unknown as OrgSettings
}

/** Actualiza ajustes con respuesta optimista; si falla, vuelve atrás. */
export function useUpdateSettings() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<OrgSettings>) => api.settings.update(patch),
    onMutate: async (patch) => {
      await client.cancelQueries({ queryKey: qk.settings })
      const previous = client.getQueryData<OrgSettings>(qk.settings)
      if (previous) client.setQueryData<OrgSettings>(qk.settings, mergeSettings(previous, patch))
      return { previous }
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) client.setQueryData(qk.settings, context.previous)
    },
    onSuccess: (settings) => client.setQueryData(qk.settings, settings),
  })
}

export function useQuotes(params: QuoteListParams = {}, options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: qk.quotes(params), queryFn: () => api.quotes.list(params), enabled: options.enabled })
}

export function useQuote(id: string | undefined) {
  return useQuery({
    queryKey: qk.quote(id ?? ''),
    queryFn: () => api.quotes.get(id as string),
    enabled: Boolean(id),
  })
}

export function useCreateQuote() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: Partial<QuoteSaveBody> = {}) => api.quotes.create(body),
    onSuccess: (quote: Quote) => {
      client.setQueryData(qk.quote(quote.id), quote)
      void client.invalidateQueries({ queryKey: ['quotes'] })
    },
  })
}

export function useDuplicateQuote() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.quotes.duplicate(id),
    onSuccess: (quote: Quote) => {
      client.setQueryData(qk.quote(quote.id), quote)
      void client.invalidateQueries({ queryKey: ['quotes'] })
    },
  })
}

export function useClients(q = '', options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: qk.clients(q), queryFn: () => api.clients.list(q || undefined), enabled: options.enabled })
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: qk.client(id ?? ''),
    queryFn: () => api.clients.get(id as string),
    enabled: Boolean(id),
  })
}

export function useCreateClient() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: ClientInput) => api.clients.create(body),
    onSuccess: (created: Client) => {
      client.setQueryData(qk.client(created.id), created)
      void client.invalidateQueries({ queryKey: ['clients'] })
    },
  })
}

export function useWorkOrders() {
  return useQuery({ queryKey: qk.workOrders, queryFn: () => api.workOrders.list() })
}

export function useWorkOrder(id: string | undefined) {
  return useQuery({
    queryKey: qk.workOrder(id ?? ''),
    queryFn: () => api.workOrders.get(id as string),
    enabled: Boolean(id),
  })
}

export function useActivity() {
  return useQuery({ queryKey: qk.activity, queryFn: () => api.activity.list() })
}

/** Portal público del cliente (sin sesión). */
export function usePublicQuote(token: string | undefined) {
  return useQuery({
    queryKey: qk.portal(token ?? ''),
    queryFn: () => api.portal.get(token as string),
    enabled: Boolean(token),
    staleTime: 60_000,
  })
}

export function useInvitation(token: string | undefined) {
  return useQuery({
    queryKey: qk.invitation(token ?? ''),
    queryFn: () => api.auth.invitation(token as string),
    enabled: Boolean(token),
    retry: false,
  })
}
