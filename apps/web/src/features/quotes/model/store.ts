/**
 * Store de una cotización abierta en el editor (zustand, uno por pantalla).
 *
 * - Historial de deshacer/rehacer con etiqueta de cada cambio (también para el asistente).
 * - Cálculo en vivo con el motor del navegador, con los ajustes de la organización.
 * - Autoguardado con espera de ~800 ms vía PUT con `version`. Ante un 409 toma la versión del
 *   servidor y vuelve a aplicar los cambios locales si no chocan; si chocan, muestra la versión
 *   más reciente y deja los cambios propios a un «Deshacer» de distancia.
 * - Sin red: reintenta solo y, mientras el servidor no confirme, deja los cambios pendientes en este
 *   equipo (`drafts`). Al volver a abrir la cotización se recuperan y se guardan.
 * - El catálogo y los ajustes se pueden cambiar con el editor abierto (`setCatalog`/`setSettings`):
 *   el precio en vivo se recalcula con lo mismo que usará el servidor.
 */
import { createStore, type StoreApi } from 'zustand/vanilla'
import type { Catalog, Id, PricingSettings, QuoteEvaluation, QuoteExtra, WindowDesign } from '@framezen/engine'
import type { QuoteDocOverrides } from '@framezen/documents'
import type { Client, OrgSettings, Quote, QuoteItem, QuoteSaveBody } from '@framezen/shared'
import {
  addItemOp,
  composeQuote,
  deepEqual,
  docFromQuote,
  duplicateItemOp,
  findItem,
  itemIndex,
  mergeDocs,
  metaFromQuote,
  moveItemOp,
  newItemId,
  normalizeDoc,
  removeItemOp,
  reorderItemsOp,
  saveBody,
  setDocumentOverrideOp,
  updateDesignOp,
  updateItemOp,
  type QuoteDoc,
  type QuoteMeta,
} from './doc'
import { createEvaluator, type Evaluator } from './evaluate'
import type { LocalDraftStore } from './localDrafts'

export type EditorView = 'design' | 'document'
export type SaveState = 'idle' | 'saving' | 'saved' | 'offline' | 'error'

export interface HistoryEntry {
  doc: QuoteDoc
  /** Qué cambio separa este documento del siguiente («Cambiar color a Nogal»). */
  label: string
  selectedItemId: Id | null
}

export type EditorSettings = Pick<OrgSettings, 'pricing' | 'cut' | 'documents' | 'defaults'>

export interface EditorState {
  meta: QuoteMeta
  doc: QuoteDoc
  past: HistoryEntry[]
  future: HistoryEntry[]
  selectedItemId: Id | null
  selectedNodeId: Id | null
  view: EditorView
  catalog: Catalog
  settings: EditorSettings
  evaluation: QuoteEvaluation
  /** Clientes conocidos (para mostrar el elegido; el historial solo guarda el id). */
  clients: Record<Id, Client>
  save: SaveInfo
}

export interface SaveInfo {
  status: SaveState
  savedAt: string | null
  dirty: boolean
  /** Motivo de un rechazo del servidor que no se arregla reintentando (4xx). */
  message?: string
  /** El editor reintentará solo (sin conexión o falla pasajera del servidor). */
  retrying?: boolean
  /** Los cambios pendientes quedaron guardados en este equipo (sobreviven a cerrar la pestaña). */
  local?: boolean
}

/**
 * Los últimos cambios no llegaron al servidor: enviar, descargar el PDF o pasar a taller usarían
 * la versión anterior, así que la acción se detiene con un mensaje que dice qué hacer.
 */
export class UnsavedChangesError extends Error {
  readonly save: SaveInfo
  constructor(save: SaveInfo) {
    super(
      save.status === 'offline'
        ? 'Sin conexión: tus últimos cambios todavía no llegan al servidor. Inténtalo de nuevo cuando vuelva la conexión.'
        : save.message && !save.retrying
          ? `No pudimos guardar tus últimos cambios. ${save.message} Corrígelo y vuelve a intentarlo.`
          : 'No pudimos guardar tus últimos cambios. Inténtalo de nuevo en un momento.',
    )
    this.name = 'UnsavedChangesError'
    this.save = save
  }
}

export interface QuoteTransport {
  save(id: Id, body: QuoteSaveBody): Promise<Quote>
  get(id: Id): Promise<Quote>
}

