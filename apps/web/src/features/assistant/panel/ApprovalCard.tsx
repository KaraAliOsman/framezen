/**
 * Propuesta para aprobar (Supervisado, o algo externo/de producción/destructivo en Acceso total).
 * Se arma con lo que calculó el servidor (`ToolPreview`): verbo y objetivo, argumentos exactos,
 * antes → después, totales del motor, lo que no se puede deshacer y el vencimiento. Aprobar manda la
 * huella de lo que se vio; tras decidir, la tarjeta se compacta a una fila.
 */
import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Check, CircleAlert, Clock, Factory, Link2, Mail, MessageCircle, ShieldAlert, Trash2, X } from 'lucide-react'
import type { ToolRun } from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useFormat, useT } from '../../../lib/i18n'
import { Button, InspectorRow } from '../../../ui'
import es from '../i18n/es'
import { DOMAIN_ICONS, toolDomain } from './toolMeta'

function minutesLeft(expiresAt: string | undefined, now: number): number | null {
  if (!expiresAt) return null
  const t = Date.parse(expiresAt)
  return Number.isFinite(t) ? (t - now) / 60_000 : null
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 15_000)
    return () => clearInterval(id)
  }, [active])
  return now
}

function channelIcon(run: ToolRun) {
  const name = run.tool.toLowerCase()
  if (/whatsapp/.test(name)) return MessageCircle
  if (/mail|send/.test(name)) return Mail
  if (/link|share/.test(name)) return Link2
  return ShieldAlert
}

export interface ApprovalCardProps {
  run: ToolRun
  onApprove(runId: string): Promise<void> | void
  onReject(runId: string): Promise<void> | void
  /** Otro turno está en curso: los botones esperan. */
  busy?: boolean
}

