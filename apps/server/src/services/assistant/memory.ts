/**
 * Memoria del asistente con alcances: 'assistant' (esta persona con este asistente), 'user' (esta
 * persona con todos sus asistentes) y 'org' (toda la empresa; solo quien administra la escribe).
 * Nunca se comparte entre organizaciones. Determinista y sin extensiones de Postgres (PGlite):
 * fijadas + recientes + coincidencia de texto plegado. Se inyecta en el prompt como DATOS.
 */
import { and, desc, eq, isNull, or, sql, type SQL } from 'drizzle-orm'
import { MEMORY_LIMITS, type Memory, type MemoryCreateBody, type MemoryKind, type MemoryPatchBody, type MemoryScope, type MemorySource } from '@dekopen/shared'
import type { AppDeps, AuthContext } from '../../context'
import { memories } from '../../db/schema'
import { newId } from '../../lib/crypto'
import { HttpError, badRequest, forbidden, notFound } from '../../lib/errors'
import { folded, foldText } from '../../lib/http'
import type { Viewer } from '../access'

type MemoryRow = typeof memories.$inferSelect

/** Memorias activas por persona (todas sus capas) antes de pedir que limpie. */
export const MEMORY_MAX_PER_USER = 500
/** Presupuesto en el prompt. */
export const MEMORY_PROMPT_ITEMS = 30
export const MEMORY_PROMPT_CHARS = 7000

/** Quien administra la empresa (dueño, o cualquiera si el plan no tiene roles). */
export function canManageOrg(viewer: Viewer): boolean {
  return viewer.role === 'owner' || !viewer.features.includes('roles')
}

export function toMemory(row: MemoryRow, auth: Pick<AuthContext, 'user'>, viewer: Viewer): Memory {
  const own = row.userId === auth.user.id
  return {
    id: row.id,
    scope: row.scope,
    kind: row.kind,
    content: row.content,
    source: row.source,
    pinned: row.pinned,
    ...(row.assistantId ? { assistantId: row.assistantId } : {}),
    ...(row.userId ? { userId: row.userId } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.lastUsedAt ? { lastUsedAt: row.lastUsedAt.toISOString() } : {}),
    canEdit: row.scope === 'org' ? canManageOrg(viewer) : own,
  }
}

/** Lo que esta persona puede ver: lo de la empresa, lo suyo y lo suyo con un asistente. */
function visible(auth: Pick<AuthContext, 'org' | 'user'>, assistantId?: string): SQL {
  const scopes: SQL[] = [eq(memories.scope, 'org'), and(eq(memories.scope, 'user'), eq(memories.userId, auth.user.id))!]
  scopes.push(
    assistantId
      ? and(eq(memories.scope, 'assistant'), eq(memories.userId, auth.user.id), eq(memories.assistantId, assistantId))!
      : and(eq(memories.scope, 'assistant'), eq(memories.userId, auth.user.id))!,
  )
  return and(eq(memories.orgId, auth.org.id), isNull(memories.deletedAt), or(...scopes))!
}

export async function listMemories(
  deps: Pick<AppDeps, 'db'>,
  auth: AuthContext,
  viewer: Viewer,
  query: { scope?: MemoryScope; assistantId?: string; q?: string; limit?: number } = {},
): Promise<{ items: Memory[]; total: number }> {
  const conditions: SQL[] = [visible(auth, query.assistantId)]
  if (query.scope) conditions.push(eq(memories.scope, query.scope))
  if (query.q?.trim()) conditions.push(folded(memories.content, query.q.trim()))
  const where = and(...conditions)
  const rows = await deps.db
    .select()
    .from(memories)
    .where(where)
    .orderBy(desc(memories.pinned), desc(memories.updatedAt))
    .limit(Math.min(200, Math.max(1, query.limit ?? 100)))
  const [{ total }] = await deps.db.select({ total: sql<number>`count(*)::int` }).from(memories).where(where)
  return { items: rows.map((r) => toMemory(r, auth, viewer)), total: Number(total) }
}

async function findVisible(deps: Pick<AppDeps, 'db'>, auth: AuthContext, id: string, includeDeleted = false): Promise<MemoryRow | undefined> {
  const [row] = await deps.db
    .select()
    .from(memories)
    .where(
      and(
        eq(memories.id, id),
        eq(memories.orgId, auth.org.id),
        ...(includeDeleted ? [] : [isNull(memories.deletedAt)]),
        or(eq(memories.scope, 'org'), eq(memories.userId, auth.user.id)),
      ),
    )
    .limit(1)
  return row
}

