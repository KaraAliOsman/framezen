/**
 * Piezas en memoria de los comandos locales: el deshacer de cada recibo (no sobrevive a recargar) y
 * las aprobaciones que pide el ejecutor del navegador (envío de la cotización desde un comando).
 */
import { translate } from '../../lib/i18n'
import type { ToolOutcome } from './executor'
import es from './i18n/es'
import type { AssistantPanelStore } from './store'
import type { ChatEntry, ReceiptView } from './types'

/** Deshacer de cada recibo (en memoria; no sobrevive a recargar). */
export const undoRegistry = new Map<string, () => boolean>()
const approvals = new Map<string, (ok: boolean) => void>()

export function registerApproval(entry: string, resolve: (ok: boolean) => void): void {
  approvals.set(entry, resolve)
}

export function resolveApproval(entry: string, ok: boolean): void {
  const resolve = approvals.get(entry)
  if (resolve) {
    approvals.delete(entry)
    resolve(ok)
  }
}

/** Rechaza cualquier aprobación pendiente (p. ej. al escribir algo nuevo). */
export function declinePendingApprovals(): void {
  for (const id of [...approvals.keys()]) resolveApproval(id, false)
}

export function hasPendingApproval(): boolean {
  return approvals.size > 0
}

/** Deshace un recibo. Devuelve false si ya no se puede. */
export function undoReceipt(store: { getState(): AssistantPanelStore }, receiptId: string): boolean {
  const fn = undoRegistry.get(receiptId)
  if (!fn) return false
  let ok = false
  try {
    ok = fn()
  } catch {
    ok = false
  }
  undoRegistry.delete(receiptId)
  store.getState().markReceipt(receiptId, ok ? { undone: true, undoable: false } : { undoable: false })
  return ok
}

/** El recibo deshacible más reciente (para «deshacer» escrito). */
export function lastUndoable(entries: readonly ChatEntry[]): ReceiptView | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const receipts = entries[i].receipts ?? []
    for (let j = receipts.length - 1; j >= 0; j--) {
      const r = receipts[j]
      if (r.undoable && !r.undone && undoRegistry.has(r.id)) return r
    }
  }
  return undefined
}

/** Respuesta de un comando local a partir de lo que hizo cada herramienta. */
export function composeLocalReply(outcomes: readonly ToolOutcome[]): string {
  const done = translate(es, 'conversation.done')
  const says: string[] = []
  for (const o of outcomes) {
    const say = o.say?.trim()
    if (say && !says.includes(say)) says.push(say)
  }
  if (!says.length) return outcomes.length ? done : translate(es, 'conversation.noChanges')
  const rest = says.filter((s) => s !== done)
  if (rest.length === says.length) return says.join(' ')
  // Un solo «Listo.» y al comienzo, salvo que otra frase ya empiece así.
  const doneWord = done.replace(/[.!¡]/g, '').trim().toLocaleLowerCase()
  return rest.some((s) => s.toLocaleLowerCase().startsWith(doneWord)) ? rest.join(' ') : [done, ...rest].join(' ')
}
