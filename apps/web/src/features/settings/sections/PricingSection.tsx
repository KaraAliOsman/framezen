import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { DEFAULT_PRICING, roundUpTo, sanitizePricing, type PricingSettings } from '@dekopen/engine'
import { WindowDrawing } from '@dekopen/documents'
import { MARGIN_LIMITS } from '@dekopen/shared'
import type { Formatter } from '@dekopen/shared'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { useCatalog, useSettings, useUpdateSettings } from '../../../lib/hooks'
import { translate, useFormat, useGlossary, useLocale, useT } from '../../../lib/i18n'
import { Flash, MoneyField, NumberField, SegmentedControl, Skeleton, Slider, Switch } from '../../../ui'
import { LoadError } from '../components/LoadError'
import { FieldGroup, SaveError, SectionHeader, WithPreview } from '../components/SectionHeader'
import { SettingRow } from '../components/SettingRow'
import es from '../i18n/es'
import { explainPriceLocalized } from '../lib/explain'
import { priceExample, PRICING_EXAMPLE, type PricedExample } from '../lib/pricingExample'
import { useAutosave } from '../lib/useAutosave'

const ROUND_STEPS = [1, 10, 100, 1000] as const

/** Monto con un decimal solo si hace falta ($40 / $40,5). */
function softMoney(fmt: Formatter, value: number): string {
  return fmt.money(value, { fractionDigits: Number.isInteger(value) ? 0 : 1 })
}

/** «De cada $100 que cobras, $40 son ganancia» / «$100 de costo se venden en $140». */
export function marginSentence(mode: PricingSettings['marginMode'], pct: number, fmt: Formatter): string {
  const p = Math.max(0, Math.min(95, pct))
  if (mode === 'margin') return translate(es, 'pricing.marginMode.marginSentence', { hundred: softMoney(fmt, 100), profit: softMoney(fmt, p) }, fmt.locale)
  return translate(es, 'pricing.marginMode.markupSentence', { pct: fmt.pct(p), hundred: softMoney(fmt, 100), price: softMoney(fmt, 100 + p) }, fmt.locale)
}

/** Nombre del impuesto de la empresa («IVA» por defecto). */
export function useTaxLabel(): string {
  const settings = useSettings()
  return settings.data?.taxLabel?.trim() || 'IVA'
}

