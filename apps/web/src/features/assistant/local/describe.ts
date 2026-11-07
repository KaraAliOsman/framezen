/**
 * «Entendí: …» — resumen corto y localizado de un plan local antes de ejecutarlo. Se arma desde los
 * argumentos canónicos (no desde el texto escrito): lo que se ve es lo que se va a hacer.
 */
import type { LocalToolCall } from '@dekopen/shared'
import { getFormatter, getGlossary, translate } from '../../../lib/i18n'
import es from '../i18n/es'

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

function targetLabel(args: Record<string, unknown>): string {
  if (args.all === true) return translate(es, 'plan.all')
  const items = Array.isArray(args.items) ? args.items.filter((x): x is string => typeof x === 'string') : []
  if (items.length) return getFormatter().list(items)
  return str(args.ref) ?? translate(es, 'plan.selected')
}

function sizeLabel(width?: number, height?: number): string {
  const fmt = getFormatter()
  if (width && height) return fmt.size(width, height)
  if (width) return translate(es, 'plan.width', { value: fmt.mm(width, { unit: true }) })
  if (height) return translate(es, 'plan.height', { value: fmt.mm(height, { unit: true }) })
  return ''
}

/** Una frase por llamada. */
export function describeCall(call: LocalToolCall): string {
  const a = call.args ?? {}
  const g = getGlossary()
  const fmt = getFormatter()
  switch (call.tool) {
    case 'add_window': {
      const typologyId = str(a.typology)
      const typology = typologyId ? g.typology(typologyId, typologyId) : translate(es, 'plan.window')
      const size = sizeLabel(num(a.width), num(a.height))
      const qty = num(a.qty) ?? 1
      const base = translate(es, qty > 1 ? 'plan.addWindowQty' : 'plan.addWindow', { qty, typology, size })
      const extras = [str(a.color), str(a.glass), str(a.line)].filter(Boolean) as string[]
      return [size ? base : base.replace(/\s·\s$/, ''), ...extras].join(' · ')
    }
    case 'add_assembly': {
      const preset = translate(es, `plan.preset.${(str(a.preset) ?? 'coupled_2') as keyof typeof es.plan.preset}`)
      const panes = num(a.panes)
      const size = sizeLabel(num(a.width), num(a.height))
      const qty = num(a.qty) ?? 1
      const base = translate(es, qty > 1 ? 'plan.addAssemblyQty' : 'plan.addAssembly', { qty, preset, size })
      const extras = [panes ? translate(es, 'plan.assemblyPanes', { count: panes }) : '', str(a.color), str(a.glass), str(a.line)].filter(Boolean) as string[]
      return [size ? base : base.replace(/\s·\s$/, ''), ...extras].join(' · ')
    }
    case 'join_windows': {
      const side = str(a.side) as keyof typeof es.plan.joinSide | undefined
      const base = translate(es, 'plan.join', { items: targetLabel(a) })
      return side && side !== 'right' ? `${base} ${translate(es, `plan.joinSide.${side}`)}` : base
    }
    case 'update_window': {
      const changes: string[] = []
      const size = sizeLabel(num(a.width), num(a.height))
      if (size) changes.push(size)
      if (str(a.typology)) changes.push(g.typology(str(a.typology)!, str(a.typology)))
      if (str(a.opening)) changes.push(g.opening(str(a.opening)!))
      for (const v of [a.color, a.color_in, a.glass, a.line, a.location, a.name]) if (str(v)) changes.push(str(v)!)
      if (num(a.qty)) changes.push(translate(es, 'plan.qty', { count: num(a.qty)! }))
      return translate(es, 'plan.update', { target: targetLabel(a), changes: changes.join(', ') || '…' })
    }
    case 'set_discount': {
      const pct = num(a.percent) ?? 0
      return pct === 0 ? translate(es, 'plan.discountRemove') : translate(es, 'plan.discount', { pct: fmt.pct(pct) })
    }
    case 'set_title':
      return translate(es, 'plan.title', { title: str(a.title) ?? '' })
    case 'set_client':
      return a.clear === true || !str(a.name) ? translate(es, 'plan.clientClear') : translate(es, 'plan.client', { name: str(a.name)! })
    case 'create_quote':
      return str(a.client) ? translate(es, 'plan.createQuoteFor', { client: str(a.client)! }) : translate(es, 'plan.createQuote')
    case 'open_quote':
      return translate(es, 'plan.openQuote', { ref: num(a.number) !== undefined ? fmt.docNumber(num(a.number)!) : `«${str(a.query) ?? ''}»` })
    case 'duplicate_window':
      return translate(es, 'plan.duplicate', { ref: str(a.ref) ?? translate(es, 'plan.selected') })
    case 'remove_window':
      return translate(es, 'plan.remove', { ref: targetLabel(a) })
    case 'explain_price':
      return translate(es, 'plan.explain', { ref: str(a.ref) ?? translate(es, 'plan.selected') })
    case 'show_document':
      return translate(es, a.view === 'design' ? 'plan.design' : 'plan.document')
    case 'send_quote':
      return translate(es, 'plan.send')
    case 'navigate': {
      const to = str(a.to) ?? 'inicio'
      const key = `executor.places.${to}` as `executor.places.${keyof typeof es.executor.places}`
      return translate(es, 'plan.navigate', { place: translate(es, key) })
    }
    case 'search':
      return translate(es, 'plan.search', { query: str(a.query) ?? '' })
    case 'undo':
      return translate(es, 'plan.undo')
    case 'remember':
      return translate(es, 'plan.remember', { text: str(a.content) ?? '' })
    case 'help':
      return translate(es, 'plan.help')
    default:
      return translate(es, 'plan.generic', { tool: call.tool.replace(/_/g, ' ') })
  }
}

/** Resumen del plan completo (primera letra en mayúscula). */
export function describePlan(calls: readonly LocalToolCall[]): string {
  const text = calls.map(describeCall).filter(Boolean).join(' · ')
  return text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : ''
}
