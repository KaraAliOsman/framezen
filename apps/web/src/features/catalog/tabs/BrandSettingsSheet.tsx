import { useId, useMemo, useRef, useState } from 'react'
import type { BrandSettings, Catalog, MaterialCost } from '@dekopen/engine'
import { DEFAULT_CUT, DEFAULT_PRICING } from '@dekopen/engine'
import { useSettings } from '../../../lib/hooks'
import { cn } from '../../../lib/cn'
import { useFormat, useT } from '../../../lib/i18n'
import { NumberField, SaveIndicator, Sheet, SheetContent } from '../../../ui'
import { SawDiagram } from '../../workshop/diagram/SawDiagram'
import { sawPlan, sawSampleOf, type SawParam } from '../../workshop/diagram/sawModel'
import { usePatchBrand, type BrandPatch, type CatalogBrandSummary } from '../api'
import es from '../i18n/es'
import { brandExample, pickExampleLine } from '../model/brandExample'
import { discountFamilyCopy, DISCOUNT_FAMILIES, type DiscountFamily } from '../model/labels'
import { useAutosave } from '../useAutosave'

export function BrandSettingsSheet({
  summary,
  catalog,
  onOpenChange,
}: {
  summary: CatalogBrandSummary | null
  catalog: Catalog | undefined
  onOpenChange: (open: boolean) => void
}) {
  const t = useT(es)
  // Conserva la última marca mientras la hoja se cierra (animación de salida).
  const last = useRef(summary)
  if (summary) last.current = summary
  const shown = summary ?? last.current
  return (
    <Sheet open={Boolean(summary)} onOpenChange={onOpenChange}>
      {shown ? (
        <SheetContent
          width={720}
          title={t('sheet.title', { name: shown.brand.name })}
          description={t('sheet.description')}
        >
          <BrandSettingsForm key={shown.brand.id} summary={shown} catalog={catalog} />
        </SheetContent>
      ) : null}
    </Sheet>
  )
}

const FAMILY_ROWS: (keyof MaterialCost)[] = ['profiles', 'reinforcement', 'hardware', 'glass', 'accessories']

