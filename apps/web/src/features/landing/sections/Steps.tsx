import { clsx } from 'clsx'
import { Check, CornerDownLeft } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { DimensionLine, Kicker, Lead, Reveal, Section, SectionTitle } from '../components/primitives'
import { BAR_LENGTH, DEMO_GROUPS } from '../lib/cutDemo'
import { formatClp, formatInt, formatMm, formatPct } from '../lib/format'
import { priceSampleItem, SAMPLE_ITEMS, totalsWithIva } from '../lib/sampleQuote'
import { REF_TONE } from '../lib/tones'

const OLD_WAY = ['la planilla de Excel', 'la calculadora', 'el cuaderno de cortes', 'las fotos borrosas por WhatsApp']

interface Step {
  number: string
  title: string
  text: string
  points: string[]
  visual: ReactNode
}

const STEPS: Step[] = [
  {
    number: '1',
    title: 'Diseña',
    text: 'Elige la tipología, escribe ancho × alto y presiona Enter. La ventana aparece a escala, con cotas, aperturas y su color.',
    points: ['Más de 25 tipologías', 'Travesaños con imán de 10 mm', 'Vista interior y exterior'],
    visual: <DesignVisual />,
  },
  {
    number: '2',
    title: 'Cotiza',
    text: 'El precio sale de tus perfiles, vidrios, herrajes y margen, en vivo. Mandas la cotización por WhatsApp o correo y tu cliente la acepta en línea.',
    points: ['Precio en vivo con cada cambio', 'Cuatro diseños de documento', 'Versión B automática si cambias algo'],
    visual: <QuoteVisual />,
  },
  {
    number: '3',
    title: 'Fabrica',
    text: 'Con «Pasar a taller» nace la orden de trabajo: cortes optimizados por barra, pedido de vidrios, materiales y checklist de montaje.',
    points: ['Cortes con medida, ventana y lado', 'Pedido de vidrios listo para enviar', 'Etiquetas con código QR'],
    visual: <BarsVisual />,
  },
]

export function Steps() {
  return (
    <Section id="como-funciona" labelledBy="steps-title" className="border-t border-paper-200">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Kicker index="01">Cómo funciona</Kicker>
          <SectionTitle id="steps-title">De la medida en obra a la ventana instalada.</SectionTitle>
        </div>
        <div className="lg:col-span-5 lg:pt-10">
          <Lead className="mt-0">
            Hoy la medida llega por WhatsApp, el precio sale de una planilla que solo tú entiendes y los cortes se
            anotan a mano. Un número mal copiado es una hoja que no cierra y un perfil a la basura.
          </Lead>
          <p className="mt-5 text-[15px] leading-6 text-paper-600">
            Con Framezen dejas atrás{' '}
            {OLD_WAY.map((item, index) => (
              <span key={item}>
                <s className="decoration-paper-350 decoration-1">{item}</s>
                {index < OLD_WAY.length - 2 ? ', ' : index === OLD_WAY.length - 2 ? ' y ' : '.'}
              </span>
            ))}
          </p>
        </div>
      </div>

      {/* Cotas entre los centros de los pasos: el tiempo que toma cada tramo. */}
      <div aria-hidden className="relative mt-16 hidden h-4 md:block">
        <DimensionLine label="menos de 3 minutos" className="absolute top-0 left-[16.6%] w-[33.4%]" />
        <DimensionLine label="un clic" className="absolute top-0 left-[calc(50%-10px)] w-[calc(33.4%+10px)]" />
      </div>

      <ol className="mt-8 grid grid-cols-1 gap-6 md:mt-6 md:grid-cols-3 md:gap-8">
        {STEPS.map((step, index) => (
          <Reveal as="li" key={step.number} delay={index * 0.06} className="flex flex-col">
            <div className="flex h-52 items-center justify-center overflow-hidden rounded-lg border border-paper-200 bg-paper-0">
              {step.visual}
            </div>
            <div className="mt-6 flex items-baseline gap-3">
              <span className="tabular text-[15px] font-semibold text-ink-600">{step.number}</span>
              <h3 className="text-[24px] leading-8 font-semibold tracking-[-0.01em] text-paper-900">{step.title}</h3>
            </div>
            <p className="mt-3 text-[15px] leading-6 text-pretty text-paper-600">{step.text}</p>
            <ul className="mt-4 grid gap-1.5 text-[14px] text-paper-900">
              {step.points.map((point) => (
                <li key={point} className="flex items-start gap-2">
                  <Check aria-hidden strokeWidth={1.75} className="mt-0.5 size-4 shrink-0 text-ink-600" />
                  {point}
                </li>
              ))}
            </ul>
          </Reveal>
        ))}
      </ol>
    </Section>
  )
}

