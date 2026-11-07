// Núcleo del motor: tipologías, operaciones del editor, geometría para dibujo, despiece y avisos.
export { TYPOLOGIES, getTypology, createDesign, isTypologyId, lineFabricates, verticalSashProfile } from './typologies'
export type { CreateDesignOptions } from './typologies'
export { nextId } from './ids'
export { findNode, findPanel, findParent, mapNode, nodePath, walkNodes, collectLeaves } from './tree'
export { resolveSizes } from './sizes'
export { listPanes, resizePanes, type PaneInfo, type PaneProblem, type PaneResize, type PaneResizeResult } from './panes'
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
  setSlidingSystem,
  setPassiveLeaf,
  setExtras,
  setZocalo,
  normalizeOpening,
} from './operations'
export {
  ASSEMBLY_ANGLE_LIMITS,
  ASSEMBLY_FACET_LIMITS,
  ASSEMBLY_PRESETS,
  ASSEMBLY_PRESET_IDS,
  UNIT_NODE_SEP,
  angleAllowed,
  assemblyKindOf,
  assemblyOptions,
  assemblyUnits,
  couplingOf,
  createAssembly,
  findUnit,
  foldAngle,
  invertAssembly,
  isAssembly,
  joinWindow,
  lineCoupling,
  lineFrameAddons,
  mapUnitDesigns,
  mapUnits,
  mirrorAssembly,
  parseUnitNodeId,
  placeAssembly,
  presetAvailability,
  removeUnit,
  resolveJoint,
  setAssemblyAlign,
  setAssemblyAngle,
  setAssemblyFront,
  setAssemblyJoint,
  setUnitSize,
  syncAssembly,
  unitNodeId,
  updateUnit,
} from './assembly'
export type {
  AssemblyOptions,
  AssemblyPlacement,
  AssemblyPreset,
  AssemblyPresetId,
  CreateAssemblyOptions,
  JointResolution,
  LineCoupling,
  PlacedJoint,
  PlacedUnit,
  PresetAvailability,
  UnitSide,
} from './assembly'
export { computeLayout } from './layout'
export { computeBom, glassNetThickness, OPENING_LIMIT_NAMES } from './bom'
export { roleSubject } from './context'
export { describeDesign, designName, matchTypology, openingLabel } from './describe'
export { evaluateHardware, ruleApplies, ruleQty, HARDWARE_KIND_NAMES } from './hardware'
export type { HardwareEvaluation, HardwareTarget, HardwareTargetKind } from './hardware'
export {
  DEFAULT_PAUTA,
  MIN_PANE_MM,
  GLASS_LIMITS,
  OPENING_SIZE_LIMITS,
  ELEMENT_MAX_WIDTH,
  MAX_SLIDING_PANELS,
  FOLD_GAP_MM,
  BENDING_GRIP_MM,
  ROLLER_SHUTTER_BOX_MM,
} from './defaults'
export type { OpeningLimitClass } from './defaults'
export { PAUTA_LABELS, mergePauta, sanitizePauta, openingDirection, isDoorLeaf, isFloorLeaf } from './pauta'
export { normalizeExtras } from './context'
export type { NormalizedExtras } from './context'
export { ellipsePerimeter, isSemicircularArch, regularChamfer } from './shapes'
export type { DesignExtrasOverrides, LinePautaOverrides, LineWithOverrides } from './pauta'
