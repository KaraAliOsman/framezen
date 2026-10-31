import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_PRICING, formatCLP, formatPct, roundUpTo, sanitizePricing, type PricingSettings } from '@framezen/engine'
import { WindowDrawing } from '@framezen/documents'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../../lib/cn'
import { formatNumber } from '../../../lib/format'
import { useCatalog, useSettings, useUpdateSettings } from '../../../lib/hooks'
import { AnimatedNumber, Flash, MoneyField, NumberField, RadioCards, SegmentedControl, Skeleton, Slider, Switch } from '../../../ui'
import { LoadError } from '../components/LoadError'
import { SectionHeader } from '../components/SectionHeader'
import { SettingRow } from '../components/SettingRow'
import { priceExample, PRICING_EXAMPLE, type PricedExample } from '../lib/pricingExample'
import { useAutosave } from '../lib/useAutosave'

const ROUND_OPTIONS = [
  { value: '1', label: '$1' },
  { value: '10', label: '$10' },
  { value: '100', label: '$100' },
  { value: '1000', label: '$1.000' },
] as const

/** «De cada $100 que cobras, $40 son ganancia» / «$100 de costo se venden en $140». */
export function marginSentence(mode: PricingSettings['marginMode'], pct: number): string {
  const p = Math.max(0, Math.min(95, pct))
  if (mode === 'margin') return `De cada $100 que cobras, $${formatNumber(p, 1)} son tu ganancia.`
  return `A lo que te cuesta le sumas un ${formatPct(p)}: $100 de costo se venden en $${formatNumber(100 + p, 1)}.`
}

