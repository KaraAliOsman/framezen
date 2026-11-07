import { useMemo } from 'react'
import { Link } from 'react-router'
import type { Client, QuoteSummary } from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useFormat, useGlossary, useT } from '../../../lib/i18n'
import { Skeleton } from '../../../ui'
import es from '../i18n/es'
import { buildClientTimeline, type TimelineEvent } from '../model/timeline'

const DOT: Record<string, string> = {
  client_created: 'bg-accent',
  quote_created: 'bg-fg-faint',
  quote_sent: 'bg-info',
  quote_accepted: 'bg-ok-600',
  workshop: 'bg-warning-solid',
  installed: 'bg-ok-600',
  rejected: 'bg-danger',
  closed: 'bg-fg',
}

/** Historial del cliente: cada paso con fecha guardada, lo más nuevo arriba. */
export function ClientActivity({
  client,
  clientName,
  quotes,
  loading,
}: {
  client: Client
  clientName: string
  quotes: QuoteSummary[]
  loading: boolean
}) {
  const t = useT(es)
  const fmt = useFormat()
  const g = useGlossary()
  const events = useMemo(() => buildClientTimeline(client, quotes), [client, quotes])

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    )
  }

  const text = (e: TimelineEvent): string => {
    const number = e.quoteNumber !== undefined ? fmt.docNumber(e.quoteNumber) : ''
    switch (e.kind) {
      case 'client_created':
        return t('activity.created')
      case 'quote_created':
        return t('activity.quoteCreated', { number })
      case 'quote_sent':
        return t('activity.quoteSent', { number })
      case 'quote_accepted':
        return t('activity.quoteAccepted', { number })
      case 'quote_status':
        return t('activity.quoteNow', { number, status: g.quoteStatus(e.status ?? '') })
    }
  }

  return (
    <section aria-label={t('activity.listLabel', { name: clientName })} className="max-w-3xl">
      <ol className="relative">
        {events.map((e, i) => {
          const tone = e.kind === 'quote_status' ? DOT[e.status ?? ''] : DOT[e.kind]
          const body = (
            <>
              <span className="block text-base text-fg">{text(e)}</span>
              {e.quoteTitle || e.kind === 'quote_status' ? (
                <span className="block truncate text-table text-fg-muted">
                  {[e.quoteTitle, e.kind === 'quote_status' ? t('activity.quoteNowHint') : null].filter(Boolean).join(' · ')}
                </span>
              ) : null}
            </>
          )
          return (
            <li key={e.id} className="relative grid grid-cols-[16px_minmax(0,1fr)_auto] gap-x-3 pb-4 last:pb-0">
              {/* Riel vertical entre puntos. */}
              {i < events.length - 1 ? <span aria-hidden className="absolute top-4 bottom-0 left-[7px] w-px bg-divider" /> : null}
              <span aria-hidden className={cn('relative mt-1.5 size-2 justify-self-center rounded-full ring-4 ring-canvas', tone ?? 'bg-fg-faint')} />
              <div className="min-w-0">
                {e.quoteId ? (
                  <Link to={`/cotizaciones/${e.quoteId}`} className="block rounded-xs hover:underline">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </div>
              <time dateTime={e.at} title={fmt.date(e.at, 'long')} className="pt-0.5 text-table whitespace-nowrap text-fg-muted">
                {fmt.relative(e.at)}
              </time>
            </li>
          )
        })}
      </ol>
      {quotes.length === 0 ? <p className="mt-4 border-t border-divider pt-4 text-table text-fg-muted">{t('activity.empty')}</p> : null}
    </section>
  )
}
