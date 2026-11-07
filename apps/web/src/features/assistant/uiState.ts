/**
 * Superficies secundarias del asistente (no se guardan): el editor de asistentes y el gestor de
 * memoria. Cualquier pantalla puede abrirlas (Ajustes › Asistentes, una instrucción del servidor…).
 */
import { create } from 'zustand'

interface AssistantUiState {
  /** Editor abierto: `id` = editar ese asistente; sin id = crear uno nuevo. */
  editor: { id?: string } | null
  memoryOpen: boolean
  openEditor(id?: string): void
  closeEditor(): void
  setMemoryOpen(open: boolean): void
}

export const useAssistantUi = create<AssistantUiState>()((set) => ({
  editor: null,
  memoryOpen: false,
  openEditor: (id) => set({ editor: id ? { id } : {} }),
  closeEditor: () => set({ editor: null }),
  setMemoryOpen: (memoryOpen) => set({ memoryOpen }),
}))

/** Abre el editor de asistentes (crear sin id, editar con id). */
export function openAssistantEditor(id?: string): void {
  useAssistantUi.getState().openEditor(id)
}

/** Abre el gestor de memoria del asistente activo. */
export function openAssistantMemory(): void {
  useAssistantUi.getState().setMemoryOpen(true)
}
