/**
 * Arma y modifica diseños de ventana en el servidor con las operaciones del motor (las mismas que
 * usa el diseñador), a partir de los argumentos del agente: tipología, medidas, línea, colores,
 * vidrio, aperturas por paño, accesorios, sistema de corredera y hoja pasiva.
 *
 * Devuelve el diseño, los cambios legibles (idioma de la persona, para la línea de actividad) y
 * notas para el modelo (inglés, para que explique supuestos). Nunca lanza: lo que no se puede
 * aplicar queda como nota.
 */
import {
  collectLeaves,
  createDesign,
  getTypology,
  matchTypology,
  setColor,
  setExtras,
  setGlass,
  setLine,
  setOpening,
  setPassiveLeaf,
  setSize,
  setSlidingSystem,
  walkNodes,
  type Catalog,
  type LeafNode,
  type Opening,
  type SlidingSystem,
  type TypologyId,
  type WindowDesign,
  type WindowExtras,
} from '@dekopen/engine'
import type { AgentAccessoriesSpec, AgentOpeningSpec, AgentWindowInput, Defaults, QuoteItem } from '@dekopen/shared'
import type { AssistantText } from './i18n'
import { closestNames, defaultGlass, resolveColor, resolveGlass, resolveLine, typologyKind } from './resolve'
import { ToolFailure } from './tools/types'

export interface DesignEnv {
  catalog: Catalog
  defaults: Defaults
  text: AssistantText
}

export interface DesignChange {
  design: WindowDesign
  /** Cambios legibles (idioma de la persona). */
  changes: string[]
  /** Supuestos y avisos para el modelo (inglés). */
  notes: string[]
  /** Pedidos que no existen en el catálogo: la herramienta falla, no los reemplaza. */
  misses: CatalogMiss[]
}

export interface CatalogMiss {
  kind: 'line' | 'colour' | 'glass'
  value: string
}

/**
 * Lo que la persona nombró y no está en el catálogo detiene la acción: cambiarlo por el valor por
 * defecto dejaría una cotización que parece correcta y no es lo que pidió. El mensaje le da al
 * modelo los nombres reales para que ofrezca una opción sin inventar otra.
 */
export function rejectMisses(env: DesignEnv, misses: readonly CatalogMiss[]): void {
  const miss = misses[0]
  if (!miss) return
  const list = miss.kind === 'line' ? env.catalog.lines : miss.kind === 'colour' ? env.catalog.colors : env.catalog.glass
  const closest = closestNames(list.map((n) => n.name), miss.value)
  const offer = closest.length ? `Closest real names: ${closest.join(', ')}.` : 'Nothing similar exists: do not suggest a specific alternative.'
  throw new ToolFailure('not_found', `${miss.kind} "${miss.value}" is not in the catalogue. Nothing was changed. ${offer}`)
}

const SAFE_MAX_MM = 8000

/** Spec de apertura para un paño (o para todos los que abren si no trae `pane`). */
export type OpeningPatch = Partial<AgentOpeningSpec>

function targetLeaves(design: WindowDesign, pane: number | undefined, kind: Opening['kind'] | undefined): LeafNode[] {
  const leaves = collectLeaves(design.root)
  if (!leaves.length) return []
  if (pane !== undefined && pane !== 0) {
    const index = pane > 0 ? pane - 1 : leaves.length + pane
    const leaf = leaves[Math.min(leaves.length - 1, Math.max(0, index))]
    return leaf ? [leaf] : []
  }
  if (leaves.length === 1) return leaves
  const openable = leaves.filter((l) => l.opening.kind !== 'fixed')
  return kind === 'fixed' || !openable.length ? leaves : openable
}

