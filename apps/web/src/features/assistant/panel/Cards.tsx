/**
 * Piezas de las respuestas a comandos locales: recibos con «Deshacer», desglose de precio del motor,
 * resultados de búsqueda, la confirmación de envío y los pasos de trabajo. Sobrias: bordes antes que
 * sombras, cifras tabulares.
 */
import { Check, CircleAlert, FileText, Info, Undo2, UserRound } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '../../../lib/cn'
import { useFormat, useT } from '../../../lib/i18n'
import { Button, Spinner, StatusPill } from '../../../ui'
import es from '../i18n/es'
import type { ApprovalView, PriceCard, ReceiptView, ResultsCard, StepView } from '../types'

export function Receipts({ receipts, onUndo }: { receipts: ReceiptView[]; onUndo: (id: string) => void }) {
  const t = useT(es)
  return (
    <ul className="mt-1.5" aria-label={t('activity.changes')}>
      {receipts.map((r) => (
        <li key={r.id} className="flex min-h-7 flex-wrap items-start gap-x-2 gap-y-0.5 py-1">
          <Check aria-hidden strokeWidth={2.25} className={cn('mt-0.5 size-3.5 shrink-0', r.undone ? 'text-fg-faint' : 'text-success')} />
          <span className={cn('min-w-0 flex-1 text-table tabular', r.undone && 'text-fg-muted line-through decoration-fg-faint')}>{r.text}</span>
          {/* En un panel angosto (acoplado en la columna de ventanas) la acción baja a su propia línea. */}
          {(r.undone || r.undoable) && <span aria-hidden className="hidden h-0 basis-full @max-xs:block" />}
          {r.undone ? (
            <span className="shrink-0 text-meta text-fg-muted @max-xs:ml-5.5">{t('activity.undone')}</span>
          ) : r.undoable ? (
            <button
              type="button"
              onClick={() => onUndo(r.id)}
              className="-my-0.5 inline-flex shrink-0 items-center gap-1 rounded-xs px-1 py-0.5 text-meta font-medium text-accent-ink transition-colors duration-100 hover:bg-accent-subtle @max-xs:ml-4.5"
            >
              <Undo2 aria-hidden strokeWidth={2} className="size-3.5" />
              {t('activity.undo')}
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

export function PriceBreakdown({ card }: { card: PriceCard }) {
  const fmt = useFormat()
  const g = useT(es)
  return (
    <div className="mt-2 overflow-hidden rounded-panel border border-divider">
      <div className="flex items-baseline justify-between gap-3 px-3 pt-2.5 pb-1">
        <p className="min-w-0 truncate text-table font-medium text-fg-strong">
          <span className="code-id">{card.ref}</span> <span className="font-normal text-fg-muted">· {card.title}</span>
        </p>
        <p className="dim shrink-0 text-meta text-fg-muted">{card.size}</p>
      </div>
      {card.lines.length > 0 && (
        <dl className="px-3 py-1.5 text-table">
          {card.lines.map((line, i) => (
            <div
              key={`${line.label}-${i}`}
              className={cn('flex items-baseline justify-between gap-4 py-0.5', line.kind !== 'part' && 'mt-1 border-t border-divider pt-1.5 font-medium', line.kind === 'total' && 'text-fg-strong')}
            >
              <dt className={cn('min-w-0', line.kind === 'part' && 'text-fg-muted')}>{line.label}</dt>
              <dd className="shrink-0 tabular">{fmt.money(line.amount)}</dd>
            </div>
          ))}
        </dl>
      )}
      {/* Sin desglose (la persona no ve costos): solo el precio. Con desglose, el motor ya trae los totales. */}
      {card.lines.length === 0 && (
        <div className="flex items-baseline justify-between gap-3 px-3 py-2">
          <span className="text-table text-fg-muted">{card.qty > 1 ? g('executor.units', { count: card.qty }) : g('cards.unitPrice')}</span>
          <span className="text-base font-medium tabular text-fg-strong">
            {fmt.money(card.qty > 1 ? card.totalNet : card.unitNet)} <span className="text-meta font-normal text-fg-muted">{g('cards.plusTax')}</span>
          </span>
        </div>
      )}
      {card.warnings.length > 0 && (
        <ul className="border-t border-divider bg-warning-bg px-3 py-2 text-table text-warning">
          {card.warnings.map((w) => (
            <li key={w} className="flex gap-1.5">
              <CircleAlert aria-hidden strokeWidth={2} className="mt-0.5 size-3.5 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function SearchResults({ card, onOpen }: { card: ResultsCard; onOpen?: () => void }) {
  const fmt = useFormat()
  const t = useT(es)
  return (
    <ul className="mt-2 -mx-2">
      {card.quotes.map((q) => (
        <li key={q.id}>
          <Link to={`/cotizaciones/${q.id}`} onClick={onOpen} className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 transition-colors duration-100 hover:bg-hover">
            <FileText aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-fg-muted" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-table font-medium text-fg">
                <span className="code-id">{fmt.docNumber(q.number)}</span>
                {q.title ? ` · ${q.title}` : ''}
              </span>
              {q.clientName && <span className="block truncate text-meta text-fg-muted">{q.clientName}</span>}
            </span>
            <span className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="text-table tabular">{fmt.money(q.total)}</span>
              <StatusPill status={q.status} size="sm" />
            </span>
          </Link>
        </li>
      ))}
      {card.clients.map((c) => (
        <li key={c.id}>
          <Link to={`/clientes/${c.id}`} onClick={onOpen} className="flex items-center gap-2.5 rounded-sm px-2 py-1.5 transition-colors duration-100 hover:bg-hover">
            <UserRound aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-fg-muted" />
            <span className="min-w-0 flex-1 truncate text-table font-medium text-fg">{c.name}</span>
            <span className="shrink-0 text-meta text-fg-muted">
              {[c.city, c.quotesCount ? t('executor.foundQuotes', { count: c.quotesCount }) : ''].filter(Boolean).join(' · ')}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Confirmación que pide un comando local antes de algo externo (enviar la cotización). */
export function LocalApprovalCard({ approval, onAnswer }: { approval: ApprovalView; onAnswer: (ok: boolean) => void }) {
  const t = useT(es)
  if (approval.status !== 'pending') {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-table text-fg-muted">
        {approval.status === 'approved' ? <Check aria-hidden className="size-3.5 text-success" strokeWidth={2.25} /> : <Info aria-hidden className="size-3.5" strokeWidth={2} />}
        {approval.status === 'approved' ? t('approval.approvedLocal') : t('approval.declinedLocal')}
      </p>
    )
  }
  return (
    <div role="group" aria-label={t('approval.group')} className="mt-2 rounded-panel border border-divider-strong bg-surface">
      <p className="px-3 pt-3 text-base font-medium text-fg-strong">{approval.title}</p>
      <div className="px-3 pt-1 pb-3">
        <ul className="space-y-0.5 text-table text-fg tabular">
          {approval.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="primary" onClick={() => onAnswer(true)}>
            {approval.confirmLabel}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onAnswer(false)}>
            {t('approval.no')}
          </Button>
        </div>
        <p className="mt-2 text-meta text-fg-muted">{t('approval.keepWorking')}</p>
      </div>
    </div>
  )
}

export function Steps({ steps }: { steps: StepView[] }) {
  const t = useT(es)
  return (
    <ul className="mt-1.5 space-y-0.5" aria-label={t('activity.label')}>
      {steps.map((step) => (
        <li key={step.id} className="flex min-h-7 items-center gap-2 text-table text-fg-muted">
          {step.done ? <Check aria-hidden strokeWidth={2.25} className="size-3.5 text-success" /> : <Spinner size={14} />}
          <span>{step.label}</span>
        </li>
      ))}
    </ul>
  )
}
