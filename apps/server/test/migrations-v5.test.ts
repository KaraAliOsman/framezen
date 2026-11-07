import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { createDatabase, rowsOf, type Database } from '../src/db/client'
import { loadMigrations, runMigrations } from '../src/db/migrate'
import { toBuffer } from '../src/db/bytea'
import { aiUsage, assets, assistants, conversations, documentTemplates, memories, messages, orgs, toolRuns, users } from '../src/db/schema'
import { newId } from '../src/lib/crypto'
import { dayStartInZone } from '../src/lib/dates'
import { dailyAiUsage, dailyCreditsLeft } from '../src/services/ai/credits'

let database: Database

beforeAll(async () => {
  database = await createDatabase({ memory: true })
})
afterAll(async () => {
  await database.close()
})

async function columns(table: string): Promise<Set<string>> {
  const result = await database.db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = ${table}`)
  return new Set(rowsOf<{ column_name: string }>(result).map((r) => r.column_name))
}

async function indexes(table: string): Promise<Set<string>> {
  const result = await database.db.execute(sql`SELECT indexname FROM pg_indexes WHERE tablename = ${table}`)
  return new Set(rowsOf<{ indexname: string }>(result).map((r) => r.indexname))
}

async function seedOrg() {
  const orgId = newId()
  const userId = newId()
  await database.db.insert(orgs).values({ id: orgId, name: 'Ventanas Sur' })
  await database.db.insert(users).values({ id: userId, email: `${userId}@test.cl`, name: 'Ana', passwordHash: 'x' })
  return { orgId, userId }
}

describe('migraciones v5 (PGlite en memoria)', () => {
  it('aplica 0000–0006 en orden, una sola vez, y son idempotentes', async () => {
    const all = loadMigrations()
    expect(all.map((m) => m.id)).toEqual(
      expect.arrayContaining(['0003_locale_settings', '0004_assets', '0005_assistant_v2', '0006_document_templates']),
    )
    const applied = await runMigrations(database.db)
    expect(applied).toEqual(expect.arrayContaining(['0003_locale_settings', '0004_assets', '0005_assistant_v2', '0006_document_templates', '0007_quote_follow_up']))
    expect(await runMigrations(database.db)).toEqual([])
    // IF NOT EXISTS: volver a correr las sentencias v5 tal cual no falla (instancias que arrancan a la vez).
    for (const migration of all.filter((m) => m.id >= '0003')) {
      for (const statement of migration.statements) await database.db.execute(sql.raw(statement))
    }
    // Sin extensiones (deben correr igual en PGlite y Postgres).
    for (const migration of all) for (const statement of migration.statements) expect(statement).not.toMatch(/CREATE EXTENSION/i)
  })

  it('crea columnas e índices esperados (índices que empiezan por org_id)', async () => {
    expect(await columns('users')).toContain('locale')
    const orgCols = await columns('orgs')
    expect(orgCols).toContain('locale')
    expect(orgCols).toContain('currency')
    expect(await columns('assets')).toEqual(
      new Set(['id', 'org_id', 'kind', 'name', 'mime', 'bytes', 'byte_size', 'width', 'height', 'sha256', 'meta', 'parent_id', 'created_by', 'created_at', 'updated_at', 'deleted_at']),
    )
    for (const t of ['assistants', 'conversations', 'messages', 'memories', 'tool_runs', 'document_templates']) expect((await columns(t)).size).toBeGreaterThan(5)
    const usage = await columns('ai_usage')
    for (const c of ['conversation_id', 'assistant_id', 'tokens_in', 'tokens_cached', 'tokens_out']) expect(usage).toContain(c)
    expect(await indexes('tool_runs')).toContain('tool_runs_org_tool_call_uq')
    expect(await indexes('messages')).toContain('messages_conversation_seq_uq')
    expect(await indexes('assets')).toContain('assets_org_kind_sha_uq')
    expect(await indexes('conversations')).toContain('conversations_org_user_last_idx')
  })

  it('valores por defecto de idioma y moneda en organizaciones existentes y nuevas', async () => {
    const { orgId, userId } = await seedOrg()
    const [org] = await database.db.select().from(orgs).where(eq(orgs.id, orgId))
    expect(org).toMatchObject({ locale: 'es', currency: 'CLP' })
    const [user] = await database.db.select().from(users).where(eq(users.id, userId))
    expect(user!.locale).toBeNull()
  })

  it('bytea: guarda y devuelve Buffer tal cual (bytes 0–255)', async () => {
    const { orgId, userId } = await seedOrg()
    const bytes = Buffer.from(Array.from({ length: 512 }, (_, i) => i % 256))
    const id = newId()
    await database.db.insert(assets).values({ id, orgId, kind: 'texture', mime: 'image/png', bytes, byteSize: bytes.length, sha256: 'a'.repeat(64), createdBy: userId })
    const [row] = await database.db.select({ bytes: assets.bytes, meta: assets.meta }).from(assets).where(eq(assets.id, id))
    expect(Buffer.isBuffer(row!.bytes)).toBe(true)
    expect(row!.bytes.equals(bytes)).toBe(true)
    expect(row!.meta).toEqual({})
    // Misma imagen dos veces en la misma organización y tipo: única.
    await expect(
      database.db.insert(assets).values({ id: newId(), orgId, kind: 'texture', mime: 'image/png', bytes, byteSize: bytes.length, sha256: 'a'.repeat(64) }),
    ).rejects.toThrow()
    expect(toBuffer('\\x00ff10').equals(Buffer.from([0, 255, 16]))).toBe(true)
    expect(toBuffer(new Uint8Array([1, 2, 3])).equals(Buffer.from([1, 2, 3]))).toBe(true)
  })

  it('asistente v2: restricciones, secuencia única y tool_call_id único por organización', async () => {
    const { orgId, userId } = await seedOrg()
    const assistantId = newId()
    await database.db.insert(assistants).values({ id: assistantId, orgId, name: 'Marco', createdBy: userId })
    const [assistant] = await database.db.select().from(assistants).where(eq(assistants.id, assistantId))
    expect(assistant).toMatchObject({ defaultMode: 'supervised', language: 'auto', memoryEnabled: true, version: 1, scopes: [], ownerUserId: null })
    await expect(database.db.insert(assistants).values({ id: newId(), orgId, name: 'X', defaultMode: 'yolo' as never })).rejects.toThrow()

    const conversationId = newId()
    await database.db.insert(conversations).values({ id: conversationId, orgId, userId, assistantId, mode: 'full' })
    const msg = (seq: number) => ({ id: newId(), orgId, conversationId, seq, role: 'user' as const, source: 'local' as const, parts: [{ type: 'text' as const, text: 'hola' }], text: 'hola' })
    await database.db.insert(messages).values(msg(1))
    await expect(database.db.insert(messages).values(msg(1))).rejects.toThrow()
    await database.db.insert(messages).values({ ...msg(2), role: 'assistant', source: 'ai', reasoning: 'pienso', toolCalls: [{ id: 'call_1', name: 'add_window', arguments: '{}' }] })

    const run = { orgId, userId, assistantId, conversationId, toolCallId: 'call_1', tool: 'add_window', risk: 'write' as const, mode: 'supervised' as const, argsHash: 'h'.repeat(16), args: { width: 1500 } }
    await database.db.insert(toolRuns).values({ id: newId(), ...run })
    await expect(database.db.insert(toolRuns).values({ id: newId(), ...run })).rejects.toThrow()
    const other = await seedOrg()
    await database.db.insert(toolRuns).values({ id: newId(), ...run, orgId: other.orgId, userId: other.userId, assistantId: null, conversationId: null })
    await expect(database.db.insert(toolRuns).values({ id: newId(), ...run, toolCallId: 'call_2', status: 'running' as never })).rejects.toThrow()

    await database.db.insert(memories).values({ id: newId(), orgId, scope: 'assistant', userId, assistantId, content: 'Preferimos milímetros.' })
    await expect(database.db.insert(memories).values({ id: newId(), orgId, scope: 'global' as never, content: 'x' })).rejects.toThrow()

    await database.db.insert(aiUsage).values({ id: newId(), orgId, userId, credits: 3, conversationId, assistantId, tokensIn: 1000, tokensCached: 200, tokensOut: 300 })
    await database.db.insert(documentTemplates).values({ id: newId(), orgId, kind: 'quote', name: 'Luz propia', presetId: 'hogar', spec: { version: 1 } as never, createdBy: userId })
    await expect(database.db.insert(documentTemplates).values({ id: newId(), orgId, kind: 'workshop' as never, name: 'x', spec: {} as never })).rejects.toThrow()

    // Borrar la conversación borra mensajes y tool_runs; ai_usage queda (sin conversación).
    await database.db.delete(conversations).where(eq(conversations.id, conversationId))
    expect(await database.db.select().from(messages).where(eq(messages.conversationId, conversationId))).toHaveLength(0)
    expect(await database.db.select().from(toolRuns).where(eq(toolRuns.orgId, orgId))).toHaveLength(0)
    const [usage] = await database.db.select().from(aiUsage).where(eq(aiUsage.orgId, orgId))
    expect(usage!.conversationId).toBeNull()

    // Borrar la organización arrastra todo lo suyo.
    await database.db.delete(orgs).where(eq(orgs.id, orgId))
    for (const table of [assistants, memories, documentTemplates, aiUsage, assets]) {
      expect(await database.db.select().from(table).where(eq(table.orgId, orgId))).toHaveLength(0)
    }
  })

  it('uso diario de IA (hora de Chile): créditos de la empresa, llamadas y turnos de la persona', async () => {
    const { orgId, userId } = await seedOrg()
    const now = new Date('2026-10-31T15:00:00Z')
    const today = dayStartInZone(now)
    expect(today.toISOString()).toBe('2026-10-31T03:00:00.000Z') // Chile en horario de verano (UTC−3)
    expect(dayStartInZone(now, -1).toISOString()).toBe('2026-10-30T03:00:00.000Z')
    const yesterday = new Date(today.getTime() - 3600_000)
    await database.db.insert(aiUsage).values([
      { id: newId(), orgId, userId, credits: 7, mode: 'ai', createdAt: now },
      { id: newId(), orgId, userId, credits: 5, mode: 'ai', createdAt: now },
      { id: newId(), orgId, userId, credits: 0, mode: 'local', createdAt: now },
      { id: newId(), orgId, userId, credits: 50, mode: 'ai', createdAt: yesterday },
    ])
    const conversationId = newId()
    await database.db.insert(conversations).values({ id: conversationId, orgId, userId })
    const userMsg = (seq: number, source: 'ai' | 'local', createdAt: Date) => ({ id: newId(), orgId, conversationId, seq, role: 'user' as const, source, createdAt })
    await database.db.insert(messages).values([userMsg(1, 'ai', now), userMsg(2, 'local', now), userMsg(3, 'ai', now), userMsg(4, 'ai', yesterday)])
    const usage = await dailyAiUsage({ db: database.db, now: () => now }, orgId, userId)
    expect(usage).toMatchObject({ orgCredits: 12, userCalls: 2, userTurns: 2 })
    expect(dailyCreditsLeft('pro', usage)).toBe(388)
    expect(dailyCreditsLeft('taller', usage)).toBe(0)
  })
})
