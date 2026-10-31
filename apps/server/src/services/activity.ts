import type { ActivityEvent } from '@framezen/shared'
import type { Db } from '../db/client'
import { activity } from '../db/schema'
import { newId } from '../lib/crypto'

export interface ActivityInput {
  orgId: string
  actor?: { userId?: string; name?: string }
  kind: string
  text: string
  link?: string
  subject?: { type: 'quote' | 'client' | 'work_order' | 'org' | 'team'; id: string }
  meta?: Record<string, unknown>
  pending?: boolean
}

/** Registra un evento. Nunca interrumpe la operación principal si falla. */
export async function logActivity(db: Db, input: ActivityInput): Promise<void> {
  try {
    await db.insert(activity).values({
      id: newId(),
      orgId: input.orgId,
      actorUserId: input.actor?.userId ?? null,
      actorName: input.actor?.name ?? null,
      kind: input.kind,
      text: input.text,
      link: input.link ?? null,
      subjectType: input.subject?.type ?? null,
      subjectId: input.subject?.id ?? null,
      meta: input.meta ?? null,
      pending: input.pending ?? false,
    })
  } catch (error) {
    console.error('No se pudo registrar la actividad', error)
  }
}

export function toActivityEvent(row: typeof activity.$inferSelect): ActivityEvent & { pending?: boolean; meta?: Record<string, unknown> } {
  return {
    id: row.id,
    at: row.createdAt.toISOString(),
    ...(row.actorName ? { actor: row.actorName } : {}),
    kind: row.kind,
    text: row.text,
    ...(row.link ? { link: row.link } : {}),
    ...(row.pending ? { pending: true } : {}),
    ...(row.meta ? { meta: row.meta } : {}),
  }
}

/** Primer nombre para textos cortos: "Ana envió…". */
export function firstName(name: string | undefined | null): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'Alguien'
}
