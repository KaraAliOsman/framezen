import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { createFormatter, DEFAULT_CURRENCY, isLocale, LOCALE_META, LOCALES, type Locale, type Me, type OrgSettings } from '@dekopen/shared'
import { cn } from '../../../lib/cn'
import { useSettings, useUpdateSettings } from '../../../lib/hooks'
import { useLocale, useOrgCurrency, useT } from '../../../lib/i18n'
import { qk } from '../../../lib/queryClient'
import { Input, Notice, NumberField, Select, Skeleton, toast, toastUndo } from '../../../ui'
import { LoadError } from '../components/LoadError'
import { FieldGroup, SaveError, SectionHeader, WithPreview } from '../components/SectionHeader'
import { SettingRow } from '../components/SettingRow'
import es from '../i18n/es'
import { currencyChoices, currencyName, languageName, TAX_LABEL_SUGGESTIONS, USUAL_TAX_BY_CURRENCY, useCanManageSettings } from '../lib/region'
import { useAutosave } from '../lib/useAutosave'

type RegionPatch = Partial<Pick<OrgSettings, 'locale' | 'currency' | 'taxLabel'>> & { pricing?: { ivaPct: number } }

interface RegionDraft {
  locale: Locale
  currency: string
  taxLabel: string
  ivaPct: number
}

