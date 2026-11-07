/**
 * Ajustes de la empresa (PATCH /api/settings, solo quien administra). Valores por defecto, textos
 * de los documentos, idioma de los documentos e impuesto; los precios de venta son sensibles
 * (`update_pricing` siempre pide confirmación). Facturación, plan y equipo nunca.
 */
import { MARGIN_LIMITS } from '@dekopen/shared'
import type { AgentToolArgs, OrgSettings } from '@dekopen/shared'
import { resolveColor, resolveGlass, resolveLine } from '../resolve'
import { designEnv, ensureOk } from './common'
import { ToolFailure, type ToolContext, type ToolHandler, type UndoCheck } from './types'

const getSettingsTool: ToolHandler<'get_settings'> = async (ctx) => {
  const s = ensureOk(await ctx.call<OrgSettings>('settingsGet'))
  const env = await designEnv(ctx)
  const name = (list: { id: string; name: string }[], id?: string) => (id ? (list.find((x) => x.id === id)?.name ?? id) : undefined)
  return {
    ok: true,
    summary: ctx.text.t('done.get_settings'),
    data: {
      defaults: { line: name(env.catalog.lines, s.defaults.lineId), color: name(env.catalog.colors, s.defaults.colorId), glass: name(env.catalog.glass, s.defaults.glassId) },
      pricing: s.pricing,
      documents: {
        quoteTemplate: s.documents.quoteTemplate,
        catalogTemplate: s.documents.catalogTemplate,
        validityDays: s.documents.validityDays,
        intro: s.documents.intro?.slice(0, 400),
        conditions: s.documents.conditions?.slice(0, 400),
        paymentTerms: s.documents.paymentTerms?.slice(0, 300),
        warranty: s.documents.warranty?.slice(0, 300),
        leadTime: s.documents.leadTimeText?.slice(0, 200),
      },
      documentLocale: s.locale,
      currency: s.currency,
      taxLabel: s.taxLabel,
    },
  }
}

type Change = { field: string; label: string; before?: string; after?: string }

async function patchSettings(ctx: ToolContext, patch: Record<string, unknown>, previous: Record<string, unknown>, changes: Change[], kind: 'update_settings' | 'update_pricing') {
  const t = ctx.text
  if (!changes.length) return { ok: true, summary: t.t(`done.${kind}`, { changes: t.t('change.nothing') }), data: { changed: false } }
  if (ctx.dryRun) {
    const title = t.t(`propose.${kind}`)
    return {
      ok: true,
      summary: title,
      preview: { title, lines: [], changes, ...(kind === 'update_pricing' ? { irreversible: t.t('irreversible.prices') } : {}) },
      affected: [{ type: 'settings' as const }],
    }
  }
  const after = ensureOk(await ctx.call<OrgSettings>('settingsPatch', { body: patch }))
  // Deshacer solo si nadie cambió después ESTOS campos (los ajustes no tienen versión).
  const checks: UndoCheck[] = []
  for (const [key, value] of Object.entries(patch)) {
    const saved = (after as unknown as Record<string, unknown>)[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const sub of Object.keys(value)) checks.push({ path: [key, sub], value: (saved as Record<string, unknown> | undefined)?.[sub] ?? null })
    } else checks.push({ path: [key], value: saved ?? null })
  }
  return {
    ok: true,
    summary: t.t(`done.${kind}`, { changes: t.list(changes.map((c) => c.label)) }),
    data: { changed: changes.map((c) => ({ field: c.field, after: c.after })) },
    affected: [{ type: 'settings' as const }],
    undo: {
      method: 'PATCH' as const,
      path: '/api/settings',
      route: 'settingsPatch' as const,
      body: previous,
      entity: { type: 'settings' as const },
      expect: { route: 'settingsGet' as const, checks },
    },
  }
}

