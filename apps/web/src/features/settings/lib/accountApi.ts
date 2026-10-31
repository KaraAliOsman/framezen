/**
 * Datos de la cuenta que no están en lib/hooks: empresa, equipo, facturación y marcas.
 * Las formas de respuesta replican las del servidor (apps/server/src/routes/team.ts,
 * services/catalog.ts) mientras no estén en @framezen/shared.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Brand, BrandSettings } from '@framezen/engine'
import {
  PLANS,
  type ActivityEvent,
  type BillingActionResult,
  type BillingStateDetail,
  type CheckoutResult,
  type Me,
  type Org,
  type Paged,
  type PlanCode,
  type Role,
} from '@framezen/shared'
import { api, request } from '../../../lib/api'
import { formatDate } from '../../../lib/format'
import { qk } from '../../../lib/queryClient'

// ── Empresa ──────────────────────────────────────────────────────────────────

export type OrgPatch = Partial<Omit<Org, 'id' | 'createdAt' | 'logo' | 'accent'>> & {
  logo?: string | null
  accent?: string | null
  onboarded?: boolean
}

/** Guarda datos de la empresa y actualiza la sesión en caché (logo y nombre se ven al tiro). */
export function useSaveOrg() {
  const client = useQueryClient()
  return async (patch: OrgPatch): Promise<Org> => {
    const org = await api.org.update(patch as Parameters<typeof api.org.update>[0])
    client.setQueryData<Me | null>(qk.me, (me) =>
      me ? { ...me, org, onboarded: patch.onboarded ?? me.onboarded } : me,
    )
    return org
  }
}

// ── Equipo ───────────────────────────────────────────────────────────────────

export interface TeamMember {
  userId: string
  name: string
  email: string
  role: Role
  joinedAt: string
  isYou: boolean
}

export interface PendingInvitation {
  id: string
  email?: string
  role: Role
  createdAt: string
  expiresAt: string
}

export interface TeamResponse {
  members: TeamMember[]
  invitations: PendingInvitation[]
  seats: number | null
  seatsUsed: number
}

export const teamKey = ['team'] as const

export function useTeam(options: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: teamKey, queryFn: () => request<TeamResponse>('/team'), enabled: options.enabled })
}

/** Cupos libres contando invitaciones pendientes (null = sin límite). */
export function seatsLeft(team: Pick<TeamResponse, 'seats' | 'members' | 'invitations'> | undefined): number | null {
  if (!team || team.seats === null) return null
  return Math.max(0, team.seats - team.members.length - team.invitations.length)
}

export function useInvite() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (body: { email?: string; role: Role }) =>
      request<{ invitation: PendingInvitation; link: string }>('/team/invite', { method: 'POST', body }),
    onSuccess: ({ invitation }) => {
      client.setQueryData<TeamResponse>(teamKey, (team) =>
        team ? { ...team, invitations: [...team.invitations, invitation] } : team,
      )
      void client.invalidateQueries({ queryKey: teamKey })
    },
  })
}

export function useChangeRole() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      request<{ ok: boolean; role: Role }>(`/team/${encodeURIComponent(userId)}`, { method: 'PATCH', body: { role } }),
    onMutate: async ({ userId, role }) => {
      await client.cancelQueries({ queryKey: teamKey })
      const previous = client.getQueryData<TeamResponse>(teamKey)
      if (previous)
        client.setQueryData<TeamResponse>(teamKey, {
          ...previous,
          members: previous.members.map((m) => (m.userId === userId ? { ...m, role } : m)),
        })
      return { previous }
    },
    onError: (_e, _v, context) => {
      if (context?.previous) client.setQueryData(teamKey, context.previous)
    },
  })
}

