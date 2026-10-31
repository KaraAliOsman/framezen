import { PLANS } from '@framezen/shared'
import { clsx } from 'clsx'
import { Check } from 'lucide-react'
import { Kicker, Lead, Reveal, Section, SectionTitle } from '../components/primitives'
import { formatClp } from '../lib/format'

interface Row {
  topic: string
  sheet: string
  legacy: string
  framezen: string
}

const COLUMNS = { sheet: 'Planilla y calculadora', legacy: 'Cotizadores antiguos', framezen: 'Framezen' } as const

const ROWS: Row[] = [
  {
    topic: 'Una cotización nueva',
    sheet: 'Rápida si la planilla está al día. Lenta cuando cambia un precio.',
    legacy: 'Instalar, activar la licencia y aprender el programa.',
    framezen: 'En menos de 3 minutos, desde el navegador.',
  },
  {
    topic: 'Que el precio esté bien',
    sheet: 'Depende de fórmulas que nadie más revisa.',
    legacy: 'Bien, si alguien mantiene el catálogo al día.',
    framezen: 'Sale de tus perfiles, vidrios y herrajes. Si falta un precio, te avisa.',
  },
  {
    topic: 'Lo que ve tu cliente',
    sheet: 'Una tabla de números.',
    legacy: 'Un PDF con dibujos de otra época.',
    framezen: 'Dibujos a escala, cuatro diseños y aceptación en línea.',
  },
  {
    topic: 'Cortes del taller',
    sheet: 'A mano, ventana por ventana.',
    legacy: 'Sí, muchas veces en otro módulo o pagando aparte.',
    framezen: 'Al pasar a taller: cortes optimizados, vidrios y materiales.',
  },
  {
    topic: 'Marcas de perfiles',
    sheet: 'Las que hayas cargado tú.',
    legacy: 'A menudo una sola, o pagas por cada marca.',
    framezen: 'Todas, en todos los planes.',
  },
  {
    topic: 'Desde dónde trabajas',
    sheet: 'El computador donde está el archivo.',
    legacy: 'El PC de la oficina.',
    framezen: 'Computador, tablet o teléfono.',
  },
  {
    topic: 'Lo que cuesta',
    sheet: '$0. Ya la tienes.',
    legacy: 'Licencia y actualizaciones pagadas.',
    framezen: `Desde ${formatClp(PLANS.taller.yearlyMonthly)} + IVA al mes.`,
  },
]

export function Comparison() {
  return (
    <Section id="comparacion" labelledBy="comparison-title" className="border-t border-paper-200 bg-paper-100/60">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Kicker index="05">Comparación honesta</Kicker>
          <SectionTitle id="comparison-title">Lo que cambia frente a tu planilla.</SectionTitle>
        </div>
        <div className="lg:col-span-5 lg:pt-10">
          <Lead className="mt-0">
            Tu planilla te ha servido años y no hay que despreciarla. Esto es lo que gana y lo que pierde frente a
            Framezen, sin adornos.
          </Lead>
        </div>
      </div>

      <Reveal className="mt-14">
        {/* Escritorio y tablet: tabla */}
        <table className="hidden w-full border-separate border-spacing-0 text-left md:table">
          <caption className="sr-only">Comparación entre planilla, cotizadores antiguos y Framezen</caption>
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[26%]" />
            <col className="w-[26%]" />
            <col className="w-[26%]" />
          </colgroup>
          <thead>
            <tr className="align-bottom">
              <td />
              <th scope="col" className="px-5 pb-4 text-[14px] font-medium text-paper-600">
                {COLUMNS.sheet}
              </th>
              <th scope="col" className="px-5 pb-4 text-[14px] font-medium text-paper-600">
                {COLUMNS.legacy}
              </th>
              <th
                scope="col"
                className="rounded-t-lg border-x border-t border-ink-600 bg-paper-0 px-5 pt-4 pb-4 text-[15px] font-semibold text-paper-900"
              >
                {COLUMNS.framezen}
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row, index) => {
              const lastRow = index === ROWS.length - 1
              return (
                <tr key={row.topic} className="align-top">
                  <th scope="row" className="border-t border-paper-200 py-4 pr-4 text-[14px] font-semibold text-paper-900">
                    {row.topic}
                  </th>
                  <td className="border-t border-paper-200 px-5 py-4 text-[14px] leading-[22px] text-paper-600">{row.sheet}</td>
                  <td className="border-t border-paper-200 px-5 py-4 text-[14px] leading-[22px] text-paper-600">{row.legacy}</td>
                  <td
                    className={clsx(
                      'border-x border-t border-x-ink-600 border-t-paper-200 bg-paper-0 px-5 py-4 text-[14px] leading-[22px] text-paper-900',
                      lastRow && 'rounded-b-lg border-b border-b-ink-600',
                    )}
                  >
                    <span className="flex gap-2">
                      <Check aria-hidden strokeWidth={1.75} className="mt-[3px] size-4 shrink-0 text-ink-600" />
                      {row.framezen}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Teléfono: una tarjeta por tema */}
        <ul className="grid gap-3 md:hidden">
          {ROWS.map((row) => (
            <li key={row.topic} className="rounded-lg border border-paper-200 bg-paper-0 p-4">
              <p className="text-[15px] font-semibold text-paper-900">{row.topic}</p>
              <dl className="mt-3 grid gap-2.5 text-[14px] leading-[21px]">
                <div>
                  <dt className="text-[12px] text-paper-600">{COLUMNS.sheet}</dt>
                  <dd className="text-paper-600">{row.sheet}</dd>
                </div>
                <div>
                  <dt className="text-[12px] text-paper-600">{COLUMNS.legacy}</dt>
                  <dd className="text-paper-600">{row.legacy}</dd>
                </div>
                <div className="rounded-sm border-l-2 border-ink-600 bg-ink-50 py-1.5 pr-2 pl-3">
                  <dt className="text-[12px] font-medium text-ink-700">{COLUMNS.framezen}</dt>
                  <dd className="text-paper-900">{row.framezen}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>

        <p className="mt-10 max-w-[62ch] text-[16px] leading-[26px] text-paper-900">
          ¿Haces una o dos ventanas al mes? Probablemente tu planilla te basta. Si cotizas todas las semanas, Framezen se
          paga con la primera obra que no tienes que rehacer.
        </p>
      </Reveal>
    </Section>
  )
}
