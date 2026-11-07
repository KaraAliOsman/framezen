/**
 * Llaves de Flow del taller (/api/settings/payments/flow). Solo se escriben: ninguna respuesta las
 * devuelve, ni enmascaradas.
 */
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppDeps, AppEnv } from '../context'
import { HttpError } from '../lib/errors'
import { readBody } from '../lib/http'
import { requireManager, requireWritable } from '../middleware/auth'
import { flowKeysStatus, removeFlowKeys, saveFlowKeys } from '../services/payments'

const key = (label: string) => z.string({ error: `Falta la ${label}.` }).trim().min(16, `Esa ${label} parece incompleta.`).max(200, `Esa ${label} es demasiado larga.`)

const flowKeysSchema = z.object({ apiKey: key('API Key'), secretKey: key('Secret Key'), sandbox: z.boolean().default(false) })

export function paymentSettingsRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>()
  const manager = [requireWritable(deps), requireManager(deps)] as const

  app.get('/flow', requireManager(deps), async (c) => c.json(await flowKeysStatus(deps, c.get('auth').org.id)))

  app.put('/flow', ...manager, async (c) => {
    if (!deps.config.paymentKeysSecret) throw new HttpError(503, 'payment_keys_off', 'Este servidor todavía no puede guardar llaves de pago.')
    const body = await readBody(c, flowKeysSchema)
    const orgId = c.get('auth').org.id
    await saveFlowKeys(deps, orgId, body)
    return c.json(await flowKeysStatus(deps, orgId))
  })

  app.delete('/flow', ...manager, async (c) => {
    const orgId = c.get('auth').org.id
    await removeFlowKeys(deps, orgId)
    return c.json(await flowKeysStatus(deps, orgId))
  })

  return app
}
