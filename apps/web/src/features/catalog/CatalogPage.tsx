import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Upload } from 'lucide-react'
import type { Line } from '@dekopen/engine'
import { humanError } from '../../lib/api'
import { useCatalog } from '../../lib/hooks'
import { useFormat, useT } from '../../lib/i18n'
import { usePageTitle } from '../../lib/usePageTitle'
import { Button, EmptyState, Page, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui'
import { useCatalogBrands } from './api'
// «Colores y texturas» (galería de foliados, texturas propias y colores a medida): equipo de texturas.
import { ColorsTab } from './colors'
import es from './i18n/es'
import { buildPriceRows, EMPTY_FILTERS, isMissingPrice, type PriceFilters, type PriceFocus } from './model/prices'
import { readinessByLine } from './model/readiness'
import { BrandsTab } from './tabs/BrandsTab'
import { GlassTab } from './tabs/GlassTab'
import { HardwareTab } from './tabs/HardwareTab'
import { ImportTab } from './tabs/ImportTab'
import { LinesTab, sortLinesForList } from './tabs/LinesTab'
import { PricesTab } from './tabs/PricesTab'

/** Slugs estables en español (`?tab=`): aparecen en enlaces, correos y pruebas. No se traducen. */
const TAB_IDS = ['marcas', 'lineas', 'precios', 'vidrios', 'herrajes', 'colores', 'importar'] as const
type TabId = (typeof TAB_IDS)[number]

export default function CatalogPage() {
  const t = useT(es)
  const fmt = useFormat()
  usePageTitle(t('page.title'))
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: TabId = TAB_IDS.some((id) => id === raw) ? (raw as TabId) : 'marcas'
  const catalog = useCatalog()
  const brands = useCatalogBrands()
  // ?buscar=: viene de una cotización, directo a la pieza que le falta.
  const [priceFilters, setPriceFilters] = useState<PriceFilters>(() => ({ ...EMPTY_FILTERS, q: params.get('buscar') ?? '' }))
  const [lineId, setLineId] = useState<string | null>(null)

  const setTab = (next: string) => {
    const p = new URLSearchParams(params)
    if (next === 'marcas') p.delete('tab')
    else p.set('tab', next)
    setParams(p, { replace: true })
  }

  // «Completar precios»: abre Precios con justo lo que falta (perfiles por color, refuerzos y herrajes).
  const completePrices = (focus: PriceFocus) => {
    setPriceFilters({ ...EMPTY_FILTERS, focus })
    setTab('precios')
  }

  const openLine = (line: Line) => {
    setLineId(line.id)
    setTab('lineas')
  }

  const data = catalog.data
  // Completitud de cada línea con los precios del taller: la usan el resumen, Marcas y Líneas.
  const readiness = useMemo(() => readinessByLine(data), [data])
  const summary = useMemo(() => {
    if (!data) return null
    // Mismo conteo que el filtro «Sin precio» de la pestaña Precios (perfil por color, herrajes, accesorios).
    const unpriced = buildPriceRows({ ...data, glass: [] }).filter(isMissingPrice).length
    const ordered = sortLinesForList(data)
    const ready = ordered.filter((l) => readiness.get(l.id)?.state === 'ready').length
    const firstGap = ordered.find((l) => readiness.get(l.id)?.state !== 'ready')
    return { lines: data.lines.length, ready, unpriced, firstGap }
  }, [data, readiness])
  const activeBrands = (brands.data?.items ?? []).filter((b) => b.enabled).length

  const readiness_line = summary ? (
    <div className="-mt-3 mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-table text-fg-muted">
      {summary.lines ? (
        <p>{t.rich('page.readyLines', { count: summary.lines, ready: fmt.number(summary.ready), b: <strong className="font-medium text-fg-strong tabular" /> })}</p>
      ) : (
        <p>{t('page.activeBrands', { count: activeBrands })}</p>
      )}
      {summary.unpriced ? (
        <button
          type="button"
          onClick={() => {
            setPriceFilters({ ...EMPTY_FILTERS, missing: true })
            setTab('precios')
          }}
          className="rounded-xs hover:text-fg-strong hover:underline"
        >
          {t('page.unpriced', { count: summary.unpriced })}
        </button>
      ) : null}
      {summary.firstGap ? (
        <button type="button" onClick={() => openLine(summary.firstGap!)} className="rounded-xs font-medium text-accent-ink hover:underline">
          {t('page.completeLine', { line: summary.firstGap.name })}
        </button>
      ) : null}
    </div>
  ) : null

  return (
    <Page width="wide">
      <PageHeader
        title={t('page.title')}
        actions={
          tab !== 'importar' ? (
            <Button icon={Upload} onClick={() => setTab('importar')} className="max-sm:hidden">
              {t('page.importPrices')}
            </Button>
          ) : null
        }
      />
      {readiness_line}
      {catalog.isError ? (
        <EmptyState size="compact" title={t('page.loadError')} description={humanError(catalog.error)} action={<Button onClick={() => catalog.refetch()}>{t('page.retry')}</Button>} />
      ) : (
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label={t('page.tabsLabel')} className="-mx-4 px-4 sm:mx-0 sm:px-0">
          {TAB_IDS.map((id) => (
            <TabsTrigger key={id} value={id}>
              {t(`page.tabs.${id}`)}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="marcas">
          <BrandsTab catalog={data} readiness={readiness} onCompletePrices={completePrices} />
        </TabsContent>
        <TabsContent value="lineas">
          <LinesTab
            catalog={data}
            loading={catalog.isLoading}
            readiness={readiness}
            selectedId={lineId}
            onSelect={setLineId}
            onCompletePrices={completePrices}
          />
        </TabsContent>
        <TabsContent value="precios">
          <PricesTab catalog={data} loading={catalog.isLoading} filters={priceFilters} onFiltersChange={setPriceFilters} />
        </TabsContent>
        <TabsContent value="vidrios">
          <GlassTab catalog={data} loading={catalog.isLoading} />
        </TabsContent>
        <TabsContent value="herrajes">
          <HardwareTab
            catalog={data}
            loading={catalog.isLoading}
            onEditPrice={(item) => {
              setPriceFilters({ ...EMPTY_FILTERS, q: item.code || item.name })
              setTab('precios')
            }}
          />
        </TabsContent>
        <TabsContent value="colores">
          <ColorsTab catalog={data} loading={catalog.isLoading} />
        </TabsContent>
        <TabsContent value="importar">
          <ImportTab catalog={data} onDone={() => setTab('precios')} />
        </TabsContent>
      </Tabs>
      )}
    </Page>
  )
}
