/**
 * Diferencias entre dos plantillas, para mostrar lo que propone la IA antes de aplicarlo (y el
 * resumen de un cambio grande). Pura: devuelve datos; la interfaz los traduce.
 */
import { PALETTE_ROLES, docJsonEqual, type DocSection, type DocTemplate, type PaletteRole } from '@dekopen/shared'

export type TemplateChange =
  | { kind: 'name'; before: string; after: string }
  | { kind: 'color'; role: PaletteRole; before: string; after: string }
  | { kind: 'fonts'; before: DocTemplate['theme']['fonts']; after: DocTemplate['theme']['fonts'] }
  | { kind: 'theme'; key: Exclude<keyof DocTemplate['theme'], 'palette' | 'fonts'>; before: string | number; after: string | number }
  | { kind: 'page'; key: keyof DocTemplate['page']; before: unknown; after: unknown }
  | { kind: 'sectionAdded'; section: DocSection }
  | { kind: 'sectionRemoved'; section: DocSection }
  | { kind: 'sectionShown'; section: DocSection }
  | { kind: 'sectionHidden'; section: DocSection }
  | { kind: 'sectionChanged'; section: DocSection; before: DocSection; keys: string[] }
  | { kind: 'order' }

const THEME_SCALARS = ['headingWeight', 'labelCase', 'density', 'typeScale', 'radius', 'rules', 'accentUsage', 'drawingStyle', 'imageTreatment'] as const

export function diffTemplates(before: DocTemplate, after: DocTemplate): TemplateChange[] {
  const out: TemplateChange[] = []
  if (before.name !== after.name) out.push({ kind: 'name', before: before.name, after: after.name })
  for (const role of PALETTE_ROLES) {
    const a = before.theme.palette[role].toUpperCase()
    const b = after.theme.palette[role].toUpperCase()
    if (a !== b) out.push({ kind: 'color', role, before: a, after: b })
  }
  if (!docJsonEqual(before.theme.fonts, after.theme.fonts)) out.push({ kind: 'fonts', before: before.theme.fonts, after: after.theme.fonts })
  for (const key of THEME_SCALARS) {
    if (before.theme[key] !== after.theme[key]) out.push({ kind: 'theme', key, before: before.theme[key], after: after.theme[key] })
  }
  for (const key of Object.keys(after.page) as (keyof DocTemplate['page'])[]) {
    if (!docJsonEqual(before.page[key], after.page[key])) out.push({ kind: 'page', key, before: before.page[key], after: after.page[key] })
  }
  const beforeById = new Map(before.sections.map((s) => [s.id, s]))
  const afterById = new Map(after.sections.map((s) => [s.id, s]))
  for (const s of after.sections) {
    const old = beforeById.get(s.id)
    if (!old || old.type !== s.type) {
      out.push({ kind: 'sectionAdded', section: s })
      continue
    }
    if (old.enabled !== s.enabled) out.push({ kind: s.enabled ? 'sectionShown' : 'sectionHidden', section: s })
    const keys = changedKeys(old, s)
    if (keys.length) out.push({ kind: 'sectionChanged', section: s, before: old, keys })
  }
  for (const s of before.sections) {
    const now = afterById.get(s.id)
    if (!now || now.type !== s.type) out.push({ kind: 'sectionRemoved', section: s })
  }
  const keptBefore = before.sections.filter((s) => afterById.get(s.id)?.type === s.type).map((s) => s.id)
  const keptAfter = after.sections.filter((s) => beforeById.get(s.id)?.type === s.type).map((s) => s.id)
  if (keptBefore.join('|') !== keptAfter.join('|')) out.push({ kind: 'order' })
  return out
}

/** Opciones (y título, fondo, salto) que cambiaron en una sección. */
function changedKeys(a: DocSection, b: DocSection): string[] {
  const keys: string[] = []
  for (const k of ['title', 'tone', 'pageBreak'] as const) if (a[k] !== b[k]) keys.push(k)
  const ao = a.options as Record<string, unknown>
  const bo = b.options as Record<string, unknown>
  for (const k of new Set([...Object.keys(ao), ...Object.keys(bo)])) if (!docJsonEqual(ao[k], bo[k])) keys.push(k)
  return keys
}

/** Cuenta para el resumen («8 cambios»). */
export function changeCount(changes: readonly TemplateChange[]): number {
  return changes.length
}
