/**
 * Ejecutor de herramientas de Marco en el navegador. Opera sobre el estado real a través del puente
 * del editor (lo mismo que hace la interfaz: se ve el cambio y se puede deshacer) y de la API.
 * Cada herramienta devuelve un resultado para el modelo, un recibo con «Deshacer» y, en modo local,
 * una frase lista para mostrar. Nunca lanza: los problemas vuelven como resultados con ok:false.
 */
import {
  collectLeaves,
  createDesign,
  describeDesign,
  designName,
  evaluateQuote,
  explainPrice,
  formatCLP,
  formatSize,
  getTypology,
  matchTypology,
  resolvePricing,
  setColor,
  setGlass,
  setLine,
  setOpening,
  setSize,
  type Catalog,
  type CutSettings,
  type Id,
  type LeafNode,
  type OpeningKind,
  type PricingSettings,
  type QuoteTotals,
  type TypologyId,
  type WindowDesign,
} from '@framezen/engine'
import {
  APPROVAL_TOOLS,
  NAV_LABELS,
  NAV_ROUTES,
  coerceToolArgs,
  formatMillimeters,
  isAssistantTool,
  type AddWindowArgs,
  type AssistantToolArgs,
  type AssistantToolCall,
  type AssistantToolName,
  type Client,
  type Defaults,
  type Quote,
  type QuoteItem,
  type QuoteSaveBody,
  type QuoteSummary,
  type UpdateWindowArgs,
} from '@framezen/shared'
import { defaultGlassId } from '../designer/lib/catalog'
import { itemWarnings } from '../quotes/model/evaluate'
import type { QuoteEditorBridge } from './bridge'
import { refsLabel, resolveColor, resolveGlass, resolveItems, resolveLine, resolveTypology, typologyKind } from './resolve'
import type { ApprovalRequest, AssistantCard, PriceCard } from './types'

export interface ExecutorApi {
  createQuote(body: Partial<QuoteSaveBody>): Promise<Quote>
  getQuote(id: string): Promise<Quote>
  removeQuote(id: string): Promise<void>
  listQuotes(q: string): Promise<QuoteSummary[]>
  listClients(q: string): Promise<Client[]>
  createClient(input: { name: string; email?: string; phone?: string; rut?: string }): Promise<Client>
  sendQuote(id: string, body: { channel: 'link' | 'email' | 'whatsapp'; to?: string; message?: string }): Promise<{ url?: string; revisionLabel?: string }>
}

export interface ExecutorEnv {
  getEditor(): QuoteEditorBridge | null
  /** Espera a que el editor de esa cotización se registre (rechaza al vencer el plazo). */
  waitForEditor(quoteId: string, timeoutMs: number): Promise<QuoteEditorBridge>
  navigate(path: string): void
  currentPath(): string
  defaults(): Promise<Defaults>
  pricing(): Promise<{ pricing?: Partial<PricingSettings>; cut?: Partial<CutSettings> }>
  /** Dueño, o plan sin roles: ve costos y márgenes. */
  canSeeCosts(): boolean
  api: ExecutorApi
  /** Muestra la tarjeta de aprobación y espera la respuesta. */
  approve(request: ApprovalRequest): Promise<boolean>
  copyText?(text: string): Promise<void>
  openUrl?(url: string): void
  /** Espera entre sondeos (las pruebas la aceleran). */
  sleep?(ms: number): Promise<void>
}

export interface Receipt {
  id: string
  text: string
  /** Deshace la acción; devuelve false si ya no se puede (otra cotización abierta). */
  undo?: () => boolean
}

export interface ToolOutcome {
  callId: string
  name: string
  ok: boolean
  /** Resultado JSON para el modelo. */
  result: Record<string, unknown>
  receipts: Receipt[]
  /** Frase para el modo local (el modo IA la redacta el modelo). */
  say?: string
  card?: AssistantCard
  notes: string[]
  /** Etiqueta en gerundio para la lista de pasos. */
  step: string
}

export const STEP_LABELS: Record<AssistantToolName, string> = {
  create_quote: 'Creando la cotización…',
  open_quote: 'Abriendo la cotización…',
  add_window: 'Agregando la ventana…',
  update_window: 'Cambiando la ventana…',
  duplicate_window: 'Duplicando…',
  remove_window: 'Quitando…',
  set_discount: 'Aplicando el descuento…',
  set_title: 'Cambiando el título…',
  set_client: 'Buscando al cliente…',
  explain_price: 'Revisando el precio…',
  show_document: 'Abriendo el documento…',
  send_quote: 'Preparando el envío…',
  navigate: 'Cambiando de pantalla…',
  search: 'Buscando…',
}

class ToolError extends Error {}

let receiptCounter = 0
const receiptId = () => `r${Date.now().toString(36)}${(++receiptCounter).toString(36)}`

