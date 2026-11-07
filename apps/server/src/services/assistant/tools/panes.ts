/**
 * Mirar y cambiar el interior de una ventana: paños, repartos y cortes. El ancho de `update_window`
 * es siempre el exterior; aquí se mueve lo de adentro («el batiente a 500», «solo las hojas»).
 */
import { computeBom, invertAssembly, isAssembly, listPanes, mapUnitDesigns, mirrorAssembly, resizePanes, setAssemblyAngle, type Catalog, type PaneInfo, type PaneProblem, type WindowDesign } from '@dekopen/engine'
import { cutPartOf, type CutPartKind } from '@dekopen/documents'
import type { AgentToolArgs, Quote, QuoteItem, WorkOrder } from '@dekopen/shared'
import { resolveItems } from '../resolve'
import { designEnv, ensureOk, loadQuote, quoteNo, quotePendingForModel, quoteUndo, refsLabel, resolveQuoteId, saveQuote, totalsForModel } from './common'
import { previewTotals } from './quotes'
import { ToolFailure, type ToolContext, type ToolHandler } from './types'

/** Paños de cada unidad (en un conjunto cada ventana tiene los suyos). */
function panesByUnit(design: WindowDesign): { unit: number; panes: PaneInfo[] }[] {
  const out: { unit: number; panes: PaneInfo[] }[] = []
  mapUnitDesigns(design, (unit) => {
    out.push({ unit: out.length + 1, panes: listPanes(unit) })
    return unit
  })
  return out
}

const inspectWindow: ToolHandler<'inspect_window'> = async (ctx, args) => {
  const quote = await loadQuote(ctx, (await resolveQuoteId(ctx, args))!)
  const { items, missing } = resolveItems(quote, args, { lastItemId: ctx.memo.lastItemId, selectedId: ctx.ui.selectedItemId })
  if (!items.length) throw new ToolFailure('not_found', `Window ${missing.join(', ')} not found in this quote.`.trim())
  const windows = items.slice(0, 60).map((item) => ({
    ref: item.ref,
    width: item.design.width,
    height: item.design.height,
    ...(isAssembly(item.design) ? { assembly: true } : {}),
    units: panesByUnit(item.design).map(({ unit, panes }) => ({ unit, panes: panes.map(({ nodeId: _id, ...pane }) => pane) })),
  }))
  return { ok: true, summary: ctx.text.t('done.inspect_window', { refs: refsLabel(ctx, items, quote.items.length) }), data: { windows } }
}

function matcher(args: AgentToolArgs['set_pane_sizes']): (pane: PaneInfo) => boolean {
  if (args.pane !== undefined) return (pane) => pane.pane === args.pane
  if (args.opening) return (pane) => pane.opening === args.opening
  return (pane) => pane.opening !== 'fixed'
}

interface PaneChange {
  item: QuoteItem
  next: QuoteItem
  lines: string[]
}

function computeResizes(ctx: ToolContext, quote: Quote, args: AgentToolArgs['set_pane_sizes']) {
  const { items, missing } = resolveItems(quote, args, { lastItemId: ctx.memo.lastItemId, selectedId: ctx.ui.selectedItemId })
  if (!items.length) throw new ToolFailure('not_found', `Window ${missing.join(', ')} not found in this quote.`.trim())
  const match = matcher(args)
  const changes: PaneChange[] = []
  const skipped: { ref: string; why: string }[] = []
  for (const item of items) {
    let touched = false
    let problem: PaneProblem | undefined
    const design = mapUnitDesigns(item.design, (unit) => {
      const panes = listPanes(unit).filter(match)
      if (!panes.length) return unit
      touched = true
      const result = resizePanes(unit, { panes, ...(args.width !== undefined ? { width: args.width } : {}), ...(args.height !== undefined ? { height: args.height } : {}) })
      problem ??= result.problem
      return result.design
    })
    if (!touched) skipped.push({ ref: item.ref, why: 'it has no matching pane' })
    else if (problem === 'whole_window') skipped.push({ ref: item.ref, why: 'that pane is the whole window, so there is nothing to divide: its size is the outer size' })
    else if (problem === 'no_room') skipped.push({ ref: item.ref, why: 'the other panes would be too small' })
    else if (design !== item.design) {
      const after = panesByUnit(design).flatMap((u) => u.panes.map((p) => ctx.text.fmt.size(p.width, p.height)))
      changes.push({ item, next: { ...item, design }, lines: [`${item.ref}: ${after.join(' · ')}`] })
    }
  }
  return { changes, skipped, missing }
}

