/**
 * Acciones del diseñador sobre el motor. Cada una devuelve `{ design, label }` (el texto va al
 * historial de deshacer) o null si no cambia nada. Todo pasa por las operaciones inmutables de
 * @framezen/engine; aquí solo se arman los atajos de interfaz.
 */
import {
  findNode,
  findParent,
  mapNode,
  mergeNode,
  openingDirection,
  openingLabel,
  setGlass,
  setJoint,
  setOpening,
  setSlidingPanels,
  splitNode,
  type Catalog,
  type DesignNode,
  type LeafNode,
  type Opening,
  type OpeningKind,
  type SlidingNode,
  type SlidingPanel,
  type SplitNode,
  type WindowDesign,
} from '@framezen/engine'

export interface Change {
  design: WindowDesign
  label: string
}

const changed = (before: WindowDesign, design: WindowDesign, label: string): Change | null => (design === before ? null : { design, label })

// ─── Qué está seleccionado ───────────────────────────────────────────────────

export type Selection =
  | { kind: 'leaf'; node: LeafNode; parent?: { node: SplitNode; index: number }; isLine: 'casement' | 'sliding' }
  | { kind: 'split'; node: SplitNode; parent?: { node: SplitNode; index: number } }
  | { kind: 'panel'; panel: SlidingPanel; index: number; root: SlidingNode }
  | { kind: 'sliding'; node: SlidingNode }

