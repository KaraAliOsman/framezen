/**
 * API pública del asistente para otras pantallas (shell, ajustes, editor de cotizaciones).
 * Lo demás de esta carpeta es interno.
 */
export { AssistantRoot, DESKTOP_INSET } from './AssistantRoot'
export { AssistantEditorDialog, type AssistantEditorDialogProps } from './panel/AssistantEditor'
export { BotFace, type BotFaceProps } from './panel/BotFace'
export { openAssistantEditor, openAssistantMemory, useAssistantUi } from './uiState'
export { useAssistantCommandRows } from './palette'
export { useAssistants, useAssistantStatus, assistantKeys, assistantName, pickAssistant } from './v2/queries'
export { registerQuoteEditor, getQuoteEditor, onQuoteEditorChange, waitForEditor, type QuoteEditorBridge } from './bridge'
export { useAssistantPanelState, useAssistantPlace, type AssistantPanelState, type AssistantPlace } from './dock'
export { endAssistantSession } from './session'
