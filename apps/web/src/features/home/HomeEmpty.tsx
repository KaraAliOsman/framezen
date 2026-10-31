import { useMemo } from 'react'
import { Link } from 'react-router'
import { ArrowRight, Check, FilePlus2, UserPlus } from 'lucide-react'
import { DEFAULT_PRICING, formatCLP, formatPct } from '@framezen/engine'
import { WindowDrawing } from '@framezen/documents'
import { useSession } from '../../lib/auth'
import { cn } from '../../lib/cn'
import { useCatalog, useSettings } from '../../lib/hooks'
import { Button, buttonClass, Kbd } from '../../ui'
import { useBrands } from '../settings/lib/accountApi'
import { priceExample, PRICING_EXAMPLE } from '../settings/lib/pricingExample'

const STEPS = [
  { n: 1, title: 'Elige una ventana', text: 'Corredera, abatir, oscilobatiente, puerta…' },
  { n: 2, title: 'Escribe ancho × alto', text: 'El precio aparece solo, con tus márgenes.' },
  { n: 3, title: 'Envíala', text: 'Por WhatsApp, correo o PDF. Tu cliente la acepta en línea.' },
]

/** Inicio de una cuenta nueva: invita a la primera cotización y muestra el producto real. */
export function HomeEmpty({ onNewQuote, creating }: { onNewQuote: () => void; creating: boolean }) {
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

  const checklist = [
    {
      done: activeBrands.length > 0,
      title: 'Tus marcas',
      text: activeBrands.length
        ? `${activeBrands
            .slice(0, 3)
            .map((b) => b.brand.name)
            .join(', ')}${activeBrands.length > 3 ? ` y ${activeBrands.length - 3} más` : ''} activas`
        : 'Elige con qué perfiles trabajas',
      to: '/catalogo',
    },
    {
      done: Boolean(me.org.logo),
      title: 'Tu logo y datos',
      text: me.org.logo ? 'Listo: sale en tus cotizaciones' : 'Para que tus cotizaciones lleven tu marca',
      to: '/ajustes/empresa',
    },
    {
      done: Boolean(settings.data && JSON.stringify(settings.data.pricing) !== JSON.stringify(DEFAULT_PRICING)),
      title: 'Tus precios',
      text: `Margen ${formatPct(pricing.marginPct)} · mano de obra ${formatCLP(pricing.laborPerM2)}/m²`,
      to: '/ajustes/precios',
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-1 overflow-hidden rounded-lg border border-paper-200 bg-paper-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="flex flex-col justify-center gap-7 p-6 sm:p-10">
          <div>
            <p className="text-[13px] font-medium text-ink-600">Primeros pasos</p>
            <h2 className="mt-2 text-h2 font-semibold tracking-[-0.015em] text-balance text-paper-900 sm:text-[30px] sm:leading-[38px]">
              Tu primera cotización está a un minuto
            </h2>
            <p className="mt-2 max-w-md text-paper-600">
              No necesitas cargar nada antes: ni clientes, ni listas de precios. Empieza por la ventana y lo demás se completa solo.
            </p>
          </div>
          <ol className="grid gap-4 sm:grid-cols-3 sm:gap-5">
            {STEPS.map((s) => (
              <li key={s.n} className="flex gap-3 sm:flex-col sm:gap-2">
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-paper-900 text-[12px] font-semibold text-paper-900 tabular">
                  {s.n}
                </span>
                <span>
                  <span className="block font-medium text-paper-900">{s.title}</span>
                  <span className="block text-[13px] leading-[18px] text-paper-600">{s.text}</span>
                </span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="lg" icon={FilePlus2} onClick={onNewQuote} loading={creating}>
              Crear mi primera cotización
              <span className="max-sm:hidden">
                <Kbd combo="c" tone="inverse" />
              </span>
            </Button>
            <Link to="/clientes?nuevo=1" className={buttonClass('ghost', 'lg')}>
              <UserPlus aria-hidden strokeWidth={1.75} />
              Agregar un cliente
            </Link>
          </div>
        </div>
        <div className="relative flex flex-col items-center justify-center gap-4 border-t border-paper-200 bg-paper-50 px-6 py-10 lg:border-t-0 lg:border-l">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(var(--paper-200)_1px,transparent_1px),linear-gradient(90deg,var(--paper-200)_1px,transparent_1px)] bg-[size:24px_24px] opacity-40" />
          <div className="relative">
            <WindowDrawing layout={example.layout} design={example.design} catalog={example.catalog} dimensions="all" width={300} title={example.name} />
          </div>
          <div className="relative flex items-center gap-3 rounded-md border border-paper-200 bg-paper-0 px-4 py-2.5 shadow-float">
            <div>
              <p className="text-[13px] font-medium text-paper-900">{example.name}</p>
              <p className="text-meta text-paper-600">{example.sample ? 'Con precios de ejemplo' : 'Con tu catálogo y tus precios'}</p>
            </div>
            <p className="border-l border-paper-200 pl-3 text-h3 font-semibold text-paper-900 tabular">
              {formatCLP(example.price.unitNet)}
              <span className="ml-1 text-[12px] font-normal text-paper-600">+ IVA</span>
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="home-setup" className="rounded-lg border border-paper-200 bg-paper-0">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-paper-200 px-5 py-3.5">
          <h2 id="home-setup" className="font-semibold text-paper-900">
            Deja tu taller a punto <span className="font-normal text-paper-600">· opcional</span>
          </h2>
          {!me.onboarded ? (
            <Link to="/bienvenida" className="inline-flex items-center gap-1 text-[13px] font-medium text-ink-600 hover:text-ink-700">
              Hacerlo en 3 pasos guiados
              <ArrowRight aria-hidden className="size-3.5" />
            </Link>
          ) : null}
        </header>
        <ul className="grid divide-paper-200 sm:grid-cols-3 sm:divide-x max-sm:divide-y">
          {checklist.map((item) => (
            <li key={item.title}>
              <Link to={item.to} className="group flex h-full gap-3 px-5 py-4 transition-colors duration-120 hover:bg-paper-50">
                <span
                  className={cn(
                    'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border',
                    item.done ? 'border-ok-600 bg-ok-600 text-paper-0' : 'border-paper-350 text-transparent',
                  )}
                >
                  <Check aria-hidden strokeWidth={2.5} className="size-3" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-paper-900">{item.title}</span>
                  <span className="block text-[13px] leading-[18px] text-paper-600">{item.text}</span>
                </span>
                <ArrowRight aria-hidden strokeWidth={1.75} className="ml-auto size-4 shrink-0 self-center text-paper-350 transition-transform duration-160 group-hover:translate-x-0.5 group-hover:text-paper-600" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
