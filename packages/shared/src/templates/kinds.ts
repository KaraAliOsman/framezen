export const DOC_TEMPLATE_KINDS = ['quote', 'catalog'] as const
export type DocTemplateKind = (typeof DOC_TEMPLATE_KINDS)[number]
