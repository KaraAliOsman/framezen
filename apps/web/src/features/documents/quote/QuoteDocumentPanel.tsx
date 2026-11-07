/**
 * Panel «Documento» de una cotización (contrato para el editor de cotizaciones): plantilla, idioma,
 * secciones visibles, textos, vigencia, nota para el cliente y notas por ventana — todo como ajustes
 * SÓLO de esa cotización (`Quote.documentOverrides` v2). Es controlado: recibe los ajustes guardados
 * y devuelve el v2 compacto con una etiqueta lista para el historial; no guarda ni pide nada más
 * que la lista de plantillas. Cada cambio es una `DocOp` (la misma que usan el servidor y la IA).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight, Lock, PenLine, RotateCcw } from 'lucide-react'
import {
  DOC_LOCALES,
  LOCALE_META,
  QUOTE_PRESET_IDS,
  getDocPreset,
  isDocPresetId,
  pickQuoteTemplateRef,
  presetName,
  resolveQuoteDocument,
  sectionLabel,
  type DocLocale,
  type DocOp,
  type DocTemplate,
  type DocumentPrefs,
  type QuoteDocOverridesV2,
} from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useLocale, useT } from '../../../lib/i18n'
import { Badge, Button, Field, Input, Notice, NumberField, Select, Switch, Textarea } from '../../../ui'
import { useTemplates } from '../api'
import { DocControls, DocRecipes } from '../editor/DocControls'
import { isRequired } from '../editor/SectionsPanel'
import es from '../i18n/es'
import { QUOTE_FIELD_ROWS, QUOTE_TEXT_FIELDS, applyQuoteOps, normalizeOverrides, overrideCount, type QuoteTextField } from './model'

export interface QuotePanelItem {
  id: string
  ref: string
  name?: string
}

export interface QuoteDocumentChange {
  /** Operaciones aplicadas (para quien quiera registrarlas o repetirlas). */
  ops: DocOp[]
  /** Texto legible del cambio, en el idioma de la interfaz («Cambia el idioma a Português»). */
  label: string
}

export interface QuoteDocumentPanelProps {
  /** `Quote.documentOverrides` como está guardado (v1, v2 o nada). */
  overrides: unknown
  /** Los ajustes cambiaron: v2 compacto (`null` = sin ajustes: borrar la clave) y qué se hizo. */
  onChange: (next: QuoteDocOverridesV2 | null, change: QuoteDocumentChange) => void
  /** Ventanas de la cotización, para las notas por ventana. */
  items?: readonly QuotePanelItem[]
  /** `OrgSettings.documents`: textos y plantilla de la empresa (lo que se hereda). */
  orgPrefs?: Partial<DocumentPrefs> | null
  /** `OrgSettings.locale`: idioma de documentos de la empresa. */
  orgLocale?: DocLocale
  /** Cotización enviada o sin permiso de edición. */
  readOnly?: boolean
  className?: string
}

/** Cuadrito con papel + acento de la plantilla, para reconocerla en la lista. */
function Chip({ template }: { template: DocTemplate }) {
  const { paper, accent, ink } = template.theme.palette
  return (
    <span aria-hidden className="relative inline-block size-5 shrink-0 overflow-hidden rounded-xs border border-divider" style={{ background: paper }}>
      <span className="absolute inset-x-0.5 top-1 h-0.5 rounded-full" style={{ background: ink, opacity: 0.55 }} />
      <span className="absolute inset-x-0.5 bottom-0.5 h-1.5 rounded-xs" style={{ background: accent }} />
    </span>
  )
}

