import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDesign, DEFAULT_CUT, DEFAULT_PRICING, evaluateQuote, setColor, type WindowDesign } from '@framezen/engine'
import { SAMPLE_CATALOG, SAMPLE_DEFAULTS } from '@framezen/catalog'
import type { Quote, QuoteSaveBody } from '@framezen/shared'
import { createQuoteEditor, UnsavedChangesError, type EditorNotice, type EditorSettings, type QuoteTransport } from './store'
import { docFromQuote, mergeDocs } from './doc'
import { createLocalDraftStore, type LocalDraft, type LocalDraftStore } from './localDrafts'

const catalog = SAMPLE_CATALOG
const design = (typology = 'casement', width = 1000, height = 1200): WindowDesign =>
  createDesign(typology, { lineId: SAMPLE_DEFAULTS.lineId, colorId: SAMPLE_DEFAULTS.colorId, glassId: SAMPLE_DEFAULTS.glassId, width, height })

const settings: EditorSettings = {
  pricing: { ...DEFAULT_PRICING },
  cut: { ...DEFAULT_CUT },
  documents: {
    quoteTemplate: 'esencial',
    catalogTemplate: 'vitrina',
    font: 'instrument',
    showUnitPrice: true,
    showArea: true,
    showGlass: true,
    showLine: true,
    showColorSwatch: true,
    showExteriorView: false,
    paper: 'letter',
    intro: '',
    conditions: '',
    paymentTerms: '',
    warranty: '',
    validityDays: 15,
    leadTimeText: '',
  },
  defaults: {},
}

function baseQuote(overrides: Partial<Quote> = {}): Quote {
  return {
    id: 'q1',
    number: 412,
    title: 'Casa Pérez',
    status: 'draft',
    items: [
      { id: 'a', ref: 'V1', qty: 1, design: design('casement', 900, 1200) },
      { id: 'b', ref: 'V2', qty: 2, design: design('fixed', 1500, 1000) },
    ],
    extras: [],
    discountPct: 0,
    revision: 0,
    version: 1,
    createdAt: '2026-10-31T12:00:00.000Z',
    updatedAt: '2026-10-31T12:00:00.000Z',
    ...overrides,
  }
}

/** Servidor falso con control de versión, como el real (PUT → 409 si la versión no calza). */
class FakeServer implements QuoteTransport {
  quote: Quote
  saves: QuoteSaveBody[] = []
  failNext: { status: number; message?: string }[] = []
  constructor(quote: Quote) {
    this.quote = structuredClone(quote)
  }
  async save(_id: string, body: QuoteSaveBody): Promise<Quote> {
    await Promise.resolve()
    this.saves.push(structuredClone(body))
    const fail = this.failNext.shift()
    if (fail) throw Object.assign(new Error(fail.message ?? 'falla'), { status: fail.status })
    if (body.version !== this.quote.version) throw Object.assign(new Error('version_conflict'), { status: 409 })
    const b = body as unknown as Record<string, unknown>
    const next: Quote = { ...this.quote, version: this.quote.version + 1, updatedAt: new Date().toISOString() }
    for (const key of ['title', 'items', 'extras', 'discountPct'] as const) if (b[key] !== undefined) (next as unknown as Record<string, unknown>)[key] = b[key]
    for (const key of ['clientId', 'pricing', 'notes', 'documentOverrides', 'validUntil'] as const) {
      if (b[key] === null) delete (next as unknown as Record<string, unknown>)[key]
      else if (b[key] !== undefined) (next as unknown as Record<string, unknown>)[key] = b[key]
    }
    this.quote = next
    return structuredClone(next)
  }
  async get(): Promise<Quote> {
    await Promise.resolve()
    return structuredClone(this.quote)
  }
  /** Otra pestaña guarda un cambio. */
  remoteEdit(fn: (q: Quote) => Quote) {
    this.quote = { ...fn(structuredClone(this.quote)), version: this.quote.version + 1 }
  }
}

