/**
 * Controles del inspector de una sección, derivados del esquema compartido (SECTION_OPTION_SCHEMAS)
 * para no repetir a mano las opciones de cada tipo: si DOCSCHEMA agrega una opción, aparece sola.
 * Pura: describe campos (tipo, valores permitidos, visibilidad); la interfaz los dibuja y traduce.
 */
import {
  DRAWING_SIZES,
  LAYOUT_RULES,
  SECTION_OPTION_SCHEMAS,
  type DocSection,
  type DocSectionType,
  type DrawingSize,
} from '@dekopen/shared'

export type SectionField =
  | { kind: 'switch'; key: string }
  | { kind: 'choice'; key: string; values: readonly string[]; disabled?: readonly string[] }
  | { kind: 'number-choice'; key: string; values: readonly number[]; disabled?: readonly number[] }
  | { kind: 'number'; key: string; min: number; max: number }
  | { kind: 'multi'; key: string; values: readonly string[]; min: number }
  | { kind: 'text'; key: string; max: number }
  | { kind: 'richtext'; key: string; optional: boolean }
  | { kind: 'image'; key: string }
  | { kind: 'images'; key: string; max: number }

/** Lo mínimo que se lee de un esquema zod v4 (`schema.def`), sin depender de zod en la web. */
type Schema = object
type Def = { type: string; [k: string]: unknown }
const defOf = (s: Schema): Def => (s as { def: Def }).def

function unwrap(s: Schema): { schema: Schema; optional: boolean } {
  let schema = s
  let optional = false
  for (;;) {
    const d = defOf(schema)
    if (d.type === 'optional' || d.type === 'nullable') {
      optional = true
      schema = d.innerType as Schema
      continue
    }
    return { schema, optional }
  }
}

function arrayBounds(s: Schema): { min: number; max: number } {
  const checks = (defOf(s).checks as { _zod: { def: { check: string; minimum?: number; maximum?: number } } }[] | undefined) ?? []
  const min = checks.find((c) => c._zod.def.check === 'min_length')?._zod.def.minimum ?? 0
  const max = checks.find((c) => c._zod.def.check === 'max_length')?._zod.def.maximum ?? 99
  return { min, max }
}

/** Orden en que se muestran (lo más usado arriba); lo no listado va al final en el orden del esquema. */
const ORDER = [
  'variant',
  'columns',
  'drawingSize',
  'drawingStyle',
  'drawingView',
  'drawingDimensions',
  'title',
  'subtitle',
  'assetId',
  'content',
  'images',
  'fields',
  'blocks',
  'rows',
  'finishes',
  'groupBy',
  'swatchSize',
  'maxOptions',
  'maxItems',
]

function fieldFor(key: string, schema: Schema): SectionField | null {
  const { schema: inner, optional } = unwrap(schema)
  const d = defOf(inner)
  if (key === 'content') return { kind: 'richtext', key, optional }
  if (key === 'assetId') return { kind: 'image', key }
  if (key === 'images') return { kind: 'images', key, max: arrayBounds(inner).max }
  switch (d.type) {
    case 'boolean':
      return { kind: 'switch', key }
    case 'enum':
      return { kind: 'choice', key, values: (inner as unknown as { options: string[] }).options }
    case 'union': {
      const values = (d.options as Schema[]).map((o) => defOf(o)).filter((o) => o.type === 'literal').flatMap((o) => o.values as unknown[])
      if (values.length && values.every((v) => typeof v === 'number')) return { kind: 'number-choice', key, values: values as number[] }
      return null
    }
    case 'number': {
      const n = inner as unknown as { minValue: number | null; maxValue: number | null }
      return { kind: 'number', key, min: n.minValue ?? 0, max: n.maxValue ?? 99 }
    }
    case 'array': {
      const element = defOf(d.element as Schema)
      if (element.type === 'enum') return { kind: 'multi', key, values: (d.element as unknown as { options: string[] }).options, min: arrayBounds(inner).min }
      return null
    }
    case 'string':
      return { kind: 'text', key, max: (inner as unknown as { maxLength: number | null }).maxLength ?? 200 }
    default:
      return null
  }
}