const setPaneSizes: ToolHandler<'set_pane_sizes'> = async (ctx, args) => {
  if (args.width === undefined && args.height === undefined) throw new ToolFailure('invalid_args', 'Give width or height for the pane.')
  const quote = await loadQuote(ctx, (await resolveQuoteId(ctx, args))!)
  const { changes, skipped, missing } = computeResizes(ctx, quote, args)
  const notes = [...skipped.map((s) => `${s.ref} was not changed: ${s.why}.`), ...(missing.length ? [`Not found: ${missing.join(', ')}.`] : [])]
  if (!changes.length) {
    return { ok: false, summary: ctx.text.t('reply.failed', { reason: ctx.text.t('change.nothing') }), error: { code: 'nothing_to_change', message: notes.join(' ') || 'Those panes already measure that.' } }
  }
  const byId = new Map(changes.map((c) => [c.item.id, c.next]))
  const items = quote.items.map((i) => byId.get(i.id) ?? i)
  const refs = refsLabel(ctx, changes.map((c) => c.item), quote.items.length)
  const lines = changes.slice(0, 12).flatMap((c) => c.lines)
  if (ctx.dryRun) {
    const title = ctx.text.t('propose.set_pane_sizes', { refs, number: quoteNo(ctx, quote) })
    const after = await previewTotals(ctx, { items, extras: quote.extras, discountPct: quote.discountPct ?? 0, ...(quote.pricing ? { pricing: quote.pricing } : {}) })
    return {
      ok: true,
      summary: title,
      preview: { title, lines, ...(after ? { totals: { before: quote.totals?.net, after: after.net, currency: ctx.text.fmt.currency } } : {}) },
      affected: [{ type: 'quote', id: quote.id, version: quote.version }],
    }
  }
  const { before, after } = await saveQuote(ctx, quote, { items }, (fresh) => {
    const again = computeResizes(ctx, fresh, args).changes
    if (!again.length) return null
    const map = new Map(again.map((c) => [c.item.id, c.next]))
    return { items: fresh.items.map((i) => map.get(i.id) ?? i) }
  })
  ctx.memo.quoteId = after.id
  ctx.memo.lastItemId = changes[changes.length - 1]!.item.id
  return {
    ok: true,
    summary: ctx.text.t('done.set_pane_sizes', { refs }),
    data: { changed: changes.map((c) => c.item.ref), panes: lines, notes, totals: totalsForModel(ctx, after.totals), pending: await quotePendingForModel(ctx, after) },
    affected: [{ type: 'quote', id: after.id, version: after.version }],
    ...(changes.length === 1 ? { ui: [{ kind: 'select_item' as const, quoteId: after.id, itemId: changes[0]!.item.id }] } : {}),
    undo: quoteUndo(before, after),
  }
}

// ── Cortes ───────────────────────────────────────────────────────────────────

/** Cotización de la pantalla, de los argumentos o la de una OT. */
async function cutsQuote(ctx: ToolContext, args: { quoteId?: string; number?: number; workOrderId?: string }): Promise<{ quote: Quote; workOrderId?: string }> {
  const workOrderId = args.workOrderId ?? ctx.ui.workOrderId
  if (workOrderId && !args.quoteId && !args.number) {
    const order = ensureOk(await ctx.call<WorkOrder>('workOrderGet', { params: { id: workOrderId } }))
    return { quote: await loadQuote(ctx, order.quoteId), workOrderId }
  }
  return { quote: await loadQuote(ctx, (await resolveQuoteId(ctx, args))!) }
}

const getCuts: ToolHandler<'get_cuts'> = async (ctx, args) => {
  const { quote } = await cutsQuote(ctx, args)
  const env = await designEnv(ctx)
  const { items, missing } = args.ref || args.items?.length || args.all === false ? resolveItems(quote, args, { lastItemId: ctx.memo.lastItemId, selectedId: ctx.ui.selectedItemId }) : { items: quote.items, missing: [] as string[] }
  if (!items.length) throw new ToolFailure('not_found', missing.length ? `Window ${missing.join(', ')} not found in this quote.` : 'This quote has no windows yet.')
  const wanted = args.parts?.length ? new Set<string>(args.parts) : null
  const rows: { ref: string; part: CutPartKind; code: string; name: string; label: string; length: number; qty: number; angles: string }[] = []
  for (const item of items) {
    const bom = computeBom(item.design, env.catalog as Catalog)
    for (const cut of bom.cuts) {
      const part = cutPartOf(cut)
      if (wanted && !wanted.has(part)) continue
      rows.push({ ref: item.ref, part, code: cut.code, name: cut.name, label: cut.label, length: cut.length, qty: cut.qty * item.qty, angles: `${cut.angleStart}/${cut.angleEnd}` })
    }
  }
  const totals = rows.reduce<Record<string, number>>((sum, row) => ({ ...sum, [row.part]: (sum[row.part] ?? 0) + row.qty }), {})
  return {
    ok: true,
    summary: ctx.text.t('done.get_cuts', { number: quoteNo(ctx, quote) }),
    data: { quoteId: quote.id, pieces: rows.reduce((n, r) => n + r.qty, 0), byPart: totals, cuts: rows.slice(0, 300), ...(rows.length > 300 ? { omitted: rows.length - 300 } : {}) },
  }
}

