import type { KnowledgeTopicId } from './topics'

/** Título y resumen visibles de cada tema (un archivo por idioma; tsc exige todos los temas). */
export type KnowledgeCopy = Record<KnowledgeTopicId, { title: string; summary: string }>
