import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { EditorState, QuoteEditor } from '../model/store'

/** Estado de interfaz del editor (no entra al historial ni se guarda). */
export interface EditorUiState {
  pickerOpen: boolean
  sendOpen: boolean
  /** Inspector como hoja lateral (tablet). */
  inspectorOpen: boolean
  /** Hoja inferior del teléfono. */
  mobileSheet: 'item' | 'totals' | 'document' | null
  /** Escala del documento: calza el ancho del panel o tamaño real (100 %). */
  docZoom: 'fit' | 'actual'
  /** Qué pidió quien abrió «Enviar al cliente» (p. ej. copiar el enlace apenas esté listo). */
  sendIntent: 'copy' | null
  /** Aviso de precios cambiados que cerraste («enviado:ahora»); vuelve si cambian las cifras. */
  driftDismissed: string | null
  set: (patch: Partial<Omit<EditorUiState, 'set'>>) => void
}

export function createEditorUi(initial: Partial<Omit<EditorUiState, 'set'>> = {}): StoreApi<EditorUiState> {
  return createStore<EditorUiState>((set) => ({
    pickerOpen: false,
    sendOpen: false,
    inspectorOpen: false,
    mobileSheet: null,
    docZoom: 'fit',
    sendIntent: null,
    driftDismissed: null,
    ...initial,
    set: (patch) => set(patch),
  }))
}

const EditorContext = createContext<QuoteEditor | null>(null)
const UiContext = createContext<StoreApi<EditorUiState> | null>(null)

export function EditorProvider({ editor, ui, children }: { editor: QuoteEditor; ui: StoreApi<EditorUiState>; children: ReactNode }) {
  return (
    <EditorContext.Provider value={editor}>
      <UiContext.Provider value={ui}>{children}</UiContext.Provider>
    </EditorContext.Provider>
  )
}

export function useEditorUi<T>(selector: (state: EditorUiState) => T): T {
  const ui = useContext(UiContext)
  if (!ui) throw new Error('useEditorUi debe usarse dentro de <EditorProvider>')
  return useStore(ui, selector)
}

export function useEditorUiApi(): StoreApi<EditorUiState> {
  const ui = useContext(UiContext)
  if (!ui) throw new Error('useEditorUiApi debe usarse dentro de <EditorProvider>')
  return ui
}

export function useEditor(): QuoteEditor {
  const editor = useContext(EditorContext)
  if (!editor) throw new Error('useEditor debe usarse dentro de <EditorProvider>')
  return editor
}

/** Lee el estado del editor (selector fino; con objetos usa `useEditorShallow`). */
export function useEditorState<T>(selector: (state: EditorState) => T): T {
  return useStore(useEditor().store, selector)
}

export function useEditorShallow<T extends object>(selector: (state: EditorState) => T): T {
  return useStore(useEditor().store, useShallow(selector))
}

/** Ventana seleccionada con su precio y despiece calculados. */
export function useSelectedItem() {
  return useEditorShallow((s) => {
    const index = s.selectedItemId ? s.doc.items.findIndex((i) => i.id === s.selectedItemId) : -1
    const item = index >= 0 ? s.doc.items[index] : undefined
    const evaluated = index >= 0 ? s.evaluation.items[index] : undefined
    return { item, index, evaluated }
  })
}

/** `matchMedia` reactivo. */
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : true)
  const [matches, setMatches] = useState(get)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}
