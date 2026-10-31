// Núcleo del motor: tipologías, operaciones del editor, geometría para dibujo, despiece y avisos.
export { TYPOLOGIES, getTypology, createDesign } from './typologies'
export type { CreateDesignOptions } from './typologies'
export { nextId } from './ids'
export { findNode, findPanel, findParent, mapNode, nodePath, walkNodes, collectLeaves } from './tree'
export { resolveSizes } from './sizes'
export {
  setSize,
  setNodeSize,
  setMullionAxis,
  splitNode,
  mergeNode,
  setJoint,
  setOpening,
  setGlass,
  setColor,
  setShape,
  setLine,
  setSlidingPanels,
} from './operations'
export { computeLayout } from './layout'
export { computeBom, glassNetThickness } from './bom'
export { describeDesign, designName, matchTypology, openingLabel } from './describe'
export { evaluateHardware, ruleApplies, ruleQty } from './hardware'
export type { HardwareEvaluation, HardwareTargetKind } from './hardware'
export { DEFAULT_PAUTA, MIN_PANE_MM, GLASS_LIMITS } from './defaults'
export { PAUTA_LABELS, mergePauta, sanitizePauta, openingDirection } from './pauta'
export type { DesignExtrasOverrides, LinePautaOverrides, LineWithOverrides } from './pauta'