export const teamApi = {
  removeMember: (userId: string) => request<{ ok: boolean }>(`/team/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  revokeInvitation: (id: string) =>
    request<{ ok: boolean }>(`/team/invitations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

// ── Facturación ──────────────────────────────────────────────────────────────

export const billingKey = ['billing'] as const

export function useBilling() {
  return useQuery({ queryKey: billingKey, queryFn: api.billing.get, staleTime: 60_000 })
}

export type PaidPlan = Exclude<PlanCode, 'trial'>
export type Period = 'monthly' | 'yearly'

/** Deja en caché el estado que devuelve el servidor y refresca lo que depende del plan. */
function useApplyBilling() {
  const client = useQueryClient()
  return (billing: BillingStateDetail | undefined) => {
    if (billing) client.setQueryData(billingKey, billing)
    // Prefijo ['billing']: también refresca el historial.
    void client.invalidateQueries({ queryKey: billingKey })
    void client.invalidateQueries({ queryKey: qk.me })
  }
}

export function useCheckout() {
  const apply = useApplyBilling()
  return useMutation({
    mutationFn: ({ plan, period }: { plan: PaidPlan; period: Period }) => api.billing.checkout(plan, period),
    onSuccess: (result: CheckoutResult) => {
      if (!result?.url) apply(result?.billing)
    },
  })
}

/** Cancela al fin del período (POST /api/billing/cancel). Se deshace con `useResumePlan`. */
export function useCancelPlan() {
  const apply = useApplyBilling()
  return useMutation({
    mutationFn: (): Promise<BillingActionResult> => api.billing.cancel(),
    onSuccess: (result) => apply(result?.billing),
  })
}

/** Deshace la cancelación mientras el período siga vigente (POST /api/billing/resume). */
export function useResumePlan() {
  const apply = useApplyBilling()
  return useMutation({
    mutationFn: (): Promise<BillingActionResult> => api.billing.resume(),
    onSuccess: (result) => apply(result?.billing),
  })
}

export interface BillingHistoryEntry {
  id: string
  at: string
  text: string
  amount?: number
  status?: 'paid' | 'pending' | 'failed' | 'info' | 'scheduled'
  /** Baja de plan que rige al terminar el período pagado (no cobra hoy). */
  scheduled?: { plan: PaidPlan; period: Period; at?: string }
}

/** Fila de GET /api/billing/history (intentos de pago y cambios de plan). */
export interface BillingCheckoutRow {
  id: string
  kind: 'subscribe' | 'change' | 'resume' | string
  plan: PaidPlan
  period: Period
  amount: number
  credit?: number
  status: 'pending' | 'processing' | 'applied' | 'paid' | 'failed' | 'rejected' | 'canceled' | string
  provider: string
  createdAt: string
  appliedAt?: string
  /** Si el servidor lo expone: `scheduled` y `at` marcan una baja programada. */
  meta?: { scheduled?: boolean; at?: string } & Record<string, unknown>
}

const PERIOD_LABEL: Record<Period, string> = { monthly: 'mensual', yearly: 'anual' }

/**
 * Baja programada: el servidor la guarda como un cambio aplicado sin cobro ni saldo usado. Si
 * la fila trae `meta.scheduled`, manda ese dato.
 */
function isScheduledRow(row: BillingCheckoutRow): boolean {
  if (row.kind !== 'change') return false
  if (typeof row.meta?.scheduled === 'boolean') return row.meta.scheduled
  return row.amount === 0 && !row.credit && (row.status === 'applied' || row.status === 'paid')
}

/** Convierte una fila del servidor en una línea legible del historial. */
export function historyEntry(row: BillingCheckoutRow): BillingHistoryEntry {
  const plan = PLANS[row.plan]?.name ?? row.plan
  const period = PERIOD_LABEL[row.period] ?? ''
  if (isScheduledRow(row)) {
    return {
      id: row.id,
      at: row.createdAt,
      text: `Cambio al plan ${plan} ${period}`.replace(/\s+/g, ' ').trim(),
      status: 'scheduled',
      scheduled: { plan: row.plan, period: row.period, ...(typeof row.meta?.at === 'string' ? { at: row.meta.at } : {}) },
    }
  }
  const what = row.kind === 'change' ? `Cambio al plan ${plan}` : row.kind === 'resume' ? `Reactivaste el plan ${plan}` : `Plan ${plan}`
  const status: BillingHistoryEntry['status'] =
    row.status === 'applied' || row.status === 'paid' ? 'paid' : row.status === 'failed' || row.status === 'rejected' ? 'failed' : row.status === 'canceled' ? 'info' : 'pending'
  const suffix = status === 'failed' ? ' · no se pudo cobrar' : status === 'pending' ? ' · en proceso' : row.status === 'canceled' ? ' · anulado' : ''
  return { id: row.id, at: row.appliedAt ?? row.createdAt, text: `${what} ${period}${suffix}`.replace(/\s+/g, ' ').trim(), amount: row.amount, status }
}

/**
 * Marca la baja programada vigente («programado para el 30-11-2026») según el estado del plan.
 * Las bajas antiguas (ya rigieron o se anularon) quedan como registro de lo que programaste.
 * `entries` viene ordenado del más nuevo al más antiguo.
 */
export function withPendingChange(
  entries: readonly BillingHistoryEntry[],
  pending: { plan: PaidPlan; period: Period; at: string } | undefined,
): BillingHistoryEntry[] {
  let matched = false
  return entries.map((entry) => {
    if (!entry.scheduled) return entry
    const isCurrent = !matched && pending && entry.scheduled.plan === pending.plan && entry.scheduled.period === pending.period
    if (isCurrent) {
      matched = true
      return { ...entry, text: `${entry.text} · programado para el ${formatDate(pending.at)}`, status: 'scheduled' }
    }
    const plan = PLANS[entry.scheduled.plan]?.name ?? entry.scheduled.plan
    return { ...entry, text: `Programaste el cambio al plan ${plan} ${PERIOD_LABEL[entry.scheduled.period] ?? ''}`.trim(), status: 'info' }
  })
}

/**
 * Historial simple: los pagos y cambios de plan del servidor (GET /api/billing/history) más el
 * inicio de la prueba. Si el historial no está disponible, lo armamos con la actividad.
 */
export function useBillingHistory(orgCreatedAt: string | undefined) {
  return useQuery({
    queryKey: ['billing', 'history'],
    queryFn: async (): Promise<BillingHistoryEntry[]> => {
      let entries: BillingHistoryEntry[]
      try {
        const data = await request<Paged<BillingCheckoutRow> | BillingCheckoutRow[]>('/billing/history', { retry: 0 })
        entries = (Array.isArray(data) ? data : data.items).map(historyEntry)
      } catch {
        const activity = await request<Paged<ActivityEvent>>('/activity', { query: { limit: 100 } }).catch(() => ({ items: [] as ActivityEvent[], total: 0 }))
        entries = activity.items
          .filter((e) => e.kind.startsWith('billing.'))
          .map((e) => ({ id: e.id, at: e.at, text: e.text, status: 'info' as const }))
      }
      if (orgCreatedAt) entries.push({ id: 'trial-start', at: orgCreatedAt, text: 'Empezaste la prueba con todo lo de Pro', status: 'info' })
      return entries.sort((a, b) => b.at.localeCompare(a.at))
    },
    staleTime: 60_000,
  })
}

// ── Marcas del catálogo ──────────────────────────────────────────────────────

export interface BrandSummary {
  brand: Brand
  enabled: boolean
  settings: BrandSettings
  completeness: 'verified' | 'complete' | 'partial' | 'none'
  recommended: boolean
  counts: { lines: number; profiles: number; items: number; glass: number; priced: number; unpriced: number; overrides: number }
}

export const brandsKey = ['catalog', 'brands'] as const

export function useBrands() {
  return useQuery({
    queryKey: brandsKey,
    queryFn: () => request<{ items: BrandSummary[]; total: number }>('/catalog/brands').then((r) => r.items),
    staleTime: 60_000,
  })
}

export function useToggleBrand() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      request<BrandSummary>(`/catalog/brands/${encodeURIComponent(id)}`, { method: 'PATCH', body: { enabled } }),
    onMutate: async ({ id, enabled }) => {
      await client.cancelQueries({ queryKey: brandsKey })
      const previous = client.getQueryData<BrandSummary[]>(brandsKey)
      if (previous) client.setQueryData<BrandSummary[]>(brandsKey, previous.map((b) => (b.brand.id === id ? { ...b, enabled } : b)))
      return { previous }
    },
    onError: (_e, _v, context) => {
      if (context?.previous) client.setQueryData(brandsKey, context.previous)
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: qk.catalog })
    },
  })
}
