/**
 * Asistentes por organización: nombre, aspecto, personalidad, modo por defecto, ámbitos, idioma y
 * visibilidad (compartido con el equipo o privado). La cantidad la limita el plan
 * (`planLimits(plan).assistants`, también Taller = 1 con comandos locales). Si una organización no
 * tiene ninguno, se crea el de siempre («Marco») al primer uso.
 *
 * Quién edita: el dueño de un privado; los compartidos, quien administra la empresa (dueño, o
 * cualquiera si el plan no tiene roles). Un asistente nunca cambia su propia configuración.
 */
import { and, asc, desc, eq, isNotNull, isNull, ne, or, sql } from 'drizzle-orm'
import {
  DEFAULT_ASSISTANT_SCOPES,
  DEFAULT_AVATAR,
  normalizeAvatarSpec,
  planLimits,
  type AssistantCreateBody,
  type AssistantListResponse,
  type AssistantPatchBody,
  type AssistantProfile,
  type AssistantTone,
  type Locale,
  type PlanCode,
} from '@dekopen/shared'
import type { AppDeps, AuthContext } from '../../context'
import { assistants, subscriptions } from '../../db/schema'
import { newId } from '../../lib/crypto'
import { HttpError, conflict, forbidden, notFound } from '../../lib/errors'
import type { Viewer } from '../access'
import { assistantText } from './i18n'
import { canManageOrg } from './memory'

export type AssistantRow = typeof assistants.$inferSelect

const TONES: readonly AssistantTone[] = ['friendly', 'professional', 'concise', 'detailed', 'technical', 'enthusiastic']

export function toProfile(row: AssistantRow, auth: Pick<AuthContext, 'user'>, viewer: Viewer): AssistantProfile {
  const personality = row.personality as Partial<AssistantProfile['personality']> | null
  return {
    id: row.id,
    name: row.name,
    avatar: normalizeAvatarSpec(row.avatar),
    personality: {
      tone: personality?.tone && TONES.includes(personality.tone) ? personality.tone : 'friendly',
      instructions: typeof personality?.instructions === 'string' ? personality.instructions : '',
    },
    defaultMode: row.defaultMode,
    scopes: Array.isArray(row.scopes) && row.scopes.length ? row.scopes : [...DEFAULT_ASSISTANT_SCOPES],
    language: row.language,
    visibility: row.ownerUserId ? 'private' : 'shared',
    ...(row.ownerUserId ? { ownerUserId: row.ownerUserId } : {}),
    memoryEnabled: row.memoryEnabled,
    isDefault: row.isDefault,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    canEdit: row.ownerUserId ? row.ownerUserId === auth.user.id : canManageOrg(viewer),
  }
}

/** Visibles para esta persona: compartidos de su organización y sus privados. */
function visibleTo(auth: Pick<AuthContext, 'org' | 'user'>) {
  return and(eq(assistants.orgId, auth.org.id), or(isNull(assistants.ownerUserId), eq(assistants.ownerUserId, auth.user.id)))!
}

async function planOf(deps: Pick<AppDeps, 'db'>, orgId: string): Promise<PlanCode> {
  const [sub] = await deps.db.select({ plan: subscriptions.plan }).from(subscriptions).where(eq(subscriptions.orgId, orgId)).limit(1)
  return sub?.plan ?? 'trial'
}

async function activeCount(deps: Pick<AppDeps, 'db'>, orgId: string): Promise<number> {
  const [{ n }] = await deps.db.select({ n: sql<number>`count(*)::int` }).from(assistants).where(and(eq(assistants.orgId, orgId), isNull(assistants.archivedAt)))
  return Number(n)
}

