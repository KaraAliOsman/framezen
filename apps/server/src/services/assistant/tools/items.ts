/**
 * Ventanas de una cotización: agregar (con todo: tipología, aperturas, accesorios, bicolor,
 * vidrio), cambiar una, varias o todas, duplicar, quitar y explicar el precio. El diseño se arma
 * con el motor en el servidor y se guarda con PUT /api/quotes/:id (versión optimista); el editor
 * abierto recarga la cotización con el evento `affected`.
 */
import { ASSEMBLY_PRESETS, createAssembly, evaluateQuote, explainPrice, invertAssembly, isAssembly, joinWindow, presetAvailability, setAssemblyAngle, type Catalog, type PendingPrice, type WindowDesign } from '@dekopen/engine'
import { assemblyLabel, warningMessage, type AgentToolArgs, type Quote, type QuoteItem } from '@dekopen/shared'
import { shortId } from '../../../lib/crypto'
import { canSeeMargins } from '../../access'
import { getSettings } from '../../settings'
import { buildWindowDesign, rejectMisses, updateWindowDesign, type DesignEnv } from '../design'
import { resolveItems } from '../resolve'
import { designEnv, ensureOk, itemForModel, loadQuote, pendingForModel, quoteNo, quotePendingForModel, quoteUndo, refsLabel, resolveQuoteId, saveQuote, totalsForModel } from './common'
import { previewTotals } from './quotes'
import { ToolFailure, type ToolContext, type ToolHandler, type ToolOutcome } from './types'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** Próxima referencia libre «V<n>» (sin repetir aunque se hayan quitado ventanas). */
export function nextRef(items: readonly Pick<QuoteItem, 'ref'>[], offset = 0): string {
  let max = 0
  for (const item of items) {
    const m = /^V(\d+)$/i.exec(item.ref ?? '')
    if (m) max = Math.max(max, Number(m[1]))
  }
  return `V${Math.max(max, items.length) + 1 + offset}`
}

function dataOf(quote: Quote, items: QuoteItem[]) {
  return { items, extras: quote.extras, discountPct: quote.discountPct ?? 0, ...(quote.pricing ? { pricing: quote.pricing } : {}) }
}

async function totalsPreview(ctx: ToolContext, quote: Quote, items: QuoteItem[]) {
  const after = await previewTotals(ctx, dataOf(quote, items))
  return after ? { before: quote.totals?.net, after: after.net, currency: ctx.text.fmt.currency } : undefined
}

function sizeOf(ctx: ToolContext, design: WindowDesign): string {
  return ctx.text.fmt.size(design.width, design.height)
}

interface NewItem {
  quote: Quote | null
  env: DesignEnv
  design: WindowDesign
  notes: string[]
  changes: string[]
  /** Nombre visible: tipología o tipo de conjunto. */
  label: string
  fields: { qty?: number; location?: string; name?: string; notes?: string }
}

