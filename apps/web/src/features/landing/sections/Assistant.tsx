import { clsx } from 'clsx'
import { Check, Undo2 } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { MarcoAvatar } from '../../assistant/avatar/MarcoAvatar'
import { EASE_IN, EASE_OUT, Kicker, Lead, Reveal, Section, SectionTitle } from '../components/primitives'
import { AnimatedNumber } from '../designer/AnimatedNumber'
import { formatClp, formatSize } from '../lib/format'
import { findSampleColorId, MARCO_ITEM, priceSampleItem, SAMPLE_ITEMS } from '../lib/sampleQuote'

type MarcoState = 'idle' | 'listening' | 'thinking' | 'working' | 'done'
type CommandId = 'add' | 'walnut' | 'discount'

interface Command {
  id: CommandId
  phrase: string
  reply: string
}

const COMMANDS: Command[] = [
  {
    id: 'add',
    phrase: 'agrega una corredera de 1500 x 1200 blanca',
    reply: `Listo. Agregué la V4: corredera 2 hojas de ${formatSize(MARCO_ITEM.width, MARCO_ITEM.height)}, blanca.`,
  },
  {
    id: 'walnut',
    phrase: 'cambia todo a nogal',
    reply: 'Hecho. Todas las ventanas quedaron en nogal y recalculé los precios.',
  },
  {
    id: 'discount',
    phrase: 'descuento 5 %',
    reply: 'Apliqué un 5 % de descuento sobre el neto. El total ya está al día.',
  },
]

/** Ritmo de la demostración: escuchar → pensar → trabajar → listo. */
const TIMELINE: { state: MarcoState; ms: number }[] = [
  { state: 'listening', ms: 250 },
  { state: 'thinking', ms: 650 },
  { state: 'working', ms: 450 },
  { state: 'done', ms: 1600 },
]