/** Precios: margen, mano de obra, instalación, merma, redondeo, impuesto y barras completas. */
export function PricingSection() {
  const t = useT(es)
  const fmt = useFormat()
  const settings = useSettings()
  const catalog = useCatalog()
  const update = useUpdateSettings()
  const taxLabel = useTaxLabel()
  const autosave = useAutosave<{ pricing: PricingSettings }>((patch) => update.mutateAsync(patch), { key: 'settings:pricing' })
  const [pricing, setPricing] = useState<PricingSettings | null>(null)
  const latest = useRef<PricingSettings | null>(null)

  useEffect(() => {
    if (settings.data && !latest.current) {
      // Si saliste con un cambio sin guardar (sin conexión), lo sigues viendo al volver.
      latest.current = sanitizePricing(autosave.unsaved()?.pricing ?? settings.data.pricing)
      setPricing(latest.current)
    }
  }, [settings.data, autosave.unsaved])

  const change = (patch: Partial<PricingSettings>) => {
    const next = { ...(latest.current ?? DEFAULT_PRICING), ...patch }
    latest.current = next
    setPricing(next)
    autosave.queue({ pricing: next })
  }

  const deferred = useDeferredValue(pricing)
  const example = useMemo(
    () =>
      deferred
        ? priceExample(catalog.data, deferred, PRICING_EXAMPLE, { defaults: settings.data?.defaults, cut: settings.data?.cut })
        : null,
    [deferred, catalog.data, settings.data?.defaults, settings.data?.cut],
  )

  if (!pricing) {
    return (
      <div>
        <SectionHeader title={t('pricing.title')} description={t('pricing.descriptionShort')} />
        {settings.isError && !settings.data ? (
          <LoadError title={t('pricing.loadError')} error={settings.error} onRetry={() => void settings.refetch()} />
        ) : (
          <div className="space-y-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        )}
      </div>
    )
  }

  const laborExample = Math.round(1.8 * pricing.laborPerM2)
  const roundSample = 214_537
  const marginLabel = pricing.marginMode === 'margin' ? t('pricing.margin.labelMargin') : t('pricing.margin.labelMarkup')
  const marginTooHigh = pricing.marginMode === 'margin' && pricing.marginPct >= 90
  const isClp = fmt.currency === 'CLP'

  return (
    <div className="@container">
      <SectionHeader title={t('pricing.title')} description={t('pricing.description')} status={autosave.status} savedAt={autosave.savedAt} />
      <SaveError message={autosave.error} />
      <WithPreview label={t('pricing.example.title')} preview={<div id="ejemplo-precio">{example ? <LiveExample example={example} ivaPct={pricing.ivaPct} /> : null}</div>}>
        {/* Bajo xl la píldora del ejemplo flota abajo: al enfocar un campo, queda sobre ella. */}
        <div className="flex min-w-0 flex-col gap-10 max-xl:pb-6 max-xl:[&_button]:scroll-mb-24 max-xl:[&_input]:scroll-mb-24 max-xl:[&_[role=slider]]:scroll-mb-24">
          <FieldGroup title={t('pricing.groups.profit.title')} description={t('pricing.groups.profit.description')} bodyClassName="@container">
            <SettingRow title={t('pricing.marginMode.title')} description={t('pricing.marginMode.description')} wide>
              <div className="flex flex-col gap-2">
                <SegmentedControl
                  aria-label={t('pricing.marginMode.aria')}
                  block
                  value={pricing.marginMode}
                  onValueChange={(marginMode) => change({ marginMode })}
                  options={[
                    { value: 'margin', label: t('pricing.marginMode.margin') },
                    { value: 'markup', label: t('pricing.marginMode.markup') },
                  ]}
                />
                <p className="text-table text-fg-muted">{marginSentence(pricing.marginMode, pricing.marginPct, fmt)}</p>
              </div>
            </SettingRow>

            <SettingRow
              title={marginLabel}
              htmlFor="pricing-margin"
              description={pricing.marginMode === 'margin' ? t('pricing.margin.descMargin') : t('pricing.margin.descMarkup')}
            >
              <div className="flex items-center gap-3">
                <Slider
                  aria-label={marginLabel}
                  value={pricing.marginPct}
                  onValueChange={(marginPct) => change({ marginPct })}
                  min={0}
                  max={pricing.marginMode === 'margin' ? 80 : 200}
                  step={1}
                  className="flex-1"
                />
                <NumberField
                  id="pricing-margin"
                  value={pricing.marginPct}
                  onChange={(v) => change({ marginPct: v ?? 0, ...((v ?? 0) > MARGIN_LIMITS.margin ? { marginMode: 'markup' as const } : {}) })}
                  min={0}
                  max={MARGIN_LIMITS.markup}
                  step={1}
                  bigStep={5}
                  decimals={1}
                  unit="%"
                  className="w-24"
                />
              </div>
              {marginTooHigh ? (
                <p role="status" className="mt-2 text-table text-warning">
                  {t('pricing.margin.tooHigh')}
                </p>
              ) : null}
            </SettingRow>
          </FieldGroup>

          <FieldGroup title={t('pricing.groups.costs.title')} description={t('pricing.groups.costs.description')} bodyClassName="@container">
            <SettingRow
              title={t('pricing.labor.title')}
              htmlFor="pricing-labor"
              description={t.rich('pricing.labor.description', {
                w: fmt.number(1.5, { maxDecimals: 1 }),
                h: fmt.number(1.2, { maxDecimals: 1 }),
                area: fmt.area(1.8),
                amount: fmt.money(laborExample),
                b: <span className="font-medium text-fg-strong tabular" />,
              })}
            >
              <MoneyField id="pricing-labor" value={pricing.laborPerM2} onChange={(v) => change({ laborPerM2: v ?? 0 })} suffix={t('pricing.perM2')} />
            </SettingRow>

            <SettingRow title={t('pricing.install.title')} description={t('pricing.install.description')} wide>
              <div className="flex flex-col gap-2.5">
                <SegmentedControl
                  aria-label={t('pricing.install.title')}
                  block
                  value={pricing.installMode}
                  onValueChange={(installMode) => change({ installMode })}
                  options={[
                    { value: 'none', label: t('pricing.install.none') },
                    { value: 'per_m2', label: t('pricing.install.perM2') },
                    { value: 'per_unit', label: t('pricing.install.perUnit') },
                  ]}
                />
                {pricing.installMode !== 'none' ? (
                  <MoneyField
                    aria-label={t('pricing.install.valueAria')}
                    value={pricing.installValue}
                    onChange={(v) => change({ installValue: v ?? 0 })}
                    suffix={pricing.installMode === 'per_m2' ? t('pricing.perM2') : t('pricing.perWindow')}
                  />
                ) : null}
              </div>
            </SettingRow>

            <SettingRow title={t('pricing.waste.title')} htmlFor="pricing-waste" description={t('pricing.waste.description')}>
              <div className="flex items-center gap-3">
                <Slider aria-label={t('pricing.waste.aria')} value={pricing.wastePct} onValueChange={(wastePct) => change({ wastePct })} min={0} max={20} step={0.5} className="flex-1" />
                <NumberField id="pricing-waste" value={pricing.wastePct} onChange={(v) => change({ wastePct: v ?? 0 })} min={0} max={50} step={1} bigStep={5} unit="%" className="w-24" />
              </div>
            </SettingRow>

            <SettingRow title={t('pricing.fullBars.title')} description={t('pricing.fullBars.description')}>
              <Switch
                checked={pricing.chargeFullBars}
                onCheckedChange={(chargeFullBars) => change({ chargeFullBars })}
                label={pricing.chargeFullBars ? t('pricing.fullBars.on') : t('pricing.fullBars.off')}
              />
            </SettingRow>
          </FieldGroup>

          <FieldGroup
            title={t('pricing.groups.final.title')}
            description={t('pricing.groups.final.description')}
            bodyClassName="@container"
            footer={t.rich('pricing.tax.regionNote', {
              link: <Link to="/ajustes/idioma" className="font-medium text-accent-ink hover:underline" />,
              currency: fmt.currency,
            })}
          >
            <SettingRow
              title={t('pricing.rounding.title')}
              description={t.rich('pricing.rounding.description', {
                from: fmt.money(roundSample),
                to: fmt.money(roundUpTo(roundSample, pricing.roundTo)),
                num: <span className="tabular" />,
                b: <span className="font-medium text-fg-strong" />,
              })}
            >
              <SegmentedControl
                aria-label={t('pricing.rounding.title')}
                block
                value={String(pricing.roundTo) as `${(typeof ROUND_STEPS)[number]}`}
                onValueChange={(v) => change({ roundTo: Number(v) as PricingSettings['roundTo'] })}
                options={ROUND_STEPS.map((step) => ({ value: String(step) as `${typeof step}`, label: fmt.money(step, { fractionDigits: 0 }) }))}
              />
            </SettingRow>

            <SettingRow title={taxLabel} htmlFor="pricing-iva" description={t('pricing.tax.description', { tax: taxLabel })}>
              <NumberField id="pricing-iva" value={pricing.ivaPct} onChange={(v) => change({ ivaPct: v ?? 0 })} min={0} max={50} step={1} unit="%" className="w-24" />
              {isClp && pricing.ivaPct !== 19 ? (
                <p role="status" className="mt-2 text-table text-warning">
                  {t('pricing.tax.notChile')}
                </p>
              ) : null}
            </SettingRow>
          </FieldGroup>
        </div>
      </WithPreview>
      {example ? <ExamplePill example={example} taxLabel={taxLabel} /> : null}
    </div>
  )
}

/** Bajo xl: el precio del ejemplo flota abajo y lleva al detalle. */
function ExamplePill({ example, taxLabel }: { example: PricedExample; taxLabel: string }) {
  const t = useT(es)
  const fmt = useFormat()
  const g = useGlossary()
  const name = g.typology(example.typology, example.name)
  return (
    // Desde md, compacta y a la izquierda: queda sobre los textos de cada ajuste, no sobre sus campos.
    <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-10 mt-6 md:bottom-4 md:max-w-[min(360px,44%)] @3xl:hidden">
      <a
        href="#ejemplo-precio"
        aria-label={t('pricing.example.pillAria')}
        className="flex items-center justify-between gap-3 rounded-md bg-raised px-3.5 py-2 shadow-float"
      >
        <span className="min-w-0 truncate text-table text-fg-muted">{t('pricing.example.pill', { name, size: fmt.size(example.design.width, example.design.height) })}</span>
        <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
          <Flash trigger={example.price.unitNet}>
            <span className="font-medium text-fg-strong tabular">{fmt.money(example.price.unitNet)}</span>
            <span className="ml-1 text-meta text-fg-muted">{t('pricing.plusTax', { tax: taxLabel })}</span>
          </Flash>
          <ChevronDown aria-hidden strokeWidth={1.75} className="size-4 text-fg-muted" />
        </span>
      </a>
    </div>
  )
}

/** Ejemplo en vivo: la ventana dibujada y de dónde sale su precio (cifras del motor). */
export function LiveExample({ example, ivaPct, compact }: { example: PricedExample; ivaPct: number; compact?: boolean }) {
  const t = useT(es)
  const { locale } = useLocale()
  const fmt = useFormat()
  const g = useGlossary()
  const taxLabel = useTaxLabel()
  const { design, layout, catalog, line, price, sample } = example
  const explanation = useMemo(() => explainPriceLocalized(price, fmt), [price, fmt])
  const unit = price.unitNet
  return (
    <section aria-label={t('pricing.example.title')}>
      {!compact ? (
        <div className="flex justify-center rounded-panel bg-sunken px-4 py-5">
          <span data-theme="light" className="block">
            <WindowDrawing layout={layout} design={design} catalog={catalog} dimensions="total" width={220} locale={locale} />
          </span>
        </div>
      ) : null}
      <div className="mt-3 min-w-0">
        <p className="truncate text-fg-strong">
          {g.typology(example.typology, example.name)} · <span className="tabular">{fmt.size(design.width, design.height)}</span>
        </p>
        <p className="truncate text-table text-fg-muted">{line ? line.name : t('pricing.example.title')}</p>
      </div>
      <dl className="mt-3 text-table">
        {explanation
          .filter((l) => l.kind !== 'total')
          .map((l, i) => (
            <div
              key={`${l.label}-${i}`}
              className={cn(
                'flex items-baseline justify-between gap-3 py-1',
                l.kind === 'subtotal' && 'mt-1 border-t border-divider pt-2 font-medium text-fg-strong',
                l.kind === 'part' && 'text-fg-muted',
              )}
            >
              <dt className="min-w-0">{l.label}</dt>
              <dd className={cn('shrink-0 tabular', l.amount < 0 ? 'text-danger' : l.kind === 'part' && 'text-fg')}>{fmt.money(l.amount)}</dd>
            </div>
          ))}
      </dl>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-table text-fg">{t('pricing.example.salePrice')}</p>
          <p className="text-meta text-fg-muted tabular">{t('pricing.example.withTax', { tax: taxLabel, amount: fmt.money(Math.round(unit * (1 + ivaPct / 100))) })}</p>
        </div>
        <Flash trigger={unit}>
          <span className="figure text-h2 font-medium text-fg-strong">{fmt.money(unit)}</span>
          <span className="ml-1 text-table text-fg-muted">{t('pricing.plusTax', { tax: taxLabel })}</span>
        </Flash>
      </div>
      {sample ? <p className="mt-2 text-meta text-fg-muted">{t('pricing.example.sample')}</p> : null}
    </section>
  )
}
