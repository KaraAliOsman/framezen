import { useMemo, useState, type ReactElement } from 'react'
import { ArrowRight } from 'lucide-react'
import type { Id } from '@dekopen/engine'
import { cn } from '../../../lib/cn'
import { useFormat, useT } from '../../../lib/i18n'
import { Button, NumberField, Popover, PopoverContent, PopoverTrigger, Switch } from '../../../ui'
import es from '../i18n/es'
import { bulkAdjust, overrideKey, type BulkAdjustResult, type PriceRow } from '../model/prices'

const PRESETS = [-5, 3, 5, 10]
/** Filas de muestra antes → después en la vista previa. */
const SAMPLES = 3

/** Sube o baja en % todos los precios filtrados, con vista previa (antes → después) y deshacer. */
export function BulkAdjust({
  rows,
  disabled,
  trigger,
  colorNames,
  onApply,
}: {
  rows: PriceRow[]
  disabled?: boolean
  trigger: ReactElement
  /** Nombres de los colores, para distinguir las filas de muestra de un mismo perfil. */
  colorNames?: ReadonlyMap<Id, string>
  onApply: (result: BulkAdjustResult, pct: number) => void
}) {
  const t = useT(es)
  const fmt = useFormat()
  const [open, setOpen] = useState(false)
  const [pct, setPct] = useState<number | null>(5)
  const [friendly, setFriendly] = useState(true)
  const value = pct ?? 0
  const result = useMemo(() => (open ? bulkAdjust(rows, value, { round: friendly ? 'friendly' : 'exact' }) : null), [open, rows, value, friendly])
  const samples = useMemo(() => {
    if (!result) return []
    const next = new Map(result.change.overrides.map((o) => [overrideKey(o), o.price]))
    return rows
      .filter((r) => next.has(overrideKey(r)))
      .slice(0, SAMPLES)
      .map((r) => ({ row: r, after: next.get(overrideKey(r))! }))
  }, [result, rows])
  const signed = (n: number) => fmt.pct(n).replace(/^(?=\d|%)/, n > 0 ? '+' : '')

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(380px,calc(100vw-24px))] p-4">
        <div className="flex flex-col gap-3.5">
          <div>
            <h3 className="text-h4 font-medium text-fg-strong">{t('bulk.title', { count: rows.length })}</h3>
            <p className="mt-1 text-table text-fg-muted">{t('bulk.help')}</p>
          </div>
          <div className="flex items-center gap-2">
            <NumberField aria-label={t('bulk.pct')} value={pct} onChange={setPct} unit="%" min={-90} max={500} step={1} bigStep={5} className="w-28" autoFocus />
            <div className="flex flex-wrap gap-1">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={value === p}
                  onClick={() => setPct(p)}
                  className={cn(
                    'h-8 rounded-sm px-2 text-table tabular transition-colors duration-100 ease-out touch:h-10',
                    value === p ? 'bg-accent-subtle font-medium text-accent-ink' : 'text-fg-muted hover:bg-hover hover:text-fg',
                  )}
                >
                  {p > 0 ? `+${p}` : p} %
                </button>
              ))}
            </div>
          </div>
          <Switch size="sm" checked={friendly} onCheckedChange={setFriendly} label={t('bulk.round')} description={t('bulk.roundHelp', { small: fmt.money(10), limit: fmt.money(100_000), big: fmt.money(100) })} />
          {result ? (
            <div className="rounded-sm bg-sunken px-3 py-2.5 text-table text-fg-muted">
              {result.changed ? (
                <>
                  <p>
                    {t.rich(value > 0 ? 'bulk.up' : 'bulk.down', { count: result.changed, b: <strong className="font-medium text-fg-strong tabular" /> })}
                    {result.skipped ? ` ${t('bulk.skipped', { count: result.skipped })}` : ''}
                  </p>
                  {samples.length ? (
                    <ul className="mt-2 flex flex-col gap-1 border-t border-divider pt-2" aria-label={t('bulk.sampleTitle')}>
                      {samples.map(({ row, after }) => (
                        <li key={row.key} className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate">
                            {row.code ? <span className="code-id text-meta">{row.code} </span> : null}
                            <span className="text-fg">{row.name}</span>
                            {row.colorId && colorNames?.get(row.colorId) ? <span> · {colorNames.get(row.colorId)}</span> : null}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5 tabular">
                            <span>{fmt.money(row.price)}</span>
                            <ArrowRight aria-hidden className="size-3.5 text-fg-faint" />
                            <strong className="font-medium text-fg-strong">{fmt.money(after)}</strong>
                          </span>
                        </li>
                      ))}
                      {result.changed > samples.length ? <li className="text-meta text-fg-faint">{t('bulk.andMore', { count: result.changed - samples.length })}</li> : null}
                    </ul>
                  ) : null}
                </>
              ) : (
                <p>{value === 0 ? t('bulk.typeHint') : t('bulk.noChange')}</p>
              )}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
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
              {t('bulk.apply', { pct: signed(value) })}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
