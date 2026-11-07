import { useMemo, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import type { Catalog, Id } from '@dekopen/engine'
import { humanError } from '../../../lib/api'
import { cn } from '../../../lib/cn'
import { normalizeSearch } from '../../../lib/format'
import { useFormat, useT } from '../../../lib/i18n'
import { Button, DataTable, EmptyState, Input, Meter, SegmentedControl, SkeletonRows, Switch, toast, toastUndo, type DataTableColumn } from '../../../ui'
import { useCatalogBrands, usePatchBrand, type CatalogBrandSummary } from '../api'
import es from '../i18n/es'
import { brandKindLabel, discountFamilyCopy, DISCOUNT_FAMILIES } from '../model/labels'
import type { PriceFocus } from '../model/prices'
import { missingPriceKeys, readinessByLine, type LineReadiness } from '../model/readiness'
import { BrandSettingsSheet } from './BrandSettingsSheet'

type KindFilter = 'all' | 'profiles' | 'glass' | 'hardware'

/** Marcas del taller en una tabla y, plegadas debajo, las demás del catálogo. */
export function BrandsTab({
  catalog,
  readiness: given,
  onCompletePrices,
}: {
  catalog: Catalog | undefined
  /** Completitud por línea (la calcula la página una vez); si falta, se calcula aquí. */
  readiness?: Map<Id, LineReadiness>
  onCompletePrices?: (focus: PriceFocus) => void
}) {
  const t = useT(es)
  const fmt = useFormat()
  // Estado real de las líneas de las marcas activas (el catálogo del taller trae solo esas).
  const own = useMemo(() => (given ? null : readinessByLine(catalog)), [given, catalog])
  const readiness = given ?? own ?? new Map<Id, LineReadiness>()
  const brands = useCatalogBrands()
  const patch = usePatchBrand()
  const [kind, setKind] = useState<KindFilter>('all')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)

  const items = brands.data?.items ?? []
  const enabled = items.filter((b) => b.enabled)
  const others = useMemo(() => {
    const terms = normalizeSearch(q)
    return items
      .filter((b) => !b.enabled)
      .filter((b) => kind === 'all' || (kind === 'profiles' ? b.brand.kind === 'profiles' || b.brand.kind === 'mixed' : b.brand.kind === kind))
      .filter((b) => !terms || normalizeSearch(b.brand.name).includes(terms))
  }, [items, kind, q])
  const hiddenCount = items.length - enabled.length

  const toggle = (summary: CatalogBrandSummary, next: boolean) => {
    const name = summary.brand.name
    patch.mutate(
      { id: summary.brand.id, patch: { enabled: next } },
      {
        onSuccess: () => {
          if (next) toast.success(t('brands.activated', { count: summary.counts.lines, name }))
          else toastUndo(t('brands.deactivated', { name }), () => patch.mutate({ id: summary.brand.id, patch: { enabled: true } }))
        },
        onError: (error) => toast.error(humanError(error)),
      },
    )
  }

  const linesOf = (summary: CatalogBrandSummary) =>
    (catalog?.lines ?? [])
      .filter((l) => l.brandId === summary.brand.id)
      .map((l) => readiness.get(l.id))
      .filter((r): r is LineReadiness => Boolean(r))

  const coverage = (summary: CatalogBrandSummary) => {
    const total = summary.counts.priced + summary.counts.unpriced
    return total ? Math.round((summary.counts.priced / total) * 100) : null
  }

  const columns: DataTableColumn<CatalogBrandSummary>[] = [
    {
      id: 'brand',
      header: t('brands.colBrand'),
      value: (s) => s.brand.name,
      cell: (s) => {
        const lines = linesOf(s)
        const ready = lines.filter((r) => r.state === 'ready').length
        return (
          <>
            <span className="block truncate">
              <span className="font-medium text-fg-strong">{s.brand.name}</span>
              <span className="ml-2 text-table text-fg-muted">{brandKindLabel(s.brand.kind, t.locale)}</span>
            </span>
            {/* En el teléfono no cabe la columna Líneas: el estado va bajo el nombre. */}
            {lines.length ? (
              <span className="block truncate text-table text-fg-muted sm:hidden">
                {t.rich('brands.readyOf', { count: lines.length, ready: fmt.number(ready), b: <span className="tabular" /> })}
              </span>
            ) : null}
          </>
        )
      },
    },
    {
      id: 'lines',
      header: t('brands.colLines'),
      width: 236,
      hideBelow: 'sm',
      sortable: false,
      cell: (s) => {
        const lines = linesOf(s)
        const ready = lines.filter((r) => r.state === 'ready').length
        return lines.length ? t.rich('brands.readyOf', { count: lines.length, ready: fmt.number(ready), b: <span className="font-medium text-fg-strong tabular" /> }) : <span className="text-fg-muted">{t('brands.lines', { count: s.counts.lines })}</span>
      },
    },
    {
      id: 'prices',
      header: t('brands.pricesLoaded'),
      width: 290,
      hideBelow: 'md',
      value: (s) => coverage(s),
      cell: (s) => {
        const pct = coverage(s)
        const lines = linesOf(s)
        const missing = [...new Set(lines.flatMap((r) => (r.state === 'ready' ? [] : missingPriceKeys(r))))]
        return (
          <span className="flex items-center gap-3">
            <Meter value={pct ?? 0} max={100} tone="neutral" aria-label={t('brands.coverageLabel')} className="w-16" />
            <span className="w-9 text-right text-fg tabular">{pct === null ? t('common.noneDash') : fmt.pct(pct)}</span>
            {missing.length && onCompletePrices ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onCompletePrices({ label: t('brands.missingIn', { name: s.brand.name }), keys: missing })
                }}
                className="text-table font-medium whitespace-nowrap text-accent-ink hover:underline"
              >
                {t('brands.completePrices')}
              </button>
            ) : null}
          </span>
        )
      },
    },
    {
      id: 'discounts',
      header: t('brands.yourDiscounts'),
      width: 180,
      hideBelow: 'lg',
      sortable: false,
      cell: (s) => {
        const discounts = DISCOUNT_FAMILIES.filter((key) => (s.settings.discounts[key] ?? 0) > 0)
        return discounts.length ? (
          <span className="block truncate text-fg-muted">{discounts.map((key) => `${discountFamilyCopy(key, t.locale).label} −${fmt.pct(s.settings.discounts[key])}`).join(' · ')}</span>
        ) : (
          <span className="text-fg-muted">{t('common.noneDash')}</span>
        )
      },
    },
    {
      id: 'active',
      header: <span className="sr-only">{t('brands.colActive')}</span>,
      width: 64,
      align: 'right',
      sortable: false,
      cell: (s) => (
        <span className="inline-flex" onClick={(event) => event.stopPropagation()}>
          <Switch checked={s.enabled} onCheckedChange={(v) => toggle(s, v)} aria-label={t('brands.activeSwitch', { name: s.brand.name })} />
        </span>
      ),
    },
  ]

  const open = items.find((b) => b.brand.id === openId) ?? null

  if (brands.isLoading) return <SkeletonRows rows={4} columns={4} />

  if (brands.isError) {
    return <EmptyState size="compact" title={t('brands.loadError')} description={humanError(brands.error)} action={<Button onClick={() => brands.refetch()}>{t('common.retry')}</Button>} />
  }

  return (
    <div className="flex flex-col gap-8">
      {enabled.length === 0 ? (
        <EmptyState size="compact" title={t('brands.emptyTitle')} description={t('brands.emptyDescription')} />
      ) : (
        <DataTable
          rows={enabled}
          columns={columns}
          getRowId={(s) => s.brand.id}
          caption={t('brands.yoursTitle')}
          bleed
          onRowClick={(s) => setOpenId(s.brand.id)}
          noun={[t('brands.nounOne'), t('brands.nounOther')]}
        />
      )}

      {hiddenCount > 0 ? (
        <section className="flex flex-col gap-4">
          <button type="button" aria-expanded={moreOpen || enabled.length === 0} onClick={() => setMoreOpen((v) => !v)} className="inline-flex items-center gap-1.5 self-start text-h4 font-medium text-fg-strong">
            {t('brands.moreTitle')}
            <span className="font-normal text-fg-muted tabular">{fmt.number(hiddenCount)}</span>
            <ChevronDown aria-hidden strokeWidth={1.75} className={cn('size-4 text-fg-muted transition-transform duration-100', (moreOpen || enabled.length === 0) && 'rotate-180')} />
          </button>
          {moreOpen || enabled.length === 0 ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Input icon={Search} size="sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('brands.search')} aria-label={t('brands.search')} wrapperClassName="w-full sm:w-56" />
                <SegmentedControl<KindFilter>
                  aria-label={t('brands.kindLabel')}
                  size="sm"
                  value={kind}
                  onValueChange={setKind}
                  options={(['all', 'profiles', 'glass', 'hardware'] as const).map((value) => ({ value, label: t(`brands.kind.${value}`) }))}
                />
              </div>
              {others.length === 0 ? (
                <p className="text-fg-muted">{q ? t('brands.noMatch', { q }) : t('brands.allActive')}</p>
              ) : (
                <ul className="-mx-3 grid gap-x-10 rounded-panel bg-plate px-3 py-1 shadow-plate sm:grid-cols-2 2xl:grid-cols-3">
                  {others.map((summary) => (
                    <CompactBrand key={summary.brand.id} summary={summary} onToggle={(v) => toggle(summary, v)} onOpen={() => setOpenId(summary.brand.id)} />
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </section>
      ) : null}

      <BrandSettingsSheet summary={open} catalog={catalog} onOpenChange={(v) => !v && setOpenId(null)} />
    </div>
  )
}

function CompactBrand({
  summary,
  onToggle,
  onOpen,
}: {
  summary: CatalogBrandSummary
  onToggle: (v: boolean) => void
  onOpen: () => void
}) {
  const t = useT(es)
  const fmt = useFormat()
  const { brand, counts } = summary
  const total = counts.priced + counts.unpriced
  const coverage = total ? Math.round((counts.priced / total) * 100) : 0
  const detail = [
    counts.lines ? t('brands.lines', { count: counts.lines }) : brandKindLabel(brand.kind, t.locale),
    total ? (coverage === 0 ? t('brands.noPrices') : t('brands.coverage', { pct: fmt.pct(coverage) })) : null,
  ].filter(Boolean)
  return (
    <li className="flex min-h-11 items-center gap-3 py-1.5">
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 rounded-xs text-left">
        <span className="block truncate text-fg-strong">
          {brand.name}
          {summary.recommended ? <span className="ml-2 text-table text-fg-muted">{t('brands.recommended')}</span> : null}
        </span>
        <span className="block truncate text-meta text-fg-muted">{detail.join(' · ')}</span>
      </button>
      <Switch checked={summary.enabled} onCheckedChange={onToggle} aria-label={t('brands.activateSwitch', { name: brand.name })} size="sm" />
    </li>
  )
}
