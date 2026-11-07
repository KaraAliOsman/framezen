/**
 * Acciones del diseñador sobre el motor. Cada una devuelve `{ design, label, undo }` o null si no
 * cambia nada: `undo` es la clave estable del paso (agrupa el historial) y `label` su texto en el
 * idioma actual. Todo pasa por las operaciones inmutables de @dekopen/engine; aquí solo se arman
 * los atajos de interfaz.
 */
import {
  findNode,
  findParent,
  mapNode,
  mergeNode,
  openingDirection,
  setGlass,
  setJoint,
  setOpening,
  setPassiveLeaf,
  setSlidingPanels,
  setSlidingSystem,
  splitNode,
  type Catalog,
  type DesignNode,
  type LeafNode,
  type Opening,
  type OpeningKind,
  type SlidingNode,
  type SlidingPanel,
  type SlidingSystem,
  type SplitNode,
  type WindowDesign,
  findUnit,
  isAssembly,
  parseUnitNodeId,
  setZocalo,
  type PaneFill,
} from '@dekopen/engine'
import { translate } from '../../../lib/i18n'
import es from '../i18n/es'
import { openingDetail, openingName, openingToken } from './text'
import { undoLabel, type UndoKey, type UndoLabel } from './undo'

export interface Change {
  design: WindowDesign
  /** Texto del paso en el idioma actual (historial, toasts). */
  label: string
  /** Clave estable + parámetros (ver `undoText`). */
  undo: UndoLabel
}

/** Arma un cambio con su etiqueta de deshacer (null si el motor devolvió el mismo diseño). */
export function change(before: WindowDesign, design: WindowDesign, key: UndoKey, params?: UndoLabel['params']): Change | null {
  return design === before ? null : { design, ...undoLabel(key, params) }
}

// ─── Qué está seleccionado ───────────────────────────────────────────────────

export type Selection =
  | { kind: 'leaf'; node: LeafNode; parent?: { node: SplitNode; index: number }; isLine: 'casement' | 'sliding' }
  | { kind: 'split'; node: SplitNode; parent?: { node: SplitNode; index: number } }
  | { kind: 'panel'; panel: SlidingPanel; index: number; root: SlidingNode }
  | { kind: 'sliding'; node: SlidingNode }

export function resolveSelection(design: WindowDesign, nodeId: string | null | undefined): Selection | null {
  if (!nodeId || !design?.root) return null
  if (isAssembly(design)) {
    const { unitId, nodeId: local } = parseUnitNodeId(nodeId)
    const unit = findUnit(design, unitId)
    return unit && local ? resolveSelection(unit.design, local) : null
  }
  const root = design.root
  if (root.type === 'sliding') {
    if (root.id === nodeId) return { kind: 'sliding', node: root }
    const index = root.panels.findIndex((p) => p.id === nodeId)
    return index >= 0 ? { kind: 'panel', panel: root.panels[index], index, root } : null
  }
  const node = findNode(design, nodeId)
  if (!node) return null
  const info = findParent(design, nodeId)
  const parent = info ? { node: info.parent, index: info.index } : undefined
  if (node.type === 'leaf') return { kind: 'leaf', node, parent, isLine: 'casement' }
  if (node.type === 'split') return { kind: 'split', node, parent }
  return { kind: 'sliding', node }
}

/** Ids seleccionables en orden de lectura (izquierda → derecha, arriba → abajo). */
export function selectableIds(design: WindowDesign): string[] {
  const root = design?.root
  if (!root) return []
  if (root.type === 'sliding') return root.panels.map((p) => p.id)
  const out: string[] = []
  const walk = (n: DesignNode) => {
    if (n.type === 'leaf') out.push(n.id)
    else if (n.type === 'split') n.children.forEach(walk)
  }
  walk(root)
  return out
}

/** «Paño 2», «Hoja 1 de 2» (número humano según el orden de lectura). */
export function nodeTitle(design: WindowDesign, nodeId: string): string {
  if (isAssembly(design)) {
    const { unitId, nodeId: local } = parseUnitNodeId(nodeId)
    const unit = findUnit(design, unitId)
    return unit && local ? `${unitId} · ${nodeTitle(unit.design, local)}` : unitId
  }
  const sel = resolveSelection(design, nodeId)
  if (!sel) return translate(es, 'node.pane')
  if (sel.kind === 'panel') return translate(es, 'node.panelOf', { n: sel.index + 1, total: sel.root.panels.length })
  if (sel.kind === 'sliding') return translate(es, 'node.sliding')
  if (sel.kind === 'split') return translate(es, 'node.split', { dir: sel.node.dir })
  const ids = selectableIds(design)
  const n = ids.indexOf(nodeId) + 1
  return ids.length > 1 ? translate(es, 'node.paneN', { n }) : translate(es, 'node.pane')
}

