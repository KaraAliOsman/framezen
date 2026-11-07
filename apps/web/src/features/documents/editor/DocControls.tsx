/**
 * Personalización del documento en un solo panel: recetas de un clic y, debajo, cada decisión con su
 * control. Es el mismo panel en el editor de plantillas y en una cotización: recibe lo resuelto y emite
 * `DocOp`, las mismas que usa la IA, así que nada de lo que se ve aquí es exclusivo de la pantalla.
 */
import { useEffect, useId, useState, type ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import {
  DOC_TITLES,
  DRAWING_SIZES,
  ITEM_DRAWING_SIZES,
  ITEM_GROUPINGS,
  LAYOUT_RULES,
  LETTERHEAD_LAYOUTS,
  LOGO_SIZES,
  PRICE_LEVELS,
  PRICE_TAX_MODES,
  TERMS_PLACEMENTS,
  priceLevelOf,
  type DocOp,
  type DocSection,
  type ItemDisplay,
  type ItemsOptions,
  type ResolvedDocSettings,
} from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useT } from '../../../lib/i18n'
import { IconButton, Input, InspectorSection, NumberField, SegmentedControl, Select, Switch } from '../../../ui'
import { DOC_RECIPES, ITEM_FIELD_KEYS, activeRecipe, recipeOps } from '../model/recipes'
import es from '../i18n/es'

export interface DocControlsProps {
  settings: ResolvedDocSettings
  /** Secciones ya resueltas: de aquí sale la primera sección de ítems. */
  sections: readonly DocSection[]
  readOnly: boolean
  onOps: (ops: DocOp[], mergeKey?: string) => void
}

/** Recetas: el camino corto. En una cotización van a la vista; el resto queda a un clic. */
export function DocRecipes({ sections, readOnly, onOps, compact }: Pick<DocControlsProps, 'sections' | 'readOnly' | 'onOps'> & { compact?: boolean }) {
  const t = useT(es)
  const items = sections.find((s) => s.type === 'items')?.options as ItemsOptions | undefined
  if (!items) return null
  const recipe = activeRecipe(items)
  return (
    <div role="radiogroup" aria-label={t('doc.recipes')} className={compact ? 'grid grid-cols-2 gap-1.5' : 'flex flex-col gap-1.5'}>
      {DOC_RECIPES.map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={recipe === r}
          disabled={readOnly}
          title={compact ? t(`doc.recipe.${r}.hint`) : undefined}
          onClick={() => onOps(recipeOps(r))}
          className={cn(
            'rounded-sm border px-2.5 py-1.5 text-left transition-colors duration-100 disabled:cursor-not-allowed',
            recipe === r ? 'border-accent bg-accent-subtle shadow-[inset_0_0_0_1px_var(--dk-accent)]' : 'border-divider hover:border-divider-strong hover:bg-hover',
          )}
        >
          <span className="block text-table font-medium text-fg">{t(`doc.recipe.${r}.name`)}</span>
          {compact ? null : <span className="block text-meta text-fg-muted">{t(`doc.recipe.${r}.hint`)}</span>}
        </button>
      ))}
    </div>
  )
}