export function QuoteDocumentPanel({ overrides, onChange, items = [], orgPrefs, orgLocale = 'es', readOnly = false, className }: QuoteDocumentPanelProps) {
  const t = useT(es)
  const { locale: uiLocale } = useLocale()
  const list = useTemplates()
  const current = useMemo(() => normalizeOverrides(overrides), [overrides])

  const ref = useMemo(() => pickQuoteTemplateRef(orgPrefs, current), [orgPrefs, current])
  const orgDefaultId = list.data?.defaults.quote ?? pickQuoteTemplateRef(orgPrefs, null).id
  const own = useMemo(() => (list.data?.templates ?? []).filter((r) => r.kind === 'quote'), [list.data])
  const base: DocTemplate = useMemo(() => {
    const record = own.find((r) => r.id === ref.id)
    if (record) return record.template
    return getDocPreset(isDocPresetId(ref.id) ? ref.id : ref.fallbackPresetId)
  }, [own, ref])

  // Plantilla con los ajustes de esta cotización (secciones visibles, textos) y sin ellos (herencia).
  const resolved = useMemo(() => resolveQuoteDocument({ template: base, orgPrefs, overrides: current, brandAccent: null, orgLocale }), [base, orgPrefs, current, orgLocale])
  const inherited = useMemo(() => resolveQuoteDocument({ template: base, orgPrefs, overrides: { v: 2 }, brandAccent: null, orgLocale }), [base, orgPrefs, orgLocale])

  const apply = (ops: DocOp[]) => {
    if (readOnly) return
    const result = applyQuoteOps(overrides, ops, base, uiLocale)
    if (!result.ok || !result.changed) return
    onChange(result.next, { ops, label: result.label })
  }

  const customized = overrideCount(current)
  const templateOptions = [
    ...own.map((r) => ({
      value: r.id,
      label: r.id === orgDefaultId ? t('quotePanel.templateDefault', { name: r.name }) : r.name,
      leading: <Chip template={r.template} />,
    })),
    ...QUOTE_PRESET_IDS.map((id) => ({
      value: id as string,
      label: id === orgDefaultId ? t('quotePanel.templateDefault', { name: presetName(id, uiLocale) }) : presetName(id, uiLocale),
      leading: <Chip template={getDocPreset(id)} />,
    })),
  ]
  const sections = resolved.template.sections.filter((s) => s.type !== 'page_break')
  const language = (resolved.locale ?? orgLocale) as DocLocale

  return (
    <div className={cn('flex flex-col gap-6', className)} data-quote-document-panel>
      <section className="flex flex-col gap-4">
        <Field label={t('quotePanel.template')}>
          <Select<string>
            size="sm"
            value={ref.id}
            disabled={readOnly}
            onValueChange={(next) => apply(next === orgDefaultId ? [{ op: 'reset', scope: 'template' }] : [{ op: 'setTemplate', templateId: next }])}
            options={templateOptions}
            aria-label={t('quotePanel.template')}
          />
        </Field>
        <div className="-mt-2 flex justify-end">
          <Button asChild size="xs" variant="ghost" icon={PenLine}>
            <Link to={`/documentos?plantilla=${encodeURIComponent(ref.id)}`}>{t('quotePanel.editTemplate')}</Link>
          </Button>
        </div>
        <Field label={t('quotePanel.language')}>
          <Select<DocLocale>
            size="sm"
            value={language}
            disabled={readOnly}
            onValueChange={(next) => apply([{ op: 'setLocale', locale: next === orgLocale ? null : next }])}
            options={DOC_LOCALES.map((l) => ({ value: l, label: l === orgLocale ? t('quotePanel.languageDefault', { name: LOCALE_META[l].label }) : LOCALE_META[l].label }))}
            aria-label={t('quotePanel.language')}
          />
        </Field>
        <Field label={t('doc.recipes')}>
          <DocRecipes compact sections={resolved.template.sections} readOnly={readOnly} onOps={(ops) => apply(ops)} />
        </Field>
      </section>

      {resolved.settings.customFields.length ? (
        <section className="flex flex-col gap-3" aria-labelledby="qdp-fields">
          <h3 id="qdp-fields" className="text-table font-semibold text-fg-strong">
            {t('quotePanel.customFields')}
          </h3>
          {resolved.settings.customFields.map((field) => (
            <CustomFieldValue key={field.id} label={field.label} value={current.fields?.[field.id]} readOnly={readOnly} onChange={(value) => apply([{ op: 'setCustomField', fieldId: field.id, value }])} />
          ))}
        </section>
      ) : null}

      <section className="flex flex-col" aria-labelledby="qdp-texts">
        <header className="mb-1">
          <h3 id="qdp-texts" className="text-table font-semibold text-fg-strong">
            {t('quotePanel.texts')}
          </h3>
        </header>
        {QUOTE_TEXT_FIELDS.map((field) => (
          <TextOverride
            key={field}
            field={field}
            label={t(`texts.${field}`)}
            value={current.texts?.[field]}
            inherited={(inherited.texts[field] as string | undefined) ?? ''}
            readOnly={readOnly}
            onChange={(value) => apply([{ op: 'setText', field, value }])}
          />
        ))}
        <Fold
          group="qdp-text"
          title={t('quotePanel.validity')}
          state={(current.validityDays ?? inherited.validityDays) ? `${current.validityDays ?? inherited.validityDays} ${t('texts.days')}` : t('quotePanel.empty')}
          empty={!(current.validityDays ?? inherited.validityDays)}
        >
          <Field label={t('quotePanel.validity')} hint={current.validityDays === undefined && !inherited.validityDays ? t('quotePanel.validityEmpty') : undefined}>
            <NumberField
              value={current.validityDays ?? inherited.validityDays ?? null}
              disabled={readOnly}
              onChange={(v) => apply([{ op: 'setValidityDays', days: v === null ? null : Math.min(365, Math.max(1, Math.round(v))) }])}
              unit={t('texts.days')}
              min={1}
              max={365}
              step={1}
              bigStep={5}
              decimals={0}
            />
          </Field>
        </Fold>
        <TextOverride
          field="clientNote"
          label={t('quotePanel.clientNote')}
          placeholder={t('quotePanel.clientNotePlaceholder')}
          value={current.texts?.clientNote}
          inherited=""
          readOnly={readOnly}
          onChange={(value) => apply([{ op: 'setText', field: 'clientNote', value }])}
        />
      </section>

      <div className="flex flex-col">
      <Fold title={t('quotePanel.sections')} state={t('quotePanel.sectionsCount', { on: sections.filter((x) => x.enabled).length, all: sections.length })}>
        <ul className="flex flex-col divide-y divide-divider">
          {sections.map((section) => {
            const required = isRequired(resolved.template, section)
            const overridden = current.sections?.[section.id]?.enabled !== undefined
            const name = section.title?.trim() || sectionLabel(section.type, uiLocale)
            return (
              <li key={section.id} className="flex min-h-10 items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span className={cn('truncate text-base', section.enabled ? 'text-fg' : 'text-fg-muted')}>{name}</span>
                  {overridden ? <span role="img" aria-label={t('quotePanel.overridden')} title={t('quotePanel.overridden')} className="size-1.5 shrink-0 rounded-full bg-accent" /> : null}
                </span>
                {required ? (
                  <span className="flex items-center gap-1 text-meta text-fg-muted" title={t('sections.required')}>
                    <Lock aria-hidden className="size-3.5" strokeWidth={1.75} />
                  </span>
                ) : (
                  <Switch
                    size="sm"
                    checked={section.enabled}
                    disabled={readOnly}
                    aria-label={section.enabled ? t('sections.hide', { name }) : t('sections.show', { name })}
                    onCheckedChange={(enabled) => apply([{ op: 'toggleSection', sectionId: section.id, enabled }])}
                  />
                )}
              </li>
            )
          })}
        </ul>
      </Fold>
      {items.length ? (
        <Fold title={t('quotePanel.itemNotes')} state={String(items.filter((item) => current.items?.[item.id]?.note).length || '')}>
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <ItemNote key={item.id} item={item} value={current.items?.[item.id]?.note} readOnly={readOnly} onChange={(note) => apply([{ op: 'setItemNote', itemId: item.id, note }])} />
            ))}
          </div>
        </Fold>
      ) : null}

      <Fold title={t('quotePanel.customize')}>
        <div className="-mx-4">
          <DocControls recipes={false} settings={resolved.settings} sections={resolved.template.sections} readOnly={readOnly} onOps={(ops) => apply(ops)} />
        </div>
      </Fold>
      </div>

      {list.isError ? (
        <Notice tone="neutral" size="compact">
          {t('quotePanel.noTemplates')}
        </Notice>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-divider pt-4">
        <Badge tone={customized ? 'accent' : 'outline'} size="sm">
          {t('quotePanel.customized', { count: customized })}
        </Badge>
        <Button size="xs" variant="ghost" icon={RotateCcw} disabled={readOnly || customized === 0} onClick={() => apply([{ op: 'reset', scope: 'all' }])}>
          {t('quotePanel.resetAll')}
        </Button>
      </footer>
    </div>
  )
}

