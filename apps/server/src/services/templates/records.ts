/**
 * Forma pública de una plantilla (`DocTemplateRecord`, contrato en @dekopen/shared/api) para la
 * web y el asistente: plantillas propias y diseños predefinidos con la misma forma.
 */
import {
  DOC_PRESET_IDS,
  getDocPreset,
  presetKind,
  type DocPresetId,
  type DocTemplateKind,
  type DocTemplateRecord,
} from '@dekopen/shared'
import type { StoredTemplate } from './store'

export function storedToRecord(stored: StoredTemplate, defaultId: string | undefined): DocTemplateRecord {
  const notes = stored.issues.filter((i) => i.severity !== 'error')
  return {
    id: stored.id,
    kind: stored.kind,
    name: stored.name,
    presetId: stored.presetId,
    builtin: false,
    version: stored.version,
    template: stored.template,
    isDefault: stored.id === defaultId,
    createdAt: stored.createdAt.toISOString(),
    updatedAt: stored.updatedAt.toISOString(),
    ...(notes.length ? { issues: notes } : {}),
  }
}

export function presetToRecord(id: DocPresetId, defaultId: string | undefined): DocTemplateRecord {
  const template = getDocPreset(id)
  return { id, kind: template.kind, name: template.name, presetId: id, builtin: true, version: 0, template, isDefault: id === defaultId }
}

export function presetRecords(kind: DocTemplateKind, defaultId: string | undefined): DocTemplateRecord[] {
  return DOC_PRESET_IDS.filter((id) => presetKind(id) === kind).map((id) => presetToRecord(id, defaultId))
}