/** Aplica aperturas por paño (motor `setOpening`, que normaliza los campos según el tipo). */
export function applyOpenings(design: WindowDesign, patches: readonly OpeningPatch[], text: AssistantText, changes: string[], notes: string[]): WindowDesign {
  if (!patches.length) return design
  if (design.root?.type === 'sliding') {
    notes.push('Sliding windows have no hinges or opening panes; the opening was not changed (change the typology instead).')
    return design
  }
  let next = design
  const total = collectLeaves(design.root).length
  for (const patch of patches) {
    const leaves = targetLeaves(next, patch.pane, patch.kind)
    if (!leaves.length) continue
    const before = next
    for (const leaf of leaves) {
      const kind = patch.kind ?? leaf.opening.kind
      const opening: Opening = { ...leaf.opening, kind }
      if (patch.hinge) opening.hinge = patch.hinge
      if (patch.direction) opening.direction = patch.direction
      if (patch.sequence) opening.sequence = patch.sequence
      if (patch.slide) opening.slide = patch.slide
      if (patch.pivot !== undefined) opening.pivot = patch.pivot
      if (patch.use) opening.use = patch.use
      if (kind === 'fixed') {
        delete opening.hinge
        delete opening.direction
      } else if ((kind === 'casement' || kind === 'tilt_turn' || kind === 'door') && !opening.hinge) opening.hinge = 'left'
      next = setOpening(next, leaf.id, opening)
    }
    if (next === before) continue
    if (patch.kind) {
      const name = text.opening(patch.kind)
      const pane = patch.pane !== undefined && total > 1 ? (patch.pane > 0 ? patch.pane : total + patch.pane + 1) : undefined
      changes.push(pane ? text.t('change.openingPane', { name, pane }) : text.t('change.opening', { name }))
    }
    if (patch.hinge) changes.push(text.t(patch.hinge === 'left' ? 'change.hingeLeft' : 'change.hingeRight'))
    if (patch.direction) changes.push(text.t(patch.direction === 'out' ? 'change.dirOut' : 'change.dirIn'))
  }
  return next
}

/** Accesorios: persiana, mosquitero, alféizar, umbral (false los quita). */
export function applyAccessories(design: WindowDesign, spec: AgentAccessoriesSpec | undefined, text: AssistantText, changes: string[]): WindowDesign {
  if (!spec) return design
  const patch: Partial<WindowExtras> = {}
  const named: { key: 'rollerShutter' | 'insectScreen' | 'sill' | 'threshold'; on: boolean }[] = []
  if (spec.roller_shutter !== undefined) {
    patch.rollerShutter = spec.roller_shutter === false ? undefined : { type: spec.roller_shutter.type, operation: spec.roller_shutter.operation }
    named.push({ key: 'rollerShutter', on: spec.roller_shutter !== false })
  }
  if (spec.insect_screen !== undefined) {
    patch.insectScreen = spec.insect_screen === false ? undefined : { type: spec.insect_screen.type }
    // El mosquitero v4 (`screen`) se reemplaza por el v5.
    patch.screen = undefined
    named.push({ key: 'insectScreen', on: spec.insect_screen !== false })
  }
  if (spec.sill !== undefined) {
    patch.sill = spec.sill || undefined
    named.push({ key: 'sill', on: spec.sill })
  }
  if (spec.threshold !== undefined) {
    patch.threshold = spec.threshold || undefined
    named.push({ key: 'threshold', on: spec.threshold })
  }
  const next = setExtras(design, patch)
  if (next !== design) for (const n of named) changes.push(text.t(n.on ? 'change.accessoryOn' : 'change.accessoryOff', { name: text.accessory(n.key) }))
  return next
}

function frenchSplitId(design: WindowDesign): string | undefined {
  let id: string | undefined
  walkNodes(design.root, (n) => {
    if (!id && n.type === 'split' && n.joint === 'french') id = n.id
  })
  return id
}

/** Campos comunes de crear y modificar (todo lo opcional). */
interface WindowFields {
  width?: number
  height?: number
  line?: string
  color?: string
  color_in?: string
  glass?: string
  openings?: OpeningPatch[]
  accessories?: AgentAccessoriesSpec
  sliding_system?: SlidingSystem
  passive_leaf?: 'left' | 'right'
}

function applyExtrasOfSpec(design: WindowDesign, fields: WindowFields, text: AssistantText, changes: string[], notes: string[]): WindowDesign {
  let next = design
  if (fields.sliding_system) {
    if (next.root?.type === 'sliding') {
      const before = next
      next = setSlidingSystem(next, fields.sliding_system)
      if (next !== before && fields.sliding_system !== 'vertical') changes.push(text.t('change.slidingSystem', { name: text.t(`slidingSystem.${fields.sliding_system}`) }))
    } else notes.push('sliding_system only applies to sliding windows; ignored.')
  }
  if (fields.passive_leaf) {
    const splitId = frenchSplitId(next)
    if (splitId) {
      const before = next
      next = setPassiveLeaf(next, splitId, fields.passive_leaf)
      if (next !== before) changes.push(text.t('change.passive', { side: text.t(`side.${fields.passive_leaf}`) }))
    } else notes.push('passive_leaf only applies to French double leaves (no mullion); ignored.')
  }
  next = applyOpenings(next, fields.openings ?? [], text, changes, notes)
  next = applyAccessories(next, fields.accessories, text, changes)
  return next
}

