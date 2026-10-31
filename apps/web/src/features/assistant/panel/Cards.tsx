/**
 * Piezas del mensaje de Marco: recibos con «Deshacer», desglose de precio, resultados de búsqueda,
 * tarjeta de aprobación y pasos de trabajo. Sobrias: bordes antes que sombras, cifras tabulares.
 */
import { Check, CircleAlert, FileText, Info, Undo2, UserRound } from 'lucide-react'
import { Link } from 'react-router'
import { formatCLP } from '@framezen/engine'
import { cn } from '../../../lib/cn'
import { Button, Spinner, StatusPill } from '../../../ui'
import type { ApprovalView, PriceCard, ReceiptView, ResultsCard, StepView } from '../types'

export function Receipts({ receipts, onUndo }: { receipts: ReceiptView[]; onUndo: (id: string) => void }) {
  return (
    <ul className="mt-2 overflow-hidden rounded-[10px] border border-paper-200 bg-paper-0" aria-label="Cambios hechos">
      {receipts.map((r) => (
        <li key={r.id} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 border-t border-paper-200 px-3 py-2 first:border-t-0">
          <Check aria-hidden strokeWidth={2.25} className={cn('mt-[3px] size-3.5 shrink-0', r.undone ? 'text-paper-350' : 'text-ok-600')} />
          <span className={cn('min-w-0 flex-1 text-[13px] leading-[19px] tabular', r.undone && 'text-paper-600 line-through decoration-paper-350')}>{r.text}</span>
          {/* En un panel angosto (acoplado en la columna de ventanas) la acción baja a su propia línea. */}
          {(r.undone || r.undoable) && <span aria-hidden className="hidden h-0 basis-full @max-xs:block" />}
          {r.undone ? (
            <span className="shrink-0 text-[12px] leading-[19px] text-paper-600 @max-xs:ml-[22px]">Deshecho</span>
          ) : r.undoable ? (
            <button
              type="button"
              onClick={() => onUndo(r.id)}
              className="-my-0.5 inline-flex shrink-0 items-center gap-1 rounded-xs px-1 py-0.5 text-[12.5px] font-medium leading-[19px] text-ink-600 transition-colors duration-120 hover:bg-ink-50 hover:text-ink-700 @max-xs:ml-[18px]"
            >
              <Undo2 aria-hidden strokeWidth={2} className="size-3.5" />
              Deshacer
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export function PriceBreakdown({ card }: { card: PriceCard }) {
  return (
    <div className="mt-2 overflow-hidden rounded-[10px] border border-paper-200 bg-paper-0">
      <div className="flex items-baseline justify-between gap-3 border-b border-paper-200 bg-paper-50 px-3 py-2">
        <p className="min-w-0 truncate text-[13px] font-semibold">
          {card.ref} <span className="font-normal text-paper-600">· {card.title}</span>
        </p>
        <p className="shrink-0 text-[12px] text-paper-600 tabular narrow">{card.size}</p>
      </div>
      {card.lines.length > 0 && (
        <dl className="px-3 py-1.5 text-[13px] leading-[18px]">
          {card.lines.map((line, i) => (
            <div
              key={`${line.label}-${i}`}
              className={cn(
                'flex items-baseline justify-between gap-4 py-[3px]',
                line.kind !== 'part' && 'mt-1 border-t border-paper-200 pt-[6px] font-medium',
                line.kind === 'total' && 'text-paper-900',
              )}
            >
              <dt className={cn('min-w-0', line.kind === 'part' && 'text-paper-600')}>{line.label}</dt>
              <dd className="shrink-0 tabular">{formatCLP(line.amount)}</dd>
            </div>
          ))}
        </dl>
      )}
      {/* Sin desglose (la persona no ve costos): solo el precio. Con desglose, el motor ya trae los totales. */}
      {card.lines.length === 0 && (
        <div className="flex items-baseline justify-between gap-3 px-3 py-2">
          <span className="text-[12.5px] text-paper-600">{card.qty > 1 ? `${card.qty} unidades` : 'Precio por unidad'}</span>
          <span className="text-[14px] font-semibold tabular">
            {formatCLP(card.qty > 1 ? card.totalNet : card.unitNet)} <span className="text-[12px] font-normal text-paper-600">+ IVA</span>
          </span>
        </div>
      )}
      {card.warnings.length > 0 && (
        <ul className="border-t border-paper-200 bg-warn-50/60 px-3 py-2 text-[12.5px] leading-[18px] text-warn-800">
          {card.warnings.map((w) => (
            <li key={w} className="flex gap-1.5">
              <CircleAlert aria-hidden strokeWidth={2} className="mt-[2px] size-3.5 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function SearchResults({ card, onOpen }: { card: ResultsCard; onOpen?: () => void }) {
  return (
    <ul className="mt-2 overflow-hidden rounded-[10px] border border-paper-200 bg-paper-0">
      {card.quotes.map((q) => (
        <li key={q.id} className="border-t border-paper-200 first:border-t-0">
          <Link
            to={`/cotizaciones/${q.id}`}
            onClick={onOpen}
            className="flex items-center gap-2.5 px-3 py-2 transition-colors duration-120 hover:bg-paper-50"
          >
            <FileText aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-paper-600" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">
                N° {q.number} · {q.title || 'Sin título'}
              </span>
              {q.clientName && <span className="block truncate text-[12px] text-paper-600">{q.clientName}</span>}
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-[12.5px] tabular">{formatCLP(q.total)}</span>
              <StatusPill status={q.status} />
            </span>
          </Link>
        </li>
      ))}
      {card.clients.map((c) => (
        <li key={c.id} className="border-t border-paper-200 first:border-t-0">
          <Link to={`/clientes/${c.id}`} onClick={onOpen} className="flex items-center gap-2.5 px-3 py-2 transition-colors duration-120 hover:bg-paper-50">
            <UserRound aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-paper-600" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{c.name}</span>
            <span className="shrink-0 text-[12px] text-paper-600">
              {[c.city, c.quotesCount ? `${c.quotesCount} ${c.quotesCount === 1 ? 'cotización' : 'cotizaciones'}` : ''].filter(Boolean).join(' · ')}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function ApprovalCard({ approval, onAnswer }: { approval: ApprovalView; onAnswer: (ok: boolean) => void }) {
  if (approval.status !== 'pending') {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-paper-600">
        {approval.status === 'approved' ? <Check aria-hidden className="size-3.5 text-ok-600" strokeWidth={2.25} /> : <Info aria-hidden className="size-3.5" strokeWidth={2} />}
        {approval.status === 'approved' ? 'Confirmaste el envío.' : 'Quedó sin enviar.'}
      </p>
    )
  }
  return (
    <div role="group" aria-label="Necesito tu visto bueno" className="mt-2 rounded-[12px] border border-warn-600/35 bg-warn-50 p-3">
      <p className="text-[13.5px] font-semibold leading-[19px] text-paper-900">{approval.title}</p>
      <ul className="mt-1 space-y-0.5 text-[12.5px] leading-[18px] text-paper-600 tabular">
        {approval.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" onClick={() => onAnswer(true)}>
          {approval.confirmLabel}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onAnswer(false)}>
          No
        </Button>
      </div>
      <p className="mt-2 text-[12px] text-paper-600">Puedes seguir trabajando mientras decides.</p>
    </div>
  )
}

export function Steps({ steps }: { steps: StepView[] }) {
  return (
    <ul className="mt-1.5 space-y-1" aria-label="Lo que estoy haciendo">
      {steps.map((step) => (
        <li key={step.id} className="flex items-center gap-2 text-[12.5px] text-paper-600">
          {step.done ? <Check aria-hidden strokeWidth={2.25} className="size-3.5 text-ok-600" /> : <Spinner size={14} />}
          <span className={cn(step.done && 'text-paper-600/80')}>{step.label}</span>
        </li>
      ))}
    </ul>
  )
}
