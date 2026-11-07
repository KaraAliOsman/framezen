import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { humanError } from '../../lib/api'
import { normalizeSearch } from '../../lib/format'
import { LOCALE_META, useFormat, useLocale, useT } from '../../lib/i18n'
import { Monogram } from '../catalog/parts'
import { Input } from '../../ui/Input'
import { Skeleton } from '../../ui/Skeleton'
import { Switch } from '../../ui/Switch'
import { toast } from '../../ui/Toaster'
import { useBrands, useToggleBrand, type BrandSummary } from '../settings/lib/accountApi'
import es from './i18n/es'

const KIND_ORDER: BrandSummary['brand']['kind'][] = ['profiles', 'mixed', 'glass', 'hardware']

/** Marcas que usa el taller: activar o desactivar con un toque (se guarda solo). */
export function BrandPicker() {
  const t = useT(es)
  const fmt = useFormat()
  const { locale } = useLocale()
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
    const collator = new Intl.Collator(LOCALE_META[locale].intl, { sensitivity: 'base' })
    const list = (brands.data ?? []).filter((b) => (q ? normalizeSearch(b.brand.name).includes(q) : !compact || pinned.has(b.brand.id)))
    return KIND_ORDER.map((kind) => ({
      kind,
      items: list
        .filter((b) => b.brand.kind === kind)
        .sort((a, b) => Number(b.recommended) - Number(a.recommended) || collator.compare(a.brand.name, b.brand.name)),
    })).filter((g) => g.items.length > 0)
  }, [brands.data, query, compact, pinned, locale])

  const enabledCount = (brands.data ?? []).filter((b) => b.enabled).length

  const info = (b: BrandSummary): string => {
    const parts: string[] = []
    if (b.counts.lines) parts.push(t('brands.lines', { count: b.counts.lines }))
    if (b.counts.priced) parts.push(t('brands.prices', { count: b.counts.priced }))
    // Vidrios y herrajes no tienen líneas: su dato es cuántos precios traen, no qué tan completa está la marca.
    if (b.counts.lines || !b.counts.priced) parts.push(t(`brands.completeness.${b.completeness}`))
    return parts.join(' · ')
  }

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
    return <p className="text-table text-fg-muted">{t('brands.loadError', { error: humanError(brands.error) })}</p>
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          icon={Search}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('brands.search')}
          aria-label={t('brands.search')}
          wrapperClassName="w-full sm:w-72"
        />
        <span className="text-table text-fg-muted tabular">{t('brands.active', { count: enabledCount })}</span>
      </div>
      {groups.length === 0 ? <p className="py-6 text-center text-table text-fg-muted">{t('brands.none', { query })}</p> : null}
      {groups.map((group) => (
        <section key={group.kind} aria-label={t(`brands.kind.${group.kind}`)}>
          <h3 className="mb-1 text-table text-fg-muted">{t(`brands.kind.${group.kind}`)}</h3>
          <ul>
            {group.items.map((b) => (
              <li key={b.brand.id}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 py-1.5">
                  <Monogram brand={b.brand} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-fg-strong">
                      {b.brand.name}
                      {b.recommended ? <span className="ml-2 text-table text-fg-muted">{t('brands.recommended')}</span> : null}
                    </span>
                    <span className="block truncate text-table text-fg-muted">{info(b)}</span>
                  </span>
                  <Switch
                    checked={b.enabled}
                    aria-label={b.enabled ? t('brands.toggleOff', { name: b.brand.name }) : t('brands.toggleOn', { name: b.brand.name })}
                    onCheckedChange={(enabled) => toggle.mutate({ id: b.brand.id, enabled }, { onError: (error) => toast.error(humanError(error)) })}
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
          className="self-start text-table font-medium text-accent-ink hover:underline"
        >
          {t('brands.showAll', { count: fmt.number(hiddenCount) })}
        </button>
      ) : null}
    </div>
  )
}
