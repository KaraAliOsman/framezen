/**
 * Pie fijo: Neto · Descuento · Extras · IVA · Total (destello y cifras que ruedan), m², unidades
 * y margen real (solo si tu rol ve costos), con las acciones principales.
 */
import type { ReactNode } from 'react'
import { ChevronDown, Factory, Send } from 'lucide-react'
import { formatArea, formatCLP, formatPct } from '@framezen/engine'
import { useSession } from '../../../lib/auth'
import { cn } from '../../../lib/cn'
import { formatNumber } from '../../../lib/format'
import { AnimatedNumber, Button, Flash, Popover, PopoverContent, PopoverTrigger } from '../../../ui'
import { MeasureField } from '../../designer/parts/MeasureField'
import { useEditor, useEditorShallow } from './context'
import { ExtrasEditor } from './ExtrasEditor'
import { useQuoteActions } from './useQuoteActions'
import { IN_WORKSHOP, useQuoteWorkOrder } from './useQuoteStage'

function Figure({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col justify-center', className)}>
      <span className="text-meta whitespace-nowrap text-paper-600">{label}</span>
      <span className="text-base font-medium whitespace-nowrap tabular text-paper-900">{children}</span>
    </div>
  )
}

export function useTotals() {
  return useEditorShallow((s) => ({ totals: s.evaluation.totals, pricing: s.evaluation.pricing, discountPct: s.doc.discountPct, extrasCount: s.doc.extras.length }))
}

export function DiscountInput({ className }: { className?: string }) {
  const editor = useEditor()
  const discountPct = useEditorShallow((s) => ({ d: s.doc.discountPct })).d
  return (
    <MeasureField
      value={discountPct}
      onChange={(v) => editor.setDiscount(v ?? 0)}
      unit="%"
      min={0}
      max={100}
      step={1}
      bigStep={5}
      decimals={1}
      aria-label="Descuento en porcentaje"
      className={cn('w-[72px]', className)}
      inputClassName="h-7 text-[13px] pr-6"
    />
  )
}

export function TotalsFooter({ className }: { className?: string }) {
  const session = useSession()
  const { totals, pricing, extrasCount } = useTotals()
  const canSeeCosts = session.role === 'owner'

  return (
    <footer aria-label="Totales" className={cn('flex h-16 shrink-0 items-center gap-5 border-t border-paper-200 bg-paper-0 px-4 xl:gap-6', className)}>
      <Figure label="Neto ventanas">
        <AnimatedNumber value={totals.subtotal} format={formatCLP} />
      </Figure>
      <div className="flex min-w-0 flex-col justify-center">
        <span className="text-meta text-paper-600">Descuento</span>
        <div className="flex items-center gap-2">
          <DiscountInput />
          {totals.discount > 0 ? <span className="text-[13px] tabular text-paper-600">−{formatCLP(totals.discount).replace('$', '$')}</span> : null}
        </div>
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="-mx-1.5 flex flex-col rounded-sm px-1.5 py-1 text-left transition-colors duration-120 hover:bg-paper-100">
            <span className="inline-flex items-center gap-1 text-meta text-paper-600">
              Extras{extrasCount ? ` (${extrasCount})` : ''}
              <ChevronDown aria-hidden strokeWidth={2} className="size-3" />
            </span>
            <span className="text-base font-medium tabular text-paper-900">{totals.extras ? <AnimatedNumber value={totals.extras} format={formatCLP} /> : 'Agregar'}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[420px]" align="start">
          <h3 className="mb-1 text-[13px] font-semibold">Extras de la obra</h3>
          <p className="mb-3 text-meta text-paper-600">Instalación, transporte o retiro: se suman al neto y pagan IVA.</p>
          <ExtrasEditor />
        </PopoverContent>
      </Popover>
      <Figure label={`IVA ${formatPct(pricing.ivaPct)}`} className="max-xl:hidden">
        <AnimatedNumber value={totals.iva} format={formatCLP} />
      </Figure>
      <span aria-hidden className="h-8 w-px bg-paper-200" />
      <div className="flex min-w-0 flex-col justify-center">
        <span className="text-meta text-paper-600">Total con IVA</span>
        <Flash trigger={totals.total} className="-mx-1 px-1">
          <span className="text-h3 leading-7 font-semibold tracking-[-0.01em] tabular text-paper-900" aria-live="polite">
            <AnimatedNumber value={totals.total} format={formatCLP} />
          </span>
        </Flash>
      </div>
      <div className="flex min-w-0 flex-col justify-center text-meta tabular text-paper-600 max-lg:hidden">
        <span className="whitespace-nowrap">
          {formatNumber(totals.units)} {totals.units === 1 ? 'unidad' : 'unidades'} · {formatArea(totals.area)}
        </span>
        {canSeeCosts && totals.subtotal > 0 ? (
          <span className={cn('whitespace-nowrap', totals.marginPct < 15 ? 'text-warn-600' : '')} title="Margen real sobre las ventanas, después del descuento">
            Margen real {formatPct(totals.marginPct)}
          </span>
        ) : null}
      </div>
      <StageActions />
    </footer>
  )
}

/**
 * Acciones según la etapa: vendiendo, el primario es «Enviar al cliente»; aceptada, «Pasar a
 * taller»; con OT, «Ver OT N° X». La acción que ya no es la principal queda como secundaria (y
 * siempre en el menú ⋯).
 */
function StageActions() {
  const actions = useQuoteActions()
  const { order, status } = useQuoteWorkOrder()
  const send = (primary: boolean) => (
    <Button variant={primary ? 'primary' : 'secondary'} icon={Send} onClick={actions.openSend} className={primary ? undefined : 'max-xl:hidden'}>
      Enviar al cliente
    </Button>
  )
  if (order) {
    return (
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {send(false)}
        <Button variant="primary" icon={Factory} onClick={() => actions.openWorkOrder(order)}>
          Ver OT N° {order.number}
        </Button>
      </div>
    )
  }
  const workshopFirst = status === 'accepted' || IN_WORKSHOP.includes(status)
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2">
      {workshopFirst ? send(false) : null}
      <Button
        variant={workshopFirst ? 'primary' : 'secondary'}
        icon={Factory}
        onClick={() => void actions.toWorkshop()}
        loading={actions.busy === 'workshop'}
        className={workshopFirst ? undefined : 'max-xl:hidden'}
      >
        Pasar a taller
      </Button>
      {workshopFirst ? null : send(true)}
    </div>
  )
}