export function DocControls({ settings, sections, readOnly, onOps, recipes = true }: DocControlsProps & { recipes?: boolean }) {
  const t = useT(es)
  const items = sections.find((s) => s.type === 'items')?.options as ItemsOptions | undefined
  const set = (patch: Record<string, unknown>, mergeKey?: string) => onOps([{ op: 'setDocSettings', patch } as DocOp], mergeKey)
  const display = (patch: ItemDisplay, mergeKey?: string) => onOps([{ op: 'setItemDisplay', patch } as DocOp], mergeKey)

  return (
    <div>
      {items && recipes ? (
        <InspectorSection title={t('doc.recipes')}>
          <DocRecipes sections={sections} readOnly={readOnly} onOps={onOps} />
        </InspectorSection>
      ) : null}

      <InspectorSection title={t('doc.start')}>
        <div className="flex flex-col gap-3">
          <Row label={t('doc.docTitle')}>
            <Select size="sm" className="w-40" value={settings.docTitle} disabled={readOnly} onValueChange={(docTitle) => set({ docTitle, customTitle: null })} options={DOC_TITLES.map((v) => ({ value: v, label: t(`doc.titles.${v}`) }))} />
          </Row>
          <TextRow label={t('doc.customTitle')} placeholder={t('doc.customTitleHint')} value={settings.customTitle ?? ''} max={40} readOnly={readOnly} onChange={(v) => set({ customTitle: v.trim() ? v : null }, 'doc:title')} />
          <Choice label={t('doc.letterhead')} value={settings.letterhead} values={LETTERHEAD_LAYOUTS} text={(v) => t(`doc.letterheads.${v}`)} readOnly={readOnly} onChange={(letterhead) => set({ letterhead })} />
          <Choice label={t('doc.logoSize')} value={settings.logoSize} values={LOGO_SIZES} text={(v) => t(`doc.sizes.${v}`)} readOnly={readOnly} onChange={(logoSize) => set({ logoSize })} />
        </div>
      </InspectorSection>

      <InspectorSection title={t('doc.numbering')}>
        <div className="flex flex-col gap-3">
          <TextRow label={t('doc.numberPrefix')} placeholder="COT-" value={settings.numberPrefix ?? ''} max={12} readOnly={readOnly} onChange={(v) => set({ numberPrefix: v.trim() ? v : null }, 'doc:prefix')} />
          <Row label={t('doc.numberPad')}>
            <NumberField className="w-24" value={settings.numberPad} unit={null} min={0} max={6} step={1} bigStep={1} decimals={0} disabled={readOnly} onChange={(v) => v !== null && set({ numberPad: Math.min(6, Math.max(0, Math.round(v))) }, 'doc:pad')} />
          </Row>
          <Switch size="sm" checked={settings.showRevision} disabled={readOnly} onCheckedChange={(showRevision) => set({ showRevision })} label={t('doc.showRevision')} />
        </div>
      </InspectorSection>

      <InspectorSection title={t('doc.customFields')}>
        <CustomFields fields={settings.customFields} readOnly={readOnly} onChange={(customFields) => set({ customFields }, 'doc:fields')} />
      </InspectorSection>

      {items ? (
        <>
          <InspectorSection title={t('doc.prices')}>
            <div className="flex flex-col gap-3">
              <Row label={t('doc.priceLevel')}>
                <Select size="sm" className="w-44" value={priceLevelOf(items)} disabled={readOnly} onValueChange={(level) => onOps([{ op: 'setPriceLevel', level } as DocOp])} options={PRICE_LEVELS.map((v) => ({ value: v, label: t(`doc.priceLevels.${v}`) }))} />
              </Row>
              <Choice label={t('doc.priceTax')} value={items.priceTax} values={PRICE_TAX_MODES} text={(v) => t(`doc.priceTaxes.${v}`)} readOnly={readOnly} onChange={(priceTax) => display({ priceTax })} />
            </div>
          </InspectorSection>

          <InspectorSection title={t('doc.itemData')}>
            <div className="flex flex-col gap-3">
              <ItemFields items={items} readOnly={readOnly} onOps={onOps} />
              <DrawingSize items={items} readOnly={readOnly} onChange={(drawingSize) => display({ drawingSize })} />
              <Row label={t('doc.groupBy')}>
                <Select size="sm" className="w-44" value={items.groupBy} disabled={readOnly} onValueChange={(groupBy) => display({ groupBy })} options={ITEM_GROUPINGS.map((v) => ({ value: v, label: t(`values.groupBy.${v}`) }))} />
              </Row>
              {items.groupBy !== 'none' ? (
                <>
                  <Switch size="sm" checked={items.showGroupSubtotals} disabled={readOnly} onCheckedChange={(showGroupSubtotals) => display({ showGroupSubtotals })} label={t('options.showGroupSubtotals')} />
                  <Switch size="sm" checked={items.groupPageBreak} disabled={readOnly} onCheckedChange={(groupPageBreak) => display({ groupPageBreak })} label={t('options.groupPageBreak')} />
                </>
              ) : null}
            </div>
          </InspectorSection>
        </>
      ) : null}

      <InspectorSection title={t('doc.closing')}>
        <div className="flex flex-col gap-1.5">
          <span className="text-table text-fg-muted">{t('doc.termsPlacement')}</span>
          <Select size="sm" value={settings.termsPlacement} disabled={readOnly} onValueChange={(termsPlacement) => set({ termsPlacement })} options={TERMS_PLACEMENTS.map((v) => ({ value: v, label: t(`doc.termsPlacements.${v}`) }))} />
        </div>
      </InspectorSection>
    </div>
  )
}