export function Assistant() {
  const reduce = useReducedMotion()
  const [applied, setApplied] = useState<Record<CommandId, boolean>>({ add: false, walnut: false, discount: false })
  const [last, setLast] = useState<{ command: Command; undone: boolean } | null>(null)
  const [marco, setMarco] = useState<MarcoState>('idle')
  const [pending, setPending] = useState<Command | null>(null)
  const busy = pending !== null
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), [])

  const walnutId = useMemo(() => findSampleColorId(/nogal/i), [])
  const rows = useMemo(() => {
    const colorId = applied.walnut ? walnutId : undefined
    const items = applied.add ? [...SAMPLE_ITEMS, MARCO_ITEM] : SAMPLE_ITEMS
    return items.map((item) => priceSampleItem(item, colorId))
  }, [applied.add, applied.walnut, walnutId])

  const subtotal = rows.reduce((sum, row) => sum + row.price, 0)
  const discount = applied.discount ? Math.round(subtotal * 0.05) : 0
  const net = subtotal - discount

  function run(command: Command) {
    if (busy) return
    timers.current.forEach((timer) => window.clearTimeout(timer))
    timers.current = []
    setPending(command)
    setLast(null)

    const steps = reduce ? TIMELINE.map((step) => ({ ...step, ms: Math.min(step.ms, 200) })) : TIMELINE
    let elapsed = 0
    steps.forEach((step, index) => {
      timers.current.push(
        window.setTimeout(() => {
          setMarco(step.state)
          if (step.state === 'done') {
            setApplied((current) => ({ ...current, [command.id]: true }))
            setLast({ command, undone: false })
            setPending(null)
          }
          if (index === steps.length - 1) {
            timers.current.push(window.setTimeout(() => setMarco('idle'), step.ms))
          }
        }, elapsed),
      )
      elapsed += step.ms
    })
  }

  function undo() {
    if (!last) return
    setApplied((current) => ({ ...current, [last.command.id]: false }))
    setLast({ ...last, undone: true })
  }

  return (
    <Section id="marco" labelledBy="marco-title" className="border-t border-paper-200">
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <Kicker index="04">Marco, tu asistente</Kicker>
          <SectionTitle id="marco-title">Cotiza conversando, sin soltar el teléfono.</SectionTitle>
          <Lead>
            Escríbele a Marco como le hablarías a tu ayudante. Él hace el cambio en tu cotización y tú lo ves pasar. Si
            no te gusta, lo deshaces.
          </Lead>
          <ul className="mt-8 grid gap-4">
            <li className="border-l-2 border-paper-200 pl-4">
              <p className="text-[15px] font-semibold text-paper-900">Lo de todos los días, en todos los planes</p>
              <p className="mt-1 text-[14px] leading-[22px] text-paper-600">
                Agregar ventanas, duplicar, cambiar color o vidrio a varias y aplicar descuentos funciona sin IA.
              </p>
            </li>
            <li className="border-l-2 border-ink-600 pl-4">
              <p className="text-[15px] font-semibold text-paper-900">Con IA desde el plan Pro</p>
              <p className="mt-1 text-[14px] leading-[22px] text-paper-600">
                Arma una cotización completa desde un mensaje, una foto o una lista de medidas, y te explica de dónde
                sale cada precio.
              </p>
            </li>
          </ul>
        </div>

        <Reveal className="lg:col-span-7">
          <div className="overflow-hidden rounded-lg border border-paper-200 bg-paper-0 shadow-float">
            {/* Conversación */}
            <div className="flex gap-4 border-b border-paper-200 p-4 sm:p-6">
              <div className="shrink-0">
                <MarcoAvatar state={marco} size={56} title="Marco" />
              </div>
              <div className="min-h-[112px] min-w-0 flex-1" aria-live="polite">
                <AnimatePresence mode="wait" initial={false}>
                  {busy || last ? (
                    <motion.div
                      key={last ? `${last.command.id}-${last.undone}` : 'busy'}
                      initial={{ opacity: 0, y: reduce ? 0 : 4 }}
                      animate={{ opacity: 1, y: 0, transition: { duration: 0.16, ease: EASE_OUT } }}
                      exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_IN } }}
                      className="grid gap-2"
                    >
                      <p className="justify-self-end rounded-md rounded-br-xs bg-paper-100 px-3 py-2 text-[14px] text-paper-900">
                        {(last?.command ?? pending)?.phrase}
                      </p>
                      {last ? (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <p className="text-[14px] leading-[22px] text-paper-900">
                            {last.undone ? 'Deshecho. Todo quedó como estaba.' : last.command.reply}
                          </p>
                          {!last.undone ? (
                            <button
                              type="button"
                              onClick={undo}
                              className="inline-flex h-7 items-center gap-1 rounded-sm px-2 text-[13px] font-medium text-ink-600 hover:bg-ink-50"
                            >
                              <Undo2 aria-hidden className="size-3.5" strokeWidth={1.75} />
                              Deshacer
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-[14px] text-paper-600">{marco === 'working' ? 'Haciendo el cambio…' : 'Pensando…'}</p>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="intro"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, transition: { duration: 0.16 } }}
                      exit={{ opacity: 0, transition: { duration: 0.12 } }}
                    >
                      <p className="text-[15px] font-semibold text-paper-900">Hola, soy Marco.</p>
                      <p className="mt-1 text-[14px] leading-[22px] text-paper-600">
                        Toca una frase y mira cómo cambia la cotización de abajo.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Frases */}
            <div className="flex flex-wrap gap-2 border-b border-paper-200 bg-paper-50 px-4 py-3 sm:px-6">
              {COMMANDS.map((command) => {
                const done = applied[command.id]
                return (
                  <button
                    key={command.id}
                    type="button"
                    disabled={busy || done}
                    onClick={() => run(command)}
                    className={clsx(
                      'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-[background-color,border-color,color,transform] duration-[120ms] active:scale-[0.98]',
                      done
                        ? 'border-transparent bg-ok-50 text-ok-800'
                        : 'border-paper-200 bg-paper-0 text-paper-900 hover:border-paper-350 disabled:opacity-60',
                    )}
                  >
                    {done ? <Check aria-hidden className="size-3.5" strokeWidth={2} /> : null}«{command.phrase}»
                  </button>
                )
              })}
            </div>

            {/* Cotización que cambia */}
            <div className="p-4 sm:p-6">
              <div className="flex items-baseline justify-between">
                <p className="text-[13px] font-semibold text-paper-900">Cotización N° 412 · Familia Rojas</p>
                <p className="text-[12px] text-paper-600">Guardado</p>
              </div>
              <ul className="mt-3 divide-y divide-paper-200 border-y border-paper-200">
                <AnimatePresence initial={false}>
                  {rows.map((row) => (
                    <motion.li
                      key={row.item.ref}
                      layout={reduce ? false : 'position'}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, transition: { duration: 0.16, ease: EASE_OUT } }}
                      exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_IN } }}
                      className="relative flex items-center gap-3 py-2.5 text-[13px]"
                    >
                      {/* Destello de fila nueva (solo opacidad). */}
                      <motion.span
                        aria-hidden
                        className="pointer-events-none absolute -inset-x-2 inset-y-0 rounded-xs bg-ink-50"
                        initial={{ opacity: 1 }}
                        animate={{ opacity: 0, transition: { duration: 0.6, ease: 'linear' } }}
                      />
                      <span className="tabular w-6 font-medium text-paper-600">{row.item.ref}</span>
                      <span
                        aria-hidden
                        className="size-3.5 shrink-0 rounded-full border border-black/15 transition-colors duration-[200ms]"
                        style={{ backgroundColor: row.colorHex }}
                      />
                      <span className="min-w-0 flex-1 truncate text-paper-900">
                        {row.item.title}
                        <span className="tabular text-paper-600"> · {formatSize(row.item.width, row.item.height)}</span>
                        <span className="text-paper-600"> · {row.colorName}</span>
                      </span>
                      <span className="tabular font-medium text-paper-900">
                        <AnimatedNumber value={row.price} format={formatClp} />
                      </span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              <dl className="mt-3 grid gap-1 text-[13px]">
                {applied.discount ? (
                  <div className="flex justify-between text-paper-600">
                    <dt>Descuento 5 %</dt>
                    <dd className="tabular">−{formatClp(discount)}</dd>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between">
                  <dt className="text-paper-600">Neto</dt>
                  <dd className="text-[18px] font-semibold text-paper-900">
                    <AnimatedNumber value={net} format={formatClp} />
                    <span className="ml-1 text-[12px] font-normal text-paper-600">+ IVA</span>
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  )
}

