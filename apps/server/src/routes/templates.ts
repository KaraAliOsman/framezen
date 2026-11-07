/**
 * Plantillas de documentos propias — montado en /api/templates (con sesión y modo lectura; ver
 * app.ts). Contrato de tipos: @dekopen/shared/api (`DocTemplateRecord`, `DocTemplate*Body`…);
 * esquema y operaciones: @dekopen/shared/templates (DOCSCHEMA).
 *
 *   GET    /                    ?kind=quote|catalog → plantillas propias + predeterminadas + permisos
 *   GET    /presets             ?kind=… → diseños predefinidos con la misma forma
 *   POST   /                    crear (desde un diseño, desde otra plantilla o completa)
 *   GET    /:id                 plantilla propia o diseño predefinido
 *   PUT    /:id                 reemplazar (versión optimista; 409 con la vigente)
 *   POST   /:id/ops             aplicar DocOps (editor, comandos locales, asistente)
 *   POST   /:id/duplicate       copia editable (también de un diseño)
 *   DELETE /:id                 borrado suave (se deshace con /restore)
 *   POST   /:id/restore         deshacer el borrado
 *   PUT    /default             { kind, templateId } predeterminada por tipo
 *   POST   /generate            la IA propone una plantilla (no se guarda)
 *   GET    /images · POST /images · GET /images/:id · DELETE /images/:id · POST /images/:id/restore
 *
 * Permisos: leer = cualquiera de la organización. Escribir = quien gestiona la configuración
 * (`requireManager`, igual que los ajustes de documentos) y nunca en modo lectura. Crear o editar
 * plantillas propias pide la función `custom_templates` (Pro y superiores; la prueba la tiene):
 * límite suave, 402 con el plan que la trae. Elegir un diseño predefinido y borrar nunca se bloquea.
 */
import { Hono, type Context } from 'hono'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  DOC_LOCALES,
  DOC_PRESET_IDS,
  DOC_TEMPLATE_KINDS,
  TEMPLATE_LIMITS,
  applyDocOps,
  docIssueMessage,
  duplicateDocPreset,
  getDocPreset,
  hasDocErrors,
  DEFAULT_CATALOG_PRESET_ID,
  DEFAULT_QUOTE_PRESET_ID,
  isDocPresetId,
  parseDocOps,
  planFeatures,
  presetKind,
  summarizeDocOps,
  validateDocTemplate,
  type DocIssue,
  type DocTemplate,
  type DocTemplateKind,
  type DocTemplateListResponse,
  type DocTemplateRecord,
  type Feature,
} from '@dekopen/shared'
import type { AppDeps, AppEnv } from '../context'
import { subscriptions } from '../db/schema'
import { HttpError, apiError, badRequest, conflict, notFound } from '../lib/errors'
import { readBody } from '../lib/http'
import { localeOf } from '../lib/i18n'
import { currentDispatchMeta } from '../lib/request-context'
import { requireManager, requireWritable } from '../middleware/auth'
import { logActivity } from '../services/activity'
import { aiConfigFromEnv, type AiConfig } from '../services/ai/config'
import { assetStore } from '../services/assets'
import {
  MAX_TEMPLATES_PER_KIND,
  TEMPLATE_PROMPT_MAX,
  countTemplates,
  defaultTemplateRefs,
  enforceTemplateAssets,
  generateTemplate,
  generationLocale,
  getTemplate,
  insertTemplate,
  listTemplates,
  loadDocTemplate,
  presetRecords,
  presetToRecord,
  putDocumentImage,
  restoreTemplate,
  setDefaultTemplate,
  softDeleteTemplate,
  storedToRecord,
  toDocumentImage,
  updateTemplate,
  type StoredTemplate,
} from '../services/templates'

export interface TemplateRouteOptions {
  /** Configuración de IA por pedido (por defecto, variables de entorno AI_*). */
  ai?: () => AiConfig | null
  /** fetch para la API de IA (las pruebas lo simulan). */
  fetch?: typeof fetch
}

const kindSchema = z.enum(DOC_TEMPLATE_KINDS, { error: 'El tipo de documento debe ser cotización o catálogo.' })
const idParam = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/)
const nameSchema = z.string().trim().min(1, 'Escribe un nombre para la plantilla.').max(TEMPLATE_LIMITS.nameMax, `El nombre admite hasta ${TEMPLATE_LIMITS.nameMax} caracteres.`)

