import { useEffect, useMemo, useState } from 'react'
import { Percent, RotateCcw, Search, X } from 'lucide-react'
import type { Catalog } from '@framezen/engine'
import { formatCLP } from '@framezen/engine'
import type { PriceOverride } from '@framezen/shared'
import { humanError } from '../../../lib/api'
import { cn } from '../../../lib/cn'
import { formatNumber } from '../../../lib/format'
import {
  Badge,
  Button,
  DataTable,
  IconButton,
  Input,
  Select,
  SkeletonRows,
  toast,
  toastUndo,
  type DataTableColumn,
} from '../../../ui'
import { usePriceOverrides, useSavePrices } from '../api'
import {
  activeFilterCount,
  buildPriceRows,
  editChange,
  EMPTY_FILTERS,
  FAMILY_LABEL,
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
import { ROLE_LABEL } from '../model/labels'
import { FilterChip, Swatch } from '../parts'
import { useWide } from '../useWide'
import { BulkAdjust } from './BulkAdjust'

const PAGE = 200

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
  const overridesQuery = usePriceOverrides()
  const overrides = useMemo(() => overridesQuery.data?.overrides ?? [], [overridesQuery.data])
  const save = useSavePrices()
  const [limit, setLimit] = useState(PAGE)
  // Bajo 1.280 px se esconden «Línea» y «Se compra por» antes que achicar el nombre del artículo.
  const wide = useWide()

  const colors = useMemo(() => new Map((catalog?.colors ?? []).map((c) => [c.id, c])), [catalog])
  const colorNames = useMemo(() => new Map((catalog?.colors ?? []).map((c) => [c.id, c.name])), [catalog])
  const colorOrder = useMemo(() => new Map((catalog?.colors ?? []).map((c, i) => [c.id, i])), [catalog])

  const allRows = useMemo(
    () => (catalog ? sortRows(buildPriceRows(catalog, overrides).filter((r) => r.family !== 'glass'), colorOrder) : []),
    [catalog, overrides, colorOrder],
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
    return [{ value: 'all', label: 'Todas las marcas' }, ...[...seen].sort((a, b) => a[1].localeCompare(b[1], 'es')).map(([value, label]) => ({ value, label }))]
  }, [allRows])
  const lineOptions = useMemo(() => {
    const lines = (catalog?.lines ?? []).filter((l) => filters.brandId === 'all' || l.brandId === filters.brandId)
    const brandName = new Map((catalog?.brands ?? []).map((b) => [b.id, b.name]))
    return [
      { value: 'all', label: 'Todas las líneas' },
      ...lines.map((l) => ({ value: l.id, label: l.name, description: filters.brandId === 'all' ? brandName.get(l.brandId) : undefined })),
    ]
  }, [catalog, filters.brandId])
  const colorOptions = useMemo(() => {
    const used = new Set(allRows.map((r) => r.colorId).filter(Boolean))
    return [
      { value: 'all', label: 'Todos los colores' },
      ...(catalog?.colors ?? []).filter((c) => used.has(c.id)).map((c) => ({ value: c.id, label: c.name, leading: <Swatch color={c} size={12} /> })),
    ]
  }, [catalog, allRows])

  const apply = (change: PriceChange, message: string, undo: PriceChange, undoMessage = 'Volvimos a los precios anteriores.') => {
    save.mutate(change, {
      onSuccess: () =>
        toastUndo(message, () => save.mutate(undo, { onSuccess: () => toast.success(undoMessage), onError: (e) => toast.error(humanError(e)) }), {
          id: 'price-change',
        }),
      onError: (error) => toast.error(humanError(error)),
    })
  }

  const label = (row: PriceRow) => `${row.code ? `${row.code} ` : ''}${row.name}${row.colorId ? ` ${colorNames.get(row.colorId)?.toLowerCase() ?? ''}` : ''}`.trim()

  const commitPrice = (row: PriceRow, value: string | number | null) => {
    if (typeof value !== 'number' || value === row.price) return
    apply(editChange(row, value, overrides), `${label(row)}: ${formatCLP(row.price)} → ${formatCLP(value)}`, undoFor([row]))
  }

  const reset = (row: PriceRow) => {
    apply(resetChange(row, overrides), `${label(row)} volvió al precio de lista.`, undoForReset(row, overrides))
  }

  const columns = useMemo<DataTableColumn<PriceRow>[]>(
    () => [
      {
        id: 'item',
        header: 'Artículo',
        value: (r) => `${r.code} ${r.name}`,
        // El nombre es lo que se busca: desde tablet nunca baja de 260 px (antes se esconden las columnas
        // secundarias). En teléfono el código va bajo el nombre y la celda se adapta.
        className: 'sm:min-w-[260px]',
        cell: (r) => {
          const where = r.lineName ?? r.brandName
          return (
            <span className="flex min-w-0 flex-col-reverse sm:flex-row sm:items-baseline sm:gap-2">
              {r.code ? <span className="truncate font-mono text-[11px] leading-4 text-paper-600 sm:shrink-0 sm:text-[12px]">{r.code}</span> : null}
              <span className="min-w-0 truncate text-paper-900" title={wide || !where ? r.name : `${r.name} · ${where}`}>
                {r.name}
                {/* Sin la columna Línea, la línea va a continuación del nombre, atenuada. */}
                {!wide && where ? <span className="text-paper-600"> · {where}</span> : null}
              </span>
            </span>
          )
        },
      },
      {
        id: 'line',
        header: 'Línea',
        width: 180,
        value: (r) => r.lineName ?? r.brandName,
        cell: (r) => (
          <span className="block truncate text-paper-600">
            {r.lineName ? (
              <>
                <span className="text-paper-900">{r.lineName}</span>
                {r.role ? ` · ${ROLE_LABEL[r.role]}` : null}
              </>
            ) : (
              r.brandName
            )}
          </span>
        ),
      },
      {
        id: 'color',
        header: 'Color',
        width: 140,
        hideBelow: 'sm',
        value: (r) => (r.colorId ? colorNames.get(r.colorId) ?? r.colorId : ''),
        cell: (r) =>
          r.colorId ? (
            <span className="flex items-center gap-1.5 truncate">
              <Swatch color={colors.get(r.colorId)} size={12} />
              <span className="truncate">{colorNames.get(r.colorId) ?? r.colorId}</span>
            </span>
          ) : (
            <span className="text-paper-600">{r.family === 'reinforcement' ? 'Todos' : '—'}</span>
          ),
      },
      { id: 'unit', header: 'Se compra por', width: 132, value: (r) => r.unit, cell: (r) => <span className="text-paper-600">{r.unit}</span> },
      {
        id: 'price',
        header: 'Precio neto',
        width: 116,
        align: 'right',
        value: (r) => r.price,
        cell: (r) => (
          <span className="inline-flex items-center gap-1.5">
            {r.own ? <span aria-label="Precio tuyo" className="size-1.5 shrink-0 rounded-full bg-ink-600 sm:hidden" /> : null}
            {r.price > 0 ? <span className="tabular">{formatCLP(r.price)}</span> : <span className="text-warn-600">Sin precio</span>}
          </span>
        ),
        edit: { type: 'money', onCommit: commitPrice, label: (r) => `Precio de ${label(r)}` },
      },
      {
        id: 'state',
        header: <span className="sr-only">Estado</span>,
        width: 92,
        sortable: false,
        hideBelow: 'sm',
        cell: (r) =>
          r.own ? (
            <span className="flex items-center justify-end gap-0.5">
              <Badge tone="ink" size="sm">
                Tuyo
              </Badge>
              <IconButton icon={RotateCcw} label="Volver al precio de lista" size="sm" onClick={() => reset(r)} />
            </span>
          ) : null,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [colors, colorNames, overrides, wide],
  )
  const shownColumns = useMemo(() => (wide ? columns : columns.filter((c) => c.id !== 'line' && c.id !== 'unit')), [columns, wide])

  const focusPending = useMemo(() => (filters.focus ? filtered.filter((r) => !(r.price > 0)).length : 0), [filters.focus, filtered])
  const truncated = filtered.length > limit
  const visible = truncated ? filtered.slice(0, limit) : filtered
  const tableColumns = useMemo(() => (truncated ? shownColumns.map((c) => ({ ...c, sortable: false })) : shownColumns), [shownColumns, truncated])
  const filtersOn = activeFilterCount(filters)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-paper-200 bg-paper-0 p-3">
        {/* El buscador ocupa su fila hasta 1.280 px: con los filtros al lado se cortaba el texto. */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            icon={Search}
            value={filters.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Buscar por código, nombre o línea"
            aria-label="Buscar precios"
            wrapperClassName="basis-full xl:min-w-[260px] xl:flex-1 xl:basis-0"
          />
          <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 xl:flex xl:w-auto">
            <Select
              aria-label="Marca"
              value={filters.brandId}
              onValueChange={(v) => set({ brandId: v, lineId: 'all' })}
              options={brandOptions}
              className="xl:w-44"
            />
            <Select aria-label="Línea" value={filters.lineId} onValueChange={(v) => set({ lineId: v })} options={lineOptions} className="xl:w-44" />
            <Select
              aria-label="Color"
              value={filters.colorId}
              onValueChange={(v) => set({ colorId: v })}
              options={colorOptions}
              className="col-span-2 sm:col-span-1 xl:w-44"
            />
          </div>
        </div>
        {/* En teléfono los chips se deslizan; desde tablet hacen salto de línea en vez de cortarse. */}
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="scrollbar-quiet -mx-1 flex min-w-0 items-center gap-1.5 overflow-x-auto px-1 pb-0.5 md:flex-wrap md:overflow-visible">
            {filters.focus ? (
              <>
                <FilterChip active onClick={() => set({ focus: null })}>
                  {filters.focus.label}
                  <X aria-label="Quitar" className="size-3.5" strokeWidth={1.75} />
                </FilterChip>
                <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-paper-200" />
              </>
            ) : null}
            {(['all', 'profile', 'reinforcement', 'hardware', 'accessory'] as FamilyFilter[]).map((family) => (
              <FilterChip key={family} active={filters.family === family} onClick={() => set({ family })} count={familyCounts[family]}>
                {family === 'all' ? 'Todo' : FAMILY_LABEL[family]}
              </FilterChip>
            ))}
            <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-paper-200" />
            <FilterChip active={filters.missing} onClick={() => set({ missing: !filters.missing })} count={missingTotal}>
              <span className={cn('size-1.5 rounded-full', missingTotal ? 'bg-warn-600' : 'bg-ok-600')} aria-hidden />
              Sin precio
            </FilterChip>
            <FilterChip active={filters.own} onClick={() => set({ own: !filters.own })} count={ownTotal}>
              Mis precios
            </FilterChip>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 md:justify-end">
            {filtersOn > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => onFiltersChange(EMPTY_FILTERS)}>
                Quitar filtros
              </Button>
            ) : null}
            <BulkAdjust
              rows={filtered}
              disabled={!filtered.length}
              onApply={(result, pct) =>
                apply(
                  result.change,
                  `${pct > 0 ? 'Subiste' : 'Bajaste'} ${formatNumber(Math.abs(pct), 1)} % a ${formatNumber(result.changed)} ${result.changed === 1 ? 'precio' : 'precios'}.`,
                  result.undo,
                )
              }
              trigger={
                <Button size="sm" icon={Percent} disabled={!filtered.length}>
                  Ajustar {filtersOn ? 'lo filtrado' : 'todo'}
                </Button>
              }
            />
          </div>
        </div>
      </div>

      {filters.focus && catalog ? (
        <p className="-mt-1 text-[13px] leading-[18px] text-paper-600">
          {focusPending ? (
            <>
              Carga estos {formatNumber(focusPending)} {focusPending === 1 ? 'precio' : 'precios'} y la línea queda lista para cotizar. Se guardan solos; cotizas igual mientras tanto.
            </>
          ) : (
            <span className="text-ok-800">Listo: ya no falta ningún precio de esta lista.</span>
          )}
        </p>
      ) : null}

      {loading || !catalog ? (
        <div className="overflow-hidden rounded-md border border-paper-200 bg-paper-0">
          <SkeletonRows rows={8} columns={4} />
        </div>
      ) : (
        <>
          <DataTable
            rows={visible}
            columns={tableColumns}
            getRowId={(r) => r.key}
            caption="Precios de perfiles, refuerzos, herrajes y accesorios"
            noun={['precio', 'precios']}
            onClearFilters={filtersOn ? () => onFiltersChange(EMPTY_FILTERS) : undefined}
          />
          <div className="flex flex-col items-center gap-2 text-[13px] text-paper-600 sm:flex-row sm:justify-between">
            <span>
              {truncated
                ? `Mostrando ${formatNumber(visible.length)} de ${formatNumber(filtered.length)}. Busca o filtra para llegar más rápido.`
                : `${formatNumber(filtered.length)} ${filtered.length === 1 ? 'precio' : 'precios'}${filtersOn ? ` de ${formatNumber(allRows.length)}` : ''}. Clic en un precio para cambiarlo.`}
            </span>
            {truncated ? (
              <Button size="sm" onClick={() => setLimit((l) => l + PAGE * 2)}>
                Mostrar {formatNumber(Math.min(PAGE * 2, filtered.length - visible.length))} más
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
