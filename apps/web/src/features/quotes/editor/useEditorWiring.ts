/**
 * Conexiones del editor con el resto de la app: atajos de teclado, puente del asistente,
 * aviso al salir con cambios sin guardar y reintento al volver la conexión.
 */
import { useEffect } from 'react'
import type { Client, DocLocale, Quote } from '@dekopen/shared'
import { api } from '../../../lib/api'
import { translate } from '../../../lib/i18n'
import { isTypingTarget, matchesShortcut, parseShortcut, useShortcut } from '../../../lib/useShortcut'
import { registerQuoteEditor, type QuoteEditorBridge } from '../../assistant/bridge'
import es from '../i18n/es'
import { ql, type UndoLabel } from '../model/history'
import type { QuoteEditor } from '../model/store'
import { useEditor, useEditorUiApi } from './context'
import { toast, toastUndo } from './toasts'

function inDialog(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('[role="dialog"], [role="menu"], [role="listbox"]')
}

function historyToast(kind: 'undo' | 'redo', label: string, editor: QuoteEditor) {
  toast(translate(es, kind === 'undo' ? 'toast.undone' : 'toast.redone', { label }), {
    id: 'fz-history',
    duration: 2500,
    action: kind === 'undo' ? { label: translate(es, 'toast.redo'), onClick: () => editor.redo() } : { label: translate(es, 'toast.undo'), onClick: () => editor.undo() },
  })
}

/** Ancho de la ventana elegida en el inspector, listo para reescribir (también tras duplicar). */
export function focusItemWidth(ui: ReturnType<typeof useEditorUiApi>) {
  ui.getState().set({ inspectorTab: 'item', inspectorOpen: true })
  // La hoja del inspector puede tardar unos cuadros en montarse.
  let tries = 12
  const attempt = () => {
    const field = document.querySelector<HTMLInputElement>('input[data-item-width]')
    if (field) field.focus()
    else if (tries-- > 0) requestAnimationFrame(attempt)
  }
  requestAnimationFrame(attempt)
}

/** Duplica la ventana y deja el cursor en su ancho: lo normal es cambiarle la medida. */
export function duplicateAndFocus(editor: QuoteEditor, ui: ReturnType<typeof useEditorUiApi>, id: string) {
  if (editor.duplicateItem(id)) focusItemWidth(ui)
}