/** Descripción corta del contenido del paño, para lectores de pantalla y la barra contextual. */
export function nodeSummary(design: WindowDesign, nodeId: string, catalog?: Catalog): string {
  if (isAssembly(design)) {
    const { unitId, nodeId: local } = parseUnitNodeId(nodeId)
    const unit = findUnit(design, unitId)
    return unit && local ? nodeSummary(unit.design, local, catalog) : ''
  }
  const sel = resolveSelection(design, nodeId)
  if (!sel) return ''
  if (sel.kind === 'leaf') return openingDetail(sel.node.opening ?? { kind: 'fixed' })
  if (sel.kind === 'panel') {
    const p = sel.panel
    if (p.kind === 'fixed') return translate(es, 'node.fixedPanel')
    return translate(es, 'node.movingPanel', { side: p.direction === 'right' ? 'right' : 'left' })
  }
  if (sel.kind === 'split') return translate(es, 'node.splitSummary', { count: sel.node.children.length, joint: sel.node.joint ?? 'mullion' })
  const glass = catalog?.glass.find((g) => g.id === design.glassId)?.name
  return [translate(es, 'node.slidingSummary', { count: sel.node.panels.length }), glass].filter(Boolean).join(' · ')
}

// ─── Aperturas ───────────────────────────────────────────────────────────────

export type OpeningPresetId =
  | 'fixed'
  | 'casement_left'
  | 'casement_right'
  | 'tilt_turn'
  | 'tilt'
  | 'awning'
  | 'door'
  | 'pivot_v'
  | 'pivot_h'
  | 'tilt_slide'
  | 'parallel_slide'

export interface OpeningPreset {
  id: OpeningPresetId
  kind: OpeningKind
  hinge?: 'left' | 'right'
  /** Frecuente (va a la vista en la barra contextual) o especial (en «Más aperturas»). */
  tier: 'frequent' | 'special'
}

/**
 * Orden de la barra contextual (SPEC §5): las frecuentes a la vista; las especiales en un menú.
 * Las bisagras se expresan vistas desde el interior. La plegable no es un preset: es una unión
 * (`toggleFold`) porque una hoja plegable va siempre en cadena con otras.
 */
export const OPENING_PRESETS: OpeningPreset[] = [
  { id: 'fixed', kind: 'fixed', tier: 'frequent' },
  { id: 'casement_left', kind: 'casement', hinge: 'left', tier: 'frequent' },
  { id: 'casement_right', kind: 'casement', hinge: 'right', tier: 'frequent' },
  { id: 'tilt_turn', kind: 'tilt_turn', tier: 'frequent' },
  { id: 'tilt', kind: 'tilt', tier: 'frequent' },
  { id: 'awning', kind: 'awning', tier: 'frequent' },
  { id: 'door', kind: 'door', tier: 'special' },
  { id: 'pivot_v', kind: 'pivot_v', tier: 'special' },
  { id: 'pivot_h', kind: 'pivot_h', tier: 'special' },
  { id: 'tilt_slide', kind: 'tilt_slide', tier: 'special' },
  { id: 'parallel_slide', kind: 'parallel_slide', tier: 'special' },
]

export const HINGED: OpeningKind[] = ['casement', 'tilt_turn', 'door']
export const DIRECTIONAL: OpeningKind[] = ['casement', 'door']
export const SLIDE_KINDS: OpeningKind[] = ['tilt_slide', 'parallel_slide']
export const PIVOT_KINDS: OpeningKind[] = ['pivot_v', 'pivot_h']
/** Aperturas que pueden ser hoja de puerta (balconera o de acceso). */
export const USE_KINDS: OpeningKind[] = ['casement', 'tilt_turn', 'door']