export type EditorNotice =
  | { kind: 'merged' }
  | { kind: 'conflict'; recover: () => void }
  | { kind: 'save-error'; message: string }
  /** Al abrir había cambios sin guardar en este equipo y se recuperaron. */
  | { kind: 'restored' }

export interface EditorDeps {
  transport: QuoteTransport
  notify?: (notice: EditorNotice) => void
  /** Espera del autoguardado (800 ms). */
  debounceMs?: number
  /** Ventana para agrupar cambios seguidos con la misma clave (escribir, arrastrar). */
  mergeWindowMs?: number
  historyLimit?: number
  now?: () => number
  /** Esperas entre reintentos sin conexión. */
  retryDelays?: number[]
  /** Dónde dejar los cambios pendientes en este equipo (en el navegador, localStorage). */
  drafts?: LocalDraftStore
  /** Espera para escribir el borrador local mientras escribes (ms). */
  draftDelayMs?: number
}

export interface CommitOptions {
  /** Cambios seguidos con la misma clave forman un solo paso de deshacer. */
  mergeKey?: string
  /** Ítem a seleccionar después del cambio. */
  select?: Id | null
}

export interface AddItemInput {
  design: WindowDesign
  qty?: number
  location?: string
  ref?: string
  name?: string
  notes?: string
  manualUnitPrice?: number
}

export interface QuoteEditor {
  store: StoreApi<EditorState>
  get: () => EditorState
  // Historial
  commit: (label: string, fn: (doc: QuoteDoc) => QuoteDoc, options?: CommitOptions) => boolean
  undo: () => string | null
  redo: () => string | null
  // Ítems
  addItem: (input: AddItemInput, options?: { index?: number; select?: boolean }) => Id
  duplicateItem: (id: Id) => Id | null
  removeItem: (id: Id) => QuoteItem | null
  moveItem: (from: number, to: number) => void
  reorderItems: (ids: Id[]) => void
  updateItem: (id: Id, patch: Partial<Omit<QuoteItem, 'id' | 'design'>>, label?: string, mergeKey?: string) => void
  updateDesign: (id: Id, fn: (design: WindowDesign) => WindowDesign, label?: string) => void
  setQty: (id: Id, qty: number) => void
  // Cotización
  setTitle: (title: string) => void
  setClient: (clientId: Id | null, client?: Client) => void
  rememberClient: (client: Client) => void
  setDiscount: (pct: number) => void
  setExtras: (extras: QuoteExtra[], label?: string) => void
  setNotes: (notes: string) => void
  setPricing: (pricing: Partial<PricingSettings> | undefined, label?: string) => void
  setDocumentOverride: (patch: QuoteDocOverrides, label?: string) => void
  // Interfaz
  select: (id: Id | null) => void
  selectNode: (id: Id | null) => void
  setView: (view: EditorView) => void
  // Catálogo y ajustes (llegan frescos después de abrir)
  setCatalog: (catalog: Catalog) => void
  setSettings: (settings: EditorSettings) => void
  // Servidor
  flush: () => Promise<void>
  /** Termina de guardar; si los cambios no llegaron al servidor, lanza `UnsavedChangesError`. */
  ensureSaved: () => Promise<void>
  retrySave: () => void
  /** Escribe ya el borrador local (al ocultar o cerrar la pestaña). */
  persistLocal: () => void
  /**
   * Corre una operación del servidor (enviar, cambiar estado) en orden con los guardados. Por
   * defecto exige que tus cambios ya estén guardados (si no, lanza `UnsavedChangesError`).
   */
  serverOp: <T>(fn: () => Promise<T>, pick?: (result: T) => Quote | null | undefined, options?: { requireSaved?: boolean }) => Promise<T>
  applyServerQuote: (quote: Quote) => void
  /** Datos frescos del servidor al abrir: si no hay cambios locales y es más nueva, la toma. */
  adoptServerQuote: (quote: Quote & { deletedAt?: string }) => boolean
  getQuote: () => Quote
  isSafeToLeave: () => boolean
  dispose: () => void
}

export interface CreateEditorInput {
  quote: Quote & { deletedAt?: string }
  catalog: Catalog
  settings: EditorSettings
}

