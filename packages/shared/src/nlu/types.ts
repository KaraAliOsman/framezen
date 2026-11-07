/**
 * Tipos públicos del intérprete local (NLU). Ver `createNlu` en `./nlu.ts`.
 */
import type { QuoteStatus } from '../api'
import type { ToolRisk } from '../assistant-v2'
import type { GlossaryApi } from '../i18n/glossary'
import type { Locale } from '../i18n/locales'
import type { NluCommandId, NluToolCall } from './commands'
import type { NluFrecency } from './frecency'

// ── Datos que recibe ────────────────────────────────────────────────────────

export interface NluCatalogLine {
  id: string
  name: string
  kind?: 'casement' | 'sliding'
  brand?: string
  /** Tipologías que fabrica (para sugerir y avisar si no fabrica la pedida). */
  typologyIds?: readonly string[]
  /** Colores disponibles en la línea (filtra sugerencias de color). */
  colorIds?: readonly string[]
}

export interface NluCatalogColor {
  id: string
  name: string
  code?: string
  /** Id de textura integrada (`BUILTIN_TEXTURE_IDS`) si la tiene: ayuda a reconocer «nogal» = nut_tree. */
  textureId?: string
  /** Color propio de la organización (TEXUP). */
  custom?: boolean
}

export interface NluCatalogGlass {
  id: string
  name: string
  /** `GlassKind` del motor: dvh, mono, laminated, tempered, other. */
  kind?: string
  thickness?: number
  composition?: string
}

/** Catálogo efectivo de la organización (solo lo habilitado). */
export interface NluCatalog {
  /** Cambia cuando cambia el catálogo (memoiza los índices). */
  version?: string | number
  lines?: readonly NluCatalogLine[]
  colors?: readonly NluCatalogColor[]
  glass?: readonly NluCatalogGlass[]
}

export interface NluClientRef {
  id: string
  name: string
  email?: string
  phone?: string
  rut?: string
  city?: string
}

export interface NluQuoteRef {
  id: string
  number?: number
  title?: string
  clientName?: string
  status?: QuoteStatus
  updatedAt?: string
}

export interface NluTemplateRef {
  id: string
  name: string
  kind?: 'quote' | 'catalog'
  preset?: boolean
}

export interface NluAssistantRef {
  id: string
  name: string
}

/** Entidades autorizadas de la organización (las que la persona puede ver). */
export interface NluEntities {
  version?: string | number
  clients?: readonly NluClientRef[]
  quotes?: readonly NluQuoteRef[]
  templates?: readonly NluTemplateRef[]
  assistants?: readonly NluAssistantRef[]
}

export interface NluOptions {
  /** Idioma de la interfaz: interpretaciones, respuestas y etiquetas salen en este idioma. */
  locale: Locale
  catalog?: NluCatalog
  entities?: NluEntities
  /**
   * Glosario para nombres de dominio (tipologías, estados, vidrios). En la web pasa
   * `createGlossaryHelpers(webGlossary)`; en el servidor, `createGlossaryHelpers(glossary)`.
   * Sin glosario se usan los nombres en español.
   */
  glossary?: GlossaryApi
  /** Uso reciente para ordenar sugerencias (persistido por quien llama). */
  frecency?: NluFrecency
  /** Moneda de la empresa para respuestas de estadísticas (CLP por defecto). */
  currency?: string
  /** Zona horaria del negocio para «este mes», «hoy»… (America/Santiago por defecto). */
  timeZone?: string
}

// ── Contexto por consulta ───────────────────────────────────────────────────

export interface NluItemRef {
  id: string
  /** «V1», «V2»… */
  ref: string
  typology?: string
  qty?: number
  location?: string
}

export interface NluStatsQuote {
  id: string
  number?: number
  title?: string
  clientName?: string
  status: QuoteStatus | string
  /** Total con impuestos (del motor). */
  total?: number
  createdAt: string
  sentAt?: string
  acceptedAt?: string
  items?: readonly { typology?: string; qty?: number }[]
}

export interface NluStatsData {
  quotes: readonly NluStatsQuote[]
  /** false = solo un subconjunto reciente (la respuesta lo dice). */
  complete?: boolean
}

export interface NluContext {
  route?: string
  /** Hay una cotización editable abierta. */
  quoteOpen?: boolean
  quoteId?: string
  selectedItemId?: string
  /** Ref del ítem seleccionado («V2»). */
  selectedRef?: string
  /** Ítems de la cotización abierta (para refs, «todas» y conteos). */
  items?: readonly NluItemRef[]
  /** Datos para responder estadísticas sin servidor. */
  stats?: NluStatsData
  /** Nombres de asistentes que se pueden usar como vocativo («Sofía, agrega…»). */
  assistantNames?: readonly string[]
  /** Momento de referencia (pruebas); por defecto, ahora. */
  now?: Date | string | number
}