function BrandSettingsForm({ summary, catalog }: { summary: CatalogBrandSummary; catalog: Catalog | undefined }) {
  const t = useT(es)
  const fmt = useFormat()
  const settingsQuery = useSettings()
  const patch = usePatchBrand()
  const trimId = useId()
  const kerfId = useId()
  const [draft, setDraft] = useState<BrandSettings>(summary.settings)
  const changes = useRef<BrandPatch['settings']>({})
  const autosave = useAutosave<BrandPatch['settings']>((value) => patch.mutateAsync({ id: summary.brand.id, patch: { settings: value } }), 500, `brand:${summary.brand.id}`)

  const update = (next: Partial<BrandSettings>, sent: NonNullable<BrandPatch['settings']>) => {
    setDraft((d) => ({ ...d, ...next, discounts: { ...d.discounts, ...next.discounts } }))
    const prev = changes.current ?? {}
    changes.current = { ...prev, ...sent, discounts: { ...prev.discounts, ...sent.discounts } }
    autosave.schedule(changes.current)
  }

  const setDiscount = (key: DiscountFamily, value: number | null) => {
    const v = Math.min(100, Math.max(0, value ?? 0))
    update({ discounts: { ...draft.discounts, [key]: v } }, { discounts: { [key]: v } })
  }

  const pricing = settingsQuery.data?.pricing ?? DEFAULT_PRICING
  const orgKerf = settingsQuery.data?.cut.kerf ?? 4
  const example = useMemo(
    () => (catalog ? brandExample(catalog, draft, pricing, settingsQuery.data?.defaults, t.locale) : null),
    [catalog, draft, pricing, settingsQuery.data?.defaults, t.locale],
  )
  // El mismo dibujo de Ajustes › Taller, con una ventana real de esta marca y lo que usa el optimizador:
  // el mayor entre el taller y la marca.
  const orgCut = settingsQuery.data?.cut ?? DEFAULT_CUT
  const cutUsed = useMemo(
    () => ({ ...orgCut, kerf: Math.max(orgCut.kerf, draft.kerf), trimStart: Math.max(orgCut.trimStart, draft.trim) }),
    [orgCut, draft.kerf, draft.trim],
  )
  const sawSample = useMemo(() => (catalog ? sawSampleOf(catalog, pickExampleLine(catalog, summary.brand.id)?.id) : null), [catalog, summary.brand.id])
  const sawResult = useMemo(() => (sawSample ? sawPlan(sawSample, { ...cutUsed, barLength: sawSample.stockLength ?? cutUsed.barLength }) : null), [sawSample, cutUsed])
  const [sawActive, setSawActive] = useState<SawParam | null>(null)
  const sample = useMemo(() => sampleProfile(catalog, summary.brand.id), [catalog, summary.brand.id])
  const sameDiscount = DISCOUNT_FAMILIES.every((key) => draft.discounts[key] === draft.discounts.profiles)
  const strong = <strong className="font-medium text-fg-strong tabular" />

  return (
    <div className="flex flex-col gap-7">
      {autosave.status !== 'idle' ? <SaveIndicator status={autosave.status} savedAt={autosave.savedAt} className="-mt-1" /> : null}

      {example ? (
        <ExampleCard example={example} marginPct={pricing.marginPct} />
      ) : (
        <div className="rounded-sm bg-sunken px-3.5 py-3 text-table text-fg-muted">
          {summary.enabled ? t('sheet.noLines') : t('sheet.inactive')}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-h4 font-medium text-fg-strong">{t('sheet.discountsTitle')}</h3>
          <p className="mt-1 text-table text-fg-muted">{t('sheet.discountsHelp')}</p>
        </div>
        <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          {DISCOUNT_FAMILIES.map((key) => {
            const family = discountFamilyCopy(key, t.locale)
            return (
              <label key={key} className="flex items-center justify-between gap-3 py-0.5">
                <span className="min-w-0">
                  <span className="block text-fg-strong">{family.label}</span>
                  <span className="block truncate text-meta text-fg-muted">{family.help}</span>
                </span>
                <NumberField
                  aria-label={t('sheet.discountIn', { family: t.locale === 'es' ? family.label.toLocaleLowerCase('es-CL') : family.label })}
                  value={draft.discounts[key] ?? 0}
                  onChange={(v) => setDiscount(key, v)}
                  unit="%"
                  min={0}
                  max={100}
                  step={1}
                  bigStep={5}
                  className="w-24 shrink-0"
                />
              </label>
            )
          })}
          {!sameDiscount && draft.discounts.profiles > 0 ? (
            <button
              type="button"
              onClick={() => {
                const v = draft.discounts.profiles
                const all = { profiles: v, reinforcement: v, hardware: v, glass: v, accessories: v }
                update({ discounts: all }, { discounts: all })
              }}
              className="flex min-h-9 items-center text-table font-medium text-accent-ink hover:underline"
            >
              {t('sheet.sameForAll', { pct: fmt.pct(draft.discounts.profiles) })}
            </button>
          ) : null}
        </div>
        {sample && draft.discounts.profiles > 0 ? (
          <p className="text-table text-fg-muted">
            {t.rich('sheet.sample', {
              // En español el nombre va en minúscula dentro de la frase («la barra de marco 60 mm»).
              name: t.locale === 'es' ? sample.name.toLocaleLowerCase('es-CL') : sample.name,
              code: sample.code,
              list: fmt.money(sample.price),
              mine: fmt.money(Math.round(sample.price * (1 - draft.discounts.profiles / 100))),
              b: strong,
            })}
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-h4 font-medium text-fg-strong">{t('sheet.marginTitle')}</h3>
          <p className="mt-1 text-table text-fg-muted">{t('sheet.marginHelp', { pct: fmt.pct(pricing.marginPct), brand: summary.brand.name })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <NumberField
            aria-label={t('sheet.marginLabel')}
            value={draft.marginAdjust ?? 0}
            onChange={(v) => {
              const value = v === null || v === 0 ? null : Math.max(-50, Math.min(50, v))
              update({ marginAdjust: value ?? undefined }, { marginAdjust: value })
            }}
            unit={t('sheet.marginUnit')}
            min={-50}
            max={50}
            step={1}
            bigStep={5}
            className="w-28"
          />
          <span className="text-table text-fg-muted">{t.rich('sheet.marginEffective', { pct: fmt.pct(Math.max(0, pricing.marginPct + (draft.marginAdjust ?? 0))), b: strong })}</span>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-h4 font-medium text-fg-strong">{t('sheet.cutTitle')}</h3>
          <p className="mt-1 text-table text-fg-muted">{t('sheet.cutHelp')}</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor={trimId} className="text-table font-medium text-fg">
              {t('sheet.trim')}
            </label>
            <NumberField
              id={trimId}
              onFocus={() => setSawActive('trimStart')}
              onBlur={() => setSawActive(null)}
              value={draft.trim}
              onChange={(v) => update({ trim: Math.max(0, Math.min(500, v ?? 0)) }, { trim: Math.max(0, Math.min(500, v ?? 0)) })}
              min={0}
              max={500}
              step={5}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={kerfId} className="text-table font-medium text-fg">
              {t('sheet.kerf')}
            </label>
            <NumberField
              id={kerfId}
              onFocus={() => setSawActive('kerf')}
              onBlur={() => setSawActive(null)}
              value={draft.kerf}
              onChange={(v) => update({ kerf: Math.max(0, Math.min(20, v ?? 0)) }, { kerf: Math.max(0, Math.min(20, v ?? 0)) })}
              min={0}
              max={20}
              step={1}
            />
          </div>
        </div>
        {sawSample ? <SawDiagram cut={{ ...cutUsed, barLength: sawSample.stockLength ?? cutUsed.barLength }} sample={sawSample} active={sawActive} onActive={setSawActive} compact /> : null}
        <p className="text-table text-fg-muted">
          {sawResult?.bar
            ? t.rich('sheet.sawResult', {
                count: sawResult.bar.cuts.length,
                bar: fmt.meters(sawResult.bar.barLength),
                rest: fmt.mm(sawResult.bar.remainder, { unit: true }),
                pct: fmt.pct(sawResult.yieldPct, 1),
                b: strong,
              })
            : null}
          {orgKerf > draft.kerf ? ` ${t('sheet.orgKerf', { kerf: fmt.mm(orgKerf, { unit: true }) })}` : null}
        </p>
        <p className="text-table text-fg-muted">{t('sheet.ownSetting')}</p>
      </section>
    </div>
  )
}

function sampleProfile(catalog: Catalog | undefined, brandId: string) {
  if (!catalog) return null
  const lineIds = new Set(catalog.lines.filter((l) => l.brandId === brandId).map((l) => l.id))
  const order = ['frame', 'sash', 'sliding_frame', 'sliding_sash']
  const candidates = catalog.profiles.filter((p) => lineIds.has(p.lineId) && Object.values(p.priceByColor).some((v) => v > 0))
  candidates.sort((a, b) => (order.indexOf(a.role) + 1 || 99) - (order.indexOf(b.role) + 1 || 99))
  const p = candidates[0]
  if (!p) return null
  const price = p.priceByColor.blanco ?? Object.values(p.priceByColor).find((v) => v > 0) ?? 0
  return { code: p.code, name: p.name, price }
}

function ExampleCard({ example, marginPct }: { example: NonNullable<ReturnType<typeof brandExample>>; marginPct: number }) {
  const t = useT(es)
  const fmt = useFormat()
  const { list, mine } = example
  const savedMaterial = list.materialsTotal - mine.materialsTotal
  const priceDrop = list.unitNet > 0 ? ((list.unitNet - mine.unitNet) / list.unitNet) * 100 : 0
  const missing = mine.warnings.some((w) => w.code === 'price_missing')
  return (
    <section aria-label={t('sheet.exampleLabel')}>
      <header className="flex items-start justify-between gap-3 pb-2">
        <div className="min-w-0">
          <p className="text-table text-fg-muted">{t('sheet.exampleLabel')}</p>
          <p className="mt-0.5 font-medium text-fg-strong">{example.title}</p>
          <p className="text-table text-fg-muted">{t('sheet.exampleMeta', { line: example.lineName, color: example.colorName, glass: example.glassName })}</p>
        </div>
        {savedMaterial > 0 ? (
          <span className="mt-0.5 shrink-0 text-table text-success">{t('sheet.priceDrop', { pct: fmt.pct(priceDrop) })}</span>
        ) : null}
      </header>
      <table className="w-full text-table">
        <thead>
          <tr className="h-8 border-b border-divider text-table text-fg-muted">
            <th scope="col" className="pr-4 text-left font-normal">
              {t('sheet.materialPerWindow')}
            </th>
            <th scope="col" className="px-3 text-right font-normal">
              {t('sheet.listCol')}
            </th>
            <th scope="col" className="pl-4 text-right font-normal">
              {t('sheet.mineCol')}
            </th>
          </tr>
        </thead>
        <tbody>
          {FAMILY_ROWS.filter((key) => list.materials[key] > 0 || mine.materials[key] > 0).map((key) => (
            <tr key={key} className="h-8 border-b border-divider">
              <th scope="row" className="pr-4 text-left font-normal text-fg">
                {t(`sheet.family.${key}`)}
              </th>
              <td className="px-3 text-right text-fg-muted tabular">{fmt.money(list.materials[key])}</td>
              <td className={cn('pl-4 text-right tabular', mine.materials[key] < list.materials[key] ? 'font-medium text-success' : 'text-fg')}>{fmt.money(mine.materials[key])}</td>
            </tr>
          ))}
          <tr className="h-8">
            <th scope="row" className="pr-4 text-left font-medium text-fg-strong">
              {t('sheet.materialTotal')}
            </th>
            <td className="px-3 text-right text-fg-muted tabular">{fmt.money(list.materialsTotal)}</td>
            <td className="pl-4 text-right font-medium text-fg-strong tabular">{fmt.money(mine.materialsTotal)}</td>
          </tr>
          <tr className="h-11 border-t border-divider">
            <th scope="row" className="pr-4 text-left font-medium text-fg-strong">
              {t('sheet.salePrice')}
            </th>
            <td className="px-3 text-right text-fg-muted tabular">{fmt.money(list.unitNet)}</td>
            <td className="figure pl-4 text-right text-h3 font-medium text-fg-strong">{fmt.money(mine.unitNet)}</td>
          </tr>
        </tbody>
      </table>
      <p className="pt-2 text-table text-fg-muted">
        {savedMaterial > 0
          ? t('sheet.savedNote', { saved: fmt.money(savedMaterial), pct: fmt.pct(mine.targetMarginPct) })
          : t('sheet.listNote', { pct: fmt.pct(marginPct) })}
        {missing ? ` ${t('sheet.missingNote')}` : ''}
      </p>
    </section>
  )
}
