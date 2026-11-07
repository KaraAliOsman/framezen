import { TRIAL_DAYS } from '@dekopen/shared'
import { Check, Undo2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { useT } from '../../../lib/i18n'
import { Container, EASE_OUT, Lead, Reveal, Section, SectionTitle } from '../components/primitives'
import { SafeMarco } from '../components/SafeMarco'
import { SampleWindow } from '../designer/SampleWindow'
import es from '../i18n/es'
import { formatClp, formatSize } from '../lib/format'
import { findSampleColorId, MARCO_ITEM, priceSampleItem, SAMPLE_ITEMS, type PricedItem } from '../lib/sampleQuote'
import { useSampleText } from '../lib/sampleText'

type Command = 'add' | 'walnut' | 'discount'

const COMMANDS: Command[] = ['add', 'walnut', 'discount']

/** Lo que queda en la cotización tras un comando: recalculado por el motor, no escrito a mano. */
function applied(command: Command | null): { lines: PricedItem[]; discount: number } {
  const colorId = command === 'walnut' ? findSampleColorId(/nogal/i) : undefined
  const items = command === 'add' ? [...SAMPLE_ITEMS, MARCO_ITEM] : SAMPLE_ITEMS
  return { lines: items.map((item) => priceSampleItem(item, colorId)), discount: command === 'discount' ? 5 : 0 }
}

/** Marco en la landing: tres frases reales y la cotización que cambia debajo, con deshacer. */
export function Assistant() {
  const t = useT(es)
  const text = useSampleText()
  const [command, setCommand] = useState<Command | null>(null)
  const { lines, discount } = useMemo(() => applied(command), [command])
  const subtotal = lines.reduce((sum, line) => sum + line.price, 0)
  const net = Math.round(subtotal * (1 - discount / 100))

  return (
    <Section id="asistente" labelledBy="assistant-title">
      <Container className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-12">
        <Reveal className="lg:col-span-5">
          <SectionTitle id="assistant-title">{t('assistant.title')}</SectionTitle>
          <Lead className="mt-5">{t('assistant.lead')}</Lead>
          <p className="mt-5 max-w-[56ch] text-base text-fg-muted">{t('assistant.plans', { days: TRIAL_DAYS })}</p>
        </Reveal>

        <Reveal delay={0.06} className="min-w-0 lg:col-span-6 lg:col-start-7">
          <div role="group" aria-label={t('assistant.demo')} className="min-h-[360px]">
            <div className="flex flex-col gap-1 border-b border-divider pb-4">
              <p className="text-table text-fg-muted">{t('assistant.try')}</p>
              <div className="-ml-2 flex flex-col items-start">
                {COMMANDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={command === id}
                    onClick={() => setCommand(id)}
                    className="rounded-control px-2 py-1.5 text-left text-lead text-fg-strong transition-colors duration-100 hover:bg-hover aria-pressed:bg-accent-subtle"
                  >
                    {t(`assistant.commands.${id}.phrase`)}
                  </button>
                ))}
              </div>
            </div>

            <div aria-live="polite" className="flex min-h-[72px] items-start gap-3 py-4">
              <SafeMarco state={command ? 'done' : 'idle'} size={28} title="Marco" />
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={command ?? 'idle'}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16, ease: EASE_OUT }}
                  className="min-w-0 flex-1 text-base text-fg"
                >
                  <p>{command ? t(`assistant.commands.${command}.reply`, { size: formatSize(MARCO_ITEM.width, MARCO_ITEM.height) }) : t('assistant.hello')}</p>
                  {command ? (
                    <p className="mt-1 flex items-center gap-2 text-table text-fg-muted">
                      <Check aria-hidden strokeWidth={2.25} className="size-3.5 text-success" />
                      {t('assistant.saved')}
                      <button type="button" onClick={() => setCommand(null)} className="inline-flex items-center gap-1 rounded-xs font-medium text-fg-strong hover:underline">
                        <Undo2 aria-hidden strokeWidth={2} className="size-3.5" />
                        {t('assistant.undo')}
                      </button>
                    </p>
                  ) : null}
                </motion.div>
              </AnimatePresence>
            </div>

            <ul aria-label={t('assistant.items')} className="border-t border-divider">
              {lines.map((line) => (
                <li key={line.item.ref} className="flex h-14 items-center gap-3 border-b border-divider">
                  <span className="grid size-10 shrink-0 place-items-center">
                    <SampleWindow example={line.example} typology={line.item.typology} boxWidth={40} boxHeight={40} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base text-fg-strong">
                      <span className="tabular">{line.item.ref}</span> · {text.item(line.item)}
                    </span>
                    <span className="block truncate text-table text-fg-muted">
                      {text.room(line.item)} · {formatSize(line.item.width, line.item.height)}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-base text-fg">{formatClp(line.price)}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between gap-4 pt-3">
              <span className="text-table text-fg-muted">{discount ? t('assistant.netDiscount', { pct: `${discount} %` }) : t('assistant.net')}</span>
              <span className="tabular font-display text-h2 font-medium text-fg-strong" data-testid="assistant-net">
                {formatClp(net)}
              </span>
            </div>
          </div>
        </Reveal>
      </Container>
    </Section>
  )
}