const createSchema = z.object({
  kind: kindSchema,
  name: nameSchema.optional(),
  fromPresetId: z.enum(DOC_PRESET_IDS).optional(),
  fromTemplateId: idParam.optional(),
  template: z.unknown().optional(),
})
const saveSchema = z.object({ template: z.unknown(), version: z.number({ error: 'Falta la versión de la plantilla.' }).int().min(1) })
const opsSchema = z.object({
  ops: z.array(z.unknown()).min(1, 'No hay cambios que aplicar.').max(TEMPLATE_LIMITS.opsPerBatchMax, `Hasta ${TEMPLATE_LIMITS.opsPerBatchMax} cambios por paso.`),
  version: z.number().int().min(1).optional(),
})
const duplicateSchema = z.object({ name: nameSchema.optional() })
const restoreSchema = z.object({ makeDefault: z.boolean().optional() })
const defaultSchema = z.object({ kind: kindSchema, templateId: idParam })
const generateSchema = z.object({
  kind: kindSchema,
  prompt: z.string().trim().min(3, 'Cuéntale a la IA qué plantilla quieres.').max(TEMPLATE_PROMPT_MAX, `El pedido admite hasta ${TEMPLATE_PROMPT_MAX} caracteres.`),
  baseTemplateId: idParam.optional(),
  locale: z.enum(DOC_LOCALES).optional(),
})
const imageSchema = z.object({
  dataUrl: z.string().max(6 * 1024 * 1024, 'La imagen es demasiado grande.'),
  name: z.string().trim().max(120).optional(),
})

/** 400 con los problemas de validación localizados (la web los muestra junto al campo). */
function invalidTemplate(issues: DocIssue[], locale: string): HttpError {
  const errors = issues.filter((i) => i.severity === 'error')
  const first = errors[0]
  const message = first ? docIssueMessage(first, 'es') : 'La plantilla no es válida.'
  return new HttpError(400, 'invalid', message, 'template', {
    issues: errors.slice(0, 20).map((i) => ({ ...i, message: docIssueMessage(i, locale) })),
  })
}

const label = (kind: DocTemplateKind) => (kind === 'quote' ? 'cotización' : 'catálogo')