/** El asistente de siempre si la organización todavía no tiene ninguno activo visible. */
export async function ensureDefaultAssistant(deps: Pick<AppDeps, 'db' | 'now'>, auth: AuthContext, locale: Locale = 'es'): Promise<AssistantRow> {
  const [existing] = await deps.db
    .select()
    .from(assistants)
    .where(and(visibleTo(auth), isNull(assistants.archivedAt)))
    .orderBy(desc(assistants.isDefault), asc(assistants.createdAt))
    .limit(1)
  if (existing) return existing
  // Solo se siembra si la organización no tiene NINGUNO (ni archivado): no resucita a quien se archivó a propósito.
  const [any] = await deps.db.select({ id: assistants.id }).from(assistants).where(eq(assistants.orgId, auth.org.id)).limit(1)
  const now = deps.now()
  if (any) {
    // Todos archivados: se restaura el último en vez de crear otro.
    const [last] = await deps.db
      .select()
      .from(assistants)
      .where(and(visibleTo(auth), isNotNull(assistants.archivedAt)))
      .orderBy(desc(assistants.updatedAt))
      .limit(1)
    if (last) {
      const [restored] = await deps.db.update(assistants).set({ archivedAt: null, updatedAt: now, version: sql`${assistants.version} + 1` }).where(eq(assistants.id, last.id)).returning()
      return restored!
    }
  }
  const [row] = await deps.db
    .insert(assistants)
    .values({
      id: newId(),
      orgId: auth.org.id,
      ownerUserId: null,
      name: assistantText(locale).t('defaultAssistant.name'),
      // El primer asistente nace con la forma propia de DEKOPEN: una ventanita con dos ojos.
      avatar: DEFAULT_AVATAR,
      personality: { tone: 'friendly', instructions: '' },
      defaultMode: 'supervised',
      scopes: [...DEFAULT_ASSISTANT_SCOPES],
      language: 'auto',
      memoryEnabled: true,
      isDefault: true,
      version: 1,
      createdBy: auth.user.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  return row!
}

export async function listAssistants(deps: Pick<AppDeps, 'db' | 'now'>, auth: AuthContext, viewer: Viewer, locale: Locale): Promise<AssistantListResponse> {
  await ensureDefaultAssistant(deps, auth, locale)
  const rows = await deps.db
    .select()
    .from(assistants)
    .where(and(visibleTo(auth), isNull(assistants.archivedAt)))
    .orderBy(desc(assistants.isDefault), asc(assistants.createdAt))
  const plan = await planOf(deps, auth.org.id)
  return { items: rows.map((r) => toProfile(r, auth, viewer)), limit: planLimits(plan).assistants, used: await activeCount(deps, auth.org.id) }
}

export async function findAssistant(deps: Pick<AppDeps, 'db'>, auth: AuthContext, id: string, options: { includeArchived?: boolean } = {}): Promise<AssistantRow | undefined> {
  const [row] = await deps.db
    .select()
    .from(assistants)
    .where(and(eq(assistants.id, id), visibleTo(auth), ...(options.includeArchived ? [] : [isNull(assistants.archivedAt)])))
    .limit(1)
  return row
}

/** El asistente del turno: el pedido (si lo ve) o el por defecto. */
export async function resolveAssistant(deps: Pick<AppDeps, 'db' | 'now'>, auth: AuthContext, id: string | undefined, locale: Locale): Promise<AssistantRow> {
  if (id) {
    const row = await findAssistant(deps, auth, id)
    if (!row) throw notFound('No encontramos ese asistente. Puede que lo hayan archivado.')
    return row
  }
  return ensureDefaultAssistant(deps, auth, locale)
}

function planLimitError(plan: PlanCode, limit: number): HttpError {
  const next = plan === 'taller' || plan === 'trial' ? 'pro' : plan === 'pro' ? 'empresa' : 'empresa2x'
  return new HttpError(402, 'plan_limit', `Tu plan permite ${limit} ${limit === 1 ? 'asistente' : 'asistentes'}. Archiva uno o mejora tu plan para crear más.`, undefined, {
    plan: next,
    limit,
    feature: 'assistants',
    upgrade: '/ajustes/plan',
  })
}

function assertCanEdit(row: AssistantRow, auth: AuthContext, viewer: Viewer) {
  if (row.ownerUserId ? row.ownerUserId !== auth.user.id : !canManageOrg(viewer)) {
    throw forbidden('Este asistente lo configura quien lo creó o quien administra la empresa.')
  }
}

/** Un solo asistente compartido por defecto: al marcar uno, los demás dejan de serlo. */
async function clearDefault(deps: Pick<AppDeps, 'db'>, orgId: string, exceptId: string) {
  await deps.db
    .update(assistants)
    .set({ isDefault: false })
    .where(and(eq(assistants.orgId, orgId), ne(assistants.id, exceptId), eq(assistants.isDefault, true)))
}

export async function createAssistant(deps: Pick<AppDeps, 'db' | 'now'>, auth: AuthContext, viewer: Viewer, body: AssistantCreateBody & { name: string }): Promise<AssistantProfile> {
  const visibility = body.visibility ?? 'shared'
  if (visibility === 'shared' && !canManageOrg(viewer)) throw forbidden('Los asistentes de todo el equipo los crea quien administra la empresa. Puedes crear uno privado.')
  const plan = await planOf(deps, auth.org.id)
  const limit = planLimits(plan).assistants
  if ((await activeCount(deps, auth.org.id)) >= limit) throw planLimitError(plan, limit)
  const now = deps.now()
  const id = newId()
  const isDefault = Boolean(body.isDefault) && visibility === 'shared'
  const [row] = await deps.db
    .insert(assistants)
    .values({
      id,
      orgId: auth.org.id,
      ownerUserId: visibility === 'private' ? auth.user.id : null,
      name: body.name.trim(),
      avatar: normalizeAvatarSpec(body.avatar),
      personality: { tone: body.personality?.tone ?? 'friendly', instructions: body.personality?.instructions ?? '' },
      defaultMode: body.defaultMode ?? 'supervised',
      scopes: body.scopes ? [...new Set(body.scopes)] : [...DEFAULT_ASSISTANT_SCOPES],
      language: body.language ?? 'auto',
      memoryEnabled: body.memoryEnabled ?? true,
      isDefault,
      version: 1,
      createdBy: auth.user.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
  if (isDefault) await clearDefault(deps, auth.org.id, id)
  return toProfile(row!, auth, viewer)
}

export async function patchAssistant(deps: Pick<AppDeps, 'db' | 'now'>, auth: AuthContext, viewer: Viewer, id: string, body: AssistantPatchBody): Promise<AssistantProfile> {
  const row = await findAssistant(deps, auth, id)
  if (!row) throw notFound('No encontramos ese asistente.')
  assertCanEdit(row, auth, viewer)
  if (row.version !== body.version) {
    throw conflict('version_conflict', 'Este asistente cambió en otra pestaña. Te mostramos la versión más reciente.', { version: row.version, assistant: toProfile(row, auth, viewer) })
  }
  let ownerUserId = row.ownerUserId
  if (body.visibility === 'shared' && row.ownerUserId) {
    if (!canManageOrg(viewer)) throw forbidden('Compartir un asistente con todo el equipo lo hace quien administra la empresa.')
    ownerUserId = null
  } else if (body.visibility === 'private' && !row.ownerUserId) ownerUserId = auth.user.id
  const isDefault = body.isDefault === undefined ? row.isDefault && !ownerUserId : body.isDefault && !ownerUserId
  const [updated] = await deps.db
    .update(assistants)
    .set({
      ...(body.name !== undefined ? { name: body.name.trim() } : {}),
      ...(body.avatar !== undefined ? { avatar: normalizeAvatarSpec(body.avatar) } : {}),
      ...(body.personality !== undefined ? { personality: { tone: body.personality.tone, instructions: body.personality.instructions ?? '' } } : {}),
      ...(body.defaultMode !== undefined ? { defaultMode: body.defaultMode } : {}),
      ...(body.scopes !== undefined ? { scopes: [...new Set(body.scopes)] } : {}),
      ...(body.language !== undefined ? { language: body.language } : {}),
      ...(body.memoryEnabled !== undefined ? { memoryEnabled: body.memoryEnabled } : {}),
      ownerUserId,
      isDefault,
      version: sql`${assistants.version} + 1`,
      updatedAt: deps.now(),
    })
    .where(and(eq(assistants.id, row.id), eq(assistants.version, body.version)))
    .returning()
  if (!updated) throw conflict('version_conflict', 'Este asistente cambió en otra pestaña. Te mostramos la versión más reciente.')
  if (updated.isDefault) await clearDefault(deps, auth.org.id, updated.id)
  return toProfile(updated, auth, viewer)
}

export async function archiveAssistant(deps: Pick<AppDeps, 'db' | 'now'>, auth: AuthContext, viewer: Viewer, id: string): Promise<AssistantRow> {
  const row = await findAssistant(deps, auth, id)
  if (!row) throw notFound('No encontramos ese asistente.')
  assertCanEdit(row, auth, viewer)
  const [archived] = await deps.db
    .update(assistants)
    .set({ archivedAt: deps.now(), isDefault: false, version: sql`${assistants.version} + 1`, updatedAt: deps.now() })
    .where(eq(assistants.id, row.id))
    .returning()
  if (row.isDefault) {
    // El siguiente compartido pasa a ser el por defecto.
    const [next] = await deps.db
      .select({ id: assistants.id })
      .from(assistants)
      .where(and(eq(assistants.orgId, auth.org.id), isNull(assistants.ownerUserId), isNull(assistants.archivedAt)))
      .orderBy(asc(assistants.createdAt))
      .limit(1)
    if (next) await deps.db.update(assistants).set({ isDefault: true }).where(eq(assistants.id, next.id))
  }
  return archived!
}

export async function restoreAssistant(deps: Pick<AppDeps, 'db' | 'now'>, auth: AuthContext, viewer: Viewer, id: string): Promise<AssistantProfile> {
  const row = await findAssistant(deps, auth, id, { includeArchived: true })
  if (!row || !row.archivedAt) throw notFound('Ese asistente no está archivado.')
  assertCanEdit(row, auth, viewer)
  const plan = await planOf(deps, auth.org.id)
  const limit = planLimits(plan).assistants
  if ((await activeCount(deps, auth.org.id)) >= limit) throw planLimitError(plan, limit)
  const [restored] = await deps.db
    .update(assistants)
    .set({ archivedAt: null, version: sql`${assistants.version} + 1`, updatedAt: deps.now() })
    .where(eq(assistants.id, row.id))
    .returning()
  return toProfile(restored!, auth, viewer)
}

export { planOf as assistantPlanOf }