/** Etiqueta de un preset en el idioma actual («Abatible, bisagras a la izquierda», «Pivotante vertical»). */
export function presetLabel(preset: OpeningPreset, visualHinge: 'left' | 'right' = preset.hinge ?? 'left'): string {
  if (preset.kind === 'casement' && preset.hinge) return translate(es, 'toolbar.casement', { side: visualHinge })
  return openingName({ kind: preset.kind })
}

/** Apertura que resulta de elegir un preset conservando bisagra, sentido y uso cuando tienen sentido. */
export function presetOpening(preset: OpeningPreset, current: Opening | undefined): Opening {
  const hinge = preset.hinge ?? current?.hinge ?? 'left'
  const use = current?.use && USE_KINDS.includes(preset.kind) ? { use: current.use } : {}
  switch (preset.kind) {
    case 'fixed':
      return { kind: 'fixed' }
    case 'casement':
      return { kind: 'casement', hinge, direction: current && DIRECTIONAL.includes(current.kind) ? openingDirection(current) : 'in', ...use }
    case 'tilt_turn':
      return { kind: 'tilt_turn', hinge, direction: 'in', ...(current?.kind === 'tilt_turn' && current.sequence ? { sequence: current.sequence } : {}), ...use }
    case 'tilt':
      return { kind: 'tilt', direction: 'in' }
    case 'awning':
      return { kind: 'awning', direction: 'out' }
    case 'door':
      return { kind: 'door', hinge, direction: current?.kind === 'door' ? openingDirection(current) : 'in', ...use }
    case 'pivot_v':
    case 'pivot_h':
      return { kind: preset.kind, direction: 'in', pivot: current?.kind === preset.kind && typeof current.pivot === 'number' ? current.pivot : 0.5 }
    case 'tilt_slide':
    case 'parallel_slide':
      return { kind: preset.kind, slide: current?.slide ?? (current?.hinge === 'right' ? 'left' : 'right') }
    default:
      return { kind: preset.kind }
  }
}

export function isPresetActive(preset: OpeningPreset, opening: Opening | undefined): boolean {
  const kind = opening?.kind ?? 'fixed'
  if (preset.kind !== kind) return false
  if (preset.kind === 'casement') return (opening?.hinge ?? 'left') === preset.hinge
  return true
}

/** Misma apertura (bisagra solo cuenta si la apertura tiene bisagras; sentido normalizado). */
export function sameOpening(a: Opening | undefined, b: Opening | undefined): boolean {
  const ka = a?.kind ?? 'fixed'
  const kb = b?.kind ?? 'fixed'
  if (ka !== kb) return false
  if (ka === 'fixed') return true
  if (HINGED.includes(ka) && (a?.hinge ?? 'left') !== (b?.hinge ?? 'left')) return false
  if ((a?.use ?? null) !== (b?.use ?? null)) return false
  if (SLIDE_KINDS.includes(ka) && (a?.slide ?? null) !== (b?.slide ?? null)) return false
  return openingDirection(a ?? { kind: ka }) === openingDirection(b ?? { kind: kb })
}

function openingChange(design: WindowDesign, next: WindowDesign, opening: Opening): Change | null {
  if (next === design) return null
  return (opening.kind ?? 'fixed') === 'fixed' ? change(design, next, 'openingFixed') : change(design, next, 'opening', { opening: openingToken(opening) })
}

export function applyOpeningPreset(design: WindowDesign, nodeId: string, preset: OpeningPreset): Change | null {
  const node = findNode(design, nodeId)
  if (!node || node.type !== 'leaf') return null
  const opening = presetOpening(preset, node.opening)
  if (sameOpening(opening, node.opening)) return null
  return openingChange(design, setOpening(design, nodeId, opening), opening)
}

function leafOf(design: WindowDesign, nodeId: string): LeafNode | null {
  const node = findNode(design, nodeId)
  return node && node.type === 'leaf' ? node : null
}

export function flipHinge(design: WindowDesign, nodeId: string): Change | null {
  const node = leafOf(design, nodeId)
  if (!node || !HINGED.includes(node.opening?.kind)) return null
  const hinge = node.opening.hinge === 'right' ? 'left' : 'right'
  return change(design, setOpening(design, nodeId, { ...node.opening, hinge }), 'hinge', { side: hinge })
}