const updateSettings: ToolHandler<'update_settings'> = async (ctx, args) => {
  const t = ctx.text
  const s = ensureOk(await ctx.call<OrgSettings>('settingsGet'))
  const env = await designEnv(ctx)
  const changes: Change[] = []
  const patch: Record<string, unknown> = {}
  const previous: Record<string, unknown> = {}
  const defaults: Record<string, string> = {}
  const prevDefaults: Record<string, string | null> = {}
  const nameIn = (list: { id: string; name: string }[], id?: string) => (id ? (list.find((x) => x.id === id)?.name ?? id) : '—')

  if (args.default_line) {
    const { line, missed } = resolveLine(env.catalog, args.default_line)
    if (!line || missed) throw new ToolFailure('not_found', `Line "${args.default_line}" not found.`)
    if (line.id !== s.defaults.lineId) {
      defaults.lineId = line.id
      prevDefaults.lineId = s.defaults.lineId ?? null
      changes.push({ field: 'defaultLine', label: t.t('field.defaultLine'), before: nameIn(env.catalog.lines, s.defaults.lineId), after: line.name })
    }
  }
  if (args.default_color) {
    const color = resolveColor(env.catalog, args.default_color)
    if (!color) throw new ToolFailure('not_found', `Colour "${args.default_color}" not found.`)
    if (color.id !== s.defaults.colorId) {
      defaults.colorId = color.id
      prevDefaults.colorId = s.defaults.colorId ?? null
      changes.push({ field: 'defaultColor', label: t.t('field.defaultColor'), before: nameIn(env.catalog.colors, s.defaults.colorId), after: color.name })
    }
  }
  if (args.default_glass) {
    const glass = resolveGlass(env.catalog, args.default_glass, s.defaults.glassId)
    if (!glass) throw new ToolFailure('not_found', `Glass "${args.default_glass}" not found.`)
    if (glass.id !== s.defaults.glassId) {
      defaults.glassId = glass.id
      prevDefaults.glassId = s.defaults.glassId ?? null
      changes.push({ field: 'defaultGlass', label: t.t('field.defaultGlass'), before: nameIn(env.catalog.glass, s.defaults.glassId), after: glass.name })
    }
  }
  if (Object.keys(defaults).length) {
    patch.defaults = defaults
    previous.defaults = prevDefaults
  }

  const docFields = [
    ['validity_days', 'validityDays', 'validityDays'],
    ['intro', 'intro', 'intro'],
    ['conditions', 'conditions', 'conditions'],
    ['payment_terms', 'paymentTerms', 'paymentTerms'],
    ['warranty', 'warranty', 'warranty'],
    ['lead_time', 'leadTimeText', 'leadTime'],
    ['includes', 'includes', 'includes'],
    ['excludes', 'excludes', 'excludes'],
    ['footer', 'footer', 'footer'],
    ['signature_name', 'signatureName', 'signatureName'],
    ['paper', 'paper', 'paper'],
    ['show_unit_price', 'showUnitPrice', 'showUnitPrice'],
    ['show_area', 'showArea', 'showArea'],
    ['show_glass', 'showGlass', 'showGlass'],
    ['show_line', 'showLine', 'showLine'],
  ] as const
  const documents: Record<string, unknown> = {}
  const prevDocuments: Record<string, unknown> = {}
  for (const [arg, field, label] of docFields) {
    const value = args[arg]
    const before = (s.documents as unknown as Record<string, unknown>)[field]
    if (value === undefined || value === before) continue
    documents[field] = value
    prevDocuments[field] = before ?? ''
    const short = (v: unknown) => (typeof v === 'string' ? (v.length > 80 ? `${v.slice(0, 80)}…` : v || '—') : String(v ?? '—'))
    changes.push({ field: label, label: t.t(`field.${label}`), before: short(before), after: short(value) })
  }
  if (Object.keys(documents).length) {
    patch.documents = documents
    previous.documents = prevDocuments
  }
  const group = (name: 'cut' | 'sending', fields: readonly (readonly [keyof typeof args, string, Parameters<typeof t.t>[0]])[]) => {
    const current = s[name] as unknown as Record<string, unknown>
    const next: Record<string, unknown> = {}
    const prev: Record<string, unknown> = {}
    for (const [arg, field, label] of fields) {
      const value = args[arg]
      if (value === undefined || value === current[field]) continue
      next[field] = value
      prev[field] = current[field] ?? null
      changes.push({ field, label: t.t(label), before: String(current[field] ?? '—'), after: String(value) })
    }
    if (Object.keys(next).length) {
      patch[name] = next
      previous[name] = prev
    }
  }
  group('cut', [
    ['bar_length', 'barLength', 'field.barLength'],
    ['kerf', 'kerf', 'field.kerf'],
    ['trim_start', 'trimStart', 'field.trimStart'],
    ['trim_end', 'trimEnd', 'field.trimEnd'],
    ['min_reusable', 'minReusable', 'field.minReusable'],
  ])
  group('sending', [
    ['send_format', 'format', 'field.sendFormat'],
    ['portal_3d', 'portal3d', 'field.portal3d'],
    ['portal_ar', 'portalAr', 'field.portalAr'],
  ])
  const counters = [
    ['next_quote_number', 'nextQuoteNumber', 'field.nextQuoteNumber'],
    ['next_work_order_number', 'nextWorkOrderNumber', 'field.nextWorkOrderNumber'],
  ] as const
  for (const [arg, field, label] of counters) {
    const value = args[arg]
    const before = (s as unknown as Record<string, unknown>)[field]
    if (value === undefined || value === before) continue
    patch[field] = value
    previous[field] = before ?? value
    changes.push({ field, label: t.t(label), before: String(before ?? '—'), after: String(value) })
  }
  if (args.document_locale && args.document_locale !== s.locale) {
    patch.locale = args.document_locale
    previous.locale = s.locale ?? 'es'
    changes.push({ field: 'documentLocale', label: t.t('field.documentLocale'), before: s.locale ? t.language(s.locale) : '—', after: t.language(args.document_locale) })
  }
  if (args.tax_label && args.tax_label !== s.taxLabel) {
    patch.taxLabel = args.tax_label
    previous.taxLabel = s.taxLabel ?? 'IVA'
    changes.push({ field: 'taxLabel', label: t.t('field.taxLabel'), before: s.taxLabel ?? '—', after: args.tax_label })
  }
  return patchSettings(ctx, patch, previous, changes, 'update_settings')
}