export function templateRoutes(deps: AppDeps, options: TemplateRouteOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>()
  const aiConfig = () => (options.ai ?? (() => aiConfigFromEnv(process.env)))()
  const store = assetStore(deps)
  const manage = [requireWritable(deps), requireManager(deps)] as const

  async function featuresOf(orgId: string): Promise<readonly Feature[]> {
    const [sub] = await deps.db.select({ plan: subscriptions.plan }).from(subscriptions).where(eq(subscriptions.orgId, orgId)).limit(1)
    return planFeatures(sub?.plan ?? 'trial')
  }

  async function requireFeature(orgId: string, feature: Feature): Promise<void> {
    if ((await featuresOf(orgId)).includes(feature)) return
    throw apiError(402, 'plan_required', { extra: { feature, plan: 'pro', upgrade: '/ajustes/plan' } })
  }

  async function defaults(orgId: string): Promise<Record<DocTemplateKind, string>> {
    const refs = await defaultTemplateRefs(deps.db, orgId)
    return { quote: refs.quote.id, catalog: refs.catalog.id }
  }

  async function record(orgId: string, stored: StoredTemplate): Promise<DocTemplateRecord> {
    return storedToRecord(stored, (await defaults(orgId))[stored.kind])
  }

  async function findOwn(orgId: string, id: string): Promise<StoredTemplate> {
    const stored = await getTemplate(deps.db, orgId, id)
    if (!stored) throw notFound('No encontramos esa plantilla. Puede que alguien la haya borrado.')
    return stored
  }

  /** Valida forma + reglas + imágenes de la organización; lanza 400 con los problemas. */
  async function checked(c: Context<AppEnv>, orgId: string, input: unknown, kind: DocTemplateKind): Promise<{ template: DocTemplate; issues: DocIssue[] }> {
    const result = validateDocTemplate(input, { kind })
    if (!result.ok) throw invalidTemplate(result.issues, localeOf(c))
    const owned = await enforceTemplateAssets(deps.db, orgId, result.template)
    return { template: owned.template, issues: [...result.issues, ...owned.issues] }
  }

  async function assertRoom(orgId: string, kind: DocTemplateKind): Promise<void> {
    if ((await countTemplates(deps.db, orgId, kind)) >= MAX_TEMPLATES_PER_KIND) {
      throw badRequest(`Llegaste a ${MAX_TEMPLATES_PER_KIND} plantillas de ${label(kind)}. Borra alguna que ya no uses para crear otra.`, 'kind', 'too_many')
    }
  }

  function versionConflict(current: DocTemplateRecord): HttpError {
    return conflict('version_conflict', 'Otra persona cambió esta plantilla mientras la editabas. Te mostramos la versión más reciente.', { version: current.version, template: current })
  }

  // ── Lectura ───────────────────────────────────────────────────────────────

  app.get('/', async (c) => {
    const orgId = c.get('auth').org.id
    const kind = c.req.query('kind') ? kindSchema.parse(c.req.query('kind')) : undefined
    const [stored, defs, features] = await Promise.all([listTemplates(deps.db, orgId, kind), defaults(orgId), featuresOf(orgId)])
    const body: DocTemplateListResponse = {
      templates: stored.map((s) => storedToRecord(s, defs[s.kind])),
      defaults: defs,
      canEdit: features.includes('custom_templates'),
      canGenerate: features.includes('custom_templates') && features.includes('assistant') && Boolean(aiConfig()),
      maxPerKind: MAX_TEMPLATES_PER_KIND,
    }
    return c.json(body)
  })

  app.get('/presets', async (c) => {
    const orgId = c.get('auth').org.id
    const kind = c.req.query('kind') ? kindSchema.parse(c.req.query('kind')) : undefined
    const defs = await defaults(orgId)
    const kinds: DocTemplateKind[] = kind ? [kind] : ['quote', 'catalog']
    return c.json({ presets: kinds.flatMap((k) => presetRecords(k, defs[k])) })
  })

  // ── Imágenes de documentos ──────────────────────────────────────────────────

  app.get('/images', async (c) => {
    const orgId = c.get('auth').org.id
    const { items } = await store.list(orgId, { kind: 'document_image', limit: 200 })
    return c.json({ images: items.map(toDocumentImage) })
  })

  app.post('/images', ...manage, async (c) => {
    const auth = c.get('auth')
    await requireFeature(auth.org.id, 'custom_templates')
    const limit = deps.limits.keyed.take(`tpl-img:org:${auth.org.id}`, { limit: 60, windowMs: 60 * 60_000 })
    if (!limit.ok) throw new HttpError(429, 'too_many_requests', 'Subiste muchas imágenes seguidas. Espera un momento y vuelve a intentarlo.', undefined, { retryAfter: limit.retryAfterSec })
    const body = await readBody(c, imageSchema)
    const { image, duplicate } = await putDocumentImage(store, { orgId: auth.org.id, userId: auth.user.id, dataUrl: body.dataUrl, name: body.name })
    return c.json({ image, duplicate }, duplicate ? 200 : 201)
  })

  app.get('/images/:id', async (c) => {
    const orgId = c.get('auth').org.id
    const id = idParam.safeParse(c.req.param('id'))
    if (!id.success) throw notFound('No encontramos esa imagen.')
    const found = await store.getBytes(orgId, id.data)
    if (!found || found.asset.kind !== 'document_image') throw notFound('No encontramos esa imagen.')
    const dataUrl = `data:${found.asset.mime};base64,${found.bytes.toString('base64')}`
    return c.json({ image: toDocumentImage(found.asset), dataUrl })
  })

  app.delete('/images/:id', ...manage, async (c) => {
    const orgId = c.get('auth').org.id
    const asset = await store.get(orgId, c.req.param('id'))
    if (!asset || asset.kind !== 'document_image') throw notFound('No encontramos esa imagen.')
    await store.remove(orgId, asset.id)
    return c.json({ ok: true, id: asset.id })
  })

  app.post('/images/:id/restore', ...manage, async (c) => {
    const orgId = c.get('auth').org.id
    const asset = await store.get(orgId, c.req.param('id'), { includeDeleted: true })
    if (!asset || asset.kind !== 'document_image') throw notFound('No encontramos esa imagen.')
    const restored = await store.restore(orgId, asset.id)
    if (!restored) throw notFound('No encontramos esa imagen.')
    return c.json({ image: toDocumentImage(restored) })
  })

  // ── IA ──────────────────────────────────────────────────────────────────────

  app.post('/generate', ...manage, async (c) => {
    const auth = c.get('auth')
    const body = await readBody(c, generateSchema)
    const defs = await defaults(auth.org.id)
    const baseRef = body.baseTemplateId ?? defs[body.kind]
    const base = await loadDocTemplate(deps.db, auth.org.id, baseRef, body.kind)
    const result = await generateTemplate(
      deps,
      auth,
      {
        kind: body.kind,
        prompt: body.prompt,
        base: base.template,
        locale: generationLocale(body.locale, localeOf(c)),
        brand: { name: auth.org.name, accent: auth.org.accent, hasLogo: Boolean(auth.org.logo) },
      },
      { ai: aiConfig(), fetch: options.fetch, signal: c.req.raw.signal },
    )
    const locale = localeOf(c)
    const issues = result.issues.map((i) => ({ ...i, message: docIssueMessage(i, locale) }))
    if (!result.ok) return c.json({ ...result, issues })
    await logActivity(deps.db, {
      orgId: auth.org.id,
      actor: { userId: auth.user.id, name: auth.user.name },
      kind: 'template.generated',
      text: `${auth.user.name} pidió a la IA una plantilla de ${label(body.kind)}`,
      link: '/documentos',
      subject: { type: 'org', id: auth.org.id },
      meta: { credits: result.credits },
    })
    return c.json({ ok: true, template: result.template, baseTemplateId: base.template.id, issues, credits: result.credits, creditsLeft: result.creditsLeft })
  })

  // ── Predeterminada ──────────────────────────────────────────────────────────

  app.put('/default', ...manage, async (c) => {
    const auth = c.get('auth')
    const body = await readBody(c, defaultSchema)
    if (isDocPresetId(body.templateId)) {
      if (presetKind(body.templateId) !== body.kind) throw badRequest('Ese diseño es de otro tipo de documento.', 'templateId')
    } else {
      const own = await getTemplate(deps.db, auth.org.id, body.templateId)
      if (!own) throw notFound('No encontramos esa plantilla. Puede que alguien la haya borrado.')
      if (own.kind !== body.kind) throw badRequest('Esa plantilla es de otro tipo de documento.', 'templateId')
    }
    await setDefaultTemplate(deps.db, auth.org.id, body.kind, body.templateId, deps.now())
    await logActivity(deps.db, {
      orgId: auth.org.id,
      actor: { userId: auth.user.id, name: auth.user.name },
      kind: 'template.default',
      text: `${auth.user.name} cambió la plantilla predeterminada de ${label(body.kind)}`,
      link: '/documentos',
      subject: { type: 'org', id: auth.org.id },
      meta: { kind: body.kind, templateId: body.templateId },
    })
    return c.json({ defaults: await defaults(auth.org.id) })
  })

  // ── Plantillas ──────────────────────────────────────────────────────────────

  app.post('/', ...manage, async (c) => {
    const auth = c.get('auth')
    await requireFeature(auth.org.id, 'custom_templates')
    const body = await readBody(c, createSchema)
    await assertRoom(auth.org.id, body.kind)
    let source: DocTemplate
    if (body.template !== undefined) {
      source = (await checked(c, auth.org.id, body.template, body.kind)).template
    } else if (body.fromTemplateId) {
      const loaded = isDocPresetId(body.fromTemplateId) ? getDocPreset(body.fromTemplateId) : (await findOwn(auth.org.id, body.fromTemplateId)).template
      if (loaded.kind !== body.kind) throw badRequest('Esa plantilla es de otro tipo de documento.', 'fromTemplateId')
      source = loaded
    } else {
      const presetId = body.fromPresetId ?? (await defaults(auth.org.id))[body.kind]
      const preset = isDocPresetId(presetId) ? presetId : (body.kind === 'quote' ? DEFAULT_QUOTE_PRESET_ID : DEFAULT_CATALOG_PRESET_ID)
      if (presetKind(preset) !== body.kind) throw badRequest('Ese diseño es de otro tipo de documento.', 'fromPresetId')
      source = duplicateDocPreset(preset, { id: preset })
    }
    const template: DocTemplate = { ...source, ...(body.name ? { name: body.name } : {}) }
    const final = await checked(c, auth.org.id, template, body.kind)
    const stored = await insertTemplate(deps.db, { orgId: auth.org.id, userId: auth.user.id, template: final.template, now: deps.now() })
    await logActivity(deps.db, {
      orgId: auth.org.id,
      actor: { userId: auth.user.id, name: auth.user.name },
      kind: 'template.created',
      text: `${auth.user.name} creó la plantilla «${stored.name}»`,
      link: `/documentos?plantilla=${stored.id}`,
      subject: { type: 'org', id: auth.org.id },
      meta: { templateId: stored.id, kind: stored.kind },
    })
    return c.json(await record(auth.org.id, stored), 201)
  })

  app.get('/:id', async (c) => {
    const orgId = c.get('auth').org.id
    const id = c.req.param('id')
    if (isDocPresetId(id)) {
      const defs = await defaults(orgId)
      return c.json(presetToRecord(id, defs[presetKind(id)]))
    }
    if (!idParam.safeParse(id).success) throw notFound('No encontramos esa plantilla.')
    return c.json(await record(orgId, await findOwn(orgId, id)))
  })

  app.put('/:id', ...manage, async (c) => {
    const auth = c.get('auth')
    const id = c.req.param('id')
    if (isDocPresetId(id)) throw badRequest('Los diseños predefinidos no se editan: duplica uno para cambiarlo.', 'id', 'builtin_template')
    await requireFeature(auth.org.id, 'custom_templates')
    const body = await readBody(c, saveSchema)
    const current = await findOwn(auth.org.id, id)
    const { template } = await checked(c, auth.org.id, { ...(body.template as object), id }, current.kind)
    const result = await updateTemplate(deps.db, { orgId: auth.org.id, id, userId: auth.user.id, template, expectedVersion: body.version, now: deps.now() })
    if (!result.ok) {
      if (result.reason === 'not_found') throw notFound('No encontramos esa plantilla.')
      throw versionConflict(await record(auth.org.id, result.current))
    }
    return c.json(await record(auth.org.id, result.stored))
  })

  app.post('/:id/ops', ...manage, async (c) => {
    const auth = c.get('auth')
    const id = c.req.param('id')
    if (isDocPresetId(id)) throw badRequest('Los diseños predefinidos no se editan: duplica uno para cambiarlo.', 'id', 'builtin_template')
    await requireFeature(auth.org.id, 'custom_templates')
    const body = await readBody(c, opsSchema)
    const locale = localeOf(c)
    const parsed = parseDocOps(body.ops)
    if (!parsed.ok) throw invalidTemplate(parsed.issues, locale)
    // Sin versión (asistente): se aplica sobre la vigente y se reintenta si otro guardó en medio.
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await findOwn(auth.org.id, id)
      if (body.version !== undefined && body.version !== current.version) throw versionConflict(await record(auth.org.id, current))
      const applied = applyDocOps(current.template, parsed.ops, { mode: 'atomic' })
      const issues = applied.issues.map((i) => ({ ...i, message: docIssueMessage(i, locale) }))
      if (!applied.ok || hasDocErrors(applied.issues)) throw invalidTemplate(applied.issues, locale)
      const summary = summarizeDocOps(parsed.ops, { locale, template: current.template })
      if (!applied.changed) return c.json({ template: await record(auth.org.id, current), applied: applied.applied, changed: false, issues, summary })
      const owned = await enforceTemplateAssets(deps.db, auth.org.id, applied.result)
      const saved = await updateTemplate(deps.db, { orgId: auth.org.id, id, userId: auth.user.id, template: owned.template, expectedVersion: current.version, now: deps.now() })
      if (saved.ok) {
        // El editor guarda a cada cambio: sólo el asistente deja huella en la actividad.
        if (currentDispatchMeta()) {
          await logActivity(deps.db, {
            orgId: auth.org.id,
            actor: { userId: auth.user.id, name: auth.user.name },
            kind: 'template.updated',
            text: `${summary} · «${saved.stored.name}»`,
            link: `/documentos?plantilla=${id}`,
            subject: { type: 'org', id: auth.org.id },
            meta: { templateId: id, ops: parsed.ops.length },
          })
        }
        return c.json({ template: await record(auth.org.id, saved.stored), applied: applied.applied, changed: true, issues: [...issues, ...owned.issues], summary })
      }
      if (saved.reason === 'not_found') throw notFound('No encontramos esa plantilla.')
      if (body.version !== undefined) throw versionConflict(await record(auth.org.id, saved.current))
    }
    throw conflict('version_conflict', 'La plantilla cambió varias veces mientras aplicábamos los cambios. Vuelve a intentarlo.')
  })

  app.post('/:id/duplicate', ...manage, async (c) => {
    const auth = c.get('auth')
    await requireFeature(auth.org.id, 'custom_templates')
    const id = c.req.param('id')
    const body = await readBody(c, duplicateSchema)
    const source = isDocPresetId(id) ? getDocPreset(id) : (await findOwn(auth.org.id, id)).template
    await assertRoom(auth.org.id, source.kind)
    const copyName = body.name ?? copyNameFor(source.name, localeOf(c))
    const template: DocTemplate = { ...source, name: copyName.slice(0, TEMPLATE_LIMITS.nameMax), ...(isDocPresetId(id) ? { presetId: id } : {}) }
    const final = await checked(c, auth.org.id, template, source.kind)
    const stored = await insertTemplate(deps.db, { orgId: auth.org.id, userId: auth.user.id, template: final.template, now: deps.now() })
    await logActivity(deps.db, {
      orgId: auth.org.id,
      actor: { userId: auth.user.id, name: auth.user.name },
      kind: 'template.created',
      text: `${auth.user.name} duplicó «${source.name}»`,
      link: `/documentos?plantilla=${stored.id}`,
      subject: { type: 'org', id: auth.org.id },
      meta: { templateId: stored.id, from: id },
    })
    return c.json(await record(auth.org.id, stored), 201)
  })

  app.delete('/:id', ...manage, async (c) => {
    const auth = c.get('auth')
    const id = c.req.param('id')
    if (isDocPresetId(id)) throw badRequest('Los diseños predefinidos no se pueden borrar.', 'id', 'builtin_template')
    const before = await defaults(auth.org.id)
    const removed = await softDeleteTemplate(deps.db, auth.org.id, id, deps.now())
    if (!removed) throw notFound('No encontramos esa plantilla. Puede que ya esté borrada.')
    let defaultReset: { kind: DocTemplateKind; next: string } | undefined
    if (before[removed.kind] === id) {
      const next = removed.presetId ?? (removed.kind === 'quote' ? DEFAULT_QUOTE_PRESET_ID : DEFAULT_CATALOG_PRESET_ID)
      await setDefaultTemplate(deps.db, auth.org.id, removed.kind, next, deps.now())
      defaultReset = { kind: removed.kind, next }
    }
    await logActivity(deps.db, {
      orgId: auth.org.id,
      actor: { userId: auth.user.id, name: auth.user.name },
      kind: 'template.deleted',
      text: `${auth.user.name} borró la plantilla «${removed.name}»`,
      link: '/documentos',
      subject: { type: 'org', id: auth.org.id },
      meta: { templateId: id },
    })
    return c.json({ template: storedToRecord(removed, undefined), ...(defaultReset ? { defaultReset } : {}) })
  })

  app.post('/:id/restore', ...manage, async (c) => {
    const auth = c.get('auth')
    const id = c.req.param('id')
    const body = await readBody(c, restoreSchema)
    // El tope por tipo vale también al deshacer un borrado (si no, borrar → crear → restaurar lo esquiva).
    const deleted = await getTemplate(deps.db, auth.org.id, id, { includeDeleted: true })
    if (deleted?.deletedAt) await assertRoom(auth.org.id, deleted.kind)
    const restored = await restoreTemplate(deps.db, auth.org.id, id, deps.now())
    if (!restored) throw notFound('No encontramos esa plantilla borrada.')
    if (body.makeDefault) await setDefaultTemplate(deps.db, auth.org.id, restored.kind, restored.id, deps.now())
    return c.json(await record(auth.org.id, restored))
  })

  return app
}

const COPY_SUFFIX: Record<string, string> = { es: 'copia', en: 'copy', pt: 'cópia', fr: 'copie', de: 'Kopie', it: 'copia', tr: 'kopya' }

/** «Luz (copia)» en el idioma de quien duplica. */
export function copyNameFor(name: string, locale: string): string {
  const suffix = COPY_SUFFIX[locale] ?? COPY_SUFFIX.es
  return `${name} (${suffix})`
}