export function setDirection(design: WindowDesign, nodeId: string, direction: 'in' | 'out'): Change | null {
  const node = leafOf(design, nodeId)
  if (!node || node.opening?.kind === 'fixed') return null
  if (openingDirection(node.opening) === direction) return null
  return change(design, setOpening(design, nodeId, { ...node.opening, direction }), 'direction', { direction })
}

export function setHinge(design: WindowDesign, nodeId: string, hinge: 'left' | 'right'): Change | null {
  const node = leafOf(design, nodeId)
  if (!node || !HINGED.includes(node.opening?.kind)) return null
  if ((node.opening.hinge ?? 'left') === hinge && node.opening.hinge) return null
  return change(design, setOpening(design, nodeId, { ...node.opening, hinge }), 'hinge', { side: hinge })
}

/** Oscilobatiente: la manilla gira primero (lo habitual) u oscila primero (seguridad infantil). */
export function setSequence(design: WindowDesign, nodeId: string, sequence: 'turn_first' | 'tilt_first'): Change | null {
  const node = leafOf(design, nodeId)
  if (!node || node.opening?.kind !== 'tilt_turn') return null
  if ((node.opening.sequence ?? 'turn_first') === sequence) return null
  const { sequence: _drop, ...rest } = node.opening
  const opening: Opening = sequence === 'tilt_first' ? { ...rest, sequence } : rest
  return change(design, setOpening(design, nodeId, opening), 'sequence', { sequence })
}

/** Osciloparalela y corredera paralela: hacia dónde se desliza la hoja (vista interior). */
export function setSlide(design: WindowDesign, nodeId: string, slide: 'left' | 'right'): Change | null {
  const node = leafOf(design, nodeId)
  if (!node || !SLIDE_KINDS.includes(node.opening?.kind)) return null
  if (node.opening.slide === slide) return null
  return change(design, setOpening(design, nodeId, { ...node.opening, slide }), 'slide', { side: slide })
}

/** Hoja plegable: lado hacia donde se pliega (la jamba donde se apila su grupo). */
export function setFoldSide(design: WindowDesign, nodeId: string, side: 'left' | 'right'): Change | null {
  const node = leafOf(design, nodeId)
  if (!node || node.opening?.kind !== 'folding') return null
  if ((node.opening.hinge ?? 'left') === side && node.opening.hinge) return null
  return change(design, setOpening(design, nodeId, { ...node.opening, hinge: side }), 'foldSide', { side })
}

/** Pivotante: posición del eje (0,05–0,95; 0,5 = centrado). Cambios continuos: misma etiqueta. */
export function setPivot(design: WindowDesign, nodeId: string, pivot: number): Change | null {
  const node = leafOf(design, nodeId)
  if (!node || !PIVOT_KINDS.includes(node.opening?.kind) || !Number.isFinite(pivot)) return null
  const value = Math.round(Math.min(0.95, Math.max(0.05, pivot)) * 100) / 100
  if (Math.abs((node.opening.pivot ?? 0.5) - value) < 0.001) return null
  return change(design, setOpening(design, nodeId, { ...node.opening, pivot: value }), 'pivot')
}

/** Uso de la hoja: ventana, puerta balconera o puerta de acceso (llega al piso). */
export function setLeafUse(design: WindowDesign, nodeId: string, use: 'window' | 'balcony' | 'entrance'): Change | null {
  const node = leafOf(design, nodeId)
  if (!node || !USE_KINDS.includes(node.opening?.kind)) return null
  const current = node.opening.use ?? 'window'
  if (current === use) return null
  const { use: _drop, ...rest } = node.opening
  const opening: Opening = use === 'window' ? rest : { ...rest, use }
  return change(design, setOpening(design, nodeId, opening), 'leafUse', { use })
}

// ─── Divisiones ──────────────────────────────────────────────────────────────

export function splitAction(design: WindowDesign, nodeId: string, dir: 'vertical' | 'horizontal', parts: 2 | 3 | 4 = 2): Change | null {
  return change(design, splitNode(design, nodeId, dir, parts), 'split', { parts, dir })
}

/**
 * Quitar división desde lo seleccionado: un paño se une a su vecino; una división completa
 * queda como un solo paño; con `index` se quita solo ese travesaño.
 */