/**
 * Fila plegable: dice su estado sin abrirla, para que personalizar sea recorrer una lista corta y no un
 * formulario largo. Con `group`, abrir una cierra la otra. El contenido queda montado.
 */
function Fold({ title, state, empty, group, open, children }: { title: string; state?: string; empty?: boolean; group?: string; open?: boolean; children: ReactNode }) {
  return (
    <details name={group} open={open} className="group/fold border-b border-divider last:border-b-0">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-xs text-base outline-none select-none hover:text-fg-strong focus-visible:outline-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden strokeWidth={1.75} className="size-3.5 shrink-0 text-fg-muted transition-transform duration-100 group-open/fold:rotate-90" />
        <span className="shrink-0 text-fg">{title}</span>
        {state ? <span className={cn('min-w-0 flex-1 truncate text-right text-table', empty ? 'text-fg-faint' : 'text-fg-muted')}>{state}</span> : null}
      </summary>
      <div className="pt-1 pb-3">{children}</div>
    </details>
  )
}

/**
 * Texto de la cotización con herencia: vacío = se usa el de la empresa (se ve de guía); al escribir
 * se vuelve propio de esta cotización y aparece «Volver al texto de la empresa».
 */
function TextOverride({
  field,
  label,
  value,
  inherited,
  placeholder,
  readOnly,
  onChange,
}: {
  field: QuoteTextField | 'clientNote'
  label: string
  value: string | undefined
  inherited: string
  placeholder?: string
  readOnly: boolean
  onChange: (value: string | null) => void
}) {
  const t = useT(es)
  const spec = QUOTE_FIELD_ROWS[field]
  const [draft, setDraft] = useState(value ?? '')
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(value ?? '')
  }, [value])
  const set = (next: string) => {
    setDraft(next)
    onChange(next.trim() === '' ? null : next)
  }
  const overridden = value !== undefined
  const aside = overridden ? (
    <button
      type="button"
      disabled={readOnly}
      onClick={() => {
        setDraft('')
        onChange(null)
      }}
      className="inline-flex items-center gap-1 rounded-xs text-meta font-medium text-accent hover:text-accent-hover disabled:opacity-50"
    >
      <RotateCcw aria-hidden className="size-3" strokeWidth={1.75} />
      {t('quotePanel.resetText')}
    </button>
  ) : undefined
  const common = {
    value: draft,
    readOnly,
    placeholder: placeholder ?? inherited,
    onFocus: () => {
      focused.current = true
    },
    onBlur: () => {
      focused.current = false
      setDraft(value ?? '')
    },
    onChange: (event: { target: { value: string } }) => set(event.target.value),
    'data-field': field,
  }
  const shown = (draft.trim() || inherited.trim()).replace(/\s+/g, ' ')
  return (
    <Fold group="qdp-text" title={label} state={shown || t('quotePanel.empty')} empty={!shown}>
      <Field label={label} aside={aside}>
        {spec.singleLine ? <Input size="sm" maxLength={500} {...common} /> : <Textarea rows={spec.rows} maxLength={8000} {...common} />}
      </Field>
    </Fold>
  )
}

