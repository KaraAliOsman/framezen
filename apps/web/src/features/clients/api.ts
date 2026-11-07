import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Client, Paged } from '@dekopen/shared'
import { api, request } from '../../lib/api'
import { qk } from '../../lib/queryClient'

/** Lista completa de clientes (hasta 200) con búsqueda del servidor (sin tildes, por RUT…). */
export function useClientList(q: string) {
  return useQuery({
    queryKey: ['clients', 'list', q],
    queryFn: () => request<Paged<Client>>('/clients', { query: { q: q || undefined, limit: 200 } }),
    placeholderData: keepPreviousData,
  })
}

export function useUpdateClient(id: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<Client>) => api.clients.update(id, patch),
    onSuccess: (updated) => {
      client.setQueryData<Client>(qk.client(id), (prev) => ({ ...prev, ...updated }))
      void client.invalidateQueries({ queryKey: ['clients'] })
    },
  })
}

/** Valor que se asienta tras `delay` ms sin cambios (para buscar sin pedir en cada tecla). */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return settled
}