const updatePricing: ToolHandler<'update_pricing'> = async (ctx, args) => {
  const t = ctx.text
  const s = ensureOk(await ctx.call<OrgSettings>('settingsGet'))
  const fields = [
    ['margin_mode', 'marginMode', 'marginMode'],
    ['margin_pct', 'marginPct', 'marginPct'],
    ['labor_per_m2', 'laborPerM2', 'laborPerM2'],
    ['install_mode', 'installMode', 'installMode'],
    ['install_value', 'installValue', 'installValue'],
    ['waste_pct', 'wastePct', 'wastePct'],
    ['round_to', 'roundTo', 'roundTo'],
    ['tax_pct', 'ivaPct', 'taxPct'],
  ] as const
  // Más de 95 % solo existe como recargo sobre el costo.
  if ((args.margin_pct ?? 0) > MARGIN_LIMITS.margin) args = { ...args, margin_mode: 'markup' }
  const pricing: Record<string, unknown> = {}
  const prevPricing: Record<string, unknown> = {}
  const changes: Change[] = []
  const show = (field: string, v: unknown) =>
    typeof v === 'number' ? (/Pct$/.test(field) ? t.fmt.pct(v) : field === 'roundTo' ? t.fmt.number(v) : t.fmt.money(v)) : String(v ?? '—')
  for (const [arg, field, label] of fields) {
    const value = args[arg]
    const before = (s.pricing as unknown as Record<string, unknown>)[field]
    if (value === undefined || value === before) continue
    pricing[field] = value
    prevPricing[field] = before
    changes.push({ field: label, label: t.t(`field.${label}`), before: show(field, before), after: show(field, value) })
  }
  const patch: Record<string, unknown> = Object.keys(pricing).length ? { pricing } : {}
  const previous: Record<string, unknown> = Object.keys(prevPricing).length ? { pricing: prevPricing } : {}
  if (args.currency && args.currency !== s.currency) {
    patch.currency = args.currency
    previous.currency = s.currency ?? 'CLP'
    changes.push({ field: 'currency', label: t.t('field.currency'), before: s.currency ?? 'CLP', after: args.currency })
  }
  return patchSettings(ctx, patch, previous, changes, 'update_pricing')
}

const COMPANY_FIELDS = [
  ['name', 'name', 'companyName'],
  ['legal_name', 'legalName', 'companyLegalName'],
  ['rut', 'rut', 'companyRut'],
  ['address', 'address', 'companyAddress'],
  ['city', 'city', 'companyCity'],
  ['phone', 'phone', 'companyPhone'],
  ['email', 'email', 'companyEmail'],
  ['website', 'website', 'companyWebsite'],
  ['accent', 'accent', 'companyAccent'],
] as const

/** Datos de la empresa (PATCH /api/org): misma validación y permisos que la pantalla de Empresa. */
const updateCompany: ToolHandler<'update_company'> = async (ctx, args) => {
  const t = ctx.text
  const org = ensureOk(await ctx.call<Record<string, unknown>>('orgGet'))
  const patch: Record<string, unknown> = {}
  const previous: Record<string, unknown> = {}
  const changes: Change[] = []
  for (const [arg, field, label] of COMPANY_FIELDS) {
    const value = args[arg]
    const before = org[field]
    if (value === undefined || value === before) continue
    patch[field] = value
    previous[field] = before ?? null
    changes.push({ field, label: t.t(`field.${label}`), before: typeof before === 'string' && before ? before : '—', after: value })
  }
  if (!changes.length) return { ok: true, summary: t.t('done.update_company', { changes: t.t('change.nothing') }), data: { changed: false } }
  if (ctx.dryRun) {
    const title = t.t('propose.update_company')
    return { ok: true, summary: title, preview: { title, lines: [], changes }, affected: [{ type: 'settings' as const }] }
  }
  const after = ensureOk(await ctx.call<Record<string, unknown>>('orgPatch', { body: patch }))
  return {
    ok: true,
    summary: t.t('done.update_company', { changes: t.list(changes.map((c) => c.label)) }),
    data: { changed: changes.map((c) => ({ field: c.field, after: c.after })) },
    affected: [{ type: 'settings' as const }],
    undo: {
      method: 'PATCH' as const,
      path: '/api/org',
      route: 'orgPatch' as const,
      body: previous,
      entity: { type: 'settings' as const },
      expect: { route: 'orgGet' as const, checks: Object.keys(patch).map((key) => ({ path: [key], value: after[key] ?? null })) },
    },
  }
}

export const SETTINGS_HANDLERS = {
  get_settings: getSettingsTool,
  update_settings: updateSettings,
  update_company: updateCompany,
  update_pricing: updatePricing,
} satisfies { [K in keyof AgentToolArgs]?: ToolHandler<K> }
