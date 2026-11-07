/**
 * Cabecera de la cotización en la barra superior de la app (ver `Editor`): volver, nombre de la obra en el lugar, cliente,
 * N° · versión, estado, guardado y la **única acción principal** de la etapa: «Enviar al cliente»
 * mientras se vende, «Pasar a taller» al aceptarla y «Ver OT» cuando ya está en taller. Lo demás
 * vive en ⋯.
 */
import { Link } from 'react-router'
import { ArrowUpRight, ChevronLeft, Factory, Send } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { revisionLetter } from '../../../lib/format'
import { useT } from '../../../lib/i18n'
import { Button, StatusPill } from '../../../ui'
import es from '../i18n/es'
import { EditorSaveIndicator } from './CenterStage'
import { useEditorShallow } from './context'
import { ClientField, TitleField } from './fields'
import { QuoteMenu } from './QuoteMenu'
import { useQuoteActions } from './useQuoteActions'
import { IN_WORKSHOP, useQuoteWorkOrder } from './useQuoteStage'

export function EditorHeader({ className }: { className?: string }) {
  const t = useT(es)
  const { number, status, revision } = useEditorShallow((s) => ({ number: s.meta.number, status: s.meta.status, revision: s.meta.revision }))
  const letter = revisionLetter(revision)
  const { order } = useQuoteWorkOrder()

  return (
    <header data-quote-header="" aria-label={t('header.aria')} className={cn('@container flex h-12 min-w-0 flex-1 items-center gap-2', className)}>
      <Link
        to="/cotizaciones"
        aria-label={t('header.backAria')}
        className="-ml-1 inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-fg-muted transition-colors duration-100 hover:bg-hover hover:text-fg-strong"
      >
        <ChevronLeft aria-hidden strokeWidth={1.75} className="size-5" />
      </Link>

      <div className="flex min-w-0 flex-1 items-center gap-1">
        <TitleField className="w-[min(420px,30vw)] max-w-[420px] min-w-[140px] shrink supports-[field-sizing:content]:w-auto supports-[field-sizing:content]:[field-sizing:content]" />
        <ClientField variant="inline" className="max-w-56 min-w-0 shrink-[10] xl:max-w-64 @max-[640px]:hidden" />
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {/* Con la hoja angosta (asistente abierto) se esconde primero lo secundario. */}
        <span className="code-id text-table whitespace-nowrap text-fg-muted @max-[760px]:hidden">{t('header.number', { number })}</span>
        <StatusPill status={status} suffix={letter ? t('header.version', { letter }) : undefined} />
        {order ? <WorkOrderLink order={order} /> : null}
        <EditorSaveIndicator className="@max-[620px]:hidden" />
      </div>

      <QuoteMenu />
      <StageActions />
    </header>
  )
}

/**
 * Acciones según la etapa: vendiendo, el primario es «Enviar al cliente»; aceptada, «Pasar a
 * taller»; con OT, «Ver OT N° X». La acción que ya no es la principal queda como secundaria (y
 * siempre en el menú ⋯). Sin ventanas, el primario es agregar la primera (en la columna).
 */
export function StageActions({ className }: { className?: string }) {
  const t = useT(es)
  const actions = useQuoteActions()
  const { order, status } = useQuoteWorkOrder()
  const empty = useEditorShallow((s) => ({ empty: s.doc.items.length === 0 })).empty
  const send = (primary: boolean) => (
    <Button variant={primary ? 'primary' : 'secondary'} icon={Send} onClick={actions.openSend} className={primary ? undefined : 'max-2xl:hidden'}>
      {t('header.send')}
    </Button>
  )
  if (order) {
    return (
      <div className={cn('flex shrink-0 items-center gap-2', className)}>
        {send(false)}
        <Button variant="primary" icon={Factory} onClick={() => actions.openWorkOrder(order)}>
          {t('header.viewOrder', { number: order.number })}
        </Button>
      </div>
    )
  }
  const workshopFirst = status === 'accepted' || IN_WORKSHOP.includes(status)
  return (
    <div className={cn('flex shrink-0 items-center gap-2', className)}>
      {workshopFirst ? send(false) : null}
      {workshopFirst ? (
        <Button variant="primary" icon={Factory} onClick={() => void actions.toWorkshop()} loading={actions.busy === 'workshop'}>
          {t('header.toWorkshop')}
        </Button>
      ) : (
        <Button variant={empty ? 'secondary' : 'primary'} icon={Send} onClick={actions.openSend}>
          {t('header.send')}
        </Button>
      )}
    </div>
  )
}

/** Enlace a la OT de esta cotización («OT N° 38 ↗»). */
export function WorkOrderLink({ order, className }: { order: { id: string; number: number }; className?: string }) {
  const t = useT(es)
  return (
    <Link
      to={`/taller/${order.id}`}
      className={cn(
        'inline-flex h-6 items-center gap-0.5 rounded-xs px-1 text-table font-medium whitespace-nowrap tabular text-accent-ink transition-colors duration-100 hover:bg-accent-subtle',
        className,
      )}
    >
      {t('header.workOrder', { number: order.number })}
      <ArrowUpRight aria-hidden strokeWidth={1.75} className="size-3.5" />
    </Link>
  )
}
