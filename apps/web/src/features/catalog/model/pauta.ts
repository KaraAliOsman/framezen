/**
 * Pauta de corte explicada para personas: qué es cada valor, a qué parte de la ventana afecta y
 * un ejemplo con medidas calculadas por el motor real (nunca fórmulas propias de la interfaz).
 */
import { computeBom, createDesign, type Catalog, type CutPiece, type Line, type Pauta } from '@dekopen/engine'
import type { Locale } from '@dekopen/shared'
import { translate } from '../../../lib/i18n'
import { patchLineInCatalog, type LinePatch } from '../api'
import es from '../i18n/es'

export type PautaKey = 'weld' | 'frameDeduction' | 'sashOverlap' | 'sashWidth' | 'sashDeduction' | 'glassGap' | 'mullionDeduction'
export type ReinforcementKey = 'frame' | 'sash' | 'mullion'

export interface PautaFieldCopy {
  key: PautaKey
  label: string
  /** Qué mide, en una frase de taller. */
  help: string
  /** Regla corta («medida + 2 × soldadura»). */
  rule: string
}

/** Valores de la pauta en el orden en que se editan. */
export const PAUTA_KEYS: readonly PautaKey[] = ['frameDeduction', 'sashOverlap', 'sashWidth', 'sashDeduction', 'glassGap', 'weld', 'mullionDeduction']
export const REINFORCEMENT_KEYS: readonly ReinforcementKey[] = ['frame', 'sash', 'mullion']

/** Campos de la pauta con su explicación, en el idioma de la interfaz (o el indicado). */
export function pautaFields(locale?: Locale): PautaFieldCopy[] {
  return PAUTA_KEYS.map((key) => ({
    key,
    label: translate(es, `pauta.field.${key}.label`, undefined, locale),
    help: translate(es, `pauta.field.${key}.help`, undefined, locale),
    rule: translate(es, `pauta.field.${key}.rule`, undefined, locale),
  }))
}

export function reinforcementFields(locale?: Locale): { key: ReinforcementKey; label: string; help: string }[] {
  return REINFORCEMENT_KEYS.map((key) => ({
    key,
    label: translate(es, `pauta.steel.${key}.label`, undefined, locale),
    help: translate(es, `pauta.steel.${key}.help`, undefined, locale),
  }))
}

export interface PautaMeasure {
  id: string
  label: string
  /** Medida calculada por el motor (mm). */
  value: number
  /** Regla que la explica. */
  rule: string
  /** Valores de la pauta que la afectan (para resaltarlos). */
  uses: (PautaKey | `reinforcement.${ReinforcementKey}`)[]
  /** Ancho × alto, para vidrios. */
  size?: { width: number; height: number }
}

export interface PautaExample {
  title: string
  width: number
  height: number
  measures: PautaMeasure[]
}

const findCut = (cuts: CutPiece[], test: (c: CutPiece) => boolean) => cuts.find(test)

type MeasureId = keyof (typeof es)['pauta']['measure']

