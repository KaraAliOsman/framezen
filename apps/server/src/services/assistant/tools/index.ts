/**
 * Registro completo herramienta → manejador. tsc exige un manejador para CADA herramienta del
 * registro compartido (`AGENT_TOOL_NAMES`): agregar una herramienta sin manejador no compila.
 */
import { CATALOG_HANDLERS } from './catalog'
import { CLIENT_HANDLERS } from './clients'
import { CORE_HANDLERS } from './core'
import { DOCUMENT_HANDLERS } from './documents'
import { ITEM_HANDLERS } from './items'
import { OPERATION_HANDLERS } from './operations'
import { PANE_HANDLERS } from './panes'
import { QUOTE_HANDLERS } from './quotes'
import { SETTINGS_HANDLERS } from './settings'
import type { ToolHandlers } from './types'
import { WORKSHOP_STATS_HANDLERS } from './workshop-stats'

export const TOOL_HANDLERS: ToolHandlers = {
  ...QUOTE_HANDLERS,
  ...ITEM_HANDLERS,
  ...PANE_HANDLERS,
  ...CLIENT_HANDLERS,
  ...CATALOG_HANDLERS,
  ...DOCUMENT_HANDLERS,
  ...SETTINGS_HANDLERS,
  ...WORKSHOP_STATS_HANDLERS,
  ...OPERATION_HANDLERS,
  ...CORE_HANDLERS,
}

export * from './types'
