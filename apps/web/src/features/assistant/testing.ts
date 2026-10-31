/**
 * Puente y entorno simulados para probar a Marco sin el editor real (solo pruebas).
 */
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '@framezen/catalog'
import type { Catalog, Id, WindowDesign } from '@framezen/engine'
import type { Client, Quote, QuoteItem, QuoteSummary } from '@framezen/shared'
import type { QuoteEditorBridge } from './bridge'
import type { ExecutorEnv } from './executor'

export function makeQuote(partial: Partial<Quote> = {}): Quote {
  const now = '2026-10-31T12:00:00.000Z'
  return {
    id: 'q1',
    number: 7,
    title: 'Casa Soto',
    status: 'draft',
    items: [],
    extras: [],
    discountPct: 0,
    revision: 0,
    version: 1,
    createdAt: now,
    updatedAt: now,
    ...partial,
  }
}

export interface FakeEditor {
  bridge: QuoteEditorBridge
  readonly quote: Quote
  readonly view: 'design' | 'document'
  readonly selected: Id | null
}

export function fakeEditor(initial: Partial<Quote> = {}, catalog: Catalog = SAMPLE_CATALOG): FakeEditor {
  let quote = makeQuote(initial)
  let selected: Id | null = null
  let view: 'design' | 'document' = 'design'
  let n = 100
  const nextRef = () => {
    let i = 1
    while (quote.items.some((it) => it.ref === `V${i}`)) i++
    return `V${i}`
  }
  const setItems = (items: QuoteItem[]) => {
    quote = { ...quote, items }
  }
  const bridge: QuoteEditorBridge = {
    quoteId: quote.id,
    getQuote: () => quote,
    getCatalog: () => catalog,
    selectedItemId: () => selected,
    addItem(design: WindowDesign, opts = {}) {
      const id = `i${++n}`
      const item: QuoteItem = { id, ref: opts.ref ?? nextRef(), qty: opts.qty ?? 1, design }
      if (opts.location) item.location = opts.location
      if (opts.name) item.name = opts.name
      setItems([...quote.items, item])
      return id
    },
    updateItem(itemId, patch) {
      setItems(quote.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)))
    },
    updateDesign(itemId, fn) {
      setItems(quote.items.map((i) => (i.id === itemId ? { ...i, design: fn(i.design) } : i)))
    },
    removeItem(itemId) {
      setItems(quote.items.filter((i) => i.id !== itemId))
      if (selected === itemId) selected = null
    },
    duplicateItem(itemId) {
      const source = quote.items.find((i) => i.id === itemId)
      if (!source) return ''
      const id = `i${++n}`
      setItems([...quote.items, { ...JSON.parse(JSON.stringify(source)), id, ref: nextRef() }])
      return id
    },
    setDiscount(pct) {
      quote = { ...quote, discountPct: pct }
    },
    setTitle(title) {
      quote = { ...quote, title }
    },
    setClient(clientId) {
      quote = { ...quote, clientId: clientId ?? undefined }
    },
    selectItem(itemId) {
      selected = itemId
    },
    showDocument() {
      view = 'document'
    },
    showDesign() {
      view = 'design'
    },
  }
  return {
    bridge,
    get quote() {
      return quote
    },
    get view() {
      return view
    },
    get selected() {
      return selected
    },
  }
}

export interface FakeWorld {
  env: ExecutorEnv
  editor: FakeEditor | null
  path: string
  navigated: string[]
  clients: Client[]
  quotes: Quote[]
  sent: { id: string; body: unknown }[]
  approvals: string[]
  approveAnswer: boolean
}

/** Entorno completo: navegar a /cotizaciones/:id «abre» el editor de esa cotización. */
export function fakeWorld(options: { editor?: FakeEditor | null; path?: string; canSeeCosts?: boolean } = {}): FakeWorld {
  const world: FakeWorld = {
    editor: options.editor ?? null,
    path: options.path ?? (options.editor ? `/cotizaciones/${options.editor.bridge.quoteId}` : '/inicio'),
    navigated: [],
    clients: [{ id: 'c1', name: 'Juan Pérez', email: 'juan@correo.cl', createdAt: '', updatedAt: '' }],
    quotes: [],
    sent: [],
    approvals: [],
    approveAnswer: true,
    env: undefined as unknown as ExecutorEnv,
  }
  let number = 40
  const summary = (q: Quote): QuoteSummary => ({ id: q.id, number: q.number, title: q.title, status: q.status, revision: q.revision, createdAt: q.createdAt, updatedAt: q.updatedAt, total: 0, units: 0 })
  world.env = {
    getEditor: () => world.editor?.bridge ?? null,
    waitForEditor: async (quoteId) => {
      if (world.editor?.bridge.quoteId === quoteId) return world.editor.bridge
      throw new Error('timeout')
    },
    navigate: (path) => {
      world.path = path
      world.navigated.push(path)
      const m = /^\/cotizaciones\/([^/]+)$/.exec(path)
      if (m) {
        const quote = world.quotes.find((q) => q.id === m[1])
        world.editor = quote ? fakeEditor(quote) : null
      } else world.editor = null
    },
    currentPath: () => world.path,
    defaults: async () => ({ ...SAMPLE_DEFAULTS }),
    pricing: async () => ({}),
    canSeeCosts: () => options.canSeeCosts ?? true,
    api: {
      createQuote: async (body) => {
        const quote = makeQuote({ id: `q${++number}`, number, title: body.title ?? '', clientId: body.clientId })
        world.quotes.push(quote)
        return quote
      },
      getQuote: async (id) => (world.editor?.bridge.quoteId === id ? world.editor.quote : (world.quotes.find((q) => q.id === id) ?? makeQuote({ id }))),
      removeQuote: async (id) => {
        world.quotes = world.quotes.filter((q) => q.id !== id)
      },
      listQuotes: async (q) => world.quotes.filter((x) => String(x.number) === q || x.title.toLowerCase().includes(q.toLowerCase())).map(summary),
      listClients: async (q) => world.clients.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())),
      createClient: async (input) => {
        const client: Client = { id: `c${world.clients.length + 1}`, createdAt: '', updatedAt: '', ...input }
        world.clients.push(client)
        return client
      },
      sendQuote: async (id, body) => {
        world.sent.push({ id, body })
        return { url: `https://app.test/c/tok-${id}`, revisionLabel: 'A' }
      },
    },
    approve: async (request) => {
      world.approvals.push(request.title)
      return world.approveAnswer
    },
    copyText: async () => {},
    openUrl: () => {},
    sleep: async () => {},
  }
  return world
}