/** Agrega un diseño ya armado a la cotización (o crea una si no hay ninguna abierta). */
async function insertItem(ctx: ToolContext, input: NewItem): Promise<ToolOutcome> {
  const { quote, env, fields, notes } = input
  const qty = fields.qty ?? 1
  const item: QuoteItem = {
    id: shortId(),
    ref: nextRef(quote?.items ?? []),
    qty,
    design: input.design,
    ...(fields.location ? { location: fields.location } : {}),
    ...(fields.name ? { name: fields.name } : {}),
    ...(fields.notes ? { notes: fields.notes } : {}),
  }
  const typology = input.label
  const size = sizeOf(ctx, input.design)
  const qtyText = qty > 1 ? ` · ${ctx.text.t('change.qty', { qty })}` : ''
  const target = quote ? quoteNo(ctx, quote) : ctx.text.t('quote.new')

  if (ctx.dryRun) {
    const title = ctx.text.t('propose.add_window', { typology, size, number: target })
    const totals = quote ? await totalsPreview(ctx, quote, [...quote.items, item]) : undefined
    return {
      ok: true,
      summary: title,
      preview: { title, lines: [`${item.ref} · ${typology} ${size}${qtyText}`, ...input.changes], ...(totals ? { totals } : {}) },
      ...(quote ? { affected: [{ type: 'quote' as const, id: quote.id, version: quote.version }] } : {}),
    }
  }

  if (!quote) {
    // Sin cotización abierta: se crea una con esta ventana (como en la web).
    const created = ensureOk(await ctx.call<Quote>('quoteCreate', { body: { items: [{ ...item, ref: 'V1' }] } }))
    ctx.memo.quoteId = created.id
    const added = created.items[0]!
    ctx.memo.lastItemId = added.id
    const pending = await quotePendingForModel(ctx, created)
    return {
      ok: true,
      summary: withPendingNote(ctx, ctx.text.t('done.add_window', { ref: added.ref, typology, size, qty: qtyText }), pending, added.ref),
      data: { quote: { id: created.id, number: created.number, created: true }, item: itemForModel(added, env.catalog), notes, totals: totalsForModel(ctx, created.totals), pending },
      affected: [{ type: 'quote', id: created.id, version: created.version }],
      ui: [{ kind: 'open_quote', quoteId: created.id, itemId: added.id }],
      undo: {
        method: 'DELETE',
        path: `/api/quotes/${created.id}`,
        route: 'quoteDelete',
        params: { id: created.id },
        expectedVersion: created.version,
        entity: { type: 'quote', id: created.id, version: created.version },
        guard: { route: 'quoteGet', params: { id: created.id }, field: 'version', value: created.version },
      },
    }
  }

  const { before, after } = await saveQuote(ctx, quote, { items: [...quote.items, item] }, (fresh) => ({ items: [...fresh.items, { ...item, ref: nextRef(fresh.items) }] }))
  const added = after.items.find((i) => i.id === item.id) ?? after.items[after.items.length - 1]!
  ctx.memo.quoteId = after.id
  ctx.memo.lastItemId = added.id
  const pending = await quotePendingForModel(ctx, after)
  return {
    ok: true,
    summary: withPendingNote(ctx, ctx.text.t('done.add_window', { ref: added.ref, typology, size, qty: qtyText }), pending, added.ref),
    data: { quote: { id: after.id, number: after.number }, item: itemForModel(added, env.catalog), notes, totals: totalsForModel(ctx, after.totals), pending },
    affected: [{ type: 'quote', id: after.id, version: after.version }],
    ui: [{ kind: 'select_item', quoteId: after.id, itemId: added.id }],
    undo: quoteUndo(before, after),
  }
}

const addWindow: ToolHandler<'add_window'> = async (ctx, args) => {
  const env = await designEnv(ctx)
  const quoteId = await resolveQuoteId(ctx, args, { optional: true })
  const quote = quoteId ? await loadQuote(ctx, quoteId) : null
  const built = buildWindowDesign(env, args, quote?.items ?? [])
  rejectMisses(env, built.misses)
  return insertItem(ctx, { quote, env, design: built.design, notes: built.notes, changes: built.changes, label: ctx.text.typology(built.typologyId), fields: args })
}

/** Conjunto de ventanas (acopladas, esquina, bay, bow): solo lo que la línea puede fabricar. */
const addAssembly: ToolHandler<'add_assembly'> = async (ctx, args) => {
  const env = await designEnv(ctx)
  const quoteId = await resolveQuoteId(ctx, args, { optional: true })
  const quote = quoteId ? await loadQuote(ctx, quoteId) : null
  // Línea, color y vidrio se resuelven igual que en una ventana; las medidas son por unidad.
  const base = buildWindowDesign(env, { typology: 'fixed', ...(args.line ? { line: args.line } : {}), ...(args.color ? { color: args.color } : {}), ...(args.glass ? { glass: args.glass } : {}), width: args.width ?? 1000, height: args.height ?? 1000 }, quote?.items ?? [])
  rejectMisses(env, base.misses)
  const preset = ASSEMBLY_PRESETS.find((p) => p.id === args.preset)!
  // Igual que el editor: la línea pedida; sin pedir una, la que pueda fabricarlo. Si ninguna trae la
  // pieza se crea igual y el motor deja la unión fuera del total: no se bloquea ni se inventa.
  const able = (id: string) => presetAvailability(preset, id, env.catalog)
  const other = args.line || able(base.design.lineId).ok ? undefined : env.catalog.lines.find((l) => l.kind === 'casement' && able(l.id).ok)
  const lineId = other?.id ?? base.design.lineId
  const availability = able(lineId)
  let design = createAssembly(
    preset.id,
    {
      lineId,
      colorId: base.design.colorId,
      glassId: base.design.glassId ?? '',
      ...(args.width ? { width: args.width } : {}),
      ...(args.height ? { height: args.height } : {}),
      ...(args.panes ? { count: args.panes } : {}),
      angle: args.angle ?? availability.angle,
    },
    env.catalog,
  )
  if (args.inward) design = invertAssembly(design, env.catalog)
  const notes = [
    ...(other ? [`The default line cannot build this assembly: used ${other.name}.`] : []),
    ...(availability.ok && availability.angle !== preset.angle ? [`The line allows ${availability.angle}° instead of ${preset.angle}°: used that angle.`] : []),
  ]
  return insertItem(ctx, { quote, env, design, notes, changes: [], label: assemblyLabel(preset.id, ctx.text.locale), fields: args })
}

