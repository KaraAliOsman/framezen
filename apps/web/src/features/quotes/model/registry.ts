/**
 * Editores abiertos por cotización. Al salir de la pantalla el editor termina de guardar; si no
 * hay conexión sigue vivo reintentando, y al volver a la misma cotización se reutiliza con todos
 * tus cambios (nunca se pierde trabajo por navegar).
 */
import type { QuoteEditor } from './store'

interface Entry {
  editor: QuoteEditor
  users: number
  unsubscribe?: () => void
}

const entries = new Map<string, Entry>()

export function acquireEditor(id: string, create: () => QuoteEditor): QuoteEditor {
  const existing = entries.get(id)
  if (existing) return existing.editor
  const editor = create()
  entries.set(id, { editor, users: 0 })
  return editor
}

export function retainEditor(id: string): void {
  const entry = entries.get(id)
  if (!entry) return
  entry.users++
  entry.unsubscribe?.()
  entry.unsubscribe = undefined
}

function cleanup(id: string, entry: Entry) {
  if (entries.get(id) !== entry || entry.users > 0) return
  if (!entry.editor.isSafeToLeave()) return
  entry.unsubscribe?.()
  entry.editor.dispose()
  entries.delete(id)
}

/** Suelta el editor: guarda lo pendiente y, cuando ya no queda nada por guardar, lo libera. */
export function releaseEditor(id: string, onSaved?: (editor: QuoteEditor) => void): void {
  const entry = entries.get(id)
  if (!entry) return
  entry.users = Math.max(0, entry.users - 1)
  // Se decide después del ciclo actual (StrictMode desmonta y monta en el mismo commit).
  setTimeout(() => {
    if (entry.users > 0) return
    void entry.editor.flush().finally(() => {
      onSaved?.(entry.editor)
      if (entry.editor.isSafeToLeave()) cleanup(id, entry)
      else if (!entry.unsubscribe) {
        entry.unsubscribe = entry.editor.store.subscribe(() => {
          if (entry.editor.isSafeToLeave()) {
            onSaved?.(entry.editor)
            cleanup(id, entry)
          }
        })
      }
    })
  }, 0)
}

/** Para pruebas. */
export function openEditors(): number {
  return entries.size
}
