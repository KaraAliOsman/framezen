/**
 * Asistentes configurables por organización: nombre, aspecto, personalidad, modo por defecto,
 * alcances, idioma y visibilidad. Un asistente es configuración + un espacio de memoria; todos
 * comparten la misma política de seguridad (las instrucciones propias nunca la sobrepasan).
 */
import { z } from 'zod'
import { avatarSpecSchema, type AvatarSpec } from './avatar'
import {
  assistantLanguageSchema,
  assistantModeSchema,
  toolScopeSchema,
  TOOL_SCOPES,
  type AssistantLanguage,
  type AssistantMode,
  type ToolScope,
} from './policy'

export const ASSISTANT_LIMITS = {
  nameMax: 40,
  /** Instrucciones propias (prioridad menor que la política de seguridad). */
  instructionsMax: 2000,
} as const

/** Tono base; las instrucciones propias lo afinan. */
export const ASSISTANT_TONES = ['friendly', 'professional', 'concise', 'detailed', 'technical', 'enthusiastic'] as const
export type AssistantTone = (typeof ASSISTANT_TONES)[number]

export interface AssistantPersonality {
  tone: AssistantTone
  /** Texto libre (≤ 2000) tratado como preferencia de estilo, nunca como permiso. */
  instructions: string
}

export type AssistantVisibility = 'private' | 'shared'

export interface AssistantProfile {
  id: string
  name: string
  avatar: AvatarSpec
  personality: AssistantPersonality
  defaultMode: AssistantMode
  scopes: ToolScope[]
  language: AssistantLanguage
  /** 'private' = solo su dueño lo usa y lo ve; 'shared' = todo el equipo lo usa. */
  visibility: AssistantVisibility
  /** Dueño de un asistente privado. */
  ownerUserId?: string
  /** Usar y aprender memoria (la persona puede apagarlo). */
  memoryEnabled: boolean
  /** Asistente que se abre por defecto. */
  isDefault: boolean
  /** Control optimista; también identifica la configuración usada en cada acción (auditoría). */
  version: number
  createdAt: string
  updatedAt: string
  /** Calculado para quien pide: puede editarlo (dueño del privado o quien administra la empresa). */
  canEdit: boolean
}

export const DEFAULT_ASSISTANT_SCOPES: ToolScope[] = [...TOOL_SCOPES]

const personalitySchema = z
  .object({
    tone: z.enum(ASSISTANT_TONES),
    instructions: z.string().max(ASSISTANT_LIMITS.instructionsMax).default(''),
  })
  .strict()

const nameSchema = z.string().trim().min(1).max(ASSISTANT_LIMITS.nameMax)

/** POST /api/assistant/v2/assistants */
export const assistantCreateBodySchema = z
  .object({
    name: nameSchema,
    avatar: avatarSpecSchema,
    personality: personalitySchema.default({ tone: 'friendly', instructions: '' }),
    defaultMode: assistantModeSchema.default('supervised'),
    scopes: z.array(toolScopeSchema).max(TOOL_SCOPES.length).default(DEFAULT_ASSISTANT_SCOPES),
    language: assistantLanguageSchema.default('auto'),
    visibility: z.enum(['private', 'shared']).default('shared'),
    memoryEnabled: z.boolean().default(true),
    isDefault: z.boolean().default(false),
  })
  .strict()
export type AssistantCreateBody = z.input<typeof assistantCreateBodySchema>

/** PATCH /api/assistant/v2/assistants/:id (con `version` para no pisar cambios ajenos). */
export const assistantPatchBodySchema = z
  .object({
    version: z.number().int().min(1),
    name: nameSchema.optional(),
    avatar: avatarSpecSchema.optional(),
    personality: personalitySchema.optional(),
    defaultMode: assistantModeSchema.optional(),
    scopes: z.array(toolScopeSchema).max(TOOL_SCOPES.length).optional(),
    language: assistantLanguageSchema.optional(),
    visibility: z.enum(['private', 'shared']).optional(),
    memoryEnabled: z.boolean().optional(),
    isDefault: z.boolean().optional(),
  })
  .strict()
export type AssistantPatchBody = z.input<typeof assistantPatchBodySchema>

/** GET /api/assistant/v2/assistants */
export interface AssistantListResponse {
  items: AssistantProfile[]
  /** Tope del plan (limits.assistants) y cuántos hay (sin archivados). */
  limit: number
  used: number
}

/** DELETE /api/assistant/v2/assistants/:id → archivado (se puede deshacer). */
export interface AssistantDeleteResponse {
  ok: true
  /** Restaurar con PATCH { version, … } no aplica: usar POST …/assistants/:id/restore. */
  restorePath: string
}