/** Lo que quedó fuera del total también va en el resumen: un comando local no pasa por el modelo. */
function withPendingNote(ctx: ToolContext, summary: string, pending: Awaited<ReturnType<typeof quotePendingForModel>>, ref: string): string {
  const entry = pending?.find((p) => p.ref === ref)
  if (!entry) return summary
  const joint = entry.missing.some((m) => m.code === 'joint_missing')
  return `${summary}. ${ctx.text.t(joint ? 'pending.joint' : 'pending.item')}`
}

/** Un 0 no es un precio: sin alguna pieza, el motor deja la ventana (o parte) fuera del total. */
const pendingNote = (item: Pick<QuoteItem, 'ref'>, price: { unitNet: number; pending?: readonly PendingPrice[] }, catalog: Catalog) => {
  const pending = pendingForModel(item, price, catalog)
  return pending ? { pending } : {}
}

/** Precio de una ventana sin guardar nada: para preguntas, no crea ni cambia cotizaciones. */
const estimateWindow: ToolHandler<'estimate_window'> = async (ctx, args) => {
  const env = await designEnv(ctx)
  const built = buildWindowDesign(env, args, [])
  rejectMisses(env, built.misses)
  const qty = args.qty ?? 1
  const item: QuoteItem = { id: shortId(), ref: 'V1', qty, design: built.design }
  const settings = await getSettings(ctx.deps.db, ctx.auth.org.id)
  const { catalog } = await ctx.deps.catalogs.effective(ctx.auth.org.id, { onlyEnabled: false, kerf: settings.cut.kerf })
  const evaluation = evaluateQuote({ items: [item], extras: [], discountPct: 0 }, catalog as Catalog, settings.pricing, { cut: settings.cut })
  const priced = evaluation.items.find((i) => i.id === item.id)
  if (!priced) throw new ToolFailure('not_found', 'The engine could not price this window.')
  const design = built.design
  return {
    ok: true,
    summary: ctx.text.t('done.estimate_window', { typology: ctx.text.typology(built.typologyId), size: sizeOf(ctx, design) }),
    data: {
      saved: false,
      typology: built.typologyId,
      line: env.catalog.lines.find((l) => l.id === design.lineId)?.name,
      colour: env.catalog.colors.find((c) => c.id === design.colorId)?.name,
      glass: env.catalog.glass.find((g) => g.id === design.glassId)?.name,
      width: design.width,
      height: design.height,
      qty,
      unitNet: priced.price.unitNet,
      ...pendingNote(item, priced.price, catalog as Catalog),
      totals: totalsForModel(ctx, evaluation.totals),
      currency: ctx.text.fmt.currency,
      notes: built.notes,
      warnings: priced.price.warnings.slice(0, 8).map((w) => warningMessage(w, ctx.text.locale)),
    },
  }
}