/**
 * Diseño nuevo para `add_window`/`create_quote`: tipología (o la por defecto según la línea del
 * taller), línea del tipo correcto (la de la cotización si ya hay una de ese tipo), color y vidrio
 * pedidos (o los que comparte la cotización, o los por defecto), medidas (o las estándar).
 */
export function buildWindowDesign(env: DesignEnv, input: AgentWindowInput, existing: readonly QuoteItem[]): DesignChange & { typologyId: TypologyId } {
  const { catalog, defaults, text } = env
  const notes: string[] = []
  const changes: string[] = []
  const misses: CatalogMiss[] = []
  const defaultLine = catalog.lines.find((l) => l.id === defaults.lineId)
  const typologyId: TypologyId = input.typology ?? (defaultLine?.kind === 'sliding' ? 'sliding_2' : 'casement')
  if (!input.typology) notes.push(`No typology given: used ${typologyId}.`)
  const typology = getTypology(typologyId)!
  const quoteLine = [...existing]
    .reverse()
    .map((i) => catalog.lines.find((l) => l.id === i.design.lineId))
    .find((l) => l && l.kind === typology.kind && (l.typologyIds.length === 0 || l.typologyIds.includes(typologyId)))
  const { line, missed } = resolveLine(catalog, input.line, { kind: typology.kind, typologyId, defaultLineId: defaults.lineId, currentLineId: quoteLine?.id })
  if (missed) misses.push({ kind: 'line', value: missed })
  const color = resolveColor(catalog, input.color, line)
  if (input.color && !color) misses.push({ kind: 'colour', value: input.color })
  const shared = (pick: (d: WindowDesign) => string | undefined) => {
    const first = existing[0] ? pick(existing[0].design) : undefined
    return first && existing.every((i) => pick(i.design) === first) ? first : undefined
  }
  const lineHas = (id: string) => !line || line.colorIds.length === 0 || line.colorIds.includes(id)
  const sharedColor = shared((d) => (d.colorInId ? undefined : d.colorId))
  const fallbackColor =
    catalog.colors.find((c) => c.id === sharedColor && lineHas(c.id)) ??
    catalog.colors.find((c) => c.id === defaults.colorId && lineHas(c.id)) ??
    catalog.colors.find((c) => line?.colorIds.includes(c.id)) ??
    catalog.colors[0]
  const colorIn = input.color_in ? resolveColor(catalog, input.color_in, line) : undefined
  if (input.color_in && !colorIn) misses.push({ kind: 'colour', value: input.color_in })
  const glass = resolveGlass(catalog, input.glass, defaults.glassId)
  if (input.glass && !glass) misses.push({ kind: 'glass', value: input.glass })
  const sharedGlass = shared((d) => d.glassId)
  const fallbackGlass = catalog.glass.find((g) => g.id === sharedGlass) ?? defaultGlass(catalog, defaults.glassId)

  let width = input.width
  let height = input.height
  if (!width && !height) {
    width = typology.defaultSize.width
    height = typology.defaultSize.height
    notes.push(`No size given: used the standard ${width} × ${height} mm.`)
  } else if (!height) {
    height = typology.defaultSize.height
    notes.push(`No height given: used ${height} mm.`)
  } else if (!width) {
    width = typology.defaultSize.width
    notes.push(`No width given: used ${width} mm.`)
  }
  if ((width ?? 0) > SAFE_MAX_MM || (height ?? 0) > SAFE_MAX_MM) notes.push(`${width} × ${height} mm is very large for one unit; check whether the user meant centimetres.`)

  let design = createDesign(typologyId, {
    lineId: line?.id ?? catalog.lines[0]?.id ?? '',
    width,
    height,
    colorId: (color ?? fallbackColor)?.id ?? 'blanco',
    glassId: (glass ?? fallbackGlass)?.id ?? '',
  })
  if (colorIn) design = setColor(design, design.colorId, colorIn.id)
  design = applyExtrasOfSpec(design, input, text, changes, notes)
  return { design, changes, notes, misses, typologyId }
}

export interface WindowUpdateFields extends WindowFields {
  typology?: TypologyId
  pane?: number
  opening?: Opening['kind']
  hinge?: 'left' | 'right'
  direction?: 'in' | 'out'
}