/** Borra la ventana seleccionada con «Deshacer» en el aviso (nunca un diálogo). */
export function removeWithUndo(editor: QuoteEditor, id: string) {
  const removed = editor.removeItem(id)
  if (removed) toastUndo(translate(es, 'inspector.removed', { ref: removed.ref }), () => editor.undo())
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
    if (id) duplicateAndFocus(editor, ui, id)
  })
  // Sin nada enfocado, Enter sigue agregando (después de crear una ventana, por ejemplo).
  useShortcut(
    'enter',
    (e) => {
      if (blocked(e) || e.target !== document.body) return
      e.preventDefault()
      ui.getState().set({ pickerOpen: true })
    },
    { preventDefault: false },
  )
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

  // Tras duplicar o agregar, el cursor queda en un campo sin tocar: ahí Ctrl+Z no tendría nada que
  // deshacer en el navegador, así que deshace en la cotización. Si ya se escribió, manda el campo.
  useEffect(() => {
    const undo = parseShortcut('mod+z')
    const redo = [parseShortcut('shift+mod+z'), parseShortcut('mod+y')]
    let typed = false
    const onFocus = () => {
      typed = false
    }
    const onInput = () => {
      typed = true
    }
    const onKey = (e: KeyboardEvent) => {
      if (typed || !isTypingTarget(e.target) || inDialog(e.target)) return
      const isUndo = matchesShortcut(e, undo)
      if (!isUndo && !redo.some((r) => matchesShortcut(e, r))) return
      e.preventDefault()
      const label = isUndo ? editor.undo() : editor.redo()
      if (label) historyToast(isUndo ? 'undo' : 'redo', label, editor)
    }
    document.addEventListener('focusin', onFocus)
    document.addEventListener('input', onInput, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('input', onInput, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [editor])
}

/**
 * Métodos adicionales del puente (aditivos al contrato `QuoteEditorBridge` de assistant/bridge.ts):
 * el panel del asistente puede usarlos con `getQuoteEditor() as QuoteEditorBridge & Partial<QuoteEditorBridgeExtras>`.
 */
export interface QuoteEditorBridgeExtras {
  /** Nombre del asistente que actúa (para las etiquetas de deshacer: «Marco editó V1»). */
  setActorName(name: string | null): void
  /** Termina de guardar antes de un turno del asistente (lanza si los cambios no llegaron al servidor). */
  flush(): Promise<void>
  /**
   * Adopta los cambios que el asistente hizo en el servidor como **un solo paso de deshacer**
   * («Cambios de Marco»), fusionando lo que hubiera sin guardar. Devuelve si cambió algo.
   */
  applyServerChanges(quote: Quote, actorName?: string): boolean
  /** Vuelve a leer la cotización del servidor y la adopta como un paso de deshacer. */
  refreshFromServer(actorName?: string): Promise<boolean>
  /** Diseño (plantilla) del documento de esta cotización; `null` = el de la organización. */
  setDocumentTemplate(templateId: string | null): void
  /** Idioma del documento (PDF, portal, mensajes); `null` = el de la organización. */
  setDocumentLocale(locale: DocLocale | null): void
  /** Abre «Enviar al cliente». */
  openSend(): void
  /** Abre la galería «Agregar ventana». */
  openTypologyPicker(): void
  /** Cierra la galería «Agregar ventana» (el asistente creó la cotización y el diálogo tapa su panel). */
  closeTypologyPicker(): void
}

/** Registra el editor en el puente del asistente: cada operación entra al historial de deshacer. */
export function useAssistantBridge() {
  const editor = useEditor()
  const ui = useEditorUiApi()
  useEffect(() => {
    let actor: string | null = null
    const bot = (name?: string | null): string | UndoLabel => name?.trim() || actor || ql('history.assistantDefault')
    const refOf = (id: string): string | UndoLabel => editor.get().doc.items.find((i) => i.id === id)?.ref ?? ql('history.theWindow')
    const bridge: QuoteEditorBridge & QuoteEditorBridgeExtras = {
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
      updateItem: (itemId, patch) => editor.updateItem(itemId, patch, ql('history.assistantEdit', { bot: bot(), ref: refOf(itemId) }), `assistant:${itemId}`),
      updateDesign: (itemId, fn) => editor.updateDesign(itemId, fn, ql('history.assistantDesign', { bot: bot(), ref: refOf(itemId) })),
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
      currentView: () => (editor.get().view === 'document' ? 'document' : 'design'),
      // ── Extras (aditivos) ──
      setActorName: (name) => {
        actor = name?.trim() || null
      },
      flush: () => editor.ensureSaved(),
      applyServerChanges: (quote, actorName) => editor.applyRemoteChanges(quote, ql('history.assistantBatch', { bot: bot(actorName) })),
      refreshFromServer: async (actorName) => {
        const quote = await api.quotes.get(editor.get().meta.id)
        return editor.applyRemoteChanges(quote, ql('history.assistantBatch', { bot: bot(actorName) }))
      },
      setDocumentTemplate: (templateId) => editor.setDocumentOverride({ templateId }, ql('history.template', { name: templateId ?? '—' })),
      setDocumentLocale: (locale) => editor.setDocumentOverride({ locale }, ql('history.locale', { name: locale ?? '—' })),
      openSend: () => ui.getState().set({ sendOpen: true, sendIntent: null }),
      openTypologyPicker: () => ui.getState().set({ pickerOpen: true }),
      closeTypologyPicker: () => ui.getState().set({ pickerOpen: false }),
    }
    return registerQuoteEditor(bridge)
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
