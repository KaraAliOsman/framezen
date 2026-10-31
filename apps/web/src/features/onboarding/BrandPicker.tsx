import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { humanError } from '../../lib/api'
import { cn } from '../../lib/cn'
import { formatNumber, normalizeSearch } from '../../lib/format'
import { Input } from '../../ui/Input'
import { Skeleton } from '../../ui/Skeleton'
import { Switch } from '../../ui/Switch'
import { toast } from '../../ui/Toaster'
import { useBrands, useToggleBrand, type BrandSummary } from '../settings/lib/accountApi'

const KIND_LABEL: Record<BrandSummary['brand']['kind'], string> = {
  profiles: 'Perfiles',
  mixed: 'Perfiles y accesorios',
  glass: 'Vidrios',
  hardware: 'Herrajes',
}

const KIND_ORDER: BrandSummary['brand']['kind'][] = ['profiles', 'mixed', 'glass', 'hardware']

const COMPLETENESS: Record<BrandSummary['completeness'], string> = {
  verified: 'Datos verificados',
  complete: 'Datos completos',
  partial: 'Datos parciales',
  none: 'Sin lista de precios',
}

function brandInfo(b: BrandSummary): string {
  const parts: string[] = []
  if (b.counts.lines) parts.push(`${formatNumber(b.counts.lines)} ${b.counts.lines === 1 ? 'línea' : 'líneas'}`)
  if (b.counts.priced) parts.push(`${formatNumber(b.counts.priced)} precios`)
  parts.push(COMPLETENESS[b.completeness])
  return parts.join(' · ')
}

/** Marcas que usa el taller: activar o desactivar con un toque (se guarda solo). */
export function BrandPicker() {
  const brands = useBrands()
  const toggle = useToggleBrand()
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  // Las que ya usas o recomendamos quedan a la vista; el resto, a un clic (o buscando).
  const [pinned] = useState(() => new Set<string>())
  for (const b of brands.data ?? []) if (b.enabled || b.recommended) pinned.add(b.brand.id)
  const compact = !showAll && !query.trim()
  const hiddenCount = (brands.data ?? []).filter((b) => !pinned.has(b.brand.id)).length

  const groups = useMemo(() => {
    const q = normalizeSearch(query)
    const list = (brands.data ?? []).filter((b) => (q ? normalizeSearch(b.brand.name).includes(q) : !compact || pinned.has(b.brand.id)))
    return KIND_ORDER.map((kind) => ({
      kind,
      items: list
        .filter((b) => b.brand.kind === kind)
        .sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.brand.name.localeCompare(b.brand.name, 'es')),
    })).filter((g) => g.items.length > 0)
  }, [brands.data, query, compact, pinned])

  const enabledCount = (brands.data ?? []).filter((b) => b.enabled).length

  if (brands.isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    )
  }
  if (brands.isError) {
    return (
      <p className="rounded-md border border-paper-200 bg-paper-0 px-4 py-5 text-[13px] text-paper-600">
        {humanError(brands.error)} Puedes saltar este paso: tus marcas se eligen también en Catálogo.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input icon={Search} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar marca" aria-label="Buscar marca" wrapperClassName="w-full sm:w-72" />
        <span className="text-[13px] text-paper-600">
          {enabledCount === 1 ? '1 marca activa' : `${formatNumber(enabledCount)} marcas activas`}
        </span>
      </div>
      {groups.length === 0 ? <p className="py-6 text-center text-[13px] text-paper-600">Ninguna marca se llama «{query}».</p> : null}
      {groups.map((group) => (
        <section key={group.kind} aria-label={KIND_LABEL[group.kind]}>
          <h3 className="mb-2 text-meta font-medium text-paper-600">{KIND_LABEL[group.kind]}</h3>
          <ul className="divide-y divide-paper-200 overflow-hidden rounded-md border border-paper-200 bg-paper-0">
            {group.items.map((b) => (
              <li key={b.brand.id}>
                <label className={cn('flex cursor-pointer items-center gap-3 px-3.5 py-3 transition-colors duration-120 hover:bg-paper-50', b.enabled && 'bg-ink-50/40')}>
                  <span
                    aria-hidden
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-sm text-[12px] font-semibold text-paper-0"
                    style={{ background: b.brand.accent ?? 'var(--paper-600)' }}
                  >
                    {b.brand.monogram ?? b.brand.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-paper-900">{b.brand.name}</span>
                      {b.recommended ? <span className="shrink-0 rounded-xs bg-paper-100 px-1.5 text-[11px] leading-[18px] font-medium text-paper-600">Recomendada</span> : null}
                    </span>
                    <span className="block truncate text-[13px] leading-[18px] text-paper-600">{brandInfo(b)}</span>
                  </span>
                  <Switch
                    checked={b.enabled}
                    aria-label={`${b.enabled ? 'Desactivar' : 'Activar'} ${b.brand.name}`}
                    onCheckedChange={(enabled) =>
                      toggle.mutate({ id: b.brand.id, enabled }, { onError: (error) => toast.error(humanError(error)) })
                    }
                  />
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {compact && hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="flex h-11 items-center justify-center rounded-md border border-dashed border-paper-350/70 text-[13px] font-medium text-paper-900 transition-colors duration-120 hover:border-paper-600 hover:bg-paper-0"
        >
          Ver todas las marcas ({formatNumber(hiddenCount)} más)
        </button>
      ) : null}
    </div>
  )
}
