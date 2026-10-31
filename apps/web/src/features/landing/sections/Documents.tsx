import { clsx } from 'clsx'
import { Check } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Kicker, Lead, Reveal, Section, SectionTitle } from '../components/primitives'
import { SampleWindow } from '../designer/SampleWindow'
import { BAR_LENGTH, DEMO_GROUPS, layoutBar } from '../lib/cutDemo'
import { formatClp, formatInt, formatMm, formatSize } from '../lib/format'
import { priceSampleItem, SAMPLE_ITEMS, totalsWithIva } from '../lib/sampleQuote'
import { REF_TONE } from '../lib/tones'

const CALLOUTS = [
  { title: 'El dibujo de cada ventana', text: 'A escala, con aperturas y color. Tu cliente entiende lo que compra sin que se lo expliques.' },
  { title: 'Totales sin letra chica', text: 'Neto, IVA y total en una caja limpia. Precio por ventana o solo el total, como prefieras.' },
  { title: 'Aceptación en línea', text: 'Tu cliente la abre desde el teléfono, la acepta con su nombre y a ti te llega el aviso.' },
  { title: 'Cortes legibles a un metro', text: 'En la hoja de taller la medida va grande, con la ventana y el lado debajo. Casillas para marcar.' },
]

export function Documents() {
  return (
    <Section id="documentos" labelledBy="documents-title" className="border-t border-paper-200 bg-paper-100/60">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Kicker index="02">Documentos</Kicker>
          <SectionTitle id="documents-title">Documentos que venden por ti.</SectionTitle>
        </div>
        <div className="lg:col-span-5 lg:pt-10">
          <Lead className="mt-0">
            Tu cotización llega con el dibujo de cada ventana, medidas claras y totales sin vueltas. Cuatro diseños
            (Esencial, Galería, Compacta y Editorial) con tu logo, tus colores y tus condiciones.
          </Lead>
        </div>
      </div>

      <div className="mt-14 grid grid-cols-1 items-start gap-6 lg:grid-cols-12 lg:gap-8">
        <Reveal className="lg:col-span-7">
          <QuoteSheet />
        </Reveal>
        <Reveal delay={0.08} className="lg:col-span-5 lg:mt-16">
          <CutSheet />
        </Reveal>
      </div>

      <ol className="mt-14 grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
        {CALLOUTS.map((callout, index) => (
          <Reveal as="li" key={callout.title} delay={index * 0.04}>
            <CalloutNumber>{index + 1}</CalloutNumber>
            <h3 className="mt-3 text-[16px] leading-6 font-semibold text-paper-900">{callout.title}</h3>
            <p className="mt-1.5 text-[14px] leading-[22px] text-pretty text-paper-600">{callout.text}</p>
          </Reveal>
        ))}
      </ol>
    </Section>
  )
}

