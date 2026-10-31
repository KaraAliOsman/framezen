import { Link } from 'react-router'
import { Check, CircleCheckBig, MessageCircle, PenLine } from 'lucide-react'
import type { QuoteSummary } from '@framezen/shared'
import { humanError } from '../../lib/api'
import { useSession } from '../../lib/auth'
import { cn } from '../../lib/cn'
import { formatRelative } from '../../lib/format'
import { buttonClass, Skeleton, toast } from '../../ui'
import { useQuoteDetails, useResolveActivity, type ActivityItem } from './api'
import { followUpMessage, followUpText, portalLink, whatsappUrl } from './homeModel'

/**
 * Seguimientos sugeridos: lo que espera una acción tuya. Avisos pendientes (pidió cambios,
 * aceptó) y cotizaciones enviadas hace más de 3 días sin respuesta, con WhatsApp en un toque.
 */
export function FollowUps({ followUps, pending, loading }: { followUps: QuoteSummary[]; pending: ActivityItem[]; loading?: boolean }) {
  const me = useSession()
  const resolve = useResolveActivity()
  const shown = followUps.slice(0, 4)
  const details = useQuoteDetails(shown.map((q) => q.id))
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const total = pending.length + shown.length

  return (
    <section aria-labelledby="home-followups" className="rounded-lg border border-paper-200 bg-paper-0">
      <header className="flex items-center justify-between gap-3 border-b border-paper-200 px-5 py-3.5">
        <h2 id="home-followups" className="font-semibold text-paper-900">
          Seguimientos
        </h2>
        {total > 0 ? <span className="rounded-full bg-paper-100 px-2 text-meta font-medium leading-5 text-paper-600 tabular">{total}</span> : null}
      </header>
      {loading ? (
        <div className="space-y-3 px-5 py-4">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : total === 0 ? (
        <div className="flex items-start gap-3 px-5 py-5">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-ok-50 text-ok-600">
            <Check aria-hidden strokeWidth={2} className="size-4" />
          </span>
          <p className="text-[13px] leading-[19px] text-paper-600">
            <span className="block font-medium text-paper-900">Todo al día</span>
            Ninguna cotización espera respuesta hace más de 3 días. Cuando una se quede quieta, te avisamos aquí.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-paper-200">
          {pending.map((event) => {
            const changes = event.kind === 'quote.changes_requested'
            const Icon = changes ? PenLine : CircleCheckBig
            return (
              <li key={event.id} className="flex gap-3 px-5 py-3.5">
                <span
                  className={cn(
                    'mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full',
                    changes ? 'bg-warn-50 text-warn-600' : 'bg-ok-50 text-ok-600',
                  )}
                >
                  <Icon aria-hidden strokeWidth={1.75} className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-[19px] text-paper-900">{event.text}</p>
                  <p className="text-meta text-paper-600">{formatRelative(event.at)}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {event.link ? (
                      <Link to={event.link} className={buttonClass('secondary', 'sm')}>
                        {changes ? 'Ajustar cotización' : 'Abrir'}
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className={buttonClass('ghost', 'sm')}
                      onClick={() =>
                        resolve.mutate({ id: event.id, pending: false }, { onError: (error) => toast.error(humanError(error)) })
                      }
                    >
                      <Check aria-hidden strokeWidth={1.75} />
                      Listo
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
          {shown.map((q) => {
            const full = details.get(q.id)
            const phone = full?.client?.phone
            const text = followUpMessage({
              clientName: q.clientName,
              number: q.number,
              orgName: me.org.name,
              link: portalLink(origin, full?.shareToken),
            })
            return (
              <li key={q.id} className="flex gap-3 px-5 py-3.5">
                <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-50 text-ink-600">
                  <MessageCircle aria-hidden strokeWidth={1.75} className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-[19px] text-paper-900">{followUpText(q)}</p>
                  <p className="truncate text-meta text-paper-600">{q.title}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <a href={whatsappUrl(phone, text)} target="_blank" rel="noopener noreferrer" className={buttonClass('primary', 'sm')}>
                      <MessageCircle aria-hidden strokeWidth={1.75} />
                      WhatsApp
                    </a>
                    <Link to={`/cotizaciones/${q.id}`} className={buttonClass('ghost', 'sm')}>
                      Abrir
                    </Link>
                  </div>
                  {full && !phone ? <p className="mt-1.5 text-meta text-paper-600">Sin teléfono guardado: WhatsApp te pedirá elegir el contacto.</p> : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
