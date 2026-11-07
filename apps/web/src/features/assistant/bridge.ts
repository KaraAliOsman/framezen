/**
 * Puente entre el asistente y las pantallas que puede operar.
 * El editor de cotizaciones se registra al montarse; los comandos locales operan a través de este
 * puente, sobre el estado real (con deshacer). Los turnos con IA trabajan en el servidor: antes de
 * cada turno el panel pide `flush()` y, si la cotización abierta cambió, `reloadFromServer()`.
 *
 * Los métodos marcados «v5» son opcionales (los implementa el editor de cotizaciones, UI-QUOTES);
 * el panel funciona sin ellos con el mejor reemplazo posible.
 */
import type { Catalog, Id, WindowDesign } from '@dekopen/engine'
import type { DocLocale, Quote, QuoteItem } from '@dekopen/shared'

export interface QuoteEditorBridge {
  quoteId: Id
  getQuote(): Quote
  getCatalog(): Catalog
  selectedItemId(): Id | null
  /** Agrega un ítem y devuelve su id. Si la galería «Agregar ventana» estaba abierta, la cierra. */
  addItem(design: WindowDesign, opts?: { qty?: number; location?: string; ref?: string; name?: string }): Id
  updateItem(itemId: Id, patch: Partial<Omit<QuoteItem, 'id' | 'design'>>): void
  updateDesign(itemId: Id, fn: (design: WindowDesign) => WindowDesign): void
  removeItem(itemId: Id): void
  duplicateItem(itemId: Id): Id
  setDiscount(pct: number): void
  setTitle(title: string): void
  setClient(clientId: Id | null): void
  selectItem(itemId: Id): void
  showDocument(): void
  showDesign(): void
  /** Pestaña abierta: el asistente sabe si la persona mira el dibujo o el documento. */
  currentView?(): 'design' | 'document'
  /**
   * v5: guarda ya los cambios pendientes del autoguardado (el panel lo llama antes de un turno con
   * IA, que trabaja sobre lo guardado en el servidor). Resuelve cuando el servidor tiene lo último.
   */
  flush?(): Promise<void>
  /**
   * v5 (UI-QUOTES): vuelve a leer la cotización del servidor (el asistente la cambió) y la adopta
   * como UN paso de deshacer «Cambios de {actorName}», fusionando lo que hubiera sin guardar.
   * Devuelve si cambió algo.
   */
  refreshFromServer?(actorName?: string): Promise<boolean>
  /** v5 (UI-QUOTES): nombre del asistente que actúa (etiquetas de deshacer «{bot} editó V1»). */
  setActorName?(name: string | null): void
  /** v5 (UI-QUOTES): abre el diálogo «Enviar al cliente» del editor. */
  openSend?(): void
  /** v5 (UI-QUOTES): abre la galería «Agregar ventana». */
  openTypologyPicker?(): void
  /** v5 (UI-QUOTES): cierra la galería «Agregar ventana» (una cotización vacía la abre sola y tapa el panel). */
  closeTypologyPicker?(): void
  /** v5 (UI-QUOTES): diseño del documento de esta cotización (`null` = el de la organización). */
  setDocumentTemplate?(templateId: string | null): void
  /** v5 (UI-QUOTES): idioma del documento (`null` = el de la organización). */
  setDocumentLocale?(locale: DocLocale | null): void
  /** @deprecated usar `refreshFromServer` (nombre del primer borrador del contrato). */
  reloadFromServer?(options: { assistantName: string; version?: number }): Promise<void>
  /** @deprecated usar `openSend`. */
  openSendDialog?(): void
}

let current: QuoteEditorBridge | null = null
const listeners = new Set<(bridge: QuoteEditorBridge | null) => void>()

export function registerQuoteEditor(bridge: QuoteEditorBridge): () => void {
  current = bridge
  listeners.forEach((fn) => fn(current))
  return () => {
    if (current === bridge) {
      current = null
      listeners.forEach((fn) => fn(current))
    }
  }
}

export function getQuoteEditor(): QuoteEditorBridge | null {
  return current
}

export function onQuoteEditorChange(fn: (bridge: QuoteEditorBridge | null) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Espera a que el editor de esa cotización se registre (rechaza al vencer el plazo). */
export function waitForEditor(quoteId: string, timeoutMs: number): Promise<QuoteEditorBridge> {
  return new Promise((resolve, reject) => {
    const now = getQuoteEditor()
    if (now?.quoteId === quoteId) return resolve(now)
    const timer = setTimeout(() => {
      off()
      reject(new Error('editor_timeout'))
    }, timeoutMs)
    const off = onQuoteEditorChange((bridge) => {
      if (bridge?.quoteId === quoteId) {
        clearTimeout(timer)
        off()
        resolve(bridge)
      }
    })
  })
}
