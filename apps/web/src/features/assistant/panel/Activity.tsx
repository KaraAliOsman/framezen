/**
 * Recibos de las herramientas del servidor: una fila por acción, con el ícono del dominio, lo que hizo
 * («Agregué V3: corredera 1.500 × 1.200») y «Deshacer». Si fueron varias, ya terminadas, se pliegan en
 * una línea para no tapar la respuesta. Lo que falló nunca se pliega.
 */
import { useState } from 'react'
import { Check, ChevronRight, CircleAlert, Undo2 } from 'lucide-react'
import type { ToolRun } from '@dekopen/shared'
import { useT } from '../../../lib/i18n'
import { cn } from '../../../lib/cn'
import { Spinner } from '../../../ui'
import es from '../i18n/es'
import type { ActivityView } from '../types'
import { DOMAIN_ICONS, toolDomain } from './toolMeta'

/** Desde cuántas acciones terminadas se pliegan. */
const FOLD_FROM = 3

export interface ActivityListProps {
  rows: ActivityView[]
  runs: Record<string, ToolRun>
  /** Turno en curso (las filas sin cerrar giran). */
  live: boolean
  onUndo(runId: string): Promise<void> | void
}

const statusOf = (row: ActivityView, runs: Record<string, ToolRun>) => (row.toolRunId ? runs[row.toolRunId]?.status : undefined) ?? row.status

export function ActivityList({ rows, runs, live, onUndo }: ActivityListProps) {
  const t = useT(es)
  const [open, setOpen] = useState(false)
  if (!rows.length) return null
  const failed = rows.filter((r) => statusOf(r, runs) === 'failed')
  const fine = rows.filter((r) => statusOf(r, runs) !== 'failed')
  const running = rows.some((r) => ['running', 'approved'].includes(statusOf(r, runs)))
  const foldable = !live && !running && fine.length >= FOLD_FROM
  const row = (item: ActivityView) => <ActivityRow key={item.id} row={item} run={item.toolRunId ? runs[item.toolRunId] : undefined} live={live} onUndo={onUndo} />
  return (
    <div className="mt-1.5">
      {foldable ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="-mx-1 flex min-h-7 items-center gap-1.5 rounded-xs px-1 text-table text-fg-muted transition-colors duration-100 hover:bg-hover hover:text-fg touch:min-h-10"
        >
          <Check aria-hidden strokeWidth={2.25} className="size-3.5 shrink-0 text-success" />
          {t('activity.group', { count: fine.length })}
          <ChevronRight aria-hidden strokeWidth={2} className={cn('size-3.5 shrink-0 transition-transform duration-140', open && 'rotate-90')} />
        </button>
      ) : null}
      {!foldable || open ? (
        <ul className="space-y-0.5" aria-label={t('activity.label')}>
          {fine.map(row)}
        </ul>
      ) : null}
      {failed.length ? (
        <ul className="space-y-0.5" aria-label={t('activity.label')}>
          {failed.map(row)}
        </ul>
      ) : null}
    </div>
  )
}

function ActivityRow({ row, run, live, onUndo }: { row: ActivityView; run?: ToolRun; live: boolean; onUndo(runId: string): Promise<void> | void }) {
  const t = useT(es)
  const [undoing, setUndoing] = useState(false)
  const status = run?.status ?? row.status
  const domain = toolDomain(row.tool)
  const Icon = DOMAIN_ICONS[domain]
  const running = status === 'running' || status === 'approved'
  const failed = status === 'failed'
  const undone = status === 'undone'
  const label = failed
    ? row.error
      ? t('activity.failed', { reason: row.error })
      : t('activity.failedGeneric')
    : running
      ? t(`activity.running.${domain}`)
      : (row.summary ?? run?.preview?.title ?? t(`activity.done.${domain}`))
  const canUndo = Boolean(run && run.undoable && status === 'executed')

  return (
    <li className="group flex min-h-7 items-start gap-2 py-0.5 text-table text-fg-muted">
      <span className="relative mt-0.5 inline-flex size-4 shrink-0 items-center justify-center">
        {running && live ? (
          <Spinner size={14} />
        ) : failed ? (
          <CircleAlert aria-hidden strokeWidth={2} className="size-3.5 text-danger" />
        ) : undone ? (
          <Undo2 aria-hidden strokeWidth={2} className="size-3.5 text-fg-faint" />
        ) : (
          <Icon aria-hidden strokeWidth={1.75} className="size-4" />
        )}
      </span>
      <span className={cn('line-clamp-3 min-w-0 flex-1 tabular [overflow-wrap:anywhere]', undone && 'line-through decoration-fg-faint', failed && 'text-danger')} title={label}>
        {label}
      </span>
      {undone && <span className="mt-px shrink-0 text-meta text-fg-faint">{t('activity.undone')}</span>}
      {canUndo ? (
        <button
          type="button"
          disabled={undoing}
          onClick={async () => {
            setUndoing(true)
            try {
              await onUndo(run!.id)
            } finally {
              setUndoing(false)
            }
          }}
          className="-my-0.5 inline-flex h-6 shrink-0 items-center gap-1 rounded-xs px-1.5 text-meta font-medium text-accent-ink transition-colors duration-100 hover:bg-accent-subtle disabled:opacity-60 touch:h-9"
        >
          <Undo2 aria-hidden strokeWidth={2} className="size-3.5" />
          {undoing ? t('activity.undoing') : t('activity.undo')}
        </button>
      ) : !running && !failed && !undone ? (
        <Check aria-hidden strokeWidth={2.25} className="mt-0.5 size-3.5 shrink-0 text-success" />
      ) : null}
    </li>
  )
}
