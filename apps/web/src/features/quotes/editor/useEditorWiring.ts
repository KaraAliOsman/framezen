/**
 * Conexiones del editor con el resto de la app: atajos de teclado, puente del asistente,
 * aviso al salir con cambios sin guardar y reintento al volver la conexión.
 */
import { useEffect } from 'react'
import type { Client } from '@framezen/shared'
import { api } from '../../../lib/api'
import { useShortcut } from '../../../lib/useShortcut'

import { toast, toastUndo } from './toasts'
import { registerQuoteEditor } from '../../assistant/bridge'
import type { QuoteEditor } from '../model/store'
import { useEditor, useEditorUiApi } from './context'

function inDialog(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('[role="dialog"], [role="menu"], [role="listbox"]')
}

function historyToast(kind: 'undo' | 'redo', label: string, editor: QuoteEditor) {
  toast(kind === 'undo' ? `Deshiciste: ${label}` : `Rehiciste: ${label}`, {
    id: 'fz-history',
    duration: 2500,
    action: kind === 'undo' ? { label: 'Rehacer', onClick: () => editor.redo() } : { label: 'Deshacer', onClick: () => editor.undo() },
  })
}

/** Borra la ventana seleccionada con «Deshacer» en el aviso (nunca un diálogo). */
export function removeWithUndo(editor: QuoteEditor, id: string) {
  const removed = editor.removeItem(id)
  if (removed) toastUndo(`Eliminaste la ${removed.ref}.`, () => editor.undo())
}

export function useEditorShortcuts() {
  const editor = useEditor()
  const ui = useEditorUiApi()
  const blocked = (e: KeyboardEvent) => inDialog(e.target) || ui.getState().pickerOpen || ui.getState().sendOpen

  useShortcut('a', (e) => {
    if (blocked(e)) return
    ui.getState().set({ pickerOpen: true })
  })
  useShortcut('d', (e) => {
    if (blocked(e)) return
    const id = editor.get().selectedItemId
    if (id) editor.duplicateItem(id)
  })
  useShortcut(
    ['delete', 'backspace'],
    (e) => {
      if (blocked(e)) return
      const state = editor.get()
      // Con un paño seleccionado en el lienzo, Supr es del diseñador.
      if (state.selectedNodeId && state.view === 'design') return
      if (!state.selectedItemId) return
      e.preventDefault()
      removeWithUndo(editor, state.selectedItemId)
    },
    { preventDefault: false },
  )
  useShortcut(['1', '2', '3', '4', '5', '6', '7', '8', '9'], (e) => {
    if (blocked(e)) return
    const item = editor.get().doc.items[Number(e.key) - 1]
    if (item) editor.select(item.id)
  })
  useShortcut('mod+z', (e) => {
    if (inDialog(e.target)) return
    const label = editor.undo()
    if (label) historyToast('undo', label, editor)
  })
  useShortcut(['shift+mod+z', 'mod+y'], (e) => {
    if (inDialog(e.target)) return
    const label = editor.redo()
    if (label) historyToast('redo', label, editor)
  })
}

/** Registra el editor en el puente de Marco: cada operación entra al historial de deshacer. */
export function useAssistantBridge() {
  const editor = useEditor()
  const ui = useEditorUiApi()
  useEffect(() => {
    const refOf = (id: string) => editor.get().doc.items.find((i) => i.id === id)?.ref ?? 'la ventana'
    return registerQuoteEditor({
      quoteId: editor.get().meta.id,
      getQuote: () => editor.getQuote(),
      getCatalog: () => editor.get().catalog,
      selectedItemId: () => editor.get().selectedItemId,
      addItem: (design, opts = {}) => {
        const id = editor.addItem({ design, ...opts })
        // La ventana ya está: la galería «Agregar ventana» (si estaba abierta) sobra.
        ui.getState().set({ pickerOpen: false })
        return id
      },
      updateItem: (itemId, patch) => editor.updateItem(itemId, patch, `Marco editó ${refOf(itemId)}`, `assistant:${itemId}`),
      updateDesign: (itemId, fn) => editor.updateDesign(itemId, fn, `Marco cambió ${refOf(itemId)}`),
      removeItem: (itemId) => {
        editor.removeItem(itemId)
      },
      duplicateItem: (itemId) => editor.duplicateItem(itemId) ?? '',
      setDiscount: (pct) => editor.setDiscount(pct),
      setTitle: (title) => editor.setTitle(title),
      setClient: (clientId) => {
        const known = clientId ? editor.get().clients[clientId] : undefined
        editor.setClient(clientId, known)
        if (clientId && !known) {
          api.clients.get(clientId).then(
            (client: Client) => editor.rememberClient(client),
            () => undefined,
          )
        }
      },
      selectItem: (itemId) => editor.select(itemId),
      showDocument: () => editor.setView('document'),
      showDesign: () => editor.setView('design'),
    })
  }, [editor, ui])
}

/**
 * Aviso del navegador al cerrar con cambios sin guardar, reintento al volver la red y, al ocultar
 * o cerrar la pestaña, borrador local al día (el navegador puede descartarla sin avisar).
 */
export function useLeaveGuard() {
  const editor = useEditor()
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (editor.isSafeToLeave()) return
      editor.persistLocal()
      void editor.flush()
      event.preventDefault()
      event.returnValue = ''
    }
    const onOnline = () => editor.retrySave()
    const onHide = () => {
      if (!editor.isSafeToLeave()) editor.persistLocal()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('online', onOnline)
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [editor])
}
