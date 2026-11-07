import { Banknote, CircleDot, Copy, Download, Factory, Link2, MoreHorizontal, Send, Trash2 } from 'lucide-react'
import type { QuoteStatus } from '@dekopen/shared'
import { useGlossary, useT } from '../../../lib/i18n'
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
import es from '../i18n/es'
import { useEditorState } from './context'
import { IconCutBars } from '../../../ui/icons'
import { useQuoteActions } from './useQuoteActions'
import { useQuoteWorkOrder } from './useQuoteStage'

const MANUAL_STATUSES: QuoteStatus[] = ['draft', 'sent', 'accepted', 'rejected', 'workshop', 'installed', 'closed']

/** Menú «⋯» de la cotización: lo que no es diario, a mano pero sin estorbar. */
export function QuoteMenu({ align = 'end' }: { align?: 'start' | 'end' }) {
  const t = useT(es)
  const g = useGlossary()
  const status = useEditorState((s) => s.meta.status)
  const hasLink = useEditorState((s) => !!s.meta.shareToken)
  const wasSent = useEditorState((s) => s.meta.revision > 0)
  const hasWindows = useEditorState((s) => s.doc.items.length > 0)
  const actions = useQuoteActions()
  const { order } = useQuoteWorkOrder()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton icon={MoreHorizontal} label={t('menu.more')} size="sm" tooltip={false} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-64">
        <DropdownMenuItem icon={Send} onSelect={actions.openSend}>
          {t('menu.send')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={Download} onSelect={() => void actions.downloadPdf()}>
          {t('menu.pdf')}
        </DropdownMenuItem>
        {hasLink ? (
          <DropdownMenuItem icon={Link2} onSelect={() => void actions.copyLink()}>
            {t('menu.copyLink')}
          </DropdownMenuItem>
        ) : null}
        {wasSent ? (
          <DropdownMenuItem icon={Banknote} onSelect={actions.openDeposit}>
            {t('menu.deposit')}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger icon={CircleDot}>{t('menu.status')}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuRadioGroup value={status} onValueChange={(v) => void actions.setStatus(v as QuoteStatus)}>
              {MANUAL_STATUSES.map((s) => (
                <DropdownMenuRadioItem key={s} value={s}>
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden className={`size-1.5 rounded-full ${QUOTE_STATUS_COPY[s].dot}`} />
                    {g.quoteStatus(s)}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {hasWindows ? (
          <DropdownMenuItem icon={IconCutBars} onSelect={() => void actions.openCuts(order)}>
            {t('stage.viewCuts')}
          </DropdownMenuItem>
        ) : null}
        {order ? (
          <DropdownMenuItem icon={Factory} onSelect={() => actions.openWorkOrder(order)}>
            {t('menu.viewOrder', { number: order.number })}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem icon={Factory} onSelect={() => void actions.toWorkshop()}>
            {t('menu.toWorkshop')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem icon={Copy} onSelect={actions.openDuplicate}>
          {t('menu.duplicate')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem danger icon={Trash2} onSelect={() => void actions.trashQuote()}>
          {t('menu.trash')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
