import { Eye, EyeOff, MoreHorizontal, Plus, X } from 'lucide-react'
import type { QuoteExtra } from '@dekopen/engine'
import { cn } from '../../../lib/cn'
import { useT } from '../../../lib/i18n'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger, fieldClass, IconButton, MoneyField } from '../../../ui'
import es from '../i18n/es'
import { newExtraId, QUOTE_LIMITS } from '../model/doc'
import { ql, type UndoLabel } from '../model/history'
import { useEditor, useEditorState } from './context'

/** Conceptos frecuentes (el texto sale del idioma de la interfaz y se guarda tal cual en la cotización). */
const PRESET_KEYS = ['installation', 'transport', 'removal', 'sealing', 'visit'] as const

/** Extras de la obra (instalación, transporte…): se suman al neto, con o sin desglose. */
export function ExtrasEditor({ className }: { className?: string }) {
  const t = useT(es)
  const editor = useEditor()
  const extras = useEditorState((s) => s.doc.extras)
  const presets = PRESET_KEYS.map((key) => t(`extras.presets.${key}`))

  const update = (index: number, patch: Partial<QuoteExtra>, label: UndoLabel = ql('history.extrasEdit')) => {
    const next = extras.map((e, i) => (i === index ? { ...e, ...patch } : e))
    editor.setExtras(next, label)
  }
  const add = (label: string) => {
    editor.setExtras([...extras, { id: newExtraId(), label, amount: 0 }], label ? ql('history.extraAdd', { name: label }) : ql('history.extraAddNew'))
    requestAnimationFrame(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('[data-extra-amount]')
      inputs[inputs.length - 1]?.focus()
    })
  }
  const used = new Set(extras.map((e) => e.label.trim().toLocaleLowerCase(t.locale)))

  return (
    <div className={cn('space-y-2', className)}>
      {extras.length > 0 ? (
        <ul className="space-y-1.5">
          {extras.map((extra, index) => (
            <li key={extra.id} className="flex flex-wrap items-center gap-1.5">
              <input
                value={extra.label}
                onChange={(e) => update(index, { label: e.target.value })}
                placeholder={t('extras.concept')}
                maxLength={QUOTE_LIMITS.extraLabel}
                aria-label={t('extras.conceptAria')}
                list="fz-extra-presets"
                className={cn(fieldClass, 'h-9 min-w-0 flex-1 px-2.5 text-table touch:h-11 [&::-webkit-calendar-picker-indicator]:hidden')}
              />
              <MoneyField
                value={extra.amount}
                onChange={(amount) => update(index, { amount: amount ?? 0 })}
                aria-label={t('extras.amountAria', { name: extra.label || t('extras.theExtra') })}
                data-extra-amount
                className="w-28"
                inputClassName="text-table"
                allowNegative
              />
              <IconButton
                icon={extra.hidden ? EyeOff : Eye}
                size="sm"
                label={extra.hidden ? t('extras.grouped') : t('extras.shown')}
                aria-pressed={!extra.hidden}
                onClick={() => update(index, { hidden: !extra.hidden || undefined }, extra.hidden ? ql('history.extraShow') : ql('history.extraGroup'))}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton icon={MoreHorizontal} size="sm" label={t('extras.more', { name: extra.label || t('extras.theExtra') })} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuCheckboxItem checked={Boolean(extra.line)} onCheckedChange={(on) => update(index, { line: on || undefined }, ql('history.extraLine'))}>
                    {t('extras.asLine')}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={extra.role === 'optional'} onCheckedChange={(on) => update(index, on ? { role: 'optional' } : { role: undefined, included: undefined }, ql('history.extraOptional'))}>
                    {t('extras.optional')}
                  </DropdownMenuCheckboxItem>
                  {extra.role === 'optional' ? (
                    <DropdownMenuCheckboxItem checked={Boolean(extra.included)} onCheckedChange={(on) => update(index, { included: on || undefined }, ql('history.extraOptional'))}>
                      {t('extras.includedNow')}
                    </DropdownMenuCheckboxItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
              <IconButton
                icon={X}
                size="sm"
                label={t('extras.remove')}
                onClick={() =>
                  editor.setExtras(
                    extras.filter((_, i) => i !== index),
                    extra.label ? ql('history.extraRemove', { name: extra.label }) : ql('history.extraRemoveUnnamed'),
                  )
                }
              />
              {extra.line || extra.role ? (
                <input
                  value={extra.description ?? ''}
                  onChange={(e) => update(index, { description: e.target.value })}
                  placeholder={t('extras.description')}
                  maxLength={QUOTE_LIMITS.extraDescription}
                  aria-label={t('extras.description')}
                  className={cn(fieldClass, 'h-8 w-full px-2.5 text-table touch:h-11')}
                />
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {presets
          .filter((p) => !used.has(p.toLocaleLowerCase(t.locale)))
          .slice(0, extras.length ? 3 : 5)
          .map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => add(preset)}
              className="inline-flex h-7 items-center gap-1 rounded-sm border border-divider bg-surface pr-2.5 pl-2 text-table text-fg transition-colors duration-100 hover:border-divider-strong hover:bg-hover touch:h-9"
            >
              <Plus aria-hidden strokeWidth={2} className="size-3 text-fg-muted" />
              {preset}
            </button>
          ))}
        <button
          type="button"
          onClick={() => add('')}
          className="inline-flex h-7 items-center gap-1 rounded-sm px-2 text-table font-medium text-accent-ink transition-colors duration-100 hover:bg-accent-subtle touch:h-9"
        >
          <Plus aria-hidden strokeWidth={2} className="size-3" />
          {t('extras.other')}
        </button>
      </div>
      <datalist id="fz-extra-presets">
        {presets.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </div>
  )
}
