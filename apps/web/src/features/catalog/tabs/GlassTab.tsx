import { useMemo, useState } from 'react'
import { RotateCcw, Search } from 'lucide-react'
import type { Catalog, GlassKind } from '@dekopen/engine'
import { ApiRequestError, humanError, request } from '../../../lib/api'
import { normalizeSearch } from '../../../lib/format'
import { useFormat, useGlossary, useT } from '../../../lib/i18n'
import { DataTable, IconButton, Input, Notice, Select, SkeletonRows, toast, toastUndo, type DataTableColumn } from '../../../ui'
import { useCatalogBrands, usePriceOverrides, useSavePrices } from '../api'
import es from '../i18n/es'
import { buildPriceRows, editChange, resetChange, undoFor, type PriceRow } from '../model/prices'
import { FilterChip } from '../parts'

type KindFilter = 'all' | GlassKind
const KIND_FILTERS: KindFilter[] = ['all', 'dvh', 'mono', 'laminated', 'tempered', 'other']

/**
 * Proveedor sin la palabra de la familia: «Vidrios PROLINE» → «PROLINE». La lista que se llama
 * solo «Vidrios» (sin proveedor en el origen) se muestra como «Lista general» (`general`).
 */
export function glassBrandLabel(name: string, general = 'Lista general'): string {
  return name.replace(/^vidrios?\b[\s·:-]*/i, '').trim() || general
}