export function resolveSelection(design: WindowDesign, nodeId: string | null | undefined): Selection | null {
  if (!nodeId || !design?.root) return null
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

/** «Paño 2», «Hoja 1» (número humano según el orden de lectura). */
export function nodeTitle(design: WindowDesign, nodeId: string): string {
  const sel = resolveSelection(design, nodeId)
  if (!sel) return 'Paño'
  if (sel.kind === 'panel') return `Hoja ${sel.index + 1} de ${sel.root.panels.length}`
  if (sel.kind === 'sliding') return 'Corredera'
  if (sel.kind === 'split') return sel.node.dir === 'vertical' ? 'División vertical' : 'División horizontal'
  const ids = selectableIds(design)
  const n = ids.indexOf(nodeId) + 1
  return ids.length > 1 ? `Paño ${n}` : 'Paño'
}

/** Descripción corta del contenido del paño, para lectores de pantalla y la barra contextual. */
export function nodeSummary(design: WindowDesign, nodeId: string, catalog?: Catalog): string {
  const sel = resolveSelection(design, nodeId)
  if (!sel) return ''
  if (sel.kind === 'leaf') return openingLabel(sel.node.opening ?? { kind: 'fixed' }, true)
  if (sel.kind === 'panel') {
    const p = sel.panel
    if (p.kind === 'fixed') return 'Hoja fija'
    return `Hoja móvil, abre hacia la ${p.direction === 'right' ? 'derecha' : 'izquierda'}`
  }
  if (sel.kind === 'split') {
    const n = sel.node.children.length
    return `${n} paños${sel.node.joint === 'french' ? ', unión francesa' : ''}`
  }
  const glass = catalog?.glass.find((g) => g.id === design.glassId)?.name
  return [`${sel.node.panels.length} hojas`, glass].filter(Boolean).join(' · ')
}

// ─── Aperturas ───────────────────────────────────────────────────────────────

export type OpeningPresetId = 'fixed' | 'casement_left' | 'casement_right' | 'tilt_turn' | 'tilt' | 'awning' | 'door'

export interface OpeningPreset {
  id: OpeningPresetId
  kind: OpeningKind
  hinge?: 'left' | 'right'
  /** Etiqueta corta (botones y tooltips). */
  label: string
}

/** Orden de la barra contextual (SPEC §5). Las bisagras se expresan vistas desde el interior. */
export const OPENING_PRESETS: OpeningPreset[] = [
  { id: 'fixed', kind: 'fixed', label: 'Fijo' },
  { id: 'casement_left', kind: 'casement', hinge: 'left', label: 'Abatible, bisagras a la izquierda' },
  { id: 'casement_right', kind: 'casement', hinge: 'right', label: 'Abatible, bisagras a la derecha' },
  { id: 'tilt_turn', kind: 'tilt_turn', label: 'Oscilobatiente' },
  { id: 'tilt', kind: 'tilt', label: 'Oscilante' },
  { id: 'awning', kind: 'awning', label: 'Proyectante' },
  { id: 'door', kind: 'door', label: 'Puerta' },
]

export const HINGED: OpeningKind[] = ['casement', 'tilt_turn', 'door']
export const DIRECTIONAL: OpeningKind[] = ['casement', 'door']

/** Apertura que resulta de elegir un preset conservando bisagra y sentido cuando tienen sentido. */
export function presetOpening(preset: OpeningPreset, current: Opening | undefined): Opening {
  const hinge = preset.hinge ?? current?.hinge ?? 'left'
  switch (preset.kind) {
    case 'fixed':
      return { kind: 'fixed' }
    case 'casement':
      return { kind: 'casement', hinge, direction: current && DIRECTIONAL.includes(current.kind) ? openingDirection(current) : 'in' }
    case 'tilt_turn':
      return { kind: 'tilt_turn', hinge, direction: 'in' }
    case 'tilt':
      return { kind: 'tilt', direction: 'in' }
    case 'awning':
      return { kind: 'awning', direction: 'out' }
    case 'door':
      return { kind: 'door', hinge, direction: current?.kind === 'door' ? openingDirection(current) : 'in' }
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
  return openingDirection(a ?? { kind: ka }) === openingDirection(b ?? { kind: kb })
}

export function applyOpeningPreset(design: WindowDesign, nodeId: string, preset: OpeningPreset): Change | null {
  const node = findNode(design, nodeId)
  if (!node || node.type !== 'leaf') return null
  const opening = presetOpening(preset, node.opening)
  if (sameOpening(opening, node.opening)) return null
  const next = setOpening(design, nodeId, opening)
  return changed(design, next, openingLabel(opening) === 'Fijo' ? 'Paño fijo' : `Apertura: ${openingLabel(opening)}`)
}

export function flipHinge(design: WindowDesign, nodeId: string): Change | null {
  const node = findNode(design, nodeId)
  if (!node || node.type !== 'leaf' || !HINGED.includes(node.opening?.kind)) return null
  const hinge = node.opening.hinge === 'right' ? 'left' : 'right'
  return changed(design, setOpening(design, nodeId, { ...node.opening, hinge }), `Bisagras a la ${hinge === 'left' ? 'izquierda' : 'derecha'}`)
}

export function setDirection(design: WindowDesign, nodeId: string, direction: 'in' | 'out'): Change | null {
  const node = findNode(design, nodeId)
  if (!node || node.type !== 'leaf' || node.opening?.kind === 'fixed') return null
  if (openingDirection(node.opening) === direction) return null
  return changed(design, setOpening(design, nodeId, { ...node.opening, direction }), direction === 'in' ? 'Abre hacia adentro' : 'Abre hacia afuera')
}

export function setHinge(design: WindowDesign, nodeId: string, hinge: 'left' | 'right'): Change | null {
  const node = findNode(design, nodeId)
  if (!node || node.type !== 'leaf' || !HINGED.includes(node.opening?.kind)) return null
  if ((node.opening.hinge ?? 'left') === hinge && node.opening.hinge) return null
  return changed(design, setOpening(design, nodeId, { ...node.opening, hinge }), `Bisagras a la ${hinge === 'left' ? 'izquierda' : 'derecha'}`)
}

// ─── Divisiones ──────────────────────────────────────────────────────────────

export function splitAction(design: WindowDesign, nodeId: string, dir: 'vertical' | 'horizontal', parts: 2 | 3 | 4 = 2): Change | null {
  const next = splitNode(design, nodeId, dir, parts)
  return changed(design, next, `Dividir en ${parts} ${dir === 'vertical' ? '(vertical)' : '(horizontal)'}`)
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
  const label = node.type === 'split' && index !== undefined ? 'Quitar travesaño' : 'Quitar división'
  return changed(design, next, label)
}

export function canRemoveDivision(design: WindowDesign, nodeId: string | null): boolean {
  if (!nodeId) return false
  const node = findNode(design, nodeId)
  if (!node || node.type === 'sliding') return false
  return node.type === 'split' || Boolean(findParent(design, nodeId))
}

/** División vertical donde vive el paño (para la unión francesa). */
export function frenchHost(design: WindowDesign, nodeId: string): SplitNode | null {
  const node = findNode(design, nodeId)
  if (!node) return null
  if (node.type === 'split') return node.dir === 'vertical' ? node : null
  const info = findParent(design, nodeId)
  return info && info.parent.dir === 'vertical' ? info.parent : null
}

export function toggleFrench(design: WindowDesign, splitId: string): Change | null {
  const node = findNode(design, splitId)
  if (!node || node.type !== 'split' || node.dir !== 'vertical') return null
  const joint = node.joint === 'french' ? 'mullion' : 'french'
  return changed(design, setJoint(design, splitId, joint), joint === 'french' ? 'Unión francesa' : 'Travesaño fijo')
}

/** Reparte una división en partes iguales (medidas automáticas). */
export function equalizeSplit(design: WindowDesign, splitId: string): Change | null {
  const node = findNode(design, splitId)
  if (!node || node.type !== 'split') return null
  if (node.sizes.every((s) => s === null || s === undefined)) return null
  const root = mapNode(design.root, splitId, (n) => ({ ...(n as SplitNode), sizes: (n as SplitNode).children.map(() => null) }))
  return { design: { ...design, root }, label: 'Repartir en partes iguales' }
}

// ─── Vidrio y relleno ────────────────────────────────────────────────────────

export function setNodeGlass(design: WindowDesign, nodeId: string, glassId: string, catalog?: Catalog): Change | null {
  const name = catalog?.glass.find((g) => g.id === glassId)?.name
  return changed(design, setGlass(design, nodeId, glassId), name ? `Vidrio del paño: ${name}` : 'Vidrio del paño')
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
    return { design: { ...design, root: { ...root, panels } }, label: 'Vidrio igual que la ventana' }
  }
  const node = findNode(design, nodeId)
  if (!node || node.type !== 'leaf' || !node.glassId) return null
  const nextRoot = mapNode(design.root, nodeId, (n) => {
    const { glassId: _drop, ...rest } = n as LeafNode
    return rest as LeafNode
  })
  return { design: { ...design, root: nextRoot }, label: 'Vidrio igual que la ventana' }
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

export function setFill(design: WindowDesign, nodeId: string, fill: 'glass' | 'panel'): Change | null {
  const node = findNode(design, nodeId)
  if (!node || node.type !== 'leaf' || (node.fill ?? 'glass') === fill) return null
  const root = mapNode(design.root, nodeId, (n) => ({ ...(n as LeafNode), fill }))
  return { design: { ...design, root }, label: fill === 'panel' ? 'Panel ciego' : 'Paño con vidrio' }
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
  return changed(design, next, kind === 'fixed' ? 'Hoja fija' : 'Hoja móvil')
}

export function setPanelDirection(design: WindowDesign, panelId: string, direction: 'left' | 'right'): Change | null {
  const root = design.root
  if (root?.type !== 'sliding') return null
  const panel = root.panels.find((p) => p.id === panelId)
  if (!panel || (panel.kind === 'moving' && panel.direction === direction)) return null
  const next = updatePanels(design, (panels) => panels.map((p) => (p.id === panelId ? { ...p, kind: 'moving', direction } : p)))
  return changed(design, next, `Abre hacia la ${direction === 'left' ? 'izquierda' : 'derecha'}`)
}

export function setPanelCount(design: WindowDesign, count: number): Change | null {
  const root = design.root
  if (root?.type !== 'sliding' || root.panels.length === count) return null
  return changed(design, setSlidingPanels(design, count), `Corredera de ${count} hojas`)
}

export function setRails(design: WindowDesign, rails: 1 | 2 | 3): Change | null {
  const root = design.root
  if (root?.type !== 'sliding' || root.rails === rails) return null
  return changed(design, setSlidingPanels(design, root.panels, rails), rails === 1 ? 'Monorriel' : `${rails} rieles`)
}