/** Une ventanas de la cotización en un solo ítem: quedan en el orden pedido, con sus diseños. */
const joinWindows: ToolHandler<'join_windows'> = async (ctx, args) => {
  const env = await designEnv(ctx)
  const quote = await loadQuote(ctx, (await resolveQuoteId(ctx, args))!)
  const { items: found, missing } = resolveItems(quote, { items: args.items }, { lastItemId: ctx.memo.lastItemId, selectedId: ctx.ui.selectedItemId })
  if (missing.length) throw new ToolFailure('not_found', `Window ${missing.join(', ')} is not in this quote. Nothing was changed.`)
  // En el orden que pidió la persona (no el de la cotización).
  const items = args.items.flatMap((ref) => found.filter((i) => i.ref.toUpperCase() === ref.toUpperCase()))
  if (new Set(items.map((i) => i.id)).size < 2) throw new ToolFailure('invalid_args', 'At least two different windows are needed to join them. Nothing was changed.')
  const qtys = [...new Set(items.map((i) => i.qty))]
  if (qtys.length > 1) {
    const list = items.map((i) => `${i.ref} has ${i.qty}`).join(', ')
    throw new ToolFailure('invalid_args', `They cannot be joined with different quantities (${list}). Nothing was changed: ask the user which quantity to use.`)
  }
  const [first, ...rest] = items as [QuoteItem, ...QuoteItem[]]
  const side = args.side ?? 'right'
  let design = rest.reduce((joined, item) => joinWindow(joined, item.design, side, env.catalog), first.design)
  // Sin poste para ese ángulo se une igual: el motor deja la unión fuera del total.
  if (args.angle !== undefined) design = setAssemblyAngle(design, args.angle, env.catalog)
  const refs = items.map((i) => i.ref).join(' + ')
  const removed = new Set(rest.map((i) => i.id))
  const merged: QuoteItem = { ...first, design }
  const size = sizeOf(ctx, design)
  const next = quote.items.filter((i) => !removed.has(i.id)).map((i) => (i.id === first.id ? merged : i))
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.join_windows', { refs, number: quoteNo(ctx, quote) })
    const totals = await totalsPreview(ctx, quote, next)
    return { ok: true, summary: title, preview: { title, lines: [`${first.ref} · ${size}`], ...(totals ? { totals } : {}) }, affected: [{ type: 'quote' as const, id: quote.id, version: quote.version }] }
  }
  const { before, after } = await saveQuote(ctx, quote, { items: next }, (fresh) => ({ items: fresh.items.filter((i) => !removed.has(i.id)).map((i) => (i.id === first.id ? merged : i)) }))
  ctx.memo.quoteId = after.id
  ctx.memo.lastItemId = first.id
  const saved = after.items.find((i) => i.id === first.id) ?? merged
  const pending = await quotePendingForModel(ctx, after)
  return {
    ok: true,
    summary: withPendingNote(ctx, ctx.text.t('done.join_windows', { refs, ref: first.ref, size }), pending, first.ref),
    data: { quote: { id: after.id, number: after.number }, item: itemForModel(saved, env.catalog), joined: items.map((i) => i.ref), totals: totalsForModel(ctx, after.totals), pending },
    affected: [{ type: 'quote', id: after.id, version: after.version }],
    ui: [{ kind: 'select_item', quoteId: after.id, itemId: first.id }],
    undo: quoteUndo(before, after),
  }
}

interface ItemChange {
  item: QuoteItem
  next: QuoteItem
  changes: string[]
}

function computeUpdates(ctx: ToolContext, env: DesignEnv, quote: Quote, args: AgentToolArgs['update_window']): { updates: ItemChange[]; notes: string[]; missing: string[] } {
  if (!quote.items.length) throw new ToolFailure('empty_quote', 'This quote has no windows yet. Add one first.')
  const { items, missing } = resolveItems(quote, args, { lastItemId: ctx.memo.lastItemId, selectedId: ctx.ui.selectedItemId })
  if (!items.length) throw new ToolFailure('not_found', `Window ${missing.join(', ') || ''} not found in this quote.`.trim())
  const notes = new Set<string>()
  const updates: ItemChange[] = []
  for (const item of items) {
    if (isAssembly(item.design) && (args.width !== undefined || args.height !== undefined) && !args.all) {
      throw new ToolFailure('assembly_size', `${item.ref} is an assembly: its size comes from its units, so width and height cannot be set here. Remove it and add it again with add_assembly, where width is per unit. Nothing was changed.`)
    }
    const result = updateWindowDesign(env, item.design, args)
    rejectMisses(env, result.misses)
    result.notes.forEach((n) => notes.add(n))
    const next: QuoteItem = { ...item, design: result.design }
    const changes = [...result.changes]
    if (args.qty && args.qty !== item.qty) {
      next.qty = args.qty
      changes.push(ctx.text.t('change.qty', { qty: args.qty }))
    }
    if (args.location !== undefined && args.location !== (item.location ?? '')) {
      next.location = args.location || undefined
      changes.push(ctx.text.t('change.location', { name: args.location }))
    }
    if (args.name !== undefined && args.name !== (item.name ?? '')) {
      next.name = args.name || undefined
      changes.push(ctx.text.t('change.name', { name: args.name }))
    }
    if (args.notes !== undefined && args.notes !== (item.notes ?? '')) {
      next.notes = args.notes || undefined
      changes.push(ctx.text.t('change.notes'))
    }
    if (changes.length) updates.push({ item, next, changes })
  }
  if (missing.length) notes.add(`Not found: ${missing.join(', ')}; changed the rest.`)
  return { updates, notes: [...notes], missing }
}

