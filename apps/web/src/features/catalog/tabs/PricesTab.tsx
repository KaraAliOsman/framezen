import { useEffect, useMemo, useState } from 'react'
import { Percent, RotateCcw, Search, X } from 'lucide-react'
import type { Catalog } from '@dekopen/engine'
import type { PriceOverride } from '@dekopen/shared'
import { humanError } from '../../../lib/api'
import { cn } from '../../../lib/cn'
import { useFormat, useGlossary, useT } from '../../../lib/i18n'
import { Button, DataTable, IconButton, Input, Select, SkeletonRows, toast, toastUndo, type DataTableColumn } from '../../../ui'
import { usePriceOverrides, useSavePrices } from '../api'
import es from '../i18n/es'
import {
  activeFilterCount,
  buildPriceRows,
  editChange,
  EMPTY_FILTERS,
  familyLabel,
  filterRows,
  missingByFamily,
  resetChange,
  sortRows,
  undoFor,
  type FamilyFilter,
  type PriceChange,
  type PriceFilters,
  type PriceRow,
} from '../model/prices'
import { FilterChip, Swatch } from '../parts'
import { useWide } from '../useWide'
import { BulkAdjust } from './BulkAdjust'

const PAGE = 200
const FAMILY_FILTERS: FamilyFilter[] = ['all', 'profile', 'reinforcement', 'hardware', 'accessory']

