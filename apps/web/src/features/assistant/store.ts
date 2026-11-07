/**
 * Estado del panel del asistente: asistente y conversación activos, modo elegido, la vista de la
 * conversación (entradas, propuestas), borrador, estado del avatar y saldo. El servidor es la fuente
 * de verdad del historial; aquí guardamos una copia en la pestaña (sessionStorage) para que recargar
 * no pierda lo escrito ni la vista. Los deshacer de los comandos locales y las aprobaciones del
 * ejecutor viven en memoria.
 *
 * La conversación pertenece a una sesión (`owner` = usuario:empresa, ver session.ts): si entra otra
 * persona u otra empresa en la misma pestaña se descarta entera, y sin dueño no se guarda nada.
 */
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AssistantMode, ToolRun } from '@dekopen/shared'
import type { FaceState } from './face'
import type { ApprovalView, ChatEntry, NoticeView } from './types'

export interface CreditsView {
  left: number
  /** Créditos del último turno con IA. */
  lastTurn?: number
}

export interface AssistantPanelStore {
  /** Asistente activo (null = el predeterminado del servidor). */
  assistantId: string | null
  /** Conversación activa en el servidor (null = una nueva al primer mensaje). */
  conversationId: string | null
  /** Modo elegido para esta conversación (null = el modo por defecto del asistente). */
  mode: AssistantMode | null
  entries: ChatEntry[]
  /** Registro de herramientas conocido (propuestas, ejecutadas, deshechas). */
  toolRuns: Record<string, ToolRun>
  hasMoreBefore: boolean
  draft: string
  minimized: boolean
  busy: boolean
  face: FaceState
  historyOpen: boolean
  credits: CreditsView | null
  /** Trayendo una conversación del historial. */
  opening: boolean
  /** Cambia cuando se reemplaza la vista por otra conversación. */
  epoch: number
  /** Ya saludó en esta sesión. */
  greeted: boolean
  /** Ya vio el aviso de «Acceso total». */
  fullAccessAck: boolean
  /** Sesión dueña de la conversación (`usuarioId:empresaId`); null = sin asociar. */
  owner: string | null

  setDraft(draft: string): void
  setMinimized(minimized: boolean): void
  setBusy(busy: boolean): void
  setFace(face: FaceState): void
  setHistoryOpen(open: boolean): void
  setOpening(opening: boolean): void
  setMode(mode: AssistantMode | null): void
  setAssistant(id: string | null): void
  setConversation(id: string | null): void
  setCredits(credits: CreditsView | null): void
  setGreeted(): void
  ackFullAccess(): void
  addEntry(entry: ChatEntry): void
  updateEntry(id: string, patch: Partial<ChatEntry> | ((entry: ChatEntry) => Partial<ChatEntry>)): void
  /** Cambia el id de una entrada (id local → id del servidor). */
  renameEntry(from: string, to: string): void
  addNotice(entryId: string, notice: NoticeView): void
  upsertToolRun(run: ToolRun): void
  markReceipt(receiptId: string, patch: { undone?: boolean; undoable?: boolean }): void
  setApproval(entryId: string, approval: ApprovalView | undefined): void
  /** Reemplaza la vista por una conversación traída del servidor. */
  loadConversation(input: { conversationId: string; mode?: AssistantMode; entries: ChatEntry[]; toolRuns: ToolRun[]; hasMoreBefore: boolean }): void
  /** Agrega mensajes anteriores al comienzo (paginación). */
  prependEntries(entries: ChatEntry[], hasMoreBefore: boolean): void
  /** Conversación nueva (mismo asistente). */
  reset(): void
  /** Asocia la conversación a una sesión. Si era de otra (o de nadie), la descarta. true si cambió. */
  bindSession(owner: string): boolean
  /** Olvida todo: conversación, borrador, modo, saldo y dueño (fin de sesión). */
  clearSession(): void
}

const ENTRIES_KEEP = 80
const RUNS_KEEP = 60

const initial = {
  assistantId: null as string | null,
  conversationId: null as string | null,
  mode: null as AssistantMode | null,
  entries: [] as ChatEntry[],
  toolRuns: {} as Record<string, ToolRun>,
  hasMoreBefore: false,
  draft: '',
  minimized: false,
  busy: false,
  face: 'idle' as FaceState,
  historyOpen: false,
  credits: null as CreditsView | null,
  opening: false,
  epoch: 0,
  greeted: false,
  fullAccessAck: false,
  owner: null as string | null,
}

function trimRuns(runs: Record<string, ToolRun>): Record<string, ToolRun> {
  const list = Object.values(runs)
  if (list.length <= RUNS_KEEP) return runs
  const keep = list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, RUNS_KEEP)
  return Object.fromEntries(keep.map((r) => [r.id, r]))
}

