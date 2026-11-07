/**
 * Diseñador de ventanas de DEKOPEN (el corazón del producto).
 *
 *   <DesignCanvas design catalog onChange selectedNodeId onSelect view? onViewChange? readOnly? className? />
 *   <TypologyPicker open onOpenChange catalog defaults onCreate />
 *   <WindowSettings design catalog onChange />
 *   <NodeInspector design catalog nodeId onChange />
 *   <DesignThumbnail design catalog size? />
 *
 * `onChange(next, label, undo?)`:
 *   - `label` es el texto del paso en el idioma actual de la interfaz («Mover travesaño»,
 *     «Cambiar ancho»…), como siempre: en español es idéntico al de v4.
 *   - `undo` = `{ key, params }` es la **identidad estable** del paso. Úsala como clave de
 *     agrupación del historial (`useUndo` mergeKey = `undo.key`, más el id de la ventana): los
 *     cambios continuos repiten la misma clave y el agrupamiento ya no depende del idioma. Para
 *     mostrar el paso en otro idioma (o tras cambiar de idioma), `undoText(undo, locale?)`.
 */
export { DesignCanvas, type DesignCanvasProps } from './DesignCanvas'
export { TypologyPicker, type PickerCreateMeta, type TypologyPickerProps } from './TypologyPicker'
export { WindowSettings, type WindowSettingsProps } from './WindowSettings'
export { NodeInspector, type NodeInspectorProps } from './NodeInspector'
export { DesignThumbnail, cachedLayout, type DesignThumbnailProps } from './DesignThumbnail'
export { parseMeasureExpression, parseSizeExpression } from './lib/measure'
export { snapMullion, type SnapResult } from './lib/snap'
export { applyDimension, dimensionTarget } from './lib/dimensions'
export { resolveSelection, selectableIds, nodeTitle, nodeSummary, type Selection, type Change } from './lib/actions'
export { defaultGlassId, preferredGlass, glassComposition, isClearDvh, type DesignDefaults } from './lib/catalog'
export { undoText, type UndoKey, type UndoLabel } from './lib/undo'
export { designCaption, openingName, openingDetail } from './lib/text'
export { typologyGroup, typologyLabel, TYPOLOGY_GROUPS, type TypologyGroupId } from './lib/typologies'
export { swatchAppearance, type SwatchAppearance } from './lib/appearance'
export { ColorPicker, type ColorPickerProps } from './parts/ColorPicker'
