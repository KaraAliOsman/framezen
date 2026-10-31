import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isMac } from './useShortcut'

/** En tablet (menos de 1280 px) la barra lateral parte en modo iconos si nunca la elegiste. */
export const SIDEBAR_AUTO_COLLAPSE_QUERY = '(max-width: 1279px)'

function screenWantsCollapsed(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(SIDEBAR_AUTO_COLLAPSE_QUERY).matches
}

/** Estado de la interfaz del shell (barra lateral, paleta de comandos, menú móvil). */
interface ShellState {
  sidebarCollapsed: boolean
  /** La persona eligió contraer o expandir: se respeta siempre. Si no, la barra sigue el ancho de pantalla. */
  sidebarPinned: boolean
  commandOpen: boolean
  mobileNavOpen: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  /** Vuelve a mirar el ancho de pantalla (solo si la persona no eligió). */
  syncSidebarToScreen: () => void
  setCommandOpen: (open: boolean) => void
  setMobileNavOpen: (open: boolean) => void
}

type PersistedShell = Partial<Pick<ShellState, 'sidebarCollapsed' | 'sidebarPinned'>>

export const useShellStore = create<ShellState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: screenWantsCollapsed(),
      sidebarPinned: false,
      commandOpen: false,
      mobileNavOpen: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed, sidebarPinned: true })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed, sidebarPinned: true }),
      syncSidebarToScreen: () => {
        const collapsed = screenWantsCollapsed()
        if (!get().sidebarPinned && get().sidebarCollapsed !== collapsed) set({ sidebarCollapsed: collapsed })
      },
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
    }),
    {
      name: 'fz-shell',
      version: 1,
      // Solo se guarda una elección explícita; sin ella, cada pantalla decide su valor por defecto.
      partialize: (s): PersistedShell => (s.sidebarPinned ? { sidebarCollapsed: s.sidebarCollapsed, sidebarPinned: true } : {}),
      // v0 guardaba siempre `sidebarCollapsed` (false por defecto): solo «contraída» era una elección.
      migrate: (persisted, version): PersistedShell => {
        const old = (persisted ?? {}) as PersistedShell
        if (version === 0) return old.sidebarCollapsed ? { sidebarCollapsed: true, sidebarPinned: true } : {}
        return old
      },
    },
  ),
)

/**
 * Puente con Marco (el asistente). El panel real lo implementa la zona del asistente;
 * el shell y la paleta solo abren/cierran y le pasan una pregunta inicial.
 */
interface AssistantState {
  open: boolean
  /** Pregunta pendiente que el panel debe tomar al abrirse (p. ej. desde ⌘K). */
  pendingPrompt: string | null
  setOpen: (open: boolean) => void
  toggle: () => void
  ask: (prompt: string) => void
  takePrompt: () => string | null
}

export const useAssistantStore = create<AssistantState>()((set, get) => ({
  open: false,
  pendingPrompt: null,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  ask: (prompt) => set({ open: true, pendingPrompt: prompt }),
  takePrompt: () => {
    const prompt = get().pendingPrompt
    if (prompt !== null) set({ pendingPrompt: null })
    return prompt
  },
}))

/**
 * Abre o cierra a Marco igual que ⌘J / Ctrl+J (incluye «expandir si estaba minimizado», que
 * decide el panel). Si el panel no está montado para atender el atajo, abre o cierra el puente.
 */
export function toggleAssistant(): void {
  if (typeof window !== 'undefined') {
    const mac = isMac()
    const event = new KeyboardEvent('keydown', { key: 'j', code: 'KeyJ', ctrlKey: !mac, metaKey: mac, bubbles: true, cancelable: true })
    window.dispatchEvent(event)
    if (event.defaultPrevented) return
  }
  useAssistantStore.getState().toggle()
}