/** Idioma y región: idioma de la interfaz (tuyo), idioma de los documentos, moneda e impuesto (de la empresa). */
export function RegionSection() {
  const t = useT(es)
  const ui = useLocale()
  const client = useQueryClient()
  const settings = useSettings()
  const update = useUpdateSettings()
  const canManage = useCanManageSettings()
  const orgCurrency = useOrgCurrency()
  const save = async (patch: RegionPatch) => {
    const next = await update.mutateAsync(patch as Partial<OrgSettings>)
    // La moneda y el idioma de la empresa también viven en la sesión (formatos de toda la app).
    client.setQueryData<Me | null>(qk.me, (me) =>
      me ? { ...me, org: { ...me.org, ...(next.locale ? { locale: next.locale } : {}), ...(next.currency ? { currency: next.currency } : {}) } } : me,
    )
    return next
  }
  const autosave = useAutosave<RegionPatch>(save, { key: 'settings:region', delay: 500 })
  const [draft, setDraft] = useState<RegionDraft | null>(null)
  const latest = useRef<RegionDraft | null>(null)

  useEffect(() => {
    if (!settings.data || latest.current) return
    const pending = autosave.unsaved()
    latest.current = {
      locale: (pending?.locale ?? (isLocale(settings.data.locale) ? settings.data.locale : 'es')) as Locale,
      currency: (pending?.currency ?? settings.data.currency ?? orgCurrency ?? DEFAULT_CURRENCY).toUpperCase(),
      taxLabel: pending?.taxLabel ?? settings.data.taxLabel ?? 'IVA',
      ivaPct: pending?.pricing?.ivaPct ?? settings.data.pricing.ivaPct,
    }
    setDraft(latest.current)
  }, [settings.data, autosave.unsaved, orgCurrency])

  const change = (patch: Partial<RegionDraft>, send: RegionPatch) => {
    const next = { ...(latest.current as RegionDraft), ...patch }
    latest.current = next
    setDraft(next)
    autosave.queue(send)
  }

  const changeCurrency = (currency: string) => {
    const before = latest.current?.currency
    if (!before || before === currency) return
    change({ currency }, { currency })
    toastUndo(t('region.currency.changed', { code: currency }), () => change({ currency: before }, { currency: before }))
  }

  const changeUiLocale = async (locale: Locale) => {
    const ok = await ui.setLocale(locale)
    if (!ok) toast.error(t('region.ui.failed'))
  }

  const languageOptions = useMemo(
    () =>
      LOCALES.map((l) => ({
        value: l,
        label: LOCALE_META[l].label,
        description: l === ui.locale ? undefined : languageName(l, ui.locale),
      })),
    [ui.locale],
  )

  if (!draft) {
    return (
      <div>
        <SectionHeader title={t('region.title')} description={t('region.description')} />
        {settings.isError && !settings.data ? (
          <LoadError title={t('region.loadError')} error={settings.error} onRetry={() => void settings.refetch()} />
        ) : (
          <div className="space-y-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-40" />
            <Skeleton className="h-32" />
          </div>
        )}
      </div>
    )
  }

  const currencyOptions = currencyChoices(draft.currency).map((code) => ({
    value: code,
    label: `${code} · ${currencyName(code, ui.locale)}`,
  }))
  const usual = USUAL_TAX_BY_CURRENCY[draft.currency]
  const taxDiffers = usual && (usual.pct !== draft.ivaPct || usual.label !== draft.taxLabel.trim())

  return (
    <div>
      <SectionHeader title={t('region.title')} description={t('region.description')} status={autosave.status} savedAt={autosave.savedAt} />
      <SaveError message={autosave.error} />
      <WithPreview
        label={t('region.preview.title')}
        preview={<FormatPreview uiLocale={ui.locale} docLocale={draft.locale} currency={draft.currency} taxLabel={draft.taxLabel.trim() || 'IVA'} taxPct={draft.ivaPct} />}
      >
          <FieldGroup
            title={t('region.ui.title')}
            description={t('region.ui.description')}
            aside={<span className="text-table text-fg-muted">{t('region.onlyYou')}</span>}
            bodyClassName="@container"
          >
            <SettingRow title={t('region.ui.label')} htmlFor="region-ui-locale" description={ui.pending ? t('region.ui.switching') : t('region.ui.hint')}>
              <Select id="region-ui-locale" aria-label={t('region.ui.label')} value={ui.locale} onValueChange={(l) => void changeUiLocale(l)} options={languageOptions} className="w-full" />
            </SettingRow>
          </FieldGroup>

          <FieldGroup
            title={t('region.docs.title')}
            description={t('region.docs.description')}
            aside={<span className="text-table text-fg-muted">{t('region.wholeCompany')}</span>}
            bodyClassName="@container"
          >
            <SettingRow title={t('region.docs.label')} htmlFor="region-doc-locale" description={t('region.docs.hint')}>
              <Select
                id="region-doc-locale"
                aria-label={t('region.docs.label')}
                value={draft.locale}
                onValueChange={(locale) => change({ locale }, { locale })}
                options={languageOptions}
                disabled={!canManage}
                className="w-full"
              />
            </SettingRow>
          </FieldGroup>

          <FieldGroup
            title={t('region.money.title')}
            description={t('region.money.description')}
            aside={<span className="text-table text-fg-muted">{t('region.wholeCompany')}</span>}
            bodyClassName="@container"
            footer={t('region.money.footer')}
          >
            <SettingRow title={t('region.currency.label')} htmlFor="region-currency" description={t('region.currency.hint')} wide>
              <div className="flex flex-col gap-2.5">
                <Select
                  id="region-currency"
                  aria-label={t('region.currency.label')}
                  value={draft.currency}
                  onValueChange={changeCurrency}
                  options={currencyOptions}
                  disabled={!canManage}
                  className="w-full"
                />
                <Notice tone="neutral" size="compact">
                  {t('region.currency.noConversion')}
                </Notice>
              </div>
            </SettingRow>
            <SettingRow title={t('region.tax.label')} htmlFor="region-tax-label" description={t('region.tax.hint')} wide>
              <div className="flex flex-col gap-2.5">
                <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2">
                  <Input
                    id="region-tax-label"
                    value={draft.taxLabel}
                    maxLength={20}
                    disabled={!canManage}
                    onChange={(e) => {
                      const taxLabel = e.target.value
                      setDraft((d) => (d ? { ...d, taxLabel } : d))
                      if (latest.current) latest.current = { ...latest.current, taxLabel }
                      // Vacío no se guarda (el servidor pide un nombre): mientras escribes, queda el anterior.
                      if (taxLabel.trim()) autosave.queue({ taxLabel: taxLabel.trim() })
                    }}
                    onBlur={() => void autosave.flush()}
                  />
                  <NumberField
                    aria-label={t('region.tax.rate')}
                    value={draft.ivaPct}
                    onChange={(v) => v !== null && change({ ivaPct: v }, { pricing: { ivaPct: v } })}
                    min={0}
                    max={50}
                    step={0.5}
                    bigStep={1}
                    decimals={1}
                    unit="%"
                    disabled={!canManage}
                  />
                </div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('region.tax.suggestions')}>
                  {TAX_LABEL_SUGGESTIONS.map((label) => {
                    const active = draft.taxLabel.trim() === label
                    return (
                      <button
                        key={label}
                        type="button"
                        disabled={!canManage}
                        aria-pressed={active}
                        onClick={() => change({ taxLabel: label }, { taxLabel: label })}
                        className={cn(
                          'inline-flex h-7 items-center gap-1 rounded-xs px-2 text-meta transition-colors duration-100 ease-out disabled:opacity-50 touch:h-9',
                          active ? 'bg-accent-subtle font-medium text-accent-ink' : 'text-fg-muted hover:bg-hover hover:text-fg',
                        )}
                      >
                        {active ? <Check aria-hidden strokeWidth={2} className="size-3" /> : null}
                        {label}
                      </button>
                    )
                  })}
                </div>
                {!draft.taxLabel.trim() ? <p className="text-table text-warning">{t('region.tax.empty')}</p> : null}
                {taxDiffers && usual ? (
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() => change({ taxLabel: usual.label, ivaPct: usual.pct }, { taxLabel: usual.label, pricing: { ivaPct: usual.pct } })}
                    className="self-start text-table font-medium text-accent-ink hover:underline disabled:opacity-50"
                  >
                    {t('region.tax.useUsual', { label: usual.label, pct: createFormatter(ui.locale).pct(usual.pct, 1), currency: draft.currency })}
                  </button>
                ) : null}
              </div>
            </SettingRow>
          </FieldGroup>
          {!canManage ? <p className="text-table text-fg-muted">{t('region.ownerOnly')}</p> : null}
      </WithPreview>
    </div>
  )
}

