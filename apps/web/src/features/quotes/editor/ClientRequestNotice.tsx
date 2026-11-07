/**
 * Lo que pidió el cliente desde el portal, completo y arriba del editor: se ajusta la cotización
 * leyendo el pedido, sin volver al correo ni a Inicio. «Responder por WhatsApp» abre el mensaje
 * listo y «Hecho» cierra el pedido con deshacer; reenviar la cotización también lo cierra.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, MessageCircle, MessageSquareText } from 'lucide-react'
import type { ActivityEvent, Paged } from '@dekopen/shared'
import { humanError, request, toItems } from '../../../lib/api'
import { useSession } from '../../../lib/auth'
import { cn } from '../../../lib/cn'
import { useFormat, useT } from '../../../lib/i18n'
import { qk } from '../../../lib/queryClient'
import { Button } from '../../../ui'
import es from '../i18n/es'
import { replyMessage, whatsappUrl } from '../lib/share'
import { useEditorShallow } from './context'
import { toast, toastUndo } from './toasts'
import { useMessageLocale } from './useQuoteStage'

type ClientRequest = ActivityEvent & { meta?: { message?: unknown; name?: unknown } }

const KIND = 'quote.changes_requested'

/** Pedidos sin atender de esta cotización (el mensaje completo viene en `meta.message`). */
function useClientRequests() {
  const queryClient = useQueryClient()
  const { id, revision } = useEditorShallow((s) => ({ id: s.meta.id, revision: s.meta.revision }))
  // La versión va en la clave: al reenviar el servidor los cierra y aquí se vuelven a leer.
  const queryKey = [...qk.activity, 'requests', id, revision]
  const query = useQuery({
    queryKey,
    queryFn: () => request<ClientRequest[] | Paged<ClientRequest>>('/activity', { query: { subjectId: id, kind: KIND, pending: 1, limit: 10 } }).then(toItems),
    enabled: revision > 0,
    staleTime: 30_000,
  })
  const setPending = (items: ClientRequest[], pending: boolean) => Promise.all(items.map((item) => request(`/activity/${encodeURIComponent(item.id)}`, { method: 'PATCH', body: { pending } })))
  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.activity })
  return {
    requests: query.data ?? [],
    /** Cierra los pedidos al tiro; el aviso ofrece deshacer. */
    resolve: (items: ClientRequest[], doneText: string) => {
      queryClient.setQueryData(queryKey, [])
      setPending(items, false).then(
        () => {
          refresh()
          toastUndo(doneText, () => {
            queryClient.setQueryData(queryKey, items)
            setPending(items, true).then(refresh, (error) => toast.error(humanError(error)))
          })
        },
        (error) => {
          queryClient.setQueryData(queryKey, items)
          toast.error(humanError(error))
        },
      )
    },
  }
}

export function ClientRequestNotice({ variant = 'bar', className }: { variant?: 'bar' | 'card'; className?: string }) {
  const t = useT(es)
  const fmt = useFormat()
  const session = useSession()
  const locale = useMessageLocale()
  const { requests, resolve } = useClientRequests()
  const { client, number, title } = useEditorShallow((s) => ({
    client: s.doc.clientId ? s.clients[s.doc.clientId] : undefined,
    number: s.meta.number,
    title: s.doc.title,
  }))
  const shown = requests.filter((item) => typeof item.meta?.message === 'string')
  if (!shown.length) return null

  const reply = whatsappUrl(replyMessage({ number, title, orgName: session.org.name, clientName: client?.name, clientRut: client?.rut, locale }), client?.phone)
  const name = (item: ClientRequest) => (typeof item.meta?.name === 'string' && item.meta.name) || item.actor || client?.name
  const card = variant === 'card'

  return (
    <section aria-label={t('request.aria')} className={cn('flex shrink-0 gap-3 bg-warning-bg text-fg', card ? 'flex-col rounded-sm p-3' : 'items-start py-3 pr-3 pl-5', className)}>
      <div className="flex min-w-0 flex-1 gap-3">
        <MessageSquareText aria-hidden strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className={cn('min-w-0 flex-1 space-y-2', !card && 'scrollbar-quiet max-h-28 overflow-y-auto')}>
          {shown.map((item) => {
            const who = name(item)
            return (
              <div key={item.id} className="max-w-[120ch] text-table">
                <p className="text-fg-muted">
                  <span className="font-medium text-fg-strong">{who ? t('request.title', { name: who }) : t('request.titleAnon')}</span> · {fmt.relative(item.at)}
                </p>
                <p className="mt-0.5 wrap-anywhere whitespace-pre-wrap text-fg">{String(item.meta?.message)}</p>
              </div>
            )
          })}
        </div>
      </div>
      <div className={cn('flex shrink-0 items-center gap-1', card && 'pl-7')}>
        <Button asChild size="sm" variant="secondary">
          <a href={reply} target="_blank" rel="noreferrer">
            <MessageCircle aria-hidden strokeWidth={1.75} />
            {t('request.reply')}
          </a>
        </Button>
        <Button size="sm" variant="ghost" icon={Check} onClick={() => resolve(shown, t('request.doneToast'))}>
          {t('request.done')}
        </Button>
      </div>
    </section>
  )
}