export function ApprovalCard({ run, onApprove, onReject, busy }: ApprovalCardProps) {
  const t = useT(es)
  const fmt = useFormat({ currency: run.preview?.totals?.currency })
  const reduced = useReducedMotion()
  const [deciding, setDeciding] = useState<'approve' | 'reject' | null>(null)
  const pending = run.status === 'proposed'
  const now = useNow(pending)
  const left = minutesLeft(run.expiresAt, now)
  const expired = pending && left !== null && left <= 0
  const preview = run.preview
  const title = preview?.title ?? run.tool.replace(/_/g, ' ')
  const cardRef = useRef<HTMLDivElement>(null)

  // ⌘/Ctrl + Enter aprueba solo con el foco dentro de la tarjeta (nunca desde el compositor).
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && pending && !expired && !deciding && !busy) {
      event.preventDefault()
      void decide('approve')
    }
  }

  async function decide(kind: 'approve' | 'reject') {
    setDeciding(kind)
    try {
      await (kind === 'approve' ? onApprove(run.id) : onReject(run.id))
    } finally {
      setDeciding(null)
    }
  }

  if (!pending || expired) {
    const Icon = DOMAIN_ICONS[toolDomain(run.tool)]
    const state = expired || run.status === 'expired' ? 'expired' : run.status
    return (
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 2 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
        className="mt-1.5 flex min-h-7 items-center gap-2 text-table text-fg-muted"
      >
        {state === 'rejected' ? (
          <X aria-hidden strokeWidth={2} className="size-3.5 shrink-0" />
        ) : state === 'expired' ? (
          <Clock aria-hidden strokeWidth={2} className="size-3.5 shrink-0" />
        ) : state === 'failed' ? (
          <CircleAlert aria-hidden strokeWidth={2} className="size-3.5 shrink-0 text-danger" />
        ) : (
          <Icon aria-hidden strokeWidth={1.75} className="size-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">
          {state === 'rejected'
            ? t('approval.rejected', { title })
            : state === 'expired'
              ? t('approval.expired')
              : state === 'failed'
                ? t('activity.failed', { reason: run.error?.message ?? title })
                : state === 'approved'
                  ? t('approval.working')
                  : t('approval.approved', { title })}
        </span>
        {(state === 'executed' || state === 'undone') && <Check aria-hidden strokeWidth={2.25} className="size-3.5 shrink-0 text-success" />}
      </motion.div>
    )
  }

  const destructive = run.risk === 'destructive'
  const external = run.risk === 'external'
  const production = run.risk === 'production'
  const RiskIcon = destructive ? Trash2 : external ? channelIcon(run) : production ? Factory : DOMAIN_ICONS[toolDomain(run.tool)]
  const approveLabel = destructive ? t('approval.delete') : external ? t('approval.send') : production ? t('approval.produce') : t('approval.approve')
  const totals = preview?.totals
  const minutes = left === null ? null : Math.max(1, Math.ceil(left))

  return (
    <motion.div
      ref={cardRef}
      data-approval={run.id}
      tabIndex={-1}
      role="group"
      aria-label={t('approval.group')}
      onKeyDown={onKeyDown}
      initial={reduced ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
      className={cn('mt-2 rounded-panel border bg-surface outline-offset-2', destructive ? 'border-danger-line' : 'border-divider-strong')}
    >
      <div className="flex items-start gap-2 px-3 pt-3">
        <RiskIcon aria-hidden strokeWidth={1.75} className={cn('mt-0.5 size-4 shrink-0', destructive ? 'text-danger' : 'text-fg-muted')} />
        <div className="min-w-0 flex-1">
          <p className="text-base font-medium text-fg-strong">{title}</p>
          <p className={cn('text-table', destructive ? 'text-danger' : 'text-fg-muted')}>{t(`approval.risk.${run.risk}`)}</p>
        </div>
      </div>
      <div className="space-y-2.5 px-3 pt-2 pb-3">
        {preview?.lines.length ? (
          <ul className="space-y-0.5 text-table text-fg tabular">
            {preview.lines.map((line, i) => (
              <li key={i} className="[overflow-wrap:anywhere]">
                {line}
              </li>
            ))}
          </ul>
        ) : null}
        {preview?.changes?.length ? (
          <div className="divide-y divide-divider">
            {preview.changes.map((change) => (
              <InspectorRow key={change.field} label={change.label} kind="num">
                <span className="inline-flex flex-wrap items-baseline justify-end gap-x-1.5">
                  {change.before !== undefined && change.before !== '' && (
                    <span className="text-table text-fg-muted line-through decoration-fg-faint">
                      <span className="sr-only">{t('approval.before')}: </span>
                      {change.before}
                    </span>
                  )}
                  {change.before !== undefined && change.before !== '' && change.after !== undefined && (
                    <span aria-hidden className="text-fg-faint">
                      →
                    </span>
                  )}
                  {change.after !== undefined && (
                    <span className="font-medium text-fg-strong">
                      <span className="sr-only">{t('approval.after')}: </span>
                      {change.after}
                    </span>
                  )}
                </span>
              </InspectorRow>
            ))}
          </div>
        ) : null}
        {totals && (totals.before !== undefined || totals.after !== undefined) && (
          <div className="flex items-baseline justify-between gap-3 border-t border-divider pt-2">
            <span className="text-table text-fg-muted">{t('approval.total')}</span>
            <span className="inline-flex items-baseline gap-1.5 tabular">
              {totals.before !== undefined && <span className="text-table text-fg-muted line-through decoration-fg-faint">{fmt.money(totals.before)}</span>}
              {totals.before !== undefined && totals.after !== undefined && (
                <span aria-hidden className="text-fg-faint">
                  →
                </span>
              )}
              {totals.after !== undefined && <span className="font-display text-h3 font-medium text-fg-strong">{fmt.money(totals.after)}</span>}
            </span>
          </div>
        )}
        {preview?.irreversible && (
          <p className="flex gap-1.5 text-table text-warning">
            <ShieldAlert aria-hidden strokeWidth={2} className="mt-0.5 size-3.5 shrink-0" />
            {t('approval.irreversible', { text: preview.irreversible })}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <Button
            size="sm"
            variant={destructive ? 'danger' : 'primary'}
            shortcut="mod+enter"
            loading={deciding === 'approve'}
            disabled={Boolean(deciding) || busy}
            onClick={() => void decide('approve')}
          >
            {approveLabel}
          </Button>
          <Button size="sm" variant="ghost" loading={deciding === 'reject'} disabled={Boolean(deciding) || busy} onClick={() => void decide('reject')}>
            {t('approval.reject')}
          </Button>
          {minutes !== null && (
            <span className="ml-auto inline-flex items-center gap-1 text-meta text-fg-muted">
              <Clock aria-hidden strokeWidth={1.75} className="size-3" />
              {left !== null && left < 1 ? t('approval.expiresSoon') : t('approval.expires', { minutes })}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}