/** «$928.200 · 1.200 × 1.000 mm · 31-10-2026», como lo ves tú y como lo ve tu cliente. */
function FormatPreview({ uiLocale, docLocale, currency, taxLabel, taxPct }: { uiLocale: Locale; docLocale: Locale; currency: string; taxLabel: string; taxPct: number }) {
  const t = useT(es)
  const rows = useMemo(() => {
    const today = new Date().toISOString()
    const make = (locale: Locale) => {
      const f = createFormatter(locale, { currency })
      return [
        { key: 'money', value: f.money(928_200) },
        { key: 'tax', value: `${taxLabel} ${f.pct(taxPct, 1)}` },
        { key: 'size', value: f.size(1200, 1000) },
        { key: 'area', value: f.area(1.2) },
        { key: 'date', value: f.date(today) },
        { key: 'number', value: f.docNumber(412) },
      ] as const
    }
    return { ui: make(uiLocale), doc: make(docLocale) }
  }, [uiLocale, docLocale, currency, taxLabel, taxPct])

  return (
    <section>
      <p className="text-h4 font-medium text-fg-strong">{t('region.preview.title')}</p>
      <p className="mt-0.5 text-table text-fg-muted">{t('region.preview.description')}</p>
      <div className="mt-4 grid grid-cols-2 gap-6">
        {(['ui', 'doc'] as const).map((side) => (
          <div key={side} className="min-w-0">
            <p className="mb-2 text-table text-fg-muted">
              {side === 'ui' ? t('region.preview.you') : t('region.preview.client')}
              <span className="block text-meta">{LOCALE_META[side === 'ui' ? uiLocale : docLocale].label}</span>
            </p>
            <dl className="flex flex-col gap-2">
              {rows[side].map((row) => (
                <div key={row.key} className="min-w-0">
                  <dt className="sr-only">{t(`region.preview.rows.${row.key}`)}</dt>
                  <dd className={cn('truncate text-table text-fg-strong', row.key === 'size' || row.key === 'number' ? 'dim' : 'tabular')}>{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  )
}