export function removeDivision(design: WindowDesign, nodeId: string, index?: number): Change | null {
  const node = findNode(design, nodeId)
  if (!node || node.type === 'sliding') return null
  if (node.type === 'leaf' && !findParent(design, nodeId)) return null
  const next = mergeNode(design, nodeId, index)
  return change(design, next, node.type === 'split' && index !== undefined ? 'removeMullion' : 'removeDivision')
}

export function canRemoveDivision(design: WindowDesign, nodeId: string | null): boolean {
  if (!nodeId) return false
  const node = findNode(design, nodeId)
  if (!node || node.type === 'sliding') return false
  return node.type === 'split' || Boolean(findParent(design, nodeId))
}

/** División vertical donde vive el paño (para la unión francesa o plegable). */
export function frenchHost(design: WindowDesign, nodeId: string): SplitNode | null {
  const node = findNode(design, nodeId)
  if (!node) return null
  if (node.type === 'split') return node.dir === 'vertical' ? node : null
  const info = findParent(design, nodeId)
  return info && info.parent.dir === 'vertical' ? info.parent : null
}

const JOINT_KEY: Record<'mullion' | 'french' | 'fold', UndoKey> = { mullion: 'mullion', french: 'french', fold: 'fold' }

/** Travesaño fijo, unión francesa o cadena plegable (francesa y plegable solo entre hojas lado a lado). */
export function setJointAction(design: WindowDesign, splitId: string, joint: 'mullion' | 'french' | 'fold'): Change | null {
  const node = findNode(design, splitId)
  if (!node || node.type !== 'split') return null
  if (joint !== 'mullion' && node.dir !== 'vertical') return null
  if ((node.joint ?? 'mullion') === joint) return null
  let next = setJoint(design, splitId, joint)
  // Volver de plegable a travesaño: las hojas plegables quedan como abatibles hacia su lado.
  if (joint !== 'fold' && node.joint === 'fold') {
    const split = findNode(next, splitId)
    if (split?.type === 'split') {
      for (const child of split.children) {
        if (child.type === 'leaf' && child.opening?.kind === 'folding') next = setOpening(next, child.id, { kind: 'casement', hinge: child.opening.hinge ?? 'left', direction: 'in' })
      }
    }
  }
  return change(design, next, JOINT_KEY[joint])
}

export function toggleFrench(design: WindowDesign, splitId: string): Change | null {
  const node = findNode(design, splitId)
  if (!node || node.type !== 'split' || node.dir !== 'vertical') return null
  return setJointAction(design, splitId, node.joint === 'french' ? 'mullion' : 'french')
}

export function toggleFold(design: WindowDesign, splitId: string): Change | null {
  const node = findNode(design, splitId)
  if (!node || node.type !== 'split' || node.dir !== 'vertical') return null
  return setJointAction(design, splitId, node.joint === 'fold' ? 'mullion' : 'fold')
}

/** Unión francesa: qué hoja es la pasiva (lleva el inversor y pasadores). */
export function setPassive(design: WindowDesign, splitId: string, side: 'left' | 'right'): Change | null {
  return change(design, setPassiveLeaf(design, splitId, side), 'passive', { side })
}

/** Reparte una división en partes iguales (medidas automáticas). */
export function equalizeSplit(design: WindowDesign, splitId: string): Change | null {
  const node = findNode(design, splitId)
  if (!node || node.type !== 'split') return null
  if (node.sizes.every((s) => s === null || s === undefined)) return null
  const root = mapNode(design.root, splitId, (n) => ({ ...(n as SplitNode), sizes: (n as SplitNode).children.map(() => null) }))
  return change(design, { ...design, root }, 'equalize')
}

// ─── Vidrio y relleno ────────────────────────────────────────────────────────

export function setNodeGlass(design: WindowDesign, nodeId: string, glassId: string, catalog?: Catalog): Change | null {
  const name = catalog?.glass.find((g) => g.id === glassId)?.name
  return change(design, setGlass(design, nodeId, glassId), name ? 'paneGlassNamed' : 'paneGlass', name ? { name } : undefined)
}