function setup(quote = baseQuote(), opts: { notices?: EditorNotice[]; drafts?: LocalDraftStore; server?: FakeServer } = {}) {
  const server = opts.server ?? new FakeServer(quote)
  const notices = opts.notices ?? []
  const editor = createQuoteEditor({ quote, catalog, settings }, { transport: server, notify: (n) => notices.push(n), retryDelays: [1000, 2000], drafts: opts.drafts })
  return { server, editor, notices }
}

/** Almacén de borradores en memoria (como localStorage, pero aislado por prueba). */
function memoryDrafts() {
  const map = new Map<string, string>()
  const store: LocalDraftStore = {
    read: (id) => (map.has(id) ? (JSON.parse(map.get(id)!) as LocalDraft) : null),
    write: (draft) => {
      map.set(draft.quoteId, JSON.stringify(draft))
      return true
    },
    remove: (id) => {
      map.delete(id)
    },
  }
  return { store, map }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('historial de deshacer/rehacer', () => {
  it('deshace y rehace con la etiqueta de cada cambio', () => {
    const { editor } = setup()
    editor.setQty('a', 3)
    editor.setDiscount(5)
    editor.updateDesign('b', (d) => setColor(d, 'nogal'), 'Cambiar color a Nogal')
    const state = editor.get()
    expect(state.past.map((e) => e.label)).toEqual(['Cantidad de V1: 3', 'Descuento 5 %', 'Cambiar color a Nogal'])

    expect(editor.undo()).toBe('Cambiar color a Nogal')
    expect(editor.get().doc.items[1].design.colorId).toBe(SAMPLE_DEFAULTS.colorId)
    expect(editor.undo()).toBe('Descuento 5 %')
    expect(editor.get().doc.discountPct).toBe(0)
    expect(editor.get().future.map((e) => e.label)).toEqual(['Descuento 5 %', 'Cambiar color a Nogal'])

    expect(editor.redo()).toBe('Descuento 5 %')
    expect(editor.get().doc.discountPct).toBe(5)
    // Un cambio nuevo borra lo que se podía rehacer.
    editor.setTitle('Casa Pérez · Concepción')
    expect(editor.get().future).toEqual([])
    expect(editor.redo()).toBeNull()
  })

  it('agrupa cambios seguidos del mismo campo (escribir el título) en un solo paso', () => {
    const { editor } = setup()
    editor.setTitle('C')
    vi.advanceTimersByTime(200)
    editor.setTitle('Ca')
    vi.advanceTimersByTime(200)
    editor.setTitle('Casa')
    expect(editor.get().past).toHaveLength(1)
    editor.undo()
    expect(editor.get().doc.title).toBe('Casa Pérez')
  })

  it('agrupa los cambios continuos del lienzo con el mismo texto (mover travesaño, cambiar ancho) por ventana', () => {
    const { editor } = setup()
    editor.updateDesign('a', (d) => ({ ...d, width: 950 }), 'Cambiar ancho (V1)')
    vi.advanceTimersByTime(120)
    editor.updateDesign('a', (d) => ({ ...d, width: 980 }), 'Cambiar ancho (V1)')
    vi.advanceTimersByTime(120)
    editor.updateDesign('a', (d) => ({ ...d, width: 1000 }), 'Cambiar ancho (V1)')
    expect(editor.get().past).toHaveLength(1)
    // Otro texto u otra ventana: paso aparte.
    editor.updateDesign('a', (d) => ({ ...d, height: 1300 }), 'Cambiar alto (V1)')
    editor.updateDesign('b', (d) => ({ ...d, width: 1600 }), 'Cambiar ancho (V2)')
    expect(editor.get().past).toHaveLength(3)
    editor.undo()
    editor.undo()
    expect(editor.undo()).toBe('Cambiar ancho (V1)')
    expect(editor.get().doc.items[0].design.width).toBe(900)
  })

  it('un cambio sin efecto no entra al historial', () => {
    const { editor } = setup()
    expect(editor.commit('Nada', (doc) => doc)).toBe(false)
    editor.setDiscount(0)
    expect(editor.get().past).toEqual([])
    expect(editor.get().save.dirty).toBe(false)
  })

  it('al deshacer un borrado la ventana vuelve y queda seleccionada', () => {
    const { editor } = setup()
    editor.select('b')
    const removed = editor.removeItem('b')
    expect(removed?.ref).toBe('V2')
    expect(editor.get().doc.items.map((i) => i.id)).toEqual(['a'])
    expect(editor.get().selectedItemId).toBe('a')
    expect(editor.undo()).toBe('Eliminar V2')
    expect(editor.get().doc.items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(editor.get().selectedItemId).toBe('b')
  })
})

describe('ventanas y referencias', () => {
  it('agrega, duplica y elimina manteniendo V1, V2… si la numeración es automática', () => {
    const { editor } = setup()
    const id = editor.addItem({ design: design('tilt_turn'), qty: 2, location: 'Cocina' })
    expect(editor.get().selectedItemId).toBe(id)
    expect(editor.get().past.at(-1)?.label).toBe('Agregar V3')
    const copy = editor.duplicateItem('a')!
    expect(editor.get().doc.items.map((i) => [i.id, i.ref])).toEqual([
      ['a', 'V1'],
      [copy, 'V2'],
      ['b', 'V3'],
      [id, 'V4'],
    ])
    editor.removeItem('a')
    expect(editor.get().doc.items.map((i) => i.ref)).toEqual(['V1', 'V2', 'V3'])
    editor.moveItem(2, 0)
    expect(editor.get().doc.items.map((i) => i.id)).toEqual([id, copy, 'b'])
    expect(editor.get().doc.items.map((i) => i.ref)).toEqual(['V1', 'V2', 'V3'])
  })

  it('respeta referencias escritas a mano', () => {
    const { editor } = setup()
    editor.updateItem('b', { ref: 'P1' }, 'Referencia de V2')
    editor.addItem({ design: design() })
    expect(editor.get().doc.items.map((i) => i.ref)).toEqual(['V1', 'P1', 'V3'])
    editor.removeItem('a')
    expect(editor.get().doc.items.map((i) => i.ref)).toEqual(['P1', 'V3'])
  })

  it('reordena por lista de ids (arrastrar)', () => {
    const { editor } = setup()
    editor.reorderItems(['b', 'a'])
    expect(editor.get().doc.items.map((i) => [i.id, i.ref])).toEqual([
      ['b', 'V1'],
      ['a', 'V2'],
    ])
    expect(editor.get().past.at(-1)?.label).toBe('Reordenar ventanas')
  })
})

describe('totales en vivo', () => {
  it('calcula con el motor y los ajustes de la organización', () => {
    const { editor } = setup()
    const expected = evaluateQuote(docFromQuote(baseQuote()), catalog, settings.pricing, { cut: settings.cut })
    expect(editor.get().evaluation.totals).toEqual(expected.totals)
    expect(editor.get().evaluation.totals.total).toBeGreaterThan(0)
    expect(editor.get().evaluation.totals.units).toBe(3)
  })

  it('recalcula al instante con cantidad, descuento, extras y precio manual', () => {
    const { editor } = setup()
    const before = editor.get().evaluation.totals
    const unitA = editor.get().evaluation.items[0].price.unitNet
    editor.setQty('a', 2)
    expect(editor.get().evaluation.totals.subtotal).toBe(before.subtotal + unitA)
    editor.setDiscount(10)
    const t = editor.get().evaluation.totals
    expect(t.discount).toBe(Math.round(t.subtotal * 0.1))
    editor.setExtras([{ id: 'x', label: 'Instalación', amount: 100000 }])
    expect(editor.get().evaluation.totals.extras).toBe(100000)
    expect(editor.get().evaluation.totals.net).toBe(t.subtotal - t.discount + 100000)
    editor.updateItem('b', { manualUnitPrice: 50000 }, 'Precio manual de V2')
    expect(editor.get().evaluation.items[1].price.unitNet).toBe(50000)
    expect(editor.get().evaluation.items[1].price.manual).toBe(true)
    // Deshacer devuelve también las cifras.
    editor.undo()
    expect(editor.get().evaluation.items[1].price.manual).toBe(false)
  })

  it('usa los ajustes de precio propios de la cotización', () => {
    const { editor } = setup()
    const before = editor.get().evaluation.items[0].price.unitNet
    editor.setPricing({ marginPct: 60 })
    expect(editor.get().evaluation.items[0].price.unitNet).toBeGreaterThan(before)
  })
})

describe('autoguardado', () => {
  it('espera ~800 ms, agrupa los cambios y envía la versión', async () => {
    const { editor, server } = setup()
    editor.setQty('a', 2)
    vi.advanceTimersByTime(400)
    editor.setQty('a', 3)
    vi.advanceTimersByTime(700)
    expect(server.saves).toHaveLength(0)
    expect(editor.get().save.dirty).toBe(true)
    await vi.advanceTimersByTimeAsync(200)
    expect(server.saves).toHaveLength(1)
    expect(server.saves[0].version).toBe(1)
    expect(server.saves[0].items[0].qty).toBe(3)
    expect(editor.get().meta.version).toBe(2)
    expect(editor.get().save).toMatchObject({ status: 'saved', dirty: false })
    expect(editor.isSafeToLeave()).toBe(true)
  })

  it('los opcionales vacíos viajan como null para que el servidor los borre', async () => {
    const { editor, server } = setup(baseQuote({ clientId: 'c1', notes: 'algo' }))
    editor.setClient(null)
    editor.setNotes('')
    await editor.flush()
    const body = server.saves[0] as unknown as Record<string, unknown>
    expect(body.clientId).toBeNull()
    expect(body.notes).toBeNull()
    expect(server.quote.clientId).toBeUndefined()
  })

  it('si cambias algo mientras guarda, vuelve a guardar después', async () => {
    const { editor, server } = setup()
    editor.setQty('a', 2)
    await vi.advanceTimersByTimeAsync(800)
    editor.setQty('a', 5)
    await vi.advanceTimersByTimeAsync(900)
    expect(server.saves.map((s) => s.items[0].qty)).toEqual([2, 5])
    expect(server.saves.map((s) => s.version)).toEqual([1, 2])
    expect(server.quote.items[0].qty).toBe(5)
  })

  it('409: suma los cambios de otra pestaña y vuelve a aplicar los locales si no chocan', async () => {
    const { editor, server, notices } = setup()
    server.remoteEdit((q) => ({ ...q, title: 'Casa Pérez · desde el teléfono', items: [...q.items, { id: 'r', ref: 'V3', qty: 1, design: design('awning') }] }))
    editor.setQty('a', 4)
    await editor.flush()
    const doc = editor.get().doc
    expect(doc.title).toBe('Casa Pérez · desde el teléfono')
    expect(doc.items.map((i) => [i.id, i.qty])).toEqual([
      ['a', 4],
      ['b', 2],
      ['r', 1],
    ])
    // Primer intento con versión vieja (409) y segundo con la nueva.
    expect(server.saves.map((s) => s.version)).toEqual([1, 2])
    expect(server.quote.items[0].qty).toBe(4)
    expect(server.quote.title).toBe('Casa Pérez · desde el teléfono')
    expect(editor.get().meta.version).toBe(3)
    expect(editor.get().save).toMatchObject({ status: 'saved', dirty: false })
    expect(notices.map((n) => n.kind)).toEqual(['merged'])
    // Los totales siguen al documento fusionado.
    expect(editor.get().evaluation.items).toHaveLength(3)
  })

  it('409: si ambos cambiaron lo mismo, muestra lo del servidor y deja recuperar lo tuyo', async () => {
    const { editor, server, notices } = setup()
    server.remoteEdit((q) => ({ ...q, discountPct: 8 }))
    editor.setDiscount(12)
    await editor.flush()
    expect(editor.get().doc.discountPct).toBe(8)
    expect(editor.get().save.dirty).toBe(false)
    expect(notices[0]?.kind).toBe('conflict')
    expect(editor.get().past.at(-1)?.label).toBe('Tus cambios de esta pestaña')
    // «Recuperar mis cambios»: vuelve el 12 % y se guarda sobre la versión nueva.
    ;(notices[0] as Extract<EditorNotice, { kind: 'conflict' }>).recover()
    expect(editor.get().doc.discountPct).toBe(12)
    await editor.flush()
    expect(server.quote.discountPct).toBe(12)
  })

  it('sin conexión: avisa con calma y reintenta solo', async () => {
    const { editor, server } = setup()
    server.failNext.push({ status: 0 })
    editor.setQty('b', 7)
    await vi.advanceTimersByTimeAsync(800)
    expect(editor.get().save.status).toBe('offline')
    expect(editor.get().save.dirty).toBe(true)
    expect(editor.isSafeToLeave()).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(editor.get().save).toMatchObject({ status: 'saved', dirty: false })
    expect(server.quote.items[1].qty).toBe(7)
  })

  it('un error de datos se avisa una vez y no se reintenta en bucle', async () => {
    const { editor, server, notices } = setup()
    server.failNext.push({ status: 400, message: 'La cantidad debe ser un número entero.' })
    editor.setQty('b', 3)
    await vi.advanceTimersByTimeAsync(800)
    expect(editor.get().save.status).toBe('error')
    expect(notices).toEqual([{ kind: 'save-error', message: 'La cantidad debe ser un número entero.' }])
    await vi.advanceTimersByTimeAsync(60_000)
    expect(server.saves).toHaveLength(1)
    // El siguiente cambio vuelve a intentar.
    editor.setQty('b', 4)
    await vi.advanceTimersByTimeAsync(800)
    expect(editor.get().save.status).toBe('saved')
  })

  it('las operaciones del servidor esperan el guardado y toman la versión nueva', async () => {
    const { editor, server } = setup()
    editor.setQty('a', 9)
    const result = await editor.serverOp(async () => {
      // El envío ve lo último guardado.
      expect(server.quote.items[0].qty).toBe(9)
      server.quote = { ...server.quote, status: 'sent', revision: 1, version: server.quote.version + 1, shareToken: 'tok' }
      return { quote: structuredClone(server.quote), url: 'https://x/c/tok' }
    }, (r) => r.quote)
    expect(result.url).toBe('https://x/c/tok')
    expect(editor.get().meta).toMatchObject({ status: 'sent', revision: 1, version: 3, shareToken: 'tok' })
    editor.setQty('a', 1)
    await editor.flush()
    expect(server.saves.at(-1)?.version).toBe(3)
  })
})

describe('mergeDocs', () => {
  it('ventanas nuevas en ambos lados con la misma referencia no se pisan', () => {
    const base = docFromQuote(baseQuote())
    const local = { ...base, items: [...base.items, { id: 'l', ref: 'V3', qty: 1, design: design() }] }
    const remote = { ...base, items: [...base.items, { id: 'r', ref: 'V3', qty: 1, design: design('fixed') }] }
    const merged = mergeDocs(base, local, remote)
    expect(merged.clean).toBe(true)
    expect(merged.doc.items.map((i) => i.ref)).toEqual(['V1', 'V2', 'V3', 'V4'])
  })

  it('una ventana borrada aquí y editada allá es un choque', () => {
    const base = docFromQuote(baseQuote())
    const local = { ...base, items: base.items.slice(1) }
    const remote = { ...base, items: [{ ...base.items[0], qty: 5 }, base.items[1]] }
    expect(mergeDocs(base, local, remote).clean).toBe(false)
  })
})

describe('getQuote', () => {
  it('compone la cotización completa con totales en vivo', () => {
    const { editor } = setup()
    editor.setTitle('Obra nueva')
    const quote = editor.getQuote()
    expect(quote).toMatchObject({ id: 'q1', number: 412, title: 'Obra nueva', status: 'draft', version: 1 })
    expect(quote.totals?.total).toBe(editor.get().evaluation.totals.total)
  })
})

describe('catálogo y ajustes que llegan después de abrir', () => {
  it('setCatalog recalcula el precio en vivo con el catálogo nuevo (p. ej. un descuento de perfiles)', () => {
    const { editor } = setup()
    const before = editor.get().evaluation.totals.total
    const discounted = { ...catalog, brandSettings: catalog.brandSettings.map((b) => ({ ...b, discounts: { ...b.discounts, profiles: 30 } })) }
    editor.setCatalog(discounted)
    const expected = evaluateQuote(docFromQuote(baseQuote()), discounted, settings.pricing, { cut: settings.cut })
    expect(editor.get().catalog).toBe(discounted)
    expect(editor.get().evaluation.totals).toEqual(expected.totals)
    expect(editor.get().evaluation.totals.total).toBeLessThan(before)
    // No es un cambio del documento: ni historial ni guardado.
    expect(editor.get().past).toHaveLength(0)
    expect(editor.get().save.dirty).toBe(false)
  })

  it('setSettings recalcula con el margen nuevo; los mismos ajustes no recalculan', () => {
    const { editor } = setup()
    const before = editor.get().evaluation
    editor.setSettings({ ...settings, pricing: { ...settings.pricing } })
    expect(editor.get().evaluation).toBe(before)
    const higher = { ...settings, pricing: { ...settings.pricing, marginPct: (settings.pricing.marginPct ?? 40) + 10 } }
    editor.setSettings(higher)
    const expected = evaluateQuote(docFromQuote(baseQuote()), catalog, higher.pricing, { cut: higher.cut })
    expect(editor.get().evaluation.totals).toEqual(expected.totals)
    expect(editor.get().evaluation.totals.total).toBeGreaterThan(before.totals.total)
    expect(editor.get().settings).toBe(higher)
  })
})

describe('cambios sin guardar en este equipo', () => {
  it('sin conexión deja el documento en el equipo; al reabrir lo recupera y lo guarda', async () => {
    const drafts = memoryDrafts()
    const { editor, server } = setup(baseQuote(), { drafts: drafts.store })
    server.failNext.push({ status: 0 })
    editor.setTitle('Editado sin conexión')
    await vi.advanceTimersByTimeAsync(800)
    expect(editor.get().save).toMatchObject({ status: 'offline', dirty: true, retrying: true, local: true })
    expect(drafts.map.has('q1')).toBe(true)

    // Se cierra la pestaña (el editor desaparece) y vuelve la conexión.
    editor.dispose()
    const notices: EditorNotice[] = []
    const reopened = setup(structuredClone(server.quote), { drafts: drafts.store, notices, server }).editor
    expect(reopened.get().doc.title).toBe('Editado sin conexión')
    expect(reopened.get().save.dirty).toBe(true)
    expect(reopened.get().past.at(-1)?.label).toBe('Recuperar cambios sin guardar')
    await vi.advanceTimersByTimeAsync(10)
    expect(notices).toContainEqual({ kind: 'restored' })
    expect(server.quote.title).toBe('Editado sin conexión')
    expect(reopened.get().save).toMatchObject({ status: 'saved', dirty: false, local: false })
    expect(drafts.map.has('q1')).toBe(false)
  })

  it('si el servidor cambió otra cosa mientras tanto, suma ambos cambios', async () => {
    const drafts = memoryDrafts()
    const { editor, server } = setup(baseQuote(), { drafts: drafts.store })
    server.failNext.push({ status: 0 })
    editor.setTitle('Título local')
    await vi.advanceTimersByTimeAsync(800)
    editor.dispose()
    server.remoteEdit((q) => ({ ...q, discountPct: 7 }))
    const reopened = setup(structuredClone(server.quote), { drafts: drafts.store, server }).editor
    expect(reopened.get().doc).toMatchObject({ title: 'Título local', discountPct: 7 })
    await vi.advanceTimersByTimeAsync(10)
    expect(server.quote).toMatchObject({ title: 'Título local', discountPct: 7 })
    expect(drafts.map.has('q1')).toBe(false)
  })

  it('si el guardado sí llegó (se perdió la respuesta), no hay nada que recuperar', async () => {
    const drafts = memoryDrafts()
    const { editor, server } = setup(baseQuote(), { drafts: drafts.store })
    server.failNext.push({ status: 0 })
    editor.setTitle('Ya guardado')
    await vi.advanceTimersByTimeAsync(800)
    editor.dispose()
    server.remoteEdit((q) => ({ ...q, title: 'Ya guardado' }))
    const notices: EditorNotice[] = []
    const reopened = setup(structuredClone(server.quote), { drafts: drafts.store, notices, server }).editor
    expect(reopened.get().save.dirty).toBe(false)
    expect(reopened.get().past).toHaveLength(0)
    expect(drafts.map.has('q1')).toBe(false)
    await vi.advanceTimersByTimeAsync(10)
    expect(notices).toEqual([])
  })

  it('el borrador se escribe mientras hay cambios pendientes y se borra al confirmarse el guardado', async () => {
    const drafts = memoryDrafts()
    const { editor } = setup(baseQuote(), { drafts: drafts.store })
    editor.setQty('a', 4)
    expect(drafts.map.has('q1')).toBe(false)
    await vi.advanceTimersByTimeAsync(250)
    const draft = JSON.parse(drafts.map.get('q1')!) as LocalDraft
    expect(draft).toMatchObject({ quoteId: 'q1', baseVersion: 1 })
    expect(draft.doc.items[0].qty).toBe(4)
    expect(draft.base.items[0].qty).toBe(1)
    await vi.advanceTimersByTimeAsync(600)
    expect(editor.get().save).toMatchObject({ status: 'saved', dirty: false })
    expect(drafts.map.has('q1')).toBe(false)
  })

  it('el almacén del navegador (localStorage) guarda, lee y descarta borradores viejos', () => {
    let clock = 1_000_000
    const store = createLocalDraftStore(() => clock)
    const doc = docFromQuote(baseQuote())
    expect(store.write({ quoteId: 'qx', baseVersion: 3, base: doc, doc: { ...doc, title: 'Local' }, at: clock })).toBe(true)
    expect(store.read('qx')).toMatchObject({ quoteId: 'qx', baseVersion: 3, doc: { title: 'Local' } })
    expect(store.read('otra')).toBeNull()
    clock += 31 * 86_400_000
    expect(store.read('qx')).toBeNull()
    expect(window.localStorage.getItem('fz:quote-draft:qx')).toBeNull()
    window.localStorage.setItem('fz:quote-draft:qy', '{roto')
    expect(store.read('qy')).toBeNull()
    store.remove('qy')
  })
})

describe('acciones con cambios que no llegaron al servidor', () => {
  it('un 4xx deja los cambios sin guardar: serverOp no llama al servidor y explica qué corregir', async () => {
    const { editor, server } = setup()
    const message = 'Revisa el nombre: es demasiado largo.'
    server.failNext.push({ status: 400, message }, { status: 400, message }, { status: 400, message })
    editor.updateItem('a', { name: 'Ventana del living' })
    await vi.advanceTimersByTimeAsync(800)
    expect(editor.get().save).toMatchObject({ status: 'error', dirty: true, retrying: false, message })
    const op = vi.fn(async () => structuredClone(server.quote))
    const error = await editor.serverOp(op).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(UnsavedChangesError)
    expect((error as Error).message).toContain(message)
    expect(op).not.toHaveBeenCalled()
    // Lo que no depende del documento (cambiar el estado) sí puede correr.
    await editor.serverOp(op, undefined, { requireSaved: false })
    expect(op).toHaveBeenCalledTimes(1)
  })

  it('sin conexión, ensureSaved avisa que los cambios aún no llegan', async () => {
    const { editor, server } = setup()
    server.failNext.push({ status: 0 }, { status: 0 })
    editor.setQty('a', 2)
    await vi.advanceTimersByTimeAsync(800)
    await expect(editor.ensureSaved()).rejects.toThrow(/Sin conexión/)
    await vi.advanceTimersByTimeAsync(2000)
    await expect(editor.ensureSaved()).resolves.toBeUndefined()
  })

  it('una falla pasajera del servidor (5xx) se reintenta sola y no deja un mensaje viejo', async () => {
    const { editor, server } = setup()
    server.failNext.push({ status: 400, message: 'Dato inválido.' })
    editor.setQty('a', 2)
    await vi.advanceTimersByTimeAsync(800)
    expect(editor.get().save).toMatchObject({ status: 'error', retrying: false, message: 'Dato inválido.' })
    server.failNext.push({ status: 503 })
    editor.setQty('a', 3)
    await vi.advanceTimersByTimeAsync(800)
    expect(editor.get().save).toMatchObject({ status: 'error', retrying: true })
    expect(editor.get().save.message).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1000)
    expect(editor.get().save).toMatchObject({ status: 'saved', dirty: false })
  })
})
