/**
 * Resultado en construcción de una gramática: llamadas, piezas del «Entendí: …», slots faltantes,
 * reparaciones, supuestos y respuesta. Cada gramática devuelve uno; el intérprete elige el mejor.
 */
import type { NluCommandId, NluToolArgs, NluToolName } from './commands'
import type { NluRepair, NluSlot, NluSlotKind, NluStatus } from './types'

/** Orden de los slots para completar (después de los que faltan). */
export const SLOT_ORDER: Partial<Record<NluCommandId, readonly NluSlotKind[]>> = {
  'item.add': ['typology', 'size', 'color', 'glass', 'quantity', 'line'],
  'item.update': ['item', 'change', 'color', 'glass', 'size'],
  'item.bulk': ['change', 'color', 'glass'],
  'item.duplicate': ['item', 'quantity'],
  'item.join': ['item'],
  'item.remove': ['item'],
  'item.select': ['item'],
  'quote.create': ['title', 'client'],
  'quote.open': ['quote'],
  'quote.rename': ['title'],
  'quote.assign_client': ['client'],
  'quote.discount': ['percent'],
  'quote.margin': ['percent'],
  'quote.notes': ['text'],
  'quote.template': ['template'],
  'quote.locale': ['locale'],
  'quote.status': ['status'],
  'quote.send': ['quote'],
  'quote.search': ['text'],
  'client.create': ['name'],
  'client.search': ['client'],
  'client.open': ['client'],
  'nav.go': ['nav'],
  'template.open': ['template'],
  'settings.ui_locale': ['locale'],
  'settings.doc_locale': ['locale'],
  'settings.theme': ['theme'],
  'assistant.switch': ['assistant'],
  'assistant.mode': ['mode'],
  'memory.remember': ['text'],
  'memory.forget': ['text'],
}

const STATUS_RANK: Record<NluStatus, number> = { ready: 0, answer: 0, incomplete: 1, ambiguous: 2, invalid: 3, unmatched: 4 }

export interface PlannedCall {
  tool: NluToolName
  args: Record<string, unknown>
}

export class Build {
  calls: PlannedCall[] = []
  parts: string[] = []
  missing: NluSlot[] = []
  repairs: NluRepair[] = []
  assumptions: string[] = []
  reply?: string
  status: NluStatus = 'ready'
  filled = new Set<NluSlotKind>()
  /** Hubo que adivinar algo visible (resta confianza). */
  guesses = 0
  /**
   * Cambios sin destino explícito («ponle nogal») tras agregar una ventana en la misma frase: se
   * funden en esa ventana («agrega una corredera y ponle nogal»).
   */
  merge?: { args: Record<string, unknown>; parts: string[] }
  /** Ventanas ya nombradas en la frase: no se vuelven a ofrecer. */
  pickedItems?: readonly string[]

  constructor(
    public command: NluCommandId,
    /** Evidencia (verbo + objeto + datos); compara gramáticas entre sí. */
    public score: number,
  ) {}

  call<N extends NluToolName>(tool: N, args: NluToolArgs[N]): this {
    this.calls.push({ tool, args: args as unknown as Record<string, unknown> })
    return this
  }

  part(text: string | undefined): this {
    if (text) this.parts.push(text)
    return this
  }

  fill(...kinds: NluSlotKind[]): this {
    for (const k of kinds) this.filled.add(k)
    return this
  }

  private raise(status: NluStatus): void {
    if (STATUS_RANK[status] > STATUS_RANK[this.status]) this.status = status
  }

  need(slot: NluSlot): this {
    this.missing.push(slot)
    this.raise('incomplete')
    return this
  }

  ambiguous(slot?: NluSlot): this {
    if (slot) this.missing.push(slot)
    this.raise('ambiguous')
    return this
  }

  fail(reply: string): this {
    if (!this.reply || this.status !== 'invalid') this.reply = reply
    this.raise('invalid')
    return this
  }

  answer(reply: string): this {
    this.reply = reply
    if (this.status === 'ready') this.status = 'answer'
    return this
  }

  assume(text: string): this {
    if (!this.assumptions.includes(text)) this.assumptions.push(text)
    this.guesses++
    return this
  }

  repair(label: string, text: string): this {
    if (!this.repairs.some((r) => r.text === text)) this.repairs.push({ label, text })
    return this
  }

  /** Slots que conviene completar a continuación (faltantes primero, luego opcionales sin valor). */
  next(): NluSlotKind[] {
    const out: NluSlotKind[] = []
    for (const m of this.missing) if (!out.includes(m.kind)) out.push(m.kind)
    for (const k of SLOT_ORDER[this.command] ?? []) if (!this.filled.has(k) && !out.includes(k)) out.push(k)
    return out
  }
}
