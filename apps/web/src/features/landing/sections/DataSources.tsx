import { useT } from '../../../lib/i18n'
import { Container, Lead, Reveal, Section, SectionTitle } from '../components/primitives'
import es from '../i18n/es'

const STATES = ['ready', 'warnings', 'geometry'] as const

/** Procedencia de los datos: los mismos tres estados que muestra Catálogo › Líneas. */
export function DataSources() {
  const t = useT(es)
  return (
    <Section labelledBy="data-title" tone="sunken">
      <Container className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
        <Reveal className="lg:col-span-7">
          <SectionTitle id="data-title">{t('data.title')}</SectionTitle>
          <Lead className="mt-5">{t('data.lead')}</Lead>
        </Reveal>
        <Reveal delay={0.06} className="lg:col-span-4 lg:col-start-9 lg:self-end">
          <dl className="border-t border-divider text-base">
            {STATES.map((state) => (
              <div key={state} className="border-b border-divider py-3">
                <dt className="font-medium text-fg-strong">{t(`data.states.${state}.title`)}</dt>
                <dd className="mt-0.5 text-fg-muted">{t(`data.states.${state}.text`)}</dd>
              </div>
            ))}
          </dl>
        </Reveal>
      </Container>
    </Section>
  )
}
