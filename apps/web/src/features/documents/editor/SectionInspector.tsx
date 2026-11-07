/**
 * Inspector de la sección elegida: título propio, diseño (variante), opciones derivadas del esquema
 * compartido, fondo, salto de página y visibilidad. Cada control emite una DocOp (una entrada de
 * deshacer); la escritura se agrupa por campo.
 */
import { useEffect, useId, useState, type ReactNode } from 'react'
import { Copy, PenLine, RotateCcw, Trash2 } from 'lucide-react'
import {
  SECTION_DEFAULT_OPTIONS,
  SECTION_META,
  sectionLabel,
  toneLabel,
  variantLabel,
  type DocOp,
  type DocSection,
  type DocTemplate,
  type RichText,
} from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useLocale, useT } from '../../../lib/i18n'
import { Button, Input, InspectorHeader, InspectorSection, Notice, NumberField, SegmentedControl, Select, Switch } from '../../../ui'
import { sectionFields, sectionVariants, type SectionField } from '../model/sectionForm'
import es from '../i18n/es'
import { ImageField, ImagesField, type GalleryImageValue } from './ImageField'
import { RichTextField } from './RichTextField'
import { SECTION_ICONS, isRequired } from './SectionsPanel'

/** Secciones cuyo texto viene de los textos comerciales de la empresa. */
const ORG_TEXT_SECTIONS = new Set(['letter', 'terms', 'payment', 'warranty', 'acceptance'])

export interface SectionInspectorProps {
  template: DocTemplate
  section: DocSection
  readOnly: boolean
  onOps: (ops: DocOp[], mergeKey?: string) => void
  onEditTexts?: () => void
  /** Una cotización no borra ni duplica lo de su plantilla: vuelve a ella. */
  scope?: 'template' | 'quote'
}

/** ¿La sección tiene algo que ajustar más allá de moverla u ocultarla? */
export const isOptionField = (section: DocSection) => section.type !== 'page_break'