// ── Resultado del análisis ──────────────────────────────────────────────────

/**
 * - `ready`: plan completo, se puede ejecutar con Enter (gratis).
 * - `incomplete`: se reconoció el comando pero falta un dato (ver `missing`); completar localmente.
 * - `ambiguous`: hay varias lecturas o entidades posibles (ver `missing[].choices` y `repairs`).
 * - `invalid`: se entendió pero el valor no sirve (descuento 150 %, monto en vez de %…); ver `reply`.
 * - `answer`: respuesta determinista sin herramientas (ayuda, estadísticas, catálogo); ver `reply`.
 * - `unmatched`: no es un comando local → al enviar, va al asistente con IA.
 */
export type NluStatus = 'ready' | 'incomplete' | 'ambiguous' | 'invalid' | 'answer' | 'unmatched'

export type NluSlotKind =
  | 'typology'
  | 'panels'
  | 'size'
  | 'width'
  | 'height'
  | 'quantity'
  | 'color'
  | 'glass'
  | 'line'
  | 'percent'
  | 'quote'
  | 'client'
  | 'template'
  | 'assistant'
  | 'locale'
  | 'theme'
  | 'mode'
  | 'title'
  | 'name'
  | 'text'
  | 'item'
  | 'nav'
  | 'status'
  | 'change'

export interface NluSlot {
  kind: NluSlotKind
  /** Etiqueta localizada («alto», «cliente»…). */
  label: string
  /** Pregunta o pista localizada («Falta el alto: 1.500 × ___ mm»). */
  prompt: string
  choices?: NluSuggestion[]
}

/** Reparación sugerida: texto completo alternativo que sí se entiende. */
export interface NluRepair {
  label: string
  text: string
}

export interface NluSpan {
  start: number
  end: number
  kind: 'action' | 'object' | 'value' | 'entity' | 'number' | 'literal' | 'filler' | 'unknown'
  concept?: string
}

export interface NluClauseResult {
  status: NluStatus
  command?: NluCommandId
  calls: NluToolCall[]
  confidence: number
  summary: string
  missing: NluSlot[]
  repairs: NluRepair[]
  assumptions: string[]
  reply?: string
  /** Posición en el texto original. */
  start: number
  end: number
}

export interface NluParseResult {
  status: NluStatus
  /** Comando principal (el de la primera cláusula). */
  command?: NluCommandId
  /** Llamadas a ejecutar; `null` si no está listo. Vacío en `answer`. */
  plan: NluToolCall[] | null
  /** 0..1 heurístico (no es una probabilidad). */
  confidence: number
  /** «Entendí: …» localizado (vacío si no se entendió). */
  interpretation: string
  /** La interpretación sin el prefijo. */
  summary: string
  missing: NluSlot[]
  repairs: NluRepair[]
  /** Supuestos visibles («Tomé 60 × 120 como centímetros»). */
  assumptions: string[]
  /** Respuesta determinista (ayuda, estadísticas, dudas). */
  reply?: string
  /** Idioma detectado del texto (null = indeterminado). */
  language: Locale | null
  clauses: NluClauseResult[]
  spans: NluSpan[]
  /** Palabras que no se entendieron (para mostrarlas sin ignorarlas en silencio). */
  ignored: string[]
  /** Riesgo del plan (el mayor de sus llamadas). */
  risk: ToolRisk
}

// ── Autocompletado ──────────────────────────────────────────────────────────

export type NluSuggestionKind =
  | 'command'
  | 'typology'
  | 'color'
  | 'glass'
  | 'line'
  | 'client'
  | 'quote'
  | 'template'
  | 'assistant'
  | 'nav'
  | 'locale'
  | 'theme'
  | 'mode'
  | 'accessory'
  | 'period'
  | 'value'
  | 'hint'

export interface NluSuggestion {
  kind: NluSuggestionKind
  /** Título localizado. */
  label: string
  /** Detalle secundario (código, composición, cliente, N°…). */
  detail?: string
  /** Texto que reemplaza `replace` (vacío en las pistas `hint`, que no se insertan). */
  insertText: string
  /** Rango del texto original que se reemplaza [inicio, fin). */
  replace: [number, number]
  /** Id canónico (comando, tipología, entidad…). */
  id?: string
  /** El texto resultante ya es un comando listo (navegar, deshacer…). */
  canExecute?: boolean
  /** Clave de uso reciente (`kind:id`). */
  key: string
  score: number
}

export interface NluCompletion {
  /** Continuación literal tras el cursor (solo si es clara, el cursor está al final y no hay ambigüedad). */
  ghost?: string
  items: NluSuggestion[]
  /** Rango de la palabra en curso. */
  replace: [number, number]
}

export type { NluCommandId, NluToolCall }