const updateWindow: ToolHandler<'update_window'> = async (ctx, args) => {
  const env = await designEnv(ctx)
  const quote = await loadQuote(ctx, (await resolveQuoteId(ctx, args))!)
  const { updates, notes } = computeUpdates(ctx, env, quote, args)
  const allChanges = [...new Set(updates.flatMap((u) => u.changes))]
  if (!updates.length) {
    return { ok: false, summary: ctx.text.t('reply.failed', { reason: ctx.text.t('change.nothing') }), error: { code: 'nothing_to_change', message: notes.join(' ') || 'Nothing to change: the windows already are like that.' } }
  }
  const byId = new Map(updates.map((u) => [u.item.id, u.next]))
  const items = quote.items.map((i) => byId.get(i.id) ?? i)
  const refs = refsLabel(ctx, updates.map((u) => u.item), quote.items.length)
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.update_window', { refs, number: quoteNo(ctx, quote) })
    const totals = await totalsPreview(ctx, quote, items)
    return {
      ok: true,
      summary: title,
      preview: { title, lines: updates.slice(0, 12).map((u) => `${u.item.ref}: ${ctx.text.list(u.changes)}`), ...(totals ? { totals } : {}) },
      affected: [{ type: 'quote', id: quote.id, version: quote.version }],
    }
  }
  const { before, after } = await saveQuote(ctx, quote, { items }, (fresh) => {
    const again = computeUpdates(ctx, env, fresh, args).updates
    if (!again.length) return null
    const map = new Map(again.map((u) => [u.item.id, u.next]))
    return { items: fresh.items.map((i) => map.get(i.id) ?? i) }
  })
  ctx.memo.quoteId = after.id
  ctx.memo.lastItemId = updates[updates.length - 1]!.item.id
  return {
    ok: true,
    summary: ctx.text.t('done.update_window', { refs, changes: ctx.text.list(allChanges) }),
    data: { changed: updates.map((u) => u.item.ref), notes, totals: totalsForModel(ctx, after.totals), pending: await quotePendingForModel(ctx, after) },
    affected: [{ type: 'quote', id: after.id, version: after.version }],
    ...(updates.length === 1 ? { ui: [{ kind: 'select_item' as const, quoteId: after.id, itemId: updates[0]!.item.id }] } : {}),
    undo: quoteUndo(before, after),
  }
}

const duplicateWindow: ToolHandler<'duplicate_window'> = async (ctx, args) => {
  const quote = await loadQuote(ctx, (await resolveQuoteId(ctx, args))!)
  const { items, missing } = resolveItems(quote, { ref: args.ref }, { lastItemId: ctx.memo.lastItemId, selectedId: ctx.ui.selectedItemId })
  const source = items[0]
  if (!source) throw new ToolFailure('not_found', missing.length ? `Window ${missing[0]} not found.` : 'There are no windows to duplicate yet.')
  const copies = Math.min(20, Math.max(1, args.copies ?? 1))
  const created: QuoteItem[] = Array.from({ length: copies }, (_, n) => ({ ...clone(source), id: shortId(), ref: nextRef(quote.items, n) }))
  const refs = ctx.text.list(created.map((c) => c.ref))
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.duplicate_window', { ref: source.ref, number: quoteNo(ctx, quote) })
    const totals = await totalsPreview(ctx, quote, [...quote.items, ...created])
    return { ok: true, summary: title, preview: { title, lines: [refs], ...(totals ? { totals } : {}) }, affected: [{ type: 'quote', id: quote.id, version: quote.version }] }
  }
  const { before, after } = await saveQuote(ctx, quote, { items: [...quote.items, ...created] }, (fresh) => ({
    items: [...fresh.items, ...created.map((c, n) => ({ ...c, ref: nextRef(fresh.items, n) }))],
  }))
  ctx.memo.quoteId = after.id
  ctx.memo.lastItemId = created[created.length - 1]!.id
  return {
    ok: true,
    summary: ctx.text.t('done.duplicate_window', { ref: source.ref, copies: refs }),
    data: { source: source.ref, copies: created.map((c) => c.ref), totals: totalsForModel(ctx, after.totals) },
    affected: [{ type: 'quote', id: after.id, version: after.version }],
    undo: quoteUndo(before, after),
  }
}

