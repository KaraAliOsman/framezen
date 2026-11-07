import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { computeLayout, createDesign, type Catalog, type PricingSettings, type QuoteTotals, type TypologyId } from '@dekopen/engine'
import { TypologyIcon, WindowDrawing } from '@dekopen/documents'
import type { Defaults, Locale, OrgSettings } from '@dekopen/shared'
import { cn } from '../../lib/cn'
import { useFormat, useGlossary, useLocale, useT, LOCALE_META } from '../../lib/i18n'
import { Button, Field, Flash, Input, MoneyField, Notice, NumberField, Select, Sheet, SheetContent, Skeleton, Slider } from '../../ui'
import { findLine, lineColors, lineSupports, pickColor } from '../designer/lib/catalog'
import { defaultLineFor } from '../designer/lib/typologies'
import { LinePicker } from '../designer/parts/CatalogPickers'
import { ColorPicker } from '../designer/parts/ColorPicker'
import { MeasureField } from '../designer/parts/MeasureField'
import { TypologyPicker } from '../designer/TypologyPicker'
import { AccentField } from '../settings/components/AccentField'
import { LogoField } from '../settings/components/LogoField'
import settingsEs from '../settings/i18n/es'
import { BrandPicker } from './BrandPicker'
import { COMMON_TYPOLOGIES, typologySize, type ClientDraft, type ResolvedWindow, type WindowDraft } from './draft'
import es from './i18n/es'

/** Monedas de los mercados de DEKOPEN (Chile y LatAm primero) y de los idiomas de la app. */
const CURRENCIES = ['CLP', 'USD', 'EUR', 'MXN', 'PEN', 'COP', 'ARS', 'UYU', 'BRL', 'TRY', 'GBP', 'CHF'] as const

export interface CompanyDraft {
  name: string
  phone: string
  city: string
  logo: string | null
  accent: string | null
}

export type RegionPatch = Pick<OrgSettings, 'locale' | 'currency' | 'taxLabel'>

function currencyLabel(code: string, locale: Locale): string {
  try {
    const name = new Intl.DisplayNames([LOCALE_META[locale].intl], { type: 'currency' }).of(code) ?? code
    return `${name.charAt(0).toLocaleUpperCase(LOCALE_META[locale].intl)}${name.slice(1)} · ${code}`
  } catch {
    return code
  }
}

