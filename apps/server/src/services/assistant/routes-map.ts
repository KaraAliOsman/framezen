/**
 * Mapa FIJO herramienta → ruta REST. El agente nunca arma URLs: elige una de estas rutas (cada una
 * declarada con `defineDispatchRoute`, que prohíbe facturación, equipo, sesión, portal y el propio
 * asistente) y aporta parámetros validados. Así cada acción pasa por la misma sesión, permisos,
 * plan, modo lectura, validación, versiones y actividad que un clic en la web.
 *
 * Los datos para deshacer guardan la CLAVE de la ruta (nunca una ruta libre leída de la base).
 */
import { defineDispatchRoute, type DispatchRoute } from '../dispatch'

export const AGENT_ROUTES = {
  // Cotizaciones
  quotesList: defineDispatchRoute('GET', '/api/quotes'),
  quoteGet: defineDispatchRoute('GET', '/api/quotes/:id'),
  quoteCreate: defineDispatchRoute('POST', '/api/quotes'),
  quoteSave: defineDispatchRoute('PUT', '/api/quotes/:id'),
  quoteDuplicate: defineDispatchRoute('POST', '/api/quotes/:id/duplicate'),
  quoteDelete: defineDispatchRoute('DELETE', '/api/quotes/:id'),
  quoteRestore: defineDispatchRoute('POST', '/api/quotes/:id/restore'),
  quoteStatus: defineDispatchRoute('POST', '/api/quotes/:id/status'),
  quoteSend: defineDispatchRoute('POST', '/api/quotes/:id/send'),
  quoteFollowUp: defineDispatchRoute('POST', '/api/quotes/:id/follow-up'),
  quoteRevisions: defineDispatchRoute('GET', '/api/quotes/:id/revisions'),
  quotePayments: defineDispatchRoute('GET', '/api/quotes/:id/payments'),
  quotePaymentAdd: defineDispatchRoute('POST', '/api/quotes/:id/payments'),
  quotePaymentDelete: defineDispatchRoute('DELETE', '/api/quotes/:id/payments/:paymentId'),
  // Clientes
  clientsList: defineDispatchRoute('GET', '/api/clients'),
  clientGet: defineDispatchRoute('GET', '/api/clients/:id'),
  clientCreate: defineDispatchRoute('POST', '/api/clients'),
  clientPatch: defineDispatchRoute('PATCH', '/api/clients/:id'),
  clientDelete: defineDispatchRoute('DELETE', '/api/clients/:id'),
  clientRestore: defineDispatchRoute('POST', '/api/clients/:id/restore'),
  // Catálogo, precios, texturas y colores propios (TEXUP)
  catalogGet: defineDispatchRoute('GET', '/api/catalog'),
  pricesGet: defineDispatchRoute('GET', '/api/catalog/prices'),
  pricesPut: defineDispatchRoute('PUT', '/api/catalog/prices'),
  brandsGet: defineDispatchRoute('GET', '/api/catalog/brands'),
  brandPatch: defineDispatchRoute('PATCH', '/api/catalog/brands/:id'),
  linePatch: defineDispatchRoute('PATCH', '/api/catalog/lines/:id'),
  glassPatch: defineDispatchRoute('PATCH', '/api/catalog/glass/:id'),
  pricesImportCsv: defineDispatchRoute('POST', '/api/catalog/import-csv'),
  texturesList: defineDispatchRoute('GET', '/api/textures'),
  textureGet: defineDispatchRoute('GET', '/api/textures/:id'),
  texturePatch: defineDispatchRoute('PATCH', '/api/textures/:id'),
  textureDelete: defineDispatchRoute('DELETE', '/api/textures/:id'),
  textureRestore: defineDispatchRoute('POST', '/api/textures/:id/restore'),
  customColorsList: defineDispatchRoute('GET', '/api/catalog/colors'),
  customColorCreate: defineDispatchRoute('POST', '/api/catalog/colors'),
  customColorPatch: defineDispatchRoute('PATCH', '/api/catalog/colors/:id'),
  customColorDelete: defineDispatchRoute('DELETE', '/api/catalog/colors/:id'),
  customColorRestore: defineDispatchRoute('POST', '/api/catalog/colors/:id/restore'),
  // Plantillas (TPL-EDITOR)
  templatesList: defineDispatchRoute('GET', '/api/templates'),
  templateGet: defineDispatchRoute('GET', '/api/templates/:id'),
  templateCreate: defineDispatchRoute('POST', '/api/templates'),
  templateSave: defineDispatchRoute('PUT', '/api/templates/:id'),
  templateDelete: defineDispatchRoute('DELETE', '/api/templates/:id'),
  templateRestore: defineDispatchRoute('POST', '/api/templates/:id/restore'),
  templateOps: defineDispatchRoute('POST', '/api/templates/:id/ops'),
  templateGenerate: defineDispatchRoute('POST', '/api/templates/generate'),
  templateDefault: defineDispatchRoute('PUT', '/api/templates/default'),
  // Ajustes
  settingsGet: defineDispatchRoute('GET', '/api/settings'),
  settingsPatch: defineDispatchRoute('PATCH', '/api/settings'),
  orgGet: defineDispatchRoute('GET', '/api/org'),
  orgPatch: defineDispatchRoute('PATCH', '/api/org'),
  // Taller
  workOrdersList: defineDispatchRoute('GET', '/api/work-orders'),
  workOrderGet: defineDispatchRoute('GET', '/api/work-orders/:id'),
  workOrderCreate: defineDispatchRoute('POST', '/api/work-orders'),
  workOrderPatch: defineDispatchRoute('PATCH', '/api/work-orders/:id'),
  // Actividad
  activityList: defineDispatchRoute('GET', '/api/activity'),
  activityPatch: defineDispatchRoute('PATCH', '/api/activity/:id'),
} as const satisfies Record<string, DispatchRoute>

export type AgentRouteKey = keyof typeof AGENT_ROUTES

export function isAgentRouteKey(value: unknown): value is AgentRouteKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(AGENT_ROUTES, value)
}