/** Reglas de visibilidad: un control que no aplica a la variante elegida no se muestra. */
function visible(section: DocSection, key: string): boolean {
  const o = section.options as Record<string, unknown>
  // Sin datos verificados que imprimir: el documento nunca inventa estos valores.
  if (section.type === 'technical_specs' && (key === 'showThermal' || key === 'showAcoustic' || key === 'showSecurity')) return false
  if (section.type === 'finishes_board' && key === 'showHardwareFinish') return false
  if (section.type === 'technical_specs' && key === 'showGlassImage') return o.variant === 'glass_layers'
  if (section.type === 'cover') {
    if (key === 'assetId') return o.variant === 'photo' || o.variant === 'split'
  }
  if (section.type === 'items') {
    if (key === 'showGroupSubtotals') return o.groupBy !== 'none'
    if (key === 'showSwatches') return o.finishes !== 'none'
    if (key === 'showGlassImage') return o.showGlass === true
    if (key === 'drawingDimensions' || key === 'drawingView' || key === 'drawingStyle') return o.drawingSize !== 'none'
  }
  return true
}

/** Valores que la variante no admite (se muestran deshabilitados con su motivo). */
function layoutLimits(section: DocSection): { columns?: readonly number[]; sizes?: readonly DrawingSize[] } {
  if (section.type !== 'items' && section.type !== 'product_cards' && section.type !== 'gallery') return {}
  const rules = LAYOUT_RULES[section.type] as Record<string, { columns: readonly (1 | 2 | 3)[]; sizes?: Partial<Record<1 | 2 | 3, readonly DrawingSize[]>> }>
  const rule = rules[(section.options as { variant: string }).variant]
  if (!rule) return {}
  const cols = (section.options as { columns?: 1 | 2 | 3 }).columns
  const sizes = rule.sizes ? (cols && rule.sizes[cols]) ?? rule.columns.flatMap((c) => rule.sizes?.[c] ?? []) : undefined
  return { columns: rule.columns, sizes }
}

/** Campos del inspector para una sección (sin `variant`, que tiene control propio). */
export function sectionFields(section: DocSection): SectionField[] {
  const shape = (SECTION_OPTION_SCHEMAS[section.type] as unknown as { shape: Record<string, Schema> }).shape as Record<string, Schema>
  const keys = Object.keys(shape).filter((k) => k !== 'variant')
  keys.sort((a, b) => {
    const ia = ORDER.indexOf(a)
    const ib = ORDER.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
  const limits = layoutLimits(section)
  const out: SectionField[] = []
  for (const key of keys) {
    if (!visible(section, key)) continue
    const field = fieldFor(key, shape[key])
    if (!field) continue
    if (field.kind === 'number-choice' && key === 'columns' && limits.columns) {
      out.push({ ...field, disabled: field.values.filter((v) => !limits.columns!.includes(v)) })
      continue
    }
    if (field.kind === 'choice' && key === 'drawingSize' && limits.sizes) {
      out.push({ ...field, disabled: field.values.filter((v) => v !== 'none' && !limits.sizes!.includes(v as DrawingSize)) })
      continue
    }
    out.push(field)
  }
  return out
}

/** Variantes del tipo (para el selector principal). */
export function sectionVariants(type: DocSectionType): readonly string[] {
  const shape = (SECTION_OPTION_SCHEMAS[type] as unknown as { shape: Record<string, Schema> }).shape as Record<string, Schema>
  const variant = shape.variant
  if (!variant) return []
  const { schema } = unwrap(variant)
  return defOf(schema).type === 'enum' ? (schema as unknown as { options: string[] }).options : []
}

export const ALL_DRAWING_SIZES = DRAWING_SIZES