const SENSITIVE = [
  /\b(sk|tp|ttp|pk|rk)-[A-Za-z0-9_-]{12,}/i,
  /\b(?:password|passwd|contrase[nñ]a|clave|senha|mot de passe|passwort|parola d'ordine|şifre)\s*[:=]/i,
  /\b(?:\d[ -]?){13,19}\b/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
]

/** ¿Parece un secreto (clave, contraseña, tarjeta)? Nunca se guarda en memoria. */
export function looksSensitive(text: string): boolean {
  return SENSITIVE.some((re) => re.test(text))
}

export interface CreateMemoryOptions {
  source: MemorySource
  sourceMessageId?: string
  now: Date
}

/** Crea (o reafirma, si ya existe el mismo texto en el mismo alcance) un recuerdo. */
export async function createMemory(
  deps: Pick<AppDeps, 'db'>,
  auth: AuthContext,
  viewer: Viewer,
  input: { scope: MemoryScope; kind: MemoryKind; content: string; pinned?: boolean; assistantId?: string },
  options: CreateMemoryOptions,
): Promise<{ memory: Memory; created: boolean }> {
  const content = input.content.trim().slice(0, MEMORY_LIMITS.contentMax)
  if (!content) throw badRequest('Escribe qué quieres que recuerde.', 'content')
  if (looksSensitive(content)) throw badRequest('Por seguridad no guardo claves, contraseñas ni números de tarjeta.', 'content')
  if (input.scope === 'org' && !canManageOrg(viewer)) throw forbidden('Los recuerdos de toda la empresa los guarda quien administra la cuenta.')
  if (input.scope === 'assistant' && !input.assistantId) throw badRequest('Falta el asistente de este recuerdo.', 'assistantId')
  const owner = input.scope === 'org' ? null : auth.user.id
  const assistantId = input.scope === 'assistant' ? input.assistantId! : null
  const same = await deps.db
    .select()
    .from(memories)
    .where(
      and(
        eq(memories.orgId, auth.org.id),
        isNull(memories.deletedAt),
        eq(memories.scope, input.scope),
        owner ? eq(memories.userId, owner) : isNull(memories.userId),
        assistantId ? eq(memories.assistantId, assistantId) : isNull(memories.assistantId),
      ),
    )
  const key = foldText(content).replace(/[^a-z0-9]+/g, ' ').trim()
  const duplicate = same.find((m) => foldText(m.content).replace(/[^a-z0-9]+/g, ' ').trim() === key)
  if (duplicate) {
    const [row] = await deps.db
      .update(memories)
      .set({ updatedAt: options.now, ...(input.pinned ? { pinned: true } : {}), ...(options.source === 'explicit' ? { source: 'explicit' as const } : {}) })
      .where(eq(memories.id, duplicate.id))
      .returning()
    return { memory: toMemory(row!, auth, viewer), created: false }
  }
  const [{ n }] = await deps.db
    .select({ n: sql<number>`count(*)::int` })
    .from(memories)
    .where(and(eq(memories.orgId, auth.org.id), eq(memories.userId, auth.user.id), isNull(memories.deletedAt)))
  if (Number(n) >= MEMORY_MAX_PER_USER) throw new HttpError(409, 'memory_full', 'Tienes demasiados recuerdos guardados. Borra algunos que ya no sirvan y vuelve a intentarlo.')
  const [row] = await deps.db
    .insert(memories)
    .values({
      id: newId(),
      orgId: auth.org.id,
      scope: input.scope,
      userId: owner,
      assistantId,
      kind: input.kind,
      content,
      source: options.source,
      pinned: input.pinned ?? false,
      sourceMessageId: options.sourceMessageId ?? null,
      createdBy: auth.user.id,
      createdAt: options.now,
      updatedAt: options.now,
    })
    .returning()
  return { memory: toMemory(row!, auth, viewer), created: true }
}

export async function createMemoryFromBody(deps: Pick<AppDeps, 'db' | 'now'>, auth: AuthContext, viewer: Viewer, body: MemoryCreateBody): Promise<Memory> {
  const { memory } = await createMemory(
    deps,
    auth,
    viewer,
    { scope: body.scope ?? 'assistant', kind: body.kind ?? 'fact', content: body.content, pinned: body.pinned, assistantId: body.assistantId },
    { source: 'explicit', now: deps.now() },
  )
  return memory
}

function assertEditable(row: MemoryRow, auth: AuthContext, viewer: Viewer) {
  if (row.scope === 'org' ? !canManageOrg(viewer) : row.userId !== auth.user.id) throw forbidden('Este recuerdo lo puede cambiar quien lo guardó o quien administra la empresa.')
}

export async function updateMemory(deps: Pick<AppDeps, 'db' | 'now'>, auth: AuthContext, viewer: Viewer, id: string, patch: MemoryPatchBody): Promise<Memory> {
  const row = await findVisible(deps, auth, id)
  if (!row) throw notFound('No encontramos ese recuerdo.')
  assertEditable(row, auth, viewer)
  if (patch.content !== undefined && looksSensitive(patch.content)) throw badRequest('Por seguridad no guardo claves, contraseñas ni números de tarjeta.', 'content')
  const [updated] = await deps.db
    .update(memories)
    .set({
      ...(patch.content !== undefined ? { content: patch.content.trim().slice(0, MEMORY_LIMITS.contentMax) } : {}),
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
      updatedAt: deps.now(),
    })
    .where(eq(memories.id, row.id))
    .returning()
  return toMemory(updated!, auth, viewer)
}

/** Borrado suave (se puede deshacer con `restoreMemory`). */
export async function deleteMemory(deps: Pick<AppDeps, 'db' | 'now'>, auth: AuthContext, viewer: Viewer, id: string): Promise<Memory> {
  const row = await findVisible(deps, auth, id)
  if (!row) throw notFound('No encontramos ese recuerdo.')
  assertEditable(row, auth, viewer)
  const [deleted] = await deps.db.update(memories).set({ deletedAt: deps.now() }).where(eq(memories.id, row.id)).returning()
  return toMemory(deleted!, auth, viewer)
}

export async function restoreMemory(deps: Pick<AppDeps, 'db' | 'now'>, auth: AuthContext, viewer: Viewer, id: string): Promise<Memory> {
  const row = await findVisible(deps, auth, id, true)
  if (!row || !row.deletedAt) throw notFound('Ese recuerdo no está borrado.')
  assertEditable(row, auth, viewer)
  const [restored] = await deps.db.update(memories).set({ deletedAt: null, updatedAt: deps.now() }).where(eq(memories.id, row.id)).returning()
  return toMemory(restored!, auth, viewer)
}

/** Neutraliza delimitadores en datos no confiables que van al prompt. */
export function sanitizeForPrompt(text: string, max = 1000): string {
  return text
    .slice(0, max)
    .replace(/[<>]/g, (c) => (c === '<' ? '‹' : '›'))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F‪-‮⁦-⁩]/g, '')
}

