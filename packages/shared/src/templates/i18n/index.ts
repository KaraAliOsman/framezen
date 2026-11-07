/**
 * Diccionario del sistema de plantillas en 7 idiomas (es fuente) y traductor mínimo con
 * interpolación `{param}`. Independiente del i18n general para no acoplar el orden de carga; las
 * llaves son estables y la UI puede envolverlas con su propio traductor si lo prefiere.
 */
import { es, type TemplateMessages } from './es'
import { en } from './en'
import { pt } from './pt'
import { fr } from './fr'
import { de } from './de'
import { it } from './it'
import { tr } from './tr'
import { DEFAULT_DOC_LOCALE, isDocLocale, type DocLocale } from '../locales'
import type { DocIssue, DocIssueParams } from '../issues'
import type { DocPresetId } from '../preset-ids'

export type { TemplateMessages } from './es'

export const TEMPLATE_MESSAGES: Readonly<Record<DocLocale, TemplateMessages>> = { es, en, pt, fr, de, it, tr }

export function templateMessages(locale: unknown = DEFAULT_DOC_LOCALE): TemplateMessages {
  return TEMPLATE_MESSAGES[isDocLocale(locale) ? locale : DEFAULT_DOC_LOCALE]
}

/** Reemplaza `{param}` por su valor; los `{…}` sin valor quedan tal cual. */
export function interpolateTemplateText(text: string, params?: DocIssueParams): string {
  if (!params) return text
  return text.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (whole, key: string) => (Object.hasOwn(params, key) ? String(params[key]) : whole))
}

const pick = (dict: Readonly<Record<string, string>>, key: unknown): string | undefined =>
  typeof key === 'string' && Object.hasOwn(dict, key) ? dict[key] : undefined

export function sectionLabel(type: string, locale?: unknown): string {
  return pick(templateMessages(locale).sections, type) ?? type
}

export function variantLabel(variant: string, locale?: unknown): string {
  return pick(templateMessages(locale).variants, variant) ?? variant
}

export function textFieldLabel(field: string, locale?: unknown): string {
  return pick(templateMessages(locale).textFields, field) ?? field
}

export function paletteRoleLabel(role: string, locale?: unknown): string {
  return pick(templateMessages(locale).paletteRoles, role) ?? role
}

export function toneLabel(tone: string, locale?: unknown): string {
  return pick(templateMessages(locale).tones, tone) ?? tone
}

export function docLocaleLabel(code: string, locale?: unknown): string {
  return pick(templateMessages(locale).locales, code) ?? code
}

export function presetName(id: DocPresetId, locale?: unknown): string {
  return templateMessages(locale).presets[id].name
}

export function presetDescription(id: DocPresetId, locale?: unknown): string {
  return templateMessages(locale).presets[id].description
}

/** Parámetros con ids traducidos a etiquetas legibles según el código del problema. */
function localizeIssueParams(issue: Pick<DocIssue, 'code' | 'params'>, m: TemplateMessages): DocIssueParams | undefined {
  const p = issue.params
  if (!p) return p
  const out: DocIssueParams = { ...p }
  if (typeof p.section === 'string') out.section = pick(m.sections, p.section) ?? p.section
  if (typeof p.kind === 'string') out.kind = pick(m.kinds, p.kind) ?? p.kind
  if (typeof p.reason === 'string') out.reason = pick(m.unsafeReasons, p.reason) ?? p.reason
  if (typeof p.variant === 'string') out.variant = pick(m.variants, p.variant) ?? p.variant
  if (typeof p.option === 'string') out.option = pick(m.options, p.option) ?? p.option
  if (typeof p.fg === 'string') out.fg = pick(m.paletteRoles, p.fg) ?? p.fg
  if (typeof p.bg === 'string') out.bg = pick(m.paletteRoles, p.bg) ?? p.bg
  if (typeof p.role === 'string') {
    out.role = issue.code === 'font_role' ? (pick(m.fontRoles, p.role) ?? p.role) : (pick(m.paletteRoles, p.role) ?? p.role)
  }
  if (typeof p.tone === 'string') out.tone = pick(m.tones, p.tone) ?? p.tone
  if (typeof p.field === 'string') out.field = pick(m.textFields, p.field) ?? p.field
  return out
}

/** Mensaje de un problema en el idioma pedido. */
export function docIssueMessage(issue: Pick<DocIssue, 'code' | 'params'>, locale?: unknown): string {
  const m = templateMessages(locale)
  const template = pick(m.issues, issue.code) ?? m.issues.invalid_value
  return interpolateTemplateText(template, localizeIssueParams(issue, m))
}

/** Completa `message` (español) en una lista de problemas. */
export function withMessages(issues: DocIssue[]): DocIssue[] {
  for (const i of issues) if (!i.message) i.message = docIssueMessage(i, 'es')
  return issues
}

/** Traductor genérico para resúmenes de operaciones (`ops.*` / `resetScopes.*`). */
export function docOpText(locale: unknown, group: 'ops' | 'resetScopes', key: string, params?: DocIssueParams): string {
  const m = templateMessages(locale)
  const dict = m[group] as Readonly<Record<string, string>>
  return interpolateTemplateText(pick(dict, key) ?? key, params)
}
