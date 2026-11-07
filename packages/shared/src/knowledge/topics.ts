/**
 * Temas de la base de conocimiento del asistente (manual de la app + oficio del PVC). Los ids son
 * estables: los usa la herramienta `help(topic)`, el intérprete local («ayuda con plantillas») y la
 * web para mostrar la ayuda. Agregar temas al final; nunca renombrar ni quitar.
 */
export const KNOWLEDGE_TOPIC_IDS = [
  'getting_started',
  'quotes',
  'quote_editor',
  'typologies',
  'openings',
  'shapes',
  'accessories',
  'colors_textures',
  'glass',
  'catalog_prices',
  'documents_templates',
  'document_ops',
  'client_portal',
  'clients',
  'workshop',
  'settings_languages',
  'plans_credits',
  'assistant',
  'pvc_basics',
  'trade_terms',
] as const

export type KnowledgeTopicId = (typeof KNOWLEDGE_TOPIC_IDS)[number]

export function isKnowledgeTopicId(value: unknown): value is KnowledgeTopicId {
  return typeof value === 'string' && (KNOWLEDGE_TOPIC_IDS as readonly string[]).includes(value)
}