function CalloutNumber({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'tabular inline-grid size-6 place-items-center rounded-full border border-ink-600 bg-paper-0 text-[12px] font-semibold text-ink-600',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Marca numerada sobre la muestra, enlazada con la lista de abajo. */
function Pin({ n, className }: { n: number; className: string }) {
  return (
    <span aria-hidden className={clsx('absolute z-10', className)}>
      <CalloutNumber className="shadow-float">{n}</CalloutNumber>
    </span>
  )
}

function QuoteSheet() {
  const lines = useMemo(() => SAMPLE_ITEMS.map((item) => priceSampleItem(item)), [])
  const { net, iva, total } = totalsWithIva(lines.reduce((sum, line) => sum + line.price, 0))

  return (
    <figure className="relative">
      <div className="rounded-md border border-paper-200 bg-paper-0 p-5 shadow-pop sm:p-8">
        {/* Encabezado */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-sm bg-[#24433a] text-[14px] font-semibold text-white">
              VS
            </span>
            <div>
              <p className="text-[14px] font-semibold text-paper-900">Ventanas del Sur</p>
              <p className="text-[11px] text-paper-600">Puerto Varas · Los Lagos</p>
            </div>
          </div>
          <div className="sm:text-right">
            <p className="text-[15px] font-semibold text-paper-900">Cotización N° 412</p>
            <p className="tabular text-[11px] text-paper-600">31 de octubre de 2026 · válida 15 días</p>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 border-y border-paper-200 py-3 text-[12px]">
          <div>
            <p className="text-paper-600">Para</p>
            <p className="font-medium text-paper-900">Familia Rojas</p>
          </div>
          <div>
            <p className="text-paper-600">Obra</p>
            <p className="font-medium text-paper-900">Casa en Frutillar</p>
          </div>
        </div>

        {/* Ítems */}
        <div className="relative">
          <Pin n={1} className="top-6 -left-8 hidden sm:block" />
          <ul className="divide-y divide-paper-200">
          {lines.map(({ item: row, example, price, colorName, glassName }) => (
            <li key={row.ref} className="flex items-center gap-3 py-4 sm:gap-4">
              <div className="grid size-[76px] shrink-0 place-items-center rounded-sm bg-paper-50 sm:size-24">
                <SampleWindow example={example} typology={row.typology} boxWidth={68} boxHeight={68} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-paper-600">
                  {row.ref} · {row.room}
                </p>
                <p className="text-[14px] font-semibold text-paper-900">{row.title}</p>
                <p className="tabular mt-0.5 truncate text-[12px] text-paper-600">
                  {formatSize(row.width, row.height)} · {colorName} · {glassName}
                </p>
              </div>
              <p className="tabular shrink-0 text-[14px] font-semibold text-paper-900">{formatClp(price)}</p>
            </li>
          ))}
          </ul>
        </div>

        {/* Totales */}
        <div className="relative mt-2 ml-auto w-full max-w-[260px] rounded-sm border border-paper-200 p-3 text-[12px]">
          <Pin n={2} className="top-1/2 -left-10 -translate-y-1/2" />
          <dl className="grid gap-1">
            <div className="flex justify-between">
              <dt className="text-paper-600">Neto</dt>
              <dd className="tabular text-paper-900">{formatClp(net)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-paper-600">IVA 19 %</dt>
              <dd className="tabular text-paper-900">{formatClp(iva)}</dd>
            </div>
            <div className="mt-1 flex justify-between border-t border-paper-900 pt-1.5 text-[14px] font-semibold">
              <dt className="text-paper-900">Total</dt>
              <dd className="tabular text-paper-900">{formatClp(total)}</dd>
            </div>
          </dl>
        </div>

        {/* Aceptación */}
        <div className="relative mt-6 flex flex-wrap items-center justify-between gap-3 rounded-sm bg-paper-50 px-3 py-3">
          <Pin n={3} className="-top-3 right-4" />
          <p className="text-[12px] text-paper-600">50 % al aceptar · 50 % contra entrega · instalación incluida</p>
          <span className="inline-flex h-8 items-center gap-1.5 rounded-sm bg-[#24433a] px-3 text-[12px] font-medium text-white">
            <Check aria-hidden className="size-3.5" strokeWidth={2} />
            Aceptar cotización
          </span>
        </div>
      </div>
      <figcaption className="mt-3 text-[12px] text-paper-600">
        Diseño Esencial con el logo y el color del taller. Precios calculados con el catálogo de ejemplo.
      </figcaption>
    </figure>
  )
}

function CutSheet() {
  const group = DEMO_GROUPS[0]
  const bars = group.bars.optimized
  // Resumen por medida: cantidad y a qué ventanas/lados corresponde.
  const byLength = new Map<number, { qty: number; refs: string[] }>()
  for (const bar of bars) {
    for (const cut of bar) {
      const entry = byLength.get(cut.length) ?? { qty: 0, refs: [] }
      entry.qty += 1
      entry.refs.push(`${cut.ref} ${cut.side}`)
      byLength.set(cut.length, entry)
    }
  }
  const rows = [...byLength.entries()].sort((a, b) => b[0] - a[0])

  return (
    <figure className="relative">
      <div className="rounded-md border border-paper-200 bg-paper-0 p-5 shadow-pop sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium text-paper-600">OT N° 38 · Casa en Frutillar</p>
            <p className="mt-0.5 text-[15px] font-semibold text-paper-900">Hoja de cortes</p>
          </div>
          <p className="text-right text-[12px] text-paper-600">
            {group.name} <span className="font-mono">{group.code}</span>
            <br />
            {group.color}
          </p>
        </div>

        <table className="relative mt-4 w-full text-left">
          <caption className="sr-only">Cortes de marco por medida</caption>
          <thead>
            <tr className="border-b border-paper-900 text-[11px] text-paper-600">
              <th scope="col" className="w-7 pb-1.5 font-medium">
                <span className="sr-only">Hecho</span>
              </th>
              <th scope="col" className="pb-1.5 font-medium">Medida</th>
              <th scope="col" className="pb-1.5 font-medium">Cant.</th>
              <th scope="col" className="pb-1.5 font-medium">Ventana · lado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([length, entry], index) => (
              <tr key={length} className="border-b border-paper-200 align-top">
                <td className="py-2.5">
                  <span
                    aria-hidden
                    className={clsx(
                      'mt-1 grid size-4 place-items-center rounded-[3px] border',
                      index < 2 ? 'border-ok-600 bg-ok-600 text-white' : 'border-paper-350',
                    )}
                  >
                    {index < 2 ? <Check className="size-3" strokeWidth={2.5} /> : null}
                  </span>
                </td>
                <td className="tabular py-2 text-[24px] leading-7 font-semibold tracking-[-0.01em] text-paper-900">
                  {formatMm(length)}
                </td>
                <td className="tabular py-2.5 text-[14px] font-medium text-paper-900">× {entry.qty}</td>
                <td className="py-2.5 text-[12px] leading-4 text-paper-600">{entry.refs.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pin n={4} className="top-[108px] -right-3" />

        <div className="mt-5 grid gap-1.5" aria-hidden>
          {bars.map((cuts, index) => {
            const bar = layoutBar(cuts)
            return (
              <div key={index} className="flex h-5 overflow-hidden rounded-[3px] border border-paper-200 bg-paper-50">
                {bar.cuts.map((cut, cutIndex) => (
                  <span
                    key={cutIndex}
                    className={clsx('h-full border-r', REF_TONE[cut.ref].piece)}
                    style={{ width: `${(cut.length / BAR_LENGTH) * 100}%` }}
                  />
                ))}
              </div>
            )
          })}
        </div>
        <p className="tabular mt-2 text-[11px] text-paper-600">
          {bars.length} barras de {formatInt(BAR_LENGTH)} mm · ángulo 45° en ambos extremos
        </p>
      </div>
      <figcaption className="mt-3 text-[12px] text-paper-600">Hoja de cortes para imprimir y llevar a la sierra.</figcaption>
    </figure>
  )
}
