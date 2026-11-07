import { useMemo } from 'react'
import { Link } from 'react-router'
import { Check, FilePlus2, UserPlus } from 'lucide-react'
import { DEFAULT_PRICING } from '@dekopen/engine'
import { WindowDrawing } from '@dekopen/documents'
import { useSession } from '../../lib/auth'
import { cn } from '../../lib/cn'
import { useCatalog, useSettings } from '../../lib/hooks'
import { useFormat, useGlossary, useLocale, useT } from '../../lib/i18n'
import { Button, buttonClass, PageSection } from '../../ui'
import { useBrands } from '../settings/lib/accountApi'
import { priceExample, PRICING_EXAMPLE } from '../settings/lib/pricingExample'
import es from './i18n/es'

/** Inicio de una cuenta nueva: la primera cotización a un clic y la ventana real con su precio. */
export function HomeEmpty({ onNewQuote, creating }: { onNewQuote: () => void; creating: boolean }) {
  const t = useT(es)
  const g = useGlossary()
  const fmt = useFormat()
  const { locale } = useLocale()
  const me = useSession()
  const catalog = useCatalog()
  const settings = useSettings()
  const brands = useBrands()
  const pricing = settings.data?.pricing ?? DEFAULT_PRICING

  const example = useMemo(
    () => priceExample(catalog.data, pricing, PRICING_EXAMPLE, { defaults: settings.data?.defaults, cut: settings.data?.cut }),
    [catalog.data, pricing, settings.data?.defaults, settings.data?.cut],
  )
  const activeBrands = brands.data?.filter((b) => b.enabled && b.brand.kind !== 'glass' && b.brand.kind !== 'hardware') ?? []
  const brandNames = fmt.list(activeBrands.slice(0, 3).map((b) => b.brand.name))

  const checklist = [
    {
      done: activeBrands.length > 0,
      title: t('empty.setup.brands'),
      text: activeBrands.length
        ? activeBrands.length > 3
          ? t('empty.setup.brandsMore', { names: activeBrands.slice(0, 3).map((b) => b.brand.name).join(', '), count: activeBrands.length - 3 })
          : t('empty.setup.brandsActive', { names: brandNames })
        : t('empty.setup.brandsPick'),
      to: '/catalogo',
    },
    {
      done: Boolean(me.org.logo),
      title: t('empty.setup.logo'),
      text: me.org.logo ? t('empty.setup.logoDone') : t('empty.setup.logoPending'),
      to: '/ajustes/empresa',
    },
    {
      done: Boolean(settings.data && JSON.stringify(settings.data.pricing) !== JSON.stringify(DEFAULT_PRICING)),
      title: t('empty.setup.prices'),
      text: t('empty.setup.pricesText', { margin: fmt.pct(pricing.marginPct), labor: fmt.money(pricing.laborPerM2) }),
      to: '/ajustes/precios',
    },
  ]
  const done = checklist.filter((c) => c.done).length
  const name = `${g.typology(PRICING_EXAMPLE.typology)} · ${fmt.size(PRICING_EXAMPLE.width, PRICING_EXAMPLE.height)}`

  return (
    <div>
      <section className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-h2 font-medium text-balance text-fg-strong sm:text-h1">{t('empty.title')}</h1>
            <p className="mt-2 max-w-md text-fg-muted">{t('empty.text')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="lg" icon={FilePlus2} shortcut="c" onClick={onNewQuote} loading={creating}>
              {t('empty.create')}
            </Button>
            <Link to="/clientes?nuevo=1" className={buttonClass('ghost', 'lg')}>
              <UserPlus aria-hidden strokeWidth={1.75} />
              {t('empty.addClient')}
            </Link>
          </div>
        </div>
        <figure className="flex flex-col items-center gap-4 rounded-panel bg-sunken px-6 py-8">
          <WindowDrawing layout={example.layout} design={example.design} catalog={example.catalog} dimensions="all" width={280} locale={locale} title={name} />
          <figcaption className="text-center">
            <span className="block text-table font-medium text-fg-strong">{name}</span>
            <span className="block text-table text-fg-muted">
              <span className="font-medium text-fg tabular">{fmt.money(example.price.unitNet)}</span>{' '}
              {t('empty.plusTax', { tax: settings.data?.taxLabel?.trim() || g.term('business.vat') })} · {example.sample ? t('empty.sampleNote') : t('empty.ownNote')}
            </span>
          </figcaption>
        </figure>
      </section>

      <PageSection
        title={t('empty.setup.title')}
        description={t('empty.setup.progress', { done, total: checklist.length })}
        actions={
          !me.onboarded ? (
            <Link to="/bienvenida" className="text-table font-medium text-accent hover:underline">
              {t('empty.setup.guided')}
            </Link>
          ) : null
        }
      >
        <ul className="-mx-3 divide-y divide-divider rounded-panel bg-plate shadow-plate">
          {checklist.map((item) => (
            <li key={item.to}>
              <Link to={item.to} className="flex min-h-14 items-center gap-3 rounded-sm px-3 py-2 transition-colors duration-100 hover:bg-hover">
                <span aria-hidden className={cn('inline-flex size-5 shrink-0 items-center justify-center rounded-full border', item.done ? 'border-accent bg-accent text-fg-on-accent' : 'border-control text-transparent')}>
                  <Check strokeWidth={2.5} className="size-3" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-fg-strong">{item.title}</span>
                  <span className="block truncate text-table text-fg-muted">{item.text}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </PageSection>
    </div>
  )
}
