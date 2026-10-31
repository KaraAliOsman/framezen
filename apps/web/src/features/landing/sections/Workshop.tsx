import { clsx } from 'clsx'
import { ClipboardCheck, FileText, Layers, QrCode, Scissors, SquareDashed } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { RadioGroup } from 'radix-ui'
import { useState, type ReactNode } from 'react'
import { EASE_IN, EASE_OUT, Kicker, Lead, Reveal, Section, SectionTitle } from '../components/primitives'
import { AnimatedNumber } from '../designer/AnimatedNumber'
import {
  BAR_LENGTH,
  DEMO_GROUPS,
  DEMO_WINDOWS,
  demoStats,
  layoutBar,
  type DemoMode,
  type DemoRef,
} from '../lib/cutDemo'
import { formatDecimal, formatInt, formatMm, formatPct } from '../lib/format'
import { REF_TONE } from '../lib/tones'

const MODES: { id: DemoMode; label: string }[] = [
  { id: 'perWindow', label: 'Ventana por ventana' },
  { id: 'optimized', label: 'Optimizado' },
]

const WORKSHOP_DOCS = [
  { icon: FileText, label: 'Orden de trabajo por ventana' },
  { icon: Scissors, label: 'Optimización de cortes' },
  { icon: SquareDashed, label: 'Pedido de vidrios' },
  { icon: Layers, label: 'Materiales y herrajes' },
  { icon: ClipboardCheck, label: 'Checklist de montaje' },
  { icon: QrCode, label: 'Etiquetas con QR' },
]