/**
 * Recuerdos para el prompt: fijados primero, luego los más recientes (y los que calzan con el
 * texto del pedido), dentro del presupuesto. Marca `lastUsedAt`.
 */
export async function memoriesForPrompt(deps: Pick<AppDeps, 'db' | 'now'>, auth: AuthContext, assistantId: string, text: string): Promise<MemoryRow[]> {
  const rows = await deps.db
    .select()
    .from(memories)
    .where(visible(auth, assistantId))
    .orderBy(desc(memories.pinned), desc(memories.updatedAt))
    .limit(300)
  const words = new Set(
    foldText(text)
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4),
  )
  const scored = rows.map((row, index) => {
    const hits = foldText(row.content)
      .split(/[^a-z0-9]+/)
      .filter((w) => words.has(w)).length
    return { row, score: (row.pinned ? 100 : 0) + (row.kind === 'instruction' || row.kind === 'preference' ? 8 : 0) + hits * 10 - index * 0.05 }
  })
  scored.sort((a, b) => b.score - a.score)
  const picked: MemoryRow[] = []
  let chars = 0
  for (const { row } of scored) {
    if (picked.length >= MEMORY_PROMPT_ITEMS) break
    if (chars + row.content.length > MEMORY_PROMPT_CHARS) continue
    picked.push(row)
    chars += row.content.length
  }
  if (picked.length) {
    await deps.db
      .update(memories)
      .set({ lastUsedAt: deps.now() })
      .where(and(eq(memories.orgId, auth.org.id), sql`${memories.id} in (${sql.join(picked.map((p) => sql`${p.id}`), sql`, `)})`))
  }
  return picked
}

/** Búsqueda para la herramienta `recall`. */
export async function searchMemories(deps: Pick<AppDeps, 'db'>, auth: AuthContext, viewer: Viewer, assistantId: string, query?: string): Promise<Memory[]> {
  return (await listMemories(deps, auth, viewer, { assistantId, q: query, limit: 20 })).items
}
