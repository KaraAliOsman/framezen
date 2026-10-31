import { useMemo, useState } from 'react'
import { ChevronRight, Search, SlidersHorizontal, Tag } from 'lucide-react'
import type { Brand, Catalog } from '@framezen/engine'
import { humanError } from '../../../lib/api'
import { formatNumber, formatPct, normalizeSearch } from '../../../lib/format'
import { Badge, Button, Card, EmptyState, Input, SegmentedControl, Skeleton, Switch, toast, toastUndo } from '../../../ui'
import { useCatalogBrands, usePatchBrand, type CatalogBrandSummary } from '../api'
import { BRAND_KIND_LABEL, DISCOUNT_FAMILIES, brandStateCopy, monogramOrder } from '../model/labels'
import type { PriceFocus } from '../model/prices'
import { missingPriceKeys, readinessByLine, type LineReadiness } from '../model/readiness'
import { CompletenessBadge, CoverageBar, Monogram, SectionTitle } from '../parts'
import { BrandSettingsSheet } from './BrandSettingsSheet'

type KindFilter = 'all' | 'profiles' | 'glass' | 'hardware'

export function BrandsTab({ catalog, onCompletePrices }: { catalog: Catalog | undefined; onCompletePrices?: (focus: PriceFocus) => void }) {
  // Estado real de las líneas de las marcas activas (el catálogo del taller trae solo esas).
  const readiness = useMemo(() => readinessByLine(catalog), [catalog])
  const brands = useCatalogBrands()
  const patch = usePatchBrand()
  const [kind, setKind] = useState<KindFilter>('all')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const items = brands.data?.items ?? []
  const enabled = items.filter((b) => b.enabled)
  // Todas las marcas, activas primero: los monogramas no se repiten (Winhouse «WI», Winsa «WA»).
  const siblings = useMemo(() => {
    const all = brands.data?.items ?? []
    const active = new Set(all.filter((b) => b.enabled).map((b) => b.brand.id))
    return monogramOrder(
      all.map((b) => b.brand),
      (b) => active.has(b.id),
    )
  }, [brands.data])
  const others = useMemo(() => {
    const terms = normalizeSearch(q)
    return items
      .filter((b) => !b.enabled)
      .filter((b) => kind === 'all' || (kind === 'profiles' ? b.brand.kind === 'profiles' || b.brand.kind === 'mixed' : b.brand.kind === kind))
      .filter((b) => !terms || normalizeSearch(b.brand.name).includes(terms))
  }, [items, kind, q])

  const toggle = (summary: CatalogBrandSummary, next: boolean) => {
    const name = summary.brand.name
    patch.mutate(
      { id: summary.brand.id, patch: { enabled: next } },
      {
        onSuccess: () => {
          if (next) {
            toast.success(
              summary.counts.lines
                ? `Activaste ${name}: sus ${formatNumber(summary.counts.lines)} ${summary.counts.lines === 1 ? 'línea ya está disponible' : 'líneas ya están disponibles'} al cotizar.`
                : `Activaste ${name}: sus artículos ya están disponibles.`,
            )
          } else {
            toastUndo(`Desactivaste ${name}. Tus precios y descuentos quedan guardados.`, () =>
              patch.mutate({ id: summary.brand.id, patch: { enabled: true } }),
            )
          }
        },
        onError: (error) => toast.error(humanError(error)),
      },
    )
  }

  const open = items.find((b) => b.brand.id === openId) ?? null

  if (brands.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-52 rounded-md" />
        ))}
      </div>
    )
  }

  if (brands.isError) {
    return (
      <Card>
        <EmptyState
          size="compact"
          sketch="fixed"
          title="No pudimos cargar tus marcas"
          description={humanError(brands.error)}
          action={<Button onClick={() => brands.refetch()}>Reintentar</Button>}
        />
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <SectionTitle
          title="Tus marcas"
          description="Las que aparecen al cotizar. Abre «Mis precios» para cargar tus descuentos, el despunte y el disco de cada una."
        />
        {enabled.length === 0 ? (
          <Card>
            <EmptyState
              size="compact"
              sketch="casement"
              title="Activa al menos una marca"
              description="Elige abajo las marcas con que trabajas. Mientras tanto, cotizas con el catálogo base."
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {enabled.map((summary) => (
              <BrandCard
                key={summary.brand.id}
                summary={summary}
                siblings={siblings}
                lines={(catalog?.lines ?? []).filter((l) => l.brandId === summary.brand.id).map((l) => readiness.get(l.id)).filter((r): r is LineReadiness => Boolean(r))}
                onToggle={(v) => toggle(summary, v)}
                onOpen={() => setOpenId(summary.brand.id)}
                onCompletePrices={onCompletePrices}
              />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <SectionTitle
          title="Más marcas"
          description="Todo el catálogo base de Framezen. Activa una y sus líneas quedan listas para cotizar al instante."
          actions={
            <>
              <SegmentedControl<KindFilter>
                aria-label="Tipo de marca"
                size="sm"
                value={kind}
                onValueChange={setKind}
                options={[
                  { value: 'all', label: 'Todas' },
                  { value: 'profiles', label: 'Perfiles' },
                  { value: 'glass', label: 'Vidrios' },
                  { value: 'hardware', label: 'Herrajes' },
                ]}
              />
              <Input
                icon={Search}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar marca"
                aria-label="Buscar marca"
                wrapperClassName="w-full sm:w-52"
                className="h-8"
              />
            </>
          }
        />
        {others.length === 0 ? (
          <p className="rounded-md border border-dashed border-paper-200 px-4 py-6 text-center text-paper-600">
            {q ? <>Ninguna marca coincide con «{q}».</> : 'Ya activaste todas las marcas de este tipo.'}
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {others.map((summary) => (
              <CompactBrand key={summary.brand.id} summary={summary} siblings={siblings} onToggle={(v) => toggle(summary, v)} onOpen={() => setOpenId(summary.brand.id)} />
            ))}
          </ul>
        )}
      </section>

      <BrandSettingsSheet summary={open} siblings={siblings} catalog={catalog} onOpenChange={(v) => !v && setOpenId(null)} />
    </div>
  )
}

function discountSummary(summary: CatalogBrandSummary): string {
  const d = summary.settings.discounts
  const parts = DISCOUNT_FAMILIES.filter((f) => (d[f.key] ?? 0) > 0).map((f) => `${f.label} ${formatPct(d[f.key])}`)
  return parts.length ? parts.join(' · ') : 'Sin descuentos: cotizas a precio de lista'
}

function BrandCard({
  summary,
  siblings,
  lines,
  onToggle,
  onOpen,
  onCompletePrices,
}: {
  summary: CatalogBrandSummary
  siblings: readonly Brand[]
  /** Completitud de sus líneas con los precios del taller (vacío mientras carga el catálogo). */
  lines: LineReadiness[]
  onToggle: (v: boolean) => void
  onOpen: () => void
  onCompletePrices?: (focus: PriceFocus) => void
}) {
  const { brand, counts } = summary
  const ready = lines.filter((r) => r.state === 'ready').length
  const geometry = lines.filter((r) => r.state === 'geometry').length
  const missingKeys = [...new Set(lines.flatMap((r) => (r.state === 'ready' ? [] : missingPriceKeys(r))))]
  const stateCopy =
    lines.length && summary.completeness !== 'none'
      ? ready
        ? { ...brandStateCopy(summary), label: 'Lista para cotizar', tone: 'ok' as const }
        : geometry === lines.length
          ? brandStateCopy({ ...summary, counts: { ...summary.counts, priced: 0 } })
          : { ...brandStateCopy(summary), label: 'Cotiza con avisos', tone: 'warn' as const }
      : brandStateCopy(summary)
  const facts = [BRAND_KIND_LABEL[brand.kind], counts.lines ? `${formatNumber(counts.lines)} ${counts.lines === 1 ? 'línea' : 'líneas'}` : null].filter(Boolean)
  const discounts = discountSummary(summary)
  const hasDiscounts = !discounts.startsWith('Sin')
  return (
    <Card padding="none" className="flex flex-col">
      <div className="flex items-start gap-3 p-4 pb-3">
        <Monogram brand={brand} siblings={siblings} size={44} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-lead font-semibold tracking-[-0.01em] text-paper-900">{brand.name}</h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-paper-600">
            <span>{facts.join(' · ')}</span>
            <CompletenessBadge value={summary.completeness} copy={stateCopy} size="sm" />
          </div>
        </div>
        <Switch checked={summary.enabled} onCheckedChange={onToggle} aria-label={`${brand.name} activa`} />
      </div>
      <div className="flex flex-col gap-3 border-t border-paper-200 px-4 py-3">
        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-[13px]">
            <span className="text-paper-600">Precios cargados</span>
            {counts.unpriced > 0 ? (
              <span className="text-meta text-warn-600 tabular">{formatNumber(counts.unpriced)} sin precio</span>
            ) : (
              <span className="text-meta text-ok-600">Todo con precio</span>
            )}
          </div>
          <CoverageBar priced={counts.priced} unpriced={counts.unpriced} />
        </div>
        {lines.length ? (
          <div className="flex items-center justify-between gap-3 text-[13px] leading-[18px]">
            <span className="text-paper-600">
              <span className="font-medium text-paper-900 tabular">
                {formatNumber(ready)} de {formatNumber(lines.length)}
              </span>{' '}
              {ready === 1 ? 'lista' : 'listas'} para cotizar
            </span>
            {missingKeys.length && onCompletePrices ? (
              <Button
                size="sm"
                variant="ghost"
                icon={Tag}
                onClick={() => onCompletePrices({ label: `Lo que falta en ${brand.name}`, keys: missingKeys })}
                className="-mr-2 shrink-0"
              >
                Completar precios
              </Button>
            ) : null}
          </div>
        ) : null}
        {hasDiscounts ? (
          <ul className="flex flex-wrap gap-1" aria-label="Tus descuentos">
            {DISCOUNT_FAMILIES.filter((f) => (summary.settings.discounts[f.key] ?? 0) > 0).map((f) => (
              <li key={f.key} className="inline-flex h-6 items-center gap-1 rounded-xs bg-paper-100 px-1.5 text-meta whitespace-nowrap text-paper-600">
                {f.label}
                <span className="font-medium text-ok-800 tabular">−{formatPct(summary.settings.discounts[f.key])}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] leading-[18px] text-paper-600">{discounts}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="group mt-auto flex items-center justify-between gap-3 rounded-b-md border-t border-paper-200 px-4 py-2.5 text-left text-base font-medium text-ink-600 transition-colors duration-120 hover:bg-paper-50 hover:text-ink-700 focus-visible:outline-offset-[-2px]"
      >
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal aria-hidden className="size-4" strokeWidth={1.75} />
          Mis precios
        </span>
        <span className="inline-flex items-center gap-1 text-[13px] font-normal text-paper-600">
          {counts.overrides ? `${formatNumber(counts.overrides)} ${counts.overrides === 1 ? 'precio tuyo' : 'precios tuyos'}` : null}
          <ChevronRight aria-hidden className="size-4 transition-transform duration-160 group-hover:translate-x-0.5" strokeWidth={1.75} />
        </span>
      </button>
    </Card>
  )
}

function CompactBrand({
  summary,
  siblings,
  onToggle,
  onOpen,
}: {
  summary: CatalogBrandSummary
  siblings: readonly Brand[]
  onToggle: (v: boolean) => void
  onOpen: () => void
}) {
  const { brand, counts } = summary
  const total = counts.priced + counts.unpriced
  const coverage = total ? Math.round((counts.priced / total) * 100) : 0
  const detail = [
    counts.lines ? `${formatNumber(counts.lines)} ${counts.lines === 1 ? 'línea' : 'líneas'}` : BRAND_KIND_LABEL[brand.kind],
    total ? (coverage === 0 ? 'sin precios' : `${coverage} % con precio`) : null,
  ].filter(Boolean)
  return (
    <li className="flex items-center gap-3 rounded-md border border-paper-200 bg-paper-0 px-3 py-2.5 transition-colors duration-120 hover:border-paper-350/60">
      <Monogram brand={brand} siblings={siblings} size={32} />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 rounded-xs text-left">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium text-paper-900">{brand.name}</span>
          {summary.recommended ? (
            <Badge tone="ink" size="sm">
              Recomendada
            </Badge>
          ) : null}
        </span>
        <span className="block truncate text-meta text-paper-600">{detail.join(' · ')}</span>
      </button>
      <Switch checked={summary.enabled} onCheckedChange={onToggle} aria-label={`Activar ${brand.name}`} size="sm" />
    </li>
  )
}