const removeWindow: ToolHandler<'remove_window'> = async (ctx, args) => {
  const quote = await loadQuote(ctx, (await resolveQuoteId(ctx, args))!)
  const { items, missing } = resolveItems(quote, args, { lastItemId: ctx.memo.lastItemId, selectedId: ctx.ui.selectedItemId })
  if (!items.length) throw new ToolFailure('not_found', missing.length ? `Window ${missing.join(', ')} not found.` : 'There are no windows to remove.')
  const ids = new Set(items.map((i) => i.id))
  const remaining = quote.items.filter((i) => !ids.has(i.id))
  const refs = refsLabel(ctx, items, quote.items.length)
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.remove_window', { refs, number: quoteNo(ctx, quote) })
    const totals = await totalsPreview(ctx, quote, remaining)
    return {
      ok: true,
      summary: title,
      preview: { title, lines: items.slice(0, 12).map((i) => `${i.ref} · ${sizeOf(ctx, i.design)}`), ...(totals ? { totals } : {}) },
      affected: [{ type: 'quote', id: quote.id, version: quote.version }],
    }
  }
  const { before, after } = await saveQuote(ctx, quote, { items: remaining }, (fresh) => ({ items: fresh.items.filter((i) => !ids.has(i.id)) }))
  if (ctx.memo.lastItemId && ids.has(ctx.memo.lastItemId)) delete ctx.memo.lastItemId
  return {
    ok: true,
    summary: ctx.text.t('done.remove_window', { refs }),
    data: { removed: items.map((i) => i.ref), ...(missing.length ? { notFound: missing } : {}), totals: totalsForModel(ctx, after.totals) },
    affected: [{ type: 'quote', id: after.id, version: after.version }],
    undo: quoteUndo(before, after),
  }
}

const explain: ToolHandler<'explain_price'> = async (ctx, args) => {
  const quote = await loadQuote(ctx, (await resolveQuoteId(ctx, args))!)
  const { items } = resolveItems(quote, { ref: args.ref }, { lastItemId: ctx.memo.lastItemId, selectedId: ctx.ui.selectedItemId })
  const item = items[0]
  if (!item) throw new ToolFailure('not_found', 'There is no window to explain.')
  const settings = await getSettings(ctx.deps.db, ctx.auth.org.id)
  const { catalog } = await ctx.deps.catalogs.effective(ctx.auth.org.id, { onlyEnabled: false, kerf: settings.cut.kerf })
  const evaluation = evaluateQuote({ items: quote.items, extras: quote.extras, discountPct: quote.discountPct ?? 0, pricing: quote.pricing }, catalog as Catalog, settings.pricing, { cut: settings.cut })
  const priced = evaluation.items.find((i) => i.id === item.id)
  if (!priced) throw new ToolFailure('not_found', 'The engine could not price this window.')
  const price = priced.price
  const showCosts = canSeeMargins(ctx.viewer)
  const lines = explainPrice(price)
    .filter((l) => showCosts || l.kind === 'total')
    .map((l) => ({ label: l.label, amount: l.amount, kind: l.kind }))
  return {
    ok: true,
    summary: ctx.text.t('done.explain_price', { ref: item.ref }),
    data: {
      ref: item.ref,
      qty: price.qty,
      unitNet: price.unitNet,
      totalNet: price.totalNet,
      currency: ctx.text.fmt.currency,
      // Todo calculado aquí: el modelo solo cita cifras, nunca las deriva.
      ...(showCosts
        ? { unitCost: price.cost, totalCost: price.cost * price.qty, unitProfit: price.unitNet - price.cost, totalProfit: price.totalNet - price.cost * price.qty, marginPct: price.marginPct }
        : { note: 'Cost breakdown hidden for this user role.' }),
      ...pendingNote(item, price, catalog as Catalog),
      breakdown: lines,
      warnings: price.warnings.slice(0, 8).map((w) => warningMessage(w, ctx.text.locale)),
      quoteTotals: totalsForModel(ctx, evaluation.totals),
    },
  }
}

export const ITEM_HANDLERS = {
  add_window: addWindow,
  add_assembly: addAssembly,
  join_windows: joinWindows,
  estimate_window: estimateWindow,
  update_window: updateWindow,
  duplicate_window: duplicateWindow,
  remove_window: removeWindow,
  explain_price: explain,
} satisfies { [K in keyof AgentToolArgs]?: ToolHandler<K> }
