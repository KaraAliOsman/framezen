/**
 * Intérprete local de comandos de DEKOPEN (7 idiomas, sin costo de API) y su autocompletado.
 * Uso: `const nlu = createNlu({ locale, catalog, entities, glossary, frecency, currency, timeZone })`;
 * `nlu.parse(texto, ctx)` → plan / respuesta / slots faltantes; `nlu.complete(texto, cursor, ctx)` →
 * texto fantasma + lista. Todo lo que no calza (`status: 'unmatched'`) va al asistente con IA.
 */
export { createNlu, type Nlu } from './nlu'
export { assemblyLabel } from './clause'
export { createFrecency as createNluFrecency, type NluFrecency, type NluFrecencySnapshot } from './frecency'
export {
  NLU_COMMAND_IDS,
  NLU_NEEDS_OPEN_QUOTE,
  NLU_SETTINGS_SECTIONS,
  NLU_TOOL_NAMES,
  NLU_TOOLS,
  isNluTool,
  planRisk as nluPlanRisk,
  type NluCatalogSection,
  type NluCommandId,
  type NluDesignArgs,
  type NluExecutor,
  type NluExtras,
  type NluItemTarget,
  type NluQuoteTarget,
  type NluSettingsSection,
  type NluToolArgs,
  type NluToolCall,
  type NluToolMeta,
  type NluToolName,
} from './commands'
export { nluMessages } from './messages'
export { MAX_COMMAND_LENGTH as NLU_MAX_COMMAND_LENGTH } from './text'
export type {
  NluAssistantRef,
  NluCatalog,
  NluCatalogColor,
  NluCatalogGlass,
  NluCatalogLine,
  NluClauseResult,
  NluClientRef,
  NluCompletion,
  NluContext,
  NluEntities,
  NluItemRef,
  NluOptions,
  NluParseResult,
  NluQuoteRef,
  NluRepair,
  NluSlot,
  NluSlotKind,
  NluSpan,
  NluStatsData,
  NluStatsQuote,
  NluStatus,
  NluSuggestion,
  NluSuggestionKind,
  NluTemplateRef,
} from './types'
