import { Eye, EyeOff, Plus, X } from 'lucide-react'
import type { QuoteExtra } from '@framezen/engine'
import { cn } from '../../../lib/cn'
import { fieldClass, IconButton, MoneyField } from '../../../ui'
import { newExtraId, QUOTE_LIMITS } from '../model/doc'
import { useEditor, useEditorState } from './context'

const PRESETS = ['Instalación', 'Transporte', 'Retiro de ventanas antiguas', 'Sellado perimetral', 'Visita técnica']

/** Extras de la obra (instalación, transporte…): se suman al neto, con o sin desglose. */
export function ExtrasEditor({ className }: { className?: string }) {
  const editor = useEditor()
  const extras = useEditorState((s) => s.doc.extras)

  const update = (index: number, patch: Partial<QuoteExtra>, label = 'Editar extras') => {
    const next = extras.map((e, i) => (i === index ? { ...e, ...patch } : e))
    editor.setExtras(next, label)
  }
  const add = (label: string) => {
    editor.setExtras([...extras, { id: newExtraId(), label, amount: 0 }], `Agregar extra: ${label || 'nuevo'}`)
    requestAnimationFrame(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('[data-extra-amount]')
      inputs[inputs.length - 1]?.focus()
    })
  }
  const used = new Set(extras.map((e) => e.label.trim().toLowerCase()))

  return (
    <div className={cn('space-y-2', className)}>
      {extras.length > 0 ? (
        <ul className="space-y-1.5">
          {extras.map((extra, index) => (
            <li key={extra.id} className="flex items-center gap-1.5">
              <input
                value={extra.label}
                onChange={(e) => update(index, { label: e.target.value })}
                placeholder="Concepto"
                maxLength={QUOTE_LIMITS.extraLabel}
                aria-label="Concepto del extra"
                list="fz-extra-presets"
                className={cn(fieldClass, "h-9 min-w-0 flex-1 px-2.5 text-[13px] touch:h-11 [&::-webkit-calendar-picker-indicator]:hidden")}
              />
              <MoneyField
                value={extra.amount}
                onChange={(amount) => update(index, { amount: amount ?? 0 })}
                aria-label={`Monto de ${extra.label || 'el extra'}`}
                data-extra-amount
                className="w-28"
                inputClassName="text-[13px]"
                allowNegative
              />
              <IconButton
                icon={extra.hidden ? EyeOff : Eye}
                size="sm"
                label={extra.hidden ? 'Va agrupado en «Servicios adicionales»' : 'Se muestra desglosado en el documento'}
                onClick={() => update(index, { hidden: !extra.hidden || undefined }, extra.hidden ? 'Mostrar extra en el documento' : 'Agrupar extra en el documento')}
              />
              <IconButton icon={X} size="sm" label="Quitar extra" onClick={() => editor.setExtras(extras.filter((_, i) => i !== index), `Quitar extra: ${extra.label || 'sin nombre'}`)} />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.filter((p) => !used.has(p.toLowerCase()))
          .slice(0, extras.length ? 3 : 5)
          .map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => add(preset)}
              className="inline-flex h-7 items-center gap-1 rounded-full border border-paper-200 bg-paper-0 pr-2.5 pl-2 text-[13px] text-paper-900 transition-colors duration-120 hover:border-paper-350/60 hover:bg-paper-100"
            >
              <Plus aria-hidden strokeWidth={2} className="size-3 text-paper-600" />
              {preset}
            </button>
          ))}
        <button
          type="button"
          onClick={() => add('')}
          className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[13px] font-medium text-ink-600 hover:bg-ink-50"
        >
          <Plus aria-hidden strokeWidth={2} className="size-3" />
          Otro
        </button>
      </div>
      <datalist id="fz-extra-presets">
        {PRESETS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </div>
  )
}