export const useAssistantPanel = create<AssistantPanelStore>()(
  persist(
    (set, get) => ({
      ...initial,
      setDraft: (draft) => set({ draft }),
      setMinimized: (minimized) => set({ minimized }),
      setBusy: (busy) => set({ busy }),
      setFace: (face) => set({ face }),
      setHistoryOpen: (historyOpen) => set({ historyOpen }),
      setOpening: (opening) => set({ opening }),
      setMode: (mode) => set({ mode }),
      setAssistant: (assistantId) => set({ assistantId }),
      setConversation: (conversationId) => set({ conversationId }),
      setCredits: (credits) => set({ credits }),
      setGreeted: () => set({ greeted: true }),
      ackFullAccess: () => set({ fullAccessAck: true }),
      addEntry: (entry) => set((s) => ({ entries: [...s.entries, entry].slice(-ENTRIES_KEEP) })),
      updateEntry: (id, patch) =>
        set((s) => ({
          entries: s.entries.map((e) => (e.id === id ? { ...e, ...(typeof patch === 'function' ? patch(e) : patch) } : e)),
        })),
      renameEntry: (from, to) =>
        set((s) => (from === to || !s.entries.some((e) => e.id === from) ? s : { entries: s.entries.filter((e) => e.id !== to).map((e) => (e.id === from ? { ...e, id: to } : e)) })),
      addNotice: (entryId, notice) =>
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === entryId ? { ...e, notices: [...(e.notices ?? []).filter((n) => n.code !== notice.code || n.text !== notice.text), notice] } : e,
          ),
        })),
      upsertToolRun: (run) => set((s) => ({ toolRuns: trimRuns({ ...s.toolRuns, [run.id]: { ...s.toolRuns[run.id], ...run } }) })),
      markReceipt: (receiptId, patch) =>
        set((s) => ({
          entries: s.entries.map((e) =>
            e.receipts?.some((r) => r.id === receiptId) ? { ...e, receipts: e.receipts.map((r) => (r.id === receiptId ? { ...r, ...patch } : r)) } : e,
          ),
        })),
      setApproval: (entryId, approval) => set((s) => ({ entries: s.entries.map((e) => (e.id === entryId ? { ...e, approval } : e)) })),
      loadConversation: ({ conversationId, mode, entries, toolRuns, hasMoreBefore }) =>
        set((s) => ({
          epoch: s.epoch + 1,
          conversationId,
          ...(mode ? { mode } : {}),
          entries: entries.slice(-ENTRIES_KEEP),
          toolRuns: trimRuns(Object.fromEntries(toolRuns.map((r) => [r.id, r]))),
          hasMoreBefore,
          busy: false,
          face: 'idle' as const,
        })),
      prependEntries: (older, hasMoreBefore) =>
        set((s) => {
          const known = new Set(s.entries.map((e) => e.id))
          return { entries: [...older.filter((e) => !known.has(e.id)), ...s.entries], hasMoreBefore }
        }),
      reset: () => set({ entries: [], toolRuns: {}, conversationId: null, mode: null, hasMoreBefore: false, busy: false, face: 'idle' }),
      bindSession: (owner) => {
        if (get().owner === owner) return false
        set({ ...initial, owner })
        return true
      },
      clearSession: () => set({ ...initial }),
    }),
    {
      name: 'fz-assistant',
      storage: createJSONStorage(() => sessionStorage),
      version: 3,
      // Versiones anteriores (fz-marco) no se migran: el servidor guarda ahora el historial.
      migrate: (persisted, version) => (version < 3 ? { owner: null } : persisted) as Partial<AssistantPanelStore>,
      // Sin sesión dueña no se guarda la conversación (p. ej. una respuesta que llega tras salir).
      partialize: (s): Partial<AssistantPanelStore> =>
        s.owner === null
          ? { owner: null }
          : {
              owner: s.owner,
              assistantId: s.assistantId,
              conversationId: s.conversationId,
              mode: s.mode,
              // Recibos sin su deshacer (no sobrevive a recargar) y sin tareas a medias.
              entries: s.entries.map((e) => ({
                ...e,
                status: e.status === 'pending' || e.status === 'streaming' ? ('stopped' as const) : e.status,
                receipts: e.receipts?.map((r) => ({ ...r, undoable: false })),
                approval: e.approval?.status === 'pending' ? { ...e.approval, status: 'declined' as const } : e.approval,
                steps: undefined,
              })),
              toolRuns: s.toolRuns,
              hasMoreBefore: s.hasMoreBefore,
              draft: s.draft,
              minimized: s.minimized,
              greeted: s.greeted,
              fullAccessAck: s.fullAccessAck,
            },
    },
  ),
)

/** Alias de compatibilidad (v4): el store del panel. */
export const useMarcoStore = useAssistantPanel
export type MarcoStore = AssistantPanelStore

let idCounter = 0
export function entryId(prefix = 'e'): string {
  idCounter = (idCounter + 1) % 1_000_000
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}`
}