const DEFAULT_RETRY = [2000, 4000, 8000, 15000, 30000]

function errorStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : undefined
}

function errorMessage(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message
  return typeof message === 'string' && message ? message : 'No pudimos guardar. Tus cambios siguen aquí.'
}

export function createQuoteEditor(input: CreateEditorInput, deps: EditorDeps): QuoteEditor {
  const debounceMs = deps.debounceMs ?? 800
  const mergeWindowMs = deps.mergeWindowMs ?? 800
  const historyLimit = deps.historyLimit ?? 100
  const now = deps.now ?? (() => Date.now())
  const retryDelays = deps.retryDelays ?? DEFAULT_RETRY
  const notify = deps.notify ?? (() => undefined)
  const drafts = deps.drafts
  const draftDelayMs = deps.draftDelayMs ?? 250
  let evaluator: Evaluator = createEvaluator(input.catalog, input.settings)

  const serverDoc = docFromQuote(input.quote)
  // Cambios que quedaron en este equipo sin llegar al servidor (pestaña cerrada sin conexión…):
  // se fusionan con lo que tiene hoy el servidor, igual que ante un 409.
  let initialDoc = serverDoc
  let initialPast: HistoryEntry[] = []
  let restored = false
  let conflictLocal: QuoteDoc | null = null
  const draft = drafts?.read(input.quote.id) ?? null
  if (draft && drafts) {
    const merged = mergeDocs(draft.base, draft.doc, serverDoc)
    if (merged.clean && !deepEqual(merged.doc, serverDoc)) {
      initialDoc = merged.doc
      initialPast = [{ doc: serverDoc, label: 'Recuperar cambios sin guardar', selectedItemId: serverDoc.items[0]?.id ?? null }]
      restored = true
    } else {
      if (!merged.clean) {
        conflictLocal = normalizeDoc(draft.doc)
        initialPast = [{ doc: conflictLocal, label: 'Tus cambios sin guardar de este equipo', selectedItemId: conflictLocal.items[0]?.id ?? null }]
      }
      drafts.remove(input.quote.id)
    }
  }

  const store = createStore<EditorState>(() => ({
    meta: metaFromQuote(input.quote),
    doc: initialDoc,
    past: initialPast,
    future: [],
    selectedItemId: initialDoc.items[0]?.id ?? null,
    selectedNodeId: null,
    view: 'design',
    catalog: input.catalog,
    settings: input.settings,
    evaluation: evaluator.evaluate(initialDoc),
    clients: input.quote.client ? { [input.quote.client.id]: input.quote.client } : {},
    save: restored ? { status: 'idle', savedAt: null, dirty: true, local: true } : { status: 'idle', savedAt: null, dirty: false },
  }))
  const get = store.getState
  const set = store.setState

  /** Lo último que sabemos que tiene el servidor (base para fusionar ante un 409). */
  let baseDoc: QuoteDoc = serverDoc
  let lastMerge: { key: string; at: number } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let draftTimer: ReturnType<typeof setTimeout> | null = null
  let retryAttempt = 0
  let chain: Promise<unknown> = Promise.resolve()
  let disposed = false

  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn)
    chain = run.catch(() => undefined)
    return run
  }

  // ── Documento e historial ────────────────────────────────────────────────

  function validSelection(doc: QuoteDoc, preferred: Id | null, fallbackIndex = 0): Id | null {
    if (preferred && findItem(doc, preferred)) return preferred
    if (doc.items.length === 0) return null
    return doc.items[Math.max(0, Math.min(fallbackIndex, doc.items.length - 1))].id
  }

  function setDoc(doc: QuoteDoc, extra: Partial<EditorState> = {}) {
    const state = get()
    const selectedItemId = 'selectedItemId' in extra ? (extra.selectedItemId ?? null) : state.selectedItemId
    const changedSelection = selectedItemId !== state.selectedItemId
    set({
      ...extra,
      doc,
      evaluation: evaluator.evaluate(doc),
      selectedItemId,
      selectedNodeId: changedSelection ? null : state.selectedNodeId,
      save: { ...state.save, dirty: true, status: state.save.status === 'error' || state.save.status === 'offline' ? state.save.status : 'idle' },
    })
    scheduleSave()
    persistSoon()
  }

  const commit: QuoteEditor['commit'] = (label, fn, options = {}) => {
    const state = get()
    const next = fn(state.doc)
    if (!next || next === state.doc || deepEqual(next, state.doc)) {
      if (options.select !== undefined) select(options.select)
      return false
    }
    const at = now()
    const merge = !!options.mergeKey && lastMerge?.key === options.mergeKey && at - lastMerge.at <= mergeWindowMs && state.past.length > 0
    let past = state.past
    if (merge) {
      // Mismo paso: se actualiza la etiqueta y se conserva el documento previo al primer cambio.
      past = [...past.slice(0, -1), { ...past[past.length - 1], label }]
    } else {
      past = [...past, { doc: state.doc, label, selectedItemId: state.selectedItemId }]
      if (past.length > historyLimit) past = past.slice(past.length - historyLimit)
    }
    lastMerge = options.mergeKey ? { key: options.mergeKey, at } : null
    const selectedItemId = options.select !== undefined ? validSelection(next, options.select) : validSelection(next, state.selectedItemId, itemIndex(state.doc, state.selectedItemId ?? ''))
    setDoc(next, { past, future: [], selectedItemId })
    return true
  }

  const undo: QuoteEditor['undo'] = () => {
    const state = get()
    const entry = state.past[state.past.length - 1]
    if (!entry) return null
    lastMerge = null
    setDoc(entry.doc, {
      past: state.past.slice(0, -1),
      future: [{ doc: state.doc, label: entry.label, selectedItemId: state.selectedItemId }, ...state.future],
      selectedItemId: validSelection(entry.doc, entry.selectedItemId ?? state.selectedItemId),
    })
    return entry.label
  }

  const redo: QuoteEditor['redo'] = () => {
    const state = get()
    const [entry, ...future] = state.future
    if (!entry) return null
    lastMerge = null
    setDoc(entry.doc, {
      past: [...state.past, { doc: state.doc, label: entry.label, selectedItemId: state.selectedItemId }],
      future,
      selectedItemId: validSelection(entry.doc, entry.selectedItemId ?? state.selectedItemId),
    })
    return entry.label
  }

  // ── Operaciones ──────────────────────────────────────────────────────────

  const refOf = (id: Id) => findItem(get().doc, id)?.ref ?? 'la ventana'

  const addItem: QuoteEditor['addItem'] = (item, options = {}) => {
    const id = newItemId()
    let ref = ''
    commit(
      'Agregar ventana',
      (doc) => {
        const next = addItemOp(doc, { id, ...item }, options.index)
        ref = findItem(next, id)?.ref ?? ''
        return next
      },
      { select: options.select === false ? undefined : id },
    )
    // Etiqueta con la referencia final («Agregar V4»).
    const state = get()
    if (ref && state.past.length) set({ past: [...state.past.slice(0, -1), { ...state.past[state.past.length - 1], label: `Agregar ${ref}` }] })
    return id
  }

  const duplicateItem: QuoteEditor['duplicateItem'] = (id) => {
    if (!findItem(get().doc, id)) return null
    const copyId = newItemId()
    commit(`Duplicar ${refOf(id)}`, (doc) => duplicateItemOp(doc, id, copyId), { select: copyId })
    return copyId
  }

  const removeItem: QuoteEditor['removeItem'] = (id) => {
    const state = get()
    const item = findItem(state.doc, id)
    if (!item) return null
    const index = itemIndex(state.doc, id)
    const next = removeItemOp(state.doc, id)
    commit(`Eliminar ${item.ref}`, () => next, {
      select: state.selectedItemId === id ? validSelection(next, null, index) : state.selectedItemId,
    })
    return item
  }

  const moveItem: QuoteEditor['moveItem'] = (from, to) => {
    const item = get().doc.items[from]
    if (!item) return
    commit(`Mover ${item.ref}`, (doc) => moveItemOp(doc, from, to))
  }

  const reorderItems: QuoteEditor['reorderItems'] = (ids) => {
    commit('Reordenar ventanas', (doc) => reorderItemsOp(doc, ids))
  }

  const updateItem: QuoteEditor['updateItem'] = (id, patch, label, mergeKey) => {
    commit(label ?? `Editar ${refOf(id)}`, (doc) => updateItemOp(doc, id, patch), { mergeKey: mergeKey ?? `item:${id}:${Object.keys(patch).join(',')}` })
  }

  const updateDesign: QuoteEditor['updateDesign'] = (id, fn, label) => {
    const text = label ?? `Cambiar diseño de ${refOf(id)}`
    commit(text, (doc) => updateDesignOp(doc, id, fn), { mergeKey: `design:${id}:${text}` })
  }

  const setQty: QuoteEditor['setQty'] = (id, qty) => {
    const value = Math.max(0, Math.round(Number.isFinite(qty) ? qty : 0))
    commit(`Cantidad de ${refOf(id)}: ${value}`, (doc) => updateItemOp(doc, id, { qty: value }), { mergeKey: `qty:${id}` })
  }

  const setTitle: QuoteEditor['setTitle'] = (title) => {
    commit('Cambiar nombre de la obra', (doc) => (doc.title === title ? doc : { ...doc, title }), { mergeKey: 'title' })
  }

  const rememberClient: QuoteEditor['rememberClient'] = (client) => {
    if (!client?.id) return
    set({ clients: { ...get().clients, [client.id]: client } })
  }

  const setClient: QuoteEditor['setClient'] = (clientId, client) => {
    if (client) rememberClient(client)
    const name = client?.name ?? (clientId ? get().clients[clientId]?.name : undefined)
    commit(clientId ? `Cliente: ${name ?? 'elegido'}` : 'Quitar cliente', (doc) => {
      if ((doc.clientId ?? null) === clientId) return doc
      const next = { ...doc }
      if (clientId) next.clientId = clientId
      else delete next.clientId
      return next
    })
  }

  const setDiscount: QuoteEditor['setDiscount'] = (pct) => {
    const value = Math.min(100, Math.max(0, Number.isFinite(pct) ? Math.round(pct * 10) / 10 : 0))
    commit(`Descuento ${String(value).replace('.', ',')} %`, (doc) => (doc.discountPct === value ? doc : { ...doc, discountPct: value }), { mergeKey: 'discount' })
  }

  const setExtras: QuoteEditor['setExtras'] = (extras, label = 'Cambiar extras') => {
    commit(label, (doc) => ({ ...doc, extras }), { mergeKey: `extras:${label}` })
  }

  const setNotes: QuoteEditor['setNotes'] = (notes) => {
    commit('Notas internas', (doc) => ({ ...doc, notes: notes || undefined }), { mergeKey: 'notes' })
  }

  const setPricing: QuoteEditor['setPricing'] = (pricing, label = 'Ajustes de precio de la cotización') => {
    commit(label, (doc) => ({ ...doc, pricing: pricing && Object.keys(pricing).length ? pricing : undefined }), { mergeKey: `pricing:${label}` })
  }

  const setDocumentOverride: QuoteEditor['setDocumentOverride'] = (patch, label = 'Editar texto del documento') => {
    commit(label, (doc) => setDocumentOverrideOp(doc, patch), { mergeKey: `docs:${Object.keys(patch).join(',')}` })
  }

  function select(id: Id | null) {
    const state = get()
    const next = id && findItem(state.doc, id) ? id : null
    if (next === state.selectedItemId) return
    set({ selectedItemId: next, selectedNodeId: null })
  }

  const selectNode: QuoteEditor['selectNode'] = (id) => {
    if (get().selectedNodeId !== id) set({ selectedNodeId: id })
  }

  const setView: QuoteEditor['setView'] = (view) => {
    if (get().view !== view) set({ view })
  }

  // ── Autoguardado ─────────────────────────────────────────────────────────

  function setSave(patch: Partial<EditorState['save']>) {
    set({ save: { ...get().save, ...patch } })
  }

  // ── Borrador en este equipo ──────────────────────────────────────────────

  /** Escribe (o borra) el borrador local según haya cambios sin confirmar. */
  function persistNow() {
    if (draftTimer) {
      clearTimeout(draftTimer)
      draftTimer = null
    }
    if (!drafts) return
    const state = get()
    if (!state.save.dirty) {
      drafts.remove(state.meta.id)
      if (state.save.local) setSave({ local: false })
      return
    }
    const ok = drafts.write({ quoteId: state.meta.id, baseVersion: state.meta.version, base: baseDoc, doc: state.doc, at: now() })
    if (!!state.save.local !== ok) setSave({ local: ok })
  }

  /** Mientras escribes, el borrador se escribe con una pausa corta (no en cada tecla). */
  function persistSoon() {
    if (!drafts || disposed || draftTimer) return
    draftTimer = setTimeout(() => {
      draftTimer = null
      persistNow()
    }, draftDelayMs)
  }

  function scheduleSave(delay = debounceMs) {
    if (disposed) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void exclusive(saveNow).catch(() => undefined)
    }, delay)
  }

  function scheduleRetry() {
    if (disposed || retryTimer) return
    const delay = retryDelays[Math.min(retryAttempt, retryDelays.length - 1)]
    retryAttempt++
    retryTimer = setTimeout(() => {
      retryTimer = null
      void exclusive(saveNow).catch(() => undefined)
    }, delay)
  }

  function applyMeta(quote: Quote & { deletedAt?: string }) {
    const meta = metaFromQuote(quote)
    const clients = quote.client ? { ...get().clients, [quote.client.id]: quote.client } : get().clients
    set({ meta, clients })
  }

  async function saveNow(): Promise<void> {
    const state = get()
    if (!state.save.dirty) return
    const sent = state.doc
    setSave({ status: 'saving' })
    try {
      const saved = await deps.transport.save(state.meta.id, saveBody(sent, state.meta))
      retryAttempt = 0
      baseDoc = normalizeDoc(sent)
      applyMeta(saved)
      if (get().doc === sent) setSave({ status: 'saved', dirty: false, savedAt: new Date(now()).toISOString(), message: undefined, retrying: false })
      else {
        setSave({ status: 'idle', message: undefined, retrying: false })
        scheduleSave(0)
      }
      // Confirmado: se borra el borrador local (o se reescribe sobre la versión nueva si seguiste editando).
      persistNow()
    } catch (error) {
      const status = errorStatus(error)
      if (status === 409) {
        await resolveConflict()
        return
      }
      if (status === 0 || status === undefined || status === 408 || status === 429 || status >= 500) {
        setSave({ status: status === 0 || status === undefined ? 'offline' : 'error', retrying: true, message: undefined })
        persistNow()
        scheduleRetry()
        return
      }
      // 4xx que no se arregla solo (datos o modo lectura): se avisa una vez y se espera otro cambio.
      const message = errorMessage(error)
      if (get().save.message !== message) notify({ kind: 'save-error', message })
      setSave({ status: 'error', message, retrying: false })
      persistNow()
    }
  }

  async function resolveConflict(): Promise<void> {
    let remoteQuote: Quote
    try {
      remoteQuote = await deps.transport.get(get().meta.id)
    } catch {
      setSave({ status: 'offline', retrying: true, message: undefined })
      persistNow()
      scheduleRetry()
      return
    }
    const remote = docFromQuote(remoteQuote)
    const local = get().doc
    const merged = mergeDocs(baseDoc, local, remote)
    applyMeta(remoteQuote)
    baseDoc = remote
    if (merged.clean) {
      const pending = !deepEqual(merged.doc, remote)
      set({
        doc: merged.doc,
        evaluation: evaluator.evaluate(merged.doc),
        selectedItemId: validSelection(merged.doc, get().selectedItemId),
        save: { ...get().save, dirty: pending, status: pending ? 'idle' : 'saved', savedAt: pending ? get().save.savedAt : new Date(now()).toISOString() },
      })
      if (merged.remoteChanged) notify({ kind: 'merged' })
      persistNow()
      if (pending) await saveNow()
      return
    }
    // Los mismos datos cambiaron en ambos lados: mostramos lo del servidor y tus cambios
    // quedan como un paso de deshacer (y en el aviso, «Recuperar mis cambios»).
    const state = get()
    const past = [...state.past, { doc: local, label: 'Tus cambios de esta pestaña', selectedItemId: state.selectedItemId }]
    set({
      doc: remote,
      past: past.slice(-historyLimit),
      future: [],
      evaluation: evaluator.evaluate(remote),
      selectedItemId: validSelection(remote, state.selectedItemId),
      save: { ...state.save, dirty: false, status: 'saved', savedAt: new Date(now()).toISOString() },
    })
    persistNow()
    notify({
      kind: 'conflict',
      recover: () => {
        commit('Recuperar mis cambios', () => local)
      },
    })
  }

  const flush: QuoteEditor['flush'] = async () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    for (let i = 0; i < 3 && get().save.dirty; i++) {
      await exclusive(saveNow)
      if (get().save.status === 'offline' || get().save.status === 'error') break
    }
    await chain
  }

  const ensureSaved: QuoteEditor['ensureSaved'] = async () => {
    await flush()
    const { save } = get()
    if (save.dirty) throw new UnsavedChangesError(save)
  }

  const retrySave: QuoteEditor['retrySave'] = () => {
    if (!get().save.dirty) return
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    retryAttempt = 0
    scheduleSave(0)
  }

  const serverOp: QuoteEditor['serverOp'] = async (fn, pick, options = {}) => {
    if (options.requireSaved === false) await flush()
    else await ensureSaved()
    return exclusive(async () => {
      const result = await fn()
      const quote = pick ? pick(result) : (result as unknown as Quote)
      if (quote && typeof quote === 'object' && 'version' in quote && 'id' in quote && quote.id === get().meta.id) applyMeta(quote)
      return result
    })
  }

  const applyServerQuote: QuoteEditor['applyServerQuote'] = (quote) => {
    if (quote.id === get().meta.id) applyMeta(quote)
  }

  const adoptServerQuote: QuoteEditor['adoptServerQuote'] = (quote) => {
    const state = get()
    if (quote.id !== state.meta.id || quote.version <= state.meta.version) return false
    if (state.save.dirty || state.save.status === 'saving') return false
    const doc = docFromQuote(quote)
    baseDoc = doc
    set({
      meta: metaFromQuote(quote),
      doc,
      evaluation: evaluator.evaluate(doc),
      selectedItemId: validSelection(doc, state.selectedItemId),
      clients: quote.client ? { ...state.clients, [quote.client.id]: quote.client } : state.clients,
    })
    return true
  }

  // ── Catálogo y ajustes ───────────────────────────────────────────────────

  function reprice(catalog: Catalog, settings: EditorSettings) {
    evaluator = createEvaluator(catalog, settings)
    set({ catalog, settings, evaluation: evaluator.evaluate(get().doc) })
  }

  const setCatalog: QuoteEditor['setCatalog'] = (catalog) => {
    if (!catalog || catalog === get().catalog) return
    reprice(catalog, get().settings)
  }

  const setSettings: QuoteEditor['setSettings'] = (settings) => {
    const current = get().settings
    if (!settings || settings === current || deepEqual(settings, current)) return
    reprice(get().catalog, settings)
  }

  const getQuote: QuoteEditor['getQuote'] = () => {
    const state = get()
    return composeQuote(state.meta, state.doc, { client: state.doc.clientId ? state.clients[state.doc.clientId] : undefined, totals: state.evaluation.totals })
  }

  const isSafeToLeave = () => {
    const { save } = get()
    return !save.dirty && save.status !== 'saving'
  }

  const dispose = () => {
    if (draftTimer) persistNow()
    disposed = true
    if (timer) clearTimeout(timer)
    if (retryTimer) clearTimeout(retryTimer)
    timer = null
    retryTimer = null
  }

  if (restored) {
    // Fuera del render que creó el editor: aviso y guardado de lo recuperado.
    setTimeout(() => {
      if (disposed) return
      notify({ kind: 'restored' })
      scheduleSave(0)
    }, 0)
  } else if (conflictLocal) {
    const local = conflictLocal
    setTimeout(() => {
      if (disposed) return
      notify({ kind: 'conflict', recover: () => commit('Recuperar mis cambios', () => local) })
    }, 0)
  }

  return {
    store,
    get,
    commit,
    undo,
    redo,
    addItem,
    duplicateItem,
    removeItem,
    moveItem,
    reorderItems,
    updateItem,
    updateDesign,
    setQty,
    setTitle,
    setClient,
    rememberClient,
    setDiscount,
    setExtras,
    setNotes,
    setPricing,
    setDocumentOverride,
    select,
    selectNode,
    setView,
    setCatalog,
    setSettings,
    flush,
    ensureSaved,
    retrySave,
    persistLocal: persistNow,
    serverOp,
    applyServerQuote,
    adoptServerQuote,
    getQuote,
    isSafeToLeave,
    dispose,
  }
}