/** Medidas de una ventana de ejemplo con la pauta indicada, calculadas por `computeBom`. */
export function pautaExample(catalog: Catalog, line: Line, patch: LinePatch = {}, locale?: Locale): PautaExample | null {
  const copy = (id: MeasureId) => ({
    label: translate(es, `pauta.measure.${id}.label`, undefined, locale),
    rule: translate(es, `pauta.measure.${id}.rule`, undefined, locale),
  })
  const cat = patchLineInCatalog(catalog, line.id, patch)
  const colorId = line.colorIds[0] ?? catalog.colors[0]?.id ?? 'blanco'
  const glassId = catalog.glass.find((g) => g.kind === 'dvh')?.id ?? catalog.glass[0]?.id ?? 'vidrio'
  const measures: PautaMeasure[] = []
  try {
    if (line.kind === 'sliding') {
      const width = 1500
      const height = 1200
      const bom = computeBom(createDesign('sliding_2', { lineId: line.id, width, height, colorId, glassId }), cat)
      const frame = findCut(bom.cuts, (c) => c.kind === 'profile' && c.nodeId === 'frame' && c.role !== 'guide' && c.role !== 'threshold')
      const sashW = findCut(bom.cuts, (c) => c.kind === 'profile' && c.role === 'sliding_sash' && (c.side === 'top' || c.side === 'bottom'))
      const sashH = findCut(bom.cuts, (c) => c.kind === 'profile' && c.role === 'sliding_sash' && (c.side === 'left' || c.side === 'right'))
      const glass = bom.glass[0]
      if (frame) measures.push({ id: 'frame', ...copy('frame'), value: frame.length, uses: ['weld'] })
      if (sashW) measures.push({ id: 'sash-w', ...copy('sashW'), value: sashW.length, uses: ['frameDeduction', 'sashOverlap', 'sashWidth', 'weld'] })
      if (sashH) measures.push({ id: 'sash-h', ...copy('sashH'), value: sashH.length, uses: ['frameDeduction', 'sashOverlap', 'weld'] })
      if (glass) measures.push({ id: 'glass', ...copy('slidingGlass'), value: glass.width, size: { width: glass.width, height: glass.height }, uses: ['sashDeduction', 'glassGap'] })
      return { title: translate(es, 'pauta.titleSliding', undefined, locale), width, height, measures }
    }
    const width = 1200
    const height = 1200
    const bom = computeBom(createDesign('casement', { lineId: line.id, width, height, colorId, glassId }), cat)
    const fixedBom = computeBom(createDesign('fixed', { lineId: line.id, width, height, colorId, glassId }), cat)
    const frame = findCut(bom.cuts, (c) => c.kind === 'profile' && c.nodeId === 'frame' && c.role === 'frame')
    const sash = findCut(bom.cuts, (c) => c.kind === 'profile' && c.nodeId !== 'frame' && (c.role === 'sash' || c.role === 'door_sash'))
    const bead = findCut(bom.cuts, (c) => c.kind === 'bead' && c.nodeId !== 'frame')
    const frameSteel = findCut(bom.cuts, (c) => c.kind === 'reinforcement' && c.nodeId === 'frame')
    const sashSteel = findCut(bom.cuts, (c) => c.kind === 'reinforcement' && c.nodeId !== 'frame')
    const glass = bom.glass[0]
    const fixedGlass = fixedBom.glass[0]
    if (frame) measures.push({ id: 'frame', ...copy('frame'), value: frame.length, uses: ['weld'] })
    if (fixedGlass) measures.push({ id: 'fixed-glass', ...copy('fixedGlass'), value: fixedGlass.width, size: { width: fixedGlass.width, height: fixedGlass.height }, uses: ['frameDeduction', 'glassGap'] })
    if (sash) measures.push({ id: 'sash', ...copy('sash'), value: sash.length, uses: ['frameDeduction', 'sashOverlap', 'weld'] })
    if (glass) measures.push({ id: 'glass', ...copy('glass'), value: glass.width, size: { width: glass.width, height: glass.height }, uses: ['frameDeduction', 'sashOverlap', 'sashDeduction', 'glassGap'] })
    if (bead) measures.push({ id: 'bead', ...copy('bead'), value: bead.length, uses: ['sashDeduction'] })
    if (frameSteel) measures.push({ id: 'frame-steel', ...copy('frameSteel'), value: frameSteel.length, uses: ['reinforcement.frame'] })
    if (sashSteel) measures.push({ id: 'sash-steel', ...copy('sashSteel'), value: sashSteel.length, uses: ['reinforcement.sash'] })
    return { title: translate(es, 'pauta.titleCasement', undefined, locale), width, height, measures }
  } catch {
    return null
  }
}

/** Una pauta parcial (puertas, hoja interior) mezclada sobre la base, solo con las claves presentes. */
export function presentKeys(p: Partial<Pauta> | undefined): PautaKey[] {
  if (!p) return []
  return PAUTA_KEYS.filter((k) => typeof p[k] === 'number')
}

