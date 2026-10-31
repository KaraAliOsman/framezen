import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Upload } from 'lucide-react'
import { humanError } from '../../lib/api'
import { useCatalog } from '../../lib/hooks'
import { formatNumber } from '../../lib/format'
import { usePageTitle } from '../../lib/usePageTitle'
import { Button, Card, EmptyState, Page, PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui'
import { useCatalogBrands } from './api'
import { buildPriceRows, EMPTY_FILTERS, type PriceFilters, type PriceFocus } from './model/prices'
import { BrandsTab } from './tabs/BrandsTab'
import { ColorsTab } from './tabs/ColorsTab'
import { GlassTab } from './tabs/GlassTab'
import { HardwareTab } from './tabs/HardwareTab'
import { ImportTab } from './tabs/ImportTab'
import { LinesTab } from './tabs/LinesTab'
import { PricesTab } from './tabs/PricesTab'

const TABS = [
  { id: 'marcas', label: 'Marcas' },
  { id: 'lineas', label: 'Líneas' },
  { id: 'precios', label: 'Precios' },
  { id: 'vidrios', label: 'Vidrios' },
  { id: 'herrajes', label: 'Herrajes y accesorios' },
  { id: 'colores', label: 'Colores' },
  { id: 'importar', label: 'Importar' },
] as const

type TabId = (typeof TABS)[number]['id']

export default function CatalogPage() {
  usePageTitle('Catálogo')
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : 'marcas'
  const catalog = useCatalog()
  const brands = useCatalogBrands()
  const [priceFilters, setPriceFilters] = useState<PriceFilters>(EMPTY_FILTERS)

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

  const data = catalog.data
  const counts = useMemo(() => {
    if (!data) return null
    // Mismo conteo que el filtro «Sin precio» de la pestaña Precios (perfil por color, herrajes, accesorios).
    const unpriced = buildPriceRows({ ...data, glass: [] }).filter((r) => !(r.price > 0)).length
    return { lines: data.lines.length, unpriced }
  }, [data])
  const activeBrands = (brands.data?.items ?? []).filter((b) => b.enabled).length

  const meta = counts ? (
    <>
      <span>
        {formatNumber(activeBrands)} {activeBrands === 1 ? 'marca activa' : 'marcas activas'} · {formatNumber(counts.lines)} {counts.lines === 1 ? 'línea' : 'líneas'}
      </span>
      {counts.unpriced ? (
        <>
          <span aria-hidden className="max-sm:hidden">·</span>
          <button
            type="button"
            onClick={() => {
              setPriceFilters({ ...EMPTY_FILTERS, missing: true })
              setTab('precios')
            }}
            className="rounded-xs text-warn-600 underline decoration-warn-600/30 underline-offset-2 hover:decoration-warn-600"
          >
            {formatNumber(counts.unpriced)} {counts.unpriced === 1 ? 'precio sin cargar' : 'precios sin cargar'}
          </button>
        </>
      ) : null}
    </>
  ) : null

  return (
    <Page width="wide">
      <PageHeader
        title="Catálogo"
        description="Las marcas y líneas con que trabajas, sus pautas y tus precios. Todo cambio se guarda solo y se usa al cotizar."
        meta={meta}
        actions={
          tab !== 'importar' ? (
            <Button icon={Upload} onClick={() => setTab('importar')} className="max-sm:hidden">
              Importar precios
            </Button>
          ) : null
        }
      />
      {catalog.isError ? (
        <Card className="mb-6">
          <EmptyState
            size="compact"
            sketch="fixed"
            title="No pudimos cargar tu catálogo"
            description={humanError(catalog.error)}
            action={<Button onClick={() => catalog.refetch()}>Reintentar</Button>}
          />
        </Card>
      ) : null}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Secciones del catálogo" className="-mx-4 px-4 sm:mx-0 sm:px-0">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="marcas">
          <BrandsTab catalog={data} onCompletePrices={completePrices} />
        </TabsContent>
        <TabsContent value="lineas">
          <LinesTab catalog={data} loading={catalog.isLoading} onCompletePrices={completePrices} />
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
    </Page>
  )
}