/** Aplica un cambio a un diseño existente (`update_window`). */
export function updateWindowDesign(env: DesignEnv, before: WindowDesign, args: WindowUpdateFields): DesignChange {
  const { catalog, defaults, text } = env
  const changes: string[] = []
  const notes: string[] = []
  const misses: CatalogMiss[] = []
  let design = before
  // Apertura sobre una corredera sin paño = convertirla a esa tipología simple.
  const typologyTarget =
    args.typology ?? (args.opening && before.root?.type === 'sliding' && args.pane === undefined && getTypology(args.opening) ? (args.opening as TypologyId) : undefined)
  if (typologyTarget && typologyTarget !== matchTypology(before)) {
    const kind = typologyKind(typologyTarget)
    const current = catalog.lines.find((l) => l.id === before.lineId)
    const { line } = resolveLine(catalog, undefined, {
      kind,
      typologyId: typologyTarget,
      currentLineId: current?.kind === kind ? current.id : undefined,
      defaultLineId: current?.id ?? defaults.lineId,
    })
    let rebuilt = createDesign(typologyTarget, { lineId: line?.id ?? before.lineId, width: before.width, height: before.height, colorId: before.colorId, glassId: before.glassId })
    if (before.colorInId) rebuilt = setColor(rebuilt, before.colorId, before.colorInId)
    if (before.extras) rebuilt = { ...rebuilt, extras: before.extras }
    design = rebuilt
    changes.push(text.t('change.typology', { name: text.typology(typologyTarget) }))
  }
  if (args.width || args.height) {
    const next = setSize(design, { ...(args.width ? { width: args.width } : {}), ...(args.height ? { height: args.height } : {}) })
    if (next !== design) {
      if (args.width && args.height) changes.push(text.t('change.size', { size: text.fmt.size(args.width, args.height) }))
      else if (args.width) changes.push(text.t('change.width', { mm: text.fmt.mm(args.width, { unit: true }) }))
      else if (args.height) changes.push(text.t('change.height', { mm: text.fmt.mm(args.height, { unit: true }) }))
    }
    design = next
    if ((args.width ?? 0) > SAFE_MAX_MM || (args.height ?? 0) > SAFE_MAX_MM) notes.push('Very large size; check whether the user meant centimetres.')
  }
  if (args.line) {
    const kind = design.root?.type === 'sliding' ? 'sliding' : undefined
    const strict = resolveLine(catalog, args.line, { kind })
    const choice = strict.missed ? resolveLine(catalog, args.line) : strict
    if (choice.line && !choice.missed) {
      if (choice.line.id !== design.lineId) {
        design = setLine(design, choice.line.id, catalog)
        changes.push(text.t('change.line', { name: choice.line.name }))
      }
    } else misses.push({ kind: 'line', value: args.line })
  }
  if (args.color || args.color_in) {
    const lineNow = catalog.lines.find((l) => l.id === design.lineId)
    const color = args.color ? resolveColor(catalog, args.color, lineNow) : undefined
    const colorIn = args.color_in ? resolveColor(catalog, args.color_in, lineNow) : undefined
    if (args.color && !color) misses.push({ kind: 'colour', value: args.color })
    if (args.color_in && !colorIn) misses.push({ kind: 'colour', value: args.color_in })
    if (color || colorIn) {
      const ext = color?.id ?? design.colorId
      const int = colorIn?.id ?? (color ? undefined : design.colorInId)
      const next = setColor(design, ext, int)
      if (next.colorId !== design.colorId || next.colorInId !== design.colorInId) {
        changes.push(
          color && colorIn
            ? text.t('change.bicolor', { ext: color.name, int: colorIn.name })
            : colorIn
              ? text.t('change.colorIn', { name: colorIn.name })
              : text.t('change.color', { name: color!.name }),
        )
      }
      design = next
      if (color && lineNow && lineNow.colorIds.length && !lineNow.colorIds.includes(color.id)) notes.push(`${lineNow.name} does not list ${color.name}; the engine will warn if a price is missing.`)
    }
  }
  if (args.glass) {
    const glass = resolveGlass(catalog, args.glass, defaults.glassId)
    if (glass) {
      const next = setGlass(design, null, glass.id)
      if (next.glassId !== design.glassId || JSON.stringify(next.root) !== JSON.stringify(design.root)) changes.push(text.t('change.glass', { name: glass.name }))
      design = next
    } else misses.push({ kind: 'glass', value: args.glass })
  }
  const openings: OpeningPatch[] = [...(args.openings ?? [])]
  if (!typologyTarget || args.typology) {
    if (args.opening || args.hinge || args.direction) openings.push({ pane: args.pane, kind: args.opening, hinge: args.hinge, direction: args.direction })
  }
  design = applyExtrasOfSpec(design, { ...args, openings }, text, changes, notes)
  return { design, changes, notes, misses }
}
