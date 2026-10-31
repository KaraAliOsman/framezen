import { CircleDot, Copy, Download, Factory, Link2, MoreHorizontal, Send, Trash2 } from 'lucide-react'
import type { QuoteStatus } from '@framezen/shared'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  IconButton,
  QUOTE_STATUS_COPY,
} from '../../../ui'
import { useEditorState } from './context'
import { useQuoteActions } from './useQuoteActions'
import { useQuoteWorkOrder } from './useQuoteStage'

const MANUAL_STATUSES: QuoteStatus[] = ['draft', 'sent', 'accepted', 'rejected', 'workshop', 'installed', 'closed']

/** Menú «⋯» de la cotización: lo que no es diario, a mano pero sin estorbar. */
export function QuoteMenu({ align = 'end' }: { align?: 'start' | 'end' }) {
  const status = useEditorState((s) => s.meta.status)
  const hasLink = useEditorState((s) => !!s.meta.shareToken)
  const actions = useQuoteActions()
  const { order } = useQuoteWorkOrder()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton icon={MoreHorizontal} label="Más acciones" size="sm" tooltip={false} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-64">
        <DropdownMenuItem icon={Send} onSelect={actions.openSend}>
          Enviar al cliente
        </DropdownMenuItem>
        <DropdownMenuItem icon={Download} onSelect={() => void actions.downloadPdf()}>
          Descargar PDF
        </DropdownMenuItem>
        {hasLink ? (
          <DropdownMenuItem icon={Link2} onSelect={() => void actions.copyLink()}>
            Copiar enlace del cliente
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger icon={CircleDot}>Cambiar estado</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuRadioGroup value={status} onValueChange={(v) => void actions.setStatus(v as QuoteStatus)}>
              {MANUAL_STATUSES.map((s) => (
                <DropdownMenuRadioItem key={s} value={s}>
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden className={`size-1.5 rounded-full ${QUOTE_STATUS_COPY[s].dot === 'bg-paper-0/80' ? 'bg-ok-600' : QUOTE_STATUS_COPY[s].dot}`} />
                    {QUOTE_STATUS_COPY[s].label}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {order ? (
          <DropdownMenuItem icon={Factory} onSelect={() => actions.openWorkOrder(order)}>
            Ver OT N° {order.number}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem icon={Factory} onSelect={() => void actions.toWorkshop()}>
            Pasar a taller
          </DropdownMenuItem>
        )}
        <DropdownMenuItem icon={Copy} onSelect={() => void actions.duplicateQuote()}>
          Duplicar cotización
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem danger icon={Trash2} onSelect={() => void actions.trashQuote()}>
          Mover a la papelera
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
