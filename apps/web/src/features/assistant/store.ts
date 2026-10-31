/**
 * Estado del panel de Marco: conversación visible, historial para el servidor, borrador, modo y
 * créditos, y el estado del avatar. Se guarda en la pestaña (sessionStorage): recargar no pierde lo
 * escrito. Las funciones de deshacer y las aprobaciones pendientes viven en memoria.
 *
 * La conversación pertenece a una sesión (`owner` = usuario:empresa, ver session.ts): si entra otra
 * persona u otra empresa en la misma pestaña se descarta entera, y sin dueño no se guarda nada.
 */
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AssistantLocalReason, AssistantMessage } from '@framezen/shared'
import type { MarcoState } from './avatar'
import type { ApprovalView, ChatEntry } from './types'

export interface MarcoStore {
  entries: ChatEntry[]
  /** Conversación en formato del contrato (lo que viaja al servidor). */
  history: AssistantMessage[]
  draft: string
  minimized: boolean
  busy: boolean
  marco: MarcoState
  mode: 'ai' | 'local' | null
  reason: AssistantLocalReason | null
  credits: number | null
  /** Ya saludó con la vuelta de ojos en esta sesión. */
  greeted: boolean
  /** Sesión dueña de la conversación (`usuarioId:empresaId`); null = sin asociar. */
  owner: string | null

  setDraft(draft: string): void
  setMinimized(minimized: boolean): void
  setBusy(busy: boolean): void
  setMarco(state: MarcoState): void
  setMode(mode: 'ai' | 'local', reason: AssistantLocalReason | null, credits?: number | null): void
  setCredits(credits: number | null): void
  setGreeted(): void
  addEntry(entry: ChatEntry): void
  updateEntry(id: string, patch: Partial<ChatEntry> | ((entry: ChatEntry) => Partial<ChatEntry>)): void
  pushHistory(...messages: AssistantMessage[]): void
  markReceipt(receiptId: string, patch: { undone?: boolean; undoable?: boolean }): void
  setApproval(entryId: string, approval: ApprovalView | undefined): void
  reset(): void
  /** Asocia la conversación a una sesión. Si era de otra (o de nadie), la descarta. true si cambió. */
  bindSession(owner: string): boolean
  /** Olvida todo: conversación, borrador, modo, saldo y dueño (fin de sesión). */
  clearSession(): void
}

const HISTORY_KEEP = 60
const ENTRIES_KEEP = 80

const initial = {
  entries: [] as ChatEntry[],
  history: [] as AssistantMessage[],
  draft: '',
  minimized: false,
  busy: false,
  marco: 'idle' as MarcoState,
  mode: null,
  reason: null,
  credits: null,
  greeted: false,
  owner: null as string | null,
}

export const useMarcoStore = create<MarcoStore>()(
  persist(
    (set, get) => ({
      ...initial,
      setDraft: (draft) => set({ draft }),
      setMinimized: (minimized) => set({ minimized }),
      setBusy: (busy) => set({ busy }),
      setMarco: (marco) => set({ marco }),
      setMode: (mode, reason, credits) => set((s) => ({ mode, reason, credits: credits === undefined ? s.credits : credits })),
      setCredits: (credits) => set({ credits }),
      setGreeted: () => set({ greeted: true }),
      addEntry: (entry) => set((s) => ({ entries: [...s.entries, entry].slice(-ENTRIES_KEEP) })),
      updateEntry: (id, patch) =>
        set((s) => ({
          entries: s.entries.map((e) => (e.id === id ? { ...e, ...(typeof patch === 'function' ? patch(e) : patch) } : e)),
        })),
      pushHistory: (...messages) => set((s) => ({ history: [...s.history, ...messages].slice(-HISTORY_KEEP) })),
      markReceipt: (receiptId, patch) =>
        set((s) => ({
          entries: s.entries.map((e) =>
            e.receipts?.some((r) => r.id === receiptId) ? { ...e, receipts: e.receipts.map((r) => (r.id === receiptId ? { ...r, ...patch } : r)) } : e,
          ),
        })),
      setApproval: (entryId, approval) => set((s) => ({ entries: s.entries.map((e) => (e.id === entryId ? { ...e, approval } : e)) })),
      reset: () => set({ entries: [], history: [], busy: false, marco: 'idle' }),
      bindSession: (owner) => {
        if (get().owner === owner) return false
        set({ ...initial, owner })
        return true
      },
      clearSession: () => set({ ...initial }),
    }),
    {
      name: 'fz-marco',
      storage: createJSONStorage(() => sessionStorage),
      version: 2,
      // v1 no sabía de quién era la conversación: se descarta en vez de mostrarla a quien entre.
      migrate: (persisted, version) => (version < 2 ? { owner: null } : persisted) as Partial<MarcoStore>,
      // Sin sesión dueña no se guarda la conversación (p. ej. una respuesta que llega tras salir).
      partialize: (s): Partial<MarcoStore> =>
        s.owner === null
          ? { owner: null }
          : {
              owner: s.owner,
              // Recibos sin su deshacer (no sobrevive a recargar) y sin tareas a medias.
              entries: s.entries.map((e) => ({
                ...e,
                status: e.status === 'pending' ? ('stopped' as const) : e.status,
                receipts: e.receipts?.map((r) => ({ ...r, undoable: false })),
                approval: e.approval?.status === 'pending' ? { ...e.approval, status: 'declined' as const } : e.approval,
                steps: undefined,
              })),
              history: s.history,
              draft: s.draft,
              minimized: s.minimized,
              greeted: s.greeted,
            },
    },
  ),
)

let idCounter = 0
export function entryId(prefix = 'e'): string {
  idCounter = (idCounter + 1) % 1_000_000
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}`
}
