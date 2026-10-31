import { useMemo, useState, type ReactElement } from 'react'
import { ArrowRight } from 'lucide-react'
import { formatCLP } from '@framezen/engine'
import { cn } from '../../../lib/cn'
import { formatNumber } from '../../../lib/format'
import { Button, NumberField, Popover, PopoverContent, PopoverTrigger, Switch } from '../../../ui'
import { bulkAdjust, type BulkAdjustResult, type PriceRow } from '../model/prices'

const PRESETS = [-5, 3, 5, 10]

/** Sube o baja en % todos los precios filtrados, con vista previa y deshacer. */
export function BulkAdjust({
  rows,
  disabled,
  trigger,
  onApply,
}: {
  rows: PriceRow[]
  disabled?: boolean
  trigger: ReactElement
  onApply: (result: BulkAdjustResult, pct: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [pct, setPct] = useState<number | null>(5)
  const [friendly, setFriendly] = useState(true)
  const value = pct ?? 0
  const result = useMemo(() => (open ? bulkAdjust(rows, value, { round: friendly ? 'friendly' : 'exact' }) : null), [open, rows, value, friendly])
  const sample = useMemo(() => rows.find((r) => r.price > 0), [rows])
  const sampleNext = sample && result ? result.change.overrides.find((o) => o.id === sample.id && o.colorId === sample.colorId)?.price : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(360px,calc(100vw-24px))] p-4">
        <div className="flex flex-col gap-3.5">
          <div>
            <h3 className="font-semibold text-paper-900">Ajustar {formatNumber(rows.length)} precios</h3>
            <p className="mt-0.5 text-[13px] leading-[18px] text-paper-600">Aplica a lo que ves con los filtros actuales. Puedes deshacerlo.</p>
          </div>
          <div className="flex items-center gap-2">
            <NumberField
              aria-label="Porcentaje"
              value={pct}
              onChange={setPct}
              unit="%"
              min={-90}
              max={500}
              step={1}
              bigStep={5}
              className="w-28"
              autoFocus
            />
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPct(p)}
                  className={cn(
                    'h-7 rounded-full border px-2.5 text-[13px] font-medium tabular transition-colors duration-120',
                    value === p ? 'border-ink-100 bg-ink-50 text-ink-700' : 'border-paper-200 text-paper-600 hover:text-paper-900',
                  )}
                >
                  {p > 0 ? `+${p}` : p} %
                </button>
              ))}
            </div>
          </div>
          <Switch
            size="sm"
            checked={friendly}
            onCheckedChange={setFriendly}
            label="Redondear"
            description="A $10 bajo $100.000 y a $100 sobre eso."
          />
          {result ? (
            <div className="rounded-md bg-paper-50 px-3 py-2.5 text-[13px] leading-[18px] text-paper-600">
              {result.changed ? (
                <>
                  <p>
                    {value > 0 ? 'Suben' : 'Bajan'} <strong className="font-medium text-paper-900">{formatNumber(result.changed)}</strong>{' '}
                    {result.changed === 1 ? 'precio' : 'precios'}
                    {result.skipped ? ` (${formatNumber(result.skipped)} sin precio quedan igual)` : ''}.
                  </p>
                  {sample && sampleNext !== undefined ? (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="truncate">{sample.code || sample.name}</span>
                      <span className="tabular">{formatCLP(sample.price)}</span>
                      <ArrowRight aria-hidden className="size-3.5" />
                      <strong className="font-medium text-paper-900 tabular">{formatCLP(sampleNext)}</strong>
                    </p>
                  ) : null}
                </>
              ) : (
                <p>{value === 0 ? 'Escribe un porcentaje para ver el efecto.' : 'Ningún precio cambia con este ajuste.'}</p>
              )}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!result?.changed}
              onClick={() => {
                if (!result?.changed) return
                onApply(result, value)
                setOpen(false)
              }}
            >
              Aplicar {value > 0 ? '+' : ''}
              {formatNumber(value, 1)} %
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