export function PricesTab({
  catalog,
  loading,
  filters,
  onFiltersChange,
}: {
  catalog: Catalog | undefined
  loading: boolean
  filters: PriceFilters
  onFiltersChange: (f: PriceFilters) => void
}) {
  const t = useT(es)
  const g = useGlossary()
  const fmt = useFormat()
  const overridesQuery = usePriceOverrides()
  const overrides = useMemo(() => overridesQuery.data?.overrides ?? [], [overridesQuery.data])
  const save = useSavePrices()
  const [limit, setLimit] = useState(PAGE)
  // Bajo 1.280 px se esconden «Línea» y «Se compra por» antes que achicar el nombre del artículo.
  const wide = useWide()
  const locale = t.locale

  const colors = useMemo(() => new Map((catalog?.colors ?? []).map((c) => [c.id, c])), [catalog])
  const colorNames = useMemo(() => new Map((catalog?.colors ?? []).map((c) => [c.id, c.name])), [catalog])
  const colorOrder = useMemo(() => new Map((catalog?.colors ?? []).map((c, i) => [c.id, i])), [catalog])

  const allRows = useMemo(
    () => (catalog ? sortRows(buildPriceRows(catalog, overrides, locale).filter((r) => r.family !== 'glass'), colorOrder) : []),
    [catalog, overrides, colorOrder, locale],
  )
  const filtered = useMemo(() => filterRows(allRows, filters, colorNames), [allRows, filters, colorNames])
  const missing = useMemo(() => missingByFamily(allRows), [allRows])
  const missingTotal = missing.profile + missing.reinforcement + missing.hardware + missing.accessory
  const ownTotal = useMemo(() => allRows.filter((r) => r.own).length, [allRows])
  const familyCounts = useMemo(() => {
    const base = filterRows(allRows, { ...filters, family: 'all' }, colorNames)
    const out: Record<FamilyFilter, number> = { all: base.length, profile: 0, reinforcement: 0, hardware: 0, accessory: 0 }
    for (const r of base) if (r.family !== 'glass') out[r.family]++
    return out
  }, [allRows, filters, colorNames])

  useEffect(() => setLimit(PAGE), [filters])

  const set = (patch: Partial<PriceFilters>) => onFiltersChange({ ...filters, ...patch })

  // Opciones de filtros: solo marcas y líneas con filas, colores con perfiles.
  const brandOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of allRows) if (!seen.has(r.brandId)) seen.set(r.brandId, r.brandName)
    return [{ value: 'all', label: t('common.allBrands') }, ...[...seen].sort((a, b) => a[1].localeCompare(b[1], 'es')).map(([value, label]) => ({ value, label }))]
  }, [allRows, t])
  const lineOptions = useMemo(() => {
    const lines = (catalog?.lines ?? []).filter((l) => filters.brandId === 'all' || l.brandId === filters.brandId)
    const brandName = new Map((catalog?.brands ?? []).map((b) => [b.id, b.name]))
    return [
      { value: 'all', label: t('prices.allLines') },
      ...lines.map((l) => ({ value: l.id, label: l.name, description: filters.brandId === 'all' ? brandName.get(l.brandId) : undefined })),
    ]
  }, [catalog, filters.brandId, t])
  const colorOptions = useMemo(() => {
    const used = new Set(allRows.map((r) => r.colorId).filter(Boolean))
    return [
      { value: 'all', label: t('prices.allColors') },
      ...(catalog?.colors ?? []).filter((c) => used.has(c.id)).map((c) => ({ value: c.id, label: c.name, leading: <Swatch color={c} size={14} /> })),
    ]
  }, [catalog, allRows, t])

  const apply = (change: PriceChange, message: string, undo: PriceChange) => {
    save.mutate(change, {
      onSuccess: () =>
        toastUndo(message, () => save.mutate(undo, { onSuccess: () => toast.success(t('prices.undone')), onError: (e) => toast.error(humanError(e)) }), {
          id: 'price-change',
        }),
      onError: (error) => toast.error(humanError(error)),
    })
  }

  const label = (row: PriceRow) => {
    const color = row.colorId ? colorNames.get(row.colorId) : undefined
    const colorText = color ? (locale === 'es' ? color.toLocaleLowerCase('es-CL') : color) : ''
    return `${row.code ? `${row.code} ` : ''}${row.name}${colorText ? ` ${colorText}` : ''}`.trim()
  }

  const commitPrice = (row: PriceRow, value: string | number | null) => {
    if (typeof value !== 'number' || value === row.price) return
    apply(editChange(row, value, overrides), t('prices.changed', { label: label(row), before: fmt.money(row.price), after: fmt.money(value) }), undoFor([row]))
  }

  const reset = (row: PriceRow) => {
    apply(resetChange(row, overrides), t('common.resetDone', { name: label(row) }), undoForReset(row, overrides))
  }

  const columns = useMemo<DataTableColumn<PriceRow>[]>(
    () => [
      {
        id: 'item',
        header: t('prices.colItem'),
        value: (r) => `${r.code} ${r.name}`,
        // El nombre es lo que se busca: desde tablet nunca baja de 260 px (antes se esconden las columnas
        // secundarias). En teléfono el código va bajo el nombre y la celda se adapta.
        className: 'sm:min-w-[260px]',
        cell: (r) => {
          const where = r.lineName ?? r.brandName
          return (
            <span className="flex min-w-0 flex-col-reverse sm:flex-row sm:items-baseline sm:gap-2">
              {r.code ? <span title={r.code} className="code-id truncate text-meta text-fg-muted sm:w-[5.5rem] sm:shrink-0">{r.code}</span> : null}
              <span className="min-w-0 truncate text-fg" title={wide || !where ? r.name : `${r.name} · ${where}`}>
                {r.name}
                {/* Sin la columna Línea, la línea va a continuación del nombre, atenuada. */}
                {!wide && where ? <span className="text-fg-muted"> · {where}</span> : null}
              </span>
            </span>
          )
        },
      },
      {
        id: 'line',
        header: t('prices.colLine'),
        width: 216,
        value: (r) => r.lineName ?? r.brandName,
        cell: (r) => (
          <span className="block truncate text-fg-muted">
            {r.lineName ? (
              <>
                <span className="text-fg">{r.lineName}</span>
                {r.role ? ` · ${g.profileRole(r.role)}` : null}
              </>
            ) : (
              r.brandName
            )}
          </span>
        ),
      },
      {
        id: 'color',
        header: t('prices.colColor'),
        width: 140,
        hideBelow: 'sm',
        value: (r) => (r.colorId ? (colorNames.get(r.colorId) ?? r.colorId) : ''),
        cell: (r) =>
          r.colorId ? (
            <span className="flex items-center gap-1.5 truncate">
              <Swatch color={colors.get(r.colorId)} size={14} />
              <span className="truncate">{colorNames.get(r.colorId) ?? r.colorId}</span>
            </span>
          ) : (
            <span className="text-fg-muted">{r.family === 'reinforcement' ? t('prices.allColorsShort') : t('common.noneDash')}</span>
          ),
      },
      { id: 'unit', header: t('prices.colUnit'), width: 132, value: (r) => r.unit, cell: (r) => <span className="text-fg-muted">{r.unit}</span> },
      {
        id: 'price',
        header: t('prices.colPrice'),
        width: 120,
        align: 'right',
        value: (r) => r.price,
        cell: (r) => (
          <span className="inline-flex items-center gap-1.5">
            {r.own ? <span aria-label={t('common.yoursHint')} className="size-1.5 shrink-0 rounded-full bg-accent sm:hidden" /> : null}
            {r.price > 0 ? <span className="tabular">{fmt.money(r.price)}</span> : <span className="text-warning">{t('common.noPrice')}</span>}
          </span>
        ),
        edit: { type: 'money', onCommit: commitPrice, label: (r) => t('prices.priceOf', { label: label(r) }) },
      },
      {
        id: 'state',
        header: <span className="sr-only">{t('prices.colState')}</span>,
        width: 92,
        sortable: false,
        hideBelow: 'sm',
        cell: (r) =>
          r.own ? (
            <span className="flex items-center justify-end gap-0.5">
              <span className="text-table text-fg-muted">{t('common.yours')}</span>
              <IconButton icon={RotateCcw} label={t('common.resetToList')} size="sm" onClick={() => reset(r)} />
            </span>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colors, colorNames, overrides, wide, t, g, fmt],
  )
  const shownColumns = useMemo(() => (wide ? columns : columns.filter((c) => c.id !== 'line' && c.id !== 'unit')), [columns, wide])

  const focusPending = useMemo(() => (filters.focus ? filtered.filter((r) => !(r.price > 0)).length : 0), [filters.focus, filtered])
  const truncated = filtered.length > limit
  const visible = truncated ? filtered.slice(0, limit) : filtered
  const tableColumns = useMemo(() => (truncated ? shownColumns.map((c) => ({ ...c, sortable: false })) : shownColumns), [shownColumns, truncated])
  const filtersOn = activeFilterCount(filters)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {/* El buscador ocupa su fila hasta 1.280 px: con los filtros al lado se cortaba el texto. */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            icon={Search}
            size="sm"
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder={t('prices.search')}
            aria-label={t('prices.searchLabel')}
            wrapperClassName="basis-full xl:min-w-[260px] xl:flex-1 xl:basis-0"
          />
          <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 xl:flex xl:w-auto">
            <Select aria-label={t('prices.brand')} value={filters.brandId} onValueChange={(v) => set({ brandId: v, lineId: 'all' })} options={brandOptions} size="sm" className="xl:w-44" />
            <Select aria-label={t('prices.line')} value={filters.lineId} onValueChange={(v) => set({ lineId: v })} options={lineOptions} size="sm" className="xl:w-44" />
            <Select aria-label={t('prices.color')} value={filters.colorId} onValueChange={(v) => set({ colorId: v })} options={colorOptions} size="sm" className="col-span-2 sm:col-span-1 xl:w-44" />
          </div>
        </div>
        {/* En teléfono los chips se deslizan; desde tablet hacen salto de línea en vez de cortarse. */}
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="scrollbar-quiet -mx-1 flex min-w-0 items-center gap-1.5 overflow-x-auto px-1 pb-0.5 md:flex-wrap md:overflow-visible">
            {filters.focus ? (
              <>
                <FilterChip active onClick={() => set({ focus: null })}>
                  {filters.focus.label}
                  <X aria-label={t('common.remove')} className="size-3.5" strokeWidth={1.75} />
                </FilterChip>
                <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-divider" />
              </>
            ) : null}
            {FAMILY_FILTERS.map((family) => (
              <FilterChip key={family} active={filters.family === family} onClick={() => set({ family })} count={familyCounts[family]}>
                {family === 'all' ? t('prices.familyAll') : familyLabel(family, locale)}
              </FilterChip>
            ))}
            <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-divider" />
            <FilterChip active={filters.missing} onClick={() => set({ missing: !filters.missing })} count={missingTotal}>
              {t('prices.missing')}
            </FilterChip>
            <FilterChip active={filters.own} onClick={() => set({ own: !filters.own })} count={ownTotal}>
              {t('prices.own')}
            </FilterChip>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 md:justify-end">
            {filtersOn > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => onFiltersChange(EMPTY_FILTERS)}>
                {t('common.clearFilters')}
              </Button>
            ) : null}
            <BulkAdjust
              rows={filtered}
              disabled={!filtered.length}
              colorNames={colorNames}
              onApply={(result, pct) =>
                apply(
                  result.change,
                  t(pct > 0 ? 'prices.bulkUp' : 'prices.bulkDown', { count: result.changed, pct: fmt.pct(Math.abs(pct)) }),
                  result.undo,
                )
              }
              trigger={
                <Button size="sm" icon={Percent} disabled={!filtered.length}>
                  {filtersOn ? t('prices.adjustFiltered') : t('prices.adjustAll')}
                </Button>
              }
            />
          </div>
        </div>
      </div>

      {filters.focus && catalog ? (
        <p className={cn('-mt-1 text-table', focusPending ? 'text-fg-muted' : 'text-success')}>
          {focusPending ? t('prices.focusPending', { count: focusPending }) : t('prices.focusDone')}
        </p>
      ) : null}

      {loading || !catalog ? (
        <SkeletonRows rows={8} columns={4} />
      ) : (
        <>
          <DataTable
            rows={visible}
            columns={tableColumns}
            getRowId={(r) => r.key}
            caption={t('prices.caption')}
            density="compact"
            bleed
            noun={[t('prices.nounOne'), t('prices.nounOther')]}
            onClearFilters={filtersOn ? () => onFiltersChange(EMPTY_FILTERS) : undefined}
          />
          <div className="flex flex-col items-center gap-2 text-table text-fg-muted sm:flex-row sm:justify-between">
            <span>
              {truncated
                ? t('prices.showing', { shown: fmt.number(visible.length), total: fmt.number(filtered.length) })
                : filtersOn
                  ? t('prices.countOf', { count: filtered.length, total: fmt.number(allRows.length) })
                  : t('prices.count', { count: filtered.length })}
            </span>
            {truncated ? (
              <Button size="sm" onClick={() => setLimit((l) => l + PAGE * 2)}>
                {t('prices.showMore', { count: fmt.number(Math.min(PAGE * 2, filtered.length - visible.length)) })}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}

/** Deshacer «volver al precio de lista»: repone los precios propios que había. */
function undoForReset(row: PriceRow, overrides: readonly PriceOverride[]): PriceChange {
  const own = overrides.filter((o) => o.kind === row.kind && o.id === row.id && (row.colorId === undefined || o.colorId === row.colorId))
  return { overrides: own.length ? own : [{ kind: row.kind, id: row.id, ...(row.colorId ? { colorId: row.colorId } : {}), price: row.price }], remove: [] }
}