export function CompanyStep({
  company,
  setField,
  flush,
  docLocale,
  currency,
  taxLabel,
  ivaPct,
  onDocLocale,
  onCurrency,
  onTaxLabel,
  onIva,
}: {
  company: CompanyDraft
  setField: <K extends keyof CompanyDraft>(key: K, value: CompanyDraft[K]) => void
  flush: () => void
  docLocale: Locale
  currency: string
  taxLabel: string
  ivaPct: number
  onDocLocale: (locale: Locale) => void
  onCurrency: (currency: string) => void
  onTaxLabel: (label: string) => void
  onIva: (pct: number) => void
}) {
  const t = useT(es)
  const ts = useT(settingsEs)
  const fmt = useFormat()
  const { locale, locales } = useLocale()
  const [regionOpen, setRegionOpen] = useState(false)
  const [taxDraft, setTaxDraft] = useState(taxLabel)
  const currencies = CURRENCIES.includes(currency as (typeof CURRENCIES)[number]) ? [...CURRENCIES] : [currency, ...CURRENCIES]
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('company.name')} className="sm:col-span-2" hint={!company.name.trim() ? t('company.nameHint') : undefined}>
          <Input value={company.name} onChange={(e) => setField('name', e.target.value)} onBlur={flush} autoComplete="organization" autoFocus={!company.name} />
        </Field>
        <Field label={t('company.phone')} optional>
          <Input value={company.phone} onChange={(e) => setField('phone', e.target.value)} onBlur={flush} type="tel" placeholder={ts('company.fields.phonePlaceholder')} autoComplete="tel" />
        </Field>
        <Field label={t('company.city')} optional>
          <Input value={company.city} onChange={(e) => setField('city', e.target.value)} onBlur={flush} placeholder={ts('company.fields.cityPlaceholder')} autoComplete="address-level2" />
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-table font-medium text-fg">{t('company.logo')}</span>
        <LogoField value={company.logo} onChange={(logo) => setField('logo', logo)} compact />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-table font-medium text-fg">{t('company.accent')}</span>
        <AccentField value={company.accent} onChange={(accent) => setField('accent', accent)} compact />
      </div>
      <div className="flex flex-col gap-4">
        <p className="text-table text-fg-muted">
          {t('region.summary', { currency: currencyLabel(currency, locale), tax: taxLabel, pct: fmt.pct(ivaPct) })}{' '}
          <button type="button" aria-expanded={regionOpen} onClick={() => setRegionOpen((v) => !v)} className="inline-flex items-center gap-0.5 font-medium text-accent-ink hover:underline">
            {t('region.change')}
            <ChevronDown aria-hidden strokeWidth={1.75} className={cn('size-3.5 transition-transform duration-100', regionOpen && 'rotate-180')} />
          </button>
        </p>
        {regionOpen ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('region.documents')}>
              <Select<Locale> value={docLocale} onValueChange={onDocLocale} options={locales.map((l) => ({ value: l, label: <span lang={LOCALE_META[l].intl}>{LOCALE_META[l].label}</span> }))} />
            </Field>
            <Field label={t('region.currency')} hint={t('region.currencyHint')}>
              <Select<string> value={currency} onValueChange={onCurrency} options={currencies.map((code) => ({ value: code, label: currencyLabel(code, locale) }))} />
            </Field>
            <Field label={t('region.taxName')}>
              <Input
                value={taxDraft}
                maxLength={20}
                onChange={(e) => setTaxDraft(e.target.value)}
                onBlur={() => {
                  const value = taxDraft.trim()
                  if (value && value !== taxLabel) onTaxLabel(value)
                  else setTaxDraft(taxLabel)
                }}
              />
            </Field>
            <Field label={t('region.taxRate')}>
              <NumberField value={ivaPct} onChange={(v) => onIva(Math.max(0, Math.min(50, v ?? 0)))} min={0} max={50} step={1} bigStep={5} unit="%" />
            </Field>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function ClientStep({ client, onChange }: { client: ClientDraft; onChange: (patch: Partial<ClientDraft>) => void }) {
  const t = useT(es)
  const ts = useT(settingsEs)
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('client.name')} className="sm:col-span-2">
        <Input value={client.name} onChange={(e) => onChange({ name: e.target.value })} autoFocus autoComplete="off" />
      </Field>
      <Field label={t('client.phone')} optional>
        <Input value={client.phone} onChange={(e) => onChange({ phone: e.target.value })} type="tel" placeholder={ts('company.fields.phonePlaceholder')} autoComplete="off" />
      </Field>
      <Field label={t('client.city')} optional>
        <Input value={client.city} onChange={(e) => onChange({ city: e.target.value })} placeholder={ts('company.fields.cityPlaceholder')} autoComplete="off" />
      </Field>
    </div>
  )
}

/** Dibujo real de cada tipología, con la línea que se usaría para cotizarla. */
function TypologyTile({ id, catalog, selected, onSelect, defaults }: { id: TypologyId; catalog: Catalog | undefined; selected: boolean; onSelect: () => void; defaults?: Defaults }) {
  const g = useGlossary()
  const { locale } = useLocale()
  const drawing = useMemo(() => {
    if (!catalog?.lines?.length) return null
    try {
      const size = typologySize(id)
      const lineId = defaultLineFor(catalog, id, defaults?.lineId ?? undefined)
      const design = createDesign(id, { lineId, ...size, colorId: pickColor(catalog, lineId, defaults?.colorId ?? undefined), glassId: catalog.glass[0]?.id ?? 'vidrio' })
      return { design, layout: computeLayout(design, catalog), catalog }
    } catch {
      return null
    }
  }, [id, catalog, defaults?.lineId, defaults?.colorId])
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex min-w-0 flex-col items-center gap-2 rounded-panel bg-sunken px-2 pt-3 pb-2.5 text-center transition-colors duration-100 ease-out',
        selected ? 'ring-2 ring-accent' : 'hover:bg-hover',
      )}
    >
      <span data-theme="light" className="flex h-16 items-center justify-center">
        {drawing ? <WindowDrawing {...drawing} dimensions="none" height={64} locale={locale} /> : <TypologyIcon typologyId={id} size={52} strokeWidth={1.25} className="text-fg-strong" />}
      </span>
      <span className="line-clamp-2 w-full text-table font-medium text-fg-strong">{g.typology(id)}</span>
    </button>
  )
}

