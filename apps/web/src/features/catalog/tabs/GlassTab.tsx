import { useMemo, useState } from 'react'
import { Info, RotateCcw, Search } from 'lucide-react'
import type { Catalog, GlassKind } from '@framezen/engine'
import { formatCLP } from '@framezen/engine'
import { ApiRequestError, humanError, request } from '../../../lib/api'
import { formatNumber, normalizeSearch } from '../../../lib/format'
import { Badge, DataTable, IconButton, Input, Select, SkeletonRows, toast, toastUndo, type DataTableColumn } from '../../../ui'
import { useCatalogBrands, usePriceOverrides, useSavePrices } from '../api'
import { buildPriceRows, editChange, resetChange, undoFor, type PriceRow } from '../model/prices'
import { FilterChip } from '../parts'

export const GLASS_KIND_LABEL: Record<GlassKind, string> = {
  dvh: 'Termopanel',
  mono: 'Simple',
  laminated: 'Laminado',
  tempered: 'Templado',
  other: 'Otro',
}

type KindFilter = 'all' | GlassKind

/**
 * Proveedor sin la palabra de la familia: «Vidrios PROLINE» → «PROLINE». La lista que se llama
 * solo «Vidrios» (sin proveedor en el origen) se muestra como «Lista general».
 */
export function glassBrandLabel(name: string): string {
  return name.replace(/^vidrios?\b[\s·:-]*/i, '').trim() || 'Lista general'
}