/** Precios: margen, mano de obra, instalación, merma, redondeo, IVA y barras completas. */
export function PricingSection() {
  const settings = useSettings()
  const catalog = useCatalog()
  const update = useUpdateSettings()
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
        <SectionHeader title="Precios" description="Cómo llegas del costo de los materiales al precio que ve tu cliente." />
        {settings.isError && !settings.data ? (
          <LoadError title="No pudimos cargar tus precios" error={settings.error} onRetry={() => void settings.refetch()} />
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
  const marginLabel = pricing.marginMode === 'margin' ? 'Margen' : 'Recargo'
  const marginTooHigh = pricing.marginMode === 'margin' && pricing.marginPct >= 90

  return (
    <div>
      <SectionHeader
        title="Precios"
        description="Cómo llegas del costo de los materiales al precio que ve tu cliente. Cada cambio se refleja al instante en el ejemplo."
        status={autosave.status}
        savedAt={autosave.savedAt}
      />
      {autosave.error ? (
        <p role="alert" className="mb-5 rounded-md border border-bad-600/20 bg-bad-50 px-3 py-2 text-[13px] text-bad-800">
          {autosave.error}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-10 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Bajo xl la píldora del ejemplo flota abajo: al enfocar un campo, queda sobre ella. */}
        <div className="@container min-w-0 max-xl:pb-6 max-xl:[&_button]:scroll-mb-24 max-xl:[&_input]:scroll-mb-24 max-xl:[&_[role=slider]]:scroll-mb-24">
          <SettingRow title="Cómo calculas tu ganancia" description="Las dos formas son comunes; elige la que usas hoy en tu planilla." wide>
            <RadioCards
              aria-label="Forma de calcular la ganancia"
              value={pricing.marginMode}
              onValueChange={(marginMode) => change({ marginMode })}
              columns={2}
              className="@2xl:grid-cols-1"
              options={[
                { value: 'margin', title: 'Margen sobre la venta', description: marginSentence('margin', pricing.marginPct) },
                { value: 'markup', title: 'Recargo sobre el costo', description: marginSentence('markup', pricing.marginPct) },
              ]}
            />
          </SettingRow>

          <SettingRow
            title={marginLabel}
            htmlFor="pricing-margin"
            description={
              pricing.marginMode === 'margin'
                ? 'Lo que te queda de cada venta después de pagar materiales y mano de obra.'
                : 'Lo que le sumas al costo para llegar al precio.'
            }
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
                onChange={(v) => change({ marginPct: v ?? 0 })}
                min={0}
                max={pricing.marginMode === 'margin' ? 95 : 500}
                step={1}
                bigStep={5}
                decimals={1}
                unit="%"
                className="w-24"
              />
            </div>
            {marginTooHigh ? (
              <p role="status" className="mt-2 text-[13px] leading-[18px] text-warn-800">
                Un margen tan alto multiplica el precio varias veces. Revisa si lo que buscas es un recargo.
              </p>
            ) : null}
          </SettingRow>

          <SettingRow
            title="Mano de obra por m²"
            htmlFor="pricing-labor"
            description={
              <>
                Fabricar y armar, por cada metro cuadrado de ventana. Una de 1,5 × 1,2 m (1,8 m²) suma{' '}
                <span className="font-medium text-paper-900 tabular">{formatCLP(laborExample)}</span>.
              </>
            }
          >
            <MoneyField id="pricing-labor" value={pricing.laborPerM2} onChange={(v) => change({ laborPerM2: v ?? 0 })} suffix="por m²" />
          </SettingRow>

          <SettingRow
            title="Instalación"
            description="Inclúyela en el precio de cada ventana, o déjala fuera y agrégala como extra en la cotización."
            wide
          >
            <div className="flex flex-col gap-2.5">
              <SegmentedControl
                aria-label="Instalación"
                block
                value={pricing.installMode}
                onValueChange={(installMode) => change({ installMode })}
                options={[
                  { value: 'none', label: 'No la incluyo' },
                  { value: 'per_m2', label: 'Por m²' },
                  { value: 'per_unit', label: 'Por ventana' },
                ]}
              />
              {pricing.installMode !== 'none' ? (
                <MoneyField
                  aria-label="Valor de la instalación"
                  value={pricing.installValue}
                  onChange={(v) => change({ installValue: v ?? 0 })}
                  suffix={pricing.installMode === 'per_m2' ? 'por m²' : 'por ventana'}
                />
              ) : null}
            </div>
          </SettingRow>

          <SettingRow
            title="Merma de material"
            htmlFor="pricing-waste"
            description="Lo que se pierde en cortes, despuntes y errores. Se suma al costo de los materiales."
          >
            <div className="flex items-center gap-3">
              <Slider aria-label="Merma" value={pricing.wastePct} onValueChange={(wastePct) => change({ wastePct })} min={0} max={20} step={0.5} className="flex-1" />
              <NumberField
                id="pricing-waste"
                value={pricing.wastePct}
                onChange={(v) => change({ wastePct: v ?? 0 })}
                min={0}
                max={50}
                step={1}
                bigStep={5}
                unit="%"
                className="w-24"
              />
            </div>
          </SettingRow>

          <SettingRow
            title="Redondeo"
            description={
              <>
                Subimos cada precio por unidad al múltiplo que elijas:{' '}
                <span className="tabular">
                  {formatCLP(roundSample)} → <span className="font-medium text-paper-900">{formatCLP(roundUpTo(roundSample, pricing.roundTo))}</span>
                </span>
                .
              </>
            }
          >
            <SegmentedControl
              aria-label="Redondeo"
              block
              value={String(pricing.roundTo) as (typeof ROUND_OPTIONS)[number]['value']}
              onValueChange={(v) => change({ roundTo: Number(v) as PricingSettings['roundTo'] })}
              options={[...ROUND_OPTIONS]}
            />
          </SettingRow>

          <SettingRow title="IVA" htmlFor="pricing-iva" description="En Chile es 19 %. Tus precios se muestran netos y el IVA se suma al total.">
            <NumberField
              id="pricing-iva"
              value={pricing.ivaPct}
              onChange={(v) => change({ ivaPct: v ?? 0 })}
              min={0}
              max={50}
              step={1}
              unit="%"
              className="w-24"
            />
            {pricing.ivaPct !== 19 ? (
              <p role="status" className="mt-2 text-[13px] leading-[18px] text-warn-800">
                Distinto del 19 % de Chile. Si cotizas en otro país está bien; si no, revísalo.
              </p>
            ) : null}
          </SettingRow>

          <SettingRow
            title="Cobrar barras completas"
            description="En vez de cobrar solo los centímetros de perfil que usa cada ventana, cobra las barras enteras que vas a comprar según la optimización de cortes. Más justo en obras chicas."
          >
            <Switch
              checked={pricing.chargeFullBars}
              onCheckedChange={(chargeFullBars) => change({ chargeFullBars })}
              label={pricing.chargeFullBars ? 'Cobro barras completas' : 'Cobro lo que se usa'}
            />
          </SettingRow>
        </div>

        <aside className="min-w-0" id="ejemplo-precio">
          <div className="xl:sticky xl:top-6">{example ? <LiveExample example={example} ivaPct={pricing.ivaPct} /> : null}</div>
        </aside>
      </div>
      {example ? (
        // Desde md, compacta y a la izquierda: queda sobre los textos de cada ajuste, no sobre sus campos.
        <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-10 mt-6 md:bottom-4 md:max-w-[min(340px,42%)] xl:hidden">
          <a
            href="#ejemplo-precio"
            aria-label="Ver de dónde sale el precio del ejemplo"
            className="flex items-center justify-between gap-3 rounded-lg border border-paper-200 bg-paper-0 px-3.5 py-2 shadow-float"
          >
            <span className="min-w-0 truncate text-[13px] text-paper-600">
              Ejemplo · {example.name.toLowerCase()} {example.design.width.toLocaleString('es-CL')} × {example.design.height.toLocaleString('es-CL')}
            </span>
            <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
              <Flash trigger={example.price.unitNet}>
                <span className="font-semibold text-paper-900 tabular">{formatCLP(example.price.unitNet)}</span>
                <span className="ml-1 text-[12px] text-paper-600">+ IVA</span>
              </Flash>
              <ChevronDown aria-hidden strokeWidth={1.75} className="size-4 text-paper-600" />
            </span>
          </a>
        </div>
      ) : null}
    </div>
  )
}

/** Ejemplo en vivo: la ventana dibujada y de dónde sale su precio. */
export function LiveExample({ example, ivaPct, compact }: { example: PricedExample; ivaPct: number; compact?: boolean }) {
  const { design, layout, catalog, line, price, explanation, sample } = example
  const unit = price.unitNet
  return (
    <section aria-label="Ejemplo en vivo" className="overflow-hidden rounded-lg border border-paper-200 bg-paper-0">
      <header className="flex items-start justify-between gap-3 border-b border-paper-200 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[13px] text-paper-600">Ejemplo en vivo</p>
          <p className="mt-0.5 truncate font-medium text-paper-900">
            {example.name} · {design.width.toLocaleString('es-CL')} × {design.height.toLocaleString('es-CL')} mm
          </p>
          {line ? <p className="truncate text-[13px] text-paper-600">{line.name}</p> : null}
        </div>
      </header>
      {!compact ? (
        <div className="flex justify-center bg-paper-50 px-4 py-5">
          <WindowDrawing layout={layout} design={design} catalog={catalog} dimensions="total" width={236} />
        </div>
      ) : null}
      <dl className="px-4 py-3 text-[13px] leading-[18px]">
        {explanation
          .filter((l) => l.kind !== 'total')
          .map((l, i) => (
            <div
              key={`${l.label}-${i}`}
              className={cn(
                'flex items-baseline justify-between gap-3 py-1',
                l.kind === 'subtotal' && 'mt-1 border-t border-paper-200 pt-2 font-medium text-paper-900',
                l.kind === 'part' && 'text-paper-600',
              )}
            >
              <dt className="min-w-0">{l.label}</dt>
              <dd className={cn('shrink-0 tabular', l.amount < 0 && 'text-bad-600')}>{formatCLP(l.amount)}</dd>
            </div>
          ))}
      </dl>
      <div className="flex items-end justify-between gap-3 border-t border-paper-200 bg-paper-50 px-4 py-3.5">
        <div>
          <p className="text-[13px] text-paper-600">Precio de venta</p>
          <p className="text-meta text-paper-600 tabular">Con IVA {formatCLP(Math.round(unit * (1 + ivaPct / 100)))}</p>
        </div>
        <Flash trigger={unit}>
          <span className="text-h2 font-semibold tracking-[-0.01em] text-paper-900 tabular">
            <AnimatedNumber value={unit} format={(n) => formatCLP(Math.round(n))} />
          </span>
          <span className="ml-1 text-[13px] text-paper-600">+ IVA</span>
        </Flash>
      </div>
      {sample ? (
        <p className="border-t border-paper-200 px-4 py-2.5 text-meta leading-4 text-paper-600">
          Calculado con precios de ejemplo: tu catálogo aún no tiene precios para esta ventana.
        </p>
      ) : null}
    </section>
  )
}