export function Workshop() {
  const reduce = useReducedMotion()
  const [mode, setMode] = useState<DemoMode>('optimized')
  const stats = demoStats(mode)
  const baseline = demoStats('perWindow')

  return (
    <Section id="taller" labelledBy="workshop-title" className="border-t border-paper-200">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Kicker index="03">Taller</Kicker>
          <SectionTitle id="workshop-title">Un taller sin errores de corte.</SectionTitle>
          <Lead>
            Cada pieza sale con su medida, su ventana y su lado. Framezen agrupa los cortes por perfil y color, los
            acomoda en barras de {formatInt(BAR_LENGTH)} mm y descuenta el disco de la sierra. Lo que era una tarde con
            calculadora ahora es una hoja impresa.
          </Lead>
          <ul className="mt-8 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {WORKSHOP_DOCS.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-2.5 text-[15px] text-paper-900">
                <Icon aria-hidden strokeWidth={1.75} className="size-[18px] shrink-0 text-paper-600" />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <Reveal className="lg:col-span-7">
          <div className="rounded-lg border border-paper-200 bg-paper-0 p-4 shadow-float sm:p-6">
            <svg aria-hidden width="0" height="0" className="absolute">
              <defs>
                <pattern id="landing-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="6" stroke="var(--paper-200)" strokeWidth="1.5" />
                </pattern>
              </defs>
            </svg>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[15px] font-semibold text-paper-900">Optimización de cortes · OT N° 38</p>
                <p className="mt-0.5 text-[13px] text-paper-600">3 ventanas · perfiles blancos · disco de 4 mm</p>
              </div>
              <RadioGroup.Root
                value={mode}
                onValueChange={(value) => setMode(value as DemoMode)}
                aria-label="Forma de cortar"
                orientation="horizontal"
                loop
                className="flex rounded-sm border border-paper-200 bg-paper-100 p-0.5"
              >
                {MODES.map((item) => (
                  <RadioGroup.Item
                    key={item.id}
                    value={item.id}
                    className={clsx(
                      'relative h-8 rounded-[5px] px-3 text-[13px] font-medium transition-colors duration-[120ms]',
                      item.id === mode ? 'text-paper-900' : 'text-paper-600 hover:text-paper-900',
                    )}
                  >
                    {item.id === mode ? (
                      <motion.span
                        layoutId="workshop-mode-indicator"
                        aria-hidden
                        className="absolute inset-0 rounded-[5px] border border-paper-200 bg-paper-0 shadow-[0_1px_2px_rgb(31_28_24/0.06)]"
                        transition={reduce ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT }}
                      />
                    ) : null}
                    <span className="relative">{item.label}</span>
                  </RadioGroup.Item>
                ))}
              </RadioGroup.Root>
            </div>

            <dl className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-paper-200 bg-paper-200">
              <Stat label="Barras">
                <AnimatedNumber value={stats.bars} format={formatInt} />
                {mode === 'optimized' && baseline.bars > stats.bars ? (
                  <span className="ml-2 rounded-full bg-ok-50 px-1.5 py-0.5 text-[12px] leading-4 font-medium text-ok-800">
                    −{formatInt(baseline.bars - stats.bars)}
                  </span>
                ) : null}
              </Stat>
              <Stat label="Aprovechamiento">
                <AnimatedNumber value={stats.yieldPct} format={(value) => formatPct(value)} />
              </Stat>
              <Stat label="Sobrante">
                <AnimatedNumber value={stats.leftoverM} format={(value) => `${formatDecimal(value, 1)} m`} />
              </Stat>
            </dl>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mode}
                initial={{ opacity: 0, y: reduce ? 0 : 4 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE_OUT } }}
                exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_IN } }}
                className="mt-6 grid grid-cols-1 gap-6"
              >
                {DEMO_GROUPS.map((group) => (
                  <div key={group.code}>
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[13px] font-medium text-paper-900">
                        {group.name} <span className="font-mono text-[12px] text-paper-600">{group.code}</span>
                        <span className="text-paper-600"> · {group.color}</span>
                      </p>
                      <p className="tabular text-[12px] text-paper-600">
                        {group.bars[mode].length} {group.bars[mode].length === 1 ? 'barra' : 'barras'}
                      </p>
                    </div>
                    <ol className="mt-2 grid gap-1.5" aria-label={`Barras de ${group.name.toLowerCase()}`}>
                      {group.bars[mode].map((cuts, index) => (
                        <BarRow key={index} cuts={cuts} index={index} />
                      ))}
                    </ol>
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>

            <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-paper-200 pt-4 text-[12px] text-paper-600">
              {(Object.keys(DEMO_WINDOWS) as DemoRef[]).map((ref) => (
                <li key={ref} className="flex items-center gap-1.5">
                  <span aria-hidden className={clsx('size-2 rounded-full', REF_TONE[ref].dot)} />
                  <span className="font-medium text-paper-900">{ref}</span> {DEMO_WINDOWS[ref].name}
                  <span className="tabular">· {DEMO_WINDOWS[ref].size}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-3 text-[12px] leading-4 text-paper-600">
            Medidas de una orden de trabajo real. Cortar ventana por ventana deja retazos en cada barra; juntar las
            piezas de toda la obra los aprovecha.
          </p>
        </Reveal>
      </div>
    </Section>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 bg-paper-0 px-2.5 py-3 sm:px-4">
      <dt className="text-[11px] text-paper-600 sm:text-[12px]">{label}</dt>
      <dd className="mt-1 flex items-baseline text-[20px] leading-7 font-semibold text-paper-900 sm:text-[24px]">
        {children}
      </dd>
    </div>
  )
}

function BarRow({ cuts, index }: { cuts: Parameters<typeof layoutBar>[0]; index: number }) {
  const reduce = useReducedMotion()
  const bar = layoutBar(cuts)
  const pct = (mm: number) => (mm / BAR_LENGTH) * 100
  const summary = cuts.map((cut) => `${formatMm(cut.length)} (${cut.ref} ${cut.side})`).join(', ')

  return (
    <li className="@container" aria-label={`Barra ${index + 1}: ${summary}. Sobran ${formatMm(bar.remainder)} mm.`}>
      <div aria-hidden className="relative flex h-10 items-stretch overflow-hidden rounded-xs border border-paper-200 bg-paper-50">
        {bar.cuts.map((cut, cutIndex) => {
          const width = pct(cut.length)
          return (
            <motion.div
              key={cutIndex}
              className={clsx(
                'flex min-w-0 flex-col items-center justify-center border-r leading-none',
                REF_TONE[cut.ref].piece,
              )}
              style={{ width: `${width}%` }}
              initial={{ opacity: 0, x: reduce ? 0 : -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: reduce ? 0 : index * 0.04 + cutIndex * 0.03, ease: EASE_OUT }}
            >
              <span
                className={clsx(
                  'tabular narrow truncate px-0.5 text-[12px] font-semibold',
                  width < 14 && 'hidden @xl:inline',
                )}
              >
                {formatMm(cut.length)}
              </span>
              <span
                className={clsx(
                  'mt-0.5 hidden truncate px-0.5 text-[10px] opacity-80',
                  width >= 14 ? '@lg:inline' : '@2xl:inline',
                )}
              >
                {cut.ref} · {cut.side}
              </span>
            </motion.div>
          )
        })}
        {bar.remainder > 0 ? (
          <div className="relative flex min-w-0 flex-1 items-center justify-end overflow-hidden text-paper-600">
            <svg className="absolute inset-0 size-full text-paper-200" aria-hidden>
              <rect width="100%" height="100%" fill="url(#landing-hatch)" />
            </svg>
            {pct(bar.remainder) >= 9 ? (
              <span className="tabular narrow relative mr-1.5 rounded-xs bg-paper-50 px-1 text-[11px]">
                {formatMm(bar.remainder)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  )
}