export function WindowStep({
  value,
  onChange,
  catalog,
  resolved,
  defaults,
}: {
  value: WindowDraft
  onChange: (patch: Partial<WindowDraft>) => void
  catalog: Catalog | undefined
  resolved: ResolvedWindow | null
  defaults?: Defaults
}) {
  const t = useT(es)
  const [allTypes, setAllTypes] = useState(false)
  const [brandsOpen, setBrandsOpen] = useState(false)
  const [sized, setSized] = useState(false)
  const line = resolved?.line ?? findLine(catalog, value.lineId)
  const colorId = resolved?.design.colorId ?? value.colorId
  const colors = useMemo(() => lineColors(catalog, line?.id), [catalog, line?.id])
  const hasLines = Boolean(catalog?.lines?.length)
  const shown: readonly TypologyId[] = COMMON_TYPOLOGIES.includes(value.typologyId) ? COMMON_TYPOLOGIES : [value.typologyId, ...COMMON_TYPOLOGIES.slice(0, 5)]

  const chooseTypology = (typologyId: TypologyId) => {
    const kept = line && lineSupports(line, typologyId) ? {} : { lineId: undefined, colorId: undefined }
    onChange({ typologyId, ...kept, ...(sized ? {} : typologySize(typologyId)) })
  }

  if (!catalog) return <Skeleton className="h-96" />

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span id="ob-typology" className="text-table font-medium text-fg">
            {t('window.typology')}
          </span>
          {hasLines ? (
            <button type="button" onClick={() => setAllTypes(true)} className="text-table font-medium text-accent-ink hover:underline">
              {t('window.allTypes')}
            </button>
          ) : null}
        </div>
        <div role="radiogroup" aria-labelledby="ob-typology" className="grid grid-cols-3 gap-2">
          {shown.map((id) => (
            <TypologyTile key={id} id={id} catalog={catalog} defaults={defaults} selected={id === value.typologyId} onSelect={() => chooseTypology(id)} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5.5rem] gap-3">
        <Field label={t('window.width')}>
          <MeasureField
            value={value.width}
            onChange={(width) => {
              setSized(true)
              onChange({ width })
            }}
            min={100}
            max={12000}
            step={10}
            bigStep={100}
            decimals={0}
            unit="mm"
          />
        </Field>
        <Field label={t('window.height')}>
          <MeasureField
            value={value.height}
            onChange={(height) => {
              setSized(true)
              onChange({ height })
            }}
            min={100}
            max={12000}
            step={10}
            bigStep={100}
            decimals={0}
            unit="mm"
          />
        </Field>
        <Field label={t('window.qty')}>
          <NumberField value={value.qty} onChange={(qty) => onChange({ qty: Math.max(1, Math.round(qty ?? 1)) })} min={1} max={999} step={1} bigStep={5} decimals={0} unit={null} />
        </Field>
      </div>

      {hasLines ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('window.line')}>
              <LinePicker catalog={catalog} value={line?.id} onChange={(lineId) => onChange({ lineId, colorId: pickColor(catalog, lineId, colorId) })} filter={(l) => lineSupports(l, value.typologyId)} showBrand aria-label={t('window.line')} />
            </Field>
            <Field label={t('window.color')}>
              <ColorPicker colors={colors} value={colorId} onChange={(id) => onChange({ colorId: id })} size="md" aria-label={t('window.color')} />
            </Field>
          </div>
          {resolved?.missingPrices ? (
            <Notice tone="neutral" size="compact">
              {t('window.noPrices', { line: resolved.line?.name ?? '' })}
            </Notice>
          ) : null}
          <div>
            <button type="button" onClick={() => setBrandsOpen(true)} className="text-table font-medium text-accent-ink hover:underline">
              {t('window.otherBrand')}
            </button>
          </div>
        </>
      ) : (
        <Notice
          tone="neutral"
          action={
            <Button type="button" size="sm" onClick={() => setBrandsOpen(true)}>
              {t('window.chooseBrand')}
            </Button>
          }
        >
          {t('window.noLines')}
        </Notice>
      )}

      {hasLines ? (
        <TypologyPicker
          open={allTypes}
          onOpenChange={setAllTypes}
          catalog={catalog}
          defaults={{ lineId: line?.id, colorId, glassId: value.glassId, fallbackLineId: defaults?.lineId ?? undefined }}
          onCreate={(design, meta) => {
            setSized(true)
            onChange({ typologyId: meta.typologyId, width: design.width, height: design.height, qty: meta.qty, lineId: design.lineId, colorId: design.colorId, glassId: design.glassId })
            setAllTypes(false)
          }}
        />
      ) : null}
      <Sheet open={brandsOpen} onOpenChange={setBrandsOpen}>
        <SheetContent title={t('brands.title')} description={t('brands.description')} width={520}>
          <BrandPicker />
        </SheetContent>
      </Sheet>
    </div>
  )
}