export function GlassTab({ catalog, loading }: { catalog: Catalog | undefined; loading: boolean }) {
  const t = useT(es)
  const g = useGlossary()
  const fmt = useFormat()
  const overridesQuery = usePriceOverrides()
  const overrides = useMemo(() => overridesQuery.data?.overrides ?? [], [overridesQuery.data])
  const brands = useCatalogBrands()
  const save = useSavePrices()
  const [q, setQ] = useState('')
  const [brandId, setBrandId] = useState('all')
  const [kind, setKind] = useState<KindFilter>('all')
  const [missingOnly, setMissingOnly] = useState(false)
  const [minAreaLocked, setMinAreaLocked] = useState(false)
  const [minAreaLocal, setMinAreaLocal] = useState<Record<string, number>>({})
  const general = t('glass.generalList')

  const glassById = useMemo(() => new Map((catalog?.glass ?? []).map((glass) => [glass.id, glass])), [catalog])
  const rows = useMemo(
    () =>
      catalog
        ? buildPriceRows({ ...catalog, profiles: [], items: [] }, overrides, t.locale).sort(
            // Por nombre: el mismo vidrio de dos proveedores queda junto.
            (a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }) || a.brandName.localeCompare(b.brandName, 'es'),
          )
        : [],
    [catalog, overrides, t.locale],
  )
  const glassBrandOn = (brands.data?.items ?? []).some((b) => b.enabled && b.brand.kind === 'glass')

  // Proveedor y búsqueda: base de los conteos de los chips, que así cuadran con lo que se ve.
  const scoped = useMemo(() => {
    const terms = normalizeSearch(q).split(/\s+/).filter(Boolean)
    return rows.filter((r) => {
      if (brandId !== 'all' && r.brandId !== brandId) return false
      if (terms.length) {
        const glass = glassById.get(r.id)
        const text = normalizeSearch(`${r.name} ${glass?.composition ?? ''} ${r.brandName}`)
        if (!terms.every((term) => text.includes(term))) return false
      }
      return true
    })
  }, [rows, glassById, q, brandId])
  const ofKind = (r: PriceRow) => kind === 'all' || glassById.get(r.id)?.kind === kind
  const filtered = useMemo(
    () => scoped.filter((r) => (kind === 'all' || glassById.get(r.id)?.kind === kind) && (!missingOnly || !(r.price > 0))),
    [scoped, glassById, kind, missingOnly],
  )

  const kindCounts = useMemo(() => {
    const base = missingOnly ? scoped.filter((r) => !(r.price > 0)) : scoped
    const out: Partial<Record<KindFilter, number>> = { all: base.length }
    for (const r of base) {
      const k = glassById.get(r.id)?.kind ?? 'other'
      out[k] = (out[k] ?? 0) + 1
    }
    return out
  }, [scoped, glassById, missingOnly])
  const missing = scoped.filter((r) => ofKind(r) && !(r.price > 0)).length
  // Con un solo proveedor a la vista la columna repetiría lo mismo en cada fila.
  const manyBrands = useMemo(() => new Set(filtered.map((r) => r.brandId)).size > 1, [filtered])

  const brandOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const r of rows) if (!seen.has(r.brandId)) seen.set(r.brandId, r.brandName)
    return [{ value: 'all', label: t('common.allBrands') }, ...[...seen].map(([value, label]) => ({ value, label }))]
  }, [rows, t])

  const commit = (row: PriceRow, value: string | number | null) => {
    if (typeof value !== 'number' || value === row.price) return
    const undo = undoFor([row])
    save.mutate(editChange(row, value, overrides), {
      onSuccess: () => toastUndo(t('glass.changed', { name: row.name, before: fmt.money(row.price), after: fmt.money(value) }), () => save.mutate(undo), { id: 'glass-change' }),
      onError: (e) => toast.error(humanError(e)),
    })
  }

  const commitMinArea = async (row: PriceRow, value: string | number | null) => {
    const minArea = typeof value === 'number' ? Math.max(0, value) : 0
    setMinAreaLocal((m) => ({ ...m, [row.id]: minArea }))
    try {
      await request(`/catalog/glass/${encodeURIComponent(row.id)}`, { method: 'PATCH', body: { minArea: minArea || null } })
      toast.success(t('glass.minSaved', { name: row.name, area: fmt.area(minArea) }), { id: 'glass-min' })
    } catch (error) {
      if (error instanceof ApiRequestError && (error.status === 404 || error.status === 405)) {
        setMinAreaLocked(true)
        setMinAreaLocal((m) => {
          const next = { ...m }
          delete next[row.id]
          return next
        })
      } else toast.error(humanError(error))
    }
  }

  const columns: DataTableColumn<PriceRow>[] = [
    {
      id: 'name',
      header: t('glass.colName'),
      value: (r) => r.name,
      cell: (r) => {
        const glass = glassById.get(r.id)
        return (
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-fg">{r.name}</span>
            {glass?.composition ? <span className="truncate text-meta text-fg-muted tabular max-md:hidden">{glass.composition}</span> : null}
          </span>
        )
      },
    },
    ...(manyBrands
      ? [
          {
            id: 'brand',
            header: t('glass.colBrand'),
            width: 130,
            hideBelow: 'md' as const,
            value: (r: PriceRow) => glassBrandLabel(r.brandName, general),
            cell: (r: PriceRow) => (
              <span className="text-fg-muted" title={r.brandName}>
                {glassBrandLabel(r.brandName, general)}
              </span>
            ),
          },
        ]
      : []),
    {
      id: 'kind',
      header: t('glass.colKind'),
      width: 168,
      hideBelow: 'sm',
      value: (r) => g.glassKind(glassById.get(r.id)?.kind ?? 'other'),
    },
    {
      id: 'thickness',
      header: t('glass.colThickness'),
      width: 92,
      align: 'right',
      hideBelow: 'lg',
      value: (r) => glassById.get(r.id)?.thickness ?? null,
      format: (n) => <span className="tabular">{fmt.mm(n, { unit: true })}</span>,
    },
    {
      id: 'price',
      header: t('glass.colPrice'),
      width: 120,
      align: 'right',
      value: (r) => r.price,
      cell: (r) => (r.price > 0 ? <span className="tabular">{fmt.money(r.price)}</span> : <span className="text-warning">{t('common.noPrice')}</span>),
      edit: { type: 'money', onCommit: commit, label: (r) => t('glass.pricePer', { name: r.name }) },
    },
    {
      id: 'minArea',
      header: t('glass.colMin'),
      width: 96,
      align: 'right',
      hideBelow: 'sm',
      value: (r) => minAreaLocal[r.id] ?? r.minArea ?? null,
      cell: (r) => {
        const v = minAreaLocal[r.id] ?? r.minArea
        return v ? <span className="tabular">{fmt.area(v)}</span> : <span className="text-fg-muted">{t('common.noneDash')}</span>
      },
      ...(minAreaLocked
        ? {}
        : { edit: { type: 'number' as const, onCommit: (r: PriceRow, v: string | number | null) => void commitMinArea(r, v), label: (r: PriceRow) => t('glass.minAreaOf', { name: r.name }) } }),
    },
    {
      id: 'state',
      header: <span className="sr-only">{t('glass.colState')}</span>,
      width: 88,
      sortable: false,
      cell: (r) =>
        r.own ? (
          <span className="flex items-center justify-end gap-0.5">
            <span className="text-table text-fg-muted">{t('common.yours')}</span>
            <IconButton
              icon={RotateCcw}
              label={t('common.resetToList')}
              size="sm"
              onClick={() =>
                save.mutate(resetChange(r, overrides), {
                  onSuccess: () => toast.success(t('common.resetDone', { name: r.name })),
                  onError: (e) => toast.error(humanError(e)),
                })
              }
            />
          </span>
        ) : null,
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      {!glassBrandOn && rows.length ? (
        <Notice tone="neutral" size="compact">
          {t.rich('glass.noGlassBrand', { b: <strong className="font-medium text-fg-strong" /> })}
        </Notice>
      ) : null}
      {minAreaLocked ? (
        <Notice tone="warning" size="compact">
          {t('glass.minAreaLocked')}
        </Notice>
      ) : null}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input icon={Search} size="sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('glass.search')} aria-label={t('glass.searchLabel')} wrapperClassName="sm:flex-1" />
          <Select aria-label={t('glass.brandLabel')} value={brandId} onValueChange={setBrandId} options={brandOptions} size="sm" className="sm:w-52" />
        </div>
        <div className="scrollbar-quiet -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
          {KIND_FILTERS.filter((k) => k === 'all' || kindCounts[k]).map((k) => (
            <FilterChip key={k} active={kind === k} onClick={() => setKind(k)} count={kindCounts[k] ?? 0}>
              {k === 'all' ? t('glass.all') : g.glassKind(k)}
            </FilterChip>
          ))}
          <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-divider" />
          <FilterChip active={missingOnly} onClick={() => setMissingOnly((v) => !v)} count={missing}>
            {t('glass.missing')}
          </FilterChip>
        </div>
      </div>
      {loading || !catalog ? (
        <SkeletonRows rows={8} columns={4} />
      ) : (
        <>
          <DataTable
            rows={filtered.slice(0, 300)}
            columns={filtered.length > 300 ? columns.map((c) => ({ ...c, sortable: false })) : columns}
            getRowId={(r) => r.key}
            caption={t('glass.caption')}
            density="compact"
            bleed
            noun={[t('glass.nounOne'), t('glass.nounOther')]}
          />
          <p className="text-center text-table text-fg-muted sm:text-left">
            {filtered.length > 300 ? t('glass.showing', { shown: fmt.number(300), total: fmt.number(filtered.length) }) : t('glass.footer')}
          </p>
        </>
      )}
    </div>
  )
}