const OPENING_WORDS: Record<OpeningKind, string> = {
  fixed: 'fijo',
  casement: 'abatible',
  tilt_turn: 'oscilobatiente',
  tilt: 'oscilante',
  awning: 'proyectante',
  door: 'puerta',
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T
const mm = (n: number) => `${formatMillimeters(n)} mm`

function sameContent(a: Quote, b: Quote): boolean {
  const pick = (q: Quote) =>
    JSON.stringify({
      t: q.title ?? '',
      c: q.clientId ?? null,
      d: q.discountPct ?? 0,
      i: q.items.map((i) => [i.id, i.qty, i.ref, i.location ?? null, i.design]),
    })
  return pick(a) === pick(b)
}

export function createExecutor(env: ExecutorEnv) {
  const sleep = env.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  /** Último ítem tocado en esta orden (para «otra igual», «ancho 1800» después de agregar). */
  let lastTouchedId: Id | null = null
  let createdInBatch: Quote | null = null

  const editorFor = (quoteId: string) => {
    const bridge = env.getEditor()
    return bridge && bridge.quoteId === quoteId ? bridge : null
  }

  async function ensureEditor(create: boolean, receipts: Receipt[]): Promise<QuoteEditorBridge> {
    const current = env.getEditor()
    if (current) return current
    const match = /^\/cotizaciones\/([^/?#]+)/.exec(env.currentPath())
    if (match) {
      try {
        return await env.waitForEditor(decodeURIComponent(match[1]), 8000)
      } catch {
        throw new ToolError('La cotización todavía se está abriendo. Inténtalo de nuevo en un momento.')
      }
    }
    if (!create) throw new ToolError('Primero abre una cotización, o dime «nueva cotización» y la creo.')
    const quote = await env.api.createQuote({})
    createdInBatch = quote
    receipts.push(createdReceipt(quote))
    env.navigate(`/cotizaciones/${quote.id}`)
    try {
      return await env.waitForEditor(quote.id, 12000)
    } catch {
      throw new ToolError(`Creé la cotización N° ${quote.number}, pero el editor no alcanzó a abrirse. Ábrela y vuelve a pedírmelo.`)
    }
  }

  function createdReceipt(quote: Quote, extra = ''): Receipt {
    return {
      id: receiptId(),
      text: `Creé la cotización N° ${quote.number}${extra}`,
      undo: () => {
        void env.api.removeQuote(quote.id).catch(() => {})
        if (env.currentPath().startsWith(`/cotizaciones/${quote.id}`)) env.navigate('/cotizaciones')
        return true
      },
    }
  }

  async function totalsOf(bridge: QuoteEditorBridge): Promise<QuoteTotals | null> {
    try {
      const { pricing, cut } = await env.pricing()
      const quote = bridge.getQuote()
      return evaluateQuote(quote, bridge.getCatalog(), resolvePricing(pricing, quote.pricing), { cut }).totals
    } catch {
      return null
    }
  }

  function totalsForModel(totals: QuoteTotals | null) {
    return totals ? { net: totals.net, iva: totals.iva, total: totals.total, units: totals.units, discountPct: totals.discountPct } : undefined
  }

  // ── Herramientas ───────────────────────────────────────────────────────────

  async function addWindow(args: AddWindowArgs, out: ToolOutcome) {
    const bridge = await ensureEditor(true, out.receipts)
    const catalog = bridge.getCatalog()
    const defaults = await env.defaults().catch(() => ({}) as Defaults)
    let typologyId = resolveTypology(args.typology)
    const defaultLine = catalog.lines.find((l) => l.id === defaults.lineId)
    if (!typologyId) {
      typologyId = defaultLine?.kind === 'sliding' ? 'sliding_2' : 'casement'
      if (args.typology) out.notes.push(`No reconocí «${args.typology}»; la dejé como ${getTypology(typologyId)?.name.toLowerCase()}.`)
    }
    const typology = getTypology(typologyId)!
    // Si la cotización ya tiene una ventana de ese tipo, la nueva usa su misma línea.
    const existing = bridge.getQuote().items
    const quoteLine = [...existing]
      .reverse()
      .map((i) => catalog.lines.find((l) => l.id === i.design.lineId))
      .find((l) => l && l.kind === typology.kind && (l.typologyIds.length === 0 || l.typologyIds.includes(typologyId)))
    const { line, missed } = resolveLine(catalog, args.line, { kind: typology.kind, typologyId, defaultLineId: defaults.lineId, currentLineId: quoteLine?.id })
    if (!line) throw new ToolError('Tu catálogo no tiene líneas activas. Activa una marca en Catálogo y vuelvo a intentarlo.')
    if (missed) out.notes.push(`No encontré la línea «${missed}»; usé ${line.name}.`)

    const color = resolveColor(catalog, args.color, line)
    if (args.color && !color) out.notes.push(`No encontré el color «${args.color}» en tu catálogo; quedó en el color por defecto.`)
    // Si todas las ventanas de la cotización comparten color o vidrio, la nueva los sigue
    // («cambia todo a nogal» y luego «agrega una corredera» → nogal).
    const shared = (pick: (d: WindowDesign) => string | undefined) => {
      const first = existing[0] ? pick(existing[0].design) : undefined
      return first && existing.every((i) => pick(i.design) === first) ? first : undefined
    }
    const sharedColor = shared((d) => (d.colorInId ? undefined : d.colorId))
    const sharedGlass = shared((d) => d.glassId)
    const defaultColor =
      catalog.colors.find((c) => c.id === sharedColor && (line.colorIds.length === 0 || line.colorIds.includes(c.id))) ??
      catalog.colors.find((c) => c.id === defaults.colorId && (line.colorIds.length === 0 || line.colorIds.includes(c.id))) ??
      catalog.colors.find((c) => line.colorIds.includes(c.id)) ??
      catalog.colors[0]
    const colorIn = args.color_in ? resolveColor(catalog, args.color_in, line) : undefined
    const glass = resolveGlass(catalog, args.glass, defaults.glassId)
    if (args.glass && !glass) out.notes.push(`No encontré el vidrio «${args.glass}»; quedó el vidrio por defecto.`)
    // El termopanel de siempre (DVH 4+12+4 incoloro), igual que la galería del editor.
    const defaultGlass =
      catalog.glass.find((g) => g.id === sharedGlass) ?? catalog.glass.find((g) => g.id === defaultGlassId(catalog, defaults.glassId)) ?? catalog.glass[0]

    let width = args.width
    let height = args.height
    if (!width && !height) {
      width = typology.defaultSize.width
      height = typology.defaultSize.height
      out.notes.push(`Usé la medida estándar de ${formatSize(width, height)}; cámbiala cuando quieras.`)
    } else if (!height) {
      height = typology.defaultSize.height
      out.notes.push(`Faltaba el alto: usé ${mm(height)}.`)
    } else if (!width) {
      width = typology.defaultSize.width
      out.notes.push(`Faltaba el ancho: usé ${mm(width)}.`)
    }
    if ((width ?? 0) > 8000 || (height ?? 0) > 8000) out.notes.push(`Ojo: ${formatSize(width!, height!)} es grande para una sola ventana; revisa si eran centímetros.`)

    let design: WindowDesign = createDesign(typologyId, {
      lineId: line.id,
      width,
      height,
      colorId: (color ?? defaultColor)?.id ?? 'blanco',
      glassId: (glass ?? defaultGlass)?.id ?? '',
    })
    if (colorIn) design = setColor(design, design.colorId, colorIn.id)
    const qty = args.qty && args.qty > 0 ? Math.min(500, Math.round(args.qty)) : 1
    const id = bridge.addItem(design, { qty, ...(args.location ? { location: args.location } : {}), ...(args.name ? { name: args.name } : {}) })
    lastTouchedId = id
    bridge.selectItem(id)
    const item = bridge.getQuote().items.find((i) => i.id === id)
    const ref = item?.ref || 'la ventana'
    const quoteId = bridge.quoteId
    out.receipts.push({
      id: receiptId(),
      text: `Agregué ${ref} · ${designName(design)} ${formatSize(design.width, design.height)}${qty > 1 ? ` · ${qty} u` : ''}`,
      undo: () => {
        const b = editorFor(quoteId)
        if (!b || !b.getQuote().items.some((i) => i.id === id)) return false
        b.removeItem(id)
        return true
      },
    })
    out.result = {
      ok: true,
      ref,
      description: describeDesign(design, catalog),
      width: design.width,
      height: design.height,
      qty,
      ...(args.location ? { location: args.location } : {}),
      totals: totalsForModel(await totalsOf(bridge)),
    }
    out.say = 'Listo.'
  }

  function applyOpening(design: WindowDesign, args: UpdateWindowArgs, changes: string[]): WindowDesign {
    if (!args.opening && !args.hinge && !args.direction) return design
    const root = design.root
    if (root?.type === 'sliding') return design
    const leaves = collectLeaves(root)
    if (!leaves.length) return design
    let targets: LeafNode[]
    if (args.pane !== undefined && args.pane !== 0) {
      const index = args.pane > 0 ? args.pane - 1 : leaves.length + args.pane
      const leaf = leaves[Math.min(leaves.length - 1, Math.max(0, index))]
      targets = leaf ? [leaf] : []
    } else if (leaves.length === 1) targets = leaves
    else {
      const openable = leaves.filter((l) => l.opening.kind !== 'fixed')
      targets = args.opening === 'fixed' || !openable.length ? leaves : openable
    }
    let next = design
    for (const leaf of targets) {
      const kind = args.opening ?? leaf.opening.kind
      const opening = { ...leaf.opening, kind }
      if (args.hinge) opening.hinge = args.hinge
      if (args.direction) opening.direction = args.direction
      if (kind === 'fixed') {
        delete opening.hinge
        delete opening.direction
      } else if ((kind === 'casement' || kind === 'tilt_turn' || kind === 'door') && !opening.hinge) opening.hinge = 'left'
      next = setOpening(next, leaf.id, opening)
    }
    if (next !== design) {
      const where = args.pane !== undefined && leaves.length > 1 ? ` en el paño ${args.pane > 0 ? args.pane : leaves.length + args.pane + 1}` : ''
      if (args.opening) changes.push(`${OPENING_WORDS[args.opening]}${where}`)
      if (args.direction) changes.push(args.direction === 'out' ? 'abre hacia afuera' : 'abre hacia adentro')
      if (args.hinge) changes.push(`bisagras a la ${args.hinge === 'left' ? 'izquierda' : 'derecha'}`)
    }
    return next
  }

  async function updateWindow(args: UpdateWindowArgs, out: ToolOutcome) {
    const bridge = await ensureEditor(false, out.receipts)
    const catalog = bridge.getCatalog()
    const quote = bridge.getQuote()
    if (!quote.items.length) throw new ToolError('Esta cotización todavía no tiene ventanas. Dime cuál agrego, por ejemplo «una corredera de 1500 x 1200».')
    const { items, missing } = resolveItems(quote, args, { lastTouchedId, selectedId: bridge.selectedItemId() })
    if (!items.length) throw new ToolError(`No encontré ${missing.join(', ') || 'esa ventana'} en esta cotización.`)
    if (missing.length) out.notes.push(`No encontré ${missing.join(', ')}; cambié el resto.`)
    const defaults = await env.defaults().catch(() => ({}) as Defaults)

    // Lo que se puede resolver una vez (igual para todas).
    const newTypology: TypologyId | undefined = resolveTypology(args.typology)
    const glass = args.glass ? resolveGlass(catalog, args.glass, defaults.glassId) : undefined
    if (args.glass && !glass) out.notes.push(`No encontré el vidrio «${args.glass}» en tu catálogo.`)

    const snapshots = items.map((i) => clone(i))
    const changes = new Set<string>()
    const notes = new Set<string>()
    let changed = 0

    for (const item of items) {
      const before = item.design
      const itemChanges: string[] = []
      let design = before
      // Tipología (o apertura sobre una corredera: la convierte).
      const typologyTarget = newTypology ?? (args.opening && before.root?.type === 'sliding' && args.pane === undefined ? (args.opening as TypologyId) : undefined)
      if (typologyTarget && typologyTarget !== matchTypology(before)) {
        const kind = typologyKind(typologyTarget)
        const current = catalog.lines.find((l) => l.id === before.lineId)
        const { line } = resolveLine(catalog, undefined, { kind, typologyId: typologyTarget, currentLineId: current?.kind === kind ? current.id : undefined, defaultLineId: current?.id ?? defaults.lineId })
        let rebuilt = createDesign(typologyTarget, { lineId: line?.id ?? before.lineId, width: before.width, height: before.height, colorId: before.colorId, glassId: before.glassId })
        if (before.colorInId) rebuilt = setColor(rebuilt, before.colorId, before.colorInId)
        design = rebuilt
        itemChanges.push(`ahora ${getTypology(typologyTarget)?.name.toLowerCase()}`)
      }
      if (args.width || args.height) {
        const next = setSize(design, { ...(args.width ? { width: args.width } : {}), ...(args.height ? { height: args.height } : {}) })
        if (next !== design) {
          if (args.width && args.height) itemChanges.push(formatSize(args.width, args.height))
          else if (args.width) itemChanges.push(`ancho ${mm(args.width)}`)
          else if (args.height) itemChanges.push(`alto ${mm(args.height)}`)
        }
        design = next
      }
      if (args.line) {
        const kind = design.root?.type === 'sliding' ? 'sliding' : 'casement'
        const strict = resolveLine(catalog, args.line, { kind })
        const choice = strict.missed ? resolveLine(catalog, args.line) : strict
        if (choice.line && !choice.missed) {
          if (choice.line.id !== design.lineId) {
            design = setLine(design, choice.line.id, catalog)
            itemChanges.push(`línea ${choice.line.name}`)
          }
        } else notes.add(`No encontré la línea «${args.line}».`)
      }
      if (args.color || args.color_in) {
        const lineNow = catalog.lines.find((l) => l.id === design.lineId)
        const color = args.color ? resolveColor(catalog, args.color, lineNow) : undefined
        const colorIn = args.color_in ? resolveColor(catalog, args.color_in, lineNow) : undefined
        if (args.color && !color) notes.add(`No encontré el color «${args.color}» en tu catálogo.`)
        if (args.color_in && !colorIn) notes.add(`No encontré el color «${args.color_in}» en tu catálogo.`)
        if (color || colorIn) {
          const ext = color?.id ?? design.colorId
          const int = colorIn?.id ?? (color ? undefined : design.colorInId)
          const next = setColor(design, ext, int)
          if (next.colorId !== design.colorId || next.colorInId !== design.colorInId) {
            itemChanges.push(colorIn && color ? `${color.name} por fuera y ${colorIn.name} por dentro` : colorIn ? `${colorIn.name} por dentro` : (color?.name ?? ''))
          }
          design = next
          if (color && lineNow && lineNow.colorIds.length && !lineNow.colorIds.includes(color.id)) notes.add(`${lineNow.name} no trae ${color.name} en tu catálogo; lo dejé igual y el motor te avisará el precio.`)
        }
      }
      if (glass) {
        const next = setGlass(design, null, glass.id)
        if (next.glassId !== before.glassId || JSON.stringify(next.root) !== JSON.stringify(design.root)) itemChanges.push(glass.name)
        design = next
      }
      if (!typologyTarget || newTypology) {
        if (design.root?.type === 'sliding' && (args.hinge || args.direction || args.pane !== undefined)) notes.add('Las correderas no llevan bisagras ni paños que abran; no cambié la apertura.')
        else design = applyOpening(design, args, itemChanges)
      }

      const patch: Partial<Omit<QuoteItem, 'id' | 'design'>> = {}
      if (args.qty && args.qty !== item.qty) {
        patch.qty = Math.min(500, Math.max(1, Math.round(args.qty)))
        itemChanges.push(`${patch.qty} u`)
      }
      if (args.location && args.location !== item.location) {
        patch.location = args.location
        itemChanges.push(`ambiente ${args.location}`)
      }
      if (args.name && args.name !== item.name) {
        patch.name = args.name
        itemChanges.push(`nombre «${args.name}»`)
      }

      if (design !== before) {
        const finalDesign = design
        bridge.updateDesign(item.id, () => finalDesign)
      }
      if (Object.keys(patch).length) bridge.updateItem(item.id, patch)
      if (design !== before || Object.keys(patch).length) {
        changed++
        for (const c of itemChanges) changes.add(c)
      }
    }
    out.notes.push(...notes)
    if (!changed) {
      out.ok = false
      out.result = { ok: false, error: out.notes.join(' ') || 'No había nada que cambiar.' }
      out.say = out.notes.length ? 'No cambié nada.' : 'Ya estaba así; no había nada que cambiar.'
      return
    }
    lastTouchedId = items[items.length - 1].id
    if (items.length === 1) bridge.selectItem(items[0].id)
    const quoteId = bridge.quoteId
    const label = refsLabel(items, quote.items.length)
    out.receipts.push({
      id: receiptId(),
      text: `Cambié ${label}: ${[...changes].filter(Boolean).join(', ')}`,
      undo: () => {
        const b = editorFor(quoteId)
        if (!b) return false
        for (const snap of snapshots) {
          if (!b.getQuote().items.some((i) => i.id === snap.id)) continue
          b.updateDesign(snap.id, () => snap.design)
          b.updateItem(snap.id, { qty: snap.qty, location: snap.location, name: snap.name, ref: snap.ref })
        }
        return true
      },
    })
    out.result = { ok: true, changed: items.map((i) => i.ref), changes: [...changes], totals: totalsForModel(await totalsOf(bridge)) }
    out.say = 'Listo.'
  }

  async function duplicateWindow(args: AssistantToolArgs['duplicate_window'], out: ToolOutcome) {
    const bridge = await ensureEditor(false, out.receipts)
    const quote = bridge.getQuote()
    const { items, missing } = resolveItems(quote, { ref: args.ref }, { lastTouchedId, selectedId: bridge.selectedItemId() })
    const source = items[0]
    if (!source) throw new ToolError(missing.length ? `No encontré ${missing[0]} en esta cotización.` : 'No hay ventanas para duplicar todavía.')
    const copies = Math.min(20, Math.max(1, args.copies ?? 1))
    const created: Id[] = []
    for (let i = 0; i < copies; i++) created.push(bridge.duplicateItem(source.id))
    lastTouchedId = created[created.length - 1]
    bridge.selectItem(lastTouchedId)
    const refs = created.map((id) => bridge.getQuote().items.find((i) => i.id === id)?.ref ?? '').filter(Boolean)
    const quoteId = bridge.quoteId
    out.receipts.push({
      id: receiptId(),
      text: `Dupliqué ${source.ref} como ${refs.length > 1 ? `${refs.slice(0, -1).join(', ')} y ${refs[refs.length - 1]}` : refs[0] || 'una copia'}`,
      undo: () => {
        const b = editorFor(quoteId)
        if (!b) return false
        for (const id of created) if (b.getQuote().items.some((i) => i.id === id)) b.removeItem(id)
        return true
      },
    })
    out.result = { ok: true, source: source.ref, copies: refs, totals: totalsForModel(await totalsOf(bridge)) }
    out.say = 'Listo.'
  }

  async function removeWindow(args: AssistantToolArgs['remove_window'], out: ToolOutcome) {
    const bridge = await ensureEditor(false, out.receipts)
    const quote = bridge.getQuote()
    const { items, missing } = resolveItems(quote, args, { lastTouchedId, selectedId: bridge.selectedItemId() })
    if (!items.length) throw new ToolError(missing.length ? `No encontré ${missing.join(', ')} en esta cotización.` : 'No hay ventanas para quitar.')
    const snapshots = items.map((i) => clone(i))
    const label = refsLabel(items, quote.items.length)
    for (const item of items) bridge.removeItem(item.id)
    lastTouchedId = null
    const quoteId = bridge.quoteId
    out.receipts.push({
      id: receiptId(),
      text: `Quité ${label}`,
      undo: () => {
        const b = editorFor(quoteId)
        if (!b) return false
        for (const snap of snapshots) {
          const id = b.addItem(snap.design, { qty: snap.qty, ref: snap.ref, ...(snap.location ? { location: snap.location } : {}), ...(snap.name ? { name: snap.name } : {}) })
          const extra: Partial<Omit<QuoteItem, 'id' | 'design'>> = {}
          if (snap.notes) extra.notes = snap.notes
          if (snap.manualUnitPrice !== undefined) extra.manualUnitPrice = snap.manualUnitPrice
          if (Object.keys(extra).length) b.updateItem(id, extra)
        }
        return true
      },
    })
    out.result = { ok: true, removed: items.map((i) => i.ref), totals: totalsForModel(await totalsOf(bridge)) }
    out.say = 'Listo, se puede deshacer.'
  }

  async function setDiscount(args: AssistantToolArgs['set_discount'], out: ToolOutcome) {
    const bridge = await ensureEditor(false, out.receipts)
    const previous = bridge.getQuote().discountPct ?? 0
    const pct = Math.round(Math.min(100, Math.max(0, args.percent)) * 100) / 100
    bridge.setDiscount(pct)
    const quoteId = bridge.quoteId
    const pctText = `${String(pct).replace('.', ',')} %`
    out.receipts.push({
      id: receiptId(),
      text: pct === 0 ? 'Quité el descuento' : `Apliqué ${pctText} de descuento`,
      undo: () => {
        const b = editorFor(quoteId)
        if (!b) return false
        b.setDiscount(previous)
        return true
      },
    })
    if (pct > 30) out.notes.push(`Un ${pctText} es un descuento alto; revisa que el margen te siga sirviendo.`)
    const totals = await totalsOf(bridge)
    out.result = { ok: true, percent: pct, previous, totals: totalsForModel(totals) }
    out.say = totals ? `Listo. El total queda en ${formatCLP(totals.net)} + IVA.` : 'Listo.'
  }

  async function setTitle(args: AssistantToolArgs['set_title'], out: ToolOutcome) {
    const bridge = await ensureEditor(false, out.receipts)
    const title = args.title.trim().slice(0, 200)
    if (!title) throw new ToolError('¿Qué nombre le pongo a la obra?')
    const previous = bridge.getQuote().title ?? ''
    bridge.setTitle(title)
    const quoteId = bridge.quoteId
    out.receipts.push({
      id: receiptId(),
      text: `Título: ${title}`,
      undo: () => {
        const b = editorFor(quoteId)
        if (!b) return false
        b.setTitle(previous)
        return true
      },
    })
    out.result = { ok: true, title }
    out.say = 'Listo.'
  }

  async function findOrCreateClient(args: { name: string; email?: string; phone?: string; rut?: string }): Promise<{ client: Client; created: boolean; alternatives: number }> {
    const list = await env.api.listClients(args.name)
    const wanted = args.name.trim().toLowerCase()
    const exact = list.find((c) => c.name.trim().toLowerCase() === wanted)
    if (exact) return { client: exact, created: false, alternatives: 0 }
    if (list.length === 1) return { client: list[0], created: false, alternatives: 0 }
    const client = await env.api.createClient({ name: args.name.trim(), ...(args.email ? { email: args.email } : {}), ...(args.phone ? { phone: args.phone } : {}), ...(args.rut ? { rut: args.rut } : {}) })
    return { client, created: true, alternatives: list.length }
  }

  async function setClient(args: AssistantToolArgs['set_client'], out: ToolOutcome) {
    const bridge = await ensureEditor(false, out.receipts)
    const previous = bridge.getQuote().clientId ?? null
    const quoteId = bridge.quoteId
    const undo = () => {
      const b = editorFor(quoteId)
      if (!b) return false
      b.setClient(previous)
      return true
    }
    if (args.clear || !args.name) {
      if (!args.clear) throw new ToolError('¿A nombre de quién dejo la cotización?')
      bridge.setClient(null)
      out.receipts.push({ id: receiptId(), text: 'Quité el cliente', undo })
      out.result = { ok: true, client: null }
      out.say = 'Listo.'
      return
    }
    const { client, created, alternatives } = await findOrCreateClient({ name: args.name, email: args.email, phone: args.phone, rut: args.rut })
    bridge.setClient(client.id)
    if (alternatives > 1) out.notes.push(`Había ${alternatives} clientes parecidos; creé uno nuevo con ese nombre exacto.`)
    out.receipts.push({ id: receiptId(), text: `Cliente: ${client.name}${created ? ' (nuevo)' : ''}`, undo })
    out.result = { ok: true, client: { id: client.id, name: client.name, email: client.email ?? null }, created }
    out.say = 'Listo.'
  }

  async function explainItemPrice(args: AssistantToolArgs['explain_price'], out: ToolOutcome) {
    const bridge = await ensureEditor(false, out.receipts)
    const quote = bridge.getQuote()
    const { items, missing } = resolveItems(quote, { ref: args.ref }, { lastTouchedId, selectedId: bridge.selectedItemId() })
    const item = items[0]
    if (!item) throw new ToolError(missing.length ? `No encontré ${missing[0]} en esta cotización.` : 'Todavía no hay ventanas para explicar.')
    const catalog = bridge.getCatalog()
    const { pricing, cut } = await env.pricing()
    const evaluation = evaluateQuote(quote, catalog, resolvePricing(pricing, quote.pricing), { cut })
    const priced = evaluation.items.find((i) => i.id === item.id)
    if (!priced) throw new ToolError('No pude calcular el precio de esa ventana.')
    const price = priced.price
    const showCosts = env.canSeeCosts()
    const lines = showCosts ? explainPrice(price) : []
    // Avisos del despiece (p. ej. perfil sin asignar) y del precio, sin repetir: igual que el inspector.
    const warnings = itemWarnings(priced.bom, price.warnings).filter((w) => w.level !== 'info').map((w) => w.message).slice(0, 4)
    const card: PriceCard = {
      kind: 'price',
      ref: item.ref,
      title: designName(item.design),
      size: formatSize(item.design.width, item.design.height),
      qty: item.qty,
      unitNet: price.unitNet,
      totalNet: price.totalNet,
      lines,
      warnings,
    }
    bridge.selectItem(item.id)
    out.card = card
    out.result = {
      ok: true,
      ref: item.ref,
      description: describeDesign(item.design, catalog),
      qty: item.qty,
      unitNet: price.unitNet,
      totalNet: price.totalNet,
      ...(showCosts ? { breakdown: lines.map((l) => ({ label: l.label, amount: l.amount })), marginPct: price.marginPct } : { note: 'Esta persona no ve costos ni márgenes.' }),
      warnings,
      currency: 'CLP neto, sin IVA',
    }
    out.say = `${item.ref} cuesta ${formatCLP(price.unitNet)} + IVA por unidad${item.qty > 1 ? ` (${formatCLP(price.totalNet)} por ${item.qty})` : ''}.${showCosts ? ' Así se arma:' : ''}`
  }

  async function showDocument(args: AssistantToolArgs['show_document'], out: ToolOutcome) {
    const bridge = await ensureEditor(false, out.receipts)
    if (args.view === 'design') {
      bridge.showDesign()
      out.say = 'Volví al diseño.'
    } else {
      bridge.showDocument()
      out.say = 'Te dejé la vista del documento.'
    }
    out.result = { ok: true, view: args.view ?? 'document' }
  }

  async function waitForSaved(bridge: QuoteEditorBridge): Promise<boolean> {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const saved = await env.api.getQuote(bridge.quoteId)
        if (sameContent(saved, bridge.getQuote())) return true
      } catch {
        // sin conexión: reintenta
      }
      await sleep(600)
    }
    return false
  }

  async function sendQuote(args: AssistantToolArgs['send_quote'], out: ToolOutcome) {
    const bridge = await ensureEditor(false, out.receipts)
    const quote = bridge.getQuote()
    if (!quote.items.length) throw new ToolError('La cotización no tiene ventanas todavía; agrégale al menos una antes de enviarla.')
    const client = quote.client
    const to = args.to ?? client?.email
    const channel = args.channel ?? (to ? 'email' : 'link')
    if (channel === 'email' && !to) throw new ToolError('¿A qué correo la envío? La cotización no tiene un cliente con correo.')
    const totals = await totalsOf(bridge)
    const who = client?.name ?? (to ? to : 'tu cliente')
    const how = channel === 'email' ? `Por correo a ${to}` : channel === 'whatsapp' ? `Por WhatsApp${client?.phone ? ` al ${client.phone}` : ''}` : 'Como enlace (lo copio para que lo pegues donde quieras)'
    const units = totals?.units ?? quote.items.reduce((s, i) => s + i.qty, 0)
    const approved = await env.approve({
      title: `¿Envío la cotización N° ${quote.number} a ${who}?`,
      lines: [how, `${units} ${units === 1 ? 'unidad' : 'unidades'}${totals ? ` · ${formatCLP(totals.net)} + IVA (${formatCLP(totals.total)} con IVA)` : ''}`],
      confirmLabel: channel === 'link' ? 'Sí, crear enlace' : 'Sí, enviar',
    })
    if (!approved) {
      out.ok = false
      out.result = { ok: false, declined: true, error: 'La persona prefirió no enviarla.' }
      out.say = 'Listo, no la envié.'
      return
    }
    const saved = await waitForSaved(bridge)
    if (!saved) throw new ToolError('Todavía estoy guardando tus últimos cambios. Vuelve a pedírmelo en unos segundos para no enviar una versión vieja.')
    const res = await env.api.sendQuote(quote.id, { channel, ...(to && channel === 'email' ? { to } : {}), ...(args.message ? { message: args.message } : {}) })
    const url = res.url ?? ''
    if (channel === 'whatsapp' && url) {
      const phone = (client?.phone ?? '').replace(/[^\d]/g, '')
      const text = `${args.message ? `${args.message}\n` : ''}Hola${client?.name ? ` ${client.name.split(' ')[0]}` : ''}, te comparto la cotización N° ${quote.number}: ${url}`
      env.openUrl?.(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`)
    }
    if (channel === 'link' && url) await env.copyText?.(url).catch(() => {})
    const label = res.revisionLabel ? ` (versión ${res.revisionLabel})` : ''
    out.receipts.push({
      id: receiptId(),
      text: channel === 'email' ? `Envié la cotización N° ${quote.number}${label} a ${to}` : channel === 'whatsapp' ? `Abrí WhatsApp con el enlace de la N° ${quote.number}${label}` : `Copié el enlace de la N° ${quote.number}${label}`,
    })
    out.result = { ok: true, channel, url, revision: res.revisionLabel }
    out.say = channel === 'link' ? `Listo, copié el enlace: ${url}` : 'Listo, enviada.'
  }

  async function createQuote(args: AssistantToolArgs['create_quote'], out: ToolOutcome) {
    let clientId: string | undefined
    let clientName = ''
    if (args.client) {
      const { client } = await findOrCreateClient({ name: args.client })
      clientId = client.id
      clientName = client.name
    }
    const quote = await env.api.createQuote({ ...(args.title ? { title: args.title } : {}), ...(clientId ? { clientId } : {}) })
    createdInBatch = quote
    out.receipts.push(createdReceipt(quote, clientName ? ` · ${clientName}` : ''))
    env.navigate(`/cotizaciones/${quote.id}`)
    lastTouchedId = null
    try {
      await env.waitForEditor(quote.id, 10000)
    } catch {
      // El editor puede tardar; las herramientas siguientes vuelven a esperarlo.
    }
    out.result = { ok: true, id: quote.id, number: quote.number, title: quote.title, client: clientName || null }
    out.say = `Abrí la cotización N° ${quote.number}.`
  }

  async function openQuote(args: AssistantToolArgs['open_quote'], out: ToolOutcome) {
    const query = args.number !== undefined ? String(args.number) : (args.query ?? '')
    if (!query) throw new ToolError('¿Qué cotización abro? Dime el número o el nombre de la obra.')
    const list = await env.api.listQuotes(query)
    const found = args.number !== undefined ? list.find((q) => q.number === args.number) : list[0]
    if (!found) {
      out.ok = false
      out.result = { ok: false, error: args.number !== undefined ? `No existe la cotización N° ${args.number}.` : `No encontré cotizaciones con «${query}».` }
      out.say = args.number !== undefined ? `No encontré la cotización N° ${args.number}.` : `No encontré cotizaciones con «${query}».`
      return
    }
    env.navigate(`/cotizaciones/${found.id}`)
    lastTouchedId = null
    out.result = { ok: true, id: found.id, number: found.number, title: found.title, client: found.clientName ?? null, total: found.total, status: found.status }
    out.say = `Abrí la cotización N° ${found.number}${found.title ? ` · ${found.title}` : ''}.`
  }

  async function search(args: AssistantToolArgs['search'], out: ToolOutcome) {
    const query = args.query.trim()
    if (!query) throw new ToolError('¿Qué busco?')
    const kind = args.kind ?? 'all'
    const [quotes, clients] = await Promise.all([
      kind === 'clients' ? Promise.resolve([] as QuoteSummary[]) : env.api.listQuotes(query).catch(() => [] as QuoteSummary[]),
      kind === 'quotes' ? Promise.resolve([] as Client[]) : env.api.listClients(query).catch(() => [] as Client[]),
    ])
    const card: AssistantCard = {
      kind: 'results',
      query,
      quotes: quotes.slice(0, 5).map((q) => ({ id: q.id, number: q.number, title: q.title, clientName: q.clientName, total: q.total, status: q.status })),
      clients: clients.slice(0, 5).map((c) => ({ id: c.id, name: c.name, quotesCount: c.quotesCount, city: c.city })),
    }
    const found = card.quotes.length + card.clients.length
    if (found) out.card = card
    out.result = { ok: true, quotes: card.quotes, clients: card.clients, more: Math.max(0, quotes.length - 5) + Math.max(0, clients.length - 5) }
    const parts = [card.quotes.length ? `${card.quotes.length} ${card.quotes.length === 1 ? 'cotización' : 'cotizaciones'}` : '', card.clients.length ? `${card.clients.length} ${card.clients.length === 1 ? 'cliente' : 'clientes'}` : ''].filter(Boolean)
    out.say = found ? `Encontré ${parts.join(' y ')} con «${query}»:` : `No encontré nada con «${query}». Prueba con otra palabra o sin tildes.`
  }

  function navigate(args: AssistantToolArgs['navigate'], out: ToolOutcome) {
    const path = NAV_ROUTES[args.to] ?? '/inicio'
    env.navigate(path)
    out.result = { ok: true, path }
    out.say = `Te llevé a ${NAV_LABELS[args.to] ?? 'Inicio'}.`
  }

  async function runOne(call: AssistantToolCall): Promise<ToolOutcome> {
    const out: ToolOutcome = { callId: call.id, name: call.name, ok: true, result: { ok: true }, receipts: [], notes: [], step: '…' }
    if (!isAssistantTool(call.name)) {
      out.ok = false
      out.result = { ok: false, error: `No conozco la herramienta ${call.name}.` }
      return out
    }
    const name = call.name
    out.step = STEP_LABELS[name]
    try {
      switch (name) {
        case 'add_window':
          await addWindow(coerceToolArgs(name, call.arguments), out)
          break
        case 'update_window':
          await updateWindow(coerceToolArgs(name, call.arguments), out)
          break
        case 'duplicate_window':
          await duplicateWindow(coerceToolArgs(name, call.arguments), out)
          break
        case 'remove_window':
          await removeWindow(coerceToolArgs(name, call.arguments), out)
          break
        case 'set_discount':
          await setDiscount(coerceToolArgs(name, call.arguments), out)
          break
        case 'set_title':
          await setTitle(coerceToolArgs(name, call.arguments), out)
          break
        case 'set_client':
          await setClient(coerceToolArgs(name, call.arguments), out)
          break
        case 'explain_price':
          await explainItemPrice(coerceToolArgs(name, call.arguments), out)
          break
        case 'show_document':
          await showDocument(coerceToolArgs(name, call.arguments), out)
          break
        case 'send_quote':
          await sendQuote(coerceToolArgs(name, call.arguments), out)
          break
        case 'create_quote':
          await createQuote(coerceToolArgs(name, call.arguments), out)
          break
        case 'open_quote':
          await openQuote(coerceToolArgs(name, call.arguments), out)
          break
        case 'search':
          await search(coerceToolArgs(name, call.arguments), out)
          break
        case 'navigate':
          navigate(coerceToolArgs(name, call.arguments), out)
          break
      }
    } catch (error) {
      const message = error instanceof ToolError ? error.message : error instanceof Error && error.message ? humanize(error.message) : 'Algo no resultó.'
      out.ok = false
      out.result = { ok: false, error: message }
      out.say = message
    }
    if (out.notes.length && out.result && typeof out.result === 'object') out.result = { ...out.result, notes: out.notes }
    return out
  }

  return {
    /** Ejecuta en orden; se detiene si la señal se cancela (lo ya hecho queda, con deshacer). */
    async run(calls: readonly AssistantToolCall[], options: { signal?: AbortSignal; onStep?: (call: AssistantToolCall, outcome?: ToolOutcome) => void } = {}): Promise<ToolOutcome[]> {
      const outcomes: ToolOutcome[] = []
      for (const call of calls) {
        if (options.signal?.aborted) break
        options.onStep?.(call)
        const outcome = await runOne(call)
        outcomes.push(outcome)
        options.onStep?.(call, outcome)
      }
      return outcomes
    },
    /** Para pruebas y diagnóstico. */
    get lastTouchedId() {
      return lastTouchedId
    },
    get createdQuote() {
      return createdInBatch
    },
  }
}

export type Executor = ReturnType<typeof createExecutor>

/** Los mensajes de la API ya vienen humanos; los técnicos se reemplazan. */
function humanize(message: string): string {
  if (/fetch|network|failed|abort|timeout|json|undefined|null|TypeError/i.test(message)) return 'No pude conectar para hacer eso. Tus cambios están a salvo; inténtalo de nuevo.'
  return message
}

export function needsApproval(name: string): boolean {
  return (APPROVAL_TOOLS as readonly string[]).includes(name)
}