const exportCuts: ToolHandler<'export_cuts'> = async (ctx, args) => {
  const { quote, workOrderId } = await cutsQuote(ctx, args)
  return {
    ok: true,
    summary: ctx.text.t('done.export_cuts', { number: quoteNo(ctx, quote) }),
    data: { quoteId: quote.id, parts: args.parts ?? 'all' },
    ui: [{ kind: 'download_cuts', ...(workOrderId ? { workOrderId } : { quoteId: quote.id }), ...(args.parts?.length ? { parts: args.parts } : {}) }],
  }
}

const openCuts: ToolHandler<'open_cuts'> = async (ctx, args) => {
  const { quote, workOrderId } = await cutsQuote(ctx, args)
  return {
    ok: true,
    summary: ctx.text.t('done.open_cuts', { number: quoteNo(ctx, quote) }),
    data: { quoteId: quote.id },
    ui: [{ kind: 'open_cuts', ...(workOrderId ? { workOrderId } : { quoteId: quote.id }), ...(args.parts?.length ? { parts: args.parts } : {}) }],
  }
}

const editAssembly: ToolHandler<'edit_assembly'> = async (ctx, args) => {
  if (args.angle === undefined && !args.invert && !args.flip) throw new ToolFailure('invalid_args', 'Say what to change: angle, invert or flip.')
  const env = await designEnv(ctx)
  const quote = await loadQuote(ctx, (await resolveQuoteId(ctx, args))!)
  const { items, missing } = resolveItems(quote, { ref: args.ref }, { lastItemId: ctx.memo.lastItemId, selectedId: ctx.ui.selectedItemId })
  const item = items[0]
  if (!item) throw new ToolFailure('not_found', `Window ${missing.join(', ')} not found in this quote.`.trim())
  if (!isAssembly(item.design)) throw new ToolFailure('not_an_assembly', `${item.ref} is a single window, not an assembly. Use join_windows or add_assembly to make one.`)
  const catalog = env.catalog as Catalog
  const apply = (design: WindowDesign) => {
    let next = design
    if (args.angle !== undefined) next = setAssemblyAngle(next, args.angle, catalog)
    if (args.invert) next = invertAssembly(next, catalog)
    if (args.flip) next = mirrorAssembly(next, catalog)
    return next
  }
  const next: QuoteItem = { ...item, design: apply(item.design) }
  const items2 = quote.items.map((i) => (i.id === item.id ? next : i))
  const title = ctx.text.t('propose.edit_assembly', { ref: item.ref, number: quoteNo(ctx, quote) })
  if (ctx.dryRun) return { ok: true, summary: title, preview: { title, lines: [] }, affected: [{ type: 'quote', id: quote.id, version: quote.version }] }
  const { before, after } = await saveQuote(ctx, quote, { items: items2 }, (fresh) => ({ items: fresh.items.map((i) => (i.id === item.id ? { ...i, design: apply(i.design) } : i)) }))
  ctx.memo.quoteId = after.id
  ctx.memo.lastItemId = item.id
  return {
    ok: true,
    summary: ctx.text.t('done.edit_assembly', { ref: item.ref }),
    data: { totals: totalsForModel(ctx, after.totals), pending: await quotePendingForModel(ctx, after) },
    affected: [{ type: 'quote', id: after.id, version: after.version }],
    ui: [{ kind: 'select_item', quoteId: after.id, itemId: item.id }],
    undo: quoteUndo(before, after),
  }
}

const downloadQuotePdf: ToolHandler<'download_quote_pdf'> = async (ctx, args) => {
  const quote = await loadQuote(ctx, (await resolveQuoteId(ctx, args))!)
  return {
    ok: true,
    summary: ctx.text.t('done.download_quote_pdf', { number: quoteNo(ctx, quote) }),
    data: { quoteId: quote.id },
    ui: [{ kind: 'download_quote_pdf', quoteId: quote.id, number: quote.number }],
  }
}

const setFollowUp: ToolHandler<'set_follow_up'> = async (ctx, args) => {
  const quote = await loadQuote(ctx, (await resolveQuoteId(ctx, args))!)
  const title = ctx.text.t('done.set_follow_up', { number: quoteNo(ctx, quote), days: args.days })
  if (ctx.dryRun) return { ok: true, summary: title, preview: { title, lines: [] }, affected: [{ type: 'quote', id: quote.id }] }
  ensureOk(await ctx.call('quoteFollowUp', { params: { id: quote.id }, body: { days: args.days } }))
  return { ok: true, summary: title, affected: [{ type: 'quote', id: quote.id }] }
}

export const PANE_HANDLERS = {
  inspect_window: inspectWindow,
  set_pane_sizes: setPaneSizes,
  get_cuts: getCuts,
  export_cuts: exportCuts,
  open_cuts: openCuts,
  edit_assembly: editAssembly,
  download_quote_pdf: downloadQuotePdf,
  set_follow_up: setFollowUp,
} satisfies { [K in keyof AgentToolArgs]?: ToolHandler<K> }
