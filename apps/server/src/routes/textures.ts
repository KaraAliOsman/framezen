/**
 * Texturas propias (foliados) — montado en /api/textures (con sesión y modo lectura; ver app.ts).
 *
 * Cuerpo: JSON con la foto en base64 (data URL), no multipart. Motivos: la defensa CSRF de toda la
 * API exige `application/json` (un formulario de otro sitio no puede enviarlo sin preflight), el
 * mismo cuerpo sirve para la web, el asistente y la API, y el tope de 15 MB de esta ruta (app.ts,
 * aplicado mientras llega el cuerpo) cubre una foto de 10 MiB codificada (+33 %). La foto se
 * reconoce por sus bytes (nunca por el tipo declarado), se decodifica con límites y nunca se
 * guarda tal cual: solo la tesela procesada y su miniatura.
 *
 *   GET    /                    TextureListResponse
 *   GET    /resolve?ids=a,b     TextureResolveResponse (data URLs para dibujar; máx. 100)
 *   POST   /                    { dataUrl, name?, useAi?, preview?, …ajustes }
 *                               preview → TexturePreviewResponse (borrador); si no → TextureCommitResponse
 *   POST   /drafts/:id          ajustes → TexturePreviewResponse
 *   POST   /drafts/:id/commit   { name?, color?, …ajustes } → TextureCommitResponse
 *   DELETE /drafts/:id          { ok }
 *   GET    /:id                 TextureAssetWithData
 *   GET    /:id/image[?variant=thumb]  imagen (nosniff, CSP sandbox, ETag, caché privada inmutable)
 *   PATCH  /:id                 TexturePatchBody → TextureAsset
 *   DELETE /:id                 TextureDeleteResponse (borrado suave; deshacer = restore)
 *   POST   /:id/restore         TextureAsset
 *
 * Permisos: leer, cualquiera de la organización; subir, cambiar y borrar, quien administra el
 * catálogo (dueño, o todos si el plan no tiene roles). Subir requiere la función del plan
 * `texture_upload` (Pro y superiores; la prueba la tiene): sin ella responde 402 `plan_required` y
 * todo lo ya subido sigue funcionando (límite suave). La IA de visión es opcional y cobra créditos.
 */
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import {
  FEATURE_COPY,
  textureDraftCommitSchema,
  texturePatchBodySchema,
  textureProcessOptionsShape,
  textureUploadRequestSchema,
  type TextureResolveResponse,
} from '@dekopen/shared'
import type { AppDeps, AppEnv } from '../context'
import { HttpError, apiError } from '../lib/errors'
import { pageParams, readBody } from '../lib/http'
import { localeOf } from '../lib/i18n'
import { rateLimited } from '../lib/keyed-limiter'
import { requireManager, requireWritable } from '../middleware/auth'
import { aiConfigFromEnv } from '../services/ai/config'
import { assetHttpHeaders, decodeImageDataUrl } from '../services/assets'
import { getBillingState } from '../services/billing'
import { TextureDraftStore } from '../services/textures/drafts'
import { TexturePipelineBusy, TextureRejected } from '../services/textures/pipeline'
import { TextureService, type TextureServiceOptions } from '../services/textures/service'

export type TextureRouteOptions = TextureServiceOptions

const REJECT_MESSAGES: Record<TextureRejected['reason'], string> = {
  format: 'Ese archivo no es una foto PNG, JPG o WEBP. Exporta la foto en uno de esos formatos y vuelve a intentarlo.',
  animated: 'Las imágenes animadas no sirven como textura. Usa una foto fija del foliado.',
  decode: 'No pudimos leer la foto completa (puede estar cortada o dañada). Prueba con otra copia.',
  too_large: 'La foto pesa más de 10 MB. Prueba con una versión más liviana.',
  too_many_pixels: 'La foto tiene demasiados píxeles (máximo 24 megapíxeles). Prueba con una versión más chica.',
  too_small: 'La foto es demasiado chica para hacer una textura. Usa una de al menos 256 píxeles por lado.',
}

function rejection(error: TextureRejected): HttpError {
  const code = error.status === 413 ? 'asset_too_large' : error.status === 422 ? 'texture_too_small' : 'asset_unsupported'
  return new HttpError(error.status, code, REJECT_MESSAGES[error.reason], 'dataUrl', { reason: error.reason })
}

/** Errores del pipeline → respuestas HTTP con mensaje claro (y motivo estable en `reason`). */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof TextureRejected) throw rejection(error)
    if (error instanceof TexturePipelineBusy) throw rateLimited({ retryAfterSec: 3 }, 'Estamos procesando varias fotos a la vez. Reintenta en unos segundos.')
    throw error
  }
}

