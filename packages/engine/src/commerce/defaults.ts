import type { BrandSettings, CutSettings, Id, PricingSettings } from '../types'

/** Ajustes de precio por defecto (SPEC §3): margen 40 % sobre venta, mano de obra $12.000/m². */
export const DEFAULT_PRICING: PricingSettings = Object.freeze({
  marginMode: 'margin',
  marginPct: 40,
  laborPerM2: 12000,
  installMode: 'none',
  installValue: 0,
  wastePct: 5,
  roundTo: 100,
  ivaPct: 19,
  chargeFullBars: false,
}) as PricingSettings

/** Sierra por defecto: barra de 5.800 mm, disco de 4 mm, sin despuntes, retazo útil desde 500 mm. */
export const DEFAULT_CUT: CutSettings = Object.freeze({
  barLength: 5800,
  kerf: 4,
  trimStart: 0,
  trimEnd: 0,
  minReusable: 500,
}) as CutSettings

/** Ajustes de una marca sin configurar: sin descuentos, disco 4 mm, sin despunte. */
export function defaultBrandSettings(brandId: Id): BrandSettings {
  return {
    brandId,
    enabled: true,
    trim: 0,
    kerf: 4,
    discounts: { profiles: 0, reinforcement: 0, hardware: 0, glass: 0, accessories: 0 },
  }
}

const MARGIN_MODES = new Set<PricingSettings['marginMode']>(['margin', 'markup'])
const INSTALL_MODES = new Set<PricingSettings['installMode']>(['none', 'per_m2', 'per_unit'])

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * Completa y sanea ajustes de precio: cualquier campo ausente o inválido toma el valor
 * por defecto. Nunca lanza.
 */
export function sanitizePricing(settings?: Partial<PricingSettings> | null): PricingSettings {
  const s = settings ?? {}
  const roundTo = finiteOr(s.roundTo, DEFAULT_PRICING.roundTo)
  return {
    marginMode: s.marginMode && MARGIN_MODES.has(s.marginMode) ? s.marginMode : DEFAULT_PRICING.marginMode,
    marginPct: finiteOr(s.marginPct, DEFAULT_PRICING.marginPct),
    laborPerM2: Math.max(0, finiteOr(s.laborPerM2, DEFAULT_PRICING.laborPerM2)),
    installMode: s.installMode && INSTALL_MODES.has(s.installMode) ? s.installMode : DEFAULT_PRICING.installMode,
    installValue: Math.max(0, finiteOr(s.installValue, DEFAULT_PRICING.installValue)),
    wastePct: Math.max(0, finiteOr(s.wastePct, DEFAULT_PRICING.wastePct)),
    roundTo: (roundTo > 0 ? roundTo : 1) as PricingSettings['roundTo'],
    ivaPct: Math.max(0, finiteOr(s.ivaPct, DEFAULT_PRICING.ivaPct)),
    chargeFullBars: typeof s.chargeFullBars === 'boolean' ? s.chargeFullBars : DEFAULT_PRICING.chargeFullBars,
  }
}

/**
 * Ajustes efectivos de una cotización: los de la organización con los de la cotización
 * encima (solo los campos definidos).
 */
export function resolvePricing(base: Partial<PricingSettings> | undefined, override?: Partial<PricingSettings> | null): PricingSettings {
  const merged: Partial<PricingSettings> = { ...(base ?? {}) }
  if (override) {
    for (const [key, value] of Object.entries(override) as [keyof PricingSettings, unknown][]) {
      if (value !== undefined && value !== null) (merged as Record<string, unknown>)[key] = value
    }
  }
  return sanitizePricing(merged)
}

/** Completa y sanea ajustes de corte (valores negativos → 0, barra inválida → 5.800). */
export function sanitizeCut(cut?: Partial<CutSettings> | null): CutSettings {
  const c = cut ?? {}
  const barLength = finiteOr(c.barLength, DEFAULT_CUT.barLength)
  return {
    barLength: barLength > 0 ? barLength : DEFAULT_CUT.barLength,
    kerf: Math.max(0, finiteOr(c.kerf, DEFAULT_CUT.kerf)),
    trimStart: Math.max(0, finiteOr(c.trimStart, DEFAULT_CUT.trimStart)),
    trimEnd: Math.max(0, finiteOr(c.trimEnd, DEFAULT_CUT.trimEnd)),
    minReusable: Math.max(0, finiteOr(c.minReusable, DEFAULT_CUT.minReusable)),
  }
}