/** Datos por ítem, uno a uno: aquí vuelve lo que se apagó desde la hoja. */
export function ItemFields({ items, readOnly, onOps }: { items: ItemsOptions; readOnly: boolean; onOps: DocControlsProps['onOps'] }) {
  const t = useT(es)
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('doc.itemData')}>
      {ITEM_FIELD_KEYS.map((key) => (
        <button
          key={key}
          type="button"
          aria-pressed={items[key]}
          disabled={readOnly}
          onClick={() => onOps([{ op: 'setItemDisplay', patch: { [key]: !items[key] } } as DocOp])}
          className={cn(
            'h-7 rounded-xs border px-2 text-table transition-colors duration-100 disabled:cursor-not-allowed',
            items[key] ? 'border-accent-line bg-accent-subtle text-accent-ink' : 'border-divider text-fg-muted hover:border-divider-strong hover:text-fg',
          )}
        >
          {t(`doc.fields.${key}`)}
        </button>
      ))}
    </div>
  )
}

function DrawingSize({ items, readOnly, onChange }: { items: ItemsOptions; readOnly: boolean; onChange: (size: ItemsOptions['drawingSize']) => void }) {
  const t = useT(es)
  const allowed = LAYOUT_RULES.items[items.variant].sizes?.[items.columns] ?? DRAWING_SIZES
  return (
    <Row label={t('options.drawingSize')}>
      <Select size="sm" className="w-44" value={items.drawingSize} disabled={readOnly} onValueChange={onChange} options={ITEM_DRAWING_SIZES.filter((v) => v === 'none' || (allowed as readonly string[]).includes(v)).map((v) => ({ value: v, label: t(`values.drawingSize.${v}`) }))} />
    </Row>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-table text-fg-muted">{label}</span>
      {children}
    </div>
  )
}

function Choice<T extends string>({ label, value, values, text, readOnly, onChange }: { label: string; value: T; values: readonly T[]; text: (v: T) => string; readOnly: boolean; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-table text-fg-muted">{label}</span>
      <SegmentedControl aria-label={label} size="sm" block value={value} onValueChange={(v) => !readOnly && onChange(v)} options={values.map((v) => ({ value: v, label: text(v), disabled: readOnly }))} />
    </div>
  )
}

function TextRow({ label, value, placeholder, max, readOnly, onChange }: { label: string; value: string; placeholder?: string; max: number; readOnly: boolean; onChange: (v: string) => void }) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="shrink-0 text-table text-fg-muted">
        {label}
      </label>
      <Input
        id={id}
        size="sm"
        className="w-40"
        value={draft}
        maxLength={max}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={(e) => {
          setDraft(e.target.value)
          onChange(e.target.value)
        }}
      />
    </div>
  )
}

const newFieldId = (taken: readonly string[]) => {
  for (let n = 1; n < 100; n++) if (!taken.includes(`campo-${n}`)) return `campo-${n}`
  return `campo-${Date.now().toString(36)}`
}

/** Datos propios del encabezado: aquí se nombran; el valor se escribe en cada cotización. */
function CustomFields({ fields, readOnly, onChange }: { fields: ResolvedDocSettings['customFields']; readOnly: boolean; onChange: (next: ResolvedDocSettings['customFields']) => void }) {
  const t = useT(es)
  return (
    <div className="flex flex-col gap-2">
      <p className="text-meta text-fg-muted">{t('doc.customFieldsHint')}</p>
      {fields.map((field, i) => (
        <div key={field.id} className="flex items-center gap-1.5">
          <Input
            size="sm"
            value={field.label}
            maxLength={40}
            readOnly={readOnly}
            aria-label={t('doc.customFieldName')}
            onChange={(e) => e.target.value.trim() && onChange(fields.map((f, j) => (j === i ? { ...f, label: e.target.value } : f)))}
          />
          <IconButton icon={X} size="sm" label={t('doc.customFieldRemove')} disabled={readOnly} onClick={() => onChange(fields.filter((_, j) => j !== i))} />
        </div>
      ))}
      {fields.length < 4 && !readOnly ? (
        <button
          type="button"
          onClick={() => onChange([...fields, { id: newFieldId(fields.map((f) => f.id)), label: t('doc.customFieldDefault') }])}
          className="inline-flex h-7 items-center gap-1 self-start rounded-sm px-2 text-table font-medium text-accent-ink transition-colors duration-100 hover:bg-accent-subtle"
        >
          <Plus aria-hidden strokeWidth={2} className="size-3" />
          {t('doc.customFieldAdd')}
        </button>
      ) : null}
    </div>
  )
}
