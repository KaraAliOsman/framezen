/**
 * Un BillingService por app (por AppDeps). El proveedor sale del entorno: Flow si hay
 * FLOW_API_KEY y FLOW_SECRET_KEY (y la config dice 'flow'); si no, 'dev'.
 * Las pruebas reemplazan el proveedor con setBillingGateway (Flow con fetch simulado).
 */
import type { AppDeps } from '../../context'
import { FlowClient, FLOW_PRODUCTION_URL } from './flow'
import { BillingService, type BillingGateway } from './service'

const services = new WeakMap<AppDeps, BillingService>()

/** Flow con las claves de la configuración (o del entorno, para configuraciones armadas a mano). */
export function gatewayFromEnv(deps: AppDeps, env: NodeJS.ProcessEnv = process.env): BillingGateway {
  const apiKey = deps.config.flowApiKey ?? env.FLOW_API_KEY
  const secretKey = deps.config.flowSecretKey ?? env.FLOW_SECRET_KEY
  if (deps.config.billingProvider === 'flow' && apiKey && secretKey) {
    const apiUrl = deps.config.flowApiUrl || env.FLOW_API_URL || FLOW_PRODUCTION_URL
    return { kind: 'flow', client: new FlowClient({ apiKey, secretKey, apiUrl }) }
  }
  return { kind: 'dev' }
}

export function billingFor(deps: AppDeps): BillingService {
  let service = services.get(deps)
  if (!service) {
    service = new BillingService(deps, gatewayFromEnv(deps))
    services.set(deps, service)
  }
  return service
}

/** Reemplaza el proveedor de cobro de una app (pruebas o configuración en caliente). */
export function setBillingGateway(deps: AppDeps, gateway: BillingGateway): BillingService {
  const service = new BillingService(deps, gateway)
  services.set(deps, service)
  return service
}
