/**
 * Modos, alcances y niveles de riesgo del asistente v2, y la política que los cruza.
 *
 * La política vive en el SERVIDOR (nunca en el prompt): el modelo solo ve las herramientas que el
 * modo permite y cada llamada vuelve a pasar por `toolDecision` antes de ejecutarse.
 *
 * | Riesgo        | Chat     | Supervisado | Acceso total |
 * |---------------|----------|-------------|--------------|
 * | read          | ejecuta  | ejecuta     | ejecuta      |
 * | write         | —        | propone     | ejecuta (deshacer) |
 * | external      | —        | propone     | pide confirmación |
 * | production    | —        | propone     | pide confirmación |
 * | destructive   | —        | propone     | pide confirmación |
 *
 * Las herramientas de interfaz (navegar, abrir editores, idioma, tema) y la memoria explícita están
 * disponibles en los tres modos: no cambian datos del negocio.
 */
import { z } from 'zod'
import { LOCALES, type Locale } from '../i18n/locales'

export const ASSISTANT_MODES = ['chat', 'supervised', 'full'] as const
export type AssistantMode = (typeof ASSISTANT_MODES)[number]
export const DEFAULT_ASSISTANT_MODE: AssistantMode = 'supervised'

/** Ámbitos del negocio que un asistente puede tocar (los elige quien lo configura). */
export const TOOL_SCOPES = ['quotes', 'clients', 'catalog', 'documents', 'settings', 'workshop', 'stats'] as const
export type ToolScope = (typeof TOOL_SCOPES)[number]

export const TOOL_RISKS = ['read', 'write', 'external', 'production', 'destructive'] as const
export type ToolRisk = (typeof TOOL_RISKS)[number]

/** Dónde corre una herramienta: en el servidor (rutas REST) o en el navegador (interfaz). */
export const TOOL_KINDS = ['server', 'ui'] as const
export type ToolKind = (typeof TOOL_KINDS)[number]

/** Qué hace el servidor con una llamada según modo y riesgo. */
export type ToolDecision = 'execute' | 'approve' | 'deny'

/** Decisión para una herramienta de negocio (`kind: 'server'`). Las de interfaz siempre se ejecutan. */
export function toolDecision(mode: AssistantMode, risk: ToolRisk, kind: ToolKind = 'server'): ToolDecision {
  if (kind === 'ui') return 'execute'
  if (risk === 'read') return 'execute'
  if (mode === 'chat') return 'deny'
  if (mode === 'supervised') return 'approve'
  return risk === 'write' ? 'execute' : 'approve'
}

/** ¿Se le ofrece la herramienta al modelo en este modo? (Chat no ve ninguna que cambie datos.) */
export function toolOffered(mode: AssistantMode, risk: ToolRisk, kind: ToolKind = 'server'): boolean {
  return toolDecision(mode, risk, kind) !== 'deny'
}

/** Orden de permisividad: un modo pedido nunca supera el máximo permitido. */
const MODE_RANK: Record<AssistantMode, number> = { chat: 0, supervised: 1, full: 2 }

/** El modo efectivo es el menor entre el pedido y el tope (plan, rol, asistente). */
export function clampMode(requested: AssistantMode, ceiling: AssistantMode): AssistantMode {
  return MODE_RANK[requested] <= MODE_RANK[ceiling] ? requested : ceiling
}

export const assistantModeSchema = z.enum(ASSISTANT_MODES)
export const toolScopeSchema = z.enum(TOOL_SCOPES)
export const toolRiskSchema = z.enum(TOOL_RISKS)

/** Idioma de la interfaz en los contratos del asistente (= `Locale` de i18n). */
export type AssistantLocale = Locale
export const assistantLocaleSchema = z.enum(LOCALES)

/** Idioma de un asistente: 'auto' sigue el idioma de la interfaz de cada persona. */
export const ASSISTANT_LANGUAGES = ['auto', ...LOCALES] as const
export type AssistantLanguage = (typeof ASSISTANT_LANGUAGES)[number]
export const assistantLanguageSchema = z.enum(ASSISTANT_LANGUAGES)
