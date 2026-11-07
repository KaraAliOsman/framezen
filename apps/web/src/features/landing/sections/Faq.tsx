import { TRIAL_CREDITS, TRIAL_DAYS } from '@dekopen/shared'
import { ChevronDown } from 'lucide-react'
import { Accordion } from 'radix-ui'
import { useT } from '../../../lib/i18n'
import { Container, Reveal, Section, SectionTitle } from '../components/primitives'
import es from '../i18n/es'
import { formatInt } from '../lib/format'

/** Preguntas en orden de lectura (claves de `faq.items`). */
export const FAQ_KEYS = ['card', 'trialEnd', 'few', 'brands', 'prices', 'versions', 'devices', 'languages', 'payments', 'billing'] as const

export function Faq() {
  const t = useT(es)
  const params = { days: TRIAL_DAYS, credits: formatInt(TRIAL_CREDITS) }
  return (
    <Section id="preguntas" labelledBy="faq-title" tone="sunken">
      <Container className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
        <Reveal className="lg:col-span-4">
          <SectionTitle id="faq-title">{t('faq.title')}</SectionTitle>
        </Reveal>
        <Accordion.Root type="single" collapsible className="lg:col-span-7 lg:col-start-6">
          {FAQ_KEYS.map((key) => (
            <Accordion.Item key={key} value={`faq-${key}`} className="border-b border-divider">
              <Accordion.Header>
                <Accordion.Trigger className="group flex min-h-14 w-full items-center justify-between gap-6 py-3 text-left text-lead text-fg-strong">
                  {t(`faq.items.${key}.q`)}
                  <ChevronDown aria-hidden strokeWidth={1.75} className="size-4 shrink-0 text-fg-muted transition-transform duration-140 ease-out group-data-[state=open]:rotate-180" />
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content>
                <p className="max-w-[62ch] pb-5 text-base text-pretty text-fg-muted">{t(`faq.items.${key}.a`, params)}</p>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </Container>
    </Section>
  )
}