function CustomFieldValue({ label, value, readOnly, onChange }: { label: string; value: string | undefined; readOnly: boolean; onChange: (value: string | null) => void }) {
  const [draft, setDraft] = useState(value ?? '')
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(value ?? '')
  }, [value])
  return (
    <Field label={label}>
      <Input
        size="sm"
        value={draft}
        readOnly={readOnly}
        maxLength={120}
        onFocus={() => {
          focused.current = true
        }}
        onBlur={() => {
          focused.current = false
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          onChange(e.target.value.trim() === '' ? null : e.target.value)
        }}
      />
    </Field>
  )
}

function ItemNote({ item, value, readOnly, onChange }: { item: QuotePanelItem; value: string | undefined; readOnly: boolean; onChange: (note: string | null) => void }) {
  const [draft, setDraft] = useState(value ?? '')
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(value ?? '')
  }, [value])
  return (
    <Field
      label={
        <span className="flex items-baseline gap-2">
          <span className="code-id text-meta text-fg-muted">{item.ref}</span>
          <span className="truncate">{item.name ?? item.ref}</span>
        </span>
      }
    >
      <Input
        size="sm"
        value={draft}
        readOnly={readOnly}
        maxLength={400}
        onFocus={() => {
          focused.current = true
        }}
        onBlur={() => {
          focused.current = false
          setDraft(value ?? '')
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          onChange(e.target.value.trim() === '' ? null : e.target.value)
        }}
      />
    </Field>
  )
}