export function GlassTab({ catalog, loading }: { catalog: Catalog | undefined; loading: boolean }) {
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

  const glassById = useMemo(() => new Map((catalog?.glass ?? []).map((g) => [g.id, g])), [catalog])
  const rows = useMemo(
    () =>
      catalog
        ? buildPriceRows({ ...catalog, profiles: [], items: [] }, overrides).sort(
            // Por nombre: el mismo vidrio de dos proveedores queda junto.
            (a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }) || a.brandName.localeCompare(b.brandName, 'es'),
          )
        : [],
    [catalog, overrides],
  )
  const glassBrandOn = (brands.data?.items ?? []).some((b) => b.enabled && b.brand.kind === 'glass')

  // Proveedor y búsqueda: base de los conteos de los chips, que así cuadran con lo que se ve.
  const scoped = useMemo(() => {
    const terms = normalizeSearch(q).split(/\s+/).filter(Boolean)
    return rows.filter((r) => {
      if (brandId !== 'all' && r.brandId !== brandId) return false
      if (terms.length) {
        const g = glassById.get(r.id)
        const text = normalizeSearch(`${r.name} ${g?.composition ?? ''} ${r.brandName}`)
        if (!terms.every((t) => text.includes(t))) return false
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
    return [{ value: 'all', label: 'Todas las marcas' }, ...[...seen].map(([value, label]) => ({ value, label }))]
  }, [rows])

  const commit = (row: PriceRow, value: string | number | null) => {
    if (typeof value !== 'number' || value === row.price) return
    const undo = undoFor([row])
    save.mutate(editChange(row, value, overrides), {
      onSuccess: () =>
        toastUndo(`${row.name}: ${formatCLP(row.price)} → ${formatCLP(value)} el m²`, () => save.mutate(undo), { id: 'glass-change' }),
      onError: (e) => toast.error(humanError(e)),
    })
  }

  const commitMinArea = async (row: PriceRow, value: string | number | null) => {
    const minArea = typeof value === 'number' ? Math.max(0, value) : 0
    setMinAreaLocal((m) => ({ ...m, [row.id]: minArea }))
    try {
      await request(`/catalog/glass/${encodeURIComponent(row.id)}`, { method: 'PATCH', body: { minArea: minArea || null } })
      toast.success(`${row.name}: se cobra un mínimo de ${formatNumber(minArea, 2)} m² por pieza.`, { id: 'glass-min' })
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
      header: 'Vidrio',
      value: (r) => r.name,
      cell: (r) => {
        const g = glassById.get(r.id)
        return (
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-paper-900">{r.name}</span>
            {g?.composition ? <span className="truncate text-meta text-paper-600 max-md:hidden">{g.composition}</span> : null}
          </span>
        )
      },
    },
    ...(manyBrands
      ? [
          {
            id: 'brand',
            header: 'Proveedor',
            width: 130,
            hideBelow: 'md' as const,
            value: (r: PriceRow) => glassBrandLabel(r.brandName),
            cell: (r: PriceRow) => (
              <span className="text-paper-600" title={r.brandName}>
                {glassBrandLabel(r.brandName)}
              </span>
            ),
          },
        ]
      : []),
    {
      id: 'kind',
      header: 'Tipo',
      width: 110,
      hideBelow: 'sm',
      value: (r) => GLASS_KIND_LABEL[glassById.get(r.id)?.kind ?? 'other'],
    },
    {
      id: 'thickness',
      header: 'Espesor',
      width: 86,
      align: 'right',
      hideBelow: 'lg',
      value: (r) => glassById.get(r.id)?.thickness ?? null,
      format: (n) => `${formatNumber(n, 1)} mm`,
    },
    {
      id: 'price',
      header: 'Precio m²',
      width: 120,
      align: 'right',
      value: (r) => r.price,
      cell: (r) => (r.price > 0 ? formatCLP(r.price) : <span className="text-warn-600">Sin precio</span>),
      edit: { type: 'money', onCommit: commit, label: (r) => `Precio por m² de ${r.name}` },
    },
    {
      id: 'minArea',
      header: 'Mínimo',
      width: 96,
      align: 'right',
      hideBelow: 'sm',
      value: (r) => minAreaLocal[r.id] ?? r.minArea ?? null,
      cell: (r) => {
        const v = minAreaLocal[r.id] ?? r.minArea
        return v ? `${formatNumber(v, 2)} m²` : <span className="text-paper-600">—</span>
      },
      ...(minAreaLocked ? {} : { edit: { type: 'number' as const, onCommit: (r: PriceRow, v: string | number | null) => void commitMinArea(r, v), label: (r: PriceRow) => `Área mínima de ${r.name}` } }),
    },
    {
      id: 'state',
      header: <span className="sr-only">Estado</span>,
      width: 88,
      sortable: false,
      cell: (r) =>
        r.own ? (
          <span className="flex items-center justify-end gap-0.5">
            <Badge tone="ink" size="sm">
              Tuyo
            </Badge>
            <IconButton
              icon={RotateCcw}
              label="Volver al precio de lista"
              size="sm"
              onClick={() =>
                save.mutate(resetChange(r, overrides), {
                  onSuccess: () => toast.success(`${r.name} volvió al precio de lista.`),
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
        <p className="flex items-start gap-2 rounded-md border border-paper-200 bg-paper-0 px-3.5 py-2.5 text-[13px] leading-[18px] text-paper-600">
          <Info aria-hidden className="mt-px size-4 shrink-0 text-ink-600" strokeWidth={1.75} />
          <span>
            No tienes una marca de vidrios activa, así que ves todos los vidrios del catálogo base. Activa tu proveedor en <strong className="font-medium text-paper-900">Marcas</strong> para
            trabajar solo con los suyos.
          </span>
        </p>
      ) : null}
      {minAreaLocked ? (
        <p className="flex items-start gap-2 rounded-md border border-warn-600/25 bg-warn-50 px-3.5 py-2.5 text-[13px] leading-[18px] text-warn-800">
          <Info aria-hidden className="mt-px size-4 shrink-0" strokeWidth={1.75} />
          Todavía no podemos guardar el área mínima desde aquí. Mientras tanto se cobra el área real de cada vidrio; los precios por m² sí se guardan.
        </p>
      ) : null}
      <div className="flex flex-col gap-3 rounded-lg border border-paper-200 bg-paper-0 p-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input icon={Search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar vidrio: 4+12+4, laminado, low-e…" aria-label="Buscar vidrio" wrapperClassName="sm:flex-1" />
          <Select aria-label="Marca de vidrios" value={brandId} onValueChange={setBrandId} options={brandOptions} className="sm:w-52" />
        </div>
        <div className="scrollbar-quiet -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
          {(['all', 'dvh', 'mono', 'laminated', 'tempered', 'other'] as KindFilter[])
            .filter((k) => k === 'all' || kindCounts[k])
            .map((k) => (
              <FilterChip key={k} active={kind === k} onClick={() => setKind(k)} count={kindCounts[k] ?? 0}>
                {k === 'all' ? 'Todos' : GLASS_KIND_LABEL[k]}
              </FilterChip>
            ))}
          <span aria-hidden className="mx-1 h-4 w-px shrink-0 bg-paper-200" />
          <FilterChip active={missingOnly} onClick={() => setMissingOnly((v) => !v)} count={missing}>
            Sin precio
          </FilterChip>
        </div>
      </div>
      {loading || !catalog ? (
        <div className="overflow-hidden rounded-md border border-paper-200 bg-paper-0">
          <SkeletonRows rows={8} columns={4} />
        </div>
      ) : (
        <>
          <DataTable
            rows={filtered.slice(0, 300)}
            columns={filtered.length > 300 ? columns.map((c) => ({ ...c, sortable: false })) : columns}
            getRowId={(r) => r.key}
            caption="Vidrios con precio por metro cuadrado"
            noun={['vidrio', 'vidrios']}
          />
          <p className="text-center text-[13px] text-paper-600 sm:text-left">
            {filtered.length > 300
              ? `Mostrando 300 de ${formatNumber(filtered.length)}. Busca por espesor o tipo para encontrarlo.`
              : 'El precio es por m² neto. Bajo el área mínima, cada pieza se cobra como si tuviera esa área.'}
          </p>
        </>
      )}
    </div>
  )
}
