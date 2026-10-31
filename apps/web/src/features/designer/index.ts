/**
 * Diseñador de ventanas de Framezen (el corazón del producto).
 *
 *   <DesignCanvas design catalog onChange selectedNodeId onSelect view? onViewChange? readOnly? className? />
 *   <TypologyPicker open onOpenChange catalog defaults onCreate />
 *   <WindowSettings design catalog onChange />
 *   <NodeInspector design catalog nodeId onChange />
 *   <DesignThumbnail design catalog size? />
 *
 * `onChange(next, label)`: `label` es un texto corto y estable para el historial de deshacer
 * («Mover travesaño», «Cambiar ancho»…); los cambios continuos repiten el mismo texto para que
 * el historial pueda agruparlos (useUndo con mergeKey = label).
 */
export { DesignCanvas, type DesignCanvasProps } from './DesignCanvas'
export { TypologyPicker, type TypologyPickerProps } from './TypologyPicker'
export { WindowSettings, type WindowSettingsProps } from './WindowSettings'
export { NodeInspector, type NodeInspectorProps } from './NodeInspector'
export { DesignThumbnail, cachedLayout, type DesignThumbnailProps } from './DesignThumbnail'
export { parseMeasureExpression, parseSizeExpression } from './lib/measure'
export { snapMullion, type SnapResult } from './lib/snap'
export { applyDimension, dimensionTarget } from './lib/dimensions'
export { resolveSelection, selectableIds, nodeTitle, nodeSummary, type Selection, type Change } from './lib/actions'
export { defaultGlassId, preferredGlass, glassComposition, isClearDvh, type DesignDefaults } from './lib/catalog'