export function SectionInspector({ template, section, readOnly, onOps, onEditTexts, scope = 'template' }: SectionInspectorProps) {
  const t = useT(es)
  const { locale } = useLocale()
  const meta = SECTION_META[section.type]
  const Icon = SECTION_ICONS[section.type]
  const required = isRequired(template, section)
  const variants = sectionVariants(section.type)
  const variant = (section.options as { variant?: string }).variant
  const fields = sectionFields(section)
  const setOption = (key: string, value: unknown, merge = false) =>
    onOps([{ op: 'updateSectionOptions', sectionId: section.id, options: { [key]: value } }], merge ? `opt:${section.id}:${key}` : undefined)
  const patch = (p: Record<string, unknown>, mergeKey?: string) => onOps([{ op: 'updateSection', sectionId: section.id, patch: p } as DocOp], mergeKey)

  const reset = () => {
    if (scope === 'quote') {
      onOps([{ op: 'resetSection', sectionId: section.id }])
      return
    }
    const defaults = SECTION_DEFAULT_OPTIONS[section.type] as Record<string, unknown>
    const ops: DocOp[] = [{ op: 'updateSectionOptions', sectionId: section.id, options: { ...defaults } }]
    if (section.title !== undefined) ops.push({ op: 'updateSection', sectionId: section.id, patch: { title: null } })
    onOps(ops)
  }

  return (
    <div>
      <InspectorHeader
        media={
          <span className="flex size-9 items-center justify-center rounded-sm border border-divider bg-sunken text-fg-muted">
            <Icon aria-hidden className="size-4" strokeWidth={1.75} />
          </span>
        }
        title={section.title?.trim() || sectionLabel(section.type, locale)}
        description={t(`sections.describe.${section.type}`)}
      />

      {required ? (
        <div className="px-4 pt-3">
          <Notice tone="neutral" size="compact">
            {t('inspector.requiredNote')}
          </Notice>
        </div>
      ) : null}

      {variants.length > 1 ? (
        <InspectorSection title={t('inspector.variant')}>
          <div role="radiogroup" aria-label={t('inspector.variant')} className="grid grid-cols-2 gap-1.5">
            {variants.map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={variant === v}
                disabled={readOnly}
                onClick={() => setOption('variant', v)}
                className={cn(
                  'h-9 truncate rounded-sm border px-2.5 text-left text-table transition-colors duration-100 disabled:cursor-not-allowed',
                  variant === v ? 'border-accent bg-accent-subtle font-medium text-accent-ink shadow-[inset_0_0_0_1px_var(--dk-accent)]' : 'border-divider text-fg hover:border-divider-strong hover:bg-hover',
                )}
              >
                {variantLabel(v, locale)}
              </button>
            ))}
          </div>
        </InspectorSection>
      ) : null}

      {fields.length ? (
        <InspectorSection title={t('inspector.options')}>
          <div className="flex flex-col gap-3.5">
            {fields.map((field) => (
              <FieldControl key={field.key} field={field} section={section} template={template} readOnly={readOnly} onChange={setOption} />
            ))}
          </div>
        </InspectorSection>
      ) : null}

      {ORG_TEXT_SECTIONS.has(section.type) && onEditTexts ? (
        <InspectorSection title={t('inspector.textsTitle')}>
          <p className="mb-2.5 text-table text-fg-muted">{t('inspector.textsBody')}</p>
          <Button size="sm" variant="secondary" icon={PenLine} onClick={onEditTexts}>
            {t('inspector.editTexts')}
          </Button>
        </InspectorSection>
      ) : null}

      <InspectorSection title={t('inspector.show')}>
        <div className="flex flex-col gap-3.5">
          {meta.allowsTitle ? (
            <TitleField
              value={section.title ?? ''}
              placeholder={sectionLabel(section.type, locale)}
              readOnly={readOnly}
              onChange={(title) => patch({ title: title.trim() ? title : null }, `title:${section.id}`)}
            />
          ) : null}
          {meta.tones.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-table text-fg-muted">{t('inspector.tone')}</span>
              <SegmentedControl
                aria-label={t('inspector.tone')}
                size="sm"
                block
                value={section.tone}
                onValueChange={(tone) => !readOnly && patch({ tone })}
                options={meta.tones.map((tone) => ({ value: tone, label: toneLabel(tone, locale), disabled: readOnly }))}
              />
            </div>
          ) : null}
          {section.type !== 'cover' && section.type !== 'page_break' ? (
            <Switch size="sm" checked={section.pageBreak === 'before'} disabled={readOnly} onCheckedChange={(on) => patch({ pageBreak: on ? 'before' : 'auto' })} label={t('inspector.pageBreak')} />
          ) : null}
          <Switch size="sm" checked={section.enabled} disabled={readOnly || required} onCheckedChange={(enabled) => onOps([{ op: 'toggleSection', sectionId: section.id, enabled }])} label={t('inspector.visible')} />
        </div>
      </InspectorSection>

      {!readOnly ? (
        <div className="flex flex-wrap gap-1.5 px-4 py-3">
          <Button size="sm" variant="ghost" icon={RotateCcw} onClick={reset}>
            {t('inspector.reset')}
          </Button>
          {scope === 'template' ? (
            <>
              <Button size="sm" variant="ghost" icon={Copy} disabled={template.sections.filter((s) => s.type === section.type).length >= meta.max} onClick={() => onOps([{ op: 'duplicateSection', sectionId: section.id }])}>
                {t('inspector.duplicate')}
              </Button>
              <Button size="sm" variant="ghost" icon={Trash2} disabled={required} onClick={() => onOps([{ op: 'removeSection', sectionId: section.id }])} className="text-danger hover:text-danger">
                {t('inspector.remove')}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function TitleField({ value, placeholder, readOnly, onChange }: { value: string; placeholder: string; readOnly: boolean; onChange: (v: string) => void }) {
  const t = useT(es)
  const id = useId()
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-table text-fg-muted">
        {t('inspector.sectionTitle')}
      </label>
      <Input
        id={id}
        size="sm"
        value={draft}
        placeholder={placeholder}
        readOnly={readOnly}
        maxLength={80}
        onChange={(e) => {
          setDraft(e.target.value)
          onChange(e.target.value)
        }}
      />
      <p className="text-meta text-fg-muted">{t('inspector.titleHint')}</p>
    </div>
  )
}

function Labelled({ label, children, inline }: { label: string; children: ReactNode; inline?: boolean }) {
  return inline ? (
    <div className="flex items-center justify-between gap-3">
      <span className="text-table text-fg-muted">{label}</span>
      {children}
    </div>
  ) : (
    <div className="flex flex-col gap-1.5">
      <span className="text-table text-fg-muted">{label}</span>
      {children}
    </div>
  )
}

function FieldControl({
  field,
  section,
  template,
  readOnly,
  onChange,
}: {
  field: SectionField
  section: DocSection
  template: DocTemplate
  readOnly: boolean
  onChange: (key: string, value: unknown, merge?: boolean) => void
}) {
  const t = useT(es)
  const value = (section.options as Record<string, unknown>)[field.key]
  const label = optionLabel(t, field.key)
  switch (field.kind) {
    case 'switch':
      return <Switch size="sm" checked={Boolean(value)} disabled={readOnly} onCheckedChange={(v) => onChange(field.key, v)} label={label} />
    case 'choice': {
      const opts = field.values.map((v) => ({ value: v, label: valueLabel(t, field.key, v), disabled: readOnly || field.disabled?.includes(v) }))
      if (opts.length <= 3 && opts.every((o) => o.label.length <= 12)) {
        return (
          <Labelled label={label}>
            <SegmentedControl aria-label={label} size="sm" block value={String(value)} onValueChange={(v) => !readOnly && onChange(field.key, v)} options={opts} />
          </Labelled>
        )
      }
      return (
        <Labelled label={label} inline>
          <Select size="sm" className="w-44" value={String(value)} disabled={readOnly} onValueChange={(v) => onChange(field.key, v)} options={opts.map((o) => ({ ...o, description: o.disabled && !readOnly ? t('values.notForVariant') : undefined }))} />
        </Labelled>
      )
    }
    case 'number-choice':
      return (
        <Labelled label={label}>
          <SegmentedControl
            aria-label={label}
            size="sm"
            block
            value={String(value)}
            onValueChange={(v) => !readOnly && onChange(field.key, Number(v))}
            options={field.values.map((v) => ({ value: String(v), label: field.key === 'maxOptions' ? t('values.maxOptions', { count: v }) : t('values.columns', { count: v }), disabled: readOnly || field.disabled?.includes(v) }))}
          />
        </Labelled>
      )
    case 'number':
      return (
        <Labelled label={label} inline>
          <NumberField className="w-28" value={typeof value === 'number' ? value : null} unit={null} min={field.min} max={field.max} step={1} bigStep={2} decimals={0} disabled={readOnly} onChange={(v) => v !== null && onChange(field.key, Math.min(field.max, Math.max(field.min, Math.round(v))), true)} />
        </Labelled>
      )
    case 'multi': {
      const list = Array.isArray(value) ? (value as string[]) : []
      return (
        <Labelled label={label}>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
            {field.values.map((v) => {
              const on = list.includes(v)
              const locked = on && list.length <= field.min
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={on}
                  disabled={readOnly || locked}
                  onClick={() => onChange(field.key, on ? list.filter((x) => x !== v) : field.values.filter((x) => x === v || list.includes(x)))}
                  className={cn(
                    'h-7 rounded-xs border px-2 text-table transition-colors duration-100 disabled:cursor-not-allowed',
                    on ? 'border-accent-line bg-accent-subtle text-accent-ink' : 'border-divider text-fg-muted hover:border-divider-strong hover:text-fg',
                  )}
                >
                  {valueLabel(t, field.key, v)}
                </button>
              )
            })}
          </div>
        </Labelled>
      )
    }
    case 'text':
      return <TextOption label={label} value={typeof value === 'string' ? value : ''} max={field.max} readOnly={readOnly} onChange={(v) => onChange(field.key, v.trim() ? v : null, true)} />
    case 'richtext':
      return <RichTextField label={label} kind={template.kind} value={value as RichText | undefined} readOnly={readOnly} onChange={(doc) => onChange(field.key, doc, true)} />
    case 'image':
      return <ImageField label={label} value={typeof value === 'string' ? value : undefined} readOnly={readOnly} note={section.type === 'cover' ? t('images.noPhotoNote') : undefined} onChange={(id) => onChange(field.key, id)} />
    case 'images':
      return <ImagesField label={label} max={field.max} value={(Array.isArray(value) ? value : []) as GalleryImageValue[]} readOnly={readOnly} onChange={(images) => onChange(field.key, images, true)} />
  }
}

function TextOption({ label, value, max, readOnly, onChange }: { label: string; value: string; max: number; readOnly: boolean; onChange: (v: string) => void }) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-table text-fg-muted">
        {label}
      </label>
      <Input
        id={id}
        size="sm"
        value={draft}
        maxLength={max}
        readOnly={readOnly}
        onChange={(e) => {
          setDraft(e.target.value)
          onChange(e.target.value)
        }}
      />
    </div>
  )
}

type Tr = ReturnType<typeof useT<typeof es>>

function optionLabel(t: Tr, key: string): string {
  const k = `options.${key}`
  return t.has(k) ? t(k as 'options.showLogo') : key
}

function valueLabel(t: Tr, key: string, value: string): string {
  const k = `values.${key}.${value}`
  return t.has(k) ? t(k as 'values.groupBy.none') : value
}