/** Aplica un valor a una pauta (incluye los descuentos de refuerzo anidados). */
export function setPautaValue(pauta: Partial<Pauta>, key: PautaKey | `reinforcement.${ReinforcementKey}`, value: number | null): Partial<Pauta> {
  if (key.startsWith('reinforcement.')) {
    const sub = key.slice('reinforcement.'.length) as ReinforcementKey
    const reinforcement = { ...pauta.reinforcement }
    if (value === null) delete reinforcement[sub]
    else reinforcement[sub] = value
    return { ...pauta, reinforcement }
  }
  const next = { ...pauta }
  if (value === null) delete next[key as PautaKey]
  else next[key as PautaKey] = value
  return next
}

export function pautaValue(pauta: Partial<Pauta> | undefined, key: PautaKey | `reinforcement.${ReinforcementKey}`): number | undefined {
  if (!pauta) return undefined
  if (key.startsWith('reinforcement.')) return pauta.reinforcement?.[key.slice('reinforcement.'.length) as ReinforcementKey]
  return pauta[key as PautaKey]
}


const PAYLOAD_KEYS = ['weld', 'frameDeduction', 'sashWidth', 'sashDeduction', 'sashOverlap', 'glassGap', 'mullionDeduction', 'beadDeduction', 'slidingHeightAdd'] as const
const STEEL_KEYS: ReinforcementKey[] = ['frame', 'sash', 'mullion']

/** Máximo que acepta el servidor para cada valor de la pauta (mm). */
export function pautaMax(key: PautaKey | `reinforcement.${ReinforcementKey}`): number {
  if (key.startsWith('reinforcement.')) return 600
  return key === 'weld' ? 20 : key === 'glassGap' ? 50 : key === 'sashOverlap' ? 100 : 400
}

/**
 * Cuerpo para PATCH /api/catalog/lines/:id: todos los valores presentes y `null` en los que se
 * quitaron (el servidor los vuelve al de fábrica y no guarda los que ya son de fábrica).
 */
export function pautaPayload(draft: Partial<Pauta>, loaded: Partial<Pauta> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of PAYLOAD_KEYS) {
    const value = draft[key]
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
    else if (loaded?.[key] !== undefined) out[key] = null
  }
  if (draft.reinforcement || loaded?.reinforcement) {
    const steel: Record<string, number | null> = {}
    for (const key of STEEL_KEYS) {
      const value = draft.reinforcement?.[key]
      if (typeof value === 'number' && Number.isFinite(value)) steel[key] = value
      else if (loaded?.reinforcement?.[key] !== undefined) steel[key] = null
    }
    if (Object.keys(steel).length) out.reinforcement = steel
  }
  return out
}

/** Pauta de fábrica de una línea (el servidor la adjunta como `factory` cuando el taller la ajustó). */
export function factoryOf(line: Line & { factory?: { pauta: Pauta; doorPauta?: Partial<Pauta>; sashInPauta?: Partial<Pauta> } }): {
  pauta: Pauta
  doorPauta?: Partial<Pauta>
  sashInPauta?: Partial<Pauta>
} {
  return line.factory ?? { pauta: line.pauta, doorPauta: line.doorPauta, sashInPauta: line.sashInPauta }
}

/** Igualdad por valor (sin importar el orden de las claves). */
export function samePauta(a: Partial<Pauta> | undefined, b: Partial<Pauta> | undefined): boolean {
  const norm = (p: Partial<Pauta> | undefined) => JSON.stringify(pautaPayload(p ?? {}, undefined), Object.keys(pautaPayload(p ?? {}, undefined)).sort())
  const steel = (p: Partial<Pauta> | undefined) => STEEL_KEYS.map((k) => p?.reinforcement?.[k] ?? null).join(',')
  return norm(a) === norm(b) && steel(a) === steel(b)
}