/** «Igual que la ventana»: quita el vidrio propio del paño o del panel. */
export function clearNodeGlass(design: WindowDesign, nodeId: string): Change | null {
  const root = design.root
  if (root?.type === 'sliding') {
    const panel = root.panels.find((p) => p.id === nodeId)
    if (!panel?.glassId) return null
    const panels = root.panels.map((p) => {
      if (p.id !== nodeId) return p
      const { glassId: _drop, ...rest } = p
      return rest
    })
    return change(design, { ...design, root: { ...root, panels } }, 'glassInherit')
  }
  const node = findNode(design, nodeId)
  if (!node || node.type !== 'leaf' || !node.glassId) return null
  const nextRoot = mapNode(design.root, nodeId, (n) => {
    const { glassId: _drop, ...rest } = n as LeafNode
    return rest as LeafNode
  })
  return change(design, { ...design, root: nextRoot }, 'glassInherit')
}

/** Vidrio efectivo de un paño o panel (propio o el de la ventana). */
export function nodeGlassId(design: WindowDesign, nodeId: string): { glassId: string; own: boolean } {
  const root = design.root
  if (root?.type === 'sliding') {
    const panel = root.panels.find((p) => p.id === nodeId)
    return panel?.glassId ? { glassId: panel.glassId, own: true } : { glassId: design.glassId, own: false }
  }
  const node = findNode(design, nodeId)
  if (node?.type === 'leaf' && node.glassId) return { glassId: node.glassId, own: true }
  return { glassId: design.glassId, own: false }
}

export function setFill(design: WindowDesign, nodeId: string, fill: PaneFill): Change | null {
  const node = findNode(design, nodeId)
  if (!node || node.type !== 'leaf' || (node.fill ?? 'glass') === fill) return null
  const root = mapNode(design.root, nodeId, (n) => ({ ...(n as LeafNode), fill }))
  return change(design, { ...design, root }, fill === 'glass' ? 'fillGlass' : 'fillPanel')
}

/** Zócalo de una hoja: sin dato lo quita. */
export function setLeafZocalo(design: WindowDesign, nodeId: string, height: number | undefined): Change | null {
  return change(design, setZocalo(design, nodeId, height), 'fillPanel')
}

// ─── Correderas ──────────────────────────────────────────────────────────────

function updatePanels(design: WindowDesign, fn: (panels: SlidingPanel[]) => SlidingPanel[]): WindowDesign {
  const root = design.root
  if (root?.type !== 'sliding') return design
  return setSlidingPanels(design, fn(root.panels), root.rails)
}

export function setPanelKind(design: WindowDesign, panelId: string, kind: 'moving' | 'fixed'): Change | null {
  const root = design.root
  if (root?.type !== 'sliding') return null
  const index = root.panels.findIndex((p) => p.id === panelId)
  if (index < 0 || root.panels[index].kind === kind) return null
  const next = updatePanels(design, (panels) =>
    panels.map((p, i) => {
      if (p.id !== panelId) return p
      if (kind === 'fixed') {
        const { direction: _d, ...rest } = p
        return { ...rest, kind: 'fixed' }
      }
      return { ...p, kind: 'moving', direction: p.direction ?? (i === 0 ? 'right' : 'left') }
    }),
  )
  return change(design, next, kind === 'fixed' ? 'panelFixed' : 'panelMoving')
}

export function setPanelDirection(design: WindowDesign, panelId: string, direction: 'left' | 'right'): Change | null {
  const root = design.root
  // La guillotina sube y baja: su sentido no se cambia a izquierda o derecha.
  if (root?.type !== 'sliding' || root.system === 'vertical') return null
  const panel = root.panels.find((p) => p.id === panelId)
  if (!panel || (panel.kind === 'moving' && panel.direction === direction)) return null
  const next = updatePanels(design, (panels) => panels.map((p) => (p.id === panelId ? { ...p, kind: 'moving', direction } : p)))
  return change(design, next, 'panelDirection', { side: direction })
}

export function setPanelCount(design: WindowDesign, count: number): Change | null {
  const root = design.root
  if (root?.type !== 'sliding' || root.panels.length === count) return null
  return change(design, setSlidingPanels(design, count), 'panelCount', { count })
}

export function setRails(design: WindowDesign, rails: 1 | 2 | 3): Change | null {
  const root = design.root
  if (root?.type !== 'sliding' || root.rails === rails) return null
  return change(design, setSlidingPanels(design, root.panels, rails), 'rails', { rails })
}

/** Corredera estándar o elevadora (HS). */
export function setSystem(design: WindowDesign, system: SlidingSystem): Change | null {
  return change(design, setSlidingSystem(design, system), 'slidingSystem', { system })
}
