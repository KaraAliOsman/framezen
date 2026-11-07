import type { Catalog } from '@dekopen/engine'
import { TYPOLOGY_IDS } from '../src/index'

/** Integridad referencial de un catálogo (ids únicos y referencias existentes). */
export function catalogProblems(catalog: Catalog): string[] {
  const problems: string[] = []
  const unique = (label: string, ids: string[]) => {
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) problems.push(`${label} duplicado: ${id}`)
      seen.add(id)
    }
    return seen
  }
  const colors = unique('color', catalog.colors.map((c) => c.id))
  const brands = unique('marca', catalog.brands.map((b) => b.id))
  const profiles = unique('perfil', catalog.profiles.map((p) => p.id))
  const items = unique('ítem', catalog.items.map((i) => i.id))
  unique('vidrio', catalog.glass.map((g) => g.id))
  const lines = unique('línea', catalog.lines.map((l) => l.id))
  for (const line of catalog.lines) {
    if (!brands.has(line.brandId)) problems.push(`línea ${line.id} con marca inexistente`)
    for (const [role, id] of Object.entries(line.profiles)) if (!profiles.has(id!)) problems.push(`línea ${line.id}: rol ${role} → ${id} no existe`)
    if (line.sashInProfileId && !profiles.has(line.sashInProfileId)) problems.push(`línea ${line.id}: hoja interior inexistente`)
    for (const colorId of line.colorIds) if (!colors.has(colorId)) problems.push(`línea ${line.id}: color ${colorId} no existe`)
    for (const typology of line.typologyIds) if (!(TYPOLOGY_IDS as readonly string[]).includes(typology)) problems.push(`línea ${line.id}: tipología ${typology}`)
    for (const rule of [...line.hardwareRules, ...line.accessoryRules]) {
      if (!items.has(rule.itemId)) problems.push(`línea ${line.id}: regla ${rule.id} → ${rule.itemId}`)
      for (const [colorId, itemId] of Object.entries(rule.byColor ?? {})) {
        if (!items.has(itemId)) problems.push(`línea ${line.id}: regla ${rule.id} (${colorId}) → ${itemId}`)
      }
    }
    for (const key of ['weld', 'frameDeduction', 'sashWidth', 'sashDeduction', 'sashOverlap', 'glassGap', 'mullionDeduction'] as const) {
      if (!(line.pauta[key] > 0)) problems.push(`línea ${line.id}: pauta.${key} = ${line.pauta[key]}`)
    }
  }
  for (const profile of catalog.profiles) {
    if (!lines.has(profile.lineId)) problems.push(`perfil ${profile.id} con línea inexistente`)
    if (profile.reinforcementId && !profiles.has(profile.reinforcementId)) problems.push(`perfil ${profile.id}: refuerzo inexistente`)
    for (const colorId of Object.keys(profile.priceByColor)) if (!colors.has(colorId)) problems.push(`perfil ${profile.id}: color ${colorId}`)
  }
  for (const item of catalog.items) if (!brands.has(item.brandId)) problems.push(`ítem ${item.id} con marca inexistente`)
  for (const settings of catalog.brandSettings) if (!brands.has(settings.brandId)) problems.push(`ajustes de marca inexistente ${settings.brandId}`)
  return problems
}