export function PriceStep({
  pricing,
  onChange,
  totals,
  qty,
  resolved,
  taxLabel,
}: {
  pricing: PricingSettings
  onChange: (patch: Partial<PricingSettings>) => void
  totals: QuoteTotals
  qty: number
  resolved: ResolvedWindow | null
  taxLabel: string
}) {
  const t = useT(es)
  const fmt = useFormat()
  const margin = pricing.marginMode === 'margin'
  const pct = Math.round(pricing.marginPct)
  const label = margin ? t('pricing.margin') : t('pricing.markup')
  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-2">
        <label htmlFor="ob-margin" className="text-table font-medium text-fg">
          {label}
        </label>
        <div className="flex items-center gap-3">
          <Slider aria-label={label} value={pricing.marginPct} onValueChange={(marginPct) => onChange({ marginPct })} min={0} max={margin ? 70 : 150} step={1} className="flex-1" />
          <NumberField id="ob-margin" value={pricing.marginPct} onChange={(v) => onChange({ marginPct: v ?? 0 })} min={0} max={margin ? 95 : 500} step={1} bigStep={5} unit="%" className="w-24" />
        </div>
        <p className="text-table text-fg-muted">
          {margin ? t('pricing.marginText', { hundred: fmt.money(100, { fractionDigits: 0 }), share: fmt.money(pct, { fractionDigits: 0 }) }) : t('pricing.markupText', { pct: fmt.pct(pct) })}
        </p>
      </div>
      <Field label={t('pricing.labor')}>
        <MoneyField value={pricing.laborPerM2} onChange={(v) => onChange({ laborPerM2: v ?? 0 })} suffix={t('pricing.perM2')} className="max-w-xs" />
      </Field>
      {resolved ? (
        <div>
          <dl className="flex flex-col gap-1 text-fg-muted">
            <div className="flex items-baseline justify-between gap-4">
              <dt>{t('pricing.net')}</dt>
              <dd className="tabular">{fmt.money(totals.net)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt>{t('pricing.tax', { tax: taxLabel, pct: fmt.pct(pricing.ivaPct) })}</dt>
              <dd className="tabular">{fmt.money(totals.iva)}</dd>
            </div>
          </dl>
          <div className="mt-3 flex items-end justify-between gap-4">
            <p className="text-fg-strong">
              {t('pricing.total')}
              <span className="ml-1.5 text-table text-fg-muted">{t('pricing.units', { count: Math.max(1, qty) })}</span>
            </p>
            <Flash trigger={totals.total}>
              <span className="figure text-figure font-medium text-fg-strong">{fmt.money(totals.total)}</span>
            </Flash>
          </div>
          {resolved.missingPrices ? (
            <Notice tone="neutral" size="compact" className="mt-4">
              {t('pricing.missing')}
            </Notice>
          ) : null}
        </div>
      ) : (
        <Notice tone="neutral" size="compact">
          {t('window.sizeMissing')}
        </Notice>
      )}
    </div>
  )
}