/** Paso 1: corredera dibujada con cotas y la tecla Enter. */
function DesignVisual() {
  return (
    <div className="flex items-center gap-5">
      <svg aria-hidden width="150" height="128" viewBox="0 0 150 128" fill="none">
        {/* cotas */}
        <g stroke="var(--ink-700)" strokeWidth="1">
          <line x1="10" y1="10" x2="120" y2="10" />
          <line x1="10" y1="6" x2="10" y2="14" strokeOpacity="0.6" />
          <line x1="120" y1="6" x2="120" y2="14" strokeOpacity="0.6" />
          <line x1="7" y1="13" x2="13" y2="7" />
          <line x1="117" y1="13" x2="123" y2="7" />
          <line x1="134" y1="22" x2="134" y2="110" />
          <line x1="130" y1="22" x2="138" y2="22" strokeOpacity="0.6" />
          <line x1="130" y1="110" x2="138" y2="110" strokeOpacity="0.6" />
          <line x1="131" y1="25" x2="137" y2="19" />
          <line x1="131" y1="113" x2="137" y2="107" />
        </g>
        <rect x="10" y="22" width="110" height="88" rx="1.5" fill="#F6F5F1" stroke="#B9B2A6" />
        <rect x="16" y="28" width="52" height="76" fill="#F6F5F1" stroke="#B9B2A6" />
        <rect x="62" y="28" width="52" height="76" fill="#F6F5F1" stroke="#B9B2A6" />
        <rect x="21" y="33" width="42" height="66" fill="#D9EBEE" fillOpacity="0.7" stroke="#B9B2A6" strokeWidth="0.75" />
        <rect x="67" y="33" width="42" height="66" fill="#D9EBEE" fillOpacity="0.7" stroke="#B9B2A6" strokeWidth="0.75" />
        <g stroke="var(--paper-900)" strokeOpacity="0.7" strokeWidth="1">
          <line x1="30" y1="66" x2="52" y2="66" />
          <polyline points="48,62.5 52,66 48,69.5" />
          <line x1="98" y1="66" x2="76" y2="66" />
          <polyline points="80,62.5 76,66 80,69.5" />
        </g>
      </svg>
      <div className="flex flex-col gap-2 text-[13px]">
        <span className="tabular rounded-sm border border-paper-350 bg-paper-0 px-2 py-1 font-medium text-paper-900">
          1.500
        </span>
        <span className="tabular rounded-sm border border-paper-350 bg-paper-0 px-2 py-1 font-medium text-paper-900">
          1.200
        </span>
        <span className="inline-flex items-center gap-1 self-start rounded-xs border border-paper-200 bg-paper-100 px-1.5 py-0.5 font-mono text-[11px] text-paper-600">
          <CornerDownLeft aria-hidden className="size-3" strokeWidth={1.75} />
          Enter
        </span>
      </div>
    </div>
  )
}

/** Paso 2: cotización resumida con estado «Aceptada». */
function QuoteVisual() {
  const rows = useMemo(() => SAMPLE_ITEMS.map((item) => priceSampleItem(item)), [])
  const { total } = totalsWithIva(rows.reduce((sum, row) => sum + row.price, 0))
  return (
    <div className="w-[248px] rounded-md border border-paper-200 bg-paper-0 p-3 shadow-float">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-paper-900">Cotización N° 412</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-ok-50 px-2 py-0.5 text-[11px] font-medium text-ok-800">
          <Check aria-hidden className="size-3" strokeWidth={2} />
          Aceptada
        </span>
      </div>
      <ul className="mt-2 divide-y divide-paper-200">
        {rows.map(({ item, price }) => (
          <li key={item.ref} className="flex items-center gap-2 py-1.5 text-[11px]">
            <span className="tabular w-5 font-medium text-paper-600">{item.ref}</span>
            <span className="min-w-0 flex-1 truncate text-paper-900">
              {item.title}{' '}
              <span className="tabular text-paper-600">
                · {formatMm(item.width)} × {formatMm(item.height)}
              </span>
            </span>
            <span className="tabular font-medium text-paper-900">{formatClp(price)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex items-center justify-between border-t border-paper-900 pt-1.5 text-[12px]">
        <span className="font-medium text-paper-600">Total con IVA</span>
        <span className="tabular font-semibold text-paper-900">{formatClp(total)}</span>
      </div>
    </div>
  )
}

/** Paso 3: tres barras optimizadas. */
function BarsVisual() {
  const group = DEMO_GROUPS[0]
  const bars = group.bars.optimized
  const used = bars.flat().reduce((sum, cut) => sum + cut.length, 0)
  const yieldPct = (used / (bars.length * BAR_LENGTH)) * 100
  return (
    <div className="w-[248px]">
      <div className="flex items-center justify-between text-[11px] text-paper-600">
        <span>
          {group.name} · {group.color}
        </span>
        <span className="tabular font-medium text-ok-600">{formatPct(yieldPct)} aprovechado</span>
      </div>
      <div className="mt-2 grid gap-1.5">
        {bars.map((cuts, barIndex) => (
          <div key={barIndex} className="flex h-6 gap-px overflow-hidden rounded-xs bg-paper-100">
            {cuts.map((cut, index) => (
              <span
                key={index}
                className={clsx('h-full border-r first:rounded-l-xs', REF_TONE[cut.ref].piece)}
                style={{ width: `${(cut.length / BAR_LENGTH) * 100}%` }}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-paper-600">
        <span className="tabular">{bars.length}</span> barras de <span className="tabular">{formatInt(BAR_LENGTH)}</span> mm ·
        corte de sierra incluido
      </p>
    </div>
  )
}