const adjustSchema = z.object({ ...textureProcessOptionsShape, useAi: z.boolean().optional() }).strict()

export function textureRoutes(deps: AppDeps, options: TextureRouteOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>()
  const service = new TextureService(deps, {
    ai: options.ai ?? (() => aiConfigFromEnv(process.env)),
    fetch: options.fetch,
    drafts: options.drafts ?? new TextureDraftStore({ now: () => deps.now().getTime() }),
  })
  const write = [requireWritable(deps), requireManager(deps)] as const

  /** Función del plan para subir (límite suave: se explica y se ofrece mejorar). */
  async function requireUploadFeature(c: Context<AppEnv>): Promise<void> {
    const billing = await getBillingState(deps.db, c.get('auth').org.id, deps.config.billingProvider, deps.now())
    if (billing.features.includes('texture_upload')) return
    const copy = FEATURE_COPY.texture_upload
    throw apiError(402, 'plan_required', { extra: { feature: 'texture_upload', plan: copy.plan, upgrade: '/ajustes/plan' } })
  }

  /** Topes: subidas por organización por hora y procesamientos por persona por minuto. */
  function takeQuota(c: Context<AppEnv>, kind: 'upload' | 'process'): void {
    const { org, user } = c.get('auth')
    const result =
      kind === 'upload'
        ? deps.limits.keyed.take(`texture-upload:org:${org.id}`, { limit: 40, windowMs: 60 * 60_000 })
        : deps.limits.keyed.take(`texture-process:user:${user.id}`, { limit: 60, windowMs: 60_000 })
    if (!result.ok) throw rateLimited(result)
  }

  app.get('/', async (c) => c.json(await service.list(c.get('auth').org.id, pageParams(c, { limit: 100 }))))

  app.get('/resolve', async (c) => {
    const ids = (c.req.query('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    const body: TextureResolveResponse = { textures: await service.resolve(c.get('auth').org.id, ids) }
    return c.json(body)
  })

  app.post('/', ...write, async (c) => {
    await requireUploadFeature(c)
    const body = await readBody(c, textureUploadRequestSchema)
    const decoded = decodeImageDataUrl(body.dataUrl)
    if (!decoded) throw rejection(new TextureRejected('format', 'data URL'))
    takeQuota(c, 'upload')
    const { dataUrl: _dataUrl, ...rest } = body
    void _dataUrl
    const result = await guarded(() => service.upload(c.get('auth'), localeOf(c), { ...rest, bytes: decoded.bytes }))
    return c.json(result, 'draft' in result ? 200 : 201)
  })

  app.post('/drafts/:id', ...write, async (c) => {
    await requireUploadFeature(c)
    const body = await readBody(c, adjustSchema)
    takeQuota(c, 'process')
    return c.json(await guarded(() => service.adjust(c.get('auth'), localeOf(c), c.req.param('id'), body)))
  })

  app.post('/drafts/:id/commit', ...write, async (c) => {
    await requireUploadFeature(c)
    const body = await readBody(c, textureDraftCommitSchema)
    takeQuota(c, 'process')
    return c.json(await guarded(() => service.commit(c.get('auth'), localeOf(c), c.req.param('id'), body)), 201)
  })

  app.delete('/drafts/:id', async (c) => c.json({ ok: service.discard(c.get('auth'), c.req.param('id')) }))

  app.get('/:id', async (c) => c.json(await service.get(c.get('auth').org.id, c.req.param('id'))))

  app.get('/:id/image', async (c) => {
    const variant = c.req.query('variant') === 'thumb' ? 'thumb' : 'tile'
    const { asset, bytes } = await service.image(c.get('auth').org.id, c.req.param('id'), variant)
    const headers = assetHttpHeaders(asset)
    if (c.req.header('if-none-match') === headers.ETag) return c.body(null, 304, { ETag: headers.ETag, 'Cache-Control': headers['Cache-Control']! })
    return c.body(Uint8Array.from(bytes), 200, headers)
  })

  app.patch('/:id', ...write, async (c) => {
    const body = await readBody(c, texturePatchBodySchema)
    return c.json(await service.patch(c.get('auth'), c.req.param('id'), body))
  })

  app.delete('/:id', ...write, async (c) => c.json(await service.remove(c.get('auth'), c.req.param('id'))))

  app.post('/:id/restore', ...write, async (c) => c.json(await service.restore(c.get('auth'), c.req.param('id'))))

  return app
}
